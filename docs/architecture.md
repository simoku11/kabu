# Architekturgrundlage

Stand: M8

## Grenzen

- Der Server ist für alle späteren Spielzustände und Aktionen autoritativ.
- `game-core` bleibt frei von React, Netzwerk und Datenbankzugriff.
- `protocol` enthält gemeinsam genutzte Typen und Zod-Schemas für alle externen Nachrichten.
- Der Browser erhält ausschließlich eine für den jeweiligen Spieler
  freigegebene Projektion; interne Karten-IDs und Deckreihenfolgen verlassen
  den Server nicht.
- PostgreSQL ist die dauerhafte Quelle für Sitzungen, Räume, Zustandsversionen und Befehlsresultate.

## M2-Datenfluss

1. `POST /api/session` erzeugt oder erneuert eine serverseitige
   Gastidentität. Der Browser erhält den Wiederbeitrittsnachweis ausschließlich
   als `HttpOnly`-, `SameSite=Strict`-Cookie.
2. Raum erstellen und beitreten laufen über validierte HTTP-Anfragen. Der
   Einladungslink enthält nur den zufälligen Raumcode.
3. Die Socket.IO-Verbindung authentifiziert dasselbe Cookie und abonniert erst
   nach einer Mitgliedschaftsprüfung den internen Raumkanal.
4. Lobbybefehle laufen seriell in einer Datenbanktransaktion. Raum,
   Mitgliedschaften und Befehlsresultat werden vor der Bestätigung gespeichert.
5. Nach einer Änderung projiziert der Server für jede verbundene Identität einen
   eigenen Snapshot. Der Browser übernimmt nur Snapshots mit nicht kleinerer
   Raumsequenz.

## Persistenz und Identität

- `guest_sessions`: stabile Spieler-ID, SHA-256-Hash des zufälligen Tokens,
  Ablauf und letzte Nutzung. Das Roh-Token wird nie gespeichert oder geloggt.
- `rooms`: privater Code, Status, Host-Spieler-ID, Rundenzahl und monotone
  Sequenz.
- `room_memberships`: fester Sitz, Anzeigename, Bereitschaft und aktueller
  Verbindungsstatus.
- `room_commands`: Befehls-ID je Raum/Spieler, Payload-Hash und gespeicherte
  Bestätigung.

Die Hostrolle hängt an der Spieler-ID. Socket-Trennung und Refresh ändern sie
nicht. Nur `lobby.leave` entfernt den Platz endgültig; dann übernimmt der
am längsten anwesende verbundene Spieler, mit dem ältesten verbleibenden Platz
als deterministischem Fallback.

## Gleichzeitigkeit

PostgreSQL sperrt beim Beitritt und bei Lobbybefehlen die betreffende Raumzeile
mit `FOR UPDATE`. Damit können weder zwei Teilnehmer denselben sechsten Platz
noch zwei Befehle gleichzeitig widersprüchlich verändern. Der In-Memory-Store
für isolierte Tests verwendet dieselbe Semantik mit einer seriellen Queue.

## M3-Rundenfluss

`game-core` enthält den vollständigen Kartenbestand, stabile Positionen,
Startbarriere, normalen Zug und Recycling ohne Abhängigkeit von Browser,
Socket oder PostgreSQL. Mischen und Startspielerwahl erhalten eine injizierte
Zufallsquelle. Der Server verwendet dafür `node:crypto.randomInt`; Tests dürfen
eine feste Quelle und eine vollständige Deckreihenfolge einsetzen.

Der interne `game_state` liegt als versionierter JSONB-Snapshot am Raum. Ein
Spielbefehl wird unter derselben Raumzeilensperre wie M2 geprüft; neuer
Rundensnapshot, Raumsequenz und Befehls-ACK werden in derselben Transaktion
gespeichert. Der Memory-Store serialisiert dieselbe Verarbeitung für Tests.

Die Projektion entsteht erst beim Abruf beziehungsweise Versand pro Sitzung.
Sie enthält Kartenzahlen, Positionen, Belegungsversionen und die öffentliche
oberste Ablage. Werte erscheinen nur in einer noch offenen eigenen
Startansicht, bei der eigenen aktuell gezogenen Karte oder öffentlich auf der
Ablage.

## Gemeinsame Tischprojektion

