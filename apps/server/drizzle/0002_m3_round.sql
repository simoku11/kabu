ALTER TABLE "rooms" ADD COLUMN "game_state" jsonb;

-- M2's `started` value was only a lobby acceptance marker and had no cards.
UPDATE "rooms" SET "status" = 'lobby', "started_at" = NULL
WHERE "status" = 'started' AND "game_state" IS NULL;

UPDATE "system_metadata" SET "value" = 'm3', "updated_at" = now()
WHERE "key" = 'schema_version';
