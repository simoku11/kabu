import {
  type CSSProperties,
  type FormEvent,
  type ReactNode,
  useEffect,
  useRef,
  useState,
} from "react";

import type {
  CommandAck,
  LobbyCommand,
  LobbySnapshot,
  RoundView,
} from "@kabu/protocol";

import {
  ApiClientError,
  classifySnapshotSequence,
  createCommandId,
  createRoom,
  ensureSession,
  fetchRoom,
  joinRoom,
  getCommandStatus,
  openLobbySocket,
  redactTransientSecrets,
  sendCommand,
  takeOverControl,
  type LobbySocket,
} from "./lobby-client";

type Screen =
  | { kind: "loading" }
  | { kind: "home"; invitedCode?: string }
  | { kind: "lobby"; snapshot: LobbySnapshot }
  | { kind: "fatal"; message: string };

function codeFromLocation(): string | undefined {
  const match = /^\/room\/([A-HJ-NP-Z2-9]{6})\/?$/iu.exec(
    window.location.pathname,
  );
  return match?.[1]?.toUpperCase();
}

export function App() {
  const [screen, setScreen] = useState<Screen>({ kind: "loading" });
  const [name, setName] = useState("");
  const [code, setCode] = useState(codeFromLocation() ?? "");
  const [roundCount, setRoundCount] = useState(10);
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);
  const commandGateRef = useRef(createCommandGate());
  const [actionFeedback, setActionFeedback] = useState<ActionFeedback | null>(
    null,
  );
  const [online, setOnline] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [control, setControl] = useState<
    "active" | "takeover-required" | "revoked"
  >("active");
  const socketRef = useRef<LobbySocket | undefined>(undefined);
  const sequenceRef = useRef(0);
  const unresolvedRef = useRef<{ commandId: string; label: string } | null>(
    null,
  );

  useEffect(() => {
    void (async () => {
      try {
        await ensureSession();
        const invitedCode = codeFromLocation();
        if (!invitedCode) {
          setScreen({ kind: "home" });
          return;
        }
        try {
          const snapshot = await fetchRoom(invitedCode);
          sequenceRef.current = snapshot.room.sequence;
          setScreen({ kind: "lobby", snapshot });
        } catch (error) {
          if (error instanceof ApiClientError && error.status === 403) {
            setScreen({ kind: "home", invitedCode });
            return;
          }
          throw error;
        }
      } catch (error) {
        setScreen({
          kind: "fatal",
          message:
            error instanceof Error
              ? error.message
              : "Die App konnte nicht gestartet werden.",
        });
      }
    })();
  }, []);

  const activeCode = screen.kind === "lobby" ? screen.snapshot.room.code : null;
  useEffect(() => {
    if (!activeCode) return;
    const socket = openLobbySocket();
    socketRef.current = socket;
    socket.on("connect", () => {
      setSyncing(true);
      socket.emit("room:subscribe", { roomCode: activeCode }, (result) => {
        if (result.ok) {
          setOnline(true);
          setSyncing(false);
          setControl(result.control);
          sequenceRef.current = Math.max(
            sequenceRef.current,
            result.snapshot.room.sequence,
          );
          setScreen((current) =>
            current.kind === "lobby" &&
            result.snapshot.room.sequence >= current.snapshot.room.sequence
              ? { kind: "lobby", snapshot: result.snapshot }
              : current,
          );
          const unresolved = unresolvedRef.current;
          if (unresolved) {
            void getCommandStatus(socket, activeCode, unresolved.commandId)
              .then((ack) => {
                if (!ack) {
                  setActionFeedback({
                    kind: "rejected",
                    text: `${unresolved.label}: nicht vom Server empfangen.`,
                  });
                } else if (ack.accepted) {
                  setActionFeedback({
                    kind: "confirmed",
                    text: `${unresolved.label} war bereits bestätigt.`,
                  });
                } else {
                  setActionFeedback({
                    kind: "rejected",
                    text:
                      ack.error?.message ??
                      `${unresolved.label} wurde abgelehnt.`,
                  });
                }
                unresolvedRef.current = null;
              })
              .catch(() => undefined);
          }
        } else {
          setSyncing(false);
          setMessage(result.error.message);
        }
      });
    });
    socket.on("disconnect", () => {
      setOnline(false);
      setSyncing(false);
      setScreen((current) =>
        current.kind === "lobby"
          ? {
              kind: "lobby",
              snapshot: redactTransientSecrets(current.snapshot),
            }
          : current,
      );
    });
    socket.on("connect_error", () => {
      setOnline(false);
      setSyncing(false);
      setMessage(
        "Wiederaufnahme gescheitert. Prüfe die Verbindung und lade die Seite erneut.",
      );
    });
    socket.on("room:control", (state) => setControl(state));
    socket.on("room:snapshot", (snapshot) => {
      const previous = sequenceRef.current;
      const disposition = classifySnapshotSequence(
        previous,
        snapshot.room.sequence,
      );
      if (disposition === "resync") {
        setSyncing(true);
        void fetchRoom(activeCode)
          .then((fresh) => {
            if (fresh.room.sequence >= sequenceRef.current) {
              sequenceRef.current = fresh.room.sequence;
              setScreen({ kind: "lobby", snapshot: fresh });
            }
          })
          .catch((error) =>
            setMessage(
              error instanceof Error
                ? error.message
                : "Zustandsabgleich fehlgeschlagen.",
            ),
          )
          .finally(() => setSyncing(false));
        return;
      }
      if (disposition === "stale") return;
      sequenceRef.current = snapshot.room.sequence;
      setScreen((current) =>
        current.kind === "lobby" &&
        snapshot.room.code === current.snapshot.room.code &&
        snapshot.room.sequence >= current.snapshot.room.sequence
          ? { kind: "lobby", snapshot }
          : current,
      );
    });
    return () => {
      socket.disconnect();
      socketRef.current = undefined;
      setOnline(false);
    };
  }, [activeCode]);

  const enterLobby = (snapshot: LobbySnapshot) => {
    window.history.pushState({}, "", `/room/${snapshot.room.code}`);
    sequenceRef.current = snapshot.room.sequence;
    setCode(snapshot.room.code);
    setMessage("");
    setScreen({ kind: "lobby", snapshot });
  };

  const handleCreate = async (event: FormEvent) => {
    event.preventDefault();
    setPending(true);
    setMessage("");
    try {
      enterLobby(await createRoom(name, roundCount));
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Raum konnte nicht erstellt werden.",
      );
    } finally {
      setPending(false);
    }
  };

  const handleJoin = async (event: FormEvent) => {
    event.preventDefault();
    setPending(true);
    setMessage("");
    try {
      enterLobby(await joinRoom(code, name));
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Beitritt fehlgeschlagen.",
      );
    } finally {
      setPending(false);
    }
  };

  const command = async (
    value: LobbyCommand,
  ): Promise<CommandAck | undefined> => {
    if (
      screen.kind !== "lobby" ||
      !socketRef.current ||
      !socketRef.current.connected ||
      !online ||
      syncing ||
      control !== "active" ||
      (screen.snapshot.room.status === "started" &&
        screen.snapshot.interruption.status !== "active" &&
        !value.type.startsWith("game.interruption.")) ||
      !commandGateRef.current.tryBegin()
    ) {
      setActionFeedback({
        kind: "rejected",
        text: "Aktion nicht gesendet: Verbindung oder Zustandsabgleich ist nicht bereit.",
      });
      return;
    }
    setPending(true);
    setMessage("");
    setActionFeedback({ kind: "sending", text: actionLabel(value.type) });
    const commandId = createCommandId();
    unresolvedRef.current = { commandId, label: actionLabel(value.type) };
    try {
      const ack = await sendCommand(
        socketRef.current,
        screen.snapshot.room.code,
        value,
        commandId,
      );
      unresolvedRef.current = null;
      if (!ack.accepted) {
        const text = feedbackForRejection(ack, value.type);
        setMessage(text);
        setActionFeedback({ kind: "rejected", text });
      } else {
        setActionFeedback({
          kind: "confirmed",
          text: `${actionLabel(value.type)} bestätigt.`,
        });
      }
      if (ack.accepted && value.type === "lobby.leave") {
        window.history.pushState({}, "", "/");
        setScreen({ kind: "home" });
      }
      return ack;
    } catch {
      const socket = socketRef.current;
      if (socket?.connected && unresolvedRef.current) {
        try {
          const resolved = await getCommandStatus(
            socket,
            screen.snapshot.room.code,
            commandId,
          );
          unresolvedRef.current = null;
          const text = resolved?.accepted
            ? `${actionLabel(value.type)} war bereits bestätigt.`
            : (resolved?.error?.message ??
              `${actionLabel(value.type)} wurde nicht vom Server empfangen.`);
          setMessage(resolved?.accepted ? "" : text);
          setActionFeedback({
            kind: resolved?.accepted ? "confirmed" : "rejected",
            text,
          });
          return resolved;
        } catch {
          // The reconnect handler performs the same read-only lookup later.
        }
      }
      const text =
        "Verbindung unterbrochen – der Befehlsstatus wird nach der Rückkehr geprüft.";
      setMessage(text);
      setActionFeedback({ kind: "rejected", text });
    } finally {
      commandGateRef.current.end();
      setPending(false);
    }
  };

  if (screen.kind === "loading") {
    return (
      <main className="shell">
        <section className="card status" aria-live="polite">
          <Brand />
          <p>Deine Gastsitzung wird vorbereitet …</p>
        </section>
      </main>
    );
  }

  if (screen.kind === "fatal") {
    return (
      <main className="shell">
        <section className="card status">
          <Brand />
          <h2>Verbindung fehlgeschlagen</h2>
          <p className="error">{screen.message}</p>
          <button type="button" onClick={() => window.location.reload()}>
            Erneut versuchen
          </button>
        </section>
      </main>
    );
  }

  if (screen.kind === "home") {
    const invitedCode = screen.invitedCode;
    return (
      <main className="shell">
        <section className="card home-card">
          <Brand />
          <p className="eyebrow">Private Runde · 2–6 Spieler</p>
          <h2>
            {invitedCode ? "Einladung annehmen" : "Gemeinsam an einen Tisch"}
          </h2>
          <label>
            Dein Name
            <input
              value={name}
              maxLength={24}
              autoComplete="nickname"
              onChange={(event) => setName(event.target.value)}
              placeholder="z. B. Anna"
            />
          </label>

          {invitedCode ? (
            <form onSubmit={(event) => void handleJoin(event)}>
              <p className="invite-code">{invitedCode}</p>
              <button disabled={pending || name.trim().length === 0}>
                Raum beitreten
              </button>
            </form>
          ) : (
            <>
              <form onSubmit={(event) => void handleCreate(event)}>
                <label>
                  Rundenzahl
                  <input
                    type="number"
                    inputMode="numeric"
                    min={1}
                    max={99}
                    value={roundCount}
                    onChange={(event) =>
                      setRoundCount(event.target.valueAsNumber)
                    }
                  />
                </label>
                <button
                  disabled={
                    pending ||
                    name.trim().length === 0 ||
                    !Number.isInteger(roundCount)
                  }
                >
                  Privaten Raum erstellen
                </button>
              </form>
              <div className="divider">
                <span>oder</span>
              </div>
              <form onSubmit={(event) => void handleJoin(event)}>
                <label>
                  Raumcode
                  <input
                    value={code}
                    maxLength={6}
                    autoCapitalize="characters"
                    onChange={(event) =>
                      setCode(event.target.value.toUpperCase())
                    }
                    placeholder="ABC234"
                  />
                </label>
                <button
                  className="secondary"
                  disabled={
                    pending ||
                    name.trim().length === 0 ||
                    code.trim().length !== 6
                  }
                >
                  Beitreten
                </button>
              </form>
            </>
          )}
          {message && (
            <p className="error" role="alert">
              {message}
            </p>
          )}
        </section>
      </main>
    );
  }

  const { snapshot } = screen;
  const me = snapshot.participants.find(
    (participant) => participant.playerId === snapshot.you.playerId,
  )!;
  const canStart =
    snapshot.you.isHost &&
    snapshot.participants.length >= 2 &&
    snapshot.participants.every((participant) => participant.ready);

  if (snapshot.room.status === "started" && snapshot.game) {
    const usable =
      online &&
      !syncing &&
      control === "active" &&
      snapshot.interruption.status === "active";
    return (
      <GameScreen
        snapshot={snapshot}
        game={snapshot.game}
        online={usable}
        networkOnline={online}
        syncing={syncing}
        control={control}
        onTakeover={() => {
          const socket = socketRef.current;
          if (!socket) return;
          setPending(true);
          void takeOverControl(socket, snapshot.room.code)
            .then((fresh) => {
              sequenceRef.current = fresh.room.sequence;
              setScreen({ kind: "lobby", snapshot: fresh });
              setControl("active");
            })
            .catch((error) =>
              setMessage(
                error instanceof Error
                  ? error.message
                  : "Übernahme fehlgeschlagen.",
              ),
            )
            .finally(() => setPending(false));
        }}
        pending={pending}
        message={message}
        actionFeedback={actionFeedback}
        command={command}
      />
    );
  }

  return (
    <main className="shell lobby-shell">
      <section className="card lobby-card">
        <header className="lobby-header">
          <Brand compact />
          <span className={online ? "network online" : "network"}>
            {online ? "Online" : "Verbinde …"}
          </span>
        </header>
        <div className="room-title">
          <div>
            <p className="eyebrow">Raumcode</p>
            <h2>{snapshot.room.code}</h2>
          </div>
          <button
            className="small secondary"
            type="button"
            onClick={() =>
              void navigator.clipboard
                .writeText(
                  `${window.location.origin}/room/${snapshot.room.code}`,
                )
                .then(() => setMessage("Einladungslink kopiert."))
            }
          >
            Link kopieren
          </button>
        </div>

        <ol className="participants" aria-label="Teilnehmer">
          {snapshot.participants.map((participant) => (
            <li key={participant.playerId}>
              <span
                className={participant.connected ? "avatar online" : "avatar"}
              >
                {participant.name.slice(0, 1).toUpperCase()}
              </span>
              <span className="participant-name">
                {participant.name}
                {participant.playerId === snapshot.you.playerId && " (du)"}
              </span>
              {participant.isHost && <span className="tag">Host</span>}
              <span className={participant.ready ? "ready yes" : "ready"}>
                {participant.ready ? "Bereit" : "Wartet"}
              </span>
            </li>
          ))}
          {Array.from({ length: 6 - snapshot.participants.length }).map(
            (_, index) => (
              <li className="empty" key={index}>
                Freier Platz
              </li>
            ),
          )}
        </ol>

        <section className="settings">
          <label>
            Runden
            <input
              type="number"
              inputMode="numeric"
              min={1}
              max={99}
              value={snapshot.room.roundCount}
              disabled={
                !snapshot.you.isHost || snapshot.room.status !== "lobby"
              }
              onChange={(event) => {
                const value = event.target.valueAsNumber;
                if (Number.isInteger(value) && value >= 1 && value <= 99) {
                  void command({ type: "lobby.setRounds", roundCount: value });
                }
              }}
            />
          </label>
          <span>Standard: 10</span>
        </section>

        {snapshot.room.status === "started" ? (
          <div className="started" role="status">
            <strong>Partie gestartet</strong>
            <span>Der erste Kartenzug folgt in Meilenstein M3.</span>
          </div>
        ) : (
          <div className="actions">
            <button
              className={me.ready ? "secondary" : ""}
              disabled={pending || !online}
              onClick={() =>
                void command({ type: "lobby.setReady", ready: !me.ready })
              }
            >
              {me.ready ? "Nicht mehr bereit" : "Ich bin bereit"}
            </button>
            {snapshot.you.isHost && (
              <button
                disabled={pending || !online || !canStart}
                onClick={() => void command({ type: "lobby.start" })}
              >
                Partie starten
              </button>
            )}
          </div>
        )}

        {message && (
          <p className="notice" role="status">
            {message}
          </p>
        )}
        <button
          className="link-button"
          type="button"
          disabled={pending || snapshot.room.status !== "lobby"}
          onClick={() => void command({ type: "lobby.leave" })}
        >
          Raum endgültig verlassen
        </button>
        <p className="sequence">Raumstand #{snapshot.room.sequence}</p>
      </section>
    </main>
  );
}

