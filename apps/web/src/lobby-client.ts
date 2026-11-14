import { io, type Socket } from "socket.io-client";

import {
  ApiErrorSchema,
  LobbySnapshotSchema,
  RoomResponseSchema,
  SessionResponseSchema,
  type ClientToServerEvents,
  type CommandAck,
  type LobbyCommand,
  type LobbySnapshot,
  type RoomCommandEnvelope,
  type ServerToClientEvents,
} from "@kabu/protocol";

export class ApiClientError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
  }
}

async function parseResponse<T>(
  response: Response,
  parser: { parse(value: unknown): T },
): Promise<T> {
  const payload: unknown = await response.json();
  if (!response.ok) {
    const parsed = ApiErrorSchema.safeParse(payload);
    throw new ApiClientError(
      parsed.success
        ? parsed.data.error.message
        : "Die Anfrage ist fehlgeschlagen.",
      response.status,
    );
  }
  return parser.parse(payload);
}

export async function ensureSession(
  fetcher: typeof fetch = fetch,
): Promise<void> {
  const response = await fetcher("/api/session", {
    method: "POST",
    credentials: "same-origin",
  });
  await parseResponse(response, SessionResponseSchema);
}

export async function createRoom(
  name: string,
  roundCount: number,
  fetcher: typeof fetch = fetch,
): Promise<LobbySnapshot> {
  const response = await fetcher("/api/rooms", {
    method: "POST",
    credentials: "same-origin",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name, roundCount }),
  });
  return (await parseResponse(response, RoomResponseSchema)).snapshot;
}

export async function joinRoom(
  code: string,
  name: string,
  fetcher: typeof fetch = fetch,
): Promise<LobbySnapshot> {
  const response = await fetcher("/api/rooms/join", {
    method: "POST",
    credentials: "same-origin",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ code, name }),
  });
  return (await parseResponse(response, RoomResponseSchema)).snapshot;
}

export async function fetchRoom(
  code: string,
  fetcher: typeof fetch = fetch,
): Promise<LobbySnapshot> {
  const response = await fetcher(`/api/rooms/${encodeURIComponent(code)}`, {
    credentials: "same-origin",
    headers: { accept: "application/json" },
  });
  return parseResponse(response, LobbySnapshotSchema);
}

export type LobbySocket = Socket<ServerToClientEvents, ClientToServerEvents>;

export function openLobbySocket(): LobbySocket {
  return io({
    autoConnect: true,
    withCredentials: true,
  });
}

export function classifySnapshotSequence(
  current: number,
  incoming: number,
): "stale" | "apply" | "resync" {
  if (incoming < current) return "stale";
  if (incoming > current + 1) return "resync";
  return "apply";
}

export function redactTransientSecrets(snapshot: LobbySnapshot): LobbySnapshot {
  if (!snapshot.game) return snapshot;
  const safeYou = { ...snapshot.game.you };
  delete safeYou.privateEffect;
  return {
    ...snapshot,
    game: {
      ...snapshot.game,
      publicReveals: [],
      you: safeYou,
    },
  };
}

interface CommandCrypto {
  randomUUID?: () => string;
  getRandomValues(bytes: Uint8Array): Uint8Array;
}

export function createCommandId(source: CommandCrypto = crypto): string {
  if (typeof source.randomUUID === "function") {
    return source.randomUUID();
  }

  const bytes = source.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6]! & 0x0f) | 0x40;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = [...bytes].map((byte) => byte.toString(16).padStart(2, "0"));

  return [
    hex.slice(0, 4).join(""),
    hex.slice(4, 6).join(""),
    hex.slice(6, 8).join(""),
    hex.slice(8, 10).join(""),
    hex.slice(10, 16).join(""),
  ].join("-");
}

export function sendCommand(
  socket: LobbySocket,
  roomCode: string,
  command: LobbyCommand,
  commandId = createCommandId(),
): Promise<CommandAck> {
  const envelope: RoomCommandEnvelope = {
    commandId,
    roomCode,
    command,
  };
  return new Promise((resolve, reject) => {
    socket.volatile
      .timeout(5_000)
      .emit("room:command", envelope, (error, ack) => {
        if (error)
          reject(new Error("Der Server hat nicht rechtzeitig geantwortet."));
        else resolve(ack);
      });
  });
}

export function takeOverControl(
  socket: LobbySocket,
  roomCode: string,
): Promise<LobbySnapshot> {
  return new Promise((resolve, reject) => {
    socket
      .timeout(5_000)
      .emit("room:takeover", { roomCode }, (error, result) => {
        if (error) reject(new Error("Die Übernahme wurde nicht bestätigt."));
        else if (!result.ok) reject(new Error(result.error.message));
        else resolve(result.snapshot);
      });
  });
}

export function getCommandStatus(
  socket: LobbySocket,
  roomCode: string,
  commandId: string,
): Promise<CommandAck | undefined> {
  return new Promise((resolve, reject) => {
    socket
      .timeout(5_000)
      .emit("room:commandStatus", { roomCode, commandId }, (error, result) => {
        if (error) reject(new Error("Der Befehlsstatus ist noch ungeklärt."));
        else resolve(result.status === "resolved" ? result.ack : undefined);
      });
  });
}
