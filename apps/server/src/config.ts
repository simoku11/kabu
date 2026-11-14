import { z } from "zod";

const EnvironmentSchema = z.object({
  HOST: z.string().default("0.0.0.0"),
  PORT: z.coerce.number().int().min(1).max(65_535).default(3000),
  LOG_LEVEL: z
    .enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"])
    .default("info"),
  DATABASE_URL: z.string().url(),
  COOKIE_SECURE: z
    .enum(["true", "false"])
    .default("false")
    .transform((value) => value === "true"),
  ALLOWED_ORIGINS: z
    .string()
    .default("http://localhost:5173,http://localhost:3000"),
  HTTP_BODY_LIMIT_BYTES: z.coerce
    .number()
    .int()
    .min(1_024)
    .max(65_536)
    .default(16_384),
  SOCKET_MESSAGE_LIMIT_BYTES: z.coerce
    .number()
    .int()
    .min(1_024)
    .max(65_536)
    .default(16_384),
  COMMAND_RATE_LIMIT: z.coerce.number().int().min(20).max(2_000).default(240),
  COMMAND_RATE_WINDOW_MS: z.coerce
    .number()
    .int()
    .min(1_000)
    .max(60_000)
    .default(10_000),
  JOIN_RATE_LIMIT: z.coerce.number().int().min(2).max(100).default(10),
  JOIN_RATE_WINDOW_MS: z.coerce
    .number()
    .int()
    .min(10_000)
    .max(600_000)
    .default(60_000),
  SOCKET_PING_INTERVAL_MS: z.coerce
    .number()
    .int()
    .min(500)
    .max(10_000)
    .default(1_000),
  SOCKET_PING_TIMEOUT_MS: z.coerce
    .number()
    .int()
    .min(1_000)
    .max(15_000)
    .default(2_000),
});

export type ServerConfig = z.infer<typeof EnvironmentSchema>;

export function readConfig(
  environment: NodeJS.ProcessEnv = process.env,
): ServerConfig {
  return EnvironmentSchema.parse(environment);
}
