import { describe, expect, it, vi } from "vitest";

import { fetchHealth } from "./health-client";

describe("fetchHealth", () => {
  it("validates a server response", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          status: "ok",
          service: "kabu-server",
          rulesVersion: "1.0",
        }),
        { status: 200 },
      ),
    );

    await expect(fetchHealth(fetcher)).resolves.toEqual({
      status: "ok",
      service: "kabu-server",
      rulesVersion: "1.0",
    });
  });

  it("rejects invalid response data", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response(JSON.stringify({ status: "maybe" })));

    await expect(fetchHealth(fetcher)).rejects.toThrow();
  });
});
