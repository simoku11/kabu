# M8 – technischer Beta-Befund

## Schutz und Messung

- Browserursprünge werden gegen `ALLOWED_ORIGINS` geprüft; HTTP- und
  Socket-Nachrichten sind auf 16 KiB begrenzt.
- Das Sitzungscookie ist `HttpOnly`, `SameSite=Strict`, im HTTPS-Betrieb
  `Secure` und enthält die Spieleridentität nicht im Klartext.
- Beitrittsversuche werden pro IP und Sitzung mit 10 Versuchen pro Minute
  begrenzt. Spielbefehle erlauben standardmäßig 240 Nachrichten in 10 Sekunden.
  Eine technische Drosselung ist eine neutrale `RATE_LIMITED`-Ablehnung und
  gelangt nicht in den Regelkern.
- `/api/metrics` enthält nur aggregierte Latenzen und Ablehnungsgründe:
  Ende-zu-Ende-Serverzeit, Bearbeitung nach der Queue, separate Raumqueue,
  Store/Transaktion und
  Wiederaufnahme. Raumcodes, Spieler- oder Befehls-IDs und Kartenwerte fehlen.
  Die Stichprobe ist auf die letzten 20.000 Befehle begrenzt und ersetzt kein
  dauerhaftes Produktionsmonitoring.

## Wiederholbarer Lastlauf

`pnpm load:m8` startet standardmäßig eine isolierte In-Memory-Instanz mit 20
Räumen und je sechs echten Socket-Clients. Jeder Raum startet eine Partie,
führt reguläre Zieh-/Tauschzüge aus und erhält wiederkehrende nahezu
gleichzeitige Reaktionsstöße. `M8_LOAD_TURNS=16` ändert die Dauer.

Für eine isolierte PostgreSQL-Testdatenbank:

```bash
M8_DATABASE_URL=postgres://…/kabu_m8_load pnpm db:migrate
M8_DATABASE_URL=postgres://…/kabu_m8_load pnpm load:m8
```

Die Migration muss gegen genau diese Testdatenbank laufen. Keine Produktions-
oder persönliche Entwicklungsdatenbank verwenden. Der JSON-Bericht nennt
Umgebung, Store, Dauer, Aktionszahl, Bearbeitungs-, Queue-, Persistenz- und
Wiederaufnahmelatenzen sowie fachliche, technische und gedrosselte Ergebnisse.

## Abnahmegrenze

Das Roadmap-Ziel ist p95 unter 100 ms für die serverseitige Befehlsbearbeitung
einschließlich Speicherung bei 20 × 6 Clients; Queuezeit wird zusätzlich
ausgewiesen. Ein In-Memory-Lauf belegt Regel-/Serverkosten, aber nicht die
PostgreSQL-Kapazität. Eine Beta-Freigabe braucht deshalb den dokumentierten
PostgreSQL-Lauf und die echte Geräteprüfung aus `docs/m8-abnahme.md`.

## Gemessener Lauf vom 14. November 2026

Lokaler Rechner, Node.js 24.21.0, PostgreSQL 16 im Docker-Container auf
demselben Host, getrennte Datenbank `kabu_m8_load`, 20 Räume × 6 Socket-Clients,
8 reguläre Züge je Raum und vier Reaktionsstöße, insgesamt 1.140 gespeicherte
Befehle in 2.969 ms:

| Messwert                                          |       p50 |       p95 |   Maximum |
| ------------------------------------------------- | --------: | --------: | --------: |
| Bearbeitung einschließlich PostgreSQL, ohne Queue |  24,44 ms |  50,27 ms |  81,87 ms |
| separate Raumqueue                                |  15,25 ms | 148,58 ms | 188,25 ms |
| Ende-zu-Ende im Server                            |  45,35 ms | 182,52 ms | 234,57 ms |
| PostgreSQL-Transaktion                            |  24,36 ms |  50,23 ms |  81,86 ms |
| Wiederaufnahme (120 Verbindungen)                 | 121,14 ms | 152,72 ms | 164,93 ms |

Alle 1.140 Befehle wurden akzeptiert; es gab in diesem erfolgreichen Lauf keine
fachliche Ablehnung, Drosselung oder technischen Fehler. Das Roadmap-Ziel
„Bearbeitung einschließlich Speicherung p95 < 100 ms“ ist mit 50,27 ms
erreicht. Die bewusst separat ausgewiesene Ende-zu-Ende-Zeit überschreitet bei
gleichzeitigen Sechser-Reaktionsstößen wegen der seriellen Raumqueue 100 ms;
das ist keine parallelisierbare Datenbankarbeit, sondern die festgelegte
Konsistenzreihenfolge. Messgrenzen: lokaler Einzelprozess, Datenbank auf
demselben Host, kurzer Lauf, keine WAN-/TLS-Latenz und kein Produktionshosting.

## Offene Beta-Punkte

- Echte iOS-Safari-/Android-Chrome-, Funkwechsel- und Mehrpersonenprüfungen sind
  nicht durchgeführt; die Schritte stehen in `docs/m8-abnahme.md`.
- Die Anforderung „zweite nahezu gleichzeitige gültige Reaktion ohne
  Strafkarte“ widerspricht der beschlossenen und in `rules-digital.md`
  dokumentierten V1-Regel: Nach Verbrauch desselben Fensters wird ein weiterer
  Versuch sichtbar als „zu spät“ mit genau einer Strafkarte behandelt. M8
  ändert diese Produktregel nicht. Soll stattdessen neutral abgelehnt werden,
  ist vor der Geräteabnahme eine ausdrückliche Regelentscheidung nötig.
- Produktionsressourcen, WAN/TLS, Hosting und Veröffentlichung gehören zu M9.
