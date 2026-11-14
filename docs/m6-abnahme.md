# M6 – manuelle Abnahme der mobilen Bedienung

Echte iOS-/Android-Gerätetests wurden bei der Implementierung nicht
durchgeführt. Die automatisierte Prüfung deckt Zustandsrouting, Geheimhaltung,
Touch-Schutz und responsive DOM-Strukturen ab; die visuelle und haptische
Abnahme auf echten Handys bleibt Teil dieser Anleitung.

## Start und Zugang vom Handy

1. Node.js 24 und pnpm 11 verwenden. In `Kabu-M1` einmal `pnpm install`, dann
   `docker compose up -d postgres` und `pnpm db:migrate` ausführen.
2. In `.env` lokal `KABU_ENABLE_TEST_SCENARIOS=true`,
   `VITE_KABU_TEST_SCENARIOS=true` und zunächst
   `KABU_PUBLIC_REVEAL_MS=2500` setzen. Nie in Produktion aktivieren.
3. `pnpm dev` starten. Rechner und Handys müssen im selben WLAN sein. Auf jedem
   Gerät exakt Vites Adresse hinter `Network` öffnen, zum Beispiel
   `http://192.168.1.20:5173`. Der tatsächliche Port kann abweichen.
4. A erstellt den Raum. B bis F treten per Code oder Link in getrennten
   Browser-Sitzungen bei. Alle werden bereit, A startet, alle schließen ihre
   Startansicht.
5. Nur A öffnet „Entwicklungs-Testszenario laden / zurücksetzen“. Erneutes
   Laden setzt zurück; niemand muss auf Zufallskarten warten oder Code ändern.

Für sechs Spieler genügen neben zwei Handys vier getrennte Browserprofile am
Rechner. Bloße Tabs desselben Profils teilen die Gastidentität und sind
ungeeignet. Fenster auf etwa 360 × 740 CSS-Pixel stellen. Das ersetzt keine
echte Geräteprüfung, macht aber alle sechs Sitze steuerbar.

## Zu beurteilende Bedienentscheidung

Implementierter Standard ist die direkte Reaktion: Sobald ein Fenster offen
ist, löst ein Kartentipp ohne vorgeschalteten Knopf den Versuch aus. Offene
Pflichtausgleiche, Fähigkeitsziele und die Entscheidung über eine gezogene
Karte haben regelbedingt Vorrang. Es gibt weder Auswahl-Highlight noch
Bestätigungsdialog.

## Kurze Pflichtabnahme

1. **Gesamter Tisch, zwei und sechs Spieler.** Mit A/B, danach A–F öffnen.
   Erwartet: Gegner zyklisch oben, eigenes Feld unten, Stapel/Ablage dazwischen;
   Name und Kartenanzahl bleiben erreichbar. Bei vier Spielern stehen alle
   drei Gegner in einer festen Zeile; bei fünf oder sechs Spielern beginnen
   weitere Gegner in denselben drei Spalten. Der aktive Spieler ist ohne
   zusätzlichen Zugtext deutlich mit Pfeil, Rahmen und Leuchten markiert. Lange
   Namen überdecken nichts. Auf Handy und in schmalen Desktopfenstern bleiben
   die drei festen Gegnerspalten auch bei bis zu acht Karten pro Feld erhalten;
   bei mehr Gegnern wird nur eine weitere Zeile begonnen. Fehler: ein
   gewachsenes Feld verschiebt eine Gegnerspalte, verdeckt die Mitte oder führt
   zu überlappenden Kartenfeldern.
2. **Ziehen, Ablegen, Tauschen.** `ability-own-look`: A zieht. Erwartet:
   „Eigene Karte zum Tauschen wählen“, eigene Karten sind aktiv und direktes
   gezogene Karte neben dem eigenen Feld steht. Zum Ablegen die Ablage, zum
   Tauschen eine eigene Karte tippen. Fehler: zusätzlicher Aktionsknopf,
   gegnerischer Tausch oder Bewegung vor Serverbestätigung.
