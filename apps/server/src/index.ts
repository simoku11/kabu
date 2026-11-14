import "./environment.js";

import { buildApp } from "./app.js";
import { readConfig } from "./config.js";
import { PostgresLobbyStore } from "./lobby/postgres-store.js";
import { parseAllowedOrigins } from "./security.js";

const config = readConfig();
const app = await buildApp({
  logger: true,
  cookieSecure: config.COOKIE_SECURE,
  allowedOrigins: parseAllowedOrigins(config.ALLOWED_ORIGINS),
  bodyLimitBytes: config.HTTP_BODY_LIMIT_BYTES,
  socketMessageLimitBytes: config.SOCKET_MESSAGE_LIMIT_BYTES,
  commandRateLimit: config.COMMAND_RATE_LIMIT,
  commandRateWindowMs: config.COMMAND_RATE_WINDOW_MS,
  joinRateLimit: config.JOIN_RATE_LIMIT,
  joinRateWindowMs: config.JOIN_RATE_WINDOW_MS,
  socketPingIntervalMs: config.SOCKET_PING_INTERVAL_MS,
  socketPingTimeoutMs: config.SOCKET_PING_TIMEOUT_MS,
  store: new PostgresLobbyStore(config.DATABASE_URL),
});

try {
  await app.listen({ host: config.HOST, port: config.PORT });
} catch (error) {
  app.log.error(error);
  process.exitCode = 1;
}
