import { randomUUID } from "node:crypto";
import {
  io as createClient,
  type Socket as ClientSocket,
} from "socket.io-client";
import { afterEach, describe, expect, it, vi } from "vitest";

import type {
  ClientToServerEvents,
  CommandAck,
  LobbyCommand,
  LobbySnapshot,
  RoomCommandEnvelope,
  ServerToClientEvents,
} from "@kabu/protocol";
import type { RandomSource } from "@kabu/game-core";

import { buildApp } from "../app.js";
import { MemoryLobbyStore } from "./memory-store.js";

class FailingMemoryStore extends MemoryLobbyStore {
  failCommands = false;

  override async executeCommand(
    input: Parameters<MemoryLobbyStore["executeCommand"]>[0],
  ) {
    if (this.failCommands) throw new Error("injected storage failure");
    return super.executeCommand(input);
  }
}

class DelayedMemoryStore extends MemoryLobbyStore {
  delayCommands = false;
  private releaseDelay: (() => void) | undefined;
  private markWaiting: () => void = () => {};
  readonly commandWaiting = new Promise<void>((resolve) => {
    this.markWaiting = resolve;
  });

  release(): void {
    this.releaseDelay?.();
  }

  override async executeCommand(
    input: Parameters<MemoryLobbyStore["executeCommand"]>[0],
  ) {
    if (this.delayCommands) {
      this.markWaiting();
      await new Promise<void>((resolve) => {
        this.releaseDelay = resolve;
      });
    }
    return super.executeCommand(input);
  }
}

type TestSocket = ClientSocket<ServerToClientEvents, ClientToServerEvents>;
type TestApp = Awaited<ReturnType<typeof buildApp>>;

const apps: TestApp[] = [];
const sockets: TestSocket[] = [];

afterEach(async () => {
  for (const socket of sockets.splice(0)) socket.disconnect();
  await Promise.all(apps.splice(0).map(async (app) => app.close()));
});