function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <div className={compact ? "brand compact" : "brand"} aria-label="Kabu">
      <span className="suit" aria-hidden="true">
        ♦
      </span>
      <h1>Kabu</h1>
    </div>
  );
}

const rankLabels: Record<string, string> = {
  ace: "A",
  jack: "B",
  queen: "D",
  king: "K",
};
const suitLabels: Record<string, string> = {
  hearts: "♥",
  diamonds: "♦",
  spades: "♠",
  clubs: "♣",
};
const effectLabels: Record<string, string> = {
  "inspect-own": "Eigene Karte ansehen",
  "inspect-opponent": "Gegnerische Karte ansehen",
  "blind-swap": "Zwei Karten blind tauschen",
  "give-card": "Eine verdeckte Karte vergeben",
  "inspect-swap": "Zwei Karten ansehen und entscheiden",
};

type CardGuideEntry = {
  rank: string;
  suits: string;
  points: string;
  action: string;
};

const cardGuideEntries: CardGuideEntry[] = [
  {
    rank: "2",
    suits: "♥ ♦ ♠ ♣",
    points: "2",
    action: "Nächsten Spieler aussetzen lassen",
  },
  {
    rank: "3–6",
    suits: "♥ ♦ ♠ ♣",
    points: "3–6",
    action: "Eine eigene Karte ansehen",
  },
  {
    rank: "7–10",
    suits: "♥ ♦ ♠ ♣",
    points: "7–10",
    action: "Eine gegnerische Karte ansehen",
  },
  { rank: "B", suits: "♥ ♦ ♠ ♣", points: "11", action: "Keine Aktion" },
  { rank: "D", suits: "♥ ♦", points: "12", action: "Keine Aktion" },
  {
    rank: "D",
    suits: "♠ ♣",
    points: "12",
    action: "Zwei Karten verschiedener Spieler blind tauschen",
  },
  {
    rank: "K",
    suits: "♥ ♦",
    points: "0",
    action: "Einem Spieler eine verdeckte Karte geben",
  },
  {
    rank: "K",
    suits: "♠ ♣",
    points: "13",
    action: "Zwei Karten ansehen und tauschen oder behalten",
  },
  { rank: "A", suits: "♥ ♦ ♠ ♣", points: "1", action: "Keine Aktion" },
];

