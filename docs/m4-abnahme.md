# M4 – manuelle Abnahme auf zwei oder drei Geräten

Echte Handytests wurden bei der Implementierung nicht durchgeführt. Diese
Anleitung bereitet die manuelle Abnahme mit deterministischen, ausschließlich
lokal aktivierbaren Zuständen vor.

## Start und Verbindung

1. Node.js 24 und pnpm 11 verwenden. Im Repository `Kabu-M1` die lokale
   Datenbank mit `docker compose up -d postgres` starten und einmal
   `pnpm db:migrate` ausführen.
2. In `.env` ausschließlich für diese Abnahme setzen:
   `KABU_ENABLE_TEST_SCENARIOS=true`,
   `VITE_KABU_TEST_SCENARIOS=true` und optional
   `KABU_PUBLIC_REVEAL_MS=2500`.
3. `pnpm dev` starten. Rechner und Handys müssen im selben WLAN sein. Auf allen
   Geräten exakt die von Vite als `Network` gemeldete Adresse öffnen, etwa
   `http://192.168.1.20:5173` (der tatsächliche Port kann abweichen).
4. Auf Gerät A einen Raum erstellen, Link oder Code auf B und für die
   Drei-Spieler-Fälle auf C öffnen. Alle auf „bereit“, dann A auf „Partie
   starten“. Die Startansichten auf allen Geräten schließen.
5. A öffnet unten „Entwicklungs-Testszenario laden / zurücksetzen“. Ein Klick
   auf einen Szenarionamen setzt die aktuelle Testrunde vollständig auf dessen
   Ausgangslage zurück. Derselbe oder ein anderer Klick ist der Reset; weder
   Quellcodeänderung noch Serverneustart ist nötig. Nur der Host darf laden.

Die Szenarien verraten im Netzwerk keine Kartenwerte. Die unten genannten
verdeckten Werte sind Teil der festen Testanordnung, nicht einer Diagnoseansicht.

## Kurze Pflichtabnahme

1. **Eigene Einsicht und Variante A** — `ability-own-look` laden. A zieht und
   legt die 5 direkt ab, wählt eigene Position „nah 1“. Erwartet: nur A sieht
   dort eine 5; die Karte trägt „Gehalten“. A kann während der Ansicht nicht
   reagieren. A schließt die Ansicht und tippt sofort dieselbe Position.
   Erwartet: erfolgreicher Reaktionsabwurf, Fenster „verbraucht“, keine neue
   Fähigkeit. Ein sichtbarer Countdown beginnt bei 20 Sekunden und schließt
   die Ansicht spätestens bei 0 automatisch. Fehler: B sieht den Wert oder A
   kann vor dem Schließen reagieren.
2. **Gegnerische Einsicht** — `ability-opponent-look`; A zieht/legt die 9 und
   wählt bei B „nah 1“. Erwartet: nur A sieht die Karte, nach „Ansicht
   schließen“ ist sie für alle wieder verdeckt und nicht nachschlagbar. Danach
   erneut laden und „Ansehen überspringen“ prüfen.
3. **Aussetzen** — `ability-2` mit zwei Geräten; A zieht und legt die 2.
   Erwartet: B wird übersprungen und A ist wieder am Zug. Das Fenster für Rang
   2 bleibt offen.
4. **Schwarze Dame** — `ability-black-queen`; A zieht/legt, wählt eine Karte
   von A und eine von B. Erwartet: erste Auswahl wird gehalten, niemand sieht
   Werte, nach zweiter Auswahl werden beide Positionen atomar getauscht und
   freigegeben.
5. **Roter König** — `ability-red-king`; A zieht/legt und wählt nacheinander in
   zwei getrennten Resets zuerst A selbst, dann B. Erwartet: Empfänger erhält
   je genau eine zusätzliche verdeckte Karte, auch für ihn ohne Einsicht.
