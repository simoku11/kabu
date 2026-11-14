import { describe, expect, it } from "vitest";

import {
  activateEffect,
  cardId,
  closeEffectView,
  closeInitialView,
  completeTransfer,
  createDeck,
  createRound,
  decideInspectSwap,
  discardDrawn,
  drawCard,
  expireEffect,
  loadDevelopmentScenario,
  projectRound,
  reactWithPosition,
  selectEffectPlayer,
  selectEffectPosition,
  skipEffect,
  stateInvariantErrors,
  swapDrawn,
  type CardId,
  type PositionTarget,
  type RandomSource,
  type RoundState,
} from "./index.js";

const random: RandomSource = { integer: () => 0 };

function started(playerCount = 3): RoundState {
  let state = createRound({
    players: Array.from({ length: playerCount }, (_, seat) => ({
      playerId: `p${seat}`,
      seat,
    })),
    random,
    deckOrder: createDeck().map((card) => card.id),
  });
  for (const player of state.players) {
    const result = closeInitialView(state, player.playerId, state.id);
    if (!result.ok) throw new Error(result.message);
    state = result.state;
  }
  return state;
}

function slots(state: RoundState) {
  const result: Array<{ get(): CardId; set(card: CardId): void }> = [];
  state.drawPile.forEach((_, index) =>
    result.push({
      get: () => state.drawPile[index]!,
      set: (card) => {
        state.drawPile[index] = card;
      },
    }),
  );
  state.discardPile.forEach((_, index) =>
    result.push({
      get: () => state.discardPile[index]!.cardId,
      set: (card) => {
        state.discardPile[index]!.cardId = card;
      },
    }),
  );
  for (const player of state.players)
    for (const position of player.positions)
      if (position.cardId)
        result.push({
          get: () => position.cardId!,
          set: (card) => {
            position.cardId = card;
          },
        });
  if (state.drawnCard)
    result.push({
      get: () => state.drawnCard!.cardId,
      set: (card) => {
        state.drawnCard!.cardId = card;
      },
    });
  return result;
}

function place(
  state: RoundState,
  wanted: CardId,
  destination: ReturnType<typeof slots>[number],
) {
  const source = slots(state).find((slot) => slot.get() === wanted)!;
  const displaced = destination.get();
  source.set(displaced);
  destination.set(wanted);
}

function positionTarget(
  state: RoundState,
  playerId: string,
  index = 0,
): PositionTarget {
  const position = state.players.find((player) => player.playerId === playerId)!
    .positions[index]!;
  return {
    playerId,
    positionId: position.id,
    occupancyVersion: position.occupancyVersion,
  };
}

function putAt(state: RoundState, target: PositionTarget, card: CardId) {
  const position = state.players
    .find((player) => player.playerId === target.playerId)!
    .positions.find((item) => item.id === target.positionId)!;
  place(state, card, {
    get: () => position.cardId!,
    set: (next) => {
      position.cardId = next;
    },
  });
}

function direct(state: RoundState, card: CardId, now = Date.now()): RoundState {
  place(state, card, {
    get: () => state.drawPile.at(-1)!,
    set: (next) => {
      state.drawPile[state.drawPile.length - 1] = next;
    },
  });
  const playerId = state.activePlayerId;
  const turnId = state.turn.id;
  const drawn = drawCard(state, playerId, turnId, random);
  if (!drawn.ok) throw new Error(drawn.message);
  const discarded = discardDrawn(drawn.state, playerId, turnId, random, now);
  if (!discarded.ok) throw new Error(discarded.message);
  return discarded.state;
}

function selected(
  state: RoundState,
  effectId: string,
  owner: string,
  target: PositionTarget,
) {
  const result = selectEffectPosition(state, owner, effectId, target);
  if (!result.ok) throw new Error(result.message);
  return result.state;
}

