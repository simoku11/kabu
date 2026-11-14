import { HealthResponseSchema, type HealthResponse } from "@kabu/protocol";

export async function fetchHealth(
  fetcher: typeof fetch = fetch,
): Promise<HealthResponse> {
  const response = await fetcher("/api/health", {
    headers: { accept: "application/json" },
  });

  if (!response.ok) {
    throw new Error(`Healthcheck failed with status ${response.status}`);
  }

  return HealthResponseSchema.parse(await response.json());
}
