import { describe, expect, it } from "vitest";

import {
  HealthResponseSchema,
  LobbySnapshotSchema,
  RoundViewSchema,
  RoomCodeSchema,
} from "./index.js";

describe("HealthResponseSchema", () => {
  it("accepts the M1 health response", () => {
    expect(
      HealthResponseSchema.parse({
        status: "ok",
        service: "kabu-server",
        rulesVersion: "1.0",
      }),
    ).toBeDefined();
  });

  it("rejects an unknown rules version", () => {
    expect(() =>
      HealthResponseSchema.parse({
        status: "ok",
        service: "kabu-server",
        rulesVersion: "2.0",
      }),
    ).toThrow();
  });
});

describe("M3 protected view contracts", () => {
  it("accepts projections without internal card IDs or deck order", () => {
    const playerId = "0f640f13-37c4-4ea9-a9cc-31be3b90d65d";
    const view = RoundViewSchema.parse({
      id: "round-1",
      number: 1,
      phase: "playing",
      startingPlayerId: playerId,
      activePlayerId: playerId,
      drawPileCount: 44,
      turn: { id: "turn-1", number: 1, phase: "awaiting-draw" },
      lastAction: {
        id: "reaction-1:reaction:position-1:1",
        kind: "reaction",
        actorPlayerId: playerId,
        source: {
          playerId: "a59dc026-cbad-4f07-ae8b-31d940e6b001",
          positionId: "position-1",
          occupancyVersion: 1,
        },
      },
      players: [0, 1].map((seat) => ({
        playerId:
          seat === 0 ? playerId : "a59dc026-cbad-4f07-ae8b-31d940e6b001",
        seat,
        initialViewClosed: true,
        positions: [
          {
            id: `position-${seat}`,
            row: "near",
            column: 0,
            occupied: true,
            occupancyVersion: 1,
          },
        ],
      })),
      you: { initialViewOpen: false },
    });
    expect(JSON.stringify(view)).not.toContain("cardId");
    expect(JSON.stringify(view)).not.toContain('"drawPile":[');
    expect(view.lastAction).toMatchObject({
      kind: "reaction",
      actorPlayerId: playerId,
    });
    expect(JSON.stringify(view.lastAction)).not.toContain("card");
  });
});

describe("lobby contracts", () => {
  it("normalizes safe room codes", () => {
    expect(RoomCodeSchema.parse("ab2cd3")).toBe("AB2CD3");
    expect(() => RoomCodeSchema.parse("O0I1LZ")).toThrow();
  });

  it("requires a personalized recipient", () => {
    expect(() =>
      LobbySnapshotSchema.parse({
        room: {
          code: "ABC234",
          status: "lobby",
          roundCount: 10,
          sequence: 0,
        },
        participants: [],
      }),
    ).toThrow();
  });
});