describe("M4 abilities", () => {
  it("grants one fresh ten-second window when an activity is started", () => {
    const state = direct(started(), cardId("hearts", "5"), 1_000);
    const effect = state.effects[0]!;

    const activated = activateEffect(
      state,
      effect.ownerPlayerId,
      effect.id,
      5_000,
    );
    if (!activated.ok) throw new Error(activated.message);
    expect(activated.state.effects[0]).toMatchObject({
      activated: true,
      expiresAt: 15_000,
    });
    expect(
      activateEffect(activated.state, effect.ownerPlayerId, effect.id, 6_000),
    ).toMatchObject({ ok: false, code: "INVALID_EFFECT" });
  });

  it("does not revive an activity after its original deadline", () => {
    const state = direct(started(), cardId("hearts", "5"), 1_000);
    const effect = state.effects[0]!;
    expect(
      activateEffect(state, effect.ownerPlayerId, effect.id, 11_000),
    ).toMatchObject({ ok: false, code: "INVALID_EFFECT" });
  });

  it.each([
    cardId("hearts", "ace"),
    cardId("clubs", "jack"),
    cardId("hearts", "queen"),
  ])("gives %s no ability", (card) => {
    expect(direct(started(), card).effects).toEqual([]);
  });
  it("skips the next player for a directly discarded 2, including two players", () => {
    let state = started(2);
    const actor = state.activePlayerId;
    state = direct(state, cardId("hearts", "2"));
    expect(state.activePlayerId).toBe(actor);
    expect(state.effects).toEqual([]);
    expect(state.reactionWindow).toMatchObject({ rank: "2", status: "open" });
  });

  it.each([
    [cardId("hearts", "3"), "inspect-own"],
    [cardId("diamonds", "4"), "inspect-own"],
    [cardId("spades", "5"), "inspect-own"],
    [cardId("clubs", "6"), "inspect-own"],
    [cardId("hearts", "7"), "inspect-opponent"],
    [cardId("diamonds", "8"), "inspect-opponent"],
    [cardId("spades", "9"), "inspect-opponent"],
    [cardId("clubs", "10"), "inspect-opponent"],
  ] as const)("creates a private, skippable view for %s", (card, kind) => {
    let state = direct(started(), card);
    const effect = state.effects[0]!;
    expect(effect.kind).toBe(kind);
    const target = positionTarget(
      state,
      kind === "inspect-own" ? effect.ownerPlayerId : "p1",
    );
    state = selected(state, effect.id, effect.ownerPlayerId, target);
    expect(
      projectRound(state, effect.ownerPlayerId).you.privateEffect?.cards,
    ).toHaveLength(1);
    expect(projectRound(state, "p1").you.privateEffect).toBeUndefined();
    const closed = closeEffectView(state, effect.ownerPlayerId, effect.id);
    expect(
      closed.ok &&
        projectRound(closed.state, effect.ownerPlayerId).you.privateEffect,
    ).toBeUndefined();

    const optional = direct(started(), card).effects[0]!;
    expect(
      skipEffect(direct(started(), card), optional.ownerPlayerId, optional.id)
        .ok,
    ).toBe(true);
  });

  it("blind-swaps two owners without revealing either card", () => {
    let state = direct(started(), cardId("spades", "queen"));
    const effect = state.effects[0]!;
    const a = positionTarget(state, "p0");
    const b = positionTarget(state, "p1");
    const before = [
      state.players[0]!.positions[0]!.cardId,
      state.players[1]!.positions[0]!.cardId,
    ];
    state = selected(state, effect.id, effect.ownerPlayerId, a);
    expect(state.players[0]!.positions[0]!.cardId).toBe(before[0]);
    state = selected(state, effect.id, effect.ownerPlayerId, b);
    expect(state.players[0]!.positions[0]!.cardId).toBe(before[1]);
    expect(state.players[1]!.positions[0]!.cardId).toBe(before[0]);
    expect(JSON.stringify(projectRound(state, "p2"))).not.toContain("cardId");
  });

  it("gives a blind card with the red king and allows self as recipient", () => {
    let state = direct(started(), cardId("hearts", "king"));
    const effect = state.effects[0]!;
    const before = state.players[0]!.positions.filter(
      (position) => position.cardId,
    ).length;
    const result = selectEffectPlayer(
      state,
      effect.ownerPlayerId,
      effect.id,
      "p0",
      random,
    );
    if (!result.ok) throw new Error(result.message);
    state = result.state;
    expect(
      state.players[0]!.positions.filter((position) => position.cardId),
    ).toHaveLength(before + 1);
    expect(
      projectRound(state, "p0").players[0]!.positions.every(
        (position) => !position.card,
      ),
    ).toBe(true);
    expect(stateInvariantErrors(state)).toEqual([]);
  });

  it.each([true, false])(
    "shows black-king targets privately and supports swap=%s",
    (swap) => {
      let state = direct(started(), cardId("clubs", "king"));
      const effect = state.effects[0]!;
      const a = positionTarget(state, "p0");
      const b = positionTarget(state, "p1");
      const before = [
        state.players[0]!.positions[0]!.cardId,
        state.players[1]!.positions[0]!.cardId,
      ];
      state = selected(state, effect.id, effect.ownerPlayerId, a);
      state = selected(state, effect.id, effect.ownerPlayerId, b);
      const privateCards = projectRound(state, effect.ownerPlayerId).you
        .privateEffect?.cards;
      expect(privateCards).toHaveLength(2);
      expect(privateCards?.map((entry) => entry.target.playerId)).toEqual([
        "p0",
        "p1",
      ]);
      expect(projectRound(state, "p2").you.privateEffect).toBeUndefined();
      const decided = decideInspectSwap(
        state,
        effect.ownerPlayerId,
        effect.id,
        swap,
      );
      if (!decided.ok) throw new Error(decided.message);
      expect(decided.state.players[0]!.positions[0]!.cardId).toBe(
        swap ? before[1] : before[0],
      );
      expect(decided.state.effects).toEqual([]);
    },
  );

  it("limits private views to ten seconds and closes them server-side", () => {
    let state = direct(started(), cardId("hearts", "5"), 1_000);
    const effect = state.effects[0]!;
    const target = positionTarget(state, effect.ownerPlayerId);
    const selected = selectEffectPosition(
      state,
      effect.ownerPlayerId,
      effect.id,
      target,
      5_000,
    );
    if (!selected.ok) throw new Error(selected.message);
    state = selected.state;
    expect(state.effects[0]!.expiresAt).toBe(11_000);
    expect(
      projectRound(state, effect.ownerPlayerId, 10_999).you.privateEffect,
    ).toBeDefined();
    expect(
      projectRound(state, effect.ownerPlayerId, 11_000).you.privateEffect,
    ).toBeUndefined();
    expect(expireEffect(state, effect.id, 10_999)).toMatchObject({ ok: false });
    const expired = expireEffect(state, effect.id, 11_000);
    expect(expired.ok && expired.state.effects).toEqual([]);
  });

  it("keeps black-king cards in place when its ten-second decision expires", () => {
    let state = direct(started(), cardId("clubs", "king"), 1_000);
    const effect = state.effects[0]!;
    const first = positionTarget(state, "p0");
    const second = positionTarget(state, "p1");
    const before = [
      state.players[0]!.positions[0]!.cardId,
      state.players[1]!.positions[0]!.cardId,
    ];
    const firstSelection = selectEffectPosition(
      state,
      effect.ownerPlayerId,
      effect.id,
      first,
      5_000,
    );
    if (!firstSelection.ok) throw new Error(firstSelection.message);
    const secondSelection = selectEffectPosition(
      firstSelection.state,
      effect.ownerPlayerId,
      effect.id,
      second,
      7_000,
    );
    if (!secondSelection.ok) throw new Error(secondSelection.message);
    state = secondSelection.state;
    expect(state.effects[0]!.expiresAt).toBe(11_000);
    const expired = expireEffect(state, effect.id, 11_000);
    if (!expired.ok) throw new Error(expired.message);
    expect(expired.state.players[0]!.positions[0]!.cardId).toBe(before[0]);
    expect(expired.state.players[1]!.positions[0]!.cardId).toBe(before[1]);
    expect(expired.state.effects).toEqual([]);
  });

  it("does not trigger abilities from swaps or reactions", () => {
    const state = started();
    const actor = state.activePlayerId;
    const own = positionTarget(state, actor);
    putAt(state, own, cardId("clubs", "king"));
    const drawn = drawCard(state, actor, state.turn.id, random);
    if (!drawn.ok) throw new Error(drawn.message);
    const swapped = swapDrawn(drawn.state, actor, state.turn.id, own);
    if (!swapped.ok) throw new Error(swapped.message);
    expect(swapped.state.effects).toEqual([]);
    expect(swapped.state.reactionWindow?.rank).toBe("king");
  });
});

