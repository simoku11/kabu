# M7 – manuelle Abnahme von Unterbrechung und Wiederaufnahme

Echte Handys, Funkwechsel und ein real gestoppter Prozess wurden durch die
automatisierte Suite nicht ersetzt. Dieses Dokument trennt die kurze
Pflichtabnahme von technischen Grenzfällen.

## 1. Start und erster Fall

1. In `Kabu-M1`: `docker compose up -d postgres`, `pnpm db:migrate`, dann
   `pnpm dev`. Datenbank und Volume dabei nicht löschen.
2. Rechner und beide Handys ins gleiche WLAN bringen. Auf beiden die von Vite
   hinter `Network` genannte Adresse öffnen. A erstellt einen Raum, B tritt per
   Link/Code bei; das Cookie-Geheimnis steht nie im Link.
3. Beide werden bereit, A startet, beide schließen ihre Startansicht. A zieht
   eine Karte und lädt unmittelbar die Seite neu.
4. Erwartet auf A: gleiche Spieler-ID/Sitzposition, exakt dieselbe gezogene
   Karte und kein neuer Spielerplatz. Erwartet auf B: kurze Pause, dann
   Fortsetzung. Fehler: zweite Ziehung, neue Hand, neuer Sitz oder sichtbare
   fremde Karte.

## 2. Pflichtabnahme mit zwei Handys

1. **Flugmodus vor 90 Sekunden.** B schaltet Flugmodus ein. Auf A steht
   spätestens nach ungefähr drei Sekunden „Partie pausiert“ und B als fehlend;
   ein harter Funkabbruch kann technisch nicht im selben Moment erkannt werden.
   A kann weder ziehen noch reagieren. B
   kehrt vor 90 Sekunden zurück. Beide sehen denselben Tisch und dürfen erst
   nach Synchronisation weiterspielen. Fehler: Aktion während Pause oder
   doppelte Karte.
2. **Sperren/Appwechsel/Netzwechsel.** B sperrt/entsperrt das Handy, wechselt
   App und danach WLAN zu Mobilfunk. Jeweils dürfen höchstens Pause und
   Wiederaufnahme entstehen, nie ein neuer Platz oder eine automatische Aktion.
3. **Private Einsicht.** Mit `ability-own-look` oder
   `ability-opponent-look` eine Einsicht öffnen und vor Ablauf neu laden. Nur
   der Berechtigte sieht dieselbe noch offene Karte mit Restzeit. Danach
   Einsicht bewusst schließen und erneut laden: kein Wert erscheint wieder.
4. **Schwarzer König.** `ability-black-king` laden, beide Ziele wählen und
   während „Tauschen/Behalten“ unterbrechen. Ziele und Bindungen bleiben; nach
   Rückkehr genau einmal entscheiden. Fehler: gelöste Bindung oder zweiter Blick.
5. **Offener Ausgleich.** `reaction-foreign` laden, fremde Karte korrekt
   reagieren und vor Wahl der eigenen Ausgleichskarte trennen. Der Transfer
   bleibt offen und wird nach Rückkehr atomar einmal abgeschlossen.
6. **Kabu-Frist.** `m5-kabu-tie` bis zum letzten Reaktionsfenster spielen,
   während des Countdowns trennen und zurückkehren. Effekt-/Kabu-Spielzeit
   läuft mit gespeicherter Restzeit weiter; die 90-Sekunden-Rückkehrfrist lief
   währenddessen weiter. Eine bereits abgelaufene Frist startet nicht neu.
7. **Zweiter Tab.** Auf A denselben Raum in einem zweiten Tab öffnen. Der neue
   Tab zeigt nur an und bietet „Steuerung übernehmen“. Nach Bestätigung ist nur
   er bedienbar; der alte meldet die Übernahme und kann auch mit verzögertem
   Klick nichts ändern. Sein Reconnect holt die Steuerung nicht zurück.
8. **Frist überschreiten.** B länger als 90 Sekunden trennen. Nur A als Host
   sieht „weitere 90 Sekunden warten“ und „Partie abbrechen“. Erst Warten
   prüfen, dann im Wiederholungsfall Abbrechen. Abbruch zeigt keinen Sieger und
   addiert keine Runde. Das ist zugleich die Produktabnahme der Hostregel.

## 3. Serverneustart mit erhaltener Datenbank

Für diesen Test Web und Server getrennt starten: Terminal 1
`pnpm --filter @kabu/server dev`, Terminal 2 `pnpm --filter @kabu/web dev`.
Eine Partie mit gezogener Karte oder offenem Effekt herstellen. Nur Terminal 1
mit `Ctrl+C` stoppen; `docker compose down -v` ausdrücklich nicht ausführen.
Danach in Terminal 1 denselben Serverbefehl erneut starten.

Erwartet: Clients verbinden sich wieder, identifizieren sich per Cookie und
erhalten die pausierte gespeicherte Partie. Kartenpositionen, gezogene Karte,
Effektziele, Transferpflicht, Punktestand und Rundennummer sind unverändert.
Nach Rückkehr aller Spieler wird fortgesetzt. Eine zweite gleichzeitig
gestartete Serverinstanz muss wegen der Schreibsperre verständlich beenden.

Die Zeitpunkte „Datenbank-Commit erfolgt, ACK noch nicht gesendet“ und
„Speicherfehler während Transaktion“ sind manuell nicht zuverlässig treffbar;
sie gehören zur automatisierten Befehls-/Store-Prüfung. Ein Browser-Reload ist
kein Nachweis für Prozess-Recovery.

## 4. Technische Grenzfälle

1. DevTools offline direkt vor Senden: keine Aktion wird gepuffert. Nach
   Rückkehr erscheint entweder das gespeicherte Ergebnis oder „nicht vom Server
   empfangen“, niemals eine verspätete Reaktion.
2. Mehrere Spieler gleichzeitig offline: Rückkehr nur eines Spielers lässt die
   Pause bestehen und listet die übrigen Namen.
3. Öffentliche Fehlaufdeckung während Trennung ablaufen lassen: sie darf nach
   Rückkehr nicht erneut sichtbar werden.
4. Seite mit ungültigem/gelöschtem Cookie öffnen: keine Mitgliedschaft oder
   Karten werden offengelegt; der Einladungsweg bietet nur einen normalen
   Beitrittsversuch, keine Übernahme.
5. Einen unbenutzten Lobbyraum älter als sieben Tage und eine abgelaufene freie
   Sitzung in einer Testdatenbank anlegen, Server starten: beide werden
   bereinigt. Eine gestartete oder wiederaufnehmbare Partie bleibt erhalten.

## 5. Abnahmeprotokoll

| Prüfung                         | Gerät/Browser/Version | Ergebnis           |
| ------------------------------- | --------------------- | ------------------ |
| Refresh nach Ziehen             | –                     | nicht durchgeführt |
| Flugmodus und Rückkehr          | –                     | nicht durchgeführt |
| Sperren/Appwechsel              | –                     | nicht durchgeführt |
| WLAN/Mobilfunk                  | –                     | nicht durchgeführt |
| private Einsicht/König/Transfer | –                     | nicht durchgeführt |
| Kabu-Frist                      | –                     | nicht durchgeführt |
| zwei Tabs                       | –                     | nicht durchgeführt |
| 90 Sekunden + Abbruch           | –                     | nicht durchgeführt |
| echter Serverneustart           | –                     | nicht durchgeführt |
