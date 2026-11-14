import { z } from "zod";

export const HealthResponseSchema = z.object({
  status: z.literal("ok"),
  service: z.literal("kabu-server"),
  rulesVersion: z.literal("1.0"),
});

export type HealthResponse = z.infer<typeof HealthResponseSchema>;

export const PlayerIdSchema = z.string().uuid();
export const RoomCodeSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-HJ-NP-Z2-9]{6}$/u, "Der Raumcode muss aus 6 Zeichen bestehen.");
export const DisplayNameSchema = z
  .string()
  .trim()
  .min(1, "Bitte gib einen Namen ein.")
  .max(24, "Der Name darf höchstens 24 Zeichen lang sein.");
export const RoundCountSchema = z.number().int().min(1).max(99);
export const RoomSequenceSchema = z.number().int().nonnegative();
export const CommandIdSchema = z.string().uuid();

export const SessionResponseSchema = z.object({
  playerId: PlayerIdSchema,
});
export type SessionResponse = z.infer<typeof SessionResponseSchema>;

export const LobbyParticipantSchema = z.object({
  playerId: PlayerIdSchema,
  name: DisplayNameSchema,
  seat: z.number().int().min(0).max(5),
  ready: z.boolean(),
  connected: z.boolean(),
  isHost: z.boolean(),
});

export const CardViewSchema = z.object({
  suit: z.enum(["hearts", "diamonds", "spades", "clubs"]),
  rank: z.enum([
    "ace",
    "2",
    "3",
    "4",
    "5",
    "6",
    "7",
    "8",
    "9",
    "10",
    "jack",
    "queen",
    "king",
  ]),
  value: z.number().int().min(0).max(13),
});

export const PositionViewSchema = z.object({
  id: z.string().min(1).max(128),
  row: z.enum(["near", "far"]),
  column: z.number().int().nonnegative(),
  occupied: z.boolean(),
  occupancyVersion: z.number().int().nonnegative(),
  held: z.boolean().optional(),
  card: CardViewSchema.optional(),
});

