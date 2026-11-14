import cookie from "@fastify/cookie";
import cors from "@fastify/cors";
import fastifyStatic from "@fastify/static";
import Fastify, {
  type FastifyInstance,
  type FastifyReply,
  type FastifyRequest,
} from "fastify";
import { existsSync } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { Server as SocketServer, type Socket } from "socket.io";

import {
  CommandAckSchema,
  CommandIdSchema,
  CreateRoomRequestSchema,
  HealthResponseSchema,
  JoinRoomRequestSchema,
  LobbySnapshotSchema,
  RoomCodeSchema,
  RoomCommandEnvelopeSchema,
  RoomResponseSchema,
  SessionResponseSchema,
  type ClientToServerEvents,
  type CommandAck,
  type ServerToClientEvents,
} from "@kabu/protocol";

import {
  LobbyError,
  publicRevealDurationMs,
  type LobbyStore,
} from "./lobby/domain.js";
import { MemoryLobbyStore } from "./lobby/memory-store.js";
import { LobbyService } from "./lobby/service.js";
import { ServerMetrics, type CommandOutcome } from "./metrics.js";
import { FixedWindowRateLimiter, originAllowed } from "./security.js";

const SESSION_COOKIE = "kabu_session";
const SESSION_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;

interface BuildAppOptions {
  logger?: boolean;
  serveWeb?: boolean;
  store?: LobbyStore;
  cookieSecure?: boolean;
  allowedOrigins?: string[];
  bodyLimitBytes?: number;
  socketMessageLimitBytes?: number;
  commandRateLimit?: number;
  commandRateWindowMs?: number;
  joinRateLimit?: number;
  joinRateWindowMs?: number;
  socketPingIntervalMs?: number;
  socketPingTimeoutMs?: number;
  /** Test-only crash point after the atomic store commit and before ACK/publish. */
  testDropAckAfterStore?: () => boolean;
}

interface SocketData {
  playerId: string;
  roomCodes: Set<string>;
}

type KabuSocket = Socket<
  ClientToServerEvents,
  ServerToClientEvents,
  Record<string, never>,
  SocketData
>;

function roomChannel(code: string): string {
  return `room:${code}`;
}

function apiError(
  reply: FastifyReply,
  statusCode: number,
  code: string,
  message: string,
) {
  return reply.code(statusCode).send({ error: { code, message } });
}

function cookieToken(request: FastifyRequest): string | undefined {
  return request.cookies[SESSION_COOKIE];
}

