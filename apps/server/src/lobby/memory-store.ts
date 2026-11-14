import { randomUUID } from "node:crypto";

import type { CommandAck, LobbyCommand } from "@kabu/protocol";
import type { RandomSource } from "@kabu/game-core";

import {
  activeInterruption,
  applyConnectionChange,
  applyLobbyCommand,
  type CommandExecution,
  type GuestSession,
  LobbyError,
  type LobbyRoom,
  type LobbyStore,
  type StoredCommand,
  rejectedAck,
} from "./domain.js";
import { secureRandomSource } from "./random.js";

export class MemoryLobbyStore implements LobbyStore {
  private readonly sessions = new Map<string, GuestSession>();
  private readonly rooms = new Map<string, LobbyRoom>();
  private readonly roomCreatedAt = new Map<string, number>();
  private readonly commands = new Map<string, StoredCommand>();
  private serial: Promise<void> = Promise.resolve();

  constructor(private readonly random: RandomSource = secureRandomSource) {}

  async acquireWriterLease(): Promise<void> {}

  private async locked<T>(work: () => T | Promise<T>): Promise<T> {
    const previous = this.serial;
    let release = () => {};
    this.serial = new Promise<void>((resolve) => {
      release = resolve;
    });
    await previous;
    try {
      return await work();
    } finally {
      release();
    }
  }

  async findSession(tokenHash: string): Promise<GuestSession | undefined> {
    const session = this.sessions.get(tokenHash);
    if (!session || session.expiresAt.getTime() <= Date.now()) return undefined;
    return structuredClone(session);
  }

  async createSession(session: GuestSession): Promise<GuestSession> {
    return this.locked(() => {
      const existing = this.sessions.get(session.tokenHash);
      if (existing) return structuredClone(existing);
      this.sessions.set(session.tokenHash, structuredClone(session));
      return structuredClone(session);
    });
  }

  async createRoom(input: {
    code: string;
    playerId: string;
    name: string;
    roundCount: number;
  }): Promise<LobbyRoom> {
    return this.locked(() => {
      if (this.rooms.has(input.code)) {
        throw new LobbyError(
          "INVALID_COMMAND",
          "Der Raumcode ist bereits vergeben.",
          409,
        );
      }
      const now = new Date();
      const room: LobbyRoom = {
        id: randomUUID(),
        code: input.code,
        status: "lobby",
        hostPlayerId: input.playerId,
        roundCount: input.roundCount,
        sequence: 1,
        members: [
          {
            playerId: input.playerId,
            name: input.name,
            seat: 0,
            ready: false,
            connected: false,
            joinedAt: now,
          },
        ],
        game: null,
        interruption: activeInterruption(),
      };
      this.rooms.set(input.code, room);
      this.roomCreatedAt.set(input.code, now.getTime());
      return structuredClone(room);
    });
  }

  async joinRoom(input: {
    code: string;
    playerId: string;
    name: string;
  }): Promise<LobbyRoom> {
    return this.locked(() => {
      const room = this.rooms.get(input.code);
      if (!room) {
        throw new LobbyError(
          "ROOM_NOT_FOUND",
          "Dieser Raum wurde nicht gefunden.",
          404,
        );
      }
      const existing = room.members.find(
        (member) => member.playerId === input.playerId,
      );
      if (existing) return structuredClone(room);
      if (room.status !== "lobby") {
        throw new LobbyError(
          "GAME_ALREADY_STARTED",
          "Die Partie wurde bereits gestartet.",
          409,
        );
      }
      if (room.members.length >= 6) {
        throw new LobbyError("ROOM_FULL", "Der Raum ist bereits voll.", 409);
      }
      const occupied = new Set(room.members.map((member) => member.seat));
      const seat = [0, 1, 2, 3, 4, 5].find(
        (candidate) => !occupied.has(candidate),
      );
      if (seat === undefined) {
        throw new LobbyError("ROOM_FULL", "Der Raum ist bereits voll.", 409);
      }
      room.members.push({
        playerId: input.playerId,
        name: input.name,
        seat,
        ready: false,
        connected: false,
        joinedAt: new Date(),
      });
      room.sequence += 1;
      return structuredClone(room);
    });
  }

  async getRoomForPlayer(
    code: string,
    playerId: string,
  ): Promise<LobbyRoom | undefined> {
    const room = this.rooms.get(code);
    if (!room) return undefined;
    if (!room.members.some((member) => member.playerId === playerId)) {
      return undefined;
    }
    return structuredClone(room);
  }

