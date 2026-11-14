import { describe, expect, it } from "vitest";

import {
  RANKS,
  RULES_VERSION,
  SUITS,
  cardFor,
  cardId,
  closeInitialView,
  createDeck,
  createRound,
  discardDrawn,
  drawCard,
  expireEffect,
  nextAdditionalPosition,
  projectRound,
  giveAdditionalCard,
  stateInvariantErrors,
  swapDrawn,
  upgradeRoundState,
  type RandomSource,
  type RoundState,
} from "./index.js";

const zeroRandom: RandomSource = { integer: () => 0 };
const deck = createDeck().map((card) => card.id);

function startedRound(playerCount = 2): RoundState {
  let state = createRound({
    players: Array.from({ length: playerCount }, (_, seat) => ({
      playerId: `player-${seat}`,
      seat,
    })),
    random: zeroRandom,
    deckOrder: deck,
  });
  for (const player of state.players) {
    const result = closeInitialView(state, player.playerId, state.id);
    if (!result.ok) throw new Error(result.message);
    state = result.state;
  }
  return state;
}

function expectValid(state: RoundState) {
  expect(stateInvariantErrors(state)).toEqual([]);
}

describe("M3 cards", () => {
  it("pins V1.0 and creates 52 unique cards", () => {
    expect(RULES_VERSION).toBe("1.0");
    const cards = createDeck();
    expect(cards).toHaveLength(52);
    expect(new Set(cards.map((card) => card.id)).size).toBe(52);
    expect(cards.map((card) => card.suit)).toEqual(
      SUITS.flatMap((suit) => Array.from({ length: 13 }, () => suit)),
    );
  });

  it("rejects unknown snapshot and rules versions", () => {
    const state = startedRound();
    expect(() =>
      upgradeRoundState({ ...state, dataVersion: 99 } as unknown as RoundState),
    ).toThrow("Nicht unterstützte Snapshot-Version");
    expect(() =>
      upgradeRoundState({
        ...state,
        rulesVersion: "2.0",
      } as unknown as RoundState),
    ).toThrow("Nicht unterstützte Regelversion");
  });

  it("assigns every rank and both king colors the correct value", () => {
    for (const suit of SUITS)
      for (const rank of RANKS) {
        const expected =
          rank === "ace"
            ? 1
            : rank === "jack"
              ? 11
              : rank === "queen"
                ? 12
                : rank === "king"
                  ? suit === "hearts" || suit === "diamonds"
                    ? 0
                    : 13
                  : Number(rank);
        expect(cardFor(cardId(suit, rank)).value).toBe(expected);
      }
  });
});

