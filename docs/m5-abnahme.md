# M5 – manuelle Abnahme der vollständigen Partie

Echte Handytests wurden während der Implementierung nicht durchgeführt. Diese
Anleitung verwendet feste lokale Spielsituationen; Zeitgrenzen,
Wiederverarbeitung und Idempotenz werden zusätzlich automatisiert geprüft.

## Start, mehrere Clients und Reset

1. Node.js 24 und pnpm 11 verwenden. In `Kabu-M1` einmal `pnpm install`, dann
   `docker compose up -d postgres` und `pnpm db:migrate` ausführen.
2. In `.env` für die Abnahme `KABU_ENABLE_TEST_SCENARIOS=true` und
   `VITE_KABU_TEST_SCENARIOS=true` setzen. Diese Schalter gehören nie in einen
   Produktionsbetrieb.
3. `pnpm dev` starten. Am Rechner und auf allen Handys die von Vite hinter
   `Network` gemeldete Adresse öffnen, zum Beispiel
   `http://192.168.1.20:5173`. Alle Geräte müssen denselben tatsächlichen Port
   verwenden.
4. Auf Handy A einen Raum erstellen, Link oder Code auf Handy B und für den
   Drei-Spieler-Test auf C öffnen. Alle bestätigen „Ich bin bereit“, A startet,
   anschließend schließt jeder seine feste Ansicht der zwei nahen Karten.
5. Nur A als Host öffnet „Entwicklungs-Testszenario laden / zurücksetzen“.
   Jeder Szenarioklick ersetzt die aktuelle Testrunde vollständig durch die
   feste Ausgangslage. Zum Zurücksetzen dasselbe Szenario erneut anklicken.
   Quellcode- oder Serveränderungen sind nicht nötig.

Die Szenarien geben keine geheimen Werte zusätzlich über das Netzwerk aus.
Genannte Werte sind lediglich die bekannte Anordnung dieser Testfixtures.

## Gezielter Spezialfall: vorzeitiges Ende der Kabu-Schlussphase

Für diesen Fall sind **genau drei Spieler A, B und C** vorgesehen. Die Regel
funktioniert zwar auch zu zweit, aber erst C macht sichtbar, dass ein noch
ausstehender Schlusszug wirklich entfällt. Eine vollständige Partie muss dafür
nicht gespielt werden.

1. Mit drei verbundenen Spielern `m5-kabu-early-zero` laden.
2. Ausgangslage: A ist am Zugbeginn; B besitzt nur ein verdecktes Ass. Das
   nächste Ziehen liefert B ebenfalls ein Ass.
3. A klickt „Kabu ansagen“. Sichtbar ausstehend sind B und C.
4. B zieht und legt das gezogene Ass direkt ab. Danach ist sichtbar nur noch C
   als Schlusszug ausstehend und das neue Reaktionsfenster bezieht sich auf
   Ass.
5. B tippt nun sein einziges eigenes Feld-Ass als Reaktion an. Das ist erlaubt,
   weil B die gezogene Karte zuvor bereits abgelegt hat.
6. Erwartet: B besitzt 0 Karten, die Runde wird sofort mit Grund „0 Karten“
   gewertet und C erhält keinen Schlusszug mehr. Die Ergebnisansicht zeigt für
   B 0 Kartenpunkte und keine weiterhin ausstehende Schlusszugliste.

Erkennbares Fehlverhalten wäre: B darf schon während der gezogenen Karte
reagieren, B darf nach dem Ablegen nicht reagieren, C kommt noch an die Reihe,
das Drei-Sekunden-Fenster läuft bis zum normalen Kabu-Ende weiter oder B erhält
trotz leerem Feld Kartenpunkte.

## Kurze Pflichtabnahme

1. **Ende durch eigene letzte Karte – `m5-zero-own`.** Ausgangslage: A besitzt
   nur „nah 1“ (5), eine Referenz-5 liegt offen. Aktion: A tippt die eigene
   Karte als Reaktion. Sichtbares Ergebnis: sofortige Ergebnisansicht, A hat
   Kartenpunkte 0, alle übrigen Karten sind offen und der Gesamtstand wurde
   einmal erhöht. Fehler: weiterer Zug, weiter anklickbares Fenster oder
   verdeckte Ergebniskarten.