export const RoundViewSchema = z.object({
  id: z.string().min(1).max(64),
  number: z.number().int().positive(),
  phase: z.enum([
    "initial-view",
    "playing",
    "provisional-end",
    "final-reaction",
    "round-result",
    "game-over",
  ]),
  startingPlayerId: PlayerIdSchema,
  activePlayerId: PlayerIdSchema,
  drawPileCount: z.number().int().nonnegative(),
  discardTop: CardViewSchema.extend({
    origin: z.enum(["drawn", "swapped", "reaction"]),
  }).optional(),
  turn: z.object({
    id: z.string().min(1).max(64),
    number: z.number().int().positive(),
    phase: z.enum(["awaiting-draw", "awaiting-decision"]),
  }),
  reactionWindow: z
    .object({
      id: z.string(),
      rank: z.enum([
        "ace",
        "2",
        "3",
        "4",
        "5",
        "6",
        "7",
        "8",
        "9",
        "10",
        "jack",
        "queen",
        "king",
      ]),
      status: z.enum(["open", "consumed"]),
    })
    .nullable()
    .optional(),
  effects: z
    .array(
      z.object({
        id: z.string(),
        ownerPlayerId: PlayerIdSchema,
        kind: z.enum([
          "inspect-own",
          "inspect-opponent",
          "blind-swap",
          "give-card",
          "inspect-swap",
        ]),
        phase: z.enum(["selecting", "viewing", "deciding"]),
        expiresAt: z.number().int().nonnegative().optional(),
        activated: z.boolean().optional(),
        targets: z.array(
          z.object({
            playerId: PlayerIdSchema,
            positionId: z.string(),
            occupancyVersion: z.number().int().nonnegative(),
          }),
        ),
      }),
    )
    .optional(),
  pendingTransfer: z
    .object({
      id: z.string(),
      recipientPlayerId: PlayerIdSchema,
      recipientPositionId: z.string(),
    })
    .optional(),
  publicReveals: z
    .array(
      z.object({
        id: z.string(),
        target: z.object({
          playerId: PlayerIdSchema,
          positionId: z.string(),
          occupancyVersion: z.number().int().nonnegative(),
        }),
        card: CardViewSchema,
        expiresAt: z.number().int().nonnegative(),
        reason: z.enum(["wrong-card", "too-late"]),
      }),
    )
    .optional(),
  restartCount: z.number().int().nonnegative().optional(),
  lastRestartReason: z.literal("draw-pile-exhausted").optional(),
  roundCount: z.number().int().positive().optional(),
  kabuCallerId: PlayerIdSchema.nullable().optional(),
  pendingFinalTurns: z.array(PlayerIdSchema).optional(),
  finalReactionDeadline: z.number().int().nonnegative().nullable().optional(),
  endReason: z.enum(["zero-cards", "kabu"]).nullable().optional(),
  completedRounds: z
    .array(
      z.object({
        roundNumber: z.number().int().positive(),
        endReason: z.enum(["zero-cards", "kabu"]),
        kabuCallerId: PlayerIdSchema.nullable(),
        scores: z.array(
          z.object({
            playerId: PlayerIdSchema,
            cardPoints: z.number().int().nonnegative(),
            kabuPenalty: z.number().int().nonnegative(),
            roundPoints: z.number().int().nonnegative(),
          }),
        ),
      }),
    )
    .optional(),
  totalScores: z
    .record(PlayerIdSchema, z.number().int().nonnegative())
    .optional(),
  nextRoundReady: z.array(PlayerIdSchema).optional(),
  winners: z.array(PlayerIdSchema).optional(),
  players: z
    .array(
      z.object({
        playerId: PlayerIdSchema,
        seat: z.number().int().min(0).max(5),
        initialViewClosed: z.boolean(),
        eliminated: z.boolean().optional(),
        finalScore: z.number().int().nonnegative().optional(),
        positions: z.array(PositionViewSchema),
      }),
    )
    .min(2)
    .max(6),
  you: z.object({
    initialViewOpen: z.boolean(),
    drawnCard: CardViewSchema.optional(),
    privateEffect: z
      .object({
        effectId: z.string(),
        expiresAt: z.number().int().nonnegative(),
        cards: z.array(
          z.object({
            target: z.object({
              playerId: PlayerIdSchema,
              positionId: z.string(),
              occupancyVersion: z.number().int().nonnegative(),
            }),
            card: CardViewSchema,
          }),
        ),
      })
      .optional(),
  }),
});
export type RoundView = z.infer<typeof RoundViewSchema>;

export const LobbySnapshotSchema = z.object({
  room: z.object({
    code: RoomCodeSchema,
    status: z.enum(["lobby", "started"]),
    roundCount: RoundCountSchema,
    sequence: RoomSequenceSchema,
  }),
  you: z.object({
    playerId: PlayerIdSchema,
    seat: z.number().int().min(0).max(5),
    isHost: z.boolean(),
  }),
  interruption: z.object({
    status: z.enum(["active", "paused", "decision", "aborted"]),
    missingPlayerIds: z.array(PlayerIdSchema),
    pausedAt: z.number().int().nonnegative().nullable(),
    reconnectDeadline: z.number().int().nonnegative().nullable(),
  }),
  participants: z.array(LobbyParticipantSchema).min(1).max(6),
  game: RoundViewSchema.optional(),
});
export type LobbySnapshot = z.infer<typeof LobbySnapshotSchema>;

export const CreateRoomRequestSchema = z.object({
  name: DisplayNameSchema,
  roundCount: RoundCountSchema.default(10),
});
export type CreateRoomRequest = z.infer<typeof CreateRoomRequestSchema>;

export const JoinRoomRequestSchema = z.object({
  code: RoomCodeSchema,
  name: DisplayNameSchema,
});
export type JoinRoomRequest = z.infer<typeof JoinRoomRequestSchema>;

