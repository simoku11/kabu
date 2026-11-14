# Entscheidungen

## M7 – zur Produktabnahme

- D10 wird so konkretisiert: Die erste getrennte Steuerverbindung pausiert eine
  laufende Partie sofort. Nach 90 Sekunden erhält ausschließlich der Host die
  Wahl „weitere 90 Sekunden warten“ oder „Partie abbrechen“. Warten darf
  wiederholt werden. Kehrt der letzte fehlende Spieler vorher zurück, läuft die
  Partie automatisch weiter. Abbruch erzeugt weder Sieger noch Rundenwertung.
- Spielzeitfristen (offene Fähigkeit und letztes Kabu-Reaktionsfenster) halten
  während der Pause an und laufen danach mit ihrer Restzeit weiter. Die
  Wiederbeitrittsfrist läuft weiter. Kurzlebige öffentliche Fehlaufdeckungen
  werden nicht verlängert und können nach Rückkehr nicht wieder erscheinen.
- Pro Spieler und Raum gibt es genau eine aktive Steuerverbindung. Ein weiterer
  Tab bleibt lesend, bis „Steuerung übernehmen“ bestätigt wurde. Der alte Tab
  verliert sofort seine Befehlsberechtigung; sein automatischer Reconnect holt
  sie nicht zurück.

Diese drei Konkretisierungen sind implementierte M7-Vorschläge. Sie verändern
keine Kartenregel, müssen aber in der manuellen M7-Abnahme ausdrücklich
bestätigt oder angepasst werden.

## M6

- Eine offene Spezialfähigkeit sperrt den Beginn des folgenden regulären
  Zuges. Der nächste Spieler darf erst ziehen oder Kabu ansagen, nachdem die
  Fähigkeit ausgeführt, eine optionale Ansehaktion übersprungen oder die
  Aktion durch Ablauf beendet wurde. Reaktionen auf das bestehende Fenster
  bleiben davon unberührt.
- Neun Karten eliminieren den Besitzer dauerhaft aus der Partie. Der Wert
  dieser Karten wird zu seinen bisherigen Gesamtpunkten addiert und als
  Endpunktzahl eingefroren. Karten und Spieler verlassen alle aktiven
  Regelpfade; der Sitz bleibt als nicht interaktiver Platz sichtbar. Bei nur
  noch einem aktiven Spieler endet die Partie mit diesem Spieler als Sieger.
- Aktive Spielerfelder wachsen höchstens auf vier Spalten beziehungsweise acht
  Karten. Auch gewachsene Gegnerfelder behalten deshalb ihre feste Position in
  der zweispaltigen Tischanordnung; die gemeinsame Kartengröße wird bis zur
  Mindestbreite verkleinert.

- Der Standard verwendet keinen vorgeschalteten Reaktionsmodus mehr. Bei einem
  offenen Fenster löst ein direkter Kartentipp den Versuch aus. Regelbedingte
  Pflichtausgleiche, Fähigkeitsauswahl und die Entscheidung über eine gezogene
  Karte haben weiterhin eindeutigen Vorrang.
- Private Einsichten drehen die Karte an ihrer stabilen Tischposition um. Ein
  Kreis zeigt die verbleibende Zeit; ein früher Tipp schließt eine einfache
  Einsicht. Danach kann dieselbe Position unmittelbar als Reaktion gewählt
  werden. Das setzt D4/A unverändert um.
- Die gemeinsame 10-Sekunden-Frist einer Aktivität beginnt bereits mit dem
  Ablegen der fähigkeitsberechtigten Karte. Vor der ersten Fähigkeitsauswahl
  darf ihr Besitzer mit einer eigenen oder gegnerischen Karte reagieren; die
  noch offene Fähigkeit und ihre ursprüngliche Deadline bleiben danach
  bestehen. Die Aktivitätsbedienung steht rechts neben den Stapeln, der
  Countdown umläuft insbesondere „Ansehen überspringen“.
- Gezogene Karten stehen neben dem eigenen Feld. Ein Tipp auf die Ablage legt
  sie direkt ab, ein Tipp auf eine eigene Feldkarte tauscht sie.
- Alle Feldkarten, private Aufdeckungen und die Ablage verwenden dieselben
  Abmessungen. Der Nachziehstapel zeigt ausschließlich gestapelte Rückseiten
  und darunter die Restzahl; nur seine oberste Karte wird im eigenen Zug markiert.
- Große Felder bleiben ein striktes Raster aus zwei Reihen. Nach dem 2x2-Start
  werden vollständige Spalten abwechselnd rechts und links ergänzt. Karten und
  Lücken behalten ihre Position; neue Karten belegen freie Spalten von innen
  nach außen. Die Kartengröße passt sich der verfügbaren Breite an.
- Der jeweils kurze Handlungshinweis steht in kleiner Schrift direkt neben den
  Stapeln, links vor Nachzieh- und Ablagestapel. Größere Erklärungskästen
  bleiben nur für echte Entscheidungsknöpfe.
- Auf Handys und schmalen Desktopfenstern stehen Gegnerfelder unabhängig von
  ihrer Kartenzahl paarweise in zwei Spalten. Nur ein unpaariges letztes Feld
  belegt die volle Breite. Tischmitte und eigenes Feld folgen darunter, ohne
  Überlappung.