function effectLabel(kind: string) {
  return effectLabels[kind] ?? "Spezialfähigkeit";
}

export function initialViewTableHint(
  roundNumber: number,
  initialViewOpen: boolean,
) {
  return initialViewOpen
    ? `Runde ${roundNumber} · Zwei nahe Karten ansehen und merken.`
    : `Runde ${roundNumber} · Startansicht geschlossen. Auf Mitspieler warten.`;
}

type ActionFeedback = {
  kind: "sending" | "confirmed" | "rejected";
  text: string;
};

export function createCommandGate() {
  let pending = false;
  return {
    tryBegin() {
      if (pending) return false;
      pending = true;
      return true;
    },
    end() {
      pending = false;
    },
  };
}

const actionLabels: Partial<Record<LobbyCommand["type"], string>> = {
  "game.draw": "Karte ziehen",
  "game.discardDrawn": "Gezogene Karte ablegen",
  "game.swapDrawn": "Karte tauschen",
  "game.react": "Reaktionsversuch",
  "game.completeTransfer": "Ausgleichskarte übergeben",
  "game.callKabu": "Kabu ansagen",
  "game.effect.selectPosition": "Fähigkeitsziel wählen",
  "game.effect.selectPlayer": "Spieler wählen",
  "game.effect.closeView": "Private Einsicht schließen",
  "game.effect.decideSwap": "Königsentscheidung",
  "game.interruption.wait": "Weiter warten",
  "game.interruption.abort": "Partie abbrechen",
};

function actionLabel(type: LobbyCommand["type"]) {
  return actionLabels[type] ?? "Aktion";
}

export function feedbackForRejection(
  ack: Pick<CommandAck, "error">,
  type: LobbyCommand["type"],
) {
  const code = ack.error?.code;
  if (code === "STALE_POSITION") return "Zielkarte inzwischen verändert.";
  if (code === "RATE_LIMITED")
    return "Technisch gedrosselt – bitte kurz warten. Keine Spielstrafe.";
  if (code === "CARD_HELD") return "Zielkarte ist gebunden.";
  if (
    type === "game.react" &&
    (code === "INVALID_REACTION_WINDOW" || code === "REACTION_NOT_ALLOWED")
  )
    return "Reaktionsfenster bereits verbraucht oder geschlossen.";
  return ack.error?.message ?? "Aktion abgelehnt.";
}

export type SelectionPurpose =
  | "transfer"
  | "effect"
  | "reaction"
  | "swap"
  | "none";

export function selectionPurpose({
  hasTransfer,
  effectSelecting,
  reactionAvailable,
  deciding,
}: {
  hasTransfer: boolean;
  effectSelecting: boolean;
  reactionAvailable: boolean;
  deciding: boolean;
}): SelectionPurpose {
  if (hasTransfer) return "transfer";
  if (effectSelecting) return "effect";
  if (deciding) return "swap";
  if (reactionAvailable) return "reaction";
  return "none";
}

export function canSelectReactionTarget({
  held,
  viewingOwnEffect,
  belongsToOwnEffect,
}: {
  held: boolean;
  viewingOwnEffect: boolean;
  belongsToOwnEffect: boolean;
}) {
  return !held || (viewingOwnEffect && belongsToOwnEffect);
}

function selectionPurposeLabel(
  purpose: SelectionPurpose,
  effect: NonNullable<RoundView["effects"]>[number] | undefined,
) {
  if (purpose === "transfer") return "Ausgleichskarte auswählen";
  if (purpose === "reaction") return "Karte für Reaktion auswählen";
  if (purpose === "swap") return "Eigene Karte zum Tauschen wählen";
  if (purpose === "effect") {
    if (effect?.kind === "inspect-own") return "Eigene Karte ansehen";
    if (effect?.kind === "inspect-opponent") return "Gegnerische Karte ansehen";
    return effect?.targets.length
      ? "Zweite Karte auswählen"
      : "Erste Karte auswählen";
  }
  return "Keine Kartenauswahl aktiv";
}

