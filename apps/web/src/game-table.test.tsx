import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { LobbySnapshot, RoundView } from "@kabu/protocol";

import {
  CardGuideDialog,
  EffectTimerFrame,
  GameTable,
  LeaveRoundDialog,
  RoundResultPanel,
  canSelectReactionTarget,
  cyclicPlayersForViewer,
  createCommandGate,
  feedbackForRejection,
  initialViewTableHint,
  selectionPurpose,
  stableFieldAnchorOffset,
  tableActionAnnouncement,
  visualColumnOrder,
} from "./App";

const playerId = (seat: number) =>
  `00000000-0000-4000-8000-${String(seat).padStart(12, "0")}`;

function game(playerCount: number): RoundView {
  return {
    id: "round-1",
    number: 1,
    phase: "playing",
    startingPlayerId: playerId(0),
    activePlayerId: playerId(1 % playerCount),
    drawPileCount: 52 - playerCount * 4,
    turn: { id: "turn-1", number: 1, phase: "awaiting-draw" },
    players: Array.from({ length: playerCount }, (_, seat) => ({
      playerId: playerId(seat),
      seat,
      initialViewClosed: true,
      positions: (["near", "far"] as const).flatMap((row) =>
        [0, 1].map((column) => ({
          id: `${playerId(seat)}:${row}:${column}`,
          row,
          column,
          occupied: true,
          occupancyVersion: 1,
        })),
      ),
    })),
    you: { initialViewOpen: false },
  };
}

function snapshot(round: RoundView, viewerSeat = 0): LobbySnapshot {
  return {
    room: {
      code: "ABC234",
      status: "started",
      roundCount: 10,
      sequence: 7,
    },
    you: { playerId: playerId(viewerSeat), seat: viewerSeat, isHost: false },
    interruption: {
      status: "active",
      missingPlayerIds: [],
      pausedAt: null,
      reconnectDeadline: null,
    },
    participants: round.players.map((player) => ({
      playerId: player.playerId,
      name: `P${player.seat}`,
      seat: player.seat,
      ready: true,
      connected: true,
      isHost: player.seat === 0,
    })),
    game: round,
  };
}

function renderTable(round: RoundView, viewerSeat = 0) {
  return renderToStaticMarkup(
    <GameTable
      snapshot={snapshot(round, viewerSeat)}
      game={round}
      online
      pending={false}
      onDraw={() => undefined}
    />,
  );
}