describe("M7 interruption integration", () => {
  it("does not acknowledge success while persistence is still pending", async () => {
    const store = new DelayedMemoryStore();
    const app = await buildApp({ serveWeb: false, store });
    apps.push(app);
    await app.listen({ host: "127.0.0.1", port: 0 });
    const host = await guest(app);
    const created = await createRoom(app, host.cookie);
    const connection = await connect(
      app.listeningOrigin,
      host.cookie,
      created.snapshot.room.code,
    );
    store.delayCommands = true;
    let acknowledged: CommandAck | undefined;
    connection.socket.emit(
      "room:command",
      {
        commandId: randomUUID(),
        roomCode: created.snapshot.room.code,
        command: { type: "lobby.setReady", ready: true },
      },
      (ack) => {
        acknowledged = ack;
      },
    );
    await store.commandWaiting;
    expect(acknowledged).toBeUndefined();
    store.release();
    await vi.waitFor(() => expect(acknowledged?.accepted).toBe(true));
  });

  it("reports unknown and persisted command outcomes without re-executing", async () => {
    const { app, address } = await runningApp();
    const host = await guest(app);
    const created = await createRoom(app, host.cookie);
    const connection = await connect(
      address,
      host.cookie,
      created.snapshot.room.code,
    );
    const commandId = randomUUID();
    const lookup = (id: string) =>
      new Promise<
        { status: "unknown" } | { status: "resolved"; ack: CommandAck }
      >((resolve) => {
        connection.socket.emit(
          "room:commandStatus",
          { roomCode: created.snapshot.room.code, commandId: id },
          resolve,
        );
      });
    expect(await lookup(commandId)).toEqual({ status: "unknown" });
    const ack = await command(
      connection.socket,
      created.snapshot.room.code,
      { type: "lobby.setReady", ready: true },
      commandId,
    );
    expect(await lookup(commandId)).toEqual({ status: "resolved", ack });
    expect(
      (await fetchSnapshot(app, host.cookie, created.snapshot.room.code))
        .participants[0]?.ready,
    ).toBe(true);
  });

  it("does not confirm or apply a command when storage fails", async () => {
    const store = new FailingMemoryStore();
    const app = await buildApp({ serveWeb: false, store });
    apps.push(app);
    await app.listen({ host: "127.0.0.1", port: 0 });
    const host = await guest(app);
    const created = await createRoom(app, host.cookie);
    const connection = await connect(
      app.listeningOrigin,
      host.cookie,
      created.snapshot.room.code,
    );
    store.failCommands = true;
    const ack = await command(connection.socket, created.snapshot.room.code, {
      type: "lobby.setReady",
      ready: true,
    });
    expect(ack.accepted).toBe(false);
    store.failCommands = false;
    expect(
      (await fetchSnapshot(app, host.cookie, created.snapshot.room.code))
        .participants[0]?.ready,
    ).toBe(false);
  });

  it("recovers a stored result when the connection drops before its ACK", async () => {
    let drop = false;
    const store = new MemoryLobbyStore();
    const app = await buildApp({
      serveWeb: false,
      store,
      testDropAckAfterStore: () => {
        if (!drop) return false;
        drop = false;
        return true;
      },
    });
    apps.push(app);
    await app.listen({ host: "127.0.0.1", port: 0 });
    const host = await guest(app);
    const created = await createRoom(app, host.cookie);
    const code = created.snapshot.room.code;
    const first = await connect(app.listeningOrigin, host.cookie, code);
    const commandId = randomUUID();
    const disconnected = new Promise<void>((resolve) => {
      first.socket.once("disconnect", () => resolve());
    });
    drop = true;
    first.socket.emit(
      "room:command",
      {
        commandId,
        roomCode: code,
        command: { type: "lobby.setReady", ready: true },
      },
      () => undefined,
    );
    await disconnected;

    const resumed = await connect(app.listeningOrigin, host.cookie, code);
    const status = await new Promise<
      { status: "unknown" } | { status: "resolved"; ack: CommandAck }
    >((resolve) => {
      resumed.socket.emit(
        "room:commandStatus",
        { roomCode: code, commandId },
        resolve,
      );
    });
    expect(status).toMatchObject({
      status: "resolved",
      ack: { commandId, accepted: true },
    });
    expect(
      (await fetchSnapshot(app, host.cookie, code)).participants[0]?.ready,
    ).toBe(true);
  });

  it("pauses on disconnect and requires explicit control takeover between tabs", async () => {
    const { app, address } = await runningApp();
    const host = await guest(app);
    const other = await guest(app);
    const created = await createRoom(app, host.cookie, "Ada");
    const code = created.snapshot.room.code;
    expect((await join(app, other.cookie, code, "Bo")).statusCode).toBe(200);
    const hostFirst = await connect(address, host.cookie, code);
    const otherConnection = await connect(address, other.cookie, code);
    await command(hostFirst.socket, code, {
      type: "lobby.setReady",
      ready: true,
    });
    await command(otherConnection.socket, code, {
      type: "lobby.setReady",
      ready: true,
    });
    await command(hostFirst.socket, code, { type: "lobby.start" });
    const started = await fetchSnapshot(app, host.cookie, code);

    const hostSecond = await connect(address, host.cookie, code);
    expect(hostSecond.control).toBe("takeover-required");
    expect(
      (
        await command(hostSecond.socket, code, {
          type: "game.closeInitialView",
          roundId: started.game!.id,
        })
      ).error?.code,
    ).toBe("CONTROL_TAKEN_OVER");

    const takeover = await new Promise<"active" | "takeover-required">(
      (resolve, reject) => {
        hostSecond.socket.emit(
          "room:takeover",
          { roomCode: code },
          (result) => {
            if (result.ok) resolve(result.control);
            else reject(new Error(result.error.message));
          },
        );
      },
    );
    expect(takeover).toBe("active");
    expect(
      (
        await command(hostFirst.socket, code, {
          type: "game.closeInitialView",
          roundId: started.game!.id,
        })
      ).error?.code,
    ).toBe("CONTROL_TAKEN_OVER");

    const pausedSnapshot = new Promise<LobbySnapshot>((resolve) => {
      hostSecond.socket.on("room:snapshot", (snapshot) => {
        if (snapshot.interruption.status === "paused") resolve(snapshot);
      });
    });
    otherConnection.socket.disconnect();
    const paused = await pausedSnapshot;
    expect(paused.interruption.missingPlayerIds).toEqual([other.playerId]);
    expect(
      (
        await command(hostSecond.socket, code, {
          type: "game.closeInitialView",
          roundId: started.game!.id,
        })
      ).error?.code,
    ).toBe("GAME_PAUSED");

    const resumed = await connect(address, other.cookie, code);
    expect(resumed.snapshot.you.playerId).toBe(other.playerId);
    expect(resumed.snapshot.interruption.status).toBe("active");
    expect(resumed.snapshot.game?.id).toBe(started.game?.id);
  });

  it("recovers a started room from the durable store on a new server instance", async () => {
    const store = new MemoryLobbyStore();
    const firstApp = await buildApp({ serveWeb: false, store });
    apps.push(firstApp);
    await firstApp.listen({ host: "127.0.0.1", port: 0 });
    const host = await guest(firstApp);
    const other = await guest(firstApp);
    const created = await createRoom(firstApp, host.cookie);
    const code = created.snapshot.room.code;
    await join(firstApp, other.cookie, code, "Bo");
    const hostConnection = await connect(
      firstApp.listeningOrigin,
      host.cookie,
      code,
    );
    const otherConnection = await connect(
      firstApp.listeningOrigin,
      other.cookie,
      code,
    );
    await command(hostConnection.socket, code, {
      type: "lobby.setReady",
      ready: true,
    });
    await command(otherConnection.socket, code, {
      type: "lobby.setReady",
      ready: true,
    });
    await command(hostConnection.socket, code, { type: "lobby.start" });
    const before = await fetchSnapshot(firstApp, host.cookie, code);

    hostConnection.socket.disconnect();
    otherConnection.socket.disconnect();
    apps.splice(apps.indexOf(firstApp), 1);
    await firstApp.close();

    const restarted = await buildApp({ serveWeb: false, store });
    apps.push(restarted);
    const after = await fetchSnapshot(restarted, host.cookie, code);
    expect(after.game?.id).toBe(before.game?.id);
    expect(after.game?.players).toEqual(before.game?.players);
    expect(after.interruption.status).toBe("paused");
    expect(after.interruption.missingPlayerIds).toEqual(
      expect.arrayContaining([host.playerId, other.playerId]),
    );
  });
});