export const RoomResponseSchema = z.object({
  invitePath: z.string().regex(/^\/room\/[A-HJ-NP-Z2-9]{6}$/u),
  snapshot: LobbySnapshotSchema,
});
export type RoomResponse = z.infer<typeof RoomResponseSchema>;

export const LobbyCommandSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("lobby.setReady"), ready: z.boolean() }),
  z.object({
    type: z.literal("lobby.setRounds"),
    roundCount: RoundCountSchema,
  }),
  z.object({ type: z.literal("lobby.start") }),
  z.object({ type: z.literal("lobby.leave") }),
  z.object({
    type: z.literal("game.interruption.wait"),
    roundId: z.string().min(1).max(64),
  }),
  z.object({
    type: z.literal("game.interruption.abort"),
    roundId: z.string().min(1).max(64),
  }),
  z.object({
    type: z.literal("game.interruption.timeout"),
    roundId: z.string().min(1).max(64),
  }),
  z.object({
    type: z.literal("game.closeInitialView"),
    roundId: z.string().min(1).max(64),
  }),
  z.object({
    type: z.literal("game.draw"),
    roundId: z.string().min(1).max(64),
    turnId: z.string().min(1).max(64),
  }),
  z.object({
    type: z.literal("game.discardDrawn"),
    roundId: z.string().min(1).max(64),
    turnId: z.string().min(1).max(64),
  }),
  z.object({
    type: z.literal("game.swapDrawn"),
    roundId: z.string().min(1).max(64),
    turnId: z.string().min(1).max(64),
    positionId: z.string().min(1).max(128),
    occupancyVersion: z.number().int().nonnegative(),
  }),
  z.object({
    type: z.literal("game.effect.activate"),
    roundId: z.string(),
    effectId: z.string(),
  }),
  z.object({
    type: z.literal("game.effect.selectPosition"),
    roundId: z.string(),
    effectId: z.string(),
    targetPlayerId: PlayerIdSchema,
    positionId: z.string(),
    occupancyVersion: z.number().int().nonnegative(),
  }),
  z.object({
    type: z.literal("game.effect.selectPlayer"),
    roundId: z.string(),
    effectId: z.string(),
    targetPlayerId: PlayerIdSchema,
  }),
  z.object({
    type: z.literal("game.effect.skip"),
    roundId: z.string(),
    effectId: z.string(),
  }),
  z.object({
    type: z.literal("game.effect.closeView"),
    roundId: z.string(),
    effectId: z.string(),
  }),
  z.object({
    type: z.literal("game.effect.decideSwap"),
    roundId: z.string(),
    effectId: z.string(),
    swap: z.boolean(),
  }),
  z.object({
    type: z.literal("game.effect.timeout"),
    roundId: z.string(),
    effectId: z.string(),
  }),
  z.object({
    type: z.literal("game.react"),
    roundId: z.string(),
    windowId: z.string(),
    targetPlayerId: PlayerIdSchema,
    positionId: z.string(),
    occupancyVersion: z.number().int().nonnegative(),
  }),
  z.object({
    type: z.literal("game.completeTransfer"),
    roundId: z.string(),
    transferId: z.string(),
    positionId: z.string(),
    occupancyVersion: z.number().int().nonnegative(),
  }),
  z.object({
    type: z.literal("game.callKabu"),
    roundId: z.string(),
    turnId: z.string(),
  }),
  z.object({
    type: z.literal("game.finalReaction.timeout"),
    roundId: z.string(),
  }),
  z.object({
    type: z.literal("game.readyNextRound"),
    roundId: z.string(),
  }),
  z.object({
    type: z.literal("game.dev.loadScenario"),
    roundId: z.string(),
    scenario: z.enum([
      "ability-2",
      "ability-own-look",
      "ability-opponent-look",
      "ability-black-queen",
      "ability-red-king",
      "ability-black-king",
      "reaction-own",
      "reaction-wrong",
      "reaction-two-wrong",
      "reaction-foreign",
      "reaction-during-insight",
      "m5-zero-own",
      "m5-foreign-last",
      "m5-red-king-rescue",
      "m5-kabu",
      "m5-kabu-tie",
      "m5-kabu-early-zero",
      "m5-short-game",
      "m6-grown-field",
      "m6-four-player-grown-fields",
    ]),
  }),
]);
export type LobbyCommand = z.infer<typeof LobbyCommandSchema>;