function GameScreen({
  snapshot,
  game,
  online,
  networkOnline,
  syncing,
  control,
  onTakeover,
  pending,
  message,
  actionFeedback,
  command,
}: {
  snapshot: LobbySnapshot;
  game: RoundView;
  online: boolean;
  networkOnline: boolean;
  syncing: boolean;
  control: "active" | "takeover-required" | "revoked";
  onTakeover: () => void;
  pending: boolean;
  message: string;
  actionFeedback: ActionFeedback | null;
  command: (value: LobbyCommand) => Promise<CommandAck | undefined>;
}) {
  const [leaveDialogOpen, setLeaveDialogOpen] = useState(false);
  const [cardGuideOpen, setCardGuideOpen] = useState(false);
  const viewer = game.players.find(
    (player) => player.playerId === snapshot.you.playerId,
  );
  const viewerEliminated = Boolean(viewer?.eliminated);
  const isActive = game.activePlayerId === snapshot.you.playerId;
  const deciding = isActive && game.turn.phase === "awaiting-decision";
  const hasOpenEffect = (game.effects?.length ?? 0) > 0;
  const canCallKabu =
    game.phase === "playing" &&
    !viewerEliminated &&
    isActive &&
    game.turn.phase === "awaiting-draw" &&
    !hasOpenEffect &&
    !game.kabuCallerId;
  const waitingFor = snapshot.participants.filter((participant) =>
    game.players.some(
      (player) =>
        player.playerId === participant.playerId && !player.initialViewClosed,
    ),
  );
  const missingNames = snapshot.interruption.missingPlayerIds.map(
    (playerId) =>
      snapshot.participants.find(
        (participant) => participant.playerId === playerId,
      )?.name ?? "Spieler",
  );

  const send = async (
    value: { type: LobbyCommand["type"] } & Record<string, unknown>,
  ) => {
    return command({ ...value, roundId: game.id } as LobbyCommand);
  };
  const ownEffect = (game.effects ?? []).find(
    (effect) => effect.ownerPlayerId === snapshot.you.playerId,
  );
  const [selectedEffectId, setSelectedEffectId] = useState<string | null>(null);
  useEffect(() => {
    setSelectedEffectId(null);
  }, [ownEffect?.id]);
  const effectSelectionActive =
    ownEffect?.phase === "selecting" &&
    (ownEffect.activated || selectedEffectId === ownEffect.id);
  const activateOwnEffect = async () => {
    if (!ownEffect || ownEffect.phase !== "selecting" || ownEffect.activated)
      return;
    const ack = await send({
      type: "game.effect.activate",
      effectId: ownEffect.id,
    });
    if (ack?.accepted) setSelectedEffectId(ownEffect.id);
  };
  const canReactDirectly =
    !viewerEliminated &&
    game.reactionWindow !== null &&
    game.reactionWindow !== undefined &&
    !game.pendingTransfer &&
    !deciding &&
    (!ownEffect ||
      ownEffect.phase === "viewing" ||
      (ownEffect.phase === "selecting" && ownEffect.targets.length === 0)) &&
    (game.phase === "playing" || game.phase === "final-reaction");
  const purpose = selectionPurpose({
    hasTransfer: Boolean(game.pendingTransfer),
    effectSelecting:
      ownEffect?.phase === "selecting" &&
      (effectSelectionActive || !canReactDirectly),
    reactionAvailable: canReactDirectly,
    deciding,
  });
  const reactionCanSelect = (
    playerId: string,
    position: RoundView["players"][number]["positions"][number],
  ) =>
    canSelectReactionTarget({
      held: Boolean(position.held),
      viewingOwnEffect: ownEffect?.phase === "viewing",
      belongsToOwnEffect: Boolean(
        ownEffect?.targets.some(
          (target) =>
            target.playerId === playerId && target.positionId === position.id,
        ),
      ),
    });
  const effectCanSelect = (
    playerId: string,
    position: RoundView["players"][number]["positions"][number],
  ) => {
    if (!ownEffect || ownEffect.phase !== "selecting" || position.held)
      return false;
    if (ownEffect.kind === "inspect-own")
      return playerId === snapshot.you.playerId;
    if (ownEffect.kind === "inspect-opponent")
      return playerId !== snapshot.you.playerId;
    if (ownEffect.kind === "give-card") return false;
    return !ownEffect.targets.some(
      (target) =>
        target.playerId === playerId || target.positionId === position.id,
    );
  };
  const tableHint = game.pendingTransfer
    ? "Eigene Ausgleichskarte wählen."
    : game.you.drawnCard
      ? "Ablage oder eigene Karte antippen."
      : ownEffect?.phase === "viewing"
        ? "Offene Karte schließen oder mit anderer Karte reagieren."
        : ownEffect?.phase === "deciding"
          ? "Tauschen oder behalten."
          : ownEffect?.phase === "selecting" && effectSelectionActive
            ? `${effectLabel(ownEffect.kind)}: ${selectionPurposeLabel("effect", ownEffect)}.`
            : ownEffect?.phase === "selecting" && canReactDirectly
              ? "Erst reagieren oder rechts die Aktivität ausführen."
              : game.reactionWindow
                ? "Passende Karte direkt antippen."
                : isActive && !hasOpenEffect
                  ? "Oberste Karte ziehen."
                  : hasOpenEffect
                    ? "Offene Aktion zuerst abschließen oder ablehnen."
                    : undefined;
  const effectAction = ownEffect ? (
    <EffectTimerFrame expiresAt={ownEffect.expiresAt}>
      {ownEffect.kind === "give-card" && ownEffect.phase === "selecting" ? (
        <div className="pile-effect-actions">
          {snapshot.participants
            .filter(
              (participant) =>
                !game.players.find(
                  (player) => player.playerId === participant.playerId,
                )?.eliminated,
            )
            .map((participant) => (
              <button
                key={participant.playerId}
                disabled={pending || !online}
                onClick={() =>
                  send({
                    type: "game.effect.selectPlayer",
                    effectId: ownEffect.id,
                    targetPlayerId: participant.playerId,
                  })
                }
              >
                An {participant.name}
              </button>
            ))}
        </div>
      ) : (ownEffect.kind === "inspect-own" ||
          ownEffect.kind === "inspect-opponent") &&
        ownEffect.phase === "selecting" ? (
        <div className="pile-effect-actions">
          <button
            disabled={pending || !online || effectSelectionActive}
            onClick={() => void activateOwnEffect()}
          >
            {effectSelectionActive ? "Aktivität aktiv" : "Aktivität ausführen"}
          </button>
          <button
            className="secondary"
            disabled={pending || !online}
            onClick={() =>
              send({ type: "game.effect.skip", effectId: ownEffect.id })
            }
          >
            Ansehen überspringen
          </button>
        </div>
      ) : ownEffect.phase === "selecting" ? (
        <button
          disabled={pending || !online || effectSelectionActive}
          onClick={() => void activateOwnEffect()}
        >
          {effectSelectionActive ? "Aktivität aktiv" : "Aktivität ausführen"}
        </button>
      ) : ownEffect.kind === "inspect-swap" &&
        ownEffect.phase === "deciding" ? (
        <div className="pile-effect-actions">
          <button
            disabled={pending || !online}
            onClick={() =>
              send({
                type: "game.effect.decideSwap",
                effectId: ownEffect.id,
                swap: true,
              })
            }
          >
            Tauschen
          </button>
          <button
            className="secondary"
            disabled={pending || !online}
            onClick={() =>
              send({
                type: "game.effect.decideSwap",
                effectId: ownEffect.id,
                swap: false,
              })
            }
          >
            Behalten
          </button>
        </div>
      ) : null}
    </EffectTimerFrame>
  ) : undefined;
  const table = (
    <GameTable
      snapshot={snapshot}
      game={game}
      online={online}
      pending={pending}
      onDraw={() => send({ type: "game.draw", turnId: game.turn.id })}
      drawnCard={game.you.drawnCard}
      onDiscardDrawn={() =>
        send({ type: "game.discardDrawn", turnId: game.turn.id })
      }
      privateEffect={game.you.privateEffect}
      onClosePrivateView={
        ownEffect?.phase === "viewing"
          ? () => {
              void send({
                type: "game.effect.closeView",
                effectId: ownEffect.id,
              });
            }
          : undefined
      }
      markSwapOptions={purpose === "swap"}
      hint={tableHint}
      centerAction={effectAction}
      kabuAction={
        canCallKabu
          ? {
              disabled: pending || !online,
              onClick: () => {
                void send({ type: "game.callKabu", turnId: game.turn.id });
              },
            }
          : undefined
      }
      isPositionSelectable={(playerId, position) =>
        purpose === "transfer"
          ? playerId === snapshot.you.playerId && !position.held
          : purpose === "reaction"
            ? reactionCanSelect(playerId, position)
            : purpose === "effect"
              ? effectCanSelect(playerId, position)
              : purpose === "swap"
                ? playerId === snapshot.you.playerId && !position.held
                : false
      }
      onPositionSelect={(playerId, positionId, occupancyVersion) => {
        if (purpose === "transfer")
          void send({
            type: "game.completeTransfer",
            transferId: game.pendingTransfer!.id,
            positionId,
            occupancyVersion,
          });
        else if (purpose === "effect")
          void send({
            type: "game.effect.selectPosition",
            effectId: ownEffect!.id,
            targetPlayerId: playerId,
            positionId,
            occupancyVersion,
          });
        else if (purpose === "reaction") {
          const react = () =>
            send({
              type: "game.react",
              windowId: game.reactionWindow!.id,
              targetPlayerId: playerId,
              positionId,
              occupancyVersion,
            });
          if (ownEffect?.phase === "viewing") {
            void send({
              type: "game.effect.closeView",
              effectId: ownEffect.id,
            }).then((ack) => {
              if (ack?.accepted) void react();
            });
          } else void react();
        } else
          void send({
            type: "game.swapDrawn",
            turnId: game.turn.id,
            positionId,
            occupancyVersion,
          });
      }}
    />
  );

  return (
    <main className="shell game-shell">
      <section className="card game-card">
        <header className="lobby-header">
          <Brand compact />
          <div className="game-header-actions">
            <span
              className={
                networkOnline && !syncing ? "network online" : "network"
              }
            >
              {!networkOnline
                ? "Verbindung unterbrochen"
                : syncing
                  ? "Synchronisiere …"
                  : "Online"}
            </span>
            <button
              className="small secondary card-guide-trigger"
              type="button"
              aria-haspopup="dialog"
              aria-label="Kartenübersicht öffnen"
              onClick={() => {
                setLeaveDialogOpen(false);
                setCardGuideOpen(true);
              }}
            >
              <span className="wide-label">Kartenübersicht</span>
              <span className="short-label" aria-hidden="true">
                Karten
              </span>
            </button>
            <button
              className="small secondary"
              type="button"
              aria-label="Hauptmenü öffnen"
              disabled={pending}
              onClick={() => {
                setCardGuideOpen(false);
                setLeaveDialogOpen(true);
              }}
            >
              <span className="wide-label">Hauptmenü</span>
              <span className="short-label" aria-hidden="true">
                Menü
              </span>
            </button>
          </div>
        </header>

        {(control === "takeover-required" || control === "revoked") && (
          <section className="interruption-banner" role="status">
            <strong>Spiel in anderem Tab geöffnet</strong>
            <p>
              Dieser Tab zeigt den Tisch nur an und kann keine Aktionen senden.
            </p>
            <button
              type="button"
              disabled={pending || !networkOnline}
              onClick={onTakeover}
            >
              Steuerung übernehmen
            </button>
          </section>
        )}

        {snapshot.interruption.status !== "active" && (
          <section className="interruption-banner" role="alert">
            <strong>
              {snapshot.interruption.status === "aborted"
                ? "Partie abgebrochen"
                : "Partie pausiert"}
            </strong>
            {snapshot.interruption.status !== "aborted" && (
              <p>
                Fehlend: {missingNames.join(", ") || "niemand"}.
                {snapshot.interruption.status === "decision"
                  ? " Die Wiederbeitrittsfrist ist abgelaufen."
                  : " Wiederbeitritt ist 90 Sekunden lang möglich."}
              </p>
            )}
            {snapshot.interruption.status === "decision" &&
              snapshot.you.isHost && (
                <div className="pile-effect-actions">
                  <button
                    type="button"
                    disabled={pending || !networkOnline}
                    onClick={() =>
                      void command({
                        type: "game.interruption.wait",
                        roundId: game.id,
                      })
                    }
                  >
                    Weitere 90 Sekunden warten
                  </button>
                  <button
                    className="secondary"
                    type="button"
                    disabled={pending || !networkOnline}
                    onClick={() =>
                      void command({
                        type: "game.interruption.abort",
                        roundId: game.id,
                      })
                    }
                  >
                    Partie abbrechen
                  </button>
                </div>
              )}
          </section>
        )}

        {leaveDialogOpen && (
          <LeaveRoundDialog
            pending={pending}
            onCancel={() => setLeaveDialogOpen(false)}
            onConfirm={() => {
              void command({ type: "lobby.leave" });
            }}
          />
        )}

        {cardGuideOpen && (
          <CardGuideDialog onClose={() => setCardGuideOpen(false)} />
        )}

        {game.phase === "initial-view" ? (
          <section className="start-view" aria-live="polite">
            <GameTable
              snapshot={snapshot}
              game={game}
              online={online}
              pending={pending}
              onDraw={() => send({ type: "game.draw", turnId: game.turn.id })}
              hint={initialViewTableHint(game.number, game.you.initialViewOpen)}
            />
            {game.you.initialViewOpen ? (
              <button
                disabled={pending || !online}
                onClick={() => send({ type: "game.closeInitialView" })}
              >
                Karten verdecken und schließen
              </button>
            ) : (
              <p className="waiting">
                Warte auf {waitingFor.map((player) => player.name).join(", ")} …
              </p>
            )}
          </section>
        ) : game.phase === "round-result" || game.phase === "game-over" ? (
          <RoundResultPanel
            snapshot={snapshot}
            game={game}
            pending={pending}
            online={online}
            onReady={() => send({ type: "game.readyNextRound" })}
          />
        ) : (
          <>
            {table}

            {viewerEliminated && (
              <p className="notice eliminated-notice" role="status">
                Du bist ausgeschieden. Deine Endpunktzahl beträgt{" "}
                {viewer?.finalScore}.
              </p>
            )}

            {actionFeedback && (
              <div
                className={`action-feedback ${actionFeedback.kind}`}
                role="status"
                aria-live="polite"
              >
                <span aria-hidden="true">
                  {actionFeedback.kind === "sending"
                    ? "…"
                    : actionFeedback.kind === "confirmed"
                      ? "✓"
                      : "!"}
                </span>
                {actionFeedback.kind === "sending"
                  ? `${actionFeedback.text} gesendet · wartet auf Bestätigung`
                  : actionFeedback.text}
              </div>
            )}

            {game.kabuCallerId && (
              <section className="turn-status" aria-live="polite">
                <p className="eyebrow">Kabu-Schlussphase</p>
                <strong>
                  {snapshot.participants.find(
                    (p) => p.playerId === game.kabuCallerId,
                  )?.name ?? "Spieler"}{" "}
                  hat Kabu angesagt.
                </strong>
                <p>
                  Noch ausstehend:{" "}
                  {(game.pendingFinalTurns ?? [])
                    .map(
                      (id) =>
                        snapshot.participants.find((p) => p.playerId === id)
                          ?.name ?? id,
                    )
                    .join(", ") || "keine"}
                </p>
              </section>
            )}

            {game.phase === "final-reaction" &&
              game.finalReactionDeadline != null && (
                <FinalReactionCountdown
                  expiresAt={game.finalReactionDeadline}
                />
              )}
          </>
        )}
        {game.phase === "provisional-end" && (
          <p className="notice" role="status">
            Vorläufiges Rundenende: Bereits ausgelöste Pflichtaktionen werden
            noch abgeschlossen.
          </p>
        )}

        {message && (
          <p className="notice" role="status">
            {message}
          </p>
        )}
        {import.meta.env.VITE_KABU_TEST_SCENARIOS === "true" && (
          <details className="table-help">
            <summary>Entwicklungs-Testszenario laden / zurücksetzen</summary>
            <div className="actions">
              {[
                "ability-2",
                "ability-own-look",
                "ability-opponent-look",
                "ability-black-queen",
                "ability-red-king",
                "ability-black-king",
                "reaction-own",
                "reaction-wrong",
                "reaction-two-wrong",
                "reaction-foreign",
                "reaction-during-insight",
                "m5-zero-own",
                "m5-foreign-last",
                "m5-red-king-rescue",
                "m5-kabu",
                "m5-kabu-tie",
                "m5-kabu-early-zero",
                "m5-short-game",
                "m6-grown-field",
                "m6-four-player-grown-fields",
              ].map((scenario) => (
                <button
                  className="secondary"
                  disabled={pending || !online || !snapshot.you.isHost}
                  key={scenario}
                  onClick={() =>
                    send({
                      type: "game.dev.loadScenario",
                      scenario,
                    })
                  }
                >
                  {scenario}
                </button>
              ))}
            </div>
          </details>
        )}
        <p className="sequence">Raumstand #{snapshot.room.sequence}</p>
      </section>
    </main>
  );
}