async function guest(app: TestApp, cookie?: string) {
  const response = await app.inject({
    method: "POST",
    url: "/api/session",
    ...(cookie ? { headers: { cookie } } : {}),
  });
  const setCookie = response.headers["set-cookie"];
  const issuedCookie =
    typeof setCookie === "string" ? setCookie.split(";", 1)[0]! : cookie;
  return {
    cookie: issuedCookie!,
    playerId: (response.json() as { playerId: string }).playerId,
  };
}

async function createRoom(app: TestApp, cookie: string, name = "Host") {
  const response = await app.inject({
    method: "POST",
    url: "/api/rooms",
    headers: { cookie },
    payload: { name, roundCount: 10 },
  });
  expect(response.statusCode).toBe(200);
  return response.json() as {
    invitePath: string;
    snapshot: LobbySnapshot;
  };
}

async function join(app: TestApp, cookie: string, code: string, name: string) {
  return app.inject({
    method: "POST",
    url: "/api/rooms/join",
    headers: { cookie },
    payload: { code, name },
  });
}

async function connect(
  address: string,
  cookie: string,
  code: string,
): Promise<{
  socket: TestSocket;
  snapshot: LobbySnapshot;
  control: "active" | "takeover-required";
}> {
  const socket: TestSocket = createClient(address, {
    extraHeaders: { cookie },
    forceNew: true,
    transports: ["websocket"],
  });
  sockets.push(socket);
  await new Promise<void>((resolve, reject) => {
    socket.once("connect", resolve);
    socket.once("connect_error", reject);
  });
  const subscribed = await new Promise<{
    snapshot: LobbySnapshot;
    control: "active" | "takeover-required";
  }>((resolve, reject) => {
    socket.emit("room:subscribe", { roomCode: code }, (result) => {
      if (result.ok)
        resolve({ snapshot: result.snapshot, control: result.control });
      else reject(new Error(result.error.message));
    });
  });
  return { socket, ...subscribed };
}

function command(
  socket: TestSocket,
  roomCode: string,
  value: LobbyCommand,
  commandId = randomUUID(),
): Promise<CommandAck> {
  const envelope: RoomCommandEnvelope = {
    commandId,
    roomCode,
    command: value,
  };
  return new Promise((resolve) => {
    socket.emit("room:command", envelope, resolve);
  });
}

async function runningApp(random?: RandomSource) {
  const app = await buildApp({
    serveWeb: false,
    ...(random ? { store: new MemoryLobbyStore(random) } : {}),
  });
  apps.push(app);
  await app.listen({ host: "127.0.0.1", port: 0 });
  return { app, address: app.listeningOrigin };
}

async function fetchSnapshot(app: TestApp, cookie: string, code: string) {
  const response = await app.inject({
    method: "GET",
    url: `/api/rooms/${code}`,
    headers: { cookie },
  });
  expect(response.statusCode).toBe(200);
  return response.json() as LobbySnapshot;
}