describe("M3 setup and protected views", () => {
  for (let playerCount = 2; playerCount <= 6; playerCount += 1) {
    it(`deals a stable 2x2 field to ${playerCount} players`, () => {
      const state = createRound({
        players: Array.from({ length: playerCount }, (_, seat) => ({
          playerId: `p${seat}`,
          seat,
        })),
        random: zeroRandom,
        deckOrder: deck,
      });
      expect(
        state.players.every((player) => player.positions.length === 4),
      ).toBe(true);
      expect(state.drawPile).toHaveLength(52 - playerCount * 4);
      expect(state.discardPile).toEqual([]);
      expectValid(state);
    });
  }

  for (const playerCount of [2, 3, 6]) {
    it(`projects every field and occupancy without secret values for ${playerCount} players`, () => {
      const state = startedRound(playerCount);
      for (const recipient of state.players) {
        const view = projectRound(state, recipient.playerId);
        expect(view.players).toHaveLength(playerCount);
        expect(
          view.players.every(
            (player) =>
              player.positions.length === 4 &&
              player.positions.every(
                (position) =>
                  position.occupied &&
                  position.occupancyVersion === 1 &&
                  position.card === undefined,
              ),
          ),
        ).toBe(true);
        expect(JSON.stringify(view)).not.toContain("cardId");
        expect(JSON.stringify(view)).not.toContain('"drawPile":');
      }
    });
  }

  it("shows only two own near cards until closing, never again", () => {
    const state = createRound({
      players: [
        { playerId: "p0", seat: 0 },
        { playerId: "p1", seat: 1 },
      ],
      random: zeroRandom,
      deckOrder: deck,
    });
    const view = projectRound(state, "p0");
    const visible = view.players
      .flatMap((player) => player.positions)
      .filter((position) => position.card);
    expect(visible).toHaveLength(2);
    expect(visible.map((position) => position.row)).toEqual(["near", "near"]);
    const closed = closeInitialView(state, "p0", state.id);
    if (!closed.ok) throw new Error(closed.message);
    expect(
      projectRound(closed.state, "p0")
        .players.flatMap((p) => p.positions)
        .some((p) => p.card),
    ).toBe(false);
    expect(closeInitialView(closed.state, "p0", state.id)).toMatchObject({
      ok: false,
      code: "INITIAL_VIEW_CLOSED",
    });
    expect(projectRound(closed.state, "p1").you.initialViewOpen).toBe(true);
  });

  it("blocks turns until all views close and supports round rotation", () => {
    const initial = createRound({
      players: [
        { playerId: "p0", seat: 0 },
        { playerId: "p1", seat: 1 },
        { playerId: "p2", seat: 2 },
      ],
      random: zeroRandom,
      deckOrder: deck,
    });
    expect(
      drawCard(initial, initial.activePlayerId, initial.turn.id, zeroRandom),
    ).toMatchObject({ ok: false, code: "ROUND_NOT_PLAYING" });
    const later = createRound({
      players: initial.players.map(({ playerId, seat }) => ({
        playerId,
        seat,
      })),
      random: zeroRandom,
      deckOrder: deck,
      roundNumber: 2,
      previousStartingSeat: 1,
    });
    expect(later.startingPlayerId).toBe("p2");
  });

  it("fills gaps from the inner columns and then extends by columns", () => {
    const player = startedRound().players[0]!;
    player.positions[1]!.cardId = null;
    player.positions.push({
      id: "player-0:near:2",
      row: "near",
      column: 2,
      cardId: null,
      occupancyVersion: 1,
    });
    expect(nextAdditionalPosition(player).id).toBe("player-0:near:1");
    player.positions[1]!.cardId = deck[0]!;
    player.positions.pop();
    const extension = nextAdditionalPosition(player);
    expect(extension).toMatchObject({ row: "near", column: 2 });
    player.positions.push({
      ...extension,
      cardId: deck[1]!,
      occupancyVersion: 1,
    });
    expect(nextAdditionalPosition(player)).toMatchObject({
      row: "far",
      column: 2,
    });
  });

  it("places additional cards blind into gaps, then extends both rows", () => {
    let state = startedRound();
    const playerId = state.players[0]!.playerId;
    const gap = state.players[0]!.positions[0]!;
    state.discardPile.push({
      cardId: gap.cardId!,
      origin: "swapped",
      abilityEligible: false,
    });
    gap.cardId = null;
    const filled = giveAdditionalCard(state, playerId, zeroRandom);
    if (!filled.ok) throw new Error(filled.message);
    state = filled.state;
    expect(state.players[0]!.positions[0]).toMatchObject({
      id: gap.id,
      occupancyVersion: 2,
    });
    const near = giveAdditionalCard(state, playerId, zeroRandom);
    if (!near.ok) throw new Error(near.message);
    state = near.state;
    expect(state.players[0]!.positions.at(-1)).toMatchObject({
      row: "near",
      column: 2,
    });
    const far = giveAdditionalCard(state, playerId, zeroRandom);
    if (!far.ok) throw new Error(far.message);
    expect(far.state.players[0]!.positions.at(-1)).toMatchObject({
      row: "far",
      column: 2,
    });
    expectValid(far.state);
  });
});

