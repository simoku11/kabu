/* global URL, clearTimeout, console, fetch, setTimeout */

import { spawn, spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import process from "node:process";

const API_ORIGIN = "http://localhost:3000";
const WEB_ORIGIN = "http://localhost:5173";
const SESSION_COOKIE = "kabu_session";

function usage() {
  console.log(`Kabu mit zwei Spielern starten

Verwendung:
  pnpm dev:two [Optionen]

Optionen:
  --host <name>     Name des ersten Spielers (Standard: Spieler 1)
  --guest <name>    Name des zweiten Spielers (Standard: Spieler 2)
  --rounds <anzahl> Rundenzahl (Standard: 10)
  --browser <pfad>  Chrome/Chromium-Binary (alternativ: KABU_BROWSER)
  --help            Diese Hilfe anzeigen`);
}

function parseArguments(values) {
  const options = {
    host: "Spieler 1",
    guest: "Spieler 2",
    rounds: 10,
    browser: process.env.KABU_BROWSER,
  };

  for (let index = 0; index < values.length; index += 1) {
    const argument = values[index];
    if (argument === "--") continue;
    if (argument === "--help" || argument === "-h") return { help: true };
    const value = values[index + 1];
    if (!value || value.startsWith("--")) {
      throw new Error(`Für ${argument} fehlt ein Wert.`);
    }
    if (argument === "--host") options.host = value;
    else if (argument === "--guest") options.guest = value;
    else if (argument === "--rounds") options.rounds = Number(value);
    else if (argument === "--browser") options.browser = value;
    else throw new Error(`Unbekannte Option: ${argument}`);
    index += 1;
  }

  if (
    !Number.isInteger(options.rounds) ||
    options.rounds < 1 ||
    options.rounds > 99
  ) {
    throw new Error("Die Rundenzahl muss zwischen 1 und 99 liegen.");
  }
  for (const [label, name] of [
    ["Host-Name", options.host],
    ["Gast-Name", options.guest],
  ]) {
    if (name.trim().length < 1 || name.trim().length > 24) {
      throw new Error(`${label} muss zwischen 1 und 24 Zeichen lang sein.`);
    }
  }
  return options;
}

function commandAvailable(command) {
  const result = spawnSync(command, ["--version"], { stdio: "ignore" });
  return result.status === 0;
}

function findBrowser(configuredBrowser) {
  const candidates = [
    configuredBrowser,
    "google-chrome",
    "google-chrome-stable",
    "chromium",
    "chromium-browser",
  ].filter(Boolean);
  const browser = candidates.find(commandAvailable);
  if (!browser) {
    throw new Error(
      "Chrome/Chromium wurde nicht gefunden. Setze KABU_BROWSER oder nutze --browser <pfad>.",
    );
  }
  return browser;
}

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: "inherit" });
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (code === 0) resolve();
      else
        reject(
          new Error(
            `${command} wurde ${signal ? `durch ${signal} beendet` : `mit Code ${code} beendet`}.`,
          ),
        );
    });
  });
}

async function isPortAvailable(port) {
  const probe = createServer();
  return new Promise((resolve, reject) => {
    probe.once("error", (error) => {
      if (error?.code === "EADDRINUSE") resolve(false);
      else reject(error);
    });
    probe.listen(port, "0.0.0.0", () => probe.close(() => resolve(true)));
  });
}

async function isKabuEnvironmentRunning() {
  try {
    const [healthResponse, webResponse] = await Promise.all([
      fetch(`${API_ORIGIN}/api/health`),
      fetch(WEB_ORIGIN),
    ]);
    if (!healthResponse.ok || !webResponse.ok) return false;
    const health = await healthResponse.json();
    const page = await webResponse.text();
    return (
      health?.status === "ok" &&
      health?.service === "kabu-server" &&
      page.includes('id="root"')
    );
  } catch {
    return false;
  }
}

async function waitForUrl(url, child, timeoutMs = 60_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error("Der Entwicklungsserver wurde vorzeitig beendet.");
    }
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // Der Server startet noch.
    }
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  throw new Error(`Zeitüberschreitung beim Warten auf ${url}.`);
}