describe("M2 lobby integration", () => {
  it("serializes two simultaneous attempts for the sixth seat and rejects a seventh", async () => {
    const app = await buildApp({ serveWeb: false });
    apps.push(app);
    const host = await guest(app);
    const created = await createRoom(app, host.cookie);
    const code = created.snapshot.room.code;

    for (let index = 1; index <= 4; index += 1) {
      const player = await guest(app);
      expect(
        (await join(app, player.cookie, code, `P${index}`)).statusCode,
      ).toBe(200);
    }
    const sixth = await guest(app);
    const competing = await guest(app);
    const attempts = await Promise.all([
      join(app, sixth.cookie, code, "P5"),
      join(app, competing.cookie, code, "P6"),
    ]);
    expect(attempts.map((response) => response.statusCode).toSorted()).toEqual([
      200, 409,
    ]);
    expect(
      attempts.find((response) => response.statusCode === 409)!.json(),
    ).toMatchObject({ error: { code: "ROOM_FULL" } });

    const seventh = await guest(app);
    const rejected = await join(app, seventh.cookie, code, "P7");
    expect(rejected.statusCode).toBe(409);
    expect(rejected.json()).toMatchObject({ error: { code: "ROOM_FULL" } });
  });

  it("does not allow a guest to read a foreign room", async () => {
    const app = await buildApp({ serveWeb: false });
    apps.push(app);
    const host = await guest(app);
    const stranger = await guest(app);
    const created = await createRoom(app, host.cookie);

    const response = await app.inject({
      method: "GET",
      url: `/api/rooms/${created.snapshot.room.code}`,
      headers: { cookie: stranger.cookie },
    });
    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ error: { code: "NOT_A_MEMBER" } });
  });

  it("restores the stable identity and lobby seat after refresh", async () => {
    const app = await buildApp({ serveWeb: false });
    apps.push(app);
    const original = await guest(app);
    const created = await createRoom(app, original.cookie);

    const resumed = await guest(app, original.cookie);
    expect(resumed.playerId).toBe(original.playerId);
    expect(resumed.cookie).toBe(original.cookie);
    const response = await app.inject({
      method: "GET",
      url: `/api/rooms/${created.snapshot.room.code}`,
      headers: { cookie: original.cookie },
    });
    const snapshot = response.json() as LobbySnapshot;
    expect(snapshot.you.playerId).toBe(original.playerId);
    expect(snapshot.you.seat).toBe(0);
    expect(snapshot.you.isHost).toBe(true);
    expect(created.invitePath).not.toContain(original.cookie);
  });

  it("returns personalized snapshots over sockets and resumes after reconnect", async () => {
    const { app, address } = await runningApp();
    const host = await guest(app);
    const other = await guest(app);
    const created = await createRoom(app, host.cookie, "Ada");
    const code = created.snapshot.room.code;
    expect((await join(app, other.cookie, code, "Bo")).statusCode).toBe(200);

    const hostConnection = await connect(address, host.cookie, code);
    const otherConnection = await connect(address, other.cookie, code);
    expect(hostConnection.snapshot.you.isHost).toBe(true);
    expect(otherConnection.snapshot.you.isHost).toBe(false);
    expect(hostConnection.snapshot.you.playerId).not.toBe(
      otherConnection.snapshot.you.playerId,
    );

    otherConnection.socket.disconnect();
    const resumed = await connect(address, other.cookie, code);
    expect(resumed.snapshot.you.playerId).toBe(other.playerId);
    expect(resumed.snapshot.you.seat).toBe(1);
  });

  it("rejects invalid and non-host starts", async () => {
    const { app, address } = await runningApp();
    const host = await guest(app);
    const other = await guest(app);
    const created = await createRoom(app, host.cookie);
    const code = created.snapshot.room.code;
    expect((await join(app, other.cookie, code, "Bo")).statusCode).toBe(200);
    const hostSocket = (await connect(address, host.cookie, code)).socket;
    const otherSocket = (await connect(address, other.cookie, code)).socket;

    const invalid = await command(hostSocket, code, { type: "lobby.start" });
    expect(invalid.error?.code).toBe("NOT_ALL_READY");
    const unauthorized = await command(otherSocket, code, {
      type: "lobby.start",
    });
    expect(unauthorized.error?.code).toBe("NOT_HOST");
  });

  it("starts exactly once when all players are ready and closes joining", async () => {
    const { app, address } = await runningApp();
    const host = await guest(app);
    const other = await guest(app);
    const late = await guest(app);
    const created = await createRoom(app, host.cookie);
    const code = created.snapshot.room.code;
    expect((await join(app, other.cookie, code, "Bo")).statusCode).toBe(200);
    const hostSocket = (await connect(address, host.cookie, code)).socket;
    const otherSocket = (await connect(address, other.cookie, code)).socket;

    expect(
      (
        await command(hostSocket, code, {
          type: "lobby.setReady",
          ready: true,
        })
      ).accepted,
    ).toBe(true);
    expect(
      (
        await command(otherSocket, code, {
          type: "lobby.setReady",
          ready: true,
        })
      ).accepted,
    ).toBe(true);
    const started = await command(hostSocket, code, { type: "lobby.start" });
    expect(started.accepted).toBe(true);

    const response = await join(app, late.cookie, code, "Zu spät");
    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({
      error: { code: "GAME_ALREADY_STARTED" },
    });
  });

  it("executes a command ID once and rejects reuse with another payload", async () => {
    const { app, address } = await runningApp();
    const host = await guest(app);
    const created = await createRoom(app, host.cookie);
    const code = created.snapshot.room.code;
    const socket = (await connect(address, host.cookie, code)).socket;
    const commandId = randomUUID();

    const first = await command(
      socket,
      code,
      { type: "lobby.setReady", ready: true },
      commandId,
    );
    const duplicate = await command(
      socket,
      code,
      { type: "lobby.setReady", ready: true },
      commandId,
    );
    const conflict = await command(
      socket,
      code,
      { type: "lobby.setReady", ready: false },
      commandId,
    );

    expect(first.accepted).toBe(true);
    expect(duplicate).toMatchObject({
      accepted: true,
      duplicate: true,
      sequence: first.sequence,
    });
    expect(conflict).toMatchObject({
      accepted: false,
      duplicate: true,
      error: { code: "COMMAND_ID_CONFLICT" },
    });
    const response = await app.inject({
      method: "GET",
      url: `/api/rooms/${code}`,
      headers: { cookie: host.cookie },
    });
    const snapshot = response.json() as LobbySnapshot;
    expect(snapshot.participants[0]!.ready).toBe(true);
    expect(snapshot.room.sequence).toBe(first.sequence);
  });

  it("transfers host to the longest-present connected player on final leave", async () => {
    const { app, address } = await runningApp();
    const host = await guest(app);
    const second = await guest(app);
    const third = await guest(app);
    const created = await createRoom(app, host.cookie);
    const code = created.snapshot.room.code;
    expect((await join(app, second.cookie, code, "Second")).statusCode).toBe(
      200,
    );
    expect((await join(app, third.cookie, code, "Third")).statusCode).toBe(200);
    const hostSocket = (await connect(address, host.cookie, code)).socket;
    await connect(address, second.cookie, code);
    await connect(address, third.cookie, code);

    expect(
      (await command(hostSocket, code, { type: "lobby.leave" })).accepted,
    ).toBe(true);
    const response = await app.inject({
      method: "GET",
      url: `/api/rooms/${code}`,
      headers: { cookie: second.cookie },
    });
    const snapshot = response.json() as LobbySnapshot;
    expect(snapshot.you.isHost).toBe(true);
    expect(
      snapshot.participants.find((player) => player.isHost)?.playerId,
    ).toBe(second.playerId);
  });
});

