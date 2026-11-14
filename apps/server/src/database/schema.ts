import {
  bigint,
  boolean,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

export const systemMetadata = pgTable("system_metadata", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const guestSessions = pgTable("guest_sessions", {
  id: uuid("id").defaultRandom().primaryKey(),
  playerId: uuid("player_id").defaultRandom().notNull().unique(),
  tokenHash: varchar("token_hash", { length: 64 }).notNull().unique(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
});

export const rooms = pgTable("rooms", {
  id: uuid("id").defaultRandom().primaryKey(),
  code: varchar("code", { length: 6 }).notNull().unique(),
  status: varchar("status", { length: 16 }).default("lobby").notNull(),
  hostPlayerId: uuid("host_player_id")
    .notNull()
    .references(() => guestSessions.playerId),
  roundCount: integer("round_count").default(10).notNull(),
  sequence: bigint("sequence", { mode: "number" }).default(0).notNull(),
  gameState: jsonb("game_state"),
  interruptionState: jsonb("interruption_state")
    .default({
      status: "active",
      missingPlayerIds: [],
      pausedAt: null,
      reconnectDeadline: null,
    })
    .notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  startedAt: timestamp("started_at", { withTimezone: true }),
});

export const roomMemberships = pgTable(
  "room_memberships",
  {
    roomId: uuid("room_id")
      .notNull()
      .references(() => rooms.id, { onDelete: "cascade" }),
    playerId: uuid("player_id")
      .notNull()
      .references(() => guestSessions.playerId),
    displayName: varchar("display_name", { length: 24 }).notNull(),
    seat: integer("seat").notNull(),
    ready: boolean("ready").default(false).notNull(),
    connected: boolean("connected").default(false).notNull(),
    joinedAt: timestamp("joined_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.roomId, table.playerId] }),
    unique("room_seat_unique").on(table.roomId, table.seat),
  ],
);

export const roomCommands = pgTable(
  "room_commands",
  {
    roomId: uuid("room_id")
      .notNull()
      .references(() => rooms.id, { onDelete: "cascade" }),
    playerId: uuid("player_id").notNull(),
    commandId: uuid("command_id").notNull(),
    payloadHash: varchar("payload_hash", { length: 64 }).notNull(),
    result: jsonb("result").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.roomId, table.playerId, table.commandId] }),
  ],
);

export const roomEvents = pgTable(
  "room_events",
  {
    roomId: uuid("room_id")
      .notNull()
      .references(() => rooms.id, { onDelete: "cascade" }),
    sequence: bigint("sequence", { mode: "number" }).notNull(),
    eventType: varchar("event_type", { length: 64 }).notNull(),
    actorPlayerId: uuid("actor_player_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [primaryKey({ columns: [table.roomId, table.sequence] })],
);