describe("M3 normal turns", () => {
  it("allows only the active player to draw once and reveals it only to them", () => {
    const state = startedRound();
    const other = state.players.find(
      (player) => player.playerId !== state.activePlayerId,
    )!;
    expect(
      drawCard(state, other.playerId, state.turn.id, zeroRandom),
    ).toMatchObject({ ok: false, code: "NOT_ACTIVE_PLAYER" });
    const drawn = drawCard(
      state,
      state.activePlayerId,
      state.turn.id,
      zeroRandom,
    );
    if (!drawn.ok) throw new Error(drawn.message);
    expect(
      drawCard(drawn.state, state.activePlayerId, state.turn.id, zeroRandom),
    ).toMatchObject({ ok: false, code: "INVALID_TURN" });
    expect(
      projectRound(drawn.state, state.activePlayerId).you.drawnCard,
    ).toBeDefined();
    expect(
      projectRound(drawn.state, other.playerId).you.drawnCard,
    ).toBeUndefined();
    expectValid(drawn.state);
  });

  it("marks direct discard as ability-eligible and advances seats", () => {
    const state = startedRound(3);
    const actor = state.activePlayerId;
    const drawn = drawCard(state, actor, state.turn.id, zeroRandom);
    if (!drawn.ok) throw new Error(drawn.message);
    const discarded = discardDrawn(drawn.state, actor, state.turn.id);
    if (!discarded.ok) throw new Error(discarded.message);
    expect(discarded.state.discardPile.at(-1)).toMatchObject({
      origin: "drawn",
      abilityEligible: true,
    });
    expect(discarded.state.activePlayerId).not.toBe(actor);
    expect(discarded.state.turn).toMatchObject({
      id: "turn-2",
      phase: "awaiting-draw",
    });
    expectValid(discarded.state);
  });

  it("swaps in place without changing field size and records its origin", () => {
    const state = startedRound();
    const actor = state.activePlayerId;
    const position = state.players.find((player) => player.playerId === actor)!
      .positions[0]!;
    const oldCard = position.cardId;
    const drawn = drawCard(state, actor, state.turn.id, zeroRandom);
    if (!drawn.ok) throw new Error(drawn.message);
    const replacement = drawn.state.drawnCard!.cardId;
    const swapped = swapDrawn(drawn.state, actor, state.turn.id, {
      positionId: position.id,
      occupancyVersion: position.occupancyVersion,
    });
    if (!swapped.ok) throw new Error(swapped.message);
    const nextPosition = swapped.state.players.find(
      (p) => p.playerId === actor,
    )!.positions[0]!;
    expect(nextPosition).toMatchObject({
      id: position.id,
      cardId: replacement,
      occupancyVersion: 2,
    });
    expect(
      swapped.state.players.find((p) => p.playerId === actor)!.positions,
    ).toHaveLength(4);
    expect(swapped.state.discardPile.at(-1)).toMatchObject({
      cardId: oldCard,
      origin: "swapped",
      abilityEligible: false,
    });
    expectValid(swapped.state);
  });

  it("rejects foreign and stale swap targets without mutation", () => {
    const state = startedRound();
    const actor = state.activePlayerId;
    const drawn = drawCard(state, actor, state.turn.id, zeroRandom);
    if (!drawn.ok) throw new Error(drawn.message);
    const foreign = drawn.state.players.find((p) => p.playerId !== actor)!
      .positions[0]!;
    expect(
      swapDrawn(drawn.state, actor, state.turn.id, {
        positionId: foreign.id,
        occupancyVersion: foreign.occupancyVersion,
      }),
    ).toMatchObject({ ok: false, code: "INVALID_POSITION" });
    const own = drawn.state.players.find((p) => p.playerId === actor)!
      .positions[0]!;
    expect(
      swapDrawn(drawn.state, actor, state.turn.id, {
        positionId: own.id,
        occupancyVersion: own.occupancyVersion + 1,
      }),
    ).toMatchObject({ ok: false, code: "STALE_POSITION" });
    expectValid(drawn.state);
  });

  it("recycles all discards except the visible top card", () => {
    const state = startedRound();
    const field = new Set(
      state.players.flatMap((p) =>
        p.positions.map((position) => position.cardId!),
      ),
    );
    const available = deck.filter((id) => !field.has(id));
    const visibleTop = available.at(-1)!;
    state.drawPile = [];
    state.discardPile = available.map((id) => ({
      cardId: id,
      origin: "drawn",
      abilityEligible: true,
    }));
    const drawn = drawCard(
      state,
      state.activePlayerId,
      state.turn.id,
      zeroRandom,
    );
    if (!drawn.ok) throw new Error(drawn.message);
    expect(drawn.state.discardPile.map((entry) => entry.cardId)).toEqual([
      visibleTop,
    ]);
    expectValid(drawn.state);
  });

  it("preserves all cards over one complete six-player turn cycle", () => {
    let state = startedRound(6);
    for (let index = 0; index < 6; index += 1) {
      const actor = state.activePlayerId;
      const turnId = state.turn.id;
      const drawn = drawCard(state, actor, turnId, zeroRandom);
      if (!drawn.ok) throw new Error(drawn.message);
      const completed =
        index % 2 === 0
          ? discardDrawn(drawn.state, actor, turnId)
          : swapDrawn(drawn.state, actor, turnId, {
              positionId: drawn.state.players.find((p) => p.playerId === actor)!
                .positions[1]!.id,
              occupancyVersion: 1,
            });
      if (!completed.ok) throw new Error(completed.message);
      state = completed.state;
      for (const effect of [...state.effects]) {
        const expired = expireEffect(state, effect.id, effect.expiresAt);
        if (!expired.ok) throw new Error(expired.message);
        state = expired.state;
      }
      expectValid(state);
    }
    expect(state.activePlayerId).toBe(state.startingPlayerId);
  });
});
