import { createHash, randomBytes, randomUUID } from "node:crypto";

import type {
  LobbyCommand,
  LobbySnapshot,
  RoomCommandEnvelope,
} from "@kabu/protocol";

import {
  type CommandExecution,
  type GuestSession,
  LobbyError,
  type LobbyStore,
  snapshotFor,
} from "./domain.js";

const ROOM_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const SESSION_DURATION_MS = 30 * 24 * 60 * 60 * 1000;

export function hashSessionToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function hashCommand(command: LobbyCommand): string {
  return createHash("sha256").update(JSON.stringify(command)).digest("hex");
}

function createRoomCode(): string {
  const bytes = randomBytes(6);
  return [...bytes]
    .map((byte) => ROOM_ALPHABET[byte % ROOM_ALPHABET.length])
    .join("");
}

function validSessionToken(token: string | undefined): token is string {
  return token !== undefined && /^[A-Za-z0-9_-]{43}$/u.test(token);
}

export class LobbyService {
  constructor(private readonly store: LobbyStore) {}

  async ensureSession(
    rawToken: string | undefined,
  ): Promise<{ session: GuestSession; newToken?: string }> {
    if (validSessionToken(rawToken)) {
      const existing = await this.store.findSession(hashSessionToken(rawToken));
      if (existing) return { session: existing };
    }

    const token = randomBytes(32).toString("base64url");
    const session = await this.store.createSession({
      playerId: randomUUID(),
      tokenHash: hashSessionToken(token),
      expiresAt: new Date(Date.now() + SESSION_DURATION_MS),
    });
    return { session, newToken: token };
  }

  async authenticate(rawToken: string | undefined): Promise<GuestSession> {
    if (!validSessionToken(rawToken)) {
      throw new LobbyError(
        "INVALID_COMMAND",
        "Eine gültige Gastsitzung ist erforderlich.",
        401,
      );
    }
    const session = await this.store.findSession(hashSessionToken(rawToken));
    if (!session) {
      throw new LobbyError(
        "INVALID_COMMAND",
        "Die Gastsitzung ist ungültig oder abgelaufen.",
        401,
      );
    }
    return session;
  }

  async createRoom(
    playerId: string,
    name: string,
    roundCount: number,
  ): Promise<LobbySnapshot> {
    for (let attempt = 0; attempt < 8; attempt += 1) {
      try {
        const room = await this.store.createRoom({
          code: createRoomCode(),
          playerId,
          name,
          roundCount,
        });
        return snapshotFor(room, playerId);
      } catch (error) {
        if (!(error instanceof LobbyError) || error.statusCode !== 409) {
          throw error;
        }
      }
    }
    throw new Error("Could not allocate a unique room code");
  }

  async joinRoom(
    playerId: string,
    code: string,
    name: string,
  ): Promise<LobbySnapshot> {
    const room = await this.store.joinRoom({ code, playerId, name });
    return snapshotFor(room, playerId);
  }

  async getSnapshot(
    playerId: string,
    code: string,
  ): Promise<LobbySnapshot | undefined> {
    const room = await this.store.getRoomForPlayer(code, playerId);
    return room ? snapshotFor(room, playerId) : undefined;
  }

  async setConnected(
    playerId: string,
    code: string,
    connected: boolean,
  ): Promise<boolean> {
    return (
      (await this.store.setConnected(code, playerId, connected)) !== undefined
    );
  }

  async executeCommand(
    playerId: string,
    envelope: RoomCommandEnvelope,
    receivedAt = Date.now(),
  ): Promise<CommandExecution> {
    return this.store.executeCommand({
      code: envelope.roomCode,
      playerId,
      commandId: envelope.commandId,
      payloadHash: hashCommand(envelope.command),
      command: envelope.command,
      receivedAt,
    });
  }

  async getCommandResult(playerId: string, code: string, commandId: string) {
    return this.store.getCommandResult(code, playerId, commandId);
  }

  async recoverStartedRooms(now = Date.now()) {
    return this.store.recoverStartedRooms(now);
  }

  async cleanupExpired(now = new Date()) {
    await this.store.cleanupExpired(now);
  }
}