describe("shared game table", () => {
  it("describes a foreign reaction with actor and field owner but no card value", () => {
    const round = game(2);
    round.lastAction = {
      id: "reaction-1:reaction:position:1",
      kind: "reaction",
      actorPlayerId: playerId(0),
      source: {
        playerId: playerId(1),
        positionId: round.players[1]!.positions[0]!.id,
        occupancyVersion: 1,
      },
    };
    const message = tableActionAnnouncement(
      round.lastAction,
      snapshot(round),
      (text, values) =>
        Object.entries(values ?? {}).reduce(
          (result, [key, value]) => result.replace(`{${key}}`, String(value)),
          text,
        ),
    );
    expect(message).toBe("P0 reagiert auf P1s Karte.");
    expect(message).not.toMatch(/Herz|Karo|Pik|Kreuz|König|Dame/u);
  });

  for (const count of [2, 3, 6]) {
    it(`renders all fields and the common center for ${count} players`, () => {
      const markup = renderTable(game(count));
      expect(markup.match(/data-player-id=/gu)).toHaveLength(count);
      expect(markup).toContain("Nachziehstapel");
      expect(markup).not.toContain("<span>Nachziehstapel</span>");
      expect(markup).toContain("stack-card-top");
      expect(markup).toContain("Ablagestapel leer");
      expect(markup).toContain("Reaktionsfenster: keines");
    });
  }

  it("keeps cyclic seat order and places the viewer last/bottom", () => {
    const round = game(6);
    const order = cyclicPlayersForViewer(round.players, playerId(3));
    expect(order.map((player) => player.seat)).toEqual([4, 5, 0, 1, 2, 3]);

    const markup = renderTable(round, 3);
    const offsets = order.map((player) =>
      markup.indexOf(`data-player-id="${player.playerId}"`),
    );
    expect(offsets).toEqual(
      [...offsets].toSorted((left, right) => left - right),
    );
    expect(markup.indexOf("own-table-field")).toBeLessThan(offsets.at(-1)!);
  });

  it("explains that a consumed window still accepts penalized attempts", () => {
    const round = game(2);
    round.reactionWindow = {
      id: "reaction-1",
      rank: "5",
      status: "consumed",
    };
    expect(renderTable(round)).toContain(
      "weitere Versuche geben eine Strafkarte",
    );
  });

  it("places a timed activity control to the right of both piles", () => {
    const round = game(2);
    const markup = renderToStaticMarkup(
      <GameTable
        snapshot={snapshot(round)}
        game={round}
        online
        pending={false}
        onDraw={() => undefined}
        centerAction={
          <EffectTimerFrame expiresAt={Date.now() + 10_000}>
            <button>Ansehen überspringen</button>
          </EffectTimerFrame>
        }
      />,
    );
    expect(markup).toContain("table-piles has-action");
    expect(markup).toContain('class="effect-timer-frame"');
    expect(markup).toContain("--effect-angle:");
    expect(markup.indexOf("discard-pile")).toBeLessThan(
      markup.indexOf("Ansehen überspringen"),
    );
  });

  it("disables drawing while any card action is still open", () => {
    const round = game(2);
    round.activePlayerId = playerId(0);
    round.effects = [
      {
        id: "effect-1",
        ownerPlayerId: playerId(1),
        kind: "inspect-own",
        phase: "selecting",
        targets: [],
        expiresAt: Date.now() + 10_000,
      },
    ];

    const markup = renderTable(round);
    expect(markup).toMatch(/<button class="draw-pile" disabled=""/u);
  });

  it("keeps empty positions as fixed placeholders in the card grid", () => {
    const round = game(3);
    const opponent = round.players[1]!;
    opponent.positions[0]!.occupied = false;
    opponent.positions.push({
      id: `${opponent.playerId}:near:2`,
      row: "near",
      column: 2,
      occupied: true,
      occupancyVersion: 1,
      held: true,
    });
    const own = round.players[0]!;
    own.positions[0]!.card = {
      suit: "hearts",
      rank: "king",
      value: 0,
    };

    const markup = renderTable(round);
    expect(markup).not.toContain("position-marker");
    expect(markup).not.toContain("field-status-note");
    expect(markup).toContain('class="field-position empty-position"');
    expect(markup).not.toContain("Karte abgelegt");
    expect(markup).toContain("Hier lag eine Karte.");
    expect(markup).toContain(opponent.positions[0]!.id);
    expect(markup).toContain(`${opponent.playerId}:near:2`);
    expect(markup).toContain("grid-row:1");
    expect(markup).toContain("grid-row:2");
    expect(markup.match(/class="card-back"/gu)?.length).toBe(11);
    expect(markup.match(/0 Punkte/gu)).toHaveLength(1);
    expect(markup).not.toContain("spades");
    expect(markup).not.toContain("clubs");
  });

  it("always renders all four original slots when every card is gone", () => {
    const round = game(2);
    const own = round.players[0]!;
    own.positions.forEach((position) => {
      position.occupied = false;
    });

    const markup = renderTable(round);
    const ownField = markup.slice(
      markup.indexOf(`data-player-id="${own.playerId}"`),
    );
    expect(
      ownField.match(/class="field-position empty-position"/gu),
    ).toHaveLength(4);
    expect(ownField).toContain(
      "grid-template-columns:repeat(2, var(--card-width))",
    );
  });

  it("passes opponent positions through the same validated target callback", () => {
    const round = game(2);
    const chosen: string[] = [];
    const opponent = round.players[1]!;
    const markup = renderToStaticMarkup(
      <GameTable
        snapshot={snapshot(round)}
        game={round}
        online
        pending={false}
        onDraw={() => undefined}
        isPositionSelectable={(ownerId) => ownerId === opponent.playerId}
        onPositionSelect={(ownerId, positionId, occupancyVersion) =>
          chosen.push(`${ownerId}:${positionId}:${occupancyVersion}`)
        }
      />,
    );

    expect(markup).toContain("Verdeckte Karte von P1, nahe 1, auswählen");
    expect(markup).toContain(`data-occupancy-version="1"`);
    expect(chosen).toEqual([]);
  });

  it("keeps a grown field in exactly two complete stable rows", () => {
    const round = game(6);
    const own = round.players[0]!;
    own.positions.push(
      ...[2, 3].flatMap((column) =>
        (["near", "far"] as const).map((row) => ({
          id: `${own.playerId}:${row}:${column}`,
          row,
          column,
          occupied: true,
          occupancyVersion: 1,
        })),
      ),
    );
    const markup = renderTable(round);
    expect(markup).not.toContain("Feld vergrößern");
    expect(markup.match(/data-player-id=/gu)).toHaveLength(6);
    expect(markup).toContain(
      "grid-template-columns:repeat(4, var(--card-width))",
    );
    expect(markup).toContain("table-player own expanded");
    expect(markup).toContain("--card-width:");
    expect(markup).not.toContain("card-row");
  });

  it("shrinks an eight-card opposite field without changing its seat", () => {
    const round = game(3);
    const opponent = round.players[1]!;
    opponent.positions.push(
      ...[2, 3].flatMap((column) =>
        (["near", "far"] as const).map((row) => ({
          id: `${opponent.playerId}:${row}:${column}`,
          row,
          column,
          occupied: true,
          occupancyVersion: 1,
        })),
      ),
    );

    const markup = renderTable(round);
    expect(markup).toContain("opponent-fields opponents-2");
    expect(markup).toContain("--card-width:43px");
    expect(markup).not.toContain("--opponent-card-width");
    expect(markup).toContain(
      "grid-template-columns:repeat(4, var(--card-width))",
    );
  });

  it("keeps three four-column opponent fields in one stable row", () => {
    const round = game(4);
    for (const player of round.players) {
      player.positions.push(
        ...[2, 3].flatMap((column) =>
          (["near", "far"] as const).map((row) => ({
            id: `${player.playerId}:${row}:${column}`,
            row,
            column,
            occupied: true,
            occupancyVersion: 1,
          })),
        ),
      );
    }

    const markup = renderTable(round);
    const opponents = markup.slice(
      markup.indexOf('class="opponent-fields opponents-3"'),
      markup.indexOf('class="table-center"'),
    );
    expect(markup).toContain("--opponent-columns:3");
    expect(markup).toContain("--card-width:28px");
    expect(markup).not.toContain("--opponent-card-width");
    expect(
      opponents.match(/class="table-player(?: active)? expanded"/gu),
    ).toHaveLength(3);
    expect(opponents.match(/repeat\(4, var\(--card-width\)\)/gu)).toHaveLength(
      3,
    );
  });

  it("keeps an eliminated player at the same seat without actionable cards", () => {
    const round = game(3);
    const eliminated = round.players[1]!;
    round.activePlayerId = round.players[2]!.playerId;
    eliminated.eliminated = true;
    eliminated.finalScore = 64;
    eliminated.positions = [];

    const markup = renderTable(round);
    expect(markup).toContain('class="table-player eliminated"');
    expect(markup).toContain("Ausgeschieden · 64 Punkte");
    expect(markup).toContain('data-seat="1"');
    expect(markup.match(/data-player-id=/gu)).toHaveLength(3);
  });

  it("adds full columns alternating right and left without moving anchors", () => {
    expect(visualColumnOrder([0, 1])).toEqual([0, 1]);
    expect(visualColumnOrder([0, 1, 2])).toEqual([0, 1, 2]);
    expect(visualColumnOrder([0, 1, 2, 3])).toEqual([3, 0, 1, 2]);
    expect(visualColumnOrder([0, 1, 2, 3, 4, 5])).toEqual([5, 3, 0, 1, 2, 4]);
    expect(stableFieldAnchorOffset([0, 1], 62)).toBe(0);
    expect(stableFieldAnchorOffset([0, 1, 2], 62)).toBe(31);
    expect(stableFieldAnchorOffset([0, 1, 2, 3], 62)).toBe(0);
    expect(stableFieldAnchorOffset([0, 1, 2, 3, 4], 62)).toBe(31);
  });

  it("keeps the four start cards anchored when a penalty card is added", () => {
    const round = game(2);
    const own = round.players[0]!;
    const initialMarkup = renderTable(round);
    own.positions.push({
      id: `${own.playerId}:near:2`,
      row: "near",
      column: 2,
      occupied: true,
      occupancyVersion: 1,
    });

    const markup = renderTable(round);
    expect(initialMarkup).toContain("--card-width:52px");
    expect(markup).toContain("--card-width:52px");
    expect(markup).toContain("transform:translateX(27px)");
    expect(markup).toContain("--card-gap:2px");
  });

  it("keeps an opponent anchor and the shared card size when a column is added", () => {
    const round = game(3);
    const opponent = round.players[1]!;
    const initialMarkup = renderTable(round);
    opponent.positions.push({
      id: `${opponent.playerId}:near:2`,
      row: "near",
      column: 2,
      occupied: true,
      occupancyVersion: 1,
    });

    const markup = renderTable(round);
    const opponentField = markup.slice(
      markup.indexOf(`data-player-id="${opponent.playerId}"`),
      markup.indexOf(`data-player-id="${round.players[2]!.playerId}"`),
    );
    expect(initialMarkup).toContain("--card-width:43px");
    expect(markup).toContain("--card-width:43px");
    expect(opponentField).toContain("transform:translateX(22.5px)");
    expect(markup.match(/--card-width:/gu)).toHaveLength(1);
  });

  it("keeps empty start slots as visible anchors for the remaining cards", () => {
    const round = game(2);
    const own = round.players[0]!;
    for (const position of own.positions) {
      position.occupied = position.row === "near" && position.column === 0;
    }

    const markup = renderTable(round);
    const ownField = markup.slice(markup.indexOf('class="table-player own'));
    expect(ownField).toContain(
      "grid-template-columns:repeat(2, var(--card-width))",
    );
    expect(ownField).toContain(
      `data-position-id="${own.playerId}:near:0" data-occupancy-version="1" style="grid-column:1;grid-row:2"`,
    );
    expect(ownField).toContain(`${own.playerId}:far:0`);
    expect(ownField).toContain(`${own.playerId}:far:1`);
    expect(ownField).toContain(`${own.playerId}:near:1`);
    expect(
      ownField.match(/class="field-position empty-position"/gu),
    ).toHaveLength(3);
    expect(ownField).not.toContain("Karte abgelegt");
  });

  it("marks the active player visually without written turn labels", () => {
    const markup = renderTable(game(3));
    expect(markup.match(/active-turn-marker/gu)).toHaveLength(3);
    expect(markup.match(/active-turn-marker visible/gu)).toHaveLength(1);
    expect(markup).toContain("aktiver Spieler");
    expect(markup).not.toContain("Am Zug");
    expect(markup).not.toContain("Wartet");
    expect(markup).not.toMatch(/>4 Karten?<\/span>/u);
    expect(markup).toContain("opponents-2");
  });

  it("marks own swap targets and places the compact Kabu action below them", () => {
    const round = game(2);
    round.activePlayerId = playerId(0);
    round.turn.phase = "awaiting-decision";
    const markup = renderToStaticMarkup(
      <GameTable
        snapshot={snapshot(round)}
        game={round}
        online
        pending={false}
        onDraw={() => undefined}
        markSwapOptions
        kabuAction={{ disabled: false, onClick: () => undefined }}
        isPositionSelectable={(ownerId) => ownerId === playerId(0)}
      />,
    );
    expect(markup.match(/swap-option/gu)).toHaveLength(4);
    expect(markup).toContain('class="kabu-action"');
    expect(markup.indexOf("player-field-row")).toBeLessThan(
      markup.indexOf("kabu-action"),
    );
  });

  it("renders the compact action hint beside the piles", () => {
    const round = game(2);
    const markup = renderToStaticMarkup(
      <GameTable
        snapshot={snapshot(round)}
        game={round}
        online
        pending={false}
        onDraw={() => undefined}
        hint="Oberste Karte ziehen."
      />,
    );
    expect(markup).toContain('class="table-piles"');
    expect(markup).toContain('class="pile-hint-slot"');
    expect(markup).toContain('class="pile-hint"');
    expect(markup).toContain("Oberste Karte ziehen.");
    expect(markup.indexOf('class="pile-hint-slot"')).toBeLessThan(
      markup.indexOf('class="pile-area"'),
    );
  });

  it("keeps the hint slot and pile order stable without a recommendation", () => {
    const markup = renderTable(game(2));
    const hint = markup.indexOf('class="pile-hint-slot"');
    const drawPile = markup.indexOf('class="pile-area"');
    const discardPile = markup.indexOf('class="discard-pile empty"');

    expect(hint).toBeGreaterThan(-1);
    expect(hint).toBeLessThan(drawPile);
    expect(drawPile).toBeLessThan(discardPile);
  });

  it("describes the round and next step beside the piles during setup", () => {
    expect(initialViewTableHint(3, true)).toBe(
      "Runde 3 · Zwei nahe Karten ansehen und merken.",
    );
    expect(initialViewTableHint(3, false)).toBe(
      "Runde 3 · Startansicht geschlossen. Auf Mitspieler warten.",
    );
  });

  it("keeps the own cards centered inside their border and shows a drawn card separately", () => {
    const round = game(2);
    const markupWithoutDrawnCard = renderTable(round);
    round.you.drawnCard = { suit: "hearts", rank: "7", value: 7 };
    round.turn.phase = "awaiting-decision";
    round.activePlayerId = playerId(0);
    round.lastAction = {
      id: "turn-1",
      kind: "draw",
      actorPlayerId: playerId(0),
    };
    const markup = renderToStaticMarkup(
      <GameTable
        snapshot={snapshot(round)}
        game={round}
        online
        pending={false}
        onDraw={() => undefined}
        drawnCard={round.you.drawnCard}
        onDiscardDrawn={() => undefined}
      />,
    );
    expect(markupWithoutDrawnCard).toContain('class="drawn-card-slot"');
    expect(markupWithoutDrawnCard).not.toContain(
      'class="drawn-card-slot occupied',
    );
    expect(markup).toContain('class="drawn-card-slot occupied private"');
    expect(markup).toContain('class="own-card-field"');
    expect(markup).toContain("P0 hält die gezogene Karte");
    expect(markup).not.toContain("drawn-card-label");
    expect(markup.indexOf('class="own-card-field"')).toBeLessThan(
      markup.indexOf('class="drawn-card-slot occupied private"'),
    );
    expect(markupWithoutDrawnCard.match(/--card-width:\d+px/u)?.[0]).toBe(
      markup.match(/--card-width:\d+px/u)?.[0],
    );
    expect(markup).toContain("Gezogene Karte auf den Ablagestapel legen");
    expect(markup).not.toContain("Gezogene Karte direkt ablegen");
  });

  it("shows an opponent holding a drawn card beside their field without revealing it", () => {
    const round = game(2);
    round.turn.phase = "awaiting-decision";
    round.activePlayerId = playerId(1);
    round.lastAction = {
      id: "turn-1",
      kind: "draw",
      actorPlayerId: playerId(1),
    };

    const markup = renderTable(round);
    const opponent = markup.slice(
      markup.indexOf(`data-player-id="${playerId(1)}"`),
      markup.indexOf('class="table-center"'),
    );
    expect(opponent).toContain('class="drawn-card-slot occupied public"');
    expect(opponent).toContain("P1 hält die gezogene Karte");
    expect(opponent).not.toContain("drawn-card-label");
    expect(opponent).toContain('class="card-back"');
    expect(opponent).not.toContain('class="card-face');
  });

  it("reveals a private effect card at its stable table position with a ring timer", () => {
    const round = game(2);
    const position = round.players[1]!.positions[0]!;
    round.you.privateEffect = {
      effectId: "effect-1",
      expiresAt: Date.now() + 10_000,
      cards: [
        {
          target: {
            playerId: round.players[1]!.playerId,
            positionId: position.id,
            occupancyVersion: position.occupancyVersion,
          },
          card: { suit: "clubs", rank: "9", value: 9 },
        },
      ],
    };
    const markup = renderToStaticMarkup(
      <GameTable
        snapshot={snapshot(round)}
        game={round}
        online
        pending={false}
        onDraw={() => undefined}
        privateEffect={round.you.privateEffect}
        onClosePrivateView={() => undefined}
      />,
    );
    expect(markup).toContain('class="timed-reveal"');
    expect(markup).toContain("--reveal-angle:");
    expect(markup).toContain("zum Schließen antippen");
  });

  it("labels hidden cards without leaking values and public failures explicitly", () => {
    const round = game(2);
    const target = round.players[1]!.positions[0]!;
    const reveal: NonNullable<RoundView["publicReveals"]>[number] = {
      id: "reveal-1",
      target: {
        playerId: round.players[1]!.playerId,
        positionId: target.id,
        occupancyVersion: target.occupancyVersion,
      },
      card: { suit: "clubs", rank: "5", value: 5 },
      expiresAt: Date.now() + 2_500,
      reason: "wrong-card",
    };
    round.publicReveals = [reveal];
    round.lastAction = {
      id: "reaction-1:penalty",
      kind: "penalty",
      actorPlayerId: playerId(0),
      source: reveal.target,
    };
    target.card = reveal.card;
    const markup = renderTable(round);
    expect(markup).toContain("falsche Karte – Strafkarte erhalten");
    expect(markup).toContain(
      "P0 deckt eine falsche Karte auf und erhält eine Strafkarte.",
    );
    expect(markup).not.toContain("reveal-marker");
    expect(markup).not.toContain("field-status-note");
    expect(renderTable(game(2))).not.toMatch(
      /aria-label="[^"]*(clubs|5 Punkte)/u,
    );
  });
});

