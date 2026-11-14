CREATE TABLE "system_metadata" (
  "key" text PRIMARY KEY NOT NULL,
  "value" text NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

INSERT INTO "system_metadata" ("key", "value")
VALUES ('schema_version', 'm1');
