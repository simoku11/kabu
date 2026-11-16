# M7-Protokoll und Zustände

## Lobbyzustände

`lobby` erlaubt Beitritt, Bereitschaft, Rundenzahländerung durch den Host,
Start und endgültiges Verlassen. `started` friert die Teilnehmerliste ein;
M2 zeigt dort nur die bestätigte Startmarke. Kartenaufbau beginnt erst in M3.

## Socket-Ablauf

1. Cookie-authentifizierte Verbindung herstellen.
2. `room:subscribe` mit dem öffentlichen Raumcode senden.
3. Server prüft die Mitgliedschaft, ordnet den Socket intern zu und liefert
   einen personalisierten Snapshot.
4. `room:command` enthält UUID, Raumcode und genau einen validierten
   Lobbybefehl.
5. Die Bestätigung enthält UUID, Akzeptanz, Duplikatmarke, Raumsequenz und
   gegebenenfalls einen neutralen Fehler.
6. Nach gespeicherten Änderungen erhält jeder Raumteilnehmer seinen eigenen
   `room:snapshot`.

Gleiche Befehls-ID und gleiche Nutzlast liefern das gespeicherte Ergebnis mit
`duplicate: true`. Gleiche ID mit anderer Nutzlast wird als
`COMMAND_ID_CONFLICT` abgelehnt.

Der Client verwirft kleinere Sequenzen. Bei einer Lücke lädt er einen aktuellen
persönlichen HTTP-Snapshot und sperrt bis zu dessen Übernahme alle Aktionen.
Nach einem verlorenen ACK fragt er `room:commandStatus` mit derselben UUID ab;
`unknown` bedeutet, dass der Server den Befehl nicht gespeichert hat. Es wird
keine neue UUID erzeugt und keine Reaktion automatisch wiederholt.

## Unterbrechungszustand

`interruption.status` ist `active`, `paused`, `decision` oder `aborted`.
Zusätzlich enthält der Snapshot alle fehlenden Spieler, Pausenbeginn und die
serverseitige Wiederbeitrittsfrist. `paused` blockiert Spielaktionen;
`decision` bietet dem Host Warten oder Abbrechen; `aborted` ist endgültig und
hat keine Gewinner. Erst die Rückkehr aller fehlenden Steuerverbindungen setzt
`active`. Ein zweiter Tab besitzt bis zur bestätigten Übernahme nur Leserecht.

## Snapshot

Öffentlich sind Code, Lobby-/Startstatus, Rundenzahl, Sequenz sowie Namen,
Sitze, Bereitschaft, Verbindung und Hostmarke. `you` enthält ausschließlich
die stabile ID, den Sitz und das Hostrecht des authentifizierten Empfängers.
Wiederbeitrittstokens sind in keinem Netzwerkpayload enthalten.

## Reduzierte Runde

Nach `lobby.start` beginnt `initial-view`. Jeder Teilnehmer erhält automatisch
nur die beiden Positionen `near:0` und `near:1` mit Kartenwert. Der Befehl
`game.closeInitialView` ist endgültig; die personalisierte Projektion enthält
die Werte danach auch bei Refresh nicht mehr. Erst wenn alle Ansichten
geschlossen sind, wechselt die Runde zu `playing`.

Ein normaler Zug besitzt eine stabile `turn.id` und die Zustände
`awaiting-draw` und `awaiting-decision`. Zulässige Befehle sind:

- `game.draw` durch den aktiven Spieler;
- `game.discardDrawn` für eine direkte Ablage;
- `game.swapDrawn` mit eigener Positions-ID und passender Belegungsversion.

Nach direkter Ablage oder Tausch wechselt der aktive Spieler zum nächsten Sitz.
Die direkte Ablage ist als künftig fähigkeitsberechtigt markiert, eine
herausgetauschte Feldkarte nicht. M3 führt diese Fähigkeiten noch nicht aus.

## Sichtprojektion

Öffentlich sind Rundenphase, aktiver Spieler, Zugstatus, Kartenzahlen,
Positionsbelegung sowie die oberste Ablage einschließlich Herkunft. Nur der
Empfänger sieht seine offene Startansicht und seine gezogene Karte. Karten-IDs,
Deckreihenfolge und der interne Vollzustand sind in keinem Protokollschema
enthalten.

## Effekte und Reaktionen

- `effects[]`: Effekt-ID, Inhaber, Art, Phase `selecting`/`viewing`/`deciding`
  und konkret gehaltene Positionsbelegungen. Private Ansichten tragen eine
  serverseitige Ablaufzeit von 20 Sekunden; ein Timeout schließt eine
  Ansehfähigkeit beziehungsweise wählt beim schwarzen König „Behalten“.
- `reactionWindow`: eigene ID, Referenzrang und `open`/`consumed`; nur eine
  reguläre Ablage ersetzt es. `consumed` sperrt die Zielauswahl nicht: Jeder
  positionsseitig gültige weitere Versuch gegen genau diese ID wird als
  öffentlicher Fehlversuch mit Strafkarte verarbeitet; ersetzte IDs bleiben
  neutral.
- `drawnCard` sperrt Reaktionsbefehle ausschließlich für ihren Besitzer, bis
  er sie ablegt oder tauscht. Für alle anderen Spieler bleibt ein vorhandenes
  Reaktionsfenster unverändert offen.
- `pendingTransfers[]`: Pflichtausgleich mit Reagierendem, Empfänger und
  reservierter leerer Position.
- `publicReveals[]`: kurzlebige, positions- und belegungsgebundene
  Fehlaufdeckung. Genau diese Belegung ist während ihrer Sichtbarkeit als
  erneutes Reaktionsziel neutral gesperrt.
- `provisional-end` sperrt neue Reaktionen, lässt vorhandene Pflichten aber
  weiterlaufen. Sein Fortsetzungspunkt liegt bereits im normalen Zug und in
  `pendingFinalTurns`: D6 legt eine vorhandene Ziehkarte neutral ab und
  verbraucht genau diesen unterbrochenen Zug. Bei Rettung wird deshalb kein
  alter Zug erneut geöffnet.
- `final-reaction` trägt die unveränderliche serverseitige Deadline des
  letzten Kabu-Fensters. Ein Timeout markiert das Fenster geschlossen; offene
  Pflichtaktionen dürfen danach nur noch fertiggestellt werden.
- `round-result` enthält aufgedeckte Karten, die getrennten Spielerwertungen,
  Gesamtpunkte und die Menge der für die nächste Runde bereiten Spieler.
- `game-over` enthält zusätzlich alle Gewinner und nimmt keine Spielbefehle
  mehr an.

`kabuCallerId` und die geordnete Liste `pendingFinalTurns` bilden die
Schlussphase unabhängig von Effekten und Reaktionen ab. `completedRounds` ist
das Wertungsjournal; dessen Existenz verhindert eine zweite Addition.

`lastAction` ist eine optionale, wertfreie Darstellungsreferenz auf die zuletzt
bestätigte Kartenaktion. Sie darf Spieler- und öffentliche Positionskennungen,
aber weder Karten-ID noch verdeckten Wert enthalten. Sie ändert keine
Zulässigkeit, Bindung oder Frist und kann bei alten gespeicherten Snapshots
fehlen.
