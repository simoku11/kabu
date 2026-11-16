# Railway-Betrieb

Stand: 14. November 2026

Dieses Dokument hält die für das Kabu-Produktionsdeployment verwendete
Railway-Konfiguration fest. Vor Änderungen an Deployment, Datenbankzugriff,
Healthcheck oder Skalierung zuerst auch `docs/architecture.md` lesen.

## Topologie

- GitHub-Repository: `simoku11/kabu`
- Produktionsbranch: `master`
- Ein gemeinsamer Kabu-App-Service für React, Fastify, API und Socket.IO
- Ein Railway-PostgreSQL-Service im selben Railway-Projekt
- Keine separate produktive `@kabu/web`-Instanz: Der Fastify-Server liefert
  den Build aus `apps/web/dist` aus.
- Eine Region: EU West (Amsterdam)
- Genau eine Replica. Mehrere gleichzeitig schreibende Serverinstanzen sind
  durch eine PostgreSQL-Advisory-Lock absichtlich ausgeschlossen.
- Serverless bleibt deaktiviert, da laufende WebSocket-Verbindungen und
  Spielsitzungen nicht eingeschlafen werden dürfen.

Railway kann beim Import des pnpm-Workspaces automatisch `@kabu/server` und
`@kabu/web` vorschlagen. Produktiv wird nur der gemeinsame App-Service
benötigt. Sein Build muss vom Repository-Root ausgeführt werden.

## App-Service

| Einstellung | Wert |
| --- | --- |
| Source Repo | `simoku11/kabu` |
| Branch | `master` |
| Root Directory | leer, entspricht `/` |
| Builder | Railpack |
| Build Command | `pnpm build` |
| Pre-Deploy Command | `pnpm db:migrate` |
| Start Command | `pnpm --filter @kabu/server start` (gleichwertig: `pnpm start`) |
| Healthcheck Path | `/api/health` |
| Replicas | `1` |
| Serverless | deaktiviert |
| Restart Policy | On Failure, höchstens 10 Versuche |

`pnpm build` ist bewusst der Root-Befehl: Er baut Protocol, Game Core, Webapp
und Server in der notwendigen Reihenfolge. Nur `@kabu/server build` zu bauen
würde den auszuliefernden Web-Build nicht erzeugen.

Die Watch Paths sollen leer bleiben. Insbesondere darf nicht nur
`/apps/server/**` eingetragen sein, weil Änderungen an `apps/web`, `packages`
oder Workspace-Konfigurationen sonst kein automatisches Deployment auslösen.

## Variablen

Die App-Service-Variablen sollen mindestens enthalten:

```env
DATABASE_URL=${{Postgres.DATABASE_URL}}
COOKIE_SECURE=true
ALLOWED_ORIGINS=https://${{RAILWAY_PUBLIC_DOMAIN}}
NODE_ENV=production
LOG_LEVEL=info
KABU_ENABLE_TEST_SCENARIOS=false
VITE_KABU_TEST_SCENARIOS=false
```

`Postgres` muss dabei exakt dem Railway-Namen des Datenbankservices
entsprechen. `PORT` nicht fest eintragen; Railway stellt die Variable bereit.
`HOST` muss ebenfalls nicht gesetzt werden, weil Kabu standardmäßig auf
`0.0.0.0` lauscht. Zugangsdaten oder aufgelöste Werte von `DATABASE_URL`
dürfen weder in Git noch in dieses Dokument geschrieben werden.

Unter Settings -> Networking ist eine Railway-HTTPS-Domain aktiviert. Die
Origin in `ALLOWED_ORIGINS` muss mit dieser Domain beziehungsweise einer
späteren Custom Domain exakt übereinstimmen.

## Normaler Releaseablauf

1. Änderungen lokal mit `pnpm check` prüfen.
2. Auf `master` committen und mit `git push origin master` zu GitHub pushen.
3. Railway soll durch die Branch-Verbindung automatisch ein neues Deployment
   erzeugen. `Wait for CI` ist derzeit deaktiviert.
4. Bei fehlendem Autodeploy in Railway `Ctrl/Cmd + K` öffnen und
   `Deploy Latest Commit` auswählen.
5. Railway führt Build, Pre-Deploy-Migration, Start und Healthcheck aus.
6. Nach dem Release `/api/health`, Raum-Erstellung und Socket-Wiederverbindung
   prüfen.

`Restart` verwendet das vorhandene Image und baut keinen neuen Commit.
`Redeploy` verwendet den Quellstand des ausgewählten alten Deployments. Für
den neuesten GitHub-Stand deshalb `Deploy Latest Commit` verwenden.

## Bekannte Deployment-Sperre

`PostgresLobbyStore` hält während der gesamten Prozesslebenszeit eine
PostgreSQL-Advisory-Lock. Sie verhindert zwei gleichzeitig schreibende
Kabu-Server und ist fachlich beabsichtigt. Railway startet bei einem normalen
Rollout jedoch zunächst den neuen Container und entfernt den alten erst nach
dem erfolgreichen Start beziehungsweise Healthcheck. Solange der alte
Container lebt, kann der neue deshalb mit folgender Meldung abbrechen:

```text
Eine andere Kabu-Serverinstanz besitzt bereits die Schreibberechtigung.
```

Aktueller manueller Betriebsweg, bis ein kontrollierter Handover implementiert
ist:

1. Fehlgeschlagenes oder neustartendes neues Deployment stoppen/entfernen.
2. Das bisher aktive alte Deployment über Deployments -> `...` -> Remove
   stoppen.
3. Warten, bis es als `Removed` erscheint; der Sitzungs-Lock wird mit der
   PostgreSQL-Verbindung automatisch freigegeben.
4. `Ctrl/Cmd + K` -> `Deploy Latest Commit` ausführen.

Dieser Ablauf verursacht kurze Downtime. Die Advisory-Lock nicht manuell in
PostgreSQL aufbrechen und nicht zur Umgehung mehrere Replicas konfigurieren.
Eine dauerhafte Lösung benötigt einen expliziten Deployment-Handover im
Serverbetrieb; Railway-Overlap allein löst das Startproblem nicht.

## Fehlersuche

- Kein Deployment nach einem Push: Branch `master`, GitHub-Verbindung,
  Autodeploy und insbesondere leere Watch Paths prüfen. Unter Deployments auch
  `Show Skipped` ansehen.
- Build enthält die Webapp nicht: Root Directory und `pnpm build` prüfen.
- Migration fehlt: kontrollieren, dass `pnpm db:migrate` als Pre-Deploy
  Command und nicht als Start Command eingetragen ist.
- `DATABASE_URL` fehlt: Referenz auf den PostgreSQL-Service prüfen; keinen
  öffentlichen Datenbank-URL hart codieren.
- Healthcheck schlägt fehl: Deploy-Logs zuerst auf Konfigurationsfehler oder
  die oben beschriebene Schreibsperre prüfen.
- Socket/CORS-Probleme: öffentliche HTTPS-Domain und `ALLOWED_ORIGINS`
  bytegenau vergleichen; `COOKIE_SECURE` muss in Produktion `true` sein.

