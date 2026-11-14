import type {
  CommandAck,
  CommandErrorCode,
  LobbyCommand,
  LobbySnapshot,
} from "@kabu/protocol";
import {
  activateEffect,
  closeInitialView,
  callKabu,
  closeEffectView,
  completeTransfer,
  createRound,
  decideInspectSwap,
  discardDrawn,
  drawCard,
  expireEffect,
  expireFinalReaction,
  loadDevelopmentScenario,
  projectRound,
  reactWithPosition,
  readyForNextRound,
  selectEffectPlayer,
  selectEffectPosition,
  skipEffect,
  swapDrawn,
  upgradeRoundState,
  type RandomSource,
  type RoundState,
} from "@kabu/game-core";

export interface GuestSession {
  playerId: string;
  tokenHash: string;
  expiresAt: Date;
}

export interface LobbyMember {
  playerId: string;
  name: string;
  seat: number;
  ready: boolean;
  connected: boolean;
  joinedAt: Date;
}

export interface LobbyRoom {
  id: string;
  code: string;
  status: "lobby" | "started";
  hostPlayerId: string;
  roundCount: number;
  sequence: number;
  members: LobbyMember[];
  game: RoundState | null;
  interruption: InterruptionState;
}

export interface InterruptionState {
  status: "active" | "paused" | "decision" | "aborted";
  missingPlayerIds: string[];
  pausedAt: number | null;
  reconnectDeadline: number | null;
}

export const RECONNECT_WINDOW_MS = 90_000;

export function activeInterruption(): InterruptionState {
  return {
    status: "active",
    missingPlayerIds: [],
    pausedAt: null,
    reconnectDeadline: null,
  };
}

export interface StoredCommand {
  payloadHash: string;
  ack: CommandAck;
}

export interface CommandExecution {
  ack: CommandAck;
  room: LobbyRoom | undefined;
  changed: boolean;
  persistenceMs?: number;
}

export interface LobbyStore {
  acquireWriterLease(): Promise<void>;
  findSession(tokenHash: string): Promise<GuestSession | undefined>;
  createSession(session: GuestSession): Promise<GuestSession>;
  createRoom(input: {
    code: string;
    playerId: string;
    name: string;
    roundCount: number;
  }): Promise<LobbyRoom>;
  joinRoom(input: {
    code: string;
    playerId: string;
    name: string;
  }): Promise<LobbyRoom>;
  getRoomForPlayer(
    code: string,
    playerId: string,
  ): Promise<LobbyRoom | undefined>;
  setConnected(
    code: string,
    playerId: string,
    connected: boolean,
  ): Promise<LobbyRoom | undefined>;
  executeCommand(input: {
    code: string;
    playerId: string;
    commandId: string;
    payloadHash: string;
    command: LobbyCommand;
    receivedAt?: number;
  }): Promise<CommandExecution>;
  getCommandResult(
    code: string,
    playerId: string,
    commandId: string,
  ): Promise<CommandAck | undefined>;
  recoverStartedRooms(now?: number): Promise<LobbyRoom[]>;
  cleanupExpired(now?: Date): Promise<void>;
  close(): Promise<void>;
}

export class LobbyError extends Error {
  constructor(
    public readonly code: CommandErrorCode,
    message: string,
    public readonly statusCode: number,
  ) {
    super(message);
  }
}

export function publicRevealDurationMs(): number {
  const configured = Number(process.env.KABU_PUBLIC_REVEAL_MS ?? 2_500);
  return Number.isInteger(configured) &&
    configured >= 250 &&
    configured <= 10_000
    ? configured
    : 2_500;
}

export function snapshotFor(room: LobbyRoom, playerId: string): LobbySnapshot {
  const member = room.members.find(
    (candidate) => candidate.playerId === playerId,
  );
  if (!member) {
    throw new LobbyError(
      "NOT_A_MEMBER",
      "Du gehörst nicht zu diesem Raum.",
      403,
    );
  }

  return {
    room: {
      code: room.code,
      status: room.status,
      roundCount: room.roundCount,
      sequence: room.sequence,
    },
    you: {
      playerId,
      seat: member.seat,
      isHost: room.hostPlayerId === playerId,
    },
    interruption: structuredClone(room.interruption),
    participants: room.members
      .toSorted((left, right) => left.seat - right.seat)
      .map((participant) => ({
        playerId: participant.playerId,
        name: participant.name,
        seat: participant.seat,
        ready: participant.ready,
        connected: participant.connected,
        isHost: participant.playerId === room.hostPlayerId,
      })),
    ...(room.game
      ? {
          game: projectRound(
            upgradeRoundState(room.game, room.roundCount),
            playerId,
            room.interruption.status === "paused" ||
              room.interruption.status === "decision"
              ? (room.interruption.pausedAt ?? Date.now())
              : Date.now(),
            Date.now(),
          ),
        }
      : {}),
  };
}