describe("M3 reduced round integration", () => {
  it("plays one full normal-turn cycle between protected client views", async () => {
    // Keep the direct discard focused on the reduced normal-turn flow by
    // placing a jack (without an action) after the eight initial cards.
    const { app, address } = await runningApp({
      integer: (maximum) => (maximum === 11 ? 8 : maximum - 1),
    });
    const host = await guest(app);
    const other = await guest(app);
    const created = await createRoom(app, host.cookie, "Ada");
    const code = created.snapshot.room.code;
    expect((await join(app, other.cookie, code, "Bo")).statusCode).toBe(200);
    const hostSocket = (await connect(address, host.cookie, code)).socket;
    const otherSocket = (await connect(address, other.cookie, code)).socket;

    await command(hostSocket, code, { type: "lobby.setReady", ready: true });
    await command(otherSocket, code, { type: "lobby.setReady", ready: true });
    expect(
      (await command(hostSocket, code, { type: "lobby.start" })).accepted,
    ).toBe(true);

    const hostInitial = await fetchSnapshot(app, host.cookie, code);
    const otherInitial = await fetchSnapshot(app, other.cookie, code);
    expect(hostInitial.game?.phase).toBe("initial-view");
    expect(hostInitial.game?.discardTop).toBeUndefined();
    expect(
      hostInitial.game?.players
        .flatMap((p) => p.positions)
        .filter((p) => p.card),
    ).toHaveLength(2);
    expect(
      otherInitial.game?.players
        .flatMap((p) => p.positions)
        .filter((p) => p.card),
    ).toHaveLength(2);
    expect(
      hostInitial.game?.players
        .find((p) => p.playerId === other.playerId)
        ?.positions.some((p) => p.card),
    ).toBe(false);

    const roundId = hostInitial.game!.id;
    await command(hostSocket, code, { type: "game.closeInitialView", roundId });
    const waiting = await fetchSnapshot(app, host.cookie, code);
    expect(waiting.game?.phase).toBe("initial-view");
    expect(waiting.game?.you.initialViewOpen).toBe(false);
    expect(
      waiting.game?.players.flatMap((p) => p.positions).some((p) => p.card),
    ).toBe(false);
    expect(
      (
        await command(hostSocket, code, {
          type: "game.closeInitialView",
          roundId,
        })
      ).error?.code,
    ).toBe("INITIAL_VIEW_CLOSED");
    expect(
      (
        await command(hostSocket, code, {
          type: "game.draw",
          roundId,
          turnId: waiting.game!.turn.id,
        })
      ).error?.code,
    ).toBe("ROUND_NOT_PLAYING");
    await command(otherSocket, code, {
      type: "game.closeInitialView",
      roundId,
    });

    let publicState = await fetchSnapshot(app, host.cookie, code);
    expect(publicState.game?.phase).toBe("playing");
    const clients = new Map([
      [host.playerId, { socket: hostSocket, cookie: host.cookie }],
      [other.playerId, { socket: otherSocket, cookie: other.cookie }],
    ]);
    const firstPlayerId = publicState.game!.activePlayerId;
    const first = clients.get(firstPlayerId)!;
    const observer = clients.get(
      firstPlayerId === host.playerId ? other.playerId : host.playerId,
    )!;
    const firstTurn = publicState.game!.turn.id;
    const beforeDrawCount = publicState.game!.drawPileCount;
    expect(
      (
        await command(observer.socket, code, {
          type: "game.draw",
          roundId,
          turnId: firstTurn,
        })
      ).error?.code,
    ).toBe("NOT_ACTIVE_PLAYER");

    const commandId = randomUUID();
    const firstDraw = await command(
      first.socket,
      code,
      { type: "game.draw", roundId, turnId: firstTurn },
      commandId,
    );
    const duplicateDraw = await command(
      first.socket,
      code,
      { type: "game.draw", roundId, turnId: firstTurn },
      commandId,
    );
    expect(firstDraw.accepted).toBe(true);
    expect(duplicateDraw).toMatchObject({
      accepted: true,
      duplicate: true,
      sequence: firstDraw.sequence,
    });
    const privateDraw = await fetchSnapshot(app, first.cookie, code);
    const hiddenDraw = await fetchSnapshot(app, observer.cookie, code);
    expect(privateDraw.game?.you.drawnCard).toBeDefined();
    expect(hiddenDraw.game?.you.drawnCard).toBeUndefined();
    expect(privateDraw.game?.drawPileCount).toBe(beforeDrawCount - 1);
    expect(
      (
        await command(first.socket, code, {
          type: "game.draw",
          roundId,
          turnId: firstTurn,
        })
      ).error?.code,
    ).toBe("INVALID_TURN");
    expect(
      (
        await command(first.socket, code, {
          type: "game.discardDrawn",
          roundId,
          turnId: firstTurn,
        })
      ).accepted,
    ).toBe(true);

    publicState = await fetchSnapshot(app, observer.cookie, code);
    expect(publicState.game?.discardTop?.origin).toBe("drawn");
    const secondPlayerId = publicState.game!.activePlayerId;
    const second = clients.get(secondPlayerId)!;
    const secondTurn = publicState.game!.turn.id;
    expect(
      (
        await command(second.socket, code, {
          type: "game.draw",
          roundId,
          turnId: secondTurn,
        })
      ).accepted,
    ).toBe(true);
    const secondView = await fetchSnapshot(app, second.cookie, code);
    const ownPosition = secondView.game!.players.find(
      (p) => p.playerId === secondPlayerId,
    )!.positions[0]!;
    const foreignPosition = secondView.game!.players.find(
      (p) => p.playerId !== secondPlayerId,
    )!.positions[0]!;
    expect(
      (
        await command(second.socket, code, {
          type: "game.swapDrawn",
          roundId,
          turnId: secondTurn,
          positionId: foreignPosition.id,
          occupancyVersion: foreignPosition.occupancyVersion,
        })
      ).error?.code,
    ).toBe("INVALID_POSITION");
    expect(
      (
        await command(second.socket, code, {
          type: "game.swapDrawn",
          roundId,
          turnId: secondTurn,
          positionId: ownPosition.id,
          occupancyVersion: ownPosition.occupancyVersion + 1,
        })
      ).error?.code,
    ).toBe("STALE_POSITION");
    expect(
      (
        await command(second.socket, code, {
          type: "game.swapDrawn",
          roundId,
          turnId: secondTurn,
          positionId: ownPosition.id,
          occupancyVersion: ownPosition.occupancyVersion,
        })
      ).accepted,
    ).toBe(true);

    const completed = await fetchSnapshot(app, host.cookie, code);
    expect(completed.game?.activePlayerId).toBe(firstPlayerId);
    expect(completed.game?.turn.number).toBe(3);
    expect(completed.game?.discardTop?.origin).toBe("swapped");
    expect(
      completed.game?.players.every(
        (p) => p.positions.filter((position) => position.occupied).length === 4,
      ),
    ).toBe(true);
    expect(JSON.stringify(completed)).not.toContain("cardId");
    expect(JSON.stringify(completed)).not.toContain('"drawPile":[');
  });
});

