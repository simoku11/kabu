import { describe, expect, it } from "vitest";

import { readConfig } from "./config.js";

describe("server config", () => {
  it("uses a short bounded heartbeat for prompt interruption detection", () => {
    const config = readConfig({
      DATABASE_URL: "postgres://kabu:kabu@localhost:5432/kabu",
    });
    expect(config.SOCKET_PING_INTERVAL_MS).toBe(1_000);
    expect(config.SOCKET_PING_TIMEOUT_MS).toBe(2_000);
    expect(() =>
      readConfig({
        DATABASE_URL: "postgres://kabu:kabu@localhost:5432/kabu",
        SOCKET_PING_INTERVAL_MS: "100",
      }),
    ).toThrow();
  });
});