3. **Eigene und fremde Reaktion.** `reaction-own`: A tippt direkt eigene
   „nah 1“, nach Reset Bs „nah 1“. Erwartet: eigener Treffer bestätigt,
   fremder Treffer öffnet Pflichtausgleich; kein Modus oder Bestätigungsdialog.
4. **Reaktion vor und während Einsicht.** `reaction-during-insight`: A
   zieht/legt die 5. Vor dem Ansehen reagiert A mit einer eigenen und nach
   Reset mit einer gegnerischen Karte; die Aktivität bleibt mit derselben
   10-Sekunden-Deadline offen. „Aktivität ausführen“ und „Ansehen überspringen“
   stehen rechts neben den Stapeln, der Kreis läuft um den Überspringen-Button.
   Nach Auswahl sieht A die Karte direkt an ihrer Position. B kann währenddessen
   mit freier Karte reagieren, ohne As Effekt zu schließen. B darf aber erst
   ziehen oder Kabu ansagen, nachdem A die Aktivität ausgeführt oder
   übersprungen hat beziehungsweise die Zeit abgelaufen ist.
5. **Schwarzer König.** `ability-black-king`: A zieht/legt und wählt Karten
   verschiedener Besitzer. Erwartet: Zwecktext wechselt, Bindungen sind
   markiert, Werte sieht nur A. „Tauschen“ und nach Reset „Behalten“ prüfen.
6. **Fremde Reaktion mit Ausgleich.** `reaction-foreign`: A wählt direkt Bs
   „nah 1“, danach eine eigene Karte. Erwartet:
   „Ausgleichskarte auswählen“ hat Vorrang; nur eigene freie Karten sind aktiv.
7. **Fehlversuch, zu spät, verändert, gebunden.** `reaction-wrong`: A versucht
   „nah 1“. Erwartet: „Fehlversuch · Strafkarte“ und neue verdeckte Karte.
   `reaction-own`: A trifft, B versucht danach seine 5; Fenster ist „verbraucht“
   und B erhält die ausgewiesene Strafe. Veränderte bzw. gebundene Ziele melden
   neutral „Zielkarte inzwischen verändert“ bzw. „Zielkarte ist gebunden“.
8. **Maximal gewachsenes Feld.** `m6-grown-field`: A besitzt 8 Karten.
   Erwartet: Das Feld bleibt ein striktes Raster aus genau zwei Reihen. Nach
   dem anfänglichen 2x2-Raster wird zuerst rechts eine Spalte gefüllt, danach
   links. Die vier Startkarten bleiben dabei pixelgleich um ihren ursprünglichen
   Mittelpunkt verankert; entfernte Karten verschieben keine verbleibende Karte.
   Unsichtbare Anker erhalten die Position, werden aber nicht mit umrandet. Zwei
   gegenüberliegende Felder bleiben nebeneinander an ihren festen Sitzen. Eigene
   und gegnerische Karten sind gleich groß. Erst ein Vier-Spalten-Feld aktiviert
   bei Bedarf die kompaktere gemeinsame Kartengröße. Keine Karte wird
   abgeschnitten oder erst durch horizontales Scrollen erreichbar. Der kurze
   Handlungshinweis steht links neben der Tischmitte.
9. **Vier gewachsene Felder nebeneinander.** Einen Raum mit genau A–D starten
   und `m6-four-player-grown-fields` laden. Alle vier Spieler besitzen je acht
   Karten in vier Spalten. Erwartet: Aus jeder Ansicht stehen die drei Gegner
   in einer einzigen stabilen Zeile nebeneinander; Namen, Zähler und alle vier
   Kartenspalten bleiben mit derselben Kartengröße ohne horizontales Scrollen
   sichtbar. Die Karten liegen mittig im jeweiligen Gegnerbereich; nur sichtbare
   Karten tragen eine Umrandung. Beim Wechsel zwischen Hoch- und Querformat darf
   keine Gegnerspalte ihren Platz tauschen.
