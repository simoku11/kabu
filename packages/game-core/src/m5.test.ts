import { describe, expect, it } from "vitest";

import {
  FINAL_REACTION_DURATION_MS,
  callKabu,
  cardFor,
  completeTransfer,
  createDeck,
  createRound,
  discardDrawn,
  drawCard,
  expireFinalReaction,
  giveAdditionalCard,
  loadDevelopmentScenario,
  reactWithPosition,
  readyForNextRound,
  selectEffectPlayer,
  stateInvariantErrors,
  type RandomSource,
  type RoundState,
} from "./index.js";

const random: RandomSource = { integer: () => 0 };
const players = [
  { playerId: "p1", seat: 0 },
  { playerId: "p2", seat: 1 },
  { playerId: "p3", seat: 2 },
  { playerId: "p4", seat: 3 },
];

function playing(count = 2, roundCount = 1): RoundState {
  const state = createRound({
    players: players.slice(0, count),
    random,
    roundCount,
    deckOrder: createDeck().map((card) => card.id),
  });
  state.phase = "playing";
  for (const player of state.players) player.initialViewOpen = false;
  return state;
}

function scenario(name: Parameters<typeof loadDevelopmentScenario>[1]) {
  return loadDevelopmentScenario(playing(2), name);
}

function target(state: RoundState, playerId: string, index = 0) {
  const position = state.players.find((player) => player.playerId === playerId)!
    .positions[index]!;
  return {
    playerId,
    positionId: position.id,
    occupancyVersion: position.occupancyVersion,
  };
}

