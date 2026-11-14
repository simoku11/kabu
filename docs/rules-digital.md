# Digitale Regeln bis M7

M2 setzt ausschließlich die in M0 beschlossene Entscheidung D1 um:

- private Gast-Räume mit 2–6 festen Teilnehmern,
- Rundenzahl vor Start durch den Host, Standard 10,
- alle Teilnehmer müssen bereit sein,
- nur der Host startet,
- kein Beitritt nach dem Start,
- keine Konten, Zuschauer oder Bots.

Die Rundenzahl wird als technische Eingabe auf ganze Werte von 1 bis 99
begrenzt. Das verändert keine Karten-, Runden- oder Wertungsregel.

M3 setzt zusätzlich D2 und D8 unverändert um. Die spielernahe Reihe ist stabil
als `near` definiert und unabhängig von Bildschirmdrehung oder Spiegelung. Neue
Karten füllen vorhandene Lücken in der Reihenfolge nahe links nach rechts,
danach fern links nach rechts. Ohne Lücke wächst das Feld spaltenweise um nahe
und ferne Positionen.

Eine normale Ablage hält ihre Herkunft fest: `drawn` ist eine direkt gezogene,
für M4 grundsätzlich fähigkeitsberechtigte Karte; `swapped` ist die offen
herausgetauschte Feldkarte und löst keine Fähigkeit aus. In der reduzierten
M3-Testrunde werden weder Fähigkeiten noch Reaktionen ausgeführt.

M4 setzt Spezialfähigkeiten und Reaktionen gemäß D4/A, D5, D8, D9 und D11 um.
Vor der ersten Auswahl seiner Fähigkeit darf der Effektinhaber mit einer
eigenen oder gegnerischen Karte reagieren. Die Fähigkeit bleibt danach offen.
Hat er die Ansicht oder Entscheidung bereits begonnen, muss er sie vor einer
eigenen Reaktion abschließen. Andere Spieler dürfen weiterhin reagieren; ein
folgender normaler Zug darf jedoch erst beginnen, wenn die Spezialfähigkeit
ausgeführt, optional übersprungen oder durch Ablauf beendet wurde. Das gilt
serverseitig sowohl für Ziehen als auch für Kabu. Reaktionen vergleichen nur
den Rang.
Fehlversuche werden 2.500 ms öffentlich gezeigt (lokal konfigurierbar), bleiben
positionsgebunden und erzeugen genau eine blinde Strafkarte. Währenddessen
kann dieselbe sichtbare Belegung nicht erneut als Reaktion versucht werden;
ein Klick erzeugt keine weitere Strafe. Jede direkt ausgelöste Fähigkeit
besitzt ab ihrer Aktivierung einen sichtbaren, serverautoritativen Countdown
von insgesamt 10 Sekunden. Danach wird sie automatisch geschlossen; beim
schwarzen König gilt ohne Entscheidung „Behalten“.

Bei konkurrierenden korrekten Reaktionen wird nur die zuerst vom Server
verarbeitete Karte abgelegt. Das verbrauchte Fenster bleibt bis zur nächsten
regulären Ablage auswählbar. Jeder weitere Versuch mit dieser Fenster-ID ist
„zu spät“: Seine Karte bleibt liegen, wird kurz öffentlich gezeigt und der
Reagierende erhält genau eine verdeckte Strafkarte, selbst bei passendem Rang.
Eine fremde oder bereits ersetzte Fenster-ID sowie eine inzwischen veränderte
Position werden weiterhin neutral abgelehnt.

Ein Spieler, der in seinem regulären Zug bereits eine Karte gezogen und noch
nicht abgelegt oder getauscht hat, hält diese Ziehentscheidung exklusiv offen
und darf in diesem Zeitraum keine Feldkarte als Reaktion auswählen. Das
Reaktionsfenster selbst bleibt bestehen: Andere Spieler dürfen weiterhin
reagieren. Sobald die gezogene Karte regulär abgelegt oder getauscht wurde,
gilt wieder die normale Fensterregel.

