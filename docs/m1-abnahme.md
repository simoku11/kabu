# M1-Abnahme

## Automatisch

- `pnpm format:check`: einheitliche Formatierung
- `pnpm lint`: statische Codeprüfung ohne Warnungen
- `pnpm typecheck`: striktes TypeScript in allen vier Workspaces
- `pnpm test`: Tests für Regelkern, Protokoll, Server und Browser-Healthclient
- `pnpm build`: Produktionsartefakte für alle Workspaces
- `pnpm db:migrate`: Migration gegen eine leere PostgreSQL-Datenbank

## Manuell

1. Die Schritte unter „Erster Start“ in `README.md` ausführen.
2. `http://localhost:5173` aufrufen.
3. Prüfen, dass „Server erreichbar“ und die Regelversion `1.0` angezeigt werden.
4. Den Server beenden und mit „Erneut prüfen“ den verständlichen Fehlerzustand prüfen.
5. `pnpm build && pnpm start` ausführen und `http://localhost:3000` öffnen.

## Fehlererkennung der CI

Die Basispipeline stoppt bei einem TypeScript-Fehler, einer fehlschlagenden Test-Erwartung, einer Format-/Lintverletzung, einer fehlgeschlagenen Migration oder einem nicht baubaren Workspace. Absichtlich fehlerhafte Dateien werden nicht eingecheckt; die Erkennung wird durch die einzelnen verpflichtenden CI-Schritte nachvollziehbar gemacht.