export function CardGuideDialog({ onClose }: { onClose: () => void }) {
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    closeButtonRef.current?.focus();
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      window.removeEventListener("keydown", closeOnEscape);
      previouslyFocused?.focus();
    };
  }, [onClose]);

  return (
    <div className="dialog-backdrop card-guide-backdrop" role="presentation">
      <section
        className="card-guide-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="card-guide-title"
        aria-describedby="card-guide-description"
      >
        <header className="card-guide-header">
          <div>
            <p className="eyebrow">Spickzettel</p>
            <h2 id="card-guide-title">Kartenübersicht</h2>
          </div>
          <button
            ref={closeButtonRef}
            className="card-guide-close"
            type="button"
            aria-label="Kartenübersicht schließen"
            onClick={onClose}
          >
            ×
          </button>
        </header>
        <p id="card-guide-description" className="card-guide-note">
          Aktionen werden nur ausgelöst, wenn du eine frisch gezogene Karte
          direkt ablegst. Beim Tauschen oder Reagieren lösen Karten keine Aktion
          aus.
        </p>
        <div className="card-guide-columns" aria-hidden="true">
          <span>Karte</span>
          <span>Punkte</span>
          <span>Aktion</span>
        </div>
        <ul className="card-guide-list">
          {cardGuideEntries.map((entry) => (
            <li key={`${entry.rank}-${entry.suits}`}>
              <div
                className={`guide-card${entry.rank.includes("–") ? " grouped" : ""}`}
                aria-label={`${entry.rank} ${entry.suits}`}
              >
                <strong>{entry.rank}</strong>
                <span aria-hidden="true">
                  {entry.suits.split(" ").map((suit) => (
                    <span
                      className={suit === "♥" || suit === "♦" ? "red" : ""}
                      key={suit}
                    >
                      {suit}
                    </span>
                  ))}
                </span>
              </div>
              <strong className="card-guide-points">{entry.points}</strong>
              <span className="card-guide-action">{entry.action}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

export function LeaveRoundDialog({
  pending,
  onCancel,
  onConfirm,
}: {
  pending: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="dialog-backdrop" role="presentation">
      <section
        className="confirm-dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="leave-round-title"
        aria-describedby="leave-round-description"
      >
        <p className="eyebrow">Runde verlassen</p>
        <h2 id="leave-round-title">Zurück zum Hauptmenü?</h2>
        <p id="leave-round-description">
          Bist du sicher, dass du die laufende Runde verlassen möchtest?
        </p>
        <div className="dialog-actions">
          <button
            className="secondary"
            type="button"
            disabled={pending}
            autoFocus
            onClick={onCancel}
          >
            In der Runde bleiben
          </button>
          <button type="button" disabled={pending} onClick={onConfirm}>
            {pending ? "Wird verlassen …" : "Runde verlassen"}
          </button>
        </div>
      </section>
    </div>
  );
}

export function cyclicPlayersForViewer(
  players: RoundView["players"],
  viewerId: string,
) {
  const bySeat = [...players].toSorted((left, right) => left.seat - right.seat);
  const ownIndex = bySeat.findIndex((player) => player.playerId === viewerId);
  if (ownIndex < 0) throw new Error("Viewer is not seated at this table");
  return [
    ...bySeat.slice(ownIndex + 1),
    ...bySeat.slice(0, ownIndex),
    bySeat[ownIndex]!,
  ];
}

export function visualColumnOrder(columns: number[]) {
  const unique = [...new Set(columns)];
  const left = unique
    .filter((column) => column >= 3 && column % 2 === 1)
    .toSorted((a, b) => b - a);
  const center = [0, 1].filter((column) => unique.includes(column));
  const right = unique
    .filter((column) => column >= 2 && column % 2 === 0)
    .toSorted((a, b) => a - b);
  return [...left, ...center, ...right];
}

export function stableFieldAnchorOffset(
  columns: number[],
  columnWidth: number,
) {
  const unique = new Set(columns);
  const columnsLeftOfStart = [...unique].filter(
    (column) => column >= 3 && column % 2 === 1,
  ).length;
  const columnsRightOfStart = [...unique].filter(
    (column) => column >= 2 && column % 2 === 0,
  ).length;
  return ((columnsRightOfStart - columnsLeftOfStart) * columnWidth) / 2;
}

export function RoundResultPanel({
  snapshot,
  game,
  pending,
  online,
  onReady,
}: {
  snapshot: LobbySnapshot;
  game: RoundView;
  pending: boolean;
  online: boolean;
  onReady: () => void;
}) {
  const result = game.completedRounds?.at(-1);
  const participant = (playerId: string) =>
    snapshot.participants.find((item) => item.playerId === playerId)?.name ??
    "Spieler";
  return (
    <section className="round-result" aria-live="polite">
      <p className="eyebrow">
        {game.phase === "game-over"
          ? "Partie beendet"
          : `Runde ${game.number} beendet`}
      </p>
      <h2>
        {game.phase === "game-over"
          ? `Gewonnen: ${(game.winners ?? []).map(participant).join(", ")}`
          : `Zwischenstand · ${game.number} von ${game.roundCount ?? snapshot.room.roundCount}`}
      </h2>
      <div
        className="score-table"
        role="table"
        aria-label="Rundenergebnis und Gesamtstand"
      >
        {game.players.map((player) => {
          const score = result?.scores.find(
            (candidate) => candidate.playerId === player.playerId,
          );
          return (
            <div className="score-row" role="row" key={player.playerId}>
              <strong>{participant(player.playerId)}</strong>
              {player.eliminated ? (
                <span>Ausgeschieden · Endstand: {player.finalScore}</span>
              ) : score ? (
                <>
                  <span>Kartenpunkte: {score.cardPoints}</span>
                  <span>Kabu-Strafe: +{score.kabuPenalty}</span>
                  <span>Runde: {score.roundPoints}</span>
                  <span>
                    Gesamt:{" "}
                    {game.totalScores?.[player.playerId] ?? score.roundPoints}
                  </span>
                </>
              ) : (
                <span>Gesamt: {game.totalScores?.[player.playerId] ?? 0}</span>
              )}
            </div>
          );
        })}
      </div>
      {game.phase === "round-result" && (
        <div className="next-round-action">
          {game.players.find(
            (player) => player.playerId === snapshot.you.playerId,
          )?.eliminated ? (
            <p>Du bist ausgeschieden und schaust nur noch zu.</p>
          ) : (
            <button
              disabled={
                pending ||
                !online ||
                (game.nextRoundReady ?? []).includes(snapshot.you.playerId)
              }
              onClick={onReady}
            >
              {(game.nextRoundReady ?? []).includes(snapshot.you.playerId)
                ? "Bereit – warte auf die anderen"
                : "Bereit für nächste Runde"}
            </button>
          )}
          <p>
            {game.nextRoundReady?.length ?? 0} von{" "}
            {game.players.filter((player) => !player.eliminated).length} bereit
          </p>
        </div>
      )}
      <GameTable
        snapshot={snapshot}
        game={game}
        online={online}
        pending={pending}
        onDraw={() => undefined}
      />
    </section>
  );
}

function FinalReactionCountdown({ expiresAt }: { expiresAt: number }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 100);
    return () => window.clearInterval(timer);
  }, [expiresAt]);
  const milliseconds = Math.max(0, expiresAt - now);
  return (
    <p
      className="notice final-reaction-countdown"
      role="timer"
      aria-live="polite"
    >
      Letztes Kabu-Reaktionsfenster: {(milliseconds / 1_000).toFixed(1)} s
    </p>
  );
}

export function EffectTimerFrame({
  expiresAt,
  children,
}: {
  expiresAt: number | undefined;
  children: ReactNode;
}) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (expiresAt === undefined) return;
    const timer = window.setInterval(() => setNow(Date.now()), 100);
    return () => window.clearInterval(timer);
  }, [expiresAt]);
  const milliseconds = Math.max(0, (expiresAt ?? now) - now);
  const progress = expiresAt === undefined ? 1 : milliseconds / 10_000;
  return (
    <div
      className="effect-timer-frame"
      style={{ "--effect-angle": `${progress * 360}deg` } as CSSProperties}
      role="timer"
      aria-label={`${Math.ceil(milliseconds / 1_000)} Sekunden für die Aktivität verbleibend`}
    >
      {children}
    </div>
  );
}

