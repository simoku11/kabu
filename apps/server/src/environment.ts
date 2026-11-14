import { config } from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";

const moduleDirectory = path.dirname(fileURLToPath(import.meta.url));

config({
  path: path.resolve(moduleDirectory, "../../../.env"),
  quiet: true,
});