Der Browser rendert alle bereits öffentlich projizierten Spielerfelder in
zyklischer Sitzfolge relativ zum Empfänger. Der Empfänger wird ausschließlich
für die Darstellung ans Ende beziehungsweise an den unteren Tischrand gesetzt;
`activePlayerId`, Sitze und serverseitige Zugfolge bleiben unverändert. Jede
Kartenposition wird über ihre Positionskennung und Belegungsversion an die
einheitliche Zielauswahl weitergereicht. Dadurch können spätere M4-Aktionen
auch gegnerische Ziele verwenden, ohne interne Karten-IDs oder verdeckte Werte
zu benötigen. Eine optionale öffentliche `held`-Marke enthält ebenfalls keinen
Kartenwert.

## M4-Verarbeitung

Effekte, Reaktionen, normale Züge und Transfers sind Teile desselben
persistierten Rundensnapshots und laufen durch dieselbe Raumzeilensperre bzw.
Memory-Queue. Reaktionsfenster, Effekte und Transfers besitzen eigene IDs;
Positionsbefehle tragen zusätzlich die Belegungsversion. Deshalb entscheidet
die serverseitige Eingangsreihenfolge, ohne Client-Uhrzeiten oder eine globale
Snapshot-Version als fachliches Ausschlusskriterium zu verwenden.

Beim Reaktionsrennen verbraucht der erste korrekte Abwurf das Fenster. Der
Zustand `consumed` bleibt bis zur nächsten regulären Ablage anwählbar; weitere
Versuche werden weiterhin serialisiert, ihre Karte bleibt aber liegen und
erzeugt eine öffentliche Aufdeckung sowie eine Strafkarte. Eine andere
Fenster-ID oder veränderte Belegung wird neutral abgelehnt.

Private Effektwerte entstehen erst in `projectRound` für den Effektinhaber und
werden nach der serverseitigen Ablaufzeit von 10 Sekunden nicht mehr
projiziert. Ein serialisierter interner Timeout schließt den Effekt; beim
schwarzen König ist die sichere Standardentscheidung „Behalten“.
Öffentliche Fehlaufdeckungen enthalten intern Karte, Position, Belegungsversion
und Ablaufzeit; nur solange alle vier noch passen, projiziert der Server den
Wert. Ein verzögerter Snapshot entfernt die Aufdeckung auch ohne Folgeaktion.
Solange dieselbe Positionsbelegung öffentlich sichtbar ist, lehnt der
Regelkern einen erneuten Reaktionsversuch auf sie neutral und ohne Strafkarte
ab.

## M5-Verarbeitung

Schlusszugliste, vorläufiges Ende und letztes Reaktionsfenster bleiben im
gleichen `game_state` und durchlaufen dieselbe Raumzeilensperre wie alle
anderen Befehle. Der Server plant die gespeicherte Deadline als internen
Befehl über die normale `executeCommand`-Queue ein. Kernprüfungen verwenden
eine injizierbare Zeit; die Produktionsannahme verwendet ausschließlich
`Date.now()` beim Servereingang. Bei Gleichheit mit der Deadline wird
abgelehnt.

Das Wertungsjournal und die Gesamtpunkte werden atomar mit dem endgültigen
Rundenzustand gespeichert. Der Phasenwechsel nach `round-result` oder
`game-over` macht wiederholte Abschlussbefehle wirkungslos. Eine Folgerunde
wird erst nach Bereitschaft aller Teilnehmer erzeugt und übernimmt nur
Identitäten, Sitze, Einstellung, Journal und Gesamtpunkte; sämtliche
rundenbezogenen Bindungen und Fristen entstehen neu.

## M6-Browserinteraktion

M6 führt zusätzlich den serverautoritativen Eliminierungszustand ein, aber
keine optimistischen Kartenbewegungen. Beim Erhalt der neunten Karte verschiebt
der Regelkern die gesamte Hand in einen separaten Bereich außerhalb des aktiven
Spiels, friert die kumulierte Punktzahl ein und entfernt den Spieler aus allen
Aktionsfolgen. Der Browser leitet jede aktive Position über genau einen Zustandszweck:
Pflichtausgleich, Fähigkeitsziel, Tausch oder direkte Reaktion. Während ein
Befehl auf sein ACK wartet, verhindert eine lokale Schranke Mehrfachsendungen;
nach ACK wird sie sofort freigegeben. Der personalisierte Snapshot bleibt die
Quelle für Kartenbewegungen.

Spielerfelder behalten Positions-ID, Belegungsversion, Reihe und Spalte. Ein
ausgeschiedener Sitz bleibt als nicht interaktiver Platz erhalten. Das Layout
bleibt immer zweireihig und ordnet bis zur vierten Spalte Erweiterungen
abwechselnd rechts und links um das anfängliche 2x2-Raster an. Lücken bleiben
sichtbar; die gemeinsame Kartenbreite skaliert so, dass paarweise angeordnete
Gegner ihre Sitzposition auch mit acht Karten behalten. Accessibility-
Bezeichnungen verdeckter Karten entstehen nur aus Besitzer, Reihe, Spalte und
öffentlichen Markierungen; Werte kommen ausschließlich aus berechtigten
`card`-Projektionen.

