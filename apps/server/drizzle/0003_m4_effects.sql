-- M3 development rounds do not contain M4 effect/reaction state. Reset only
-- those in-progress test rooms; membership and room identity are preserved.
UPDATE "rooms"
SET "status" = 'lobby', "game_state" = NULL, "started_at" = NULL,
    "sequence" = "sequence" + 1
WHERE "game_state" IS NOT NULL
  AND COALESCE(("game_state" ->> 'dataVersion')::integer, 1) < 2;

UPDATE "system_metadata" SET "value" = 'm4', "updated_at" = now()
WHERE "key" = 'schema_version';