10. **Eliminierung mit neun Karten.** Einen Spieler durch Fehlreaktionen oder
    rote Könige auf neun Karten bringen. Erwartet: Seine aktuellen Kartenpunkte
    werden einmalig zum Gesamtstand addiert und als Endstand angezeigt. Sein
    Sitz bleibt mit „Ausgeschieden“ sichtbar, bietet aber keinerlei Aktion oder
    Ziel mehr. Zugfolge und nächste Runde überspringen ihn. Bei zwei Spielern
    endet die Partie sofort mit dem anderen Spieler als Sieger.
11. **Kabu und Ergebnis.** `m5-kabu-tie`: A sagt Kabu, B zieht/legt das Ass.
    Erwartet: Schlusszüge, dann ausschließlich letztes Kabu-Fenster mit 3,0-s-
    Countdown. Normale Fenster haben keinen Timer. Ergebnis und Bereitschaft
    bleiben auf schmalem Display lesbar.

## Zusätzliche Grenzfälle

1. **Doppeltippen/Verzögerung.** Netzwerk drosseln und doppeltippen. Sofort
   steht „gesendet · wartet auf Server“, genau ein Befehl geht hinaus. Nach ACK
   erscheint bestätigt oder konkrete Ablehnung; danach ist ein neuer Versuch möglich.
2. **Aktion während Aufdeckung.** Andere zulässige Karte während eines
   sichtbaren Fehlversuchs wählen. Nur die konkrete Belegung bleibt gesperrt;
   keine Darstellung blockiert oder löst später eine Aktion aus.
3. **D11-Dauer.** `reaction-wrong` mit `KABU_PUBLIC_REVEAL_MS=1500`, `2500`
   und `4000` (Server jeweils neu starten) prüfen. Die Anzeigezeit darf kein
   Reaktionsfenster verkürzen oder verlängern.
4. **Orientierung.** Während Tausch-, Reaktions- und Königsauswahl drehen.
   Auswahlzweck und Serverzustand bleiben bestehen.
5. **Reduzierte Bewegung.** Betriebssystemoption aktivieren. Verständnis hängt
   nicht von Bewegung ab; Fokus und Texte bleiben gleich.
6. **Lobby-Tastatur.** Auf iOS/Android Name und Code eingeben. Aktives Feld und
   Absenden bleiben scrollbar sowie von Browserleisten/Safe Areas unverdeckt.
7. **Geheimhaltung.** Screenreader liest etwa „Verdeckte Karte von Bea, nahe
   1“, niemals Farbe, Rang oder Punkte.

## Geräteprotokoll

| Prüfung                     | Gerät/Browser/Version | Ergebnis           | Offen |
| --------------------------- | --------------------- | ------------------ | ----- |
| iOS Safari, echte Runde     | –                     | nicht durchgeführt | ja    |
| Android Chrome, echte Runde | –                     | nicht durchgeführt | ja    |
| Bildschirmtastatur          | –                     | nicht durchgeführt | ja    |
| Orientierungswechsel        | –                     | nicht durchgeführt | ja    |
| Reduzierte Bewegung         | –                     | nicht durchgeführt | ja    |

M6 ist manuell erst abgenommen, wenn eine echte Handyspielrunde ohne zusätzliche
Erklärung durch Ziehen, Tausch, Fähigkeit, Reaktion, Ausgleich und Ende kommt.

## Mit dem ersten Szenario beginnen

Starte die Umgebung, verbinde zwei Handys, schließe die Startansichten und lade
`reaction-own`. Auf A muss „Reaktionsfenster offen · Rang 5“ erscheinen. Tippe
direkt As „nah 1“. Die Karte darf erst nach
„Reaktionsversuch bestätigt“ verschwinden; das Fenster ist danach „verbraucht“.
