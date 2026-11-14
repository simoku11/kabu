import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import { io as createClient, type Socket } from "socket.io-client";

import type {
  ClientToServerEvents,
  CommandAck,
  RoomSubscriptionResult,
  ServerToClientEvents,
} from "@kabu/protocol";

import { buildApp } from "./app.js";

type TestSocket = Socket<ServerToClientEvents, ClientToServerEvents>;
const apps: Awaited<ReturnType<typeof buildApp>>[] = [];
const sockets: TestSocket[] = [];

afterEach(async () => {
  for (const socket of sockets.splice(0)) socket.disconnect();
  await Promise.all(apps.splice(0).map((app) => app.close()));
});

async function running(options: Parameters<typeof buildApp>[0] = {}) {
  const app = await buildApp({ serveWeb: false, ...options });
  apps.push(app);
  await app.listen({ host: "127.0.0.1", port: 0 });
  return app;
}

async function session(app: Awaited<ReturnType<typeof buildApp>>) {
  const response = await app.inject({ method: "POST", url: "/api/session" });
  return String(response.headers["set-cookie"]).split(";", 1)[0]!;
}

describe("M8 transport protection", () => {
  it("rejects an untrusted browser origin and oversized JSON", async () => {
    const app = await running({ allowedOrigins: ["https://beta.kabu.test"] });
    const crossSite = await app.inject({
      method: "POST",
      url: "/api/session",
      headers: { origin: "https://attacker.example" },
    });
    expect(crossSite.statusCode).toBe(403);

    const oversized = await app.inject({
      method: "POST",
      url: "/api/session",
      headers: { "content-type": "application/json" },
      payload: { padding: "x".repeat(17_000) },
    });
    expect(oversized.statusCode).toBe(413);
  });

  it("rate-limits room-code guessing per session without revealing a room", async () => {
    const app = await running({ joinRateLimit: 2, joinRateWindowMs: 60_000 });
    const cookie = await session(app);
    for (const code of ["ABC234", "ABC235"]) {
      const response = await app.inject({
        method: "POST",
        url: "/api/rooms/join",
        headers: { cookie },
        payload: { code, name: "Probe" },
      });
      expect(response.statusCode).toBe(404);
    }
    const throttled = await app.inject({
      method: "POST",
      url: "/api/rooms/join",
      headers: { cookie },
      payload: { code: "ABC236", name: "Probe" },
    });
    expect(throttled.statusCode).toBe(429);
    expect(throttled.json()).toMatchObject({ error: { code: "RATE_LIMITED" } });
    expect(throttled.headers["retry-after"]).toBeDefined();
  });

  it("throttles technically without applying a command or a game penalty", async () => {
    const app = await running({
      commandRateLimit: 2,
      commandRateWindowMs: 60_000,
    });
    const cookie = await session(app);
    const created = await app.inject({
      method: "POST",
      url: "/api/rooms",
      headers: { cookie },
      payload: { name: "Ada", roundCount: 10 },
    });
    const code = created.json().snapshot.room.code as string;
    const client = createClient(app.listeningOrigin, {
      transports: ["websocket"],
      extraHeaders: { cookie },
    });
    sockets.push(client);
    await new Promise<void>((resolve, reject) => {
      client.once("connect", resolve);
      client.once("connect_error", reject);
    });
    await new Promise<void>((resolve, reject) => {
      client.emit(
        "room:subscribe",
        { roomCode: code },
        (result: RoomSubscriptionResult) =>
          result.ok ? resolve() : reject(new Error(result.error.code)),
      );
    });
    const send = (ready: boolean) =>
      new Promise<CommandAck>((resolve) =>
        client.emit(
          "room:command",
          {
            commandId: randomUUID(),
            roomCode: code,
            command: { type: "lobby.setReady", ready },
          },
          resolve,
        ),
      );
    expect((await send(true)).accepted).toBe(true);
    expect((await send(false)).accepted).toBe(true);
    const throttled = await send(true);
    expect(throttled).toMatchObject({
      accepted: false,
      error: { code: "RATE_LIMITED" },
    });
    const snapshot = await app.inject({
      method: "GET",
      url: `/api/rooms/${code}`,
      headers: { cookie },
    });
    expect(snapshot.json().participants[0].ready).toBe(false);

    const metrics = await app.inject({ method: "GET", url: "/api/metrics" });
    expect(metrics.json()).toMatchObject({
      commands: { outcomes: { accepted: 2, throttled: 1 } },
    });
  });
});
