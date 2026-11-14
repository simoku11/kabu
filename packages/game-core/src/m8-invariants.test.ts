import { describe, expect, it } from "vitest";

import {
  closeInitialView,
  createDeck,
  createRound,
  drawCard,
  projectRound,
  stateInvariantErrors,
  swapDrawn,
  type RandomSource,
  type RoundState,
} from "./index.js";

function seededRandom(seed: number): RandomSource & { next(): number } {
  let value = seed >>> 0 || 1;
  const next = () => {
    value ^= value << 13;
    value ^= value >>> 17;
    value ^= value << 5;
    return value >>> 0;
  };
  return { next, integer: (maximum) => next() % maximum };
}

function fail(seed: number, actions: string[], message: string): never {
  throw new Error(
    `${message}\nM8 reproduction seed=${seed}\nactions=${JSON.stringify(actions)}`,
  );
}

function assertProtectedViews(
  state: RoundState,
  seed: number,
  actions: string[],
) {
  for (const recipient of state.players) {
    const view = projectRound(state, recipient.playerId);
    for (const player of view.players) {
      if (player.positions.some((position) => position.card !== undefined)) {
        fail(
          seed,
          actions,
          `private field value leaked to ${recipient.playerId}`,
        );
      }
    }
    if (
      recipient.playerId !== state.activePlayerId &&
      view.you.drawnCard !== undefined
    ) {
      fail(seed, actions, `drawn card leaked to ${recipient.playerId}`);
    }
  }
}

describe("M8 seeded state-machine invariants", () => {
  for (let playerCount = 2; playerCount <= 6; playerCount += 1) {
    it(`keeps all cards unique and views private for ${playerCount} players`, () => {
      for (let sample = 0; sample < 12; sample += 1) {
        const seed = playerCount * 10_000 + sample;
        const random = seededRandom(seed);
        const actions: string[] = [];
        let state = createRound({
          players: Array.from({ length: playerCount }, (_, seat) => ({
            playerId: `p${seat}`,
            seat,
          })),
          random,
          deckOrder: createDeck().map((card) => card.id),
        });
        for (const player of state.players) {
          const closed = closeInitialView(state, player.playerId, state.id);
          if (!closed.ok) fail(seed, actions, closed.message);
          state = closed.state;
        }
        for (let step = 0; step < 80; step += 1) {
          const actor = state.activePlayerId;
          const wrongActor = state.players.find(
            (player) => player.playerId !== actor && !player.eliminated,
          )!.playerId;
          const rejected = drawCard(state, wrongActor, state.turn.id, random);
          actions.push(`invalid-draw:${wrongActor}:${state.turn.id}`);
          if (rejected.ok)
            fail(seed, actions, "wrong player draw was accepted");

          const drawn = drawCard(state, actor, state.turn.id, random);
          actions.push(`draw:${actor}:${state.turn.id}`);
          if (!drawn.ok) fail(seed, actions, drawn.message);
          state = drawn.state;
          const actorState = state.players.find(
            (player) => player.playerId === actor,
          )!;
          const occupied = actorState.positions.filter(
            (position) => position.cardId,
          );
          const position = occupied[random.next() % occupied.length]!;
          const stale = swapDrawn(state, actor, state.turn.id, {
            positionId: position.id,
            occupancyVersion: position.occupancyVersion + 1,
          });
          actions.push(
            `stale-swap:${position.id}:${position.occupancyVersion + 1}`,
          );
          if (stale.ok) fail(seed, actions, "stale position was accepted");
          const swapped = swapDrawn(state, actor, state.turn.id, {
            positionId: position.id,
            occupancyVersion: position.occupancyVersion,
          });
          actions.push(`swap:${position.id}:${position.occupancyVersion}`);
          if (!swapped.ok) fail(seed, actions, swapped.message);
          state = swapped.state;
          const errors = stateInvariantErrors(state);
          if (errors.length > 0) fail(seed, actions, errors.join("; "));
          assertProtectedViews(state, seed, actions);
        }
      }
      expect(true).toBe(true);
    });
  }
});