describe("leaving a round", () => {
  it("asks for confirmation before returning to the main menu", () => {
    const markup = renderToStaticMarkup(
      <LeaveRoundDialog
        pending={false}
        onCancel={() => undefined}
        onConfirm={() => undefined}
      />,
    );

    expect(markup).toContain('role="alertdialog"');
    expect(markup).toContain("Zurück zum Hauptmenü?");
    expect(markup).toContain("In der Runde bleiben");
    expect(markup).toContain("Runde verlassen");
  });
});

describe("card guide", () => {
  it("shows points and actions for all color-dependent card variants", () => {
    const markup = renderToStaticMarkup(
      <CardGuideDialog onClose={() => undefined} />,
    );

    expect(markup).toContain('role="dialog"');
    expect(markup).toContain("Kartenübersicht schließen");
    expect(markup).toContain("Nächsten Spieler aussetzen lassen");
    expect(markup).toContain("Eine eigene Karte ansehen");
    expect(markup).toContain("Eine gegnerische Karte ansehen");
    expect(markup).toContain(
      "Zwei Karten verschiedener Spieler blind tauschen",
    );
    expect(markup).toContain("Einem Spieler eine verdeckte Karte geben");
    expect(markup).toContain(">Punkte<");
    expect(markup).toContain('class="card-guide-points">13<');
    expect(markup).toContain('class="card-guide-points">0<');
    expect(markup).toContain('aria-label="3–6 ');
    expect(markup).toContain('aria-label="7–10 ');
    expect(markup.match(/class="guide-card(?: grouped)?"/gu)).toHaveLength(9);
    expect(markup.indexOf('aria-label="2 ')).toBeLessThan(
      markup.indexOf('aria-label="A '),
    );
  });
});