  async setConnected(
    code: string,
    playerId: string,
    connected: boolean,
  ): Promise<LobbyRoom | undefined> {
    return this.locked(() => {
      const room = this.rooms.get(code);
      if (!room) return undefined;
      const result = applyConnectionChange(room, playerId, connected);
      if (result.changed) this.rooms.set(code, result.room);
      return structuredClone(result.room);
    });
  }

  async executeCommand(input: {
    code: string;
    playerId: string;
    commandId: string;
    payloadHash: string;
    command: LobbyCommand;
    receivedAt?: number;
  }): Promise<CommandExecution> {
    const startedAt = performance.now();
    const result = await this.locked(() => {
      const room = this.rooms.get(input.code);
      if (!room) {
        return {
          ack: rejectedAck(
            input.commandId,
            0,
            "ROOM_NOT_FOUND",
            "Dieser Raum wurde nicht gefunden.",
          ),
          room: undefined,
          changed: false,
        };
      }
      const key = `${room.id}:${input.playerId}:${input.commandId}`;
      const previous = this.commands.get(key);
      if (previous) {
        if (previous.payloadHash !== input.payloadHash) {
          return {
            ack: {
              ...rejectedAck(
                input.commandId,
                room.sequence,
                "COMMAND_ID_CONFLICT",
                "Diese Befehls-ID wurde bereits anders verwendet.",
              ),
              duplicate: true,
            },
            room: structuredClone(room),
            changed: false,
          };
        }
        return {
          ack: { ...structuredClone(previous.ack), duplicate: true },
          room: structuredClone(room),
          changed: false,
        };
      }
      const result = applyLobbyCommand(
        room,
        input.playerId,
        input.commandId,
        input.command,
        this.random,
        input.receivedAt,
      );
      if (result.changed) this.rooms.set(input.code, result.room);
      this.commands.set(key, {
        payloadHash: input.payloadHash,
        ack: structuredClone(result.ack),
      });
      return {
        ack: result.ack,
        room: structuredClone(result.room),
        changed: result.changed,
      };
    });
    return { ...result, persistenceMs: performance.now() - startedAt };
  }

  async getCommandResult(
    code: string,
    playerId: string,
    commandId: string,
  ): Promise<CommandAck | undefined> {
    return this.locked(() => {
      const room = this.rooms.get(code);
      if (!room?.members.some((member) => member.playerId === playerId))
        return undefined;
      return structuredClone(
        this.commands.get(`${room.id}:${playerId}:${commandId}`)?.ack,
      );
    });
  }

  async recoverStartedRooms(now = Date.now()): Promise<LobbyRoom[]> {
    return this.locked(() => {
      const recovered: LobbyRoom[] = [];
      for (const [code, room] of this.rooms) {
        if (room.status !== "started") continue;
        const next = structuredClone(room);
        for (const member of next.members) member.connected = false;
        if (next.interruption.status !== "aborted") {
          next.interruption = {
            status: "paused",
            missingPlayerIds: next.members.map((member) => member.playerId),
            pausedAt: next.interruption.pausedAt ?? now,
            reconnectDeadline:
              next.interruption.reconnectDeadline ?? now + 90_000,
          };
        }
        next.sequence += 1;
        this.rooms.set(code, next);
        recovered.push(structuredClone(next));
      }
      return recovered;
    });
  }

  async cleanupExpired(now = new Date()): Promise<void> {
    await this.locked(() => {
      const cutoff = now.getTime() - 7 * 24 * 60 * 60 * 1000;
      for (const [code, room] of this.rooms) {
        if (
          room.status === "lobby" &&
          (this.roomCreatedAt.get(code) ?? now.getTime()) < cutoff
        ) {
          this.rooms.delete(code);
          this.roomCreatedAt.delete(code);
        }
      }
      const referencedPlayers = new Set(
        [...this.rooms.values()].flatMap((room) =>
          room.members.map((member) => member.playerId),
        ),
      );
      for (const [hash, session] of this.sessions) {
        if (
          session.expiresAt.getTime() <= now.getTime() &&
          !referencedPlayers.has(session.playerId)
        ) {
          this.sessions.delete(hash);
        }
      }
    });
  }

  async close(): Promise<void> {}
}