/** Applies a transport-presence change as persisted room state. */
export function applyConnectionChange(
  room: LobbyRoom,
  playerId: string,
  connected: boolean,
  now = Date.now(),
): { room: LobbyRoom; changed: boolean } {
  const next = structuredClone(room);
  const member = next.members.find(
    (candidate) => candidate.playerId === playerId,
  );
  if (!member || member.connected === connected)
    return { room, changed: false };
  member.connected = connected;

  if (
    next.status === "started" &&
    next.game &&
    next.interruption.status !== "aborted"
  ) {
    const missing = next.members
      .filter((candidate) => !candidate.connected)
      .map((candidate) => candidate.playerId);
    if (missing.length > 0) {
      if (next.interruption.status === "active") {
        next.interruption = {
          status: "paused",
          missingPlayerIds: missing,
          pausedAt: now,
          reconnectDeadline: now + RECONNECT_WINDOW_MS,
        };
      } else {
        next.interruption.missingPlayerIds = missing;
      }
    } else if (
      next.interruption.status === "paused" ||
      next.interruption.status === "decision"
    ) {
      const pausedFor = Math.max(0, now - (next.interruption.pausedAt ?? now));
      // Game deadlines stop while the room is paused. Short public reveals do
      // not: an expired reveal must never become visible again after reconnect.
      for (const effect of next.game.effects ?? []) {
        if (effect.expiresAt !== undefined) effect.expiresAt += pausedFor;
      }
      if (next.game.finalReactionDeadline != null) {
        next.game.finalReactionDeadline += pausedFor;
      }
      next.interruption = activeInterruption();
    } else {
      next.interruption.missingPlayerIds = [];
    }
  }
  next.sequence += 1;
  return { room: next, changed: true };
}

export function rejectedAck(
  commandId: string,
  sequence: number,
  code: CommandErrorCode,
  message: string,
): CommandAck {
  return {
    commandId,
    accepted: false,
    duplicate: false,
    sequence,
    error: { code, message },
  };
}

