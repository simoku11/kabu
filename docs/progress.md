# Fortschritt

## M2 – lokal abgeschlossen

- [x] geschützte Gastidentität und Refresh-Wiederaufnahme
- [x] persistente Lobbytabellen und Migration
- [x] Raum erstellen, Link/Code und Beitritt
- [x] 2–6 Plätze, Bereitschaft, Rundenzahl, Hostrecht und Startprüfung
- [x] Socket.IO-Zuordnung, UUID-Befehle, ACK und monotone Sequenz
- [x] transaktionale Idempotenz und Payload-Konflikt
- [x] personalisierte Snapshots und Reconnect
- [x] endgültiges Verlassen und Hostwechsel
- [x] responsive, funktionale Handy-Lobby
- [x] Unit- und Integrationstests der M2-Abnahmefälle

Kein Deployment und keine kostenpflichtige Infrastruktur wurden eingerichtet.

## M3 – lokal abgeschlossen

- [x] 52 eindeutige Karten und korrekte Werte einschließlich Königsfarben
- [x] sicher eingespeistes Produktionsmischen und deterministische Testdecks
- [x] Aufbau für 2–6 Spieler, feste 2×2-Positionen und leere Ablage
- [x] geschützte spielernahe Startansicht mit endgültigem Schließen
- [x] Startbarriere und zufälliger erster Startspieler; Rotationsanschluss
- [x] serverautoritatives Ziehen, direktes Ablegen und Tauschen
- [x] stabile Positionen, Belegungsversionen und Erweiterungsreihenfolge
- [x] Recycling der Ablage unter Erhalt ihrer obersten Karte
- [x] transaktionaler Rundensnapshot in bestehender Raumqueue und Idempotenz
- [x] explizite öffentliche/private Projektionen ohne geheime Karten-IDs
- [x] minimale mobile Testoberfläche und Zwei-Client-Integrationstest

Bewusste Grenze: Fähigkeiten, Reaktionen, Kabu, Rundenende und Wertung sind
noch nicht implementiert. Direkte und getauschte Ablagen sind für M4 bereits
unterscheidbar. Kein Deployment und kein echter Gerätetest wurden durchgeführt.

## Spieltisch-Erweiterung auf M3-Basis

- [x] alle Felder für 2–6 Spieler in einer gemeinsamen Tischansicht
- [x] eigener Spieler unten und zyklische Sitzfolge relativ zum Betrachter
- [x] Namen, Kartenzahl, Zugstatus, Positionen, Lücken und Erweiterungsspalten
- [x] gemeinsame Mitte mit Nachziehstapel, Ablage-Leerplatz und Reaktionsstatus
- [x] kompakte Sechs-Spieler-Darstellung mit mindestens 44 px hohen Zielen
- [x] einheitliches Zielrouting für eigene und gegnerische Positionen über
      Positionskennung und Belegungsversion
- [x] UI-Tests für 2, 3 und 6 Spieler sowie Geheimhaltung und gehaltene Karten

## M4 – lokal abgeschlossen

- [x] alle direkten Spezialfähigkeiten einschließlich Aussetzen und optionalem Überspringen
- [x] explizite mehrstufige Effekte, private Ansichten und exklusive Bindungen nach D4/A
- [x] unabhängige Reaktionsfenster mit Rangvergleich und Serverreihenfolge
- [x] eigene/fremde Reaktion, Fehlaufdeckung, Strafkarte und Pflichtausgleich
- [x] D5-Reservierung, stabile Positionen und neutrale Ablehnung veralteter Ziele
- [x] D9-Neustart ohne Wertung bei vollständiger Stapelerschöpfung
- [x] minimaler 0-Karten-Anschlusszustand für M5
- [x] personalisierte Netzwerkprojektion ohne private Kartenhistorie
- [x] mobile Bedienung und produktionsgesperrte deterministische Abnahmeszenarien
- [x] gezielte Kern-, Protokoll-, Server- und UI-Regressionstests

Bewusste Grenze: Kabu, regulärer Rundenabschluss, Wertung, Folgerunden und
Partiesieg bleiben M5. `awaiting-m5` zeigt deshalb nur ein erkanntes Ende an.

## M5 – lokal abgeschlossen

- [x] endgültiges Null-Karten-Ende mit Pflichtabwicklung, Rettung und D6
- [x] Kabu am Zugbeginn und explizite geordnete Schlusszüge
- [x] Aussetzen als Verbrauch eines Schlusszugs
- [x] serverseitiges letztes Reaktionsfenster von exakt 3.000 ms
- [x] getrennte Kartenpunkte, Kabu-Strafe und Rundensumme
- [x] einmalige Addition zum Gesamtstand und öffentliche Ergebnisansicht
- [x] bewusste Allseitig-bereit-Fortsetzung und Startspielerrotation
- [x] Partieabschluss einschließlich geteilter Gesamtsiege
- [x] produktionsgesperrte deterministische M5-Abnahmeszenarien
- [x] Kern-, Protokoll-, Server- und UI-Regressionstests