Eine gezogene Karte wird nur als zusätzliche lokale Darstellung neben dem
eigenen Feld projiziert. Ablageklick und Feldklick senden weiterhin die
bestehenden Befehle. Private Effektwerte werden ausschließlich an ihrer
zugehörigen Positions-ID gerendert und verschwinden mit dem Serversnapshot;
der kreisförmige Countdown ist rein darstellend.

## M7-Wiederaufnahme und Persistenz

Der Socket ist nur Transport, nie Identität. Das gehashte Sitzungstoken ordnet
jede neue Verbindung wieder derselben Spieler-ID und Mitgliedschaft zu. Der
Server führt pro Spieler/Raum eine aktive Steuerverbindung; weitere Sockets
erhalten personalisierte Snapshots, benötigen aber eine ausdrückliche
Übernahme. Befehle eines abgelösten Sockets werden vor dem Domänenaufruf mit
`CONTROL_TAKEN_OVER` verworfen.
Harte Funkabbrüche besitzen kein sofortiges TCP-Signal. Der produktive
Heartbeat verwendet deshalb standardmäßig 1.000 ms Intervall und 2.000 ms
Timeout; andere Teilnehmer sehen die Pause somit spätestens nach ungefähr drei
Sekunden. Die Werte sind begrenzt konfigurierbar.

`interruption_state` liegt zusammen mit dem vollständigen `game_state` in der
Raumzeile. Trennung und Rückkehr erhöhen die Raumsequenz. Eine gestartete
Partie wechselt beim ersten fehlenden Spieler zu `paused`, nach 90 Sekunden zu
`decision` und nur durch Hostentscheidung zu einer neuen Wartefrist oder
`aborted`. Mehrere fehlende IDs bleiben explizit erhalten. Lobbyräume werden
nicht pausiert und ihr bisheriger Hostwechsel bleibt unverändert.

Alle normalen Spielbefehle sind außerhalb `active` gesperrt. Ablaufbefehle,
Spielerbefehle und Zustandsänderungen laufen weiterhin durch dieselbe
serialisierte Raumtransaktion. Beim Fortsetzen verschiebt der Server die
gespeicherten Effekt- und Kabu-Fristen um die Pausendauer; öffentliche
Fehlaufdeckungen nicht. Nach Neustart markiert der Store gestartete Räume als
pausiert, setzt flüchtige Verbindungsmarken zurück und rekonstruiert gespeicherte
Timeouts. Snapshots mit fremder Regelversion oder unbekannter Datenversion
werden abgewiesen.
Ein sekündlicher, unter derselben exklusiven Prozesssperre gespeicherter
Heartbeat begrenzt den letzten möglichen Crashzeitpunkt; Recovery berechnet die
Pause und Wiederbeitrittsfrist von diesem Zeitpunkt statt vom Neustart und
schenkt dadurch keine Server-Ausfallzeit.

PostgreSQL speichert Zustandsänderung, nicht geheimes Ereignismetadatum,
Raumsequenz und Befehls-ACK atomar. Ein wiederholter Befehl erhält sein
gespeichertes Ergebnis. `room:commandStatus` klärt ein verlorenes ACK ohne den
Befehl – insbesondere eine Reaktion – erneut auszuführen. Eine über die
Lebenszeit des Prozesses gehaltene PostgreSQL-Advisory-Lock erlaubt nur einer
Serverinstanz das Schreiben. Ungenutzte Lobbyräume werden nach sieben Tagen
bereinigt; abgelaufene Sitzungen nur, wenn sie keine gestartete Partie tragen.

## M8-Betriebsschutz und Beobachtbarkeit

Vor der bestehenden serverautoritativen Befehlsverarbeitung liegen eine
explizite Browser-Originprüfung, kleine Transportlimits und getrennte technische
Drosselungen für Raumbeitritt und Spielbefehle. Drosselungen rufen den
Regelkern nicht auf. Pro Raum serialisiert eine benannte In-Process-Queue die
Befehle; PostgreSQL-Transaktionen und Zeilensperren bleiben die zweite
Konsistenzgrenze. Aggregierte Metriken trennen Queue-, Gesamt-, Persistenz- und
Wiederaufnahmezeit sowie fachliche Ablehnung, Drosselung und technischen Fehler.
Sie enthalten keine Raum-/Spielerreferenzen oder Karteninformationen.
