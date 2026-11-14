import postgres from "postgres";

import type { CommandAck, LobbyCommand } from "@kabu/protocol";
import type { RandomSource, RoundState } from "@kabu/game-core";

import {
  activeInterruption,
  applyConnectionChange,
  applyLobbyCommand,
  type CommandExecution,
  type GuestSession,
  LobbyError,
  type LobbyMember,
  type LobbyRoom,
  type LobbyStore,
  type InterruptionState,
  rejectedAck,
} from "./domain.js";
import { secureRandomSource } from "./random.js";

interface SessionRow {
  player_id: string;
  token_hash: string;
  expires_at: Date;
}

interface RoomRow {
  id: string;
  code: string;
  status: "lobby" | "started";
  host_player_id: string;
  round_count: number;
  sequence: number;
  game_state: RoundState | null;
  interruption_state: InterruptionState | null;
}

interface MemberRow {
  player_id: string;
  display_name: string;
  seat: number;
  ready: boolean;
  connected: boolean;
  joined_at: Date;
}

interface CommandRow {
  payload_hash: string;
  result: CommandAck;
}

function mapSession(row: SessionRow): GuestSession {
  return {
    playerId: row.player_id,
    tokenHash: row.token_hash,
    expiresAt: new Date(row.expires_at),
  };
}

function mapMember(row: MemberRow): LobbyMember {
  return {
    playerId: row.player_id,
    name: row.display_name,
    seat: row.seat,
    ready: row.ready,
    connected: row.connected,
    joinedAt: new Date(row.joined_at),
  };
}

async function loadRoom(
  sql: postgres.Sql,
  code: string,
  lock: boolean,
): Promise<LobbyRoom | undefined> {
  const rows = lock
    ? await sql<RoomRow[]>`
        SELECT id, code, status, host_player_id, round_count,
               sequence::integer AS sequence, game_state, interruption_state
        FROM rooms
        WHERE code = ${code}
        FOR UPDATE
      `
    : await sql<RoomRow[]>`
        SELECT id, code, status, host_player_id, round_count,
               sequence::integer AS sequence, game_state, interruption_state
        FROM rooms
        WHERE code = ${code}
      `;
  const row = rows[0];
  if (!row) return undefined;
  const members = await sql<MemberRow[]>`
    SELECT player_id, display_name, seat, ready, connected, joined_at
    FROM room_memberships
    WHERE room_id = ${row.id}
    ORDER BY seat
  `;
  return {
    id: row.id,
    code: row.code,
    status: row.status,
    hostPlayerId: row.host_player_id,
    roundCount: row.round_count,
    sequence: row.sequence,
    members: members.map(mapMember),
    game: row.game_state,
    interruption: row.interruption_state ?? activeInterruption(),
  };
}

export class PostgresLobbyStore implements LobbyStore {
  private readonly sql: postgres.Sql;
  private writerLease: postgres.ReservedSql | undefined;
  private heartbeatTimer: NodeJS.Timeout | undefined;
  private previousHeartbeatAt: number | undefined;

  constructor(
    databaseUrl: string,
    private readonly random: RandomSource = secureRandomSource,
  ) {
    this.sql = postgres(databaseUrl, { max: 10 });
  }

  async acquireWriterLease(): Promise<void> {
    if (this.writerLease) return;
    const connection = await this.sql.reserve();
    const rows = await connection<{ acquired: boolean }[]>`
      SELECT pg_try_advisory_lock(126256622117)::boolean AS acquired
    `;
    if (!rows[0]?.acquired) {
      connection.release();
      throw new Error(
        "Eine andere Kabu-Serverinstanz besitzt bereits die Schreibberechtigung.",
      );
    }
    this.writerLease = connection;
    const previous = await connection<{ value: string }[]>`
      SELECT value FROM system_metadata WHERE key = 'server_heartbeat'
    `;
    const parsed = Number(previous[0]?.value);
    if (Number.isFinite(parsed)) this.previousHeartbeatAt = parsed;
    const heartbeat = async () => {
      await connection`
        INSERT INTO system_metadata (key, value, updated_at)
        VALUES ('server_heartbeat', ${String(Date.now())}, now())
        ON CONFLICT (key) DO UPDATE
        SET value = EXCLUDED.value, updated_at = EXCLUDED.updated_at
      `;
    };
    await heartbeat();
    this.heartbeatTimer = setInterval(() => {
      void heartbeat().catch(() => undefined);
    }, 1_000);
    this.heartbeatTimer.unref();
  }