describe("M4 concurrent reactions", () => {
  it("accepts two simultaneous wrong attempts, reveals both, and penalizes both", async () => {
    const previous = process.env.KABU_ENABLE_TEST_SCENARIOS;
    process.env.KABU_ENABLE_TEST_SCENARIOS = "true";
    try {
      const { app, address } = await runningApp();
      const host = await guest(app);
      const other = await guest(app);
      const created = await createRoom(app, host.cookie, "Ada");
      const code = created.snapshot.room.code;
      expect((await join(app, other.cookie, code, "Bo")).statusCode).toBe(200);
      const hostSocket = (await connect(address, host.cookie, code)).socket;
      const otherSocket = (await connect(address, other.cookie, code)).socket;
      await command(hostSocket, code, { type: "lobby.setReady", ready: true });
      await command(otherSocket, code, { type: "lobby.setReady", ready: true });
      await command(hostSocket, code, { type: "lobby.start" });
      const initial = await fetchSnapshot(app, host.cookie, code);
      const roundId = initial.game!.id;
      expect(
        (
          await command(hostSocket, code, {
            type: "game.dev.loadScenario",
            roundId,
            scenario: "reaction-two-wrong",
          })
        ).accepted,
      ).toBe(true);
      const fixture = await fetchSnapshot(app, host.cookie, code);
      const windowId = fixture.game!.reactionWindow!.id;
      const hostPosition = fixture
        .game!.players.find((player) => player.playerId === host.playerId)!
        .positions.find(
          (position) => position.row === "near" && position.column === 0,
        )!;
      const otherPosition = fixture
        .game!.players.find((player) => player.playerId === other.playerId)!
        .positions.find(
          (position) => position.row === "near" && position.column === 0,
        )!;

      const results = await Promise.all([
        command(hostSocket, code, {
          type: "game.react",
          roundId,
          windowId,
          targetPlayerId: host.playerId,
          positionId: hostPosition.id,
          occupancyVersion: hostPosition.occupancyVersion,
        }),
        command(otherSocket, code, {
          type: "game.react",
          roundId,
          windowId,
          targetPlayerId: other.playerId,
          positionId: otherPosition.id,
          occupancyVersion: otherPosition.occupancyVersion,
        }),
      ]);
      expect(results.every((result) => result.accepted)).toBe(true);
      const after = await fetchSnapshot(app, host.cookie, code);
      expect(after.game?.reactionWindow).toMatchObject({
        id: windowId,
        status: "open",
      });
      expect(after.game?.publicReveals).toHaveLength(2);
      expect(after.game?.publicReveals?.map((reveal) => reveal.reason)).toEqual(
        ["wrong-card", "wrong-card"],
      );
      expect(
        after.game?.players.map(
          (player) =>
            player.positions.filter((position) => position.occupied).length,
        ),
      ).toEqual([5, 5]);
    } finally {
      if (previous === undefined) delete process.env.KABU_ENABLE_TEST_SCENARIOS;
      else process.env.KABU_ENABLE_TEST_SCENARIOS = previous;
    }
  });

  it("accepts the slower correct attempt as a revealed penalty", async () => {
    const previous = process.env.KABU_ENABLE_TEST_SCENARIOS;
    process.env.KABU_ENABLE_TEST_SCENARIOS = "true";
    try {
      const { app, address } = await runningApp();
      const host = await guest(app);
      const other = await guest(app);
      const created = await createRoom(app, host.cookie, "Ada");
      const code = created.snapshot.room.code;
      await join(app, other.cookie, code, "Bo");
      const hostSocket = (await connect(address, host.cookie, code)).socket;
      const otherSocket = (await connect(address, other.cookie, code)).socket;
      await command(hostSocket, code, { type: "lobby.setReady", ready: true });
      await command(otherSocket, code, { type: "lobby.setReady", ready: true });
      await command(hostSocket, code, { type: "lobby.start" });
      const initial = await fetchSnapshot(app, host.cookie, code);
      const roundId = initial.game!.id;
      await command(hostSocket, code, {
        type: "game.dev.loadScenario",
        roundId,
        scenario: "reaction-own",
      });
      const fixture = await fetchSnapshot(app, host.cookie, code);
      const windowId = fixture.game!.reactionWindow!.id;
      const ownNear = (playerId: string) =>
        fixture
          .game!.players.find((player) => player.playerId === playerId)!
          .positions.find(
            (position) => position.row === "near" && position.column === 0,
          )!;
      const hostPosition = ownNear(host.playerId);
      const otherPosition = ownNear(other.playerId);

      const winner = await command(hostSocket, code, {
        type: "game.react",
        roundId,
        windowId,
        targetPlayerId: host.playerId,
        positionId: hostPosition.id,
        occupancyVersion: hostPosition.occupancyVersion,
      });
      expect(winner.accepted).toBe(true);
      const consumed = await fetchSnapshot(app, other.cookie, code);
      expect(consumed.game?.reactionWindow?.status).toBe("consumed");

      const visiblyLate = await command(otherSocket, code, {
        type: "game.react",
        roundId,
        windowId,
        targetPlayerId: other.playerId,
        positionId: otherPosition.id,
        occupancyVersion: otherPosition.occupancyVersion,
      });
      expect(visiblyLate.accepted).toBe(true);
      const after = await fetchSnapshot(app, host.cookie, code);
      expect(after.game?.reactionWindow?.status).toBe("consumed");
      expect(after.game?.publicReveals).toHaveLength(1);
      expect(after.game?.publicReveals?.[0]?.reason).toBe("too-late");
      expect(
        after.game?.players
          .map(
            (player) =>
              player.positions.filter((position) => position.occupied).length,
          )
          .toSorted(),
      ).toEqual([3, 5]);
    } finally {
      if (previous === undefined) delete process.env.KABU_ENABLE_TEST_SCENARIOS;
      else process.env.KABU_ENABLE_TEST_SCENARIOS = previous;
    }
  });
});