- D11 bleibt Produktentscheidung. Die Aufdeckung ist weiter serverseitig über
  `KABU_PUBLIC_REVEAL_MS` konfigurierbar; die Abnahme vergleicht 1.500, 2.500
  und 4.000 ms. Sie verändert kein Reaktionsfenster.

## M5

- Abnahmeklarstellung: Ein Spieler mit einer bereits gezogenen, noch nicht
  abgelegten oder getauschten Karte darf selbst keinen Reaktionsversuch
  beginnen. Das bestehende Fenster bleibt für alle anderen Spieler offen.
  Nach Abschluss der Ziehentscheidung gelten wieder die normalen
  Reaktionsregeln, sofern das Fenster dann noch besteht.
- D3, D6 und D7 werden unverändert aus dem beschlossenen digitalen
  Regelvertrag umgesetzt. Das letzte Kabu-Fenster beginnt mit Annahme der
  regulären Ablage, die den letzten noch ausstehenden Schlusszug verbraucht,
  und endet nach exakt 3.000 ms. Bei `now === deadline` ist die Reaktion zu
  spät.
- Nach einer gewerteten, aber nicht letzten Runde startet die Folgerunde erst,
  wenn jeder Teilnehmer einmal bewusst „Bereit für nächste Runde“ bestätigt
  hat. Wiederholte Bestätigung ändert die Bereitschaft nicht.
- Eine D9-Wiederholungsrunde erhält eine neue Rundeninstanz-ID, aber dieselbe
  fachliche Rundennummer und denselben Startspieler. Wertungsstand und Anzahl
  regulär gewerteter Runden bleiben unverändert.

## M4

- Bei konkurrierenden Reaktionen gewinnt weiterhin nur der erste korrekte
  Abwurf. Das verbrauchte Fenster bleibt aber bis zur nächsten regulären
  Ablage als auswählbarer Referenzzustand bestehen. Jeder weitere Versuch
  dagegen gilt als „zu spät“: Karte kurz öffentlich zeigen, an derselben
  Position belassen und dem Reagierenden genau eine Strafkarte geben, auch
  wenn der Rang gepasst hätte. Andere bzw. ersetzte Fenster und veränderte
  Positionen bleiben neutral.
- D4 wird einschließlich Variante A umgesetzt: ausgewählte Karten werden
  exklusiv gehalten. Seit der M6-Anpassung darf der Effektinhaber zusätzlich
  vor seiner ersten Auswahl reagieren. Nach Beginn einer privaten Ansicht
  wird diese weiterhin erst geschlossen, bevor dieselbe gehaltene Karte als
  Reaktion gewählt werden kann.
- D5 schützt die Empfängerlücke und mindestens eine verfügbare Ausgleichskarte
  bis zum atomaren Transfer. Nur der Reagierende ist für gefährdende Aktionen
  gesperrt; unbeteiligte Reaktionen laufen weiter. Ein regulärer Folgezug
  wartet zusätzlich auf den Abschluss jeder offenen Spezialfähigkeit.
- D9 startet bei nicht erfüllbarer Pflichtkarte dieselbe Rundennummer mit
  denselben Teilnehmern neu und erzeugt keine Wertung.
- D11 wurde für private Fähigkeitsansichten konkretisiert: Sie enden durch
  bewussten Abschluss, spätestens aber 10 Sekunden nach akzeptierter Auswahl.
  Beim schwarzen König bedeutet Ablauf ohne Entscheidung „Behalten“.
  Öffentliche Fehlaufdeckungen bleiben vorläufig konfigurierbare 2.500 ms
  (`KABU_PUBLIC_REVEAL_MS`) sichtbar.

## M2

- D1 aus M0 wird unverändert umgesetzt.
- Wiederbeitritt erfolgt über ein 256-Bit-Zufallstoken im `HttpOnly`-Cookie;
  PostgreSQL speichert nur dessen SHA-256-Hash.
- Raumcodes verwenden sechs gut unterscheidbare Zeichen ohne `0/O/1/I/L`.
- Eine Rundenzahl von 1–99 ist die technische Eingabegrenze; Standard bleibt 10.
- Verbindungsabbruch ist kein endgültiges Verlassen und löst keinen Hostwechsel
  aus.
- Der Zustand `started` bestätigt in M2 nur die gültige Lobbyfreigabe. M3
  übernimmt von dort den Kartenaufbau.

## M3

- D2 und D8 aus M0 werden unverändert umgesetzt: zufälliger erster
  Startspieler, leere Anfangsablage, feste spielernahe Startreihe und stabile
  Positionen ohne Verdichtung.
- Der interne Kartenstapel ist oben-zuerst injizierbar; der gespeicherte
  Nachziehstapel legt die oberste Karte ans Array-Ende, damit Ziehen atomar per
  `pop` erfolgt.
- Belegungsversionen gehören zur Position und werden bei jedem Austausch oder
  Wiederbefüllen erhöht. Clients können damit keine veraltete Position treffen.
- Ablagen speichern `drawn` oder `swapped` und zusätzlich die künftige
  Fähigkeitseignung. M3 führt Fähigkeiten noch nicht aus; der Anschluss ist
  damit ausdrücklich vorbereitet und nicht dauerhaft wirkungslos modelliert.
- Vor M3 gespeicherte M2-Startmarken enthielten noch keinen Rundenzustand. Die
  M3-Migration setzt nur diese Entwicklungsräume in die Lobby zurück, damit
  der Host eine echte Runde starten kann.