  async findSession(tokenHash: string): Promise<GuestSession | undefined> {
    const rows = await this.sql<SessionRow[]>`
      UPDATE guest_sessions
      SET last_seen_at = now()
      WHERE token_hash = ${tokenHash} AND expires_at > now()
      RETURNING player_id, token_hash, expires_at
    `;
    return rows[0] ? mapSession(rows[0]) : undefined;
  }

  async createSession(session: GuestSession): Promise<GuestSession> {
    const rows = await this.sql<SessionRow[]>`
      INSERT INTO guest_sessions (player_id, token_hash, expires_at)
      VALUES (${session.playerId}, ${session.tokenHash}, ${session.expiresAt})
      ON CONFLICT (token_hash) DO UPDATE SET last_seen_at = now()
      RETURNING player_id, token_hash, expires_at
    `;
    return mapSession(rows[0]!);
  }

  async createRoom(input: {
    code: string;
    playerId: string;
    name: string;
    roundCount: number;
  }): Promise<LobbyRoom> {
    try {
      return await this.sql.begin(async (transaction) => {
        const rows = await transaction<RoomRow[]>`
          INSERT INTO rooms (
            code, status, host_player_id, round_count, sequence
          )
          VALUES (${input.code}, 'lobby', ${input.playerId}, ${input.roundCount}, 1)
          RETURNING id, code, status, host_player_id, round_count,
                    sequence::integer AS sequence, game_state, interruption_state
        `;
        const room = rows[0]!;
        await transaction`
          INSERT INTO room_memberships (
            room_id, player_id, display_name, seat
          )
          VALUES (${room.id}, ${input.playerId}, ${input.name}, 0)
        `;
        return (await loadRoom(transaction, input.code, false))!;
      });
    } catch (error) {
      if (error instanceof postgres.PostgresError && error.code === "23505") {
        throw new LobbyError(
          "INVALID_COMMAND",
          "Der Raumcode ist bereits vergeben.",
          409,
        );
      }
      throw error;
    }
  }

  async joinRoom(input: {
    code: string;
    playerId: string;
    name: string;
  }): Promise<LobbyRoom> {
    return this.sql.begin(async (transaction) => {
      const room = await loadRoom(transaction, input.code, true);
      if (!room) {
        throw new LobbyError(
          "ROOM_NOT_FOUND",
          "Dieser Raum wurde nicht gefunden.",
          404,
        );
      }
      if (room.members.some((member) => member.playerId === input.playerId)) {
        return room;
      }
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
      await transaction`
        INSERT INTO room_memberships (
          room_id, player_id, display_name, seat
        )
        VALUES (${room.id}, ${input.playerId}, ${input.name}, ${seat})
      `;
      await transaction`
        UPDATE rooms SET sequence = sequence + 1 WHERE id = ${room.id}
      `;
      return (await loadRoom(transaction, input.code, false))!;
    });
  }

  async getRoomForPlayer(
    code: string,
    playerId: string,
  ): Promise<LobbyRoom | undefined> {
    const room = await loadRoom(this.sql, code, false);
    if (!room?.members.some((member) => member.playerId === playerId)) {
      return undefined;
    }
    return room;
  }

