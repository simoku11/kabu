# Kabu

Technische Basis für die mobile Kabu-Webapp. Das Repository ist als pnpm-Workspace aufgebaut und trennt Browser-App, Server, Regelkern und Netzwerkprotokoll.

## Voraussetzungen

- Node.js 24
- pnpm 11
- Docker mit Docker Compose (für die lokale PostgreSQL-Datenbank)

## Erster Start

```bash
cp .env.example .env
pnpm install
docker compose up -d postgres
pnpm db:migrate
pnpm dev
```

Danach ist die Browser-App unter `http://localhost:5173` erreichbar. Vite
leitet HTTP und Socket.IO an den autoritativen Server weiter. Dort können
private Räume erstellt und mit 2–6 Browsern per Link oder Code betreten werden.

## Prüfen

```bash
pnpm check
```

Der Befehl prüft Formatierung, Lint-Regeln, strikte TypeScript-Typen, Tests und Produktionsbuild. Die CI führt dieselbe Kette aus und testet die Migration gegen eine frische PostgreSQL-Datenbank.

## Produktionsmodus lokal prüfen

```bash
pnpm build
pnpm start
```

Der Fastify-Server liefert dann sowohl `/api/health` als auch die gebaute Browser-App unter `http://localhost:3000` aus.

## Struktur

- `apps/web`: mobile React-/Vite-App
- `apps/server`: autoritativer Fastify-Server und Datenbankzugriff
- `packages/game-core`: reiner, deterministischer Regelkern
- `packages/protocol`: gemeinsame, zur Laufzeit geprüfte Nachrichtenverträge
- `docs`: Architektur-, Regel- und Abnahmedokumentation

Die lokale Datenbank enthält ausschließlich Entwicklungsdaten. Zugangsdaten in `compose.yaml` sind bewusst lokale Standardwerte und dürfen nicht für einen Onlinebetrieb übernommen werden.

## M7 auf zwei bis sechs Handys testen

Rechner und Handys müssen im selben WLAN sein. `pnpm dev` lauscht bereits auf
allen lokalen Interfaces. Auf Handy 1 die von Vite hinter `Network:`
ausgegebene Adresse öffnen, einen Raum erstellen und den angezeigten Link oder
Code auf Handy 2 verwenden. Ist Port 5173 belegt, wählt Vite beispielsweise
5174; beide Handys müssen den tatsächlich ausgegebenen Port verwenden. Nach dem
Lobby-Start sieht jedes Gerät nur seine zwei spielernahen Startkarten. Die
vollständige Prüffolge steht in `docs/m6-abnahme.md`.

Für reproduzierbare M6-Szenarien müssen vor `pnpm dev` lokal
`KABU_ENABLE_TEST_SCENARIOS=true` und `VITE_KABU_TEST_SCENARIOS=true` gesetzt
sein. Nur der Host sieht dann nach dem Start den Szenario-Lader. Die genaue
Prüffolge steht in `docs/m6-abnahme.md`. Diese Schalter dürfen in Produktion
nicht aktiviert werden.

Die Unterbrechungs- und Neustartprüfung steht in `docs/m7-abnahme.md`; die
reine Bedienprüfung bleibt in `docs/m6-abnahme.md`.

Die private Beta wird mit `pnpm load:m8` technisch belastet. Messgrenzen,
PostgreSQL-Variante, Fehlerbericht und die nummerierte Geräteabnahme stehen in
`docs/m8-beta.md` und `docs/m8-abnahme.md`.

M6 ergänzt die mobile Bedienung der vollständigen Partie. Echte Handytests bleiben
Teil der manuellen Abnahme und wurden durch die automatisierte Suite nicht
ersetzt.

`COOKIE_SECURE=false` ist ausschließlich für lokales HTTP vorgesehen. Bei
einem später ausdrücklich freigegebenen HTTPS-Betrieb muss der Wert
`COOKIE_SECURE=true` sein. Das Wiederbeitrittsgeheimnis ist ein
`HttpOnly`-Cookie und darf nicht in URLs, JavaScript-Speicher oder Logs
übernommen werden.