export function GameTable({
  snapshot,
  game,
  online,
  pending,
  onDraw,
  drawnCard,
  onDiscardDrawn,
  privateEffect,
  onClosePrivateView,
  markSwapOptions = false,
  hint,
  centerAction,
  kabuAction,
  isPositionSelectable = () => false,
  onPositionSelect,
}: {
  snapshot: LobbySnapshot;
  game: RoundView;
  online: boolean;
  pending: boolean;
  onDraw: () => void;
  drawnCard?: RoundView["you"]["drawnCard"];
  onDiscardDrawn?: () => void;
  privateEffect?: RoundView["you"]["privateEffect"];
  onClosePrivateView?: (() => void) | undefined;
  markSwapOptions?: boolean;
  hint?: string | undefined;
  centerAction?: ReactNode;
  kabuAction?: { disabled: boolean; onClick: () => void } | undefined;
  isPositionSelectable?: (
    playerId: string,
    position: RoundView["players"][number]["positions"][number],
  ) => boolean;
  onPositionSelect?: (
    playerId: string,
    positionId: string,
    occupancyVersion: number,
  ) => void;
}) {
  const [viewportWidth, setViewportWidth] = useState(() =>
    typeof window === "undefined" ? 390 : window.innerWidth,
  );
  useEffect(() => {
    const update = () => setViewportWidth(window.innerWidth);
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);
  const ordered = cyclicPlayersForViewer(game.players, snapshot.you.playerId);
  const ownPlayer = ordered.at(-1)!;
  const opponents = ordered.slice(0, -1);
  const participantById = new Map(
    snapshot.participants.map((participant) => [
      participant.playerId,
      participant,
    ]),
  );
  const isActive = game.activePlayerId === snapshot.you.playerId;
  const largestFieldColumns = Math.max(
    2,
    ...game.players.map(
      (player) =>
        new Set(player.positions.map((position) => position.column)).size,
    ),
  );
  const availableWidth = Math.max(
    280,
    Math.min(viewportWidth, 1152) - (viewportWidth <= 640 ? 24 : 76),
  );
  const opponentColumns = Math.min(3, Math.max(1, opponents.length));
  const cardGap = viewportWidth <= 480 ? 2 : 4;
  const opponentGridGap = viewportWidth <= 480 ? 4 : 9;
  const sizingColumns = Math.max(
    opponents.length >= 2 ? 4 : 3,
    largestFieldColumns,
  );
  const opponentSlotWidth =
    (availableWidth - (opponentColumns - 1) * opponentGridGap) /
    opponentColumns;
  const opponentFitWidth = Math.floor(
    (opponentSlotWidth - (sizingColumns - 1) * cardGap) / sizingColumns,
  );
  const ownFitWidth = Math.floor(
    (availableWidth - (sizingColumns - 1) * cardGap) / sizingColumns,
  );
  const cardWidth = Math.max(
    20,
    Math.min(largestFieldColumns >= 4 ? 44 : 52, ownFitWidth, opponentFitWidth),
  );
  const tableStyle = {
    "--card-width": `${cardWidth}px`,
    "--card-height": `${Math.max(31, Math.round(cardWidth * (4.65 / 3.5)))}px`,
    "--card-gap": `${cardGap}px`,
    "--opponent-columns": opponentColumns,
  } as CSSProperties;

  const field = (player: RoundView["players"][number], own: boolean) => {
    const participant = participantById.get(player.playerId);
    const fieldColumns = new Set(
      player.positions.map((position) => position.column),
    ).size;
    const count = player.positions.filter(
      (position) => position.occupied,
    ).length;
    const activePlayer = player.playerId === game.activePlayerId;
    const anchorOffset = stableFieldAnchorOffset(
      player.positions.map((position) => position.column),
      cardWidth + cardGap,
    );
    return (
      <section
        className={`table-player${own ? " own" : ""}${activePlayer ? " active" : ""}${player.eliminated ? " eliminated" : ""}${fieldColumns > 2 ? " expanded" : ""}`}
        data-player-id={player.playerId}
        data-seat={player.seat}
        key={player.playerId}
        aria-label={`Kartenfeld von ${participant?.name ?? "Spieler"}${activePlayer ? ", aktiver Spieler" : ""}`}
      >
        <header>
          <strong>
            <span
              className={`active-turn-marker${activePlayer ? " visible" : ""}`}
              aria-hidden="true"
            >
              ▶
            </span>
            {participant?.name ?? "Spieler"}
            {own ? " (du)" : ""}
          </strong>
          {player.eliminated && (
            <span>Ausgeschieden · {player.finalScore} Punkte</span>
          )}
        </header>
        {player.eliminated ? (
          <p className="eliminated-seat" aria-label="Spieler ausgeschieden">
            Ausgeschieden
          </p>
        ) : (
          <div
            className="player-field-row"
            style={
              anchorOffset !== 0
                ? { transform: `translateX(${anchorOffset}px)` }
                : undefined
            }
          >
            {count > 0 && (
              <div className={own ? "own-card-field" : "player-card-field"}>
                <PlayerField
                  positions={player.positions}
                  ownerName={`${participant?.name ?? "Spieler"}${own ? " (du)" : ""}`}
                  publicReveals={game.publicReveals ?? []}
                  privateCards={
                    privateEffect?.cards.filter(
                      ({ target }) => target.playerId === player.playerId,
                    ) ?? []
                  }
                  privateExpiresAt={privateEffect?.expiresAt}
                  onClosePrivateView={onClosePrivateView}
                  selectable={(position) =>
                    !pending &&
                    online &&
                    position.occupied &&
                    isPositionSelectable(player.playerId, position)
                  }
                  markSelectable={markSwapOptions && own}
                  onSelect={(positionId, occupancyVersion) =>
                    onPositionSelect?.(
                      player.playerId,
                      positionId,
                      occupancyVersion,
                    )
                  }
                />
              </div>
            )}
            {own && (
              <div
                className={`drawn-card-slot${drawnCard ? " occupied" : ""}`}
                aria-label={drawnCard ? "Gezogene Karte" : undefined}
                aria-hidden={drawnCard ? undefined : true}
              >
                {drawnCard && (
                  <>
                    <span className="drawn-card-label">Gezogen</span>
                    <CardFace card={drawnCard} />
                  </>
                )}
              </div>
            )}
          </div>
        )}
        {own && kabuAction && (
          <button
            type="button"
            className="kabu-action"
            disabled={kabuAction.disabled}
            onClick={kabuAction.onClick}
          >
            Kabu
          </button>
        )}
      </section>
    );
  };

  return (
    <section
      className={`game-table players-${game.players.length}`}
      aria-label="Spieltisch"
      style={tableStyle}
    >
      <div
        className={`opponent-fields opponents-${opponents.length}`}
        aria-label="Mitspieler in Zugreihenfolge"
      >
        {opponents.map((player) => field(player, false))}
      </div>
      <div className="table-center" aria-label="Tischmitte">
        <div className={`table-piles${centerAction ? " has-action" : ""}`}>
          <div className="pile-hint-slot">
            {hint && (
              <p className="pile-hint" role="status">
                {hint}
              </p>
            )}
          </div>
          <div className="pile-area">
            <button
              className="draw-pile"
              disabled={
                pending ||
                !online ||
                !isActive ||
                game.phase !== "playing" ||
                (game.effects?.length ?? 0) > 0 ||
                game.turn.phase !== "awaiting-draw"
              }
              onClick={onDraw}
              aria-label={
                isActive && game.turn.phase === "awaiting-draw"
                  ? `Oberste Karte ziehen, ${game.drawPileCount} Karten übrig`
                  : `Nachziehstapel, ${game.drawPileCount} Karten übrig`
              }
            >
              <span className="stack-card stack-card-back" aria-hidden="true" />
              <span
                className="stack-card stack-card-middle"
                aria-hidden="true"
              />
              <span className="stack-card stack-card-top" aria-hidden="true" />
            </button>
            <strong className="pile-count">{game.drawPileCount}</strong>
          </div>
          <button
            type="button"
            className={`discard-pile${game.discardTop ? "" : " empty"}${drawnCard ? " accepts-drawn" : ""}`}
            aria-label={
              drawnCard
                ? "Gezogene Karte auf den Ablagestapel legen"
                : game.discardTop
                  ? "Ablagestapel"
                  : "Ablagestapel leer"
            }
            disabled={!drawnCard || pending || !online}
            onClick={onDiscardDrawn}
          >
            {game.discardTop ? (
              <CardFace card={game.discardTop} />
            ) : (
              <span className="empty-discard">Leer</span>
            )}
          </button>
          {centerAction && (
            <div className="pile-action-slot" aria-live="polite">
              {centerAction}
            </div>
          )}
        </div>
        <div className="reaction-status" role="status">
          {!game.reactionWindow
            ? "Reaktionsfenster: keines"
            : game.reactionWindow.status === "open"
              ? `Reaktionsfenster offen · Rang ${rankLabels[game.reactionWindow.rank] ?? game.reactionWindow.rank}`
              : `Reaktionsfenster verbraucht · Rang ${rankLabels[game.reactionWindow.rank] ?? game.reactionWindow.rank} · weitere Versuche geben eine Strafkarte`}
        </div>
      </div>
      <div className="own-table-field">{field(ownPlayer, true)}</div>
    </section>
  );
}

function PlayerField({
  positions,
  ownerName,
  publicReveals = [],
  privateCards = [],
  privateExpiresAt,
  onClosePrivateView,
  selectable = () => false,
  markSelectable = false,
  onSelect,
}: {
  positions: NonNullable<LobbySnapshot["game"]>["players"][number]["positions"];
  ownerName: string;
  publicReveals?: NonNullable<RoundView["publicReveals"]>;
  privateCards?: NonNullable<RoundView["you"]["privateEffect"]>["cards"];
  privateExpiresAt?: number | undefined;
  onClosePrivateView?: (() => void) | undefined;
  selectable?: (position: (typeof positions)[number]) => boolean;
  markSelectable?: boolean;
  onSelect?: (positionId: string, occupancyVersion: number) => void;
}) {
  const occupiedPositions = positions.filter((position) => position.occupied);
  const orderedColumns = visualColumnOrder(
    positions.map((position) => position.column),
  );
  const visualColumn = new Map(
    orderedColumns.map((column, index) => [column, index + 1]),
  );
  const fieldRows = (["far", "near"] as const).filter((row) =>
    positions.some((position) => position.row === row),
  );
  const visualRow = new Map(fieldRows.map((row, index) => [row, index + 1]));
  return (
    <div
      className="player-field"
      style={{
        gridTemplateColumns: `repeat(${orderedColumns.length}, var(--card-width))`,
      }}
    >
      {fieldRows.flatMap((row) =>
        occupiedPositions
          .filter((position) => position.row === row)
          .toSorted(
            (left, right) =>
              visualColumn.get(left.column)! - visualColumn.get(right.column)!,
          )
          .map((position) => {
            const reveal = publicReveals.find(
              (item) =>
                item.target.positionId === position.id &&
                item.target.occupancyVersion === position.occupancyVersion,
            );
            const privateCard = privateCards.find(
              (item) => item.target.positionId === position.id,
            );
            const rowLabel = row === "near" ? "Nahe" : "Ferne";
            return (
              <button
                type="button"
                className={`field-position ${position.card || privateCard ? "revealed" : ""}${privateCard ? " private-reveal" : ""}${markSelectable && selectable(position) ? " swap-option" : ""}`}
                disabled={!privateCard && !selectable(position)}
                onClick={() => {
                  if (privateCard && onClosePrivateView) {
                    onClosePrivateView();
                    return;
                  }
                  onSelect?.(position.id, position.occupancyVersion);
                }}
                key={position.id}
                aria-label={`${!position.card && !privateCard ? "Verdeckte Karte" : "Aufgedeckte Karte"} von ${ownerName}, ${rowLabel.toLowerCase()} ${position.column + 1}${position.held ? ", gebunden" : ""}${reveal ? (reveal.reason === "too-late" ? ", zu spät – Strafkarte erhalten" : ", falsche Karte – Strafkarte erhalten") : ""}${privateCard && onClosePrivateView ? ", zum Schließen antippen" : selectable(position) ? ", auswählen" : ""}`}
                data-position-id={position.id}
                data-occupancy-version={position.occupancyVersion}
                style={{
                  gridColumn: visualColumn.get(position.column),
                  gridRow: visualRow.get(row),
                }}
              >
                {position.held && (
                  <span className="position-marker" aria-label="Karte gehalten">
                    Gehalten
                  </span>
                )}
                {reveal && (
                  <span className="position-marker reveal-marker">
                    {reveal.reason === "too-late"
                      ? "Zu spät · Strafkarte"
                      : "Falsche Karte · Strafkarte"}
                  </span>
                )}
                {privateCard ? (
                  <TimedCardFace
                    card={privateCard.card}
                    expiresAt={privateExpiresAt ?? Date.now()}
                  />
                ) : position.card ? (
                  <CardFace card={position.card} />
                ) : (
                  <span className="card-back">♦</span>
                )}
              </button>
            );
          }),
      )}
    </div>
  );
}

function CardFace({
  card,
}: {
  card: { suit: string; rank: string; value: number };
}) {
  const red = card.suit === "hearts" || card.suit === "diamonds";
  return (
    <span className={`card-face ${red ? "red" : "black"}`}>
      <strong>{rankLabels[card.rank] ?? card.rank}</strong>
      <span>{suitLabels[card.suit]}</span>
      <small>{card.value} Punkte</small>
    </span>
  );
}

function TimedCardFace({
  card,
  expiresAt,
}: {
  card: { suit: string; rank: string; value: number };
  expiresAt: number;
}) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 100);
    return () => window.clearInterval(timer);
  }, [expiresAt]);
  const progress = Math.max(0, Math.min(1, (expiresAt - now) / 10_000));
  return (
    <span
      className="timed-reveal"
      style={{ "--reveal-angle": `${progress * 360}deg` } as CSSProperties}
      role="timer"
      aria-label={`${Math.ceil(Math.max(0, expiresAt - now) / 1_000)} Sekunden verbleibend`}
    >
      <CardFace card={card} />
    </span>
  );
}
