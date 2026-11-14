import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";

import {
  applyConnectionChange,
  applyLobbyCommand,
  RECONNECT_WINDOW_MS,
  snapshotFor,
  type LobbyRoom,
} from "./domain.js";

const deterministicRandom = { integer: () => 0 };

function room(): LobbyRoom {
  const host = randomUUID();
  return {
    id: randomUUID(),
    code: "ABC234",
    status: "lobby",
    hostPlayerId: host,
    roundCount: 10,
    sequence: 4,
    members: [
      {
        playerId: host,
        name: "Ada",
        seat: 0,
        ready: false,
        connected: true,
        joinedAt: new Date("2026-01-01T10:00:00Z"),
      },
      {
        playerId: randomUUID(),
        name: "Bo",
        seat: 1,
        ready: true,
        connected: true,
        joinedAt: new Date("2026-01-01T10:01:00Z"),
      },
      {
        playerId: randomUUID(),
        name: "Cy",
        seat: 2,
        ready: true,
        connected: true,
        joinedAt: new Date("2026-01-01T10:02:00Z"),
      },
    ],
    game: null,
    interruption: {
      status: "active",
      missingPlayerIds: [],
      pausedAt: null,
      reconnectDeadline: null,
    },
  };
}

describe("lobby rules", () => {
  it("rejects invalid starts and a start by a non-host", () => {
    const state = room();
    const notReady = applyLobbyCommand(
      state,
      state.hostPlayerId,
      randomUUID(),
      { type: "lobby.start" },
      deterministicRandom,
    );
    expect(notReady.ack.error?.code).toBe("NOT_ALL_READY");
    expect(notReady.room.sequence).toBe(4);

    const nonHost = applyLobbyCommand(
      state,
      state.members[1]!.playerId,
      randomUUID(),
      { type: "lobby.start" },
      deterministicRandom,
    );
    expect(nonHost.ack.error?.code).toBe("NOT_HOST");
    expect(nonHost.room.status).toBe("lobby");
  });

  it("requires at least two players and lets only the host set rounds", () => {
    const state = room();
    state.members = [state.members[0]!];
    state.members[0]!.ready = true;

    const tooSmall = applyLobbyCommand(
      state,
      state.hostPlayerId,
      randomUUID(),
      { type: "lobby.start" },
      deterministicRandom,
    );
    expect(tooSmall.ack.error?.code).toBe("INVALID_PLAYER_COUNT");

    const withGuest = room();
    const rounds = applyLobbyCommand(
      withGuest,
      withGuest.members[1]!.playerId,
      randomUUID(),
      { type: "lobby.setRounds", roundCount: 12 },
      deterministicRandom,
    );
    expect(rounds.ack.error?.code).toBe("NOT_HOST");
    expect(rounds.room.roundCount).toBe(10);
  });

  it("moves the host role to the longest-present connected player", () => {
    const state = room();
    const nextHost = state.members[1]!;
    const result = applyLobbyCommand(
      state,
      state.hostPlayerId,
      randomUUID(),
      { type: "lobby.leave" },
      deterministicRandom,
    );

    expect(result.ack.accepted).toBe(true);
    expect(result.room.hostPlayerId).toBe(nextHost.playerId);
    expect(result.room.members).toHaveLength(2);
  });

  it("does not remove a player after the game has started", () => {
    const state = room();
    state.members.forEach((member) => {
      member.ready = true;
    });
    const started = applyLobbyCommand(
      state,
      state.hostPlayerId,
      randomUUID(),
      { type: "lobby.start" },
      deterministicRandom,
    ).room;
    const leavingPlayerId = started.members[1]!.playerId;

    const result = applyLobbyCommand(
      started,
      leavingPlayerId,
      randomUUID(),
      { type: "lobby.leave" },
      deterministicRandom,
    );

    expect(result.ack.accepted).toBe(false);
    expect(result.room.members.map((member) => member.playerId)).toContain(
      leavingPlayerId,
    );
  });

  it("pauses for all missing players, blocks actions, and resumes only when all return", () => {
    const state = room();
    state.members.forEach((member) => {
      member.ready = true;
    });
    const started = applyLobbyCommand(
      state,
      state.hostPlayerId,
      randomUUID(),
      { type: "lobby.start" },
      deterministicRandom,
      1_000,
    ).room;
    const visiblePosition = started.game!.players[0]!.positions[0]!;
    started.game!.effects.push({
      id: "effect-pause",
      ownerPlayerId: started.hostPlayerId,
      kind: "inspect-own",
      phase: "viewing",
      targets: [
        {
          playerId: started.hostPlayerId,
          positionId: visiblePosition.id,
          occupancyVersion: visiblePosition.occupancyVersion,
        },
      ],
      expiresAt: 10_000,
    });
    started.game!.publicReveals.push({
      id: "reveal-pause",
      target: {
        playerId: started.hostPlayerId,
        positionId: visiblePosition.id,
        occupancyVersion: visiblePosition.occupancyVersion,
      },
      cardId: visiblePosition.cardId!,
      expiresAt: 4_000,
    });
    started.game!.finalReactionDeadline = 20_000;
    const firstMissing = started.members[1]!.playerId;
    const secondMissing = started.members[2]!.playerId;
    const firstPause = applyConnectionChange(
      started,
      firstMissing,
      false,
      2_000,
    ).room;
    const secondPause = applyConnectionChange(
      firstPause,
      secondMissing,
      false,
      2_500,
    ).room;
    expect(secondPause.interruption).toMatchObject({
      status: "paused",
      missingPlayerIds: [firstMissing, secondMissing],
      reconnectDeadline: 2_000 + RECONNECT_WINDOW_MS,
    });
    const blocked = applyLobbyCommand(
      secondPause,
      state.hostPlayerId,
      randomUUID(),
      {
        type: "game.closeInitialView",
        roundId: secondPause.game!.id,
      },
      deterministicRandom,
      3_000,
    );
    expect(blocked.ack.error?.code).toBe("GAME_PAUSED");
    const oneBack = applyConnectionChange(
      secondPause,
      firstMissing,
      true,
      4_000,
    ).room;
    expect(oneBack.interruption.status).toBe("paused");
    const resumed = applyConnectionChange(
      oneBack,
      secondMissing,
      true,
      5_000,
    ).room;
    expect(resumed.interruption.status).toBe("active");
    expect(resumed.game?.effects[0]?.expiresAt).toBe(13_000);
    expect(resumed.game?.finalReactionDeadline).toBe(23_000);
    expect(resumed.game?.publicReveals[0]?.expiresAt).toBe(4_000);
  });

  it("offers host-controlled waiting or abort after exactly 90 seconds", () => {
    const state = room();
    state.members.forEach((member) => {
      member.ready = true;
    });
    const started = applyLobbyCommand(
      state,
      state.hostPlayerId,
      randomUUID(),
      { type: "lobby.start" },
      deterministicRandom,
      1_000,
    ).room;
    const paused = applyConnectionChange(
      started,
      started.members[1]!.playerId,
      false,
      2_000,
    ).room;
    const early = applyLobbyCommand(
      paused,
      state.hostPlayerId,
      randomUUID(),
      {
        type: "game.interruption.timeout",
        roundId: paused.game!.id,
      },
      deterministicRandom,
      2_000 + RECONNECT_WINDOW_MS - 1,
    );
    expect(early.ack.error?.code).toBe("INTERRUPTION_NOT_EXPIRED");
    const decision = applyLobbyCommand(
      paused,
      state.hostPlayerId,
      randomUUID(),
      {
        type: "game.interruption.timeout",
        roundId: paused.game!.id,
      },
      deterministicRandom,
      2_000 + RECONNECT_WINDOW_MS,
    ).room;
    expect(decision.interruption.status).toBe("decision");
    const wait = applyLobbyCommand(
      decision,
      state.hostPlayerId,
      randomUUID(),
      {
        type: "game.interruption.wait",
        roundId: decision.game!.id,
      },
      deterministicRandom,
      100_000,
    ).room;
    expect(wait.interruption).toMatchObject({
      status: "paused",
      reconnectDeadline: 100_000 + RECONNECT_WINDOW_MS,
    });
    const nextDecision = {
      ...wait,
      interruption: { ...wait.interruption, status: "decision" as const },
    };
    const aborted = applyLobbyCommand(
      nextDecision,
      state.hostPlayerId,
      randomUUID(),
      {
        type: "game.interruption.abort",
        roundId: nextDecision.game!.id,
      },
      deterministicRandom,
      100_001,
    ).room;
    expect(aborted.interruption.status).toBe("aborted");
    expect(aborted.game?.winners).toEqual([]);
  });

  it("creates different personalized snapshots from one server state", () => {
    const state = room();
    const hostView = snapshotFor(state, state.members[0]!.playerId);
    const guestView = snapshotFor(state, state.members[1]!.playerId);

    expect(hostView.you).not.toEqual(guestView.you);
    expect(hostView.you.isHost).toBe(true);
    expect(guestView.you.isHost).toBe(false);
    expect(hostView.room).toEqual(guestView.room);
  });

  it("keeps deterministic scenarios disabled unless explicitly enabled and host-owned", () => {
    const state = room();
    state.members.forEach((member) => {
      member.ready = true;
    });
    const started = applyLobbyCommand(
      state,
      state.hostPlayerId,
      randomUUID(),
      { type: "lobby.start" },
      deterministicRandom,
    ).room;
    const command = {
      type: "game.dev.loadScenario" as const,
      roundId: started.game!.id,
      scenario: "reaction-own" as const,
    };
    const previous = process.env.KABU_ENABLE_TEST_SCENARIOS;
    delete process.env.KABU_ENABLE_TEST_SCENARIOS;
    expect(
      applyLobbyCommand(
        started,
        started.hostPlayerId,
        randomUUID(),
        command,
        deterministicRandom,
      ).ack.error?.code,
    ).toBe("INVALID_COMMAND");
    process.env.KABU_ENABLE_TEST_SCENARIOS = "true";
    expect(
      applyLobbyCommand(
        started,
        started.members[1]!.playerId,
        randomUUID(),
        command,
        deterministicRandom,
      ).ack.error?.code,
    ).toBe("NOT_HOST");
    const loaded = applyLobbyCommand(
      started,
      started.hostPlayerId,
      randomUUID(),
      command,
      deterministicRandom,
    );
    expect(loaded.ack.accepted).toBe(true);
    expect(loaded.room.game?.reactionWindow).toMatchObject({
      rank: "5",
      status: "open",
    });
    if (previous === undefined) delete process.env.KABU_ENABLE_TEST_SCENARIOS;
    else process.env.KABU_ENABLE_TEST_SCENARIOS = previous;
  });
});