describe("M4 reactions and conflicts", () => {
  it("keeps a timed ability pending after reacting with an opponent card", () => {
    let state = direct(started(), cardId("hearts", "5"), 1_000);
    const effect = state.effects[0]!;
    const foreign = positionTarget(state, "p1");
    putAt(state, foreign, cardId("clubs", "5"));

    const reaction = reactWithPosition(
      state,
      effect.ownerPlayerId,
      state.reactionWindow!.id,
      foreign,
      random,
      4_000,
    );
    if (!reaction.ok) throw new Error(reaction.message);
    state = reaction.state;

    expect(state.reactionWindow?.status).toBe("consumed");
    expect(state.effects).toMatchObject([
      { id: effect.id, phase: "selecting", expiresAt: 11_000 },
    ]);
    expect(state.pendingTransfers).toHaveLength(1);
  });

  it("accepts two concurrent wrong attempts and keeps both reveals", () => {
    let state = loadDevelopmentScenario(started(), "reaction-two-wrong");
    const windowId = state.reactionWindow!.id;
    const first = positionTarget(state, "p0");
    const second = positionTarget(state, "p1");
    const countsBefore = [
      occupiedCountForTest(state, "p0"),
      occupiedCountForTest(state, "p1"),
    ];
    const firstResult = reactWithPosition(
      state,
      "p0",
      windowId,
      first,
      random,
      1_000,
      2_500,
    );
    if (!firstResult.ok) throw new Error(firstResult.message);
    state = firstResult.state;
    const secondResult = reactWithPosition(
      state,
      "p1",
      windowId,
      second,
      random,
      1_001,
      2_500,
    );
    if (!secondResult.ok) throw new Error(secondResult.message);
    state = secondResult.state;

    expect(state.reactionWindow).toMatchObject({
      id: windowId,
      status: "open",
    });
    expect(state.publicReveals).toHaveLength(2);
    expect(projectRound(state, "p2", 1_002).publicReveals).toHaveLength(2);
    expect(occupiedCountForTest(state, "p0")).toBe(countsBefore[0]! + 1);
    expect(occupiedCountForTest(state, "p1")).toBe(countsBefore[1]! + 1);
  });

  it("blocks the next turn until an open effect is completed or skipped", () => {
    let state = direct(started(), cardId("hearts", "5"));
    const firstWindow = state.reactionWindow!.id;
    expect(
      drawCard(state, state.activePlayerId, state.turn.id, random),
    ).toMatchObject({ ok: false, code: "ACTION_REQUIRED" });

    const effect = state.effects[0]!;
    const skipped = skipEffect(state, effect.ownerPlayerId, effect.id);
    if (!skipped.ok) throw new Error(skipped.message);
    state = skipped.state;

    const next = drawCard(state, state.activePlayerId, state.turn.id, random);
    if (!next.ok) throw new Error(next.message);
    expect(next.state.reactionWindow!.id).toBe(firstWindow);
    const discarded = discardDrawn(
      next.state,
      next.state.activePlayerId,
      next.state.turn.id,
      random,
    );
    if (!discarded.ok) throw new Error(discarded.message);
    expect(discarded.state.reactionWindow!.id).not.toBe(firstWindow);

    let completedState = direct(started(), cardId("hearts", "5"));
    const completedEffect = completedState.effects[0]!;
    completedState = selected(
      completedState,
      completedEffect.id,
      completedEffect.ownerPlayerId,
      positionTarget(completedState, completedEffect.ownerPlayerId),
    );
    const closed = closeEffectView(
      completedState,
      completedEffect.ownerPlayerId,
      completedEffect.id,
    );
    if (!closed.ok) throw new Error(closed.message);
    expect(
      drawCard(
        closed.state,
        closed.state.activePlayerId,
        closed.state.turn.id,
        random,
      ).ok,
    ).toBe(true);
  });

  it("blocks only the player holding a drawn card and allows reactions again after discarding it", () => {
    const state = direct(started(), cardId("hearts", "ace"));
    const playerId = state.activePlayerId;
    const ownTarget = positionTarget(state, playerId, 0);
    putAt(state, ownTarget, cardId("clubs", "ace"));
    place(state, cardId("diamonds", "ace"), {
      get: () => state.drawPile.at(-1)!,
      set: (card) => {
        state.drawPile[state.drawPile.length - 1] = card;
      },
    });
    const drawn = drawCard(state, playerId, state.turn.id, random);
    if (!drawn.ok) throw new Error(drawn.message);

    const whileHolding = reactWithPosition(
      drawn.state,
      playerId,
      drawn.state.reactionWindow!.id,
      ownTarget,
      random,
    );
    expect(whileHolding).toMatchObject({
      ok: false,
      code: "REACTION_NOT_ALLOWED",
    });

    const discarded = discardDrawn(
      drawn.state,
      playerId,
      drawn.state.turn.id,
      random,
    );
    if (!discarded.ok) throw new Error(discarded.message);
    const afterDiscard = reactWithPosition(
      discarded.state,
      playerId,
      discarded.state.reactionWindow!.id,
      ownTarget,
      random,
    );
    expect(afterDiscard.ok).toBe(true);
  });

  it("adds exactly one penalty per valid wrong attempt and later accepts success", () => {
    let state = direct(started(), cardId("hearts", "9"));
    const window = state.reactionWindow!;
    const wrongA = positionTarget(state, "p1", 0);
    const wrongB = positionTarget(state, "p1", 1);
    const right = positionTarget(state, "p1", 2);
    putAt(state, wrongA, cardId("clubs", "3"));
    putAt(state, wrongB, cardId("clubs", "4"));
    putAt(state, right, cardId("clubs", "9"));
    const before = occupiedCountForTest(state, "p1");
    for (const target of [wrongA, wrongB]) {
      const result = reactWithPosition(
        state,
        "p1",
        window.id,
        target,
        random,
        1_000,
        2_500,
      );
      if (!result.ok) throw new Error(result.message);
      state = result.state;
    }
    expect(occupiedCountForTest(state, "p1")).toBe(before + 2);
    const success = reactWithPosition(state, "p1", window.id, right, random);
    if (!success.ok) throw new Error(success.message);
    expect(success.state.reactionWindow?.status).toBe("consumed");
    const lateCount = occupiedCountForTest(success.state, "p2");
    const late = reactWithPosition(
      success.state,
      "p2",
      window.id,
      positionTarget(success.state, "p2"),
      random,
    );
    expect(late.ok).toBe(true);
    if (late.ok)
      expect(occupiedCountForTest(late.state, "p2")).toBe(lateCount + 1);
  });

  it("rejects stale, held and old-window targets without penalties", () => {
    let state = direct(started(), cardId("hearts", "5"));
    const effect = state.effects[0]!;
    const held = positionTarget(state, effect.ownerPlayerId);
    putAt(state, held, cardId("clubs", "5"));
    state = selected(state, effect.id, effect.ownerPlayerId, held);
    const count = occupiedCountForTest(state, "p1");
    expect(
      reactWithPosition(state, "p1", state.reactionWindow!.id, held, random),
    ).toMatchObject({ ok: false, code: "CARD_HELD" });
    expect(
      reactWithPosition(
        state,
        effect.ownerPlayerId,
        state.reactionWindow!.id,
        positionTarget(state, "p1"),
        random,
      ),
    ).toMatchObject({ ok: false, code: "REACTION_NOT_ALLOWED" });
    expect(occupiedCountForTest(state, "p1")).toBe(count);
    const closed = closeEffectView(state, effect.ownerPlayerId, effect.id);
    if (!closed.ok) throw new Error(closed.message);
    const ownFive = reactWithPosition(
      closed.state,
      effect.ownerPlayerId,
      state.reactionWindow!.id,
      held,
      random,
    );
    expect(ownFive.ok).toBe(true);
  });

  it("performs foreign reaction and mandatory blind transfer into the exact gap", () => {
    let state = direct(started(), cardId("diamonds", "queen"));
    const foreign = positionTarget(state, "p1");
    putAt(state, foreign, cardId("clubs", "queen"));
    const result = reactWithPosition(
      state,
      "p2",
      state.reactionWindow!.id,
      foreign,
      random,
    );
    if (!result.ok) throw new Error(result.message);
    state = result.state;
    expect(state.pendingTransfers).toHaveLength(1);
    expect(drawCard(state, "p2", state.turn.id, random)).toMatchObject({
      ok: false,
    });
    const own = positionTarget(state, "p2");
    const transfer = completeTransfer(
      state,
      "p2",
      state.pendingTransfers[0]!.id,
      own,
    );
    if (!transfer.ok) throw new Error(transfer.message);
    const destination = transfer.state.players[1]!.positions.find(
      (position) => position.id === foreign.positionId,
    )!;
    expect(destination.cardId).not.toBeNull();
    expect(transfer.state.pendingTransfers).toEqual([]);
    expect(stateInvariantErrors(transfer.state)).toEqual([]);
  });

  it("binds public reveals to the exact occupancy and expires them", () => {
    const state = direct(started(), cardId("hearts", "9"));
    const wrong = positionTarget(state, "p1");
    putAt(state, wrong, cardId("clubs", "3"));
    const result = reactWithPosition(
      state,
      "p2",
      state.reactionWindow!.id,
      wrong,
      random,
      1_000,
      500,
    );
    if (!result.ok) throw new Error(result.message);
    expect(projectRound(result.state, "p0", 1_100).publicReveals).toHaveLength(
      1,
    );
    expect(projectRound(result.state, "p0", 1_501).publicReveals).toEqual([]);
    const countAfterFirstPenalty = occupiedCountForTest(result.state, "p2");
    expect(
      reactWithPosition(
        result.state,
        "p2",
        result.state.reactionWindow!.id,
        wrong,
        random,
        1_100,
        500,
      ),
    ).toMatchObject({ ok: false, code: "REACTION_NOT_ALLOWED" });
    expect(occupiedCountForTest(result.state, "p2")).toBe(
      countAfterFirstPenalty,
    );
    const moved = structuredClone(result.state);
    moved.players[1]!.positions[0]!.occupancyVersion += 1;
    expect(projectRound(moved, "p0", 1_100).publicReveals).toEqual([]);
  });

  it("lets newly dealt penalty and red-king cards react immediately", () => {
    let state = direct(started(), cardId("hearts", "9"));
    const wrong = positionTarget(state, "p1");
    putAt(state, wrong, cardId("clubs", "3"));
    place(state, cardId("clubs", "9"), {
      get: () => state.drawPile.at(-1)!,
      set: (card) => {
        state.drawPile[state.drawPile.length - 1] = card;
      },
    });
    const failed = reactWithPosition(
      state,
      "p1",
      state.reactionWindow!.id,
      wrong,
      random,
    );
    if (!failed.ok) throw new Error(failed.message);
    state = failed.state;
    const penaltyPosition = state.players[1]!.positions.find(
      (position) => position.cardId === cardId("clubs", "9"),
    )!;
    expect(
      reactWithPosition(
        state,
        "p1",
        state.reactionWindow!.id,
        {
          playerId: "p1",
          positionId: penaltyPosition.id,
          occupancyVersion: penaltyPosition.occupancyVersion,
        },
        random,
      ).ok,
    ).toBe(true);

    state = direct(started(), cardId("hearts", "king"));
    place(state, cardId("clubs", "king"), {
      get: () => state.drawPile.at(-1)!,
      set: (card) => {
        state.drawPile[state.drawPile.length - 1] = card;
      },
    });
    const kingEffect = state.effects[0]!;
    const given = selectEffectPlayer(
      state,
      kingEffect.ownerPlayerId,
      kingEffect.id,
      "p1",
      random,
    );
    if (!given.ok) throw new Error(given.message);
    const newKing = given.state.players[1]!.positions.find(
      (position) => position.cardId === cardId("clubs", "king"),
    )!;
    const reaction = reactWithPosition(
      given.state,
      "p1",
      given.state.reactionWindow!.id,
      {
        playerId: "p1",
        positionId: newKing.id,
        occupancyVersion: newKing.occupancyVersion,
      },
      random,
    );
    expect(reaction.ok).toBe(true);
    if (reaction.ok) expect(reaction.state.effects).toEqual([]);
  });

  it("keeps a black-king effect alive when another player wins the window", () => {
    const state = direct(started(), cardId("clubs", "king"));
    const effectId = state.effects[0]!.id;
    const responder = positionTarget(state, "p1");
    putAt(state, responder, cardId("spades", "king"));
    const reacted = reactWithPosition(
      state,
      "p1",
      state.reactionWindow!.id,
      responder,
      random,
    );
    if (!reacted.ok) throw new Error(reacted.message);
    expect(reacted.state.effects.some((effect) => effect.id === effectId)).toBe(
      true,
    );
  });

  it("penalizes and reveals the second otherwise-correct competing reaction", () => {
    const state = direct(started(), cardId("hearts", "queen"));
    const first = positionTarget(state, "p1");
    const second = positionTarget(state, "p2");
    putAt(state, first, cardId("clubs", "queen"));
    putAt(state, second, cardId("spades", "queen"));
    const won = reactWithPosition(
      state,
      "p1",
      state.reactionWindow!.id,
      first,
      random,
    );
    if (!won.ok) throw new Error(won.message);
    const countBeforeLateAttempt = occupiedCountForTest(won.state, "p2");
    const late = reactWithPosition(
      won.state,
      "p2",
      state.reactionWindow!.id,
      second,
      random,
      1_000,
      2_500,
    );
    if (!late.ok) throw new Error(late.message);
    expect(late.state.reactionWindow?.status).toBe("consumed");
    expect(late.state.players[2]!.positions[0]!.cardId).toBe(
      cardId("spades", "queen"),
    );
    expect(late.state.publicReveals.at(-1)?.cardId).toBe(
      cardId("spades", "queen"),
    );
    expect(occupiedCountForTest(late.state, "p2")).toBe(
      countBeforeLateAttempt + 1,
    );
  });

  it("defers zero cards for a red king and resumes when its duty restores a card", () => {
    const state = direct(started(), cardId("hearts", "king"));
    const effect = state.effects[0]!;
    keepOnly(state, "p1", 0);
    const last = positionTarget(state, "p1");
    putAt(state, last, cardId("clubs", "king"));
    const reacted = reactWithPosition(
      state,
      "p1",
      state.reactionWindow!.id,
      last,
      random,
    );
    if (!reacted.ok) throw new Error(reacted.message);
    expect(reacted.state.phase).toBe("provisional-end");
    expect(reacted.state.effects[0]!.id).toBe(effect.id);
    const restored = selectEffectPlayer(
      reacted.state,
      effect.ownerPlayerId,
      effect.id,
      "p1",
      random,
    );
    if (!restored.ok) throw new Error(restored.message);
    expect(restored.state.phase).toBe("playing");
    expect(occupiedCountForTest(restored.state, "p1")).toBe(1);
  });

  it("does not treat a foreign last-card gap as final before transfer", () => {
    const state = direct(started(), cardId("hearts", "queen"));
    keepOnly(state, "p1", 0);
    keepOnly(state, "p2", 0);
    const foreign = positionTarget(state, "p1");
    putAt(state, foreign, cardId("clubs", "queen"));
    const reacted = reactWithPosition(
      state,
      "p2",
      state.reactionWindow!.id,
      foreign,
      random,
    );
    if (!reacted.ok) throw new Error(reacted.message);
    expect(reacted.state.phase).toBe("playing");
    const own = positionTarget(reacted.state, "p2");
    const transferred = completeTransfer(
      reacted.state,
      "p2",
      reacted.state.pendingTransfers[0]!.id,
      own,
    );
    if (!transferred.ok) throw new Error(transferred.message);
    expect(transferred.state.phase).toBe("game-over");
    expect(occupiedCountForTest(transferred.state, "p1")).toBe(1);
    expect(occupiedCountForTest(transferred.state, "p2")).toBe(0);
  });

  it("restarts the round without scoring when a mandatory card is unavailable", () => {
    const state = started(6);
    for (const card of state.drawPile.splice(0)) {
      const player = state.players[0]!;
      const target = {
        id: `p0:near:${player.positions.length}`,
        row: "near" as const,
        column: player.positions.length,
        cardId: card,
        occupancyVersion: 1,
      };
      player.positions.push(target);
    }
    expect(stateInvariantErrors(state)).toEqual([]);
    const restarted = drawCard(
      state,
      state.activePlayerId,
      state.turn.id,
      random,
    );
    if (!restarted.ok) throw new Error(restarted.message);
    expect(restarted.state.phase).toBe("initial-view");
    expect(restarted.state.restartCount).toBe(1);
    expect(restarted.state.lastRestartReason).toBe("draw-pile-exhausted");
    expect(stateInvariantErrors(restarted.state)).toEqual([]);
  });

  it("uses the same exhaustion restart for a red-king duty", () => {
    const state = direct(started(), cardId("hearts", "king"));
    const effect = state.effects[0]!;
    drainDrawPileIntoField(state);
    const restarted = selectEffectPlayer(
      state,
      effect.ownerPlayerId,
      effect.id,
      "p1",
      random,
    );
    if (!restarted.ok) throw new Error(restarted.message);
    expect(restarted.state.phase).toBe("initial-view");
    expect(restarted.state.restartCount).toBe(1);
    expect(stateInvariantErrors(restarted.state)).toEqual([]);
  });
});

function occupiedCountForTest(state: RoundState, playerId: string) {
  return state.players
    .find((player) => player.playerId === playerId)!
    .positions.filter((position) => position.cardId).length;
}

function keepOnly(state: RoundState, playerId: string, keptIndex: number) {
  const player = state.players.find((item) => item.playerId === playerId)!;
  player.positions.forEach((position, index) => {
    if (index !== keptIndex && position.cardId) {
      state.drawPile.unshift(position.cardId);
      position.cardId = null;
      position.occupancyVersion += 1;
    }
  });
}

function drainDrawPileIntoField(state: RoundState) {
  for (const card of state.drawPile.splice(0)) {
    const player = state.players[0]!;
    player.positions.push({
      id: `drain:${player.positions.length}`,
      row: "near",
      column: player.positions.length,
      cardId: card,
      occupancyVersion: 1,
    });
  }
}