2. **Fremde letzte Karte und Ausgleich – `m5-foreign-last`.** Ausgangslage: Bei
   B liegt auf „nah 1“ eine passende Dame; A besitzt genau eine Karte. Aktion:
   A reagiert mit Bs Dame und wählt danach die eigene letzte Karte für den
   Pflichtausgleich. Sichtbares Ergebnis: Bs leere Position allein beendet die
   Runde noch nicht; erst nach dem Transfer endet sie wegen As null Karten.
   Fehler: Ergebnis vor Auswahl, verlorene Karte oder nicht reservierte Lücke.
3. **Rettung durch roten König – `m5-red-king-rescue`.** Ausgangslage: B hat
   nur einen schwarzen König, eine rote-König-Pflicht von A ist offen. Aktion:
   B reagiert mit dem eigenen König; danach gibt A die Pflichtkarte an B.
   Sichtbares Ergebnis: zunächst „Vorläufiges Rundenende“, danach wieder ein
   regulärer Zug mit genau einer verdeckten Karte bei B. Zweiter Durchlauf: A
   gibt die Karte stattdessen A; dann bleibt B leer und die Runde endet.
   Fehler: Reaktionen im vorläufigen Ende, hängende Bindung oder Ende trotz
   Rettung.
4. **Kabu und drei Schlusszüge – `m5-kabu` mit A, B und C.** Ausgangslage: A
   ist am Zugbeginn. Aktion: A sagt Kabu; B und C führen nacheinander je einen
   vollständigen Zug aus. Sichtbares Ergebnis: A kommt nicht mehr an die
   Reihe, Ansager und Reihenfolge der noch offenen Schlusszüge stehen am
   Tisch. In einem Reset legt B direkt eine 2 ab: Cs Schlusszug gilt als
   verbraucht. Fehler: zweites Kabu, A zieht, ausgelassener Spieler kehrt
   später zurück oder die 2 erzeugt einen Extrazug.
5. **Drei-Sekunden-Fenster – `m5-kabu-tie` mit zwei Spielern.** A sagt Kabu. B
   zieht das feste Ass und legt es direkt ab. Sichtbares Ergebnis: unmittelbar
   mit Annahme der Ablage erscheint ein Countdown von 3,0 Sekunden; während
   der Frist bleiben Reaktionen möglich, bei 0 endet die Runde. Reset und ein
   Fehlversuch: Countdown darf nicht neu beginnen. Fehler: Abschluss vor 0,
   Verlängerung, Client-Uhr entscheidet oder normale Fenster erhalten einen
   solchen Countdown.
6. **Kabu-Gleichstandsstrafe – `m5-kabu-tie`.** A und B besitzen je eine 4. A
   sagt Kabu, B zieht das Ass und legt es direkt wieder ab. Nach sechs Sekunden
   zeigt die Wertung für beide 4 Kartenpunkte, für A zusätzlich +10 und damit
   14 Rundenpunkte. Fehler: Gleichstand ohne Strafe oder vermischte Anzeige
   von Kartenwert und Strafe.
7. **Folgerunde.** Raum mit zwei Runden starten und `m5-zero-own` beenden.
   Zuerst bestätigt nur A „Bereit für nächste Runde“: Ergebnis bleibt stehen.
   Danach bestätigt B. Sichtbares Ergebnis: Runde 2 mit neuem vollständigem
   Feld, je vier Karten, den festen nahen Startansichten und dem gegenüber
   Runde 1 rotierten Startspieler; Gesamtstand bleibt erhalten. Fehler: alter
   Kartenwert/Countdown, automatischer Start oder zurückgesetzte Punkte.
