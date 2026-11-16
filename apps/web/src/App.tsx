import {
  type CSSProperties,
  type FormEvent,
  type RefObject,
  type ReactNode,
  useEffect,
  useLayoutEffect,
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
import { I18nProvider, LanguageMenu, useI18n } from "./i18n";

type Screen =
  | { kind: "loading" }
  | { kind: "home"; invitedCode?: string }
  | { kind: "lobby"; snapshot: LobbySnapshot }
  | { kind: "fatal"; message: string };

const EFFECT_DURATION_MS = 20_000;
const CARD_MOVE_DURATION_MS = 300;
const CARD_HIGHLIGHT_DURATION_MS = 360;
const CARD_MOVE_STAGGER_MS = 65;
const CARD_SWAP_DURATION_MS = 680;
const CARD_SWAP_HIGHLIGHT_MS = 820;
const ABILITY_SWAP_PREVIEW_MS = 520;
const ABILITY_SWAP_DURATION_MS = 1_050;

function codeFromLocation(): string | undefined {
  const match = /^\/room\/([A-HJ-NP-Z2-9]{6})\/?$/iu.exec(
    window.location.pathname,
  );
  return match?.[1]?.toUpperCase();
}

export function App() {
  return (
    <I18nProvider>
      <LanguageMenu />
      <AppContent />
    </I18nProvider>
  );
}

function AppContent() {
  const { language, t } = useI18n();
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
              ? t(error.message)
              : t("Die App konnte nicht gestartet werden."),
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
                    text: `${unresolved.label}: ${t("nicht vom Server empfangen.")}`,
                  });
                } else if (ack.accepted) {
                  setActionFeedback({
                    kind: "confirmed",
                    text: `${unresolved.label} ${t("war bereits bestätigt.")}`,
                  });
                } else {
                  setActionFeedback({
                    kind: "rejected",
                    text:
                      (ack.error?.message ? t(ack.error.message) : undefined) ??
                      `${unresolved.label} ${t("wurde abgelehnt.")}`,
                  });
                }
                unresolvedRef.current = null;
              })
              .catch(() => undefined);
          }
        } else {
          setSyncing(false);
          setMessage(t(result.error.message));
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
        t(
          "Wiederaufnahme gescheitert. Prüfe die Verbindung und lade die Seite erneut.",
        ),
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
                ? t(error.message)
                : t("Zustandsabgleich fehlgeschlagen."),
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
  }, [activeCode, language]);

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
          ? t(error.message)
          : t("Raum konnte nicht erstellt werden."),
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
        error instanceof Error
          ? t(error.message)
          : t("Beitritt fehlgeschlagen."),
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
        text: t(
          "Aktion nicht gesendet: Verbindung oder Zustandsabgleich ist nicht bereit.",
        ),
      });
      return;
    }
    setPending(true);
    setMessage("");
    setActionFeedback({ kind: "sending", text: actionLabel(value.type, t) });
    const commandId = createCommandId();
    unresolvedRef.current = { commandId, label: actionLabel(value.type, t) };
    try {
      const ack = await sendCommand(
        socketRef.current,
        screen.snapshot.room.code,
        value,
        commandId,
      );
      unresolvedRef.current = null;
      if (!ack.accepted) {
        const text = feedbackForRejection(ack, value.type, t);
        setMessage(text);
        setActionFeedback({ kind: "rejected", text });
      } else {
        setActionFeedback({
          kind: "confirmed",
          text: `${actionLabel(value.type, t)} ${t("bestätigt.")}`,
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
            ? `${actionLabel(value.type, t)} ${t("war bereits bestätigt.")}`
            : ((resolved?.error?.message
                ? t(resolved.error.message)
                : undefined) ??
              `${actionLabel(value.type, t)} ${t("wurde nicht vom Server empfangen.")}`);
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
      const text = t(
        "Verbindung unterbrochen – der Befehlsstatus wird nach der Rückkehr geprüft.",
      );
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
          <p>{t("Deine Gastsitzung wird vorbereitet …")}</p>
        </section>
      </main>
    );
  }

  if (screen.kind === "fatal") {
    return (
      <main className="shell">
        <section className="card status">
          <Brand />
          <h2>{t("Verbindung fehlgeschlagen")}</h2>
          <p className="error">{screen.message}</p>
          <button type="button" onClick={() => window.location.reload()}>
            {t("Erneut versuchen")}
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
          <p className="eyebrow">{t("Private Runde · 2–6 Spieler")}</p>
          <h2>
            {invitedCode
              ? t("Einladung annehmen")
              : t("Gemeinsam an einen Tisch")}
          </h2>
          <label>
            {t("Dein Name")}
            <input
              value={name}
              maxLength={24}
              autoComplete="nickname"
              onChange={(event) => setName(event.target.value)}
              placeholder={t("z. B. Anna")}
            />
          </label>

          {invitedCode ? (
            <form onSubmit={(event) => void handleJoin(event)}>
              <p className="invite-code">{invitedCode}</p>
              <button disabled={pending || name.trim().length === 0}>
                {t("Raum beitreten")}
              </button>
            </form>
          ) : (
            <>
              <form onSubmit={(event) => void handleCreate(event)}>
                <label>
                  {t("Rundenzahl")}
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
                  {t("Privaten Raum erstellen")}
                </button>
              </form>
              <div className="divider">
                <span>{t("oder")}</span>
              </div>
              <form onSubmit={(event) => void handleJoin(event)}>
                <label>
                  {t("Raumcode")}
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
                  {t("Beitreten")}
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
                  ? t(error.message)
                  : t("Übernahme fehlgeschlagen."),
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
            {online ? t("Online") : t("Verbinde …")}
          </span>
        </header>
        <div className="room-title">
          <div>
            <p className="eyebrow">{t("Raumcode")}</p>
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
                .then(() => setMessage(t("Einladungslink kopiert.")))
            }
          >
            {t("Link kopieren")}
          </button>
        </div>

        <ol className="participants" aria-label={t("Teilnehmer")}>
          {snapshot.participants.map((participant) => (
            <li key={participant.playerId}>
              <span
                className={participant.connected ? "avatar online" : "avatar"}
              >
                {participant.name.slice(0, 1).toUpperCase()}
              </span>
              <span className="participant-name">
                {participant.name}
                {participant.playerId === snapshot.you.playerId &&
                  ` (${t("du")})`}
              </span>
              {participant.isHost && <span className="tag">{t("Host")}</span>}
              <span className={participant.ready ? "ready yes" : "ready"}>
                {participant.ready ? t("Bereit") : t("Wartet")}
              </span>
            </li>
          ))}
          {Array.from({ length: 6 - snapshot.participants.length }).map(
            (_, index) => (
              <li className="empty" key={index}>
                {t("Freier Platz")}
              </li>
            ),
          )}
        </ol>

        <section className="settings">
          <label>
            {t("Runden")}
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
          <span>{t("Standard: 10")}</span>
        </section>

        {snapshot.room.status === "started" ? (
          <div className="started" role="status">
            <strong>{t("Partie gestartet")}</strong>
            <span>{t("Der erste Kartenzug folgt in Meilenstein M3.")}</span>
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
              {me.ready ? t("Nicht mehr bereit") : t("Ich bin bereit")}
            </button>
            {snapshot.you.isHost && (
              <button
                disabled={pending || !online || !canStart}
                onClick={() => void command({ type: "lobby.start" })}
              >
                {t("Partie starten")}
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
          {t("Raum endgültig verlassen")}
        </button>
        <p className="sequence">
          {t("Raumstand #{value}", { value: snapshot.room.sequence })}
        </p>
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

type Translate = (
  text: string,
  replacements?: Record<string, string | number>,
) => string;

function effectLabel(kind: string, t: Translate = (text) => text) {
  return t(effectLabels[kind] ?? "Spezialfähigkeit");
}

export function initialViewTableHint(
  roundNumber: number,
  initialViewOpen: boolean,
  t: Translate = (text, replacements) => {
    if (!replacements) return text;
    return Object.entries(replacements).reduce(
      (value, [key, replacement]) =>
        value.replaceAll(`{${key}}`, String(replacement)),
      text,
    );
  },
) {
  return initialViewOpen
    ? t("Runde {round} · Zwei nahe Karten ansehen und merken.", {
        round: roundNumber,
      })
    : t("Runde {round} · Startansicht geschlossen. Auf Mitspieler warten.", {
        round: roundNumber,
      });
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

function actionLabel(
  type: LobbyCommand["type"],
  t: Translate = (text) => text,
) {
  return t(actionLabels[type] ?? "Aktion");
}

export function feedbackForRejection(
  ack: Pick<CommandAck, "error">,
  type: LobbyCommand["type"],
  t: Translate = (text) => text,
) {
  const code = ack.error?.code;
  if (code === "STALE_POSITION") return t("Zielkarte inzwischen verändert.");
  if (code === "RATE_LIMITED")
    return t("Technisch gedrosselt – bitte kurz warten. Keine Spielstrafe.");
  if (code === "CARD_HELD") return t("Zielkarte ist gebunden.");
  if (
    type === "game.react" &&
    (code === "INVALID_REACTION_WINDOW" || code === "REACTION_NOT_ALLOWED")
  )
    return t("Reaktionsfenster bereits verbraucht oder geschlossen.");
  return ack.error?.message ? t(ack.error.message) : t("Aktion abgelehnt.");
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
  t: Translate = (text) => text,
) {
  if (purpose === "transfer") return t("Ausgleichskarte auswählen");
  if (purpose === "reaction") return t("Karte für Reaktion auswählen");
  if (purpose === "swap") return t("Eigene Karte zum Tauschen wählen");
  if (purpose === "effect") {
    if (effect?.kind === "inspect-own") return t("Eigene Karte ansehen");
    if (effect?.kind === "inspect-opponent")
      return t("Gegnerische Karte ansehen");
    return effect?.targets.length
      ? t("Zweite Karte auswählen")
      : t("Erste Karte auswählen");
  }
  return t("Keine Kartenauswahl aktiv");
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
  const { t } = useI18n();
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
      )?.name ?? t("Spieler"),
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
    ? t("Eigene Ausgleichskarte wählen.")
    : game.you.drawnCard
      ? t("Ablage oder eigene Karte antippen.")
      : ownEffect?.phase === "viewing"
        ? t("Offene Karte schließen oder mit anderer Karte reagieren.")
        : ownEffect?.phase === "deciding"
          ? t("Tauschen oder behalten.")
          : ownEffect?.phase === "selecting" && effectSelectionActive
            ? `${effectLabel(ownEffect.kind, t)}: ${selectionPurposeLabel("effect", ownEffect, t)}.`
            : ownEffect?.phase === "selecting" && canReactDirectly
              ? t("Erst reagieren oder rechts die Aktivität ausführen.")
              : game.reactionWindow
                ? t("Passende Karte direkt antippen.")
                : isActive && !hasOpenEffect
                  ? t("Oberste Karte ziehen.")
                  : hasOpenEffect
                    ? t("Offene Aktion zuerst abschließen oder ablehnen.")
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
                {t("An {name}", { name: participant.name })}
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
            {effectSelectionActive
              ? t("Aktivität aktiv")
              : t("Aktivität ausführen")}
          </button>
          <button
            className="secondary"
            disabled={pending || !online}
            onClick={() =>
              send({ type: "game.effect.skip", effectId: ownEffect.id })
            }
          >
            {t("Ansehen überspringen")}
          </button>
        </div>
      ) : ownEffect.phase === "selecting" ? (
        <button
          disabled={pending || !online || effectSelectionActive}
          onClick={() => void activateOwnEffect()}
        >
          {effectSelectionActive
            ? t("Aktivität aktiv")
            : t("Aktivität ausführen")}
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
            {t("Tauschen")}
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
            {t("Behalten")}
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
                ? t("Verbindung unterbrochen")
                : syncing
                  ? t("Synchronisiere …")
                  : t("Online")}
            </span>
            <button
              className="small secondary card-guide-trigger"
              type="button"
              aria-haspopup="dialog"
              aria-label={t("Kartenübersicht öffnen")}
              onClick={() => {
                setLeaveDialogOpen(false);
                setCardGuideOpen(true);
              }}
            >
              <span className="wide-label">{t("Kartenübersicht")}</span>
              <span className="short-label" aria-hidden="true">
                {t("Karten")}
              </span>
            </button>
            <button
              className="small secondary"
              type="button"
              aria-label={t("Hauptmenü öffnen")}
              disabled={pending}
              onClick={() => {
                setCardGuideOpen(false);
                setLeaveDialogOpen(true);
              }}
            >
              <span className="wide-label">{t("Hauptmenü")}</span>
              <span className="short-label" aria-hidden="true">
                {t("Menü")}
              </span>
            </button>
          </div>
        </header>

        {(control === "takeover-required" || control === "revoked") && (
          <section className="interruption-banner" role="status">
            <strong>{t("Spiel in anderem Tab geöffnet")}</strong>
            <p>
              {t(
                "Dieser Tab zeigt den Tisch nur an und kann keine Aktionen senden.",
              )}
            </p>
            <button
              type="button"
              disabled={pending || !networkOnline}
              onClick={onTakeover}
            >
              {t("Steuerung übernehmen")}
            </button>
          </section>
        )}

        {snapshot.interruption.status !== "active" && (
          <section className="interruption-banner" role="alert">
            <strong>
              {snapshot.interruption.status === "aborted"
                ? t("Partie abgebrochen")
                : t("Partie pausiert")}
            </strong>
            {snapshot.interruption.status !== "aborted" && (
              <p>
                {t("Fehlend: {names}.", {
                  names: missingNames.join(", ") || t("niemand"),
                })}
                {snapshot.interruption.status === "decision"
                  ? ` ${t("Die Wiederbeitrittsfrist ist abgelaufen.")}`
                  : ` ${t("Wiederbeitritt ist 90 Sekunden lang möglich.")}`}
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
                    {t("Weitere 90 Sekunden warten")}
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
                    {t("Partie abbrechen")}
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
              hint={initialViewTableHint(
                game.number,
                game.you.initialViewOpen,
                t,
              )}
            />
            {game.you.initialViewOpen ? (
              <button
                disabled={pending || !online}
                onClick={() => send({ type: "game.closeInitialView" })}
              >
                {t("Karten verdecken und schließen")}
              </button>
            ) : (
              <p className="waiting">
                {t("Warte auf {names} …", {
                  names: waitingFor.map((player) => player.name).join(", "),
                })}
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
                {t(
                  "Du bist ausgeschieden. Deine Endpunktzahl beträgt {score}.",
                  {
                    score: viewer?.finalScore ?? 0,
                  },
                )}
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
                  ? `${actionFeedback.text} ${t("gesendet · wartet auf Bestätigung")}`
                  : actionFeedback.text}
              </div>
            )}

            {game.kabuCallerId && (
              <section className="turn-status" aria-live="polite">
                <p className="eyebrow">{t("Kabu-Schlussphase")}</p>
                <strong>
                  {t("{name} hat Kabu angesagt.", {
                    name:
                      snapshot.participants.find(
                        (p) => p.playerId === game.kabuCallerId,
                      )?.name ?? t("Spieler"),
                  })}
                </strong>
                <p>
                  {t("Noch ausstehend: {names}", {
                    names:
                      (game.pendingFinalTurns ?? [])
                        .map(
                          (id) =>
                            snapshot.participants.find((p) => p.playerId === id)
                              ?.name ?? id,
                        )
                        .join(", ") || t("keine"),
                  })}
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
            {t(
              "Vorläufiges Rundenende: Bereits ausgelöste Pflichtaktionen werden noch abgeschlossen.",
            )}
          </p>
        )}

        {message && (
          <p className="notice" role="status">
            {message}
          </p>
        )}
        {import.meta.env.VITE_KABU_TEST_SCENARIOS === "true" && (
          <details className="table-help">
            <summary>
              {t("Entwicklungs-Testszenario laden / zurücksetzen")}
            </summary>
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
        <p className="sequence">
          {t("Raumstand #{value}", { value: snapshot.room.sequence })}
        </p>
      </section>
    </main>
  );
}

export function CardGuideDialog({ onClose }: { onClose: () => void }) {
  const { t } = useI18n();
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
            <p className="eyebrow">{t("Spickzettel")}</p>
            <h2 id="card-guide-title">{t("Kartenübersicht")}</h2>
          </div>
          <button
            ref={closeButtonRef}
            className="card-guide-close"
            type="button"
            aria-label={t("Kartenübersicht schließen")}
            onClick={onClose}
          >
            ×
          </button>
        </header>
        <p id="card-guide-description" className="card-guide-note">
          {t(
            "Aktionen werden nur ausgelöst, wenn du eine frisch gezogene Karte direkt ablegst. Beim Tauschen oder Reagieren lösen Karten keine Aktion aus.",
          )}
        </p>
        <div className="card-guide-columns" aria-hidden="true">
          <span>{t("Karte")}</span>
          <span>{t("Punkte")}</span>
          <span>{t("Aktion")}</span>
        </div>
        <ul className="card-guide-list">
          {cardGuideEntries.map((entry) => (
            <li key={`${entry.rank}-${entry.suits}`}>
              <div
                className={`guide-card${entry.rank.includes("–") ? " grouped" : ""}`}
                aria-label={`${t(entry.rank)} ${entry.suits}`}
              >
                <strong>{t(entry.rank)}</strong>
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
              <span className="card-guide-action">{t(entry.action)}</span>
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
  const { t } = useI18n();
  return (
    <div className="dialog-backdrop" role="presentation">
      <section
        className="confirm-dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="leave-round-title"
        aria-describedby="leave-round-description"
      >
        <p className="eyebrow">{t("Runde verlassen")}</p>
        <h2 id="leave-round-title">{t("Zurück zum Hauptmenü?")}</h2>
        <p id="leave-round-description">
          {t("Bist du sicher, dass du die laufende Runde verlassen möchtest?")}
        </p>
        <div className="dialog-actions">
          <button
            className="secondary"
            type="button"
            disabled={pending}
            autoFocus
            onClick={onCancel}
          >
            {t("In der Runde bleiben")}
          </button>
          <button type="button" disabled={pending} onClick={onConfirm}>
            {pending ? t("Wird verlassen …") : t("Runde verlassen")}
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
  const { t } = useI18n();
  const result = game.completedRounds?.at(-1);
  const participant = (playerId: string) =>
    snapshot.participants.find((item) => item.playerId === playerId)?.name ??
    t("Spieler");
  return (
    <section className="round-result" aria-live="polite">
      <p className="eyebrow">
        {game.phase === "game-over"
          ? t("Partie beendet")
          : t("Runde {round} beendet", { round: game.number })}
      </p>
      <h2>
        {game.phase === "game-over"
          ? t("Gewonnen: {names}", {
              names: (game.winners ?? []).map(participant).join(", "),
            })
          : t("Zwischenstand · {round} von {count}", {
              round: game.number,
              count: game.roundCount ?? snapshot.room.roundCount,
            })}
      </h2>
      <div
        className="score-table"
        role="table"
        aria-label={t("Rundenergebnis und Gesamtstand")}
      >
        {game.players.map((player) => {
          const score = result?.scores.find(
            (candidate) => candidate.playerId === player.playerId,
          );
          return (
            <div className="score-row" role="row" key={player.playerId}>
              <strong>{participant(player.playerId)}</strong>
              {player.eliminated ? (
                <span>
                  {t("Ausgeschieden · Endstand: {score}", {
                    score: player.finalScore ?? 0,
                  })}
                </span>
              ) : score ? (
                <>
                  <span>
                    {t("Kartenpunkte: {score}", { score: score.cardPoints })}
                  </span>
                  <span>
                    {t("Kabu-Strafe: +{score}", {
                      score: score.kabuPenalty,
                    })}
                  </span>
                  <span>
                    {t("Runde: {score}", { score: score.roundPoints })}
                  </span>
                  <span>
                    {t("Gesamt: {score}", {
                      score:
                        game.totalScores?.[player.playerId] ??
                        score.roundPoints,
                    })}
                  </span>
                </>
              ) : (
                <span>
                  {t("Gesamt: {score}", {
                    score: game.totalScores?.[player.playerId] ?? 0,
                  })}
                </span>
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
            <p>{t("Du bist ausgeschieden und schaust nur noch zu.")}</p>
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
                ? t("Bereit – warte auf die anderen")
                : t("Bereit für nächste Runde")}
            </button>
          )}
          <p>
            {t("{ready} von {total} bereit", {
              ready: game.nextRoundReady?.length ?? 0,
              total: game.players.filter((player) => !player.eliminated).length,
            })}
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
  const { t } = useI18n();
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
      {t("Letztes Kabu-Reaktionsfenster: {seconds} s", {
        seconds: (milliseconds / 1_000).toFixed(1),
      })}
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
  const { t } = useI18n();
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (expiresAt === undefined) return;
    const timer = window.setInterval(() => setNow(Date.now()), 100);
    return () => window.clearInterval(timer);
  }, [expiresAt]);
  const milliseconds = Math.max(0, (expiresAt ?? now) - now);
  const progress =
    expiresAt === undefined ? 1 : milliseconds / EFFECT_DURATION_MS;
  return (
    <div
      className="effect-timer-frame"
      style={{ "--effect-angle": `${progress * 360}deg` } as CSSProperties}
      role="timer"
      aria-label={t("{seconds} Sekunden für die Aktivität verbleibend", {
        seconds: Math.ceil(milliseconds / 1_000),
      })}
    >
      {children}
    </div>
  );
}

type TableAction = NonNullable<RoundView["lastAction"]>;

function actionPlayerName(snapshot: LobbySnapshot, playerId: string) {
  return (
    snapshot.participants.find(
      (participant) => participant.playerId === playerId,
    )?.name ?? "Spieler"
  );
}

export function tableActionAnnouncement(
  action: TableAction | undefined,
  snapshot: LobbySnapshot,
  t: Translate = (text) => text,
  revealReason?: "wrong-card" | "too-late",
) {
  if (!action) return undefined;
  const actor = actionPlayerName(snapshot, action.actorPlayerId);
  if (action.kind === "draw")
    return t("{name} zieht eine Karte.", { name: actor });
  if (action.kind === "discard-drawn")
    return t("{name} legt die gezogene Karte ab.", { name: actor });
  if (action.kind === "swap-drawn")
    return t("{name} tauscht die gezogene Karte.", { name: actor });
  if (action.kind === "inspect")
    return t("{name} hält eine Karte zum Ansehen.", { name: actor });
  if (action.kind === "keep")
    return t("{name} legt die angesehenen Karten zurück.", { name: actor });
  if (action.kind === "ability-swap")
    return t("{name} tauscht zwei Karten.", { name: actor });
  if (action.kind === "reaction") {
    const owner = actionPlayerName(snapshot, action.source.playerId);
    return action.source.playerId === action.actorPlayerId
      ? t("{name} reagiert mit einer eigenen Karte.", { name: actor })
      : t("{name} reagiert auf {owner}s Karte.", { name: actor, owner });
  }
  if (action.kind === "transfer") {
    const recipient = actionPlayerName(snapshot, action.target.playerId);
    return t("{name} gibt {recipient} die Ausgleichskarte.", {
      name: actor,
      recipient,
    });
  }
  if (action.kind === "penalty" && revealReason === "wrong-card")
    return t(
      "{name} deckt eine falsche Karte auf und erhält eine Strafkarte.",
      {
        name: actor,
      },
    );
  if (action.kind === "penalty" && revealReason === "too-late")
    return t("{name} reagiert zu spät und erhält eine Strafkarte.", {
      name: actor,
    });
  if (action.kind === "penalty")
    return t("{name} erhält eine verdeckte Strafkarte.", { name: actor });
  if (action.kind === "add-card")
    return t("{name} gibt {recipient} eine verdeckte Zusatzkarte.", {
      name: actor,
      recipient: actionPlayerName(snapshot, action.targetPlayerId),
    });
  return undefined;
}

function useTableMotion(
  game: RoundView,
  online: boolean,
  tableRef: RefObject<HTMLElement | null>,
) {
  const previousRects = useRef(new Map<string, DOMRect>());
  const previousActionId = useRef<string | undefined>(undefined);

  useLayoutEffect(() => {
    const root = tableRef.current;
    if (!root) return;
    const current = new Map<string, DOMRect>();
    root.querySelectorAll<HTMLElement>("[data-motion-id]").forEach((node) => {
      const id = node.dataset.motionId;
      if (id) current.set(id, node.getBoundingClientRect());
    });
    const action = game.lastAction;
    const reduced = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    const old = previousRects.current;
    const shouldAnimate =
      online &&
      action &&
      action.id !== previousActionId.current &&
      old.size > 0;
    const visible = (rect: DOMRect) =>
      rect.bottom > 0 &&
      rect.right > 0 &&
      rect.top < innerHeight &&
      rect.left < innerWidth;
    const highlight = (id: string, duration = CARD_HIGHLIGHT_DURATION_MS) => {
      const node = root.querySelector<HTMLElement>(
        `[data-motion-id="${CSS.escape(id)}"]`,
      );
      node?.animate?.(
        [
          { outline: "3px solid rgba(240, 198, 93, .85)" },
          { outline: "3px solid rgba(240, 198, 93, 0)" },
        ],
        {
          duration: reduced ? 90 : duration,
          easing: "ease-out",
        },
      );
    };
    const move = (
      fromId: string,
      toId: string,
      options: { delay?: number; duration?: number; arc?: number } = {},
    ) => {
      const from = old.get(fromId) ?? current.get(fromId);
      const to = current.get(toId) ?? old.get(toId);
      if (!from || !to || reduced || !visible(from) || !visible(to)) {
        highlight(toId);
        return;
      }
      const copy = document.createElement("div");
      copy.className = "card-motion-copy";
      copy.setAttribute("aria-hidden", "true");
      Object.assign(copy.style, {
        left: `${from.left}px`,
        top: `${from.top}px`,
        width: `${Math.min(from.width, to.width)}px`,
        height: `${Math.min(from.height, to.height)}px`,
      });
      document.body.append(copy);
      const animation = copy.animate(
        [
          { transform: "translate3d(0, 0, 0)", opacity: 0.94 },
          ...(options.arc
            ? [
                {
                  transform: `translate3d(${(to.left - from.left) / 2}px, ${(to.top - from.top) / 2 + options.arc}px, 0) scale(1.06)`,
                  opacity: 1,
                },
              ]
            : []),
          {
            transform: `translate3d(${to.left - from.left}px, ${to.top - from.top}px, 0)`,
            opacity: 1,
          },
        ],
        {
          duration: options.duration ?? CARD_MOVE_DURATION_MS,
          delay: options.delay ?? 0,
          easing: "cubic-bezier(.2,.75,.25,1)",
          fill: "forwards",
        },
      );
      animation.finished
        .finally(() => copy.remove())
        .catch(() => copy.remove());
    };

    if (shouldAnimate) {
      const actor = action.actorPlayerId;
      const newestPosition = (playerId: string) =>
        [...current.keys()].find((id) => {
          if (!id.startsWith("position:") || old.has(id)) return false;
          return Boolean(
            root
              .querySelector(`[data-motion-id="${CSS.escape(id)}"]`)
              ?.closest(`[data-player-id="${CSS.escape(playerId)}"]`),
          );
        });
      if (action.kind === "draw")
        move(
          "draw-pile",
          current.has(`drawn:${actor}`) ? `drawn:${actor}` : `player:${actor}`,
        );
      else if (action.kind === "discard-drawn")
        move(
          old.has(`drawn:${actor}`) ? `drawn:${actor}` : `player:${actor}`,
          "discard",
        );
      else if (action.kind === "swap-drawn") {
        highlight(
          `position:${action.source.positionId}`,
          CARD_SWAP_HIGHLIGHT_MS,
        );
        move(`position:${action.source.positionId}`, "discard", {
          duration: CARD_SWAP_DURATION_MS,
        });
        move(
          old.has(`drawn:${actor}`) ? `drawn:${actor}` : `player:${actor}`,
          `position:${action.source.positionId}`,
          {
            delay: CARD_MOVE_STAGGER_MS * 2,
            duration: CARD_SWAP_DURATION_MS,
          },
        );
      } else if (action.kind === "ability-swap") {
        highlight(
          `position:${action.source.positionId}`,
          ABILITY_SWAP_PREVIEW_MS + ABILITY_SWAP_DURATION_MS,
        );
        highlight(
          `position:${action.target.positionId}`,
          ABILITY_SWAP_PREVIEW_MS + ABILITY_SWAP_DURATION_MS,
        );
        move(
          `position:${action.source.positionId}`,
          `position:${action.target.positionId}`,
          {
            delay: ABILITY_SWAP_PREVIEW_MS,
            duration: ABILITY_SWAP_DURATION_MS,
            arc: -22,
          },
        );
        move(
          `position:${action.target.positionId}`,
          `position:${action.source.positionId}`,
          {
            delay: ABILITY_SWAP_PREVIEW_MS + CARD_MOVE_STAGGER_MS,
            duration: ABILITY_SWAP_DURATION_MS,
            arc: 22,
          },
        );
      } else if (action.kind === "reaction")
        move(`position:${action.source.positionId}`, "discard");
      else if (action.kind === "transfer")
        move(
          `position:${action.source.positionId}`,
          `position:${action.target.positionId}`,
        );
      else if (action.kind === "penalty") {
        highlight(`position:${action.source.positionId}`);
        move("draw-pile", newestPosition(actor) ?? `player:${actor}`);
      } else if (action.kind === "add-card")
        move(
          "draw-pile",
          newestPosition(action.targetPlayerId) ??
            `player:${action.targetPlayerId}`,
        );
      else if (action.kind === "inspect")
        highlight(`position:${action.source.positionId}`);
      else if (action.kind === "keep")
        action.targets.forEach((target) =>
          highlight(`position:${target.positionId}`),
        );
    }

    previousRects.current = current;
    previousActionId.current = action?.id;
  }, [game, online, tableRef]);
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
  const { t } = useI18n();
  const tableRef = useRef<HTMLElement>(null);
  useTableMotion(game, online, tableRef);
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
        data-motion-id={`player:${player.playerId}`}
        key={player.playerId}
        aria-label={`${t("Kartenfeld von {name}", { name: participant?.name ?? t("Spieler") })}${activePlayer ? `, ${t("aktiver Spieler")}` : ""}`}
      >
        <header>
          <strong>
            <span
              className={`active-turn-marker${activePlayer ? " visible" : ""}`}
              aria-hidden="true"
            >
              ▶
            </span>
            {participant?.name ?? t("Spieler")}
            {own ? ` (${t("du")})` : ""}
          </strong>
          {player.eliminated && (
            <span>
              {t("Ausgeschieden · {score} Punkte", {
                score: player.finalScore ?? 0,
              })}
            </span>
          )}
        </header>
        {player.eliminated ? (
          <p
            className="eliminated-seat"
            aria-label={t("Spieler ausgeschieden")}
          >
            {t("Ausgeschieden")}
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
                  ownerName={`${participant?.name ?? t("Spieler")}${own ? ` (${t("du")})` : ""}`}
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
            {activePlayer && game.turn.phase === "awaiting-decision" && (
              <div
                className={`drawn-card-slot occupied${own ? " private" : " public"}`}
                data-motion-id={`drawn:${player.playerId}`}
                aria-label={t("{name} hält die gezogene Karte", {
                  name: participant?.name ?? t("Spieler"),
                })}
              >
                {own && drawnCard ? (
                  <CardFace card={drawnCard} />
                ) : (
                  <span className="card-back" aria-hidden="true">
                    ♦
                  </span>
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
      ref={tableRef}
      className={`game-table players-${game.players.length}`}
      aria-label={t("Spieltisch")}
      style={tableStyle}
    >
      <div
        className={`opponent-fields opponents-${opponents.length}`}
        aria-label={t("Mitspieler in Zugreihenfolge")}
      >
        {opponents.map((player) => field(player, false))}
      </div>
      <div className="table-center" aria-label={t("Tischmitte")}>
        <div className={`table-piles${centerAction ? " has-action" : ""}`}>
          <div className="pile-hint-slot">
            {game.lastAction && (
              <p
                className="table-action-announcement"
                role="status"
                aria-live="polite"
              >
                {tableActionAnnouncement(
                  game.lastAction,
                  snapshot,
                  t,
                  game.publicReveals?.at(-1)?.reason,
                )}
              </p>
            )}
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
              data-motion-id="draw-pile"
              onClick={onDraw}
              aria-label={
                isActive && game.turn.phase === "awaiting-draw"
                  ? t("Oberste Karte ziehen, {count} Karten übrig", {
                      count: game.drawPileCount,
                    })
                  : t("Nachziehstapel, {count} Karten übrig", {
                      count: game.drawPileCount,
                    })
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
            data-motion-id="discard"
            aria-label={
              drawnCard
                ? t("Gezogene Karte auf den Ablagestapel legen")
                : game.discardTop
                  ? t("Ablagestapel")
                  : t("Ablagestapel leer")
            }
            disabled={!drawnCard || pending || !online}
            onClick={onDiscardDrawn}
          >
            {game.discardTop ? (
              <CardFace card={game.discardTop} />
            ) : (
              <span className="empty-discard">{t("Leer")}</span>
            )}
          </button>
          <div className="pile-action-slot" aria-live="polite">
            {centerAction}
          </div>
        </div>
        <div className="reaction-status" role="status">
          {!game.reactionWindow
            ? t("Reaktionsfenster: keines")
            : game.reactionWindow.status === "open"
              ? t("Reaktionsfenster offen · Rang {rank}", {
                  rank: t(
                    rankLabels[game.reactionWindow.rank] ??
                      game.reactionWindow.rank,
                  ),
                })
              : t(
                  "Reaktionsfenster verbraucht · Rang {rank} · weitere Versuche geben eine Strafkarte",
                  {
                    rank: t(
                      rankLabels[game.reactionWindow.rank] ??
                        game.reactionWindow.rank,
                    ),
                  },
                )}
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
  const { t } = useI18n();
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
            const rowLabel = row === "near" ? t("Nahe") : t("Ferne");
            return (
              <button
                type="button"
                className={`field-position ${position.card || privateCard ? "revealed" : ""}${privateCard ? " private-reveal" : ""}${position.held ? " held" : ""}${markSelectable && selectable(position) ? " swap-option" : ""}`}
                disabled={!privateCard && !selectable(position)}
                onClick={() => {
                  if (privateCard && onClosePrivateView) {
                    onClosePrivateView();
                    return;
                  }
                  onSelect?.(position.id, position.occupancyVersion);
                }}
                key={position.id}
                aria-label={`${!position.card && !privateCard ? t("Verdeckte Karte") : t("Aufgedeckte Karte")} ${t("von")} ${ownerName}, ${rowLabel.toLowerCase()} ${position.column + 1}${position.held ? `, ${t("gebunden")}` : ""}${reveal ? (reveal.reason === "too-late" ? `, ${t("zu spät – Strafkarte erhalten")}` : `, ${t("falsche Karte – Strafkarte erhalten")}`) : ""}${privateCard && onClosePrivateView ? `, ${t("zum Schließen antippen")}` : selectable(position) ? `, ${t("auswählen")}` : ""}`}
                data-position-id={position.id}
                data-occupancy-version={position.occupancyVersion}
                style={{
                  gridColumn: visualColumn.get(position.column),
                  gridRow: visualRow.get(row),
                }}
                data-motion-id={`position:${position.id}`}
              >
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
  const { t } = useI18n();
  const red = card.suit === "hearts" || card.suit === "diamonds";
  return (
    <span className={`card-face ${red ? "red" : "black"}`}>
      <strong>{t(rankLabels[card.rank] ?? card.rank)}</strong>
      <span>{suitLabels[card.suit]}</span>
      <small>{t("{value} Punkte", { value: card.value })}</small>
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
  const { t } = useI18n();
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 100);
    return () => window.clearInterval(timer);
  }, [expiresAt]);
  const progress = Math.max(
    0,
    Math.min(1, (expiresAt - now) / EFFECT_DURATION_MS),
  );
  return (
    <span
      className="timed-reveal"
      style={{ "--reveal-angle": `${progress * 360}deg` } as CSSProperties}
      role="timer"
      aria-label={t("{seconds} Sekunden verbleibend", {
        seconds: Math.ceil(Math.max(0, expiresAt - now) / 1_000),
      })}
    >
      <CardFace card={card} />
    </span>
  );
}
