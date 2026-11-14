# M3-Abnahme

## Automatisch

```bash
pnpm check
docker compose up -d postgres
pnpm db:migrate
```

Die Tests prüfen 52 eindeutige Karten und ihre Werte, Aufbau für 2–6 Spieler,
Startsichtschutz, Zugberechtigung, Ablegen, Tauschen, stabile Positionen,
Recycling, Idempotenz und einen vollständigen Umlauf mit zwei getrennten
Socket-Clients. Die Migration ergänzt den atomar gespeicherten Rundensnapshot.

## Zwei echte Handys

1. Rechner und beide Handys mit demselben WLAN verbinden, PostgreSQL starten,
   Migration ausführen und `pnpm dev` starten.
2. Die von Vite als `Network:` ausgegebene Adresse auf Handy 1 öffnen. Raum
   erstellen und den Link auf Handy 2 öffnen; dort mit einem anderen Namen
   beitreten.
3. Beide Spieler bereit markieren und auf Handy 1 als Host starten. Prüfen,
   dass beide Handys beide Kartenfelder sowie Nachziehstapel und den klar als
   leer markierten Ablageplatz sehen. Das eigene Feld steht jeweils unten.
   Jedes Handy sieht genau zwei eigene Kartenwerte in der spielernahen Reihe
   und niemals Werte des anderen Spielers.
4. Auf Handy 1 die Startansicht schließen und neu laden. Die Werte dürfen nicht
   wieder erscheinen. Der erste Zug darf noch nicht freigegeben sein.
5. Auf Handy 2 ebenfalls schließen. Jetzt zeigt jedes Gerät denselben zufällig
   gewählten aktiven Spieler.
6. Auf dem nicht aktiven Handy prüfen, dass Ziehen nicht bedienbar ist. Auf dem
   aktiven Handy ziehen: Nur dort darf der gezogene Wert erscheinen.
7. Die Karte direkt ablegen. Auf beiden Handys muss sie offen mit der Herkunft
   „direkt gezogen“ erscheinen; der aktive Spieler wechselt.
8. Auf dem nun aktiven Handy ziehen und anschließend eine belegte eigene
   Position antippen. Die Position bleibt bestehen und verdeckt, die alte Karte
   erscheint offen mit der Herkunft „herausgetauscht“.
9. Weitere Züge durchführen, bis beide Spieler mindestens einmal aktiv waren.
   Aktiver Spieler, Kartenzahlen und Zugnummer müssen auf beiden Geräten
   übereinstimmen.

## Gesamter Spieltisch mit 3 und 6 Clients

Für diese Prüfung genügen getrennte Browserprofile beziehungsweise private
Fenster; nur der Zwei-Handy-Fall oben ist ein echter Gerätetest.

1. Einen neuen Raum erstellen und insgesamt drei Clients mit den Namen P0, P1
   und P2 verbinden. Alle bereit markieren und starten.
2. Auf jedem Client von oben nach unten die Sitzfolge notieren. Erwartet wird
   die zyklische Folge nach dem eigenen Sitz, gefolgt vom eigenen Feld ganz
   unten: P0 sieht P1, P2, P0; P1 sieht P2, P0, P1; P2 sieht P0, P1, P2.
   Der aktive Spieler bleibt auf allen Clients identisch; die Darstellung darf
   die Zugreihenfolge nicht verändern.
3. Prüfen, dass jedes Feld vier Positionen und „4 Karten“ zeigt. Nur die zwei
   erlaubten eigenen Startkarten sind offen. Nach dem Schließen aller
   Startansichten sind sämtliche Feldkarten verdeckt.
4. Mit einem neuen Raum und sechs getrennten Clients wiederholen. Auf jedem
   Client müssen fünf kompakte Gegnerfelder, die gemeinsame Tischmitte und das
   eigene Feld unten ohne horizontales Verschieben sichtbar sein. Jede
   Kartenposition muss weiterhin einzeln fokussierbar beziehungsweise
   antippbar sein.
5. Auf einem schmalen Handy oder bei 320 CSS-Pixeln prüfen, dass Namen,
   Kartenzahl und „Am Zug“/„Wartet“ lesbar bleiben. Der leere Ablageplatz darf
   nicht mit einem verdeckten Kartenrücken verwechselt werden.

Automatisiert werden dieselben 2-/3-/6-Spieler-Strukturen zusätzlich als
gerendertes React-Markup geprüft. Der Test deckt außerdem Perspektivrotation,
verdeckte Gegnerwerte, Lücken, zweireihige Erweiterungspositionen, öffentliche
„Gehalten“-Markierungen und die gemeinsame Zielrouting-Schnittstelle für
eigene und gegnerische Positionen ab.

Dies ist eine manuelle Prüfanleitung. Ein echter Gerätetest gilt erst dann als
durchgeführt, wenn diese Schritte tatsächlich auf zwei Handys absolviert und
separat protokolliert wurden.

## Bewusste Einschränkung

M3 ist eine interne reduzierte Runde. Spezialfähigkeiten, Reaktionen, Kabu,
Rundenende und Wertung folgen in M4/M5. Die Oberfläche weist sichtbar darauf
hin. Direkte und durch Tausch entstandene Ablagen bleiben intern verschieden,
damit Fähigkeiten später nur am richtigen Ursprung anschließen.

Lücken, zusätzliche Karten, tatsächlich gehaltene Karten und die Auswahl
gegnerischer Ziele lassen sich im unveränderten M3-Spielablauf noch nicht
manuell erzeugen: Die zugehörigen Strafkarten-, Effekt- und Reaktionsbefehle
gehören zum noch fehlenden M4-Regelkern. Die Tischkomponente kann diese
öffentlichen Zustände bereits darstellen und reicht bei freigeschalteter
Aktion Besitzer, Positionskennung und Belegungsversion weiter; eine echte
Handyabnahme dieser Aktionen wäre vor ihrer serverseitigen Umsetzung jedoch
nicht belastbar.