  async setConnected(
    code: string,
    playerId: string,
    connected: boolean,
  ): Promise<LobbyRoom | undefined> {
    return this.sql.begin(async (transaction) => {
      const room = await loadRoom(transaction, code, true);
      if (!room) return undefined;
      const result = applyConnectionChange(room, playerId, connected);
      if (result.changed) {
        const member = result.room.members.find(
          (candidate) => candidate.playerId === playerId,
        )!;
        await transaction`
          UPDATE room_memberships
          SET connected = ${member.connected}
          WHERE room_id = ${room.id} AND player_id = ${playerId}
        `;
        await transaction`
          UPDATE rooms
          SET sequence = ${result.room.sequence},
              game_state = ${transaction.json(result.room.game as unknown as postgres.JSONValue)},
              interruption_state = ${transaction.json(result.room.interruption as unknown as postgres.JSONValue)}
          WHERE id = ${room.id}
        `;
        await transaction`
          INSERT INTO room_events (room_id, sequence, event_type, actor_player_id)
          VALUES (
            ${room.id},
            ${result.room.sequence},
            ${connected ? "presence.connected" : "presence.disconnected"},
            ${playerId}
          )
        `;
      }
      return loadRoom(transaction, code, false);
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
    const result = await this.sql.begin(async (transaction) => {
      const room = await loadRoom(transaction, input.code, true);
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
      const previousRows = await transaction<CommandRow[]>`
        SELECT payload_hash, result
        FROM room_commands
        WHERE room_id = ${room.id}
          AND player_id = ${input.playerId}
          AND command_id = ${input.commandId}
      `;
      const previous = previousRows[0];
      if (previous) {
        if (previous.payload_hash !== input.payloadHash) {
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
            room,
            changed: false,
          };
        }
        return {
          ack: { ...previous.result, duplicate: true },
          room,
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
      if (result.changed) {
        await transaction`
          UPDATE rooms
          SET status = ${result.room.status},
              host_player_id = ${result.room.hostPlayerId},
              round_count = ${result.room.roundCount},
              sequence = ${result.room.sequence},
              game_state = ${transaction.json(result.room.game as unknown as postgres.JSONValue)},
              interruption_state = ${transaction.json(result.room.interruption as unknown as postgres.JSONValue)},
              started_at = CASE
                WHEN ${result.room.status} = 'started'
                THEN COALESCE(started_at, now())
                ELSE started_at
              END
          WHERE id = ${room.id}
        `;
        const nextPlayerIds = new Set(
          result.room.members.map((member) => member.playerId),
        );
        for (const oldMember of room.members) {
          if (!nextPlayerIds.has(oldMember.playerId)) {
            await transaction`
              DELETE FROM room_memberships
              WHERE room_id = ${room.id}
                AND player_id = ${oldMember.playerId}
            `;
          }
        }
        for (const member of result.room.members) {
          await transaction`
            UPDATE room_memberships
            SET ready = ${member.ready}, connected = ${member.connected}
            WHERE room_id = ${room.id} AND player_id = ${member.playerId}
          `;
        }
        await transaction`
          INSERT INTO room_events (room_id, sequence, event_type, actor_player_id)
          VALUES (${room.id}, ${result.room.sequence}, ${input.command.type}, ${input.playerId})
        `;
      }
      await transaction`
        INSERT INTO room_commands (
          room_id, player_id, command_id, payload_hash, result
        )
        VALUES (
          ${room.id},
          ${input.playerId},
          ${input.commandId},
          ${input.payloadHash},
          ${transaction.json(result.ack)}
        )
      `;
      return result;
    });
    return { ...result, persistenceMs: performance.now() - startedAt };
  }

  async getCommandResult(
    code: string,
    playerId: string,
    commandId: string,
  ): Promise<CommandAck | undefined> {
    return this.sql.begin(async (transaction) => {
      const room = await loadRoom(transaction, code, true);
      if (!room?.members.some((member) => member.playerId === playerId))
        return undefined;
      const rows = await transaction<{ result: CommandAck }[]>`
        SELECT result FROM room_commands
        WHERE room_id = ${room.id}
          AND player_id = ${playerId}
          AND command_id = ${commandId}
      `;
      return rows[0]?.result;
    });
  }

  async recoverStartedRooms(now = Date.now()): Promise<LobbyRoom[]> {
    return this.sql.begin(async (transaction) => {
      const codes = await transaction<{ code: string }[]>`
        SELECT code FROM rooms WHERE status = 'started' FOR UPDATE
      `;
      const recovered: LobbyRoom[] = [];
      for (const { code } of codes) {
        const room = await loadRoom(transaction, code, false);
        if (!room) continue;
        const lastKnownRunningAt = Math.min(
          now,
          this.previousHeartbeatAt ?? now,
        );
        const interruption =
          room.interruption.status === "aborted"
            ? room.interruption
            : {
                status: "paused" as const,
                missingPlayerIds: room.members.map((member) => member.playerId),
                pausedAt: room.interruption.pausedAt ?? lastKnownRunningAt,
                reconnectDeadline:
                  room.interruption.reconnectDeadline ??
                  lastKnownRunningAt + 90_000,
              };
        await transaction`
          UPDATE room_memberships SET connected = false WHERE room_id = ${room.id}
        `;
        await transaction`
          UPDATE rooms
          SET sequence = sequence + 1,
              interruption_state = ${transaction.json(interruption as unknown as postgres.JSONValue)}
          WHERE id = ${room.id}
        `;
        recovered.push((await loadRoom(transaction, code, false))!);
      }
      return recovered;
    });
  }

  async cleanupExpired(now = new Date()): Promise<void> {
    await this.sql.begin(async (transaction) => {
      await transaction`
        DELETE FROM rooms
        WHERE status = 'lobby'
          AND created_at < ${new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)}
      `;
      await transaction`
        DELETE FROM guest_sessions s
        WHERE s.expires_at <= ${now}
          AND NOT EXISTS (
            SELECT 1 FROM room_memberships m WHERE m.player_id = s.player_id
          )
      `;
    });
  }

  async close(): Promise<void> {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = undefined;
    }
    if (this.writerLease) {
      await this.writerLease`SELECT pg_advisory_unlock(126256622117)`;
      this.writerLease.release();
      this.writerLease = undefined;
    }
    await this.sql.end();
  }
}