Kabu, reguläre Wertung und vollständige Partien bleiben M5. M4 erkennt null
Karten vorläufig, sperrt neue Reaktionen, wickelt vorhandene Pflichten ab und
wechselt danach lediglich in den dokumentierten Anschlusszustand.

M5 ersetzt diesen Anschlusszustand durch den endgültigen Ablauf. Ein
fachlicher Null-Karten-Zustand wird erst nach vollständigem Fremdtransfer
bewertet. Bereits ausgelöste Pflichten bleiben bedienbar; eine offene
Ziehkarte wird nach D6 genau einmal neutral offen abgelegt und der
unterbrochene Zug gilt als beendet. Wird der Null-Karten-Zustand gerettet,
wird am dadurch bereits bestimmten nächsten regulären Zug beziehungsweise an
der verbleibenden Schlusszugliste fortgesetzt.

Kabu ist ausschließlich in `awaiting-draw` des eigenen regulären Zuges und nur
einmal möglich. Die geordnete Liste `pendingFinalTurns` enthält jeden anderen
Spieler genau einmal. Eine direkt abgelegte 2 entfernt zusätzlich den nächsten
Eintrag. Sobald die letzte reguläre Ablage diese Liste leert, speichert der
Server `acceptedAt + 3000` als Deadline. Reaktionen gelten nur für
`receivedAt < deadline`; Fehlversuche ändern sie nicht. Nach Ablauf werden
bereits akzeptierte Effekte und Transfers beendet, bevor gewertet wird.

Die Wertung speichert je Spieler Kartenpunkte, Kabu-Strafe und Rundensumme
getrennt. Der Ansager bleibt nur ohne Strafe, wenn er allein den kleinsten
Kartenwert besitzt. Alle Karten werden am Ergebnis öffentlich. Nach
allseitiger Bereitschaft folgt ein neues vollständiges Deck mit vier Karten,
Startansicht und rotiertem Startspieler. Nach der festgelegten Rundenzahl
endet die Partie; alle noch aktiven Spieler mit dem niedrigsten Gesamtwert
gewinnen.

Erhält ein Spieler eine neunte Feldkarte, scheidet er dauerhaft aus der Partie
aus. Seine bisherigen Gesamtpunkte werden einmalig um den Wert seiner neun
Karten ergänzt und als Endpunktzahl eingefroren. Seine Karten verlassen das
aktive Spiel; der feste Sitzplatz bleibt als ausgeschiedener Platz sichtbar.
Der Spieler wird sofort aus Zugfolge, Reaktionen, Fähigkeiten, Zielen,
Kabu-Schlusszügen und Bereitschaft für Folgerunden entfernt. Folgerunden teilen
nur an aktive Spieler aus. Sobald nur noch ein Spieler aktiv ist, endet die
Partie sofort und dieser Spieler gewinnt unabhängig von den eingefrorenen
Punktzahlen. Ein ausgeschiedener Spieler darf den öffentlichen Spielstand
weiter ansehen, aber keine Spielaktion mehr ausführen.

M7 setzt D10 um. Fehlt in einer laufenden Partie eine aktive
Steuerverbindung, pausiert der gesamte Spielablauf; bereits angenommene
Änderungen bleiben bestehen und neue Spielaktionen werden abgelehnt. Die
Teilnehmerliste wird niemals wegen eines Disconnects verändert. Nach 90
Sekunden kann der Host wiederholt weitere 90 Sekunden warten oder die Partie
ohne Sieger und ohne zusätzliche Wertung abbrechen. Erst die Rückkehr aller
Fehlenden setzt automatisch fort.

Während der Pause stehen Fähigkeits- und letztes Kabu-Reaktionsfenster still
und laufen mit Restzeit weiter. Die Wiederbeitrittsfrist und kurzlebige
öffentliche Fehlaufdeckungen laufen weiter. Pro Spieler steuert genau ein Tab;
eine Übernahme ist bewusst und entzieht dem alten Tab sofort das Aktionsrecht.