6. **Schwarzer König** — `ability-black-king`; A zieht/legt, wählt Karten
   verschiedener Besitzer. Erwartet: beide gehalten und nur für A sichtbar;
   über jedem Kartenwert stehen der zugehörige Spieler und die stabile Position
   (zum Beispiel „Bo · nah 1“).
   Einmal „Behalten“, nach Reset einmal „Tauschen“; anschließend verschwinden
   Ansicht und Haltemarken. Zusätzlich den Countdown ohne Eingabe ablaufen
   lassen: Der Server muss automatisch „Behalten“ ausführen.
7. **Eigene Reaktion** — `reaction-own`; A tippt „nah 1“. Erwartet: die dort
   fest liegende 5 passt auf die Referenz-5, wird abgelegt und verbraucht das
   Fenster ohne Fähigkeit.
8. **Mehrere Fehlversuche** — `reaction-wrong`; A tippt „nah 1“ (3), dann
   „nah 2“ (4), dann „fern 1“ (9). Erwartet: jeder der ersten beiden Versuche
   zeigt genau diese Karte etwa 2,5 Sekunden öffentlich und gibt A je eine
   verdeckte Strafkarte; das Fenster bleibt offen. Solange eine falsche Karte
   sichtbar ist, ist genau sie nicht erneut anklickbar und erzeugt auch bei
   einem dennoch gesendeten Versuch keine weitere Strafkarte. Der dritte
   Versuch gelingt und verbraucht das Fenster.
9. **Fremde Reaktion und Ausgleich** — `reaction-foreign`; A tippt bei B
   „nah 1“ (Dame). Erwartet: Erfolg und sofort verbrauchtes Fenster, Bs Position
   bleibt als reservierte Lücke sichtbar. A muss eine eigene Karte wählen; sie
   wandert verdeckt genau in Bs Lücke. Vorher kann A keine gefährdende zweite
   Aktion beginnen.
10. **Reaktion während Einsicht** — `reaction-during-insight`; A zieht/legt die
    5 und öffnet „nah 1“. Während A die Ansicht offen hält, reagiert B mit
    einer beliebigen nicht gehaltenen Position (ein Fehlversuch ist erlaubt).
    Bs Nachziehstapel bleibt jedoch gesperrt, solange As Aktion offen ist.
    Erwartet: As Einsicht bleibt bestehen. Danach schließt A und B darf
    ziehen; A kann die bekannte eigene 5 noch abwerfen, falls B das Fenster
    nicht durch eine reguläre Ablage ersetzt hat.

## Zusätzliche Grenzfälle

1. **Zwei gleichzeitige Fehlversuche** — `reaction-two-wrong` laden. A und B
   zählen gemeinsam herunter und tippen gleichzeitig jeweils „nah 1“. Dort
   liegen bewusst eine 3 und eine 4 auf einer Referenz-9. Erwartet: Beide
   Befehle werden angenommen, beide Karten sind gleichzeitig öffentlich
   sichtbar, A und B erhalten jeweils genau eine Strafkarte und das Fenster
   bleibt offen. Dieser Fall wird zusätzlich mit zwei echten Socket-Clients
   automatisiert geprüft.
2. **Konkurrenz um einen Erfolg** — `reaction-own` laden. Bei A und B liegt auf
   „nah 1“ jeweils eine passende 5. Beide tippen nahezu gleichzeitig. Erwartet:
   Nur die zuerst beim Server verarbeitete 5 wird abgelegt und verbraucht das
   Fenster. Danach bleiben alle freien Karten weiterhin als Reaktionsversuch
   anwählbar. B tippt seine 5 auch erst nach der sichtbaren ersten Ablage: Sie
   bleibt an ihrer Position, wird als „zu spät“ kurz öffentlich gezeigt und B
   erhält genau eine Strafkarte. Der Fall wird zusätzlich mit zwei parallelen
   Socket-Clients und als bewusst nachgelagerte Befehlsfolge automatisiert
   geprüft.