Bewusste Grenze: Echte Handytests und Deployment wurden nicht durchgeführt.
Die manuelle Geräteabnahme ist in `docs/m5-abnahme.md` vorbereitet.

## M6 – lokal implementiert, Geräteabnahme offen

- [x] gemeinsame mobile Tischansicht für 2–6 Spieler mit zyklischen Sitzen
- [x] vollständig sichtbare Zwei-Reihen-Kartenfelder mit stabilen Lücken und
      abwechselnder Erweiterung nach rechts und links
- [x] direkte Reaktion per Kartentipp mit regelbedingtem Auswahlvorrang
- [x] feste Sitze und verkleinerte Vier-Spalten-Felder bis acht Karten
- [x] dauerhafte Eliminierung bei der neunten Karte mit eingefrorener Wertung,
      übersprungenen Folgerunden und Spielende beim letzten aktiven Spieler
- [x] regelkonforme Reaktion aus einer privaten Einsicht
- [x] getrennte Rückmeldung für gesendet, bestätigt und neutrale Ablehnungen
- [x] Doppeltippschutz nur während des ausstehenden Befehls
- [x] Fenster-, Schlussphasen-, Pflicht- und Ergebnisanzeigen
- [x] Touchgrößen, Safe Areas, Tastaturfokus, Screenreader und reduzierte Bewegung
- [x] Szenario `m6-grown-field` und nummerierte Abnahme

Bewusste Grenze: iOS Safari und Android Chrome wurden nicht auf echten Geräten
geprüft. Bedienvariante und D11-Dauer sind in `docs/m6-abnahme.md` zur
Produktentscheidung vorbereitet; M6 ist noch nicht manuell abgenommen.

## M7 – lokal implementiert, Geräte- und reale PostgreSQL-Neustartabnahme offen

- [x] stabile Cookie-Identität und frischer persönlicher Snapshot nach Refresh
- [x] Sequenzlückenerkennung, veraltete Snapshots und gesperrter Zustandsabgleich
- [x] gespeicherte Befehlsresultate und reine Statusklärung verlorener ACKs
- [x] persistente D10-Pause, mehrere Fehlende, 90 Sekunden, Warten und Abbruch
- [x] getrennte Pausen-, Wiederbeitritts- und Spielfristen
- [x] Erhaltung von Ziehkarte, Effekten, Bindungen, Transfers und Wertung im Snapshot
- [x] Neustart-Recovery aus Store und Rekonstruktion gespeicherter Timer
- [x] atomare Zustands-/Ereignis-/ACK-Speicherung und exklusiver Prozessbesitz
- [x] genau ein steuernder Tab mit ausdrücklicher Übernahme
- [x] mobile Unterbrechungs-, Synchronisations- und Abbruchhinweise
- [x] Bereinigung alter Lobbyräume und abgelaufener ungebundener Sitzungen
- [x] automatisierte M2–M7-Regression und kontrollierbare Domänenzeit

Offen bleiben echte iOS-/Android-Netzwechsel sowie die manuelle Bestätigung der
in `decisions.md` markierten M7-Produktvorschläge. Die konkrete Abnahme steht in
`docs/m7-abnahme.md`.

## M8 – lokal implementiert, PostgreSQL-Last- und Geräteabnahme offen

- [x] Originprüfung, strikte Sitzungscookies und 16-KiB-Nachrichtenlimits
- [x] getrennte großzügige Befehls- und strikte Raumcode-Beitrittsdrosselung
- [x] neutrale technische Drosselung ohne Regel- oder Strafkartenwirkung
- [x] Raumqueue sowie aggregierte Bearbeitungs-, Store- und Resume-Metriken
- [x] reproduzierbare, seed-basierte Folgen für 2–6 Spieler mit Aktionsspur
- [x] Kartenort-, Idempotenz-, Geheimnis-, Raum- und Störungstests
- [x] wiederholbarer aktiver Lastlauf mit 20 Räumen und sechs Clients
- [x] neutrale Fehlerberichtsvorlage und nummerierte Beta-Abnahme

Noch offen sind der Lastlauf gegen eine eigens bereitgestellte PostgreSQL-
Testdatenbank und echte iOS-/Android-/Sechsertischprüfungen. Produktionsbetrieb
und Veröffentlichung bleiben M9.