async function request(pathname, init = {}) {
  const response = await fetch(`${API_ORIGIN}${pathname}`, init);
  const payload = await response.json();
  if (!response.ok) {
    throw new Error(
      payload?.error?.message ??
        `API-Anfrage fehlgeschlagen (${response.status}).`,
    );
  }
  return { response, payload };
}

async function createSession() {
  const { response } = await request("/api/session", { method: "POST" });
  const setCookie = response.headers.get("set-cookie");
  const match = new RegExp(`(?:^|[,;]\\s*)${SESSION_COOKIE}=([^;,]+)`).exec(
    setCookie ?? "",
  );
  if (!match?.[1]) throw new Error("Der Server hat keine Sitzung ausgestellt.");
  return match[1];
}

function cookieHeader(token) {
  return { cookie: `${SESSION_COOKIE}=${token}` };
}

async function prepareLobby(options) {
  const hostToken = await createSession();
  const { payload: created } = await request("/api/rooms", {
    method: "POST",
    headers: {
      ...cookieHeader(hostToken),
      "content-type": "application/json",
    },
    body: JSON.stringify({ name: options.host, roundCount: options.rounds }),
  });
  const roomCode = created.snapshot.room.code;
  const guestToken = await createSession();
  await request("/api/rooms/join", {
    method: "POST",
    headers: {
      ...cookieHeader(guestToken),
      "content-type": "application/json",
    },
    body: JSON.stringify({ code: roomCode, name: options.guest }),
  });
  return { roomCode, hostToken, guestToken };
}

async function createBootstrapServer(players, roomCode) {
  const pending = new Map(
    players.map(({ sessionToken }) => [
      randomBytes(24).toString("hex"),
      sessionToken,
    ]),
  );
  const server = createServer((request, response) => {
    const requestUrl = new URL(request.url ?? "/", "http://localhost");
    const token = requestUrl.pathname.slice(1);
    const sessionToken = pending.get(token);
    if (!sessionToken) {
      response.writeHead(404).end("Dieser Start-Link ist nicht mehr gültig.");
      return;
    }
    pending.delete(token);
    response.writeHead(302, {
      location: `${WEB_ORIGIN}/room/${roomCode}`,
      "set-cookie": `${SESSION_COOKIE}=${sessionToken}; Path=/; HttpOnly; SameSite=Strict; Max-Age=2592000`,
      "cache-control": "no-store",
    });
    response.end();
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, resolve);
  });
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error(
      "Der lokale Browser-Startdienst konnte nicht gestartet werden.",
    );
  }
  const links = [...pending.keys()].map(
    (token) => `http://localhost:${address.port}/${token}`,
  );
  return { server, links };
}

function startProcess(command, args, options = {}) {
  const child = spawn(command, args, {
    stdio: options.stdio ?? "inherit",
    detached: process.platform !== "win32",
  });
  child.once("error", (error) => {
    console.error(`\n${command} konnte nicht gestartet werden:`, error.message);
  });
  return child;
}

function stopProcess(child) {
  if (!child || child.exitCode !== null || child.killed) return;
  try {
    if (process.platform !== "win32" && child.pid)
      process.kill(-child.pid, "SIGTERM");
    else child.kill("SIGTERM");
  } catch (error) {
    if (error?.code !== "ESRCH") throw error;
  }
}

function waitForProcessExit(child, timeoutMs = 2_000) {
  if (!child || child.exitCode !== null) return Promise.resolve();
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, timeoutMs);
    child.once("exit", () => {
      clearTimeout(timer);
      resolve();
    });
  });
}

let options;
try {
  options = parseArguments(process.argv.slice(2));
} catch (error) {
  console.error(error.message);
  usage();
  process.exit(1);
}
if (options.help) {
  usage();
  process.exit(0);
}

const browser = findBrowser(options.browser);
const children = [];
const profileRoot = await mkdtemp(path.join(tmpdir(), "kabu-two-players-"));
let bootstrapServer;
let cleaningUp = false;
let devServer;
let reusedEnvironment = false;