describe("M5 complete round integration", () => {
  it("scores a deterministic zero-card round once on two clients and starts the rotated next round", async () => {
    const previous = process.env.KABU_ENABLE_TEST_SCENARIOS;
    process.env.KABU_ENABLE_TEST_SCENARIOS = "true";
    try {
      const { app, address } = await runningApp();
      const host = await guest(app);
      const other = await guest(app);
      const created = await createRoom(app, host.cookie, "Ada");
      const code = created.snapshot.room.code;
      expect((await join(app, other.cookie, code, "Bo")).statusCode).toBe(200);
      const hostSocket = (await connect(address, host.cookie, code)).socket;
      const otherSocket = (await connect(address, other.cookie, code)).socket;
      await command(hostSocket, code, { type: "lobby.setReady", ready: true });
      await command(otherSocket, code, { type: "lobby.setReady", ready: true });
      await command(hostSocket, code, { type: "lobby.start" });
      const initial = await fetchSnapshot(app, host.cookie, code);
      await command(hostSocket, code, {
        type: "game.dev.loadScenario",
        roundId: initial.game!.id,
        scenario: "m5-zero-own",
      });
      const loaded = await fetchSnapshot(app, host.cookie, code);
      const own = loaded
        .game!.players.find((player) => player.playerId === host.playerId)!
        .positions.find((position) => position.occupied)!;
      const commandId = randomUUID();
      const reaction = {
        type: "game.react" as const,
        roundId: loaded.game!.id,
        windowId: loaded.game!.reactionWindow!.id,
        targetPlayerId: host.playerId,
        positionId: own.id,
        occupancyVersion: own.occupancyVersion,
      };
      const first = await command(hostSocket, code, reaction, commandId);
      const duplicate = await command(hostSocket, code, reaction, commandId);
      expect(first.accepted).toBe(true);
      expect(duplicate).toMatchObject({ accepted: true, duplicate: true });

      const hostResult = await fetchSnapshot(app, host.cookie, code);
      const otherResult = await fetchSnapshot(app, other.cookie, code);
      expect(hostResult.game?.phase).toBe("round-result");
      expect(otherResult.game?.completedRounds).toHaveLength(1);
      expect(hostResult.game?.completedRounds?.[0]?.scores).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            playerId: host.playerId,
            cardPoints: 0,
            roundPoints: 0,
          }),
        ]),
      );
      expect(
        hostResult.game?.players
          .flatMap((player) => player.positions)
          .every((position) => !position.occupied || position.card),
      ).toBe(true);

      await command(hostSocket, code, {
        type: "game.readyNextRound",
        roundId: hostResult.game!.id,
      });
      expect((await fetchSnapshot(app, host.cookie, code)).game?.phase).toBe(
        "round-result",
      );
      await command(otherSocket, code, {
        type: "game.readyNextRound",
        roundId: hostResult.game!.id,
      });
      const roundTwo = await fetchSnapshot(app, host.cookie, code);
      expect(roundTwo.game).toMatchObject({
        number: 2,
        phase: "initial-view",
      });
      expect(roundTwo.game?.startingPlayerId).toBe(other.playerId);
      expect(roundTwo.game?.completedRounds).toHaveLength(1);
      expect(
        roundTwo.game?.players.every(
          (player) =>
            player.positions.filter((position) => position.occupied).length ===
            4,
        ),
      ).toBe(true);
    } finally {
      if (previous === undefined) delete process.env.KABU_ENABLE_TEST_SCENARIOS;
      else process.env.KABU_ENABLE_TEST_SCENARIOS = previous;
    }
  });
});