describe("M5 round and match flow", () => {
  it("builds the stable two-row M6 grown-field acceptance scenario", () => {
    const state = scenario("m6-grown-field");
    const field = state.players[0]!.positions;
    expect(field.filter((position) => position.cardId)).toHaveLength(8);
    expect(field.filter((position) => position.row === "near")).toHaveLength(4);
    expect(field.filter((position) => position.row === "far")).toHaveLength(4);
    expect(stateInvariantErrors(state)).toEqual([]);
  });

  it("builds four complete four-column fields for the M6 multiplayer layout", () => {
    const state = loadDevelopmentScenario(
      playing(4),
      "m6-four-player-grown-fields",
    );
    expect(state.players).toHaveLength(4);
    for (const player of state.players) {
      const occupied = player.positions.filter((position) => position.cardId);
      expect(occupied).toHaveLength(8);
      expect(new Set(occupied.map((position) => position.column)).size).toBe(4);
    }
    expect(stateInvariantErrors(state)).toEqual([]);
  });

  it("keeps the configured round count isolated across development scenarios", () => {
    const state = playing(2, 2);
    const short = loadDevelopmentScenario(state, "m5-short-game");
    const zero = loadDevelopmentScenario(short, "m5-zero-own");
    expect(short.roundCount).toBe(2);
    expect(zero.roundCount).toBe(2);
  });

  it("accepts Kabu only at the active turn start and orders every other final turn", () => {
    const state = playing(3);
    expect(callKabu(state, "p2", state.turn.id).ok).toBe(false);
    const drawn = drawCard(state, "p1", state.turn.id, random);
    if (!drawn.ok) throw new Error(drawn.message);
    expect(callKabu(drawn.state, "p1", state.turn.id).ok).toBe(false);

    const called = callKabu(state, "p1", state.turn.id);
    if (!called.ok) throw new Error(called.message);
    expect(called.state.kabuCallerId).toBe("p1");
    expect(called.state.pendingFinalTurns).toEqual(["p2", "p3"]);
    expect(called.state.activePlayerId).toBe("p2");
    expect(callKabu(called.state, "p2", called.state.turn.id).ok).toBe(false);
  });

  it("consumes a skipped final turn and opens exactly 6000 ms after the last discard", () => {
    let state = playing(3);
    const called = callKabu(state, "p1", state.turn.id);
    if (!called.ok) throw new Error(called.message);
    state = called.state;
    // Put a 2 on top while retaining all 52 cards.
    const twoIndex = state.drawPile.indexOf("spades:2");
    [state.drawPile[twoIndex], state.drawPile[state.drawPile.length - 1]] = [
      state.drawPile.at(-1)!,
      "spades:2",
    ];
    const drawn = drawCard(state, "p2", state.turn.id, random);
    if (!drawn.ok) throw new Error(drawn.message);
    const discarded = discardDrawn(
      drawn.state,
      "p2",
      drawn.state.turn.id,
      random,
      1_000,
    );
    if (!discarded.ok) throw new Error(discarded.message);
    expect(discarded.state.pendingFinalTurns).toEqual([]);
    expect(discarded.state.phase).toBe("final-reaction");
    expect(discarded.state.finalReactionDeadline).toBe(
      1_000 + FINAL_REACTION_DURATION_MS,
    );
  });

  it("cancels the third player's pending final turn when the second player reacts to zero cards", () => {
    let state = loadDevelopmentScenario(playing(3), "m5-kabu-early-zero");
    const called = callKabu(state, "p1", state.turn.id);
    if (!called.ok) throw new Error(called.message);
    state = called.state;
    expect(state.pendingFinalTurns).toEqual(["p2", "p3"]);

    const drawn = drawCard(state, "p2", state.turn.id, random);
    if (!drawn.ok) throw new Error(drawn.message);
    const discarded = discardDrawn(
      drawn.state,
      "p2",
      drawn.state.turn.id,
      random,
    );
    if (!discarded.ok) throw new Error(discarded.message);
    expect(discarded.state.pendingFinalTurns).toEqual(["p3"]);

    const reacted = reactWithPosition(
      discarded.state,
      "p2",
      discarded.state.reactionWindow!.id,
      target(discarded.state, "p2"),
      random,
    );
    if (!reacted.ok) throw new Error(reacted.message);
    expect(reacted.state.phase).toBe("game-over");
    expect(reacted.state.pendingFinalTurns).toEqual([]);
    expect(
      reacted.state.completedRounds[0]!.scores.find(
        (score) => score.playerId === "p2",
      ),
    ).toMatchObject({ cardPoints: 0, roundPoints: 0 });
    expect(reacted.state.endReason).toBe("zero-cards");
  });

  it("uses a strict server deadline and scores the Kabu tie penalty exactly once", () => {
    const state = scenario("m5-kabu-tie");
    state.roundCount = 1;
    state.kabuCallerId = "p1";
    state.pendingFinalTurns = [];
    state.phase = "final-reaction";
    state.finalReactionDeadline = 4_000;
    expect(expireFinalReaction(state, 3_999).ok).toBe(false);
    const finished = expireFinalReaction(state, 4_000);
    if (!finished.ok) throw new Error(finished.message);
    expect(finished.state.phase).toBe("game-over");
    expect(finished.state.completedRounds).toHaveLength(1);
    expect(finished.state.completedRounds[0]!.scores).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          playerId: "p1",
          cardPoints: 4,
          kabuPenalty: 10,
          roundPoints: 14,
        }),
        expect.objectContaining({
          playerId: "p2",
          cardPoints: 4,
          kabuPenalty: 0,
          roundPoints: 4,
        }),
      ]),
    );
    expect(expireFinalReaction(finished.state, 5_000).ok).toBe(false);
    expect(finished.state.totalScores.p1).toBe(14);
  });

  it("accepts reactions before but not at the final deadline", () => {
    for (const [now, accepted] of [
      [3_999, true],
      [4_000, false],
    ] as const) {
      const state = scenario("m5-zero-own");
      state.kabuCallerId = "p2";
      state.pendingFinalTurns = [];
      state.phase = "final-reaction";
      state.finalReactionDeadline = 4_000;
      const reacted = reactWithPosition(
        state,
        "p1",
        state.reactionWindow!.id,
        target(state, "p1"),
        random,
        now,
      );
      expect(reacted.ok).toBe(accepted);
    }
  });

  it("does not extend the deadline after a miss and completes an accepted transfer after expiry", () => {
    const missState = loadDevelopmentScenario(playing(2), "reaction-wrong");
    missState.kabuCallerId = "p2";
    missState.phase = "final-reaction";
    missState.finalReactionDeadline = 1_000;
    const missed = reactWithPosition(
      missState,
      "p1",
      missState.reactionWindow!.id,
      target(missState, "p1"),
      random,
      900,
    );
    if (!missed.ok) throw new Error(missed.message);
    expect(missed.state.finalReactionDeadline).toBe(1_000);

    const transferState = scenario("m5-foreign-last");
    transferState.kabuCallerId = "p2";
    transferState.pendingFinalTurns = [];
    transferState.phase = "final-reaction";
    transferState.finalReactionDeadline = 1_000;
    const reacted = reactWithPosition(
      transferState,
      "p1",
      transferState.reactionWindow!.id,
      target(transferState, "p2"),
      random,
      999,
    );
    if (!reacted.ok) throw new Error(reacted.message);
    const expired = expireFinalReaction(reacted.state, 1_000);
    if (!expired.ok) throw new Error(expired.message);
    expect(expired.state.phase).toBe("final-reaction");
    expect(expired.state.completedRounds).toHaveLength(0);
    const transferred = completeTransfer(
      expired.state,
      "p1",
      expired.state.pendingTransfers[0]!.id,
      target(expired.state, "p1"),
    );
    if (!transferred.ok) throw new Error(transferred.message);
    expect(transferred.state.completedRounds).toHaveLength(1);
    expect(transferred.state.phase).toBe("game-over");
  });

  it("penalizes a worse caller, spares the sole lowest caller, and supports shared winners", () => {
    const finish = (
      callerCard: "hearts:king" | "spades:9",
      otherCard: "diamonds:king" | "clubs:2",
    ) => {
      const state = scenario("m5-kabu-tie");
      const swapIn = (
        playerId: string,
        wanted: typeof callerCard | typeof otherCard,
      ) => {
        const position = state.players.find((p) => p.playerId === playerId)!
          .positions[0]!;
        const index = state.drawPile.indexOf(wanted);
        const old = position.cardId!;
        position.cardId = wanted;
        state.drawPile[index] = old;
      };
      swapIn("p1", callerCard);
      swapIn("p2", otherCard);
      state.kabuCallerId = "p1";
      state.phase = "final-reaction";
      state.finalReactionDeadline = 0;
      const result = expireFinalReaction(state, 0);
      if (!result.ok) throw new Error(result.message);
      return result.state;
    };
    const best = finish("hearts:king", "clubs:2");
    expect(
      best.completedRounds[0]!.scores.find((score) => score.playerId === "p1")!
        .kabuPenalty,
    ).toBe(0);
    const worse = finish("spades:9", "diamonds:king");
    expect(
      worse.completedRounds[0]!.scores.find((score) => score.playerId === "p1")!
        .kabuPenalty,
    ).toBe(10);

    const shared = scenario("m5-kabu-tie");
    shared.kabuCallerId = null;
    shared.phase = "final-reaction";
    shared.finalReactionDeadline = 0;
    const sharedResult = expireFinalReaction(shared, 0);
    if (!sharedResult.ok) throw new Error(sharedResult.message);
    expect(sharedResult.state.winners).toEqual(["p1", "p2"]);
  });

  it("ends on an own last reaction and applies D6 to a drawn card once", () => {
    const state = scenario("m5-zero-own");
    state.activePlayerId = "p2";
    const drawn = drawCard(state, "p2", state.turn.id, random);
    if (!drawn.ok) throw new Error(drawn.message);
    const drawnId = drawn.state.drawnCard!.cardId;
    const reacted = reactWithPosition(
      drawn.state,
      "p1",
      drawn.state.reactionWindow!.id,
      target(drawn.state, "p1"),
      random,
    );
    if (!reacted.ok) throw new Error(reacted.message);
    expect(reacted.state.phase).toBe("game-over");
    expect(reacted.state.drawnCard).toBeNull();
    expect(
      reacted.state.discardPile.filter((entry) => entry.cardId === drawnId),
    ).toHaveLength(1);
    expect(reacted.state.discardPile.at(-1)).toMatchObject({
      abilityEligible: false,
    });
    expect(stateInvariantErrors(reacted.state)).toEqual([]);
  });

  it("waits for a foreign transfer and then recognizes the reacting player's last card", () => {
    const state = scenario("m5-foreign-last");
    const reacted = reactWithPosition(
      state,
      "p1",
      state.reactionWindow!.id,
      target(state, "p2"),
      random,
    );
    if (!reacted.ok) throw new Error(reacted.message);
    expect(reacted.state.phase).toBe("playing");
    expect(reacted.state.pendingTransfers).toHaveLength(1);
    const transferred = completeTransfer(
      reacted.state,
      "p1",
      reacted.state.pendingTransfers[0]!.id,
      target(reacted.state, "p1"),
    );
    if (!transferred.ok) throw new Error(transferred.message);
    expect(transferred.state.phase).toBe("game-over");
    expect(transferred.state.completedRounds[0]!.endReason).toBe("zero-cards");
  });

  it("lets a pending red king rescue zero cards and resumes at the existing continuation", () => {
    const state = scenario("m5-red-king-rescue");
    const reacted = reactWithPosition(
      state,
      "p2",
      state.reactionWindow!.id,
      target(state, "p2"),
      random,
    );
    if (!reacted.ok) throw new Error(reacted.message);
    expect(reacted.state.phase).toBe("provisional-end");
    const rescued = selectEffectPlayer(
      reacted.state,
      "p1",
      reacted.state.effects[0]!.id,
      "p2",
      random,
    );
    if (!rescued.ok) throw new Error(rescued.message);
    expect(rescued.state.phase).toBe("playing");
    expect(
      rescued.state.players
        .find((player) => player.playerId === "p2")!
        .positions.filter((p) => p.cardId),
    ).toHaveLength(1);
  });

  it("starts the next round only after everyone is ready and rotates the starter", () => {
    const state = scenario("m5-kabu-tie");
    state.roundCount = 2;
    state.kabuCallerId = "p1";
    state.pendingFinalTurns = [];
    state.phase = "final-reaction";
    state.finalReactionDeadline = 0;
    const finished = expireFinalReaction(state, 0);
    if (!finished.ok) throw new Error(finished.message);
    expect(finished.state.phase).toBe("round-result");
    const oneReady = readyForNextRound(finished.state, "p1", random);
    if (!oneReady.ok) throw new Error(oneReady.message);
    expect(oneReady.state.phase).toBe("round-result");
    const next = readyForNextRound(oneReady.state, "p2", random);
    if (!next.ok) throw new Error(next.message);
    expect(next.state.phase).toBe("initial-view");
    expect(next.state.number).toBe(2);
    expect(next.state.startingPlayerId).toBe("p2");
    expect(next.state.totalScores).toEqual(finished.state.totalScores);
    expect(next.state.kabuCallerId).toBeNull();
    expect(next.state.reactionWindow).toBeNull();
  });

  it("eliminates a player on the ninth card and freezes the cumulative score", () => {
    let state = playing(3, 2);
    state.totalScores.p2 = 7;
    for (let index = 0; index < 4; index += 1) {
      const result = giveAdditionalCard(state, "p2", random);
      if (!result.ok) throw new Error(result.message);
      state = result.state;
    }
    const handBeforeNinth = state.players
      .find((player) => player.playerId === "p2")!
      .positions.reduce(
        (sum, position) =>
          sum + (position.cardId ? cardFor(position.cardId).value : 0),
        0,
      );
    const ninthValue = cardFor(state.drawPile.at(-1)!).value;

    const result = giveAdditionalCard(state, "p2", random);
    if (!result.ok) throw new Error(result.message);
    const eliminated = result.state.players.find(
      (player) => player.playerId === "p2",
    )!;
    expect(eliminated.eliminated).toBe(true);
    expect(eliminated.finalScore).toBe(7 + handBeforeNinth + ninthValue);
    expect(result.state.totalScores.p2).toBe(eliminated.finalScore);
    expect(eliminated.positions.every((position) => !position.cardId)).toBe(
      true,
    );
    expect(result.state.removedCards).toHaveLength(9);
    expect(stateInvariantErrors(result.state)).toEqual([]);
  });

  it("keeps an eliminated seat but skips it in following rounds", () => {
    let state = playing(3, 2);
    for (let index = 0; index < 5; index += 1) {
      const result = giveAdditionalCard(state, "p2", random);
      if (!result.ok) throw new Error(result.message);
      state = result.state;
    }
    state.phase = "round-result";
    const first = readyForNextRound(state, "p1", random);
    if (!first.ok) throw new Error(first.message);
    const next = readyForNextRound(first.state, "p3", random);
    if (!next.ok) throw new Error(next.message);

    expect(next.state.players).toHaveLength(3);
    expect(
      next.state.players.find((player) => player.playerId === "p2"),
    ).toMatchObject({ eliminated: true, positions: expect.any(Array) });
    expect(
      next.state.players
        .find((player) => player.playerId === "p2")!
        .positions.some((position) => position.cardId),
    ).toBe(false);
    expect(next.state.startingPlayerId).toBe("p3");
    expect(stateInvariantErrors(next.state)).toEqual([]);
  });

  it("ends the match when only one active player remains", () => {
    let state = playing(2, 10);
    for (let index = 0; index < 4; index += 1) {
      const result = giveAdditionalCard(state, "p1", random);
      if (!result.ok) throw new Error(result.message);
      state = result.state;
    }
    state.effects.push({
      id: "eliminating-red-king",
      ownerPlayerId: "p2",
      kind: "give-card",
      phase: "selecting",
      targets: [],
    });
    const result = selectEffectPlayer(
      state,
      "p2",
      "eliminating-red-king",
      "p1",
      random,
    );
    if (!result.ok) throw new Error(result.message);
    state = result.state;
    expect(state.phase).toBe("game-over");
    expect(state.winners).toEqual(["p2"]);
    expect(state.players[0]).toMatchObject({ eliminated: true });
    expect(stateInvariantErrors(state)).toEqual([]);
  });
});