export const RoomCommandEnvelopeSchema = z.object({
  commandId: CommandIdSchema,
  roomCode: RoomCodeSchema,
  command: LobbyCommandSchema,
});
export type RoomCommandEnvelope = z.infer<typeof RoomCommandEnvelopeSchema>;

export const CommandErrorCodeSchema = z.enum([
  "INVALID_COMMAND",
  "ROOM_NOT_FOUND",
  "NOT_A_MEMBER",
  "ROOM_FULL",
  "GAME_ALREADY_STARTED",
  "NOT_HOST",
  "INVALID_PLAYER_COUNT",
  "NOT_ALL_READY",
  "COMMAND_ID_CONFLICT",
  "GAME_NOT_STARTED",
  "ROUND_NOT_PLAYING",
  "INITIAL_VIEW_CLOSED",
  "NOT_ACTIVE_PLAYER",
  "INVALID_TURN",
  "DRAW_REQUIRED",
  "INVALID_POSITION",
  "STALE_POSITION",
  "DRAW_PILE_EXHAUSTED",
  "INVALID_EFFECT",
  "INVALID_REACTION_WINDOW",
  "CARD_HELD",
  "ACTION_REQUIRED",
  "REACTION_NOT_ALLOWED",
  "KABU_NOT_ALLOWED",
  "FINAL_REACTION_NOT_EXPIRED",
  "ROUND_ALREADY_COMPLETE",
  "NEXT_ROUND_NOT_AVAILABLE",
  "GAME_PAUSED",
  "INTERRUPTION_NOT_EXPIRED",
  "CONTROL_TAKEN_OVER",
  "RATE_LIMITED",
]);
export type CommandErrorCode = z.infer<typeof CommandErrorCodeSchema>;

export const CommandAckSchema = z.object({
  commandId: CommandIdSchema,
  accepted: z.boolean(),
  duplicate: z.boolean(),
  sequence: RoomSequenceSchema,
  error: z
    .object({
      code: CommandErrorCodeSchema,
      message: z.string(),
    })
    .optional(),
});
export type CommandAck = z.infer<typeof CommandAckSchema>;

export const ApiErrorSchema = z.object({
  error: z.object({
    code: CommandErrorCodeSchema.or(
      z.enum(["INVALID_REQUEST", "SESSION_REQUIRED"]),
    ),
    message: z.string(),
  }),
});
export type ApiError = z.infer<typeof ApiErrorSchema>;

export const RoomSubscriptionResultSchema = z.discriminatedUnion("ok", [
  z.object({
    ok: z.literal(true),
    snapshot: LobbySnapshotSchema,
    control: z.enum(["active", "takeover-required"]),
  }),
  z.object({
    ok: z.literal(false),
    error: z.object({ code: CommandErrorCodeSchema, message: z.string() }),
  }),
]);
export type RoomSubscriptionResult = z.infer<
  typeof RoomSubscriptionResultSchema
>;

export interface ServerToClientEvents {
  "room:snapshot": (snapshot: LobbySnapshot) => void;
  "room:control": (state: "active" | "takeover-required" | "revoked") => void;
}

export interface ClientToServerEvents {
  "room:command": (
    envelope: RoomCommandEnvelope,
    acknowledge: (ack: CommandAck) => void,
  ) => void;
  "room:subscribe": (
    data: { roomCode: string },
    acknowledge: (result: RoomSubscriptionResult) => void,
  ) => void;
  "room:takeover": (
    data: { roomCode: string },
    acknowledge: (result: RoomSubscriptionResult) => void,
  ) => void;
  "room:commandStatus": (
    data: { roomCode: string; commandId: string },
    acknowledge: (
      result: { status: "unknown" } | { status: "resolved"; ack: CommandAck },
    ) => void,
  ) => void;
}