export function applyLobbyCommand(
  room: LobbyRoom,
  playerId: string,
  commandId: string,
  command: LobbyCommand,
  random: RandomSource,
  now = Date.now(),
): { ack: CommandAck; room: LobbyRoom; changed: boolean } {
  const member = room.members.find(
    (candidate) => candidate.playerId === playerId,
  );
  if (!member) {
    return {
      ack: rejectedAck(
        commandId,
        room.sequence,
        "NOT_A_MEMBER",
        "Du gehörst nicht zu diesem Raum.",
      ),
      room,
      changed: false,
    };
  }

  const isLobbyCommand = command.type.startsWith("lobby.");
  const isInterruptionCommand = command.type.startsWith("game.interruption.");
  const isPreGameOnlyLobbyCommand =
    isLobbyCommand && command.type !== "lobby.leave";
  if (room.status !== "lobby" && isPreGameOnlyLobbyCommand) {
    return {
      ack: rejectedAck(
        commandId,
        room.sequence,
        "GAME_ALREADY_STARTED",
        "Die Partie wurde bereits gestartet.",
      ),
      room,
      changed: false,
    };
  }

  if (room.status === "lobby" && !isLobbyCommand) {
    return {
      ack: rejectedAck(
        commandId,
        room.sequence,
        "GAME_NOT_STARTED",
        "Die Partie wurde noch nicht gestartet.",
      ),
      room,
      changed: false,
    };
  }

  if (
    room.status === "started" &&
    !isLobbyCommand &&
    !isInterruptionCommand &&
    room.interruption.status !== "active"
  ) {
    return {
      ack: rejectedAck(
        commandId,
        room.sequence,
        "GAME_PAUSED",
        room.interruption.status === "aborted"
          ? "Die Partie wurde ohne Sieger abgebrochen."
          : "Die Partie ist wegen einer unterbrochenen Verbindung pausiert.",
      ),
      room,
      changed: false,
    };
  }

  const next = structuredClone(room);
  if (next.game) next.game = upgradeRoundState(next.game, next.roundCount);
  let accepted = true;
  let error: CommandAck["error"];

  switch (command.type) {
    case "lobby.setReady": {
      const target = next.members.find(
        (candidate) => candidate.playerId === playerId,
      );
      if (target) target.ready = command.ready;
      break;
    }
    case "lobby.setRounds":
      if (next.hostPlayerId !== playerId) {
        accepted = false;
        error = {
          code: "NOT_HOST",
          message: "Nur der Host kann die Rundenzahl ändern.",
        };
      } else {
        next.roundCount = command.roundCount;
      }
      break;
    case "lobby.start":
      if (next.hostPlayerId !== playerId) {
        accepted = false;
        error = {
          code: "NOT_HOST",
          message: "Nur der Host kann die Partie starten.",
        };
      } else if (next.members.length < 2 || next.members.length > 6) {
        accepted = false;
        error = {
          code: "INVALID_PLAYER_COUNT",
          message: "Zum Start werden 2 bis 6 Spieler benötigt.",
        };
      } else if (!next.members.every((candidate) => candidate.ready)) {
        accepted = false;
        error = {
          code: "NOT_ALL_READY",
          message: "Vor dem Start müssen alle Spieler bereit sein.",
        };
      } else {
        next.status = "started";
        next.game = createRound({
          players: next.members.map(({ playerId: memberPlayerId, seat }) => ({
            playerId: memberPlayerId,
            seat,
          })),
          random,
          roundCount: next.roundCount,
        });
      }
      break;
    case "lobby.leave": {
      if (next.status === "started") {
        accepted = false;
        error = {
          code: "INVALID_COMMAND",
          message:
            "Eine laufende Partie kann nur über die Unterbrechungsentscheidung abgebrochen werden.",
        };
        break;
      }
      next.members = next.members.filter(
        (candidate) => candidate.playerId !== playerId,
      );
      if (next.hostPlayerId === playerId && next.members.length > 0) {
        const candidates = next.members.filter(
          (candidate) => candidate.connected,
        );
        const pool = candidates.length > 0 ? candidates : next.members;
        next.hostPlayerId = pool.toSorted(
          (left, right) =>
            left.joinedAt.getTime() - right.joinedAt.getTime() ||
            left.seat - right.seat,
        )[0]!.playerId;
      }
      break;
    }
    case "game.interruption.timeout": {
      if (
        !next.game ||
        command.roundId !== next.game.id ||
        next.interruption.status !== "paused"
      ) {
        accepted = false;
        error = {
          code: "INVALID_COMMAND",
          message: "Diese Unterbrechung ist nicht mehr aktuell.",
        };
      } else if (
        next.interruption.reconnectDeadline === null ||
        now < next.interruption.reconnectDeadline
      ) {
        accepted = false;
        error = {
          code: "INTERRUPTION_NOT_EXPIRED",
          message: "Die Wiederbeitrittsfrist läuft noch.",
        };
      } else {
        next.interruption.status = "decision";
      }
      break;
    }
    case "game.interruption.wait": {
      if (
        !next.game ||
        command.roundId !== next.game.id ||
        next.interruption.status !== "decision"
      ) {
        accepted = false;
        error = {
          code: "INVALID_COMMAND",
          message: "Warten ist im aktuellen Zustand nicht verfügbar.",
        };
      } else if (next.hostPlayerId !== playerId) {
        accepted = false;
        error = {
          code: "NOT_HOST",
          message: "Nur der Host kann die Wartefrist verlängern.",
        };
      } else {
        next.interruption.status = "paused";
        next.interruption.reconnectDeadline = now + RECONNECT_WINDOW_MS;
      }
      break;
    }
    case "game.interruption.abort": {
      if (
        !next.game ||
        command.roundId !== next.game.id ||
        next.interruption.status !== "decision"
      ) {
        accepted = false;
        error = {
          code: "INVALID_COMMAND",
          message: "Abbrechen ist im aktuellen Zustand nicht verfügbar.",
        };
      } else if (next.hostPlayerId !== playerId) {
        accepted = false;
        error = {
          code: "NOT_HOST",
          message: "Nur der Host kann die Partie abbrechen.",
        };
      } else {
        next.interruption.status = "aborted";
        next.interruption.reconnectDeadline = null;
      }
      break;
    }
    case "game.closeInitialView":
    case "game.draw":
    case "game.discardDrawn":
    case "game.swapDrawn":
    case "game.effect.selectPosition":
    case "game.effect.activate":
    case "game.effect.selectPlayer":
    case "game.effect.skip":
    case "game.effect.closeView":
    case "game.effect.decideSwap":
    case "game.effect.timeout":
    case "game.react":
    case "game.completeTransfer":
    case "game.callKabu":
    case "game.finalReaction.timeout":
    case "game.readyNextRound": {
      if (!next.game) {
        accepted = false;
        error = {
          code: "GAME_NOT_STARTED",
          message: "Die Partie wurde noch nicht gestartet.",
        };
        break;
      }
      if (command.roundId !== next.game.id) {
        accepted = false;
        error = {
          code: "INVALID_TURN",
          message: "Diese Runde ist nicht mehr aktuell.",
        };
        break;
      }
      let result;
      if (command.type === "game.closeInitialView")
        result = closeInitialView(next.game, playerId, command.roundId);
      else if (command.type === "game.effect.activate")
        result = activateEffect(next.game, playerId, command.effectId, now);
      else if (command.type === "game.draw")
        result = drawCard(next.game, playerId, command.turnId, random);
      else if (command.type === "game.discardDrawn")
        result = discardDrawn(next.game, playerId, command.turnId, random, now);
      else if (command.type === "game.swapDrawn")
        result = swapDrawn(
          next.game,
          playerId,
          command.turnId,
          {
            positionId: command.positionId,
            occupancyVersion: command.occupancyVersion,
          },
          now,
        );
      else if (command.type === "game.effect.selectPosition")
        result = selectEffectPosition(
          next.game,
          playerId,
          command.effectId,
          {
            playerId: command.targetPlayerId,
            positionId: command.positionId,
            occupancyVersion: command.occupancyVersion,
          },
          now,
        );
      else if (command.type === "game.effect.selectPlayer")
        result = selectEffectPlayer(
          next.game,
          playerId,
          command.effectId,
          command.targetPlayerId,
          random,
          now,
        );
      else if (command.type === "game.effect.skip")
        result = skipEffect(next.game, playerId, command.effectId, now);
      else if (command.type === "game.effect.closeView")
        result = closeEffectView(next.game, playerId, command.effectId);
      else if (command.type === "game.effect.decideSwap")
        result = decideInspectSwap(
          next.game,
          playerId,
          command.effectId,
          command.swap,
          now,
        );
      else if (command.type === "game.effect.timeout")
        result = expireEffect(next.game, command.effectId, now);
      else if (command.type === "game.react")
        result = reactWithPosition(
          next.game,
          playerId,
          command.windowId,
          {
            playerId: command.targetPlayerId,
            positionId: command.positionId,
            occupancyVersion: command.occupancyVersion,
          },
          random,
          now,
          publicRevealDurationMs(),
        );
      else if (command.type === "game.completeTransfer")
        result = completeTransfer(next.game, playerId, command.transferId, {
          playerId,
          positionId: command.positionId,
          occupancyVersion: command.occupancyVersion,
        });
      else if (command.type === "game.callKabu")
        result = callKabu(next.game, playerId, command.turnId);
      else if (command.type === "game.finalReaction.timeout")
        result = expireFinalReaction(next.game, now);
      else result = readyForNextRound(next.game, playerId, random);
      if (result.ok) next.game = result.state;
      else {
        accepted = false;
        error = { code: result.code, message: result.message };
      }
      break;
    }
    case "game.dev.loadScenario": {
      if (!next.game) {
        accepted = false;
        error = {
          code: "GAME_NOT_STARTED",
          message: "Die Partie wurde noch nicht gestartet.",
        };
      } else if (process.env.KABU_ENABLE_TEST_SCENARIOS !== "true") {
        accepted = false;
        error = {
          code: "INVALID_COMMAND",
          message: "Testszenarien sind auf diesem Server deaktiviert.",
        };
      } else if (next.hostPlayerId !== playerId) {
        accepted = false;
        error = {
          code: "NOT_HOST",
          message: "Nur der Host kann ein Testszenario laden.",
        };
      } else if (command.roundId !== next.game.id) {
        accepted = false;
        error = {
          code: "INVALID_TURN",
          message: "Diese Runde ist nicht mehr aktuell.",
        };
      } else if (
        command.scenario === "m5-kabu-early-zero" &&
        next.game.players.length !== 3
      ) {
        accepted = false;
        error = {
          code: "INVALID_PLAYER_COUNT",
          message: "Dieses Testszenario benötigt genau drei Teilnehmer.",
        };
      } else if (
        command.scenario === "m6-four-player-grown-fields" &&
        next.game.players.length !== 4
      ) {
        accepted = false;
        error = {
          code: "INVALID_PLAYER_COUNT",
          message: "Dieses Testszenario benötigt genau vier Teilnehmer.",
        };
      } else {
        next.game = loadDevelopmentScenario(next.game, command.scenario);
        // Test fixtures may arrange round-local cards and phases, but the
        // room's pre-game setting remains authoritative across fixture loads.
        next.game.roundCount = next.roundCount;
      }
      break;
    }
  }

  if (!accepted) {
    return {
      ack: {
        commandId,
        accepted: false,
        duplicate: false,
        sequence: room.sequence,
        ...(error ? { error } : {}),
      },
      room,
      changed: false,
    };
  }

  next.sequence += 1;
  return {
    ack: {
      commandId,
      accepted: true,
      duplicate: false,
      sequence: next.sequence,
    },
    room: next,
    changed: true,
  };
}
