export type CommandOutcome =
  | "accepted"
  | "domain-rejected"
  | "throttled"
  | "technical-error";

interface CommandMeasurement {
  queueMs: number;
  processingMs: number;
  totalMs: number;
  persistenceMs: number;
  outcome: CommandOutcome;
  reason?: string;
}

const MAX_SAMPLES = 20_000;

function percentile(values: number[], fraction: number): number {
  if (values.length === 0) return 0;
  const sorted = values.toSorted((left, right) => left - right);
  return sorted[
    Math.min(sorted.length - 1, Math.ceil(sorted.length * fraction) - 1)
  ]!;
}

function summary(values: number[]) {
  return {
    count: values.length,
    p50Ms: percentile(values, 0.5),
    p95Ms: percentile(values, 0.95),
    maxMs: values.length === 0 ? 0 : Math.max(...values),
  };
}

export class ServerMetrics {
  private commands: CommandMeasurement[] = [];
  private resumes: number[] = [];

  recordCommand(measurement: CommandMeasurement): void {
    this.commands.push(measurement);
    if (this.commands.length > MAX_SAMPLES) this.commands.shift();
  }

  recordResume(durationMs: number): void {
    this.resumes.push(durationMs);
    if (this.resumes.length > MAX_SAMPLES) this.resumes.shift();
  }

  snapshot() {
    const rejectionReasons: Record<string, number> = {};
    const outcomes: Record<CommandOutcome, number> = {
      accepted: 0,
      "domain-rejected": 0,
      throttled: 0,
      "technical-error": 0,
    };
    for (const command of this.commands) {
      outcomes[command.outcome] += 1;
      if (command.reason) {
        rejectionReasons[command.reason] =
          (rejectionReasons[command.reason] ?? 0) + 1;
      }
    }
    return {
      collectedAt: new Date().toISOString(),
      sampleWindow: MAX_SAMPLES,
      commands: {
        endToEnd: summary(this.commands.map((sample) => sample.totalMs)),
        processing: summary(this.commands.map((sample) => sample.processingMs)),
        roomQueue: summary(this.commands.map((sample) => sample.queueMs)),
        persistence: summary(
          this.commands.map((sample) => sample.persistenceMs),
        ),
        outcomes,
        rejectionReasons,
      },
      resume: summary(this.resumes),
    };
  }
}