3. **Bindungskonflikt** — `ability-black-king`; A wählt die erste Karte. B
   versucht genau diese Position als Reaktion und danach eine andere Position.
   Erwartet: gehaltenes Ziel neutral abgelehnt; die andere zulässige Aktion
   bleibt möglich. Der Königseffekt bleibt nach einer fremden erfolgreichen
   König-Reaktion ausführbar.
4. **Fensterlebensdauer und Zugsperre** — eine 5 direkt ablegen und die
   Einsicht offen lassen. Erwartet: B kann noch nicht ziehen. A schließt die
   Einsicht oder überspringt sie; danach darf B ziehen und das Fenster bleibt
   offen. Erst Bs reguläre Ablage ersetzt es durch eine neue ID und einen
   neuen Rang.
5. **Refresh** — während einer privaten Einsicht A neu laden. Erwartet: nur die
   aktuell offene Ansicht kehrt zurück. Nach Schließen und erneutem Refresh
   kehrt kein Wert zurück. Öffentliche Fehlaufdeckungen bilden keine Historie.
6. **Doppelklick** — eine Aktion rasch doppelt auslösen. Erwartet: dieselbe
   Befehls-ID wird serverseitig nur einmal angewandt; die UI sperrt zusätzlich
   während der Bestätigung. Die gespeicherte Idempotenz ist automatisiert
   geprüft.

## Konflikttabelle

| Aktueller Zustand                  | Konkurrierende Aktion                            | Ergebnis der zuerst gültig verarbeiteten Aktion                                                   |
| ---------------------------------- | ------------------------------------------------ | ------------------------------------------------------------------------------------------------- |
| Effekt noch ohne Ziel              | Reaktion bewegt Kandidat                         | Reaktion gewinnt; spätere Auswahl wird wegen Belegungsversion neutral abgelehnt, neues Ziel nötig |
| Ziel bereits gehalten              | Reaktion/Tausch/anderer Effekt auf dasselbe Ziel | neutral `CARD_HELD`; keine Strafe, Halter schließt Effekt ab                                      |
| Eigene Fähigkeit offen             | Effektinhaber startet Reaktion                   | nach D4/A gesperrt; andere Spieler dürfen mit freien Karten reagieren                             |
| Schwarzer König hält zwei Ziele    | fremde Reaktion mit anderer Karte                | Fenster kann verbraucht werden; König bleibt offen und wird danach entschieden                    |
| Fremde Reaktion erfolgreich        | Aktion des Reagierenden gefährdet Ausgleich      | gesperrt; reservierte Empfängerlücke und letzte Ausgleichskarte bleiben geschützt                 |
| Fremde Reaktion erfolgreich        | unbeteiligter Zug/Effekt                         | erlaubt, solange keine reservierte Position oder letzte notwendige Ausgleichskarte betroffen ist  |
| Erfolg, Fenster `consumed`         | weiterer Versuch vor regulärer Fensterersetzung  | Karte bleibt liegen, wird gezeigt und verursacht unabhängig vom Rang genau eine Strafe            |
| Fehlversuch gegen gültige Position | erneuter Versuch derselben sichtbaren Belegung   | neutral abgelehnt, keine zweite Strafkarte; andere Ziele und das Fenster bleiben verfügbar        |
| Null Karten, Pflicht offen         | roter König/Transfer/Effektabschluss             | neue Reaktionen gesperrt; Pflicht abschließen, danach Null-Karten-Zustand erneut prüfen           |
| Pflichtkarte nicht lieferbar       | Recycling ebenfalls unmöglich                    | D9: Runde ohne Wertung verwerfen und mit denselben Teilnehmern neu aufbauen                       |

## Noch nicht vollständig spielbar

M4 erkennt einen endgültig verbleibenden Null-Karten-Fall nur als
`awaiting-m5`. Kabu-Ansage, Schlusszüge, 6-Sekunden-Abschlussfrist des letzten
Kabu-Fensters, normale Rundenwertung, nächste Runde und Gesamtgewinner werden
erst in M5 implementiert. In M4 wird daher ausdrücklich keine Wertung
angezeigt oder gespeichert.
