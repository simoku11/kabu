# M2-Abnahme

## Automatisch

`pnpm check` prüft Format, Lint, strikte Typen, alle Unit- und
Socket-Integrationstests sowie den Produktionsbuild. Zusätzlich:

```bash
docker compose up -d postgres
pnpm db:migrate
```

Die Migration erzeugt Sessions, Räume, Mitgliedschaften und das
Befehlsjournal.

## Zwei echte Handys

1. Rechner und beide Handys mit demselben WLAN verbinden.
2. PostgreSQL und App mit den Schritten aus dem README starten.
3. Die von Vite hinter `Network:` ausgegebene Adresse am ersten Handy öffnen.
   Der Port ist meist 5173, kann bei einem belegten Port aber etwa 5174 sein.
   Namen eingeben und einen Raum mit 10 Runden erstellen.
4. Angezeigten Code oder `http://<LAN-IP>:<VITE-PORT>/room/<CODE>` am zweiten
   Handy öffnen, zweiten Namen eingeben und beitreten.
5. Prüfen, dass beide Namen und beide Online-Markierungen auf beiden Geräten
   erscheinen.
6. Beide auf „Ich bin bereit“ tippen. Prüfen, dass nur der Host „Partie
   starten“ bedienen kann.
7. Zweites Handy neu laden. Identität, Name und Sitz müssen erhalten bleiben;
   der Host darf nicht wechseln.
8. Noch vor dem Start den Host „Raum endgültig verlassen“ wählen lassen. Das
   zweite, verbundene Handy muss Host werden.
9. Für den Starttest einen neuen Raum verwenden, beide bereit markieren und
   starten. Beide Geräte müssen „Partie gestartet“ anzeigen; ein weiterer
   Browser darf nicht mehr beitreten.