describe("unambiguous selection and feedback", () => {
  it("blocks a double tap only while the first command is pending", () => {
    const gate = createCommandGate();
    expect(gate.tryBegin()).toBe(true);
    expect(gate.tryBegin()).toBe(false);
    gate.end();
    expect(gate.tryBegin()).toBe(true);
  });

  it("gives mandatory and explicit modes deterministic priority", () => {
    expect(
      selectionPurpose({
        hasTransfer: true,
        effectSelecting: true,
        reactionAvailable: true,
        deciding: true,
      }),
    ).toBe("transfer");
    expect(
      selectionPurpose({
        hasTransfer: false,
        effectSelecting: false,
        reactionAvailable: true,
        deciding: false,
      }),
    ).toBe("reaction");
    expect(
      selectionPurpose({
        hasTransfer: false,
        effectSelecting: true,
        reactionAvailable: true,
        deciding: true,
      }),
    ).toBe("effect");
    expect(
      selectionPurpose({
        hasTransfer: false,
        effectSelecting: true,
        reactionAvailable: false,
        deciding: true,
      }),
    ).toBe("effect");
    expect(
      selectionPurpose({
        hasTransfer: false,
        effectSelecting: false,
        reactionAvailable: false,
        deciding: true,
      }),
    ).toBe("swap");
  });

  it("allows the viewed held card only through close-then-react", () => {
    expect(
      canSelectReactionTarget({
        held: true,
        viewingOwnEffect: true,
        belongsToOwnEffect: true,
      }),
    ).toBe(true);
    expect(
      canSelectReactionTarget({
        held: true,
        viewingOwnEffect: true,
        belongsToOwnEffect: false,
      }),
    ).toBe(false);
    expect(
      canSelectReactionTarget({
        held: true,
        viewingOwnEffect: false,
        belongsToOwnEffect: true,
      }),
    ).toBe(false);
  });

  it("distinguishes stale, held and closed reaction failures", () => {
    expect(
      feedbackForRejection(
        { error: { code: "STALE_POSITION", message: "x" } },
        "game.react",
      ),
    ).toBe("Zielkarte inzwischen verändert.");
    expect(
      feedbackForRejection(
        { error: { code: "CARD_HELD", message: "x" } },
        "game.react",
      ),
    ).toBe("Zielkarte ist gebunden.");
    expect(
      feedbackForRejection(
        { error: { code: "INVALID_REACTION_WINDOW", message: "x" } },
        "game.react",
      ),
    ).toBe("Reaktionsfenster bereits verbraucht oder geschlossen.");
  });
});

describe("round result", () => {
  it("places the next-round action directly after the score and before the table", () => {
    const round = game(2);
    round.phase = "round-result";
    round.roundCount = 2;
    round.completedRounds = [
      {
        roundNumber: 1,
        endReason: "zero-cards",
        kabuCallerId: null,
        scores: round.players.map((player, index) => ({
          playerId: player.playerId,
          cardPoints: index,
          kabuPenalty: 0,
          roundPoints: index,
        })),
      },
    ];
    round.totalScores = Object.fromEntries(
      round.players.map((player, index) => [player.playerId, index]),
    );
    round.nextRoundReady = [];
    const markup = renderToStaticMarkup(
      <RoundResultPanel
        snapshot={snapshot(round)}
        game={round}
        online
        pending={false}
        onReady={() => undefined}
      />,
    );
    expect(markup).toContain("Kartenpunkte: 0");
    expect(markup).toContain("Bereit für nächste Runde");
    expect(markup.indexOf("Bereit für nächste Runde")).toBeLessThan(
      markup.indexOf('aria-label="Spieltisch"'),
    );
  });
});