async function cleanup(exitCode = 0) {
  if (cleaningUp) return;
  cleaningUp = true;
  if (bootstrapServer) {
    await new Promise((resolve) => bootstrapServer.close(resolve));
  }
  for (const child of children.toReversed()) stopProcess(child);
  await Promise.all(children.map((child) => waitForProcessExit(child)));
  await rm(profileRoot, {
    recursive: true,
    force: true,
    maxRetries: 3,
    retryDelay: 100,
  });
  process.exit(exitCode);
}

process.once("SIGINT", () => void cleanup(0));
process.once("SIGTERM", () => void cleanup(0));

try {
  console.log("Aktuellen lokalen Code bauen …");
  await run("pnpm", ["build"]);

  const [apiPortAvailable, webPortAvailable] = await Promise.all([
    isPortAvailable(3000),
    isPortAvailable(5173),
  ]);
  if (apiPortAvailable && webPortAvailable) {
    console.log("PostgreSQL starten …");
    await run("docker", [
      "compose",
      "up",
      "-d",
      "--wait",
      "--wait-timeout",
      "60",
      "postgres",
    ]);
    console.log("Datenbank migrieren …");
    await run("pnpm", ["db:migrate"]);

    console.log("Kabu-Server und Web-App starten …");
    devServer = startProcess("pnpm", ["dev"]);
    children.push(devServer);
    await Promise.all([
      waitForUrl(`${API_ORIGIN}/api/health`, devServer),
      waitForUrl(WEB_ORIGIN, devServer),
    ]);
  } else if (
    !apiPortAvailable &&
    !webPortAvailable &&
    (await isKabuEnvironmentRunning())
  ) {
    reusedEnvironment = true;
    console.log("Vorhandenen Kabu-Server und vorhandene Web-App verwenden …");
  } else {
    const occupied = [
      !apiPortAvailable ? "3000" : undefined,
      !webPortAvailable ? "5173" : undefined,
    ]
      .filter(Boolean)
      .join(" und ");
    throw new Error(
      `Port ${occupied} ist belegt, dort läuft aber keine vollständige Kabu-Entwicklungsumgebung. Beende den belegenden Prozess und versuche es erneut.`,
    );
  }

  const lobby = await prepareLobby(options);
  const bootstrap = await createBootstrapServer(
    [{ sessionToken: lobby.hostToken }, { sessionToken: lobby.guestToken }],
    lobby.roomCode,
  );
  bootstrapServer = bootstrap.server;

  const browserSettings = [
    { profile: "spieler-1", position: "0,0", link: bootstrap.links[0] },
    { profile: "spieler-2", position: "620,0", link: bootstrap.links[1] },
  ];
  for (const settings of browserSettings) {
    const child = startProcess(browser, [
      `--user-data-dir=${path.join(profileRoot, settings.profile)}`,
      "--new-window",
      "--no-first-run",
      "--no-default-browser-check",
      "--window-size=600,900",
      `--window-position=${settings.position}`,
      settings.link,
    ]);
    children.push(child);
  }

  console.log(
    `\nLobby ${lobby.roomCode} ist für ${options.host} und ${options.guest} geöffnet.`,
  );
  console.log(
    reusedEnvironment
      ? "Mit Ctrl+C werden die beiden Browser beendet; die vorhandenen Server laufen weiter."
      : "Mit Ctrl+C werden Server und Browser beendet.",
  );

  if (devServer) {
    await new Promise((resolve, reject) => {
      devServer.once("exit", (code, signal) => {
        if (!cleaningUp) {
          reject(
            new Error(
              `Der Entwicklungsserver wurde ${signal ? `durch ${signal} beendet` : `mit Code ${code} beendet`}.`,
            ),
          );
        } else resolve();
      });
    });
  } else {
    await new Promise(() => {});
  }
} catch (error) {
  console.error(`\nStart fehlgeschlagen: ${error.message}`);
  await cleanup(1);
}
