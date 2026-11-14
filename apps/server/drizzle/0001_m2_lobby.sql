CREATE TABLE "guest_sessions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "player_id" uuid DEFAULT gen_random_uuid() NOT NULL UNIQUE,
  "token_hash" varchar(64) NOT NULL UNIQUE,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
  "expires_at" timestamp with time zone NOT NULL
);

CREATE TABLE "rooms" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "code" varchar(6) NOT NULL UNIQUE,
  "status" varchar(16) DEFAULT 'lobby' NOT NULL,
  "host_player_id" uuid NOT NULL REFERENCES "guest_sessions"("player_id"),
  "round_count" integer DEFAULT 10 NOT NULL,
  "sequence" bigint DEFAULT 0 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "started_at" timestamp with time zone,
  CONSTRAINT "rooms_status_check" CHECK ("status" IN ('lobby', 'started')),
  CONSTRAINT "rooms_round_count_check" CHECK ("round_count" BETWEEN 1 AND 99),
  CONSTRAINT "rooms_sequence_check" CHECK ("sequence" >= 0)
);

CREATE TABLE "room_memberships" (
  "room_id" uuid NOT NULL REFERENCES "rooms"("id") ON DELETE CASCADE,
  "player_id" uuid NOT NULL REFERENCES "guest_sessions"("player_id"),
  "display_name" varchar(24) NOT NULL,
  "seat" integer NOT NULL,
  "ready" boolean DEFAULT false NOT NULL,
  "connected" boolean DEFAULT false NOT NULL,
  "joined_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "room_memberships_room_id_player_id_pk" PRIMARY KEY ("room_id", "player_id"),
  CONSTRAINT "room_seat_unique" UNIQUE ("room_id", "seat"),
  CONSTRAINT "room_memberships_seat_check" CHECK ("seat" BETWEEN 0 AND 5),
  CONSTRAINT "room_memberships_name_check" CHECK (char_length(btrim("display_name")) BETWEEN 1 AND 24)
);

CREATE TABLE "room_commands" (
  "room_id" uuid NOT NULL REFERENCES "rooms"("id") ON DELETE CASCADE,
  "player_id" uuid NOT NULL,
  "command_id" uuid NOT NULL,
  "payload_hash" varchar(64) NOT NULL,
  "result" jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "room_commands_room_id_player_id_command_id_pk"
    PRIMARY KEY ("room_id", "player_id", "command_id")
);

UPDATE "system_metadata" SET "value" = 'm2', "updated_at" = now()
WHERE "key" = 'schema_version';