8. **Vollständige kurze Partie mit zwei Handys – `m5-short-game`.** Einen neuen
   Raum mit **einer Runde** starten und danach das Fixture laden. Fixtures
   verändern die vor Partiebeginn festgelegte Rundenzahl bewusst nicht. A
   wirft die eigene feste 5 auf die
   Referenz-5. Sichtbares Ergebnis: `Partie beendet`, niedrigster Gesamtwert
   als Gewinner, keine Bereitschaftsschaltfläche und keine weitere Spielaktion.
   Beide Handys müssen dasselbe Ergebnis und alle aufgedeckten Felder zeigen.
   Fehler: zweite Addition nach Refresh/Doppelklick oder weitere Runde.

## Zusätzliche Grenzfälle

1. **D6 bei offenem Zug.** `m5-zero-own` laden, B ziehen lassen und erst dann
   A mit der letzten 5 reagieren lassen. Erwartet: Bs gezogene Karte liegt
   genau einmal offen und neutral oben; weder Fähigkeit noch neues Fenster
   noch Wiederaufnahme dieses Zugs. Dieser Ablauf ist primär automatisiert,
   weil das Fixture A als aktiven Spieler startet.
2. **Null Karten in der Schlussphase.** `m5-kabu` laden, Kabu ansagen und in
   einem Schlusszug eine letzte passende Reaktion ausführen. Erwartet: Das
   vorläufige Null-Karten-Ende hat Vorrang und übrige Schlusszüge entfallen.
   Rettet eine bestehende Pflicht, bleibt nur die noch nicht verbrauchte
   Schlusszugliste übrig.
3. **Offener Ausgleich beim Deadline-Ablauf.** Im letzten Kabu-Fenster eine
   fremde passende Karte reagieren und die Ausgleichsauswahl bis nach 0
   offenlassen. Erwartet: Countdown endet, Auswahl bleibt bedienbar; erst ihr
   Abschluss wertet. Kein neuer Reaktionsversuch wird angenommen.
4. **Einzelner Bestwert und schlechter Ansager.** Normale Partie zweimal mit
   bekannten eigenen Endkarten spielen: Ansager allein niedriger ergibt 0
   Strafe; ein besserer Gegner ergibt +10. Die exakten Varianten sind im
   Regelkerntest reproduzierbar abgedeckt.
5. **Geteilter Gesamtsieg.** Eine kurze Partie mit gleichem Gesamtwert
   herstellen. Erwartet: Alle Spieler mit dem kleinsten Wert werden gemeinsam
   genannt; dieser Vergleich ist automatisiert mit festen Werten geprüft.
6. **Refresh und alte Befehle.** Ergebnisansicht auf beiden Geräten neu laden.
   Erwartet: kein zweites Ergebnis und kein zweiter Punkteaufschlag. Ein alter
   Tab aus Runde 1 darf nach Start von Runde 2 keinen Zug mehr verändern.
7. **D9-Wiederholungsrunde.** Die vollständige Stapelerschöpfung ist im
   automatisierten Test erzwungen. Erwartet sind gleiche Rundennummer und
   Startspieler, neue Instanz-ID, null zusätzliche Punkte und keine verbrauchte
   Wertungsrunde.

## Automatisierte Grenzen

`pnpm check` prüft unter anderem die serverseitigen Zeitpunkte unmittelbar vor
und an der Deadline, mehrfachen Timeout, mehrfache Befehls-ID, Kabu-Bestwert,
Gleichstand und schlechteren Ansager, Königsfarben, D6-Kartenerhaltung,
Transferreihenfolge, Rotation sowie alte Runden-IDs. Manuelle Klickzeiten sind
nicht als Beweis für exakte Millisekundengrenzen gedacht.

## Mit dem ersten Szenario beginnen

Starte die Umgebung wie oben, verbinde zwei Handys, schließe beide
Startansichten und lade als Host `m5-zero-own`. Tippe auf Handy A die einzige
eigene Karte „nah 1“ an. Als erstes Ergebnis muss auf beiden Geräten sofort die
Runden- beziehungsweise Partieauswertung mit 0 Kartenpunkten für A erscheinen.
