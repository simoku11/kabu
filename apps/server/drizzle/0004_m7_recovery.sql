ALTER TABLE "rooms"
ADD COLUMN "interruption_state" jsonb NOT NULL
DEFAULT '{"status":"active","missingPlayerIds":[],"pausedAt":null,"reconnectDeadline":null}'::jsonb;

CREATE TABLE "room_events" (
  "room_id" uuid NOT NULL REFERENCES "rooms"("id") ON DELETE CASCADE,
  "sequence" bigint NOT NULL,
  "event_type" varchar(64) NOT NULL,
  "actor_player_id" uuid NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "room_events_room_sequence_pk" PRIMARY KEY ("room_id", "sequence")
);

-- Process-local socket presence is never trusted after a restart. A started
-- room is persisted as paused until every player has explicitly resumed.
UPDATE "room_memberships" SET "connected" = false WHERE "connected" = true;
UPDATE "rooms" r
SET "interruption_state" = jsonb_build_object(
      'status', 'paused',
      'missingPlayerIds', COALESCE(
        (SELECT jsonb_agg(m.player_id ORDER BY m.seat)
         FROM room_memberships m WHERE m.room_id = r.id),
        '[]'::jsonb
      ),
      'pausedAt', (extract(epoch FROM now()) * 1000)::bigint,
      'reconnectDeadline', (extract(epoch FROM now() + interval '90 seconds') * 1000)::bigint
    ),
    "sequence" = "sequence" + 1
WHERE r."status" = 'started';

UPDATE "system_metadata" SET "value" = 'm7', "updated_at" = now()
WHERE "key" = 'schema_version';