export async function buildApp(
  options: BuildAppOptions = {},
): Promise<FastifyInstance> {
  const app = Fastify({
    logger: options.logger ?? false,
    requestIdHeader: false,
    genReqId: () => randomUUID(),
    bodyLimit: options.bodyLimitBytes ?? 16_384,
  });
  const store = options.store ?? new MemoryLobbyStore();
  await store.acquireWriterLease();
  const lobby = new LobbyService(store);
  const connections = new Map<string, Set<string>>();
  const controllers = new Map<string, string>();
  const scheduledEffectTimeouts = new Set<string>();
  const allowedOrigins = new Set(
    options.allowedOrigins ?? [
      "http://localhost:5173",
      "http://localhost:3000",
    ],
  );
  const commandLimiter = new FixedWindowRateLimiter(
    options.commandRateLimit ?? 240,
    options.commandRateWindowMs ?? 10_000,
  );
  const joinLimiter = new FixedWindowRateLimiter(
    options.joinRateLimit ?? 10,
    options.joinRateWindowMs ?? 60_000,
  );
  const metrics = new ServerMetrics();
  const roomQueues = new Map<string, Promise<void>>();

  const inRoomQueue = async <T>(code: string, work: () => Promise<T>) => {
    const queuedAt = performance.now();
    const previous = roomQueues.get(code) ?? Promise.resolve();
    let release = () => {};
    const current = new Promise<void>((resolve) => {
      release = resolve;
    });
    roomQueues.set(code, current);
    await previous;
    const queueMs = performance.now() - queuedAt;
    try {
      return { value: await work(), queueMs };
    } finally {
      release();
      if (roomQueues.get(code) === current) roomQueues.delete(code);
    }
  };

  await app.register(cookie);
  await app.register(cors, { origin: false });
  app.addHook("onRequest", async (request, reply) => {
    if (!originAllowed(request.headers.origin, allowedOrigins)) {
      return apiError(
        reply,
        403,
        "INVALID_REQUEST",
        "Dieser Ursprung ist nicht erlaubt.",
      );
    }
  });

  const io = new SocketServer<
    ClientToServerEvents,
    ServerToClientEvents,
    Record<string, never>,
    SocketData
  >(app.server, {
    serveClient: false,
    cors: { origin: false },
    maxHttpBufferSize: options.socketMessageLimitBytes ?? 16_384,
    allowRequest: (request, callback) =>
      callback(null, originAllowed(request.headers.origin, allowedOrigins)),
    pingInterval: options.socketPingIntervalMs ?? 1_000,
    pingTimeout: options.socketPingTimeoutMs ?? 2_000,
  });

  const broadcastSnapshots = async (code: string) => {
    const sockets = await io.in(roomChannel(code)).fetchSockets();
    let firstSnapshot: Awaited<ReturnType<typeof lobby.getSnapshot>>;
    await Promise.all(
      sockets.map(async (socket) => {
        const snapshot = await lobby.getSnapshot(socket.data.playerId, code);
        if (snapshot) {
          firstSnapshot ??= snapshot;
          socket.emit("room:snapshot", snapshot);
        }
      }),
    );
    if (firstSnapshot) scheduleRoomTimeouts(code, firstSnapshot);
  };

  const scheduleEffectTimeouts = (
    code: string,
    game:
      | {
          id: string;
          effects?:
            | Array<{
                id: string;
                ownerPlayerId: string;
                expiresAt?: number | undefined;
              }>
            | undefined;
          phase?: string;
          finalReactionDeadline?: number | null | undefined;
          players?: Array<{ playerId: string }>;
        }
      | null
      | undefined,
  ) => {
    for (const effect of game?.effects ?? []) {
      if (effect.expiresAt === undefined) continue;
      const key = `${code}:${effect.id}:${effect.expiresAt}`;
      if (scheduledEffectTimeouts.has(key)) continue;
      scheduledEffectTimeouts.add(key);
      const timer = setTimeout(
        () => {
          void lobby
            .executeCommand(effect.ownerPlayerId, {
              commandId: randomUUID(),
              roomCode: code,
              command: {
                type: "game.effect.timeout",
                roundId: game!.id,
                effectId: effect.id,
              },
            })
            .then(async (result) => {
              if (result.changed) await broadcastSnapshots(code);
            })
            .catch(() => undefined)
            .finally(() => scheduledEffectTimeouts.delete(key));
        },
        Math.max(0, effect.expiresAt - Date.now()) + 25,
      );
      timer.unref();
    }
    if (
      game?.phase === "final-reaction" &&
      game.finalReactionDeadline != null &&
      game.players?.[0]
    ) {
      const deadline = game.finalReactionDeadline;
      const key = `${code}:final:${game.id}:${deadline}`;
      if (!scheduledEffectTimeouts.has(key)) {
        scheduledEffectTimeouts.add(key);
        const timer = setTimeout(
          () => {
            void lobby
              .executeCommand(game.players![0]!.playerId, {
                commandId: randomUUID(),
                roomCode: code,
                command: {
                  type: "game.finalReaction.timeout",
                  roundId: game.id,
                },
              })
              .then(async (result) => {
                if (result.changed) await broadcastSnapshots(code);
              })
              .catch(() => undefined)
              .finally(() => scheduledEffectTimeouts.delete(key));
          },
          Math.max(0, deadline - Date.now()) + 25,
        );
        timer.unref();
      }
    }
  };

  const scheduleRoomTimeouts = (
    code: string,
    snapshot: Awaited<ReturnType<typeof lobby.getSnapshot>>,
  ) => {
    if (!snapshot) return;
    scheduleEffectTimeouts(code, snapshot.game);
    const deadline = snapshot.interruption.reconnectDeadline;
    if (
      snapshot.interruption.status !== "paused" ||
      deadline === null ||
      !snapshot.game
    )
      return;
    const key = `${code}:interruption:${deadline}`;
    if (scheduledEffectTimeouts.has(key)) return;
    scheduledEffectTimeouts.add(key);
    const timer = setTimeout(
      () => {
        void lobby
          .executeCommand(snapshot.participants[0]!.playerId, {
            commandId: randomUUID(),
            roomCode: code,
            command: {
              type: "game.interruption.timeout",
              roundId: snapshot.game!.id,
            },
          })
          .then(async (result) => {
            if (result.changed) await broadcastSnapshots(code);
          })
          .catch(() => undefined)
          .finally(() => scheduledEffectTimeouts.delete(key));
      },
      Math.max(0, deadline - Date.now()) + 25,
    );
    timer.unref();
  };

  const addConnection = async (socket: KabuSocket, code: string) => {
    const key = `${code}:${socket.data.playerId}`;
    const ids = connections.get(key) ?? new Set<string>();
    ids.add(socket.id);
    connections.set(key, ids);
    socket.data.roomCodes.add(code);
    await socket.join(roomChannel(code));
    const currentController = controllers.get(key);
    if (!currentController) {
      controllers.set(key, socket.id);
      await lobby.setConnected(socket.data.playerId, code, true);
      return "active" as const;
    }
    return currentController === socket.id
      ? ("active" as const)
      : ("takeover-required" as const);
  };

  const removeConnection = async (socket: KabuSocket, code: string) => {
    const key = `${code}:${socket.data.playerId}`;
    const ids = connections.get(key);
    ids?.delete(socket.id);
    socket.data.roomCodes.delete(code);
    if (!ids || ids.size === 0) {
      connections.delete(key);
    }
    if (controllers.get(key) === socket.id) {
      controllers.delete(key);
      await lobby.setConnected(socket.data.playerId, code, false);
    }
  };

  io.use((socket, next) => {
    const cookies = app.parseCookie(socket.handshake.headers.cookie ?? "");
    void lobby
      .authenticate(cookies[SESSION_COOKIE])
      .then((session) => {
        socket.data.playerId = session.playerId;
        socket.data.roomCodes = new Set<string>();
        next();
      })
      .catch(() => next(new Error("SESSION_REQUIRED")));
  });

  io.on("connection", (socket) => {
    socket.on("room:subscribe", (raw, acknowledge) => {
      void (async () => {
        const resumeStartedAt = performance.now();
        const parsed = RoomCodeSchema.safeParse(raw.roomCode);
        if (!parsed.success) {
          acknowledge({
            ok: false,
            error: {
              code: "ROOM_NOT_FOUND",
              message: "Dieser Raum wurde nicht gefunden.",
            },
          });
          return;
        }
        const snapshot = await lobby.getSnapshot(
          socket.data.playerId,
          parsed.data,
        );
        if (!snapshot) {
          acknowledge({
            ok: false,
            error: {
              code: "NOT_A_MEMBER",
              message: "Du gehörst nicht zu diesem Raum.",
            },
          });
          return;
        }
        const control = await addConnection(socket, parsed.data);
        const connectedSnapshot = await lobby.getSnapshot(
          socket.data.playerId,
          parsed.data,
        );
        acknowledge({ ok: true, snapshot: connectedSnapshot!, control });
        metrics.recordResume(performance.now() - resumeStartedAt);
        scheduleRoomTimeouts(parsed.data, connectedSnapshot!);
        await broadcastSnapshots(parsed.data);
      })().catch(() => {
        acknowledge({
          ok: false,
          error: {
            code: "INVALID_COMMAND",
            message: "Der Raum konnte nicht verbunden werden.",
          },
        });
      });
    });

    socket.on("room:takeover", (raw, acknowledge) => {
      void (async () => {
        const parsed = RoomCodeSchema.safeParse(raw.roomCode);
        if (!parsed.success || !socket.data.roomCodes.has(parsed.data)) {
          acknowledge({
            ok: false,
            error: {
              code: "NOT_A_MEMBER",
              message: "Verbinde zuerst den Raum.",
            },
          });
          return;
        }
        const key = `${parsed.data}:${socket.data.playerId}`;
        const previousId = controllers.get(key);
        if (previousId && previousId !== socket.id) {
          const previous = io.sockets.sockets.get(previousId) as
            | KabuSocket
            | undefined;
          previous?.emit("room:control", "revoked");
        }
        controllers.set(key, socket.id);
        await lobby.setConnected(socket.data.playerId, parsed.data, true);
        const snapshot = await lobby.getSnapshot(
          socket.data.playerId,
          parsed.data,
        );
        if (!snapshot) {
          acknowledge({
            ok: false,
            error: {
              code: "NOT_A_MEMBER",
              message: "Du gehörst nicht zu diesem Raum.",
            },
          });
          return;
        }
        socket.emit("room:control", "active");
        acknowledge({ ok: true, snapshot, control: "active" });
        await broadcastSnapshots(parsed.data);
      })().catch(() =>
        acknowledge({
          ok: false,
          error: {
            code: "INVALID_COMMAND",
            message: "Die Steuerung konnte nicht übernommen werden.",
          },
        }),
      );
    });

    socket.on("room:commandStatus", (raw, acknowledge) => {
      void (async () => {
        const code = RoomCodeSchema.safeParse(raw.roomCode);
        const commandId = CommandIdSchema.safeParse(raw.commandId);
        if (
          !code.success ||
          !commandId.success ||
          !socket.data.roomCodes.has(code.data)
        ) {
          acknowledge({ status: "unknown" });
          return;
        }
        const ack = await lobby.getCommandResult(
          socket.data.playerId,
          code.data,
          commandId.data,
        );
        acknowledge(ack ? { status: "resolved", ack } : { status: "unknown" });
      })().catch(() => acknowledge({ status: "unknown" }));
    });

    socket.on("room:command", (raw, acknowledge) => {
      const receivedAt = Date.now();
      const processingStartedAt = performance.now();
      void (async () => {
        const parsed = RoomCommandEnvelopeSchema.safeParse(raw);
        if (!parsed.success) {
          const commandId =
            typeof raw === "object" &&
            raw !== null &&
            "commandId" in raw &&
            typeof raw.commandId === "string" &&
            /^[0-9a-f-]{36}$/iu.test(raw.commandId)
              ? raw.commandId
              : randomUUID();
          acknowledge(
            CommandAckSchema.parse({
              commandId,
              accepted: false,
              duplicate: false,
              sequence: 0,
              error: {
                code: "INVALID_COMMAND",
                message: "Der Befehl ist ungültig.",
              },
            }),
          );
          return;
        }
        if (!socket.data.roomCodes.has(parsed.data.roomCode)) {
          acknowledge({
            commandId: parsed.data.commandId,
            accepted: false,
            duplicate: false,
            sequence: 0,
            error: {
              code: "NOT_A_MEMBER",
              message: "Verbinde zuerst den Raum.",
            },
          });
          return;
        }
        const controlKey = `${parsed.data.roomCode}:${socket.data.playerId}`;
        if (controllers.get(controlKey) !== socket.id) {
          acknowledge({
            commandId: parsed.data.commandId,
            accepted: false,
            duplicate: false,
            sequence: 0,
            error: {
              code: "CONTROL_TAKEN_OVER",
              message: "Die Steuerung ist in einem anderen Tab aktiv.",
            },
          });
          return;
        }
        const rate = commandLimiter.take(
          `${parsed.data.roomCode}:${socket.data.playerId}`,
          receivedAt,
        );
        if (!rate.allowed) {
          const ack: CommandAck = {
            commandId: parsed.data.commandId,
            accepted: false,
            duplicate: false,
            sequence: 0,
            error: {
              code: "RATE_LIMITED",
              message: "Zu viele technische Anfragen. Bitte kurz warten.",
            },
          };
          metrics.recordCommand({
            queueMs: 0,
            persistenceMs: 0,
            processingMs: performance.now() - processingStartedAt,
            totalMs: performance.now() - processingStartedAt,
            outcome: "throttled",
            reason: "RATE_LIMITED",
          });
          acknowledge(ack);
          return;
        }
        const queued = await inRoomQueue(parsed.data.roomCode, () =>
          lobby.executeCommand(socket.data.playerId, parsed.data, receivedAt),
        );
        const result = queued.value;
        const outcome: CommandOutcome = result.ack.accepted
          ? "accepted"
          : "domain-rejected";
        const totalMs = performance.now() - processingStartedAt;
        metrics.recordCommand({
          queueMs: queued.queueMs,
          persistenceMs: result.persistenceMs ?? 0,
          processingMs: Math.max(0, totalMs - queued.queueMs),
          totalMs,
          outcome,
          ...(result.ack.error ? { reason: result.ack.error.code } : {}),
        });
        if (options.testDropAckAfterStore?.()) {
          socket.disconnect(true);
          return;
        }
        acknowledge(result.ack);
        if (result.changed) {
          if (parsed.data.command.type === "lobby.leave") {
            await socket.leave(roomChannel(parsed.data.roomCode));
            await removeConnection(socket, parsed.data.roomCode);
          }
          await broadcastSnapshots(parsed.data.roomCode);
          if (result.room) {
            scheduleEffectTimeouts(parsed.data.roomCode, result.room.game);
          }
          if (parsed.data.command.type === "game.react") {
            const timer = setTimeout(() => {
              void broadcastSnapshots(parsed.data.roomCode);
            }, publicRevealDurationMs() + 25);
            timer.unref();
          }
        }
      })().catch(() => {
        metrics.recordCommand({
          queueMs: 0,
          persistenceMs: 0,
          processingMs: performance.now() - processingStartedAt,
          totalMs: performance.now() - processingStartedAt,
          outcome: "technical-error",
          reason: "UNHANDLED_COMMAND_ERROR",
        });
        const fallback: CommandAck = {
          commandId:
            typeof raw.commandId === "string" ? raw.commandId : randomUUID(),
          accepted: false,
          duplicate: false,
          sequence: 0,
          error: {
            code: "INVALID_COMMAND",
            message: "Der Befehl konnte nicht verarbeitet werden.",
          },
        };
        acknowledge(fallback);
      });
    });

    socket.on("disconnect", () => {
      void (async () => {
        const codes = [...socket.data.roomCodes];
        for (const code of codes) {
          await removeConnection(socket, code);
          await broadcastSnapshots(code);
        }
      })();
    });
  });

  await lobby.cleanupExpired();
  const recoveredRooms = await lobby.recoverStartedRooms();
  for (const room of recoveredRooms) {
    const firstMember = room.members[0];
    if (!firstMember) continue;
    scheduleRoomTimeouts(
      room.code,
      await lobby.getSnapshot(firstMember.playerId, room.code),
    );
  }

  app.get("/api/health", async () =>
    HealthResponseSchema.parse({
      status: "ok",
      service: "kabu-server",
      rulesVersion: "1.0",
    }),
  );

  app.get("/api/metrics", async () => metrics.snapshot());

  app.post("/api/session", async (request, reply) => {
    const result = await lobby.ensureSession(cookieToken(request));
    if (result.newToken) {
      reply.setCookie(SESSION_COOKIE, result.newToken, {
        httpOnly: true,
        sameSite: "strict",
        secure: options.cookieSecure ?? false,
        path: "/",
        maxAge: SESSION_MAX_AGE_SECONDS,
      });
    }
    return SessionResponseSchema.parse({ playerId: result.session.playerId });
  });

  app.post("/api/rooms", async (request, reply) => {
    try {
      const session = await lobby.authenticate(cookieToken(request));
      const parsed = CreateRoomRequestSchema.safeParse(request.body);
      if (!parsed.success) {
        return apiError(
          reply,
          400,
          "INVALID_REQUEST",
          "Name oder Rundenzahl ist ungültig.",
        );
      }
      const snapshot = await lobby.createRoom(
        session.playerId,
        parsed.data.name,
        parsed.data.roundCount,
      );
      return RoomResponseSchema.parse({
        invitePath: `/room/${snapshot.room.code}`,
        snapshot,
      });
    } catch (error) {
      if (error instanceof LobbyError) {
        return apiError(reply, error.statusCode, error.code, error.message);
      }
      throw error;
    }
  });

  app.post("/api/rooms/join", async (request, reply) => {
    try {
      const session = await lobby.authenticate(cookieToken(request));
      const ipLimit = joinLimiter.take(`ip:${request.ip}`);
      const sessionLimit = joinLimiter.take(`session:${session.playerId}`);
      if (!ipLimit.allowed || !sessionLimit.allowed) {
        reply.header(
          "retry-after",
          String(
            Math.ceil(
              Math.max(ipLimit.retryAfterMs, sessionLimit.retryAfterMs) / 1_000,
            ),
          ),
        );
        return apiError(
          reply,
          429,
          "RATE_LIMITED",
          "Zu viele Beitrittsversuche. Bitte kurz warten.",
        );
      }
      const parsed = JoinRoomRequestSchema.safeParse(request.body);
      if (!parsed.success) {
        return apiError(
          reply,
          400,
          "INVALID_REQUEST",
          "Name oder Raumcode ist ungültig.",
        );
      }
      const snapshot = await lobby.joinRoom(
        session.playerId,
        parsed.data.code,
        parsed.data.name,
      );
      await broadcastSnapshots(parsed.data.code);
      return RoomResponseSchema.parse({
        invitePath: `/room/${snapshot.room.code}`,
        snapshot,
      });
    } catch (error) {
      if (error instanceof LobbyError) {
        return apiError(reply, error.statusCode, error.code, error.message);
      }
      throw error;
    }
  });

  app.get("/api/rooms/:code", async (request, reply) => {
    try {
      const session = await lobby.authenticate(cookieToken(request));
      const rawCode = (request.params as { code?: unknown }).code;
      const parsed = RoomCodeSchema.safeParse(rawCode);
      if (!parsed.success) {
        return apiError(
          reply,
          404,
          "ROOM_NOT_FOUND",
          "Dieser Raum wurde nicht gefunden.",
        );
      }
      const snapshot = await lobby.getSnapshot(session.playerId, parsed.data);
      if (!snapshot) {
        return apiError(
          reply,
          403,
          "NOT_A_MEMBER",
          "Du gehörst nicht zu diesem Raum.",
        );
      }
      return LobbySnapshotSchema.parse(snapshot);
    } catch (error) {
      if (error instanceof LobbyError) {
        return apiError(reply, 401, "SESSION_REQUIRED", error.message);
      }
      throw error;
    }
  });

  if (options.serveWeb ?? true) {
    const moduleDirectory = path.dirname(fileURLToPath(import.meta.url));
    const webRoot = path.resolve(moduleDirectory, "../../web/dist");

    if (existsSync(webRoot)) {
      await app.register(fastifyStatic, {
        root: webRoot,
        wildcard: false,
      });
      app.setNotFoundHandler((request, reply) => {
        if (
          request.method === "GET" &&
          !request.url.startsWith("/api/") &&
          !request.url.startsWith("/socket.io/")
        ) {
          return reply.sendFile("index.html");
        }
        return apiError(
          reply,
          404,
          "ROOM_NOT_FOUND",
          "Die Seite wurde nicht gefunden.",
        );
      });
    }
  }

  app.addHook("onClose", async () => {
    await new Promise<void>((resolve) => {
      io.close(() => resolve());
    });
    await store.close();
  });

  return app;
}
