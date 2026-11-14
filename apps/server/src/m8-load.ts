import { randomUUID } from "node:crypto";
import { performance } from "node:perf_hooks";
import { io as createClient, type Socket } from "socket.io-client";

import type {
  ClientToServerEvents,
  CommandAck,
  LobbyCommand,
  LobbySnapshot,
  RoomSubscriptionResult,
  ServerToClientEvents,
} from "@kabu/protocol";

import { buildApp } from "./app.js";
import { MemoryLobbyStore } from "./lobby/memory-store.js";
import { PostgresLobbyStore } from "./lobby/postgres-store.js";

type LoadSocket = Socket<ServerToClientEvents, ClientToServerEvents>;
interface LoadPlayer {
  cookie: string;
  playerId: string;
  socket: LoadSocket;
}
interface LoadRoom {
  code: string;
  players: LoadPlayer[];
}

const roomCount = Number(process.env.M8_LOAD_ROOMS ?? 20);
const turnsPerRoom = Number(process.env.M8_LOAD_TURNS ?? 8);
if (!Number.isInteger(roomCount) || roomCount < 1 || roomCount > 100) {
  throw new Error("M8_LOAD_ROOMS must be an integer from 1 to 100");
}

const databaseUrl = process.env.M8_DATABASE_URL;
const store = databaseUrl
  ? new PostgresLobbyStore(databaseUrl)
  : new MemoryLobbyStore();
process.env.KABU_ENABLE_TEST_SCENARIOS = "true";
const app = await buildApp({
  serveWeb: false,
  store,
  commandRateLimit: 2_000,
  joinRateLimit: 2_000,
});
await app.listen({ host: "127.0.0.1", port: 0 });

const command = (socket: LoadSocket, roomCode: string, value: LobbyCommand) =>
  new Promise<CommandAck>((resolve) => {
    socket.emit(
      "room:command",
      { commandId: randomUUID(), roomCode, command: value },
      resolve,
    );
  });

async function createSession() {
  const response = await app.inject({ method: "POST", url: "/api/session" });
  const cookie = String(response.headers["set-cookie"]).split(";", 1)[0]!;
  return { cookie, playerId: response.json().playerId as string };
}

async function connect(cookie: string, code: string) {
  const socket: LoadSocket = createClient(app.listeningOrigin, {
    transports: ["websocket"],
    extraHeaders: { cookie },
  });
  await new Promise<void>((resolve, reject) => {
    socket.once("connect", resolve);
    socket.once("connect_error", reject);
  });
  await new Promise<void>((resolve, reject) => {
    socket.emit(
      "room:subscribe",
      { roomCode: code },
      (result: RoomSubscriptionResult) =>
        result.ok ? resolve() : reject(new Error(result.error.code)),
    );
  });
  return socket;
}

async function snapshot(room: LoadRoom, player = room.players[0]!) {
  const response = await app.inject({
    method: "GET",
    url: `/api/rooms/${room.code}`,
    headers: { cookie: player.cookie },
  });
  if (response.statusCode !== 200) throw new Error(response.body);
  return response.json() as LobbySnapshot;
}

async function prepareRoom(index: number): Promise<LoadRoom> {
  const sessions = await Promise.all(
    Array.from({ length: 6 }, () => createSession()),
  );
  const created = await app.inject({
    method: "POST",
    url: "/api/rooms",
    headers: { cookie: sessions[0]!.cookie },
    payload: { name: `R${index}P0`, roundCount: 10 },
  });
  const code = created.json().snapshot.room.code as string;
  await Promise.all(
    sessions.slice(1).map((session, playerIndex) =>
      app.inject({
        method: "POST",
        url: "/api/rooms/join",
        headers: { cookie: session.cookie },
        payload: { code, name: `R${index}P${playerIndex + 1}` },
      }),
    ),
  );
  const sockets = await Promise.all(
    sessions.map((session) => connect(session.cookie, code)),
  );
  const room: LoadRoom = {
    code,
    players: sessions.map((session, playerIndex) => ({
      ...session,
      socket: sockets[playerIndex]!,
    })),
  };
  await Promise.all(
    room.players.map((player) =>
      command(player.socket, code, { type: "lobby.setReady", ready: true }),
    ),
  );
  const started = await command(room.players[0]!.socket, code, {
    type: "lobby.start",
  });
  if (!started.accepted)
    throw new Error(`start failed: ${started.error?.code}`);
  const initial = await snapshot(room);
  await Promise.all(
    room.players.map((player) =>
      command(player.socket, code, {
        type: "game.closeInitialView",
        roundId: initial.game!.id,
      }),
    ),
  );
  return room;
}

const startedAt = performance.now();
const rooms = await Promise.all(
  Array.from({ length: roomCount }, (_, index) => prepareRoom(index)),
);
let attemptedCommands = roomCount * 13;

for (let turn = 0; turn < turnsPerRoom; turn += 1) {
  await Promise.all(
    rooms.map(async (room) => {
      const before = await snapshot(room);
      const game = before.game!;
      const actor = room.players.find(
        (player) => player.playerId === game.activePlayerId,
      )!;
      const draw = await command(actor.socket, room.code, {
        type: "game.draw",
        roundId: game.id,
        turnId: game.turn.id,
      });
      if (!draw.accepted) throw new Error(`draw failed: ${draw.error?.code}`);
      const afterDraw = await snapshot(room, actor);
      const position = afterDraw
        .game!.players.find((player) => player.playerId === actor.playerId)!
        .positions.find((candidate) => candidate.occupied)!;
      const swap = await command(actor.socket, room.code, {
        type: "game.swapDrawn",
        roundId: game.id,
        turnId: game.turn.id,
        positionId: position.id,
        occupancyVersion: position.occupancyVersion,
      });
      if (!swap.accepted) throw new Error(`swap failed: ${swap.error?.code}`);
    }),
  );
  attemptedCommands += roomCount * 2;

  if (turn % 2 === 1) {
    await Promise.all(
      rooms.map(async (room) => {
        const before = await snapshot(room);
        const loaded = await command(room.players[0]!.socket, room.code, {
          type: "game.dev.loadScenario",
          roundId: before.game!.id,
          scenario: "reaction-two-wrong",
        });
        if (!loaded.accepted)
          throw new Error(`fixture failed: ${loaded.error?.code}`);
        const fixture = await snapshot(room);
        await Promise.all(
          room.players.map((player) => {
            const position = fixture
              .game!.players.find(
                (candidate) => candidate.playerId === player.playerId,
              )!
              .positions.find((candidate) => candidate.occupied)!;
            return command(player.socket, room.code, {
              type: "game.react",
              roundId: fixture.game!.id,
              windowId: fixture.game!.reactionWindow!.id,
              targetPlayerId: player.playerId,
              positionId: position.id,
              occupancyVersion: position.occupancyVersion,
            });
          }),
        );
      }),
    );
    attemptedCommands += roomCount * 7;
  }
}

const metricsResponse = await app.inject({
  method: "GET",
  url: "/api/metrics",
});
const report = {
  environment: {
    node: process.version,
    store: databaseUrl ? "postgresql" : "memory",
    rooms: roomCount,
    clientsPerRoom: 6,
    turnsPerRoom,
  },
  durationMs: Math.round(performance.now() - startedAt),
  attemptedCommands,
  metrics: metricsResponse.json(),
};
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);

for (const room of rooms)
  for (const player of room.players) player.socket.disconnect();
await app.close();
