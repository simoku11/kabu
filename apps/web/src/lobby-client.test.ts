import { describe, expect, it, vi } from "vitest";

import { classifySnapshotSequence, createCommandId } from "./lobby-client";

describe("createCommandId", () => {
  it("uses the native browser implementation when available", () => {
    const nativeId = "0f640f13-37c4-4ea9-a9cc-31be3b90d65d";
    const randomUUID = vi.fn(() => nativeId);
    const source = {
      randomUUID,
      getRandomValues: vi.fn((bytes: Uint8Array) => bytes),
    };

    expect(createCommandId(source)).toBe(nativeId);
    expect(randomUUID).toHaveBeenCalledOnce();
  });

  it("creates a secure UUID v4 when randomUUID is unavailable", () => {
    const source = {
      getRandomValues: vi.fn((bytes: Uint8Array) => {
        bytes.fill(0xab);
        return bytes;
      }),
    };

    expect(createCommandId(source)).toBe(
      "abababab-abab-4bab-abab-abababababab",
    );
    expect(source.getRandomValues).toHaveBeenCalledOnce();
  });
});

describe("snapshot sequence reconciliation", () => {
  it("ignores old snapshots, applies the next one, and detects a gap", () => {
    expect(classifySnapshotSequence(7, 6)).toBe("stale");
    expect(classifySnapshotSequence(7, 7)).toBe("apply");
    expect(classifySnapshotSequence(7, 8)).toBe("apply");
    expect(classifySnapshotSequence(7, 9)).toBe("resync");
  });
});
