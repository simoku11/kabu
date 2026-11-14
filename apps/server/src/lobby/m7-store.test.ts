import { createHash, randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";

import { MemoryLobbyStore } from "./memory-store.js";

const hash = (value: object) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");

describe("M7 store lifecycle", () => {
  it("removes an old unused lobby but retains a started recoverable room", async () => {
    const store = new MemoryLobbyStore({ integer: () => 0 });
    const hostId = randomUUID();
    const guestId = randomUUID();
    await store.createRoom({
      code: "ABC234",
      playerId: hostId,
      name: "Ada",
      roundCount: 10,
    });
    await store.createRoom({
      code: "BCD234",
      playerId: hostId,
      name: "Ada",
      roundCount: 10,
    });
    await store.joinRoom({ code: "BCD234", playerId: guestId, name: "Bo" });
    for (const [playerId, ready] of [
      [hostId, true],
      [guestId, true],
    ] as const) {
      const command = { type: "lobby.setReady" as const, ready };
      await store.executeCommand({
        code: "BCD234",
        playerId,
        commandId: randomUUID(),
        payloadHash: hash(command),
        command,
      });
    }
    const start = { type: "lobby.start" as const };
    await store.executeCommand({
      code: "BCD234",
      playerId: hostId,
      commandId: randomUUID(),
      payloadHash: hash(start),
      command: start,
    });

    await store.cleanupExpired(new Date(Date.now() + 8 * 24 * 60 * 60 * 1000));
    expect(await store.getRoomForPlayer("ABC234", hostId)).toBeUndefined();
    expect((await store.getRoomForPlayer("BCD234", hostId))?.status).toBe(
      "started",
    );
  });
});
