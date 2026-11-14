# M8 – nummerierte Abnahme der privaten Beta

Echte Handys wurden im automatisierten M8-Lauf nicht ersetzt. Die Pflichtabnahme
unten ist deshalb noch von mehreren Menschen auf realen Geräten durchzuführen.

## 1. Start, Handyzugang und Szenarien

1. Im Verzeichnis `Kabu-M1` ausführen:
   `docker compose up -d postgres`, `pnpm db:migrate` und danach mit aktivierten
   Testfällen
   `KABU_ENABLE_TEST_SCENARIOS=true VITE_KABU_TEST_SCENARIOS=true pnpm dev`.
2. Rechner und Handys in dasselbe WLAN bringen. Den von Vite hinter `Network`
   angezeigten Ursprung zusätzlich in `.env` unter `ALLOWED_ORIGINS` eintragen,
   etwa `http://192.168.1.20:5173`, und `pnpm dev` neu starten. Genau diese
   Adresse auf jedem Handy öffnen.
3. Ein Szenario lädt der Host nach Partiestart über den sichtbaren
   Szenario-Lader. Erneutes Laden desselben Szenarios stellt dessen definierte
   Ausgangslage wieder her. Für einen vollständig frischen Raum einen neuen
   Raum anlegen. Nur wenn alle lokalen Entwicklungsdaten bewusst verworfen
   werden sollen: Container stoppen und das Volume mit
   `docker compose down -v` löschen, danach Schritt 1 wiederholen.

## 2. Kurze Pflichtabnahme

### 2.1 Echte Mehrpersonenpartie

**Ausgangslage:** Mindestens drei Menschen mit je einem echten Handy; wenn
möglich sechs Personen. Ein neuer Raum ohne Testszenario.

1. Spieler A erstellt, alle anderen treten per Link oder Code bei.
2. Alle werden bereit, A startet, jeder schließt die eigene Startansicht.
3. Mindestens zwei vollständige Tischrunden regulär spielen und Fähigkeiten,
   Reaktionen und Kabu benutzen.

**Erwartet auf allen Geräten:** feste Sitze und identischer öffentlicher Tisch;
nur eigene erlaubte Kartenwerte; keine fremde Steuerung; eine gesendete Aktion
zeigt „wartet auf Bestätigung“ und danach ein eindeutiges Ergebnis.

### 2.2 Zwei nahezu gleichzeitige gültige Reaktionen

**Ausgangslage:** Mindestens A und B, Szenario `reaction-own` laden. Beide
kennen je eine passende Karte; der Host bestätigt die genaue Position aus der
Szenariobeschreibung.

1. A zählt „3–2–1“; A und B tippen nahezu gleichzeitig ihre gültige Karte.
2. Beide beobachten Tisch und Rückmeldung, ohne erneut zu tippen.

**Erwartet:** Genau eine Karte wird erfolgreich abgeworfen. Die beim Server
später verarbeitete gültige Aktion wird als „zu spät“ gezeigt und erzeugt nach
der beschlossenen V1-Regel genau eine Strafkarte. Die automatisierte Prüfung
belegt die eindeutige Serverreihenfolge; hier werden auf den Handys gefühlte
Fairness und Verständlichkeit beurteilt. Ein veraltetes oder bereits ersetztes
Fenster wäre dagegen neutral und ohne Strafkarte.

### 2.3 Schnelle falsche Versuche gegen ein veraltetes Ziel

**Ausgangslage:** `reaction-two-wrong` laden. Je Spieler die markierte falsche
Position verwenden.

1. A und B tippen ihre falschen Karten schnell nacheinander im selben offenen
   Fenster; danach mit weiteren unterschiedlichen, nicht gerade aufgedeckten
   Positionen wiederholen.
2. Anzahl eigener Karten vor und nach jedem bestätigten Versuch zählen.
3. Szenario neu laden. A merkt sich Fenster und Position, B führt zuerst einen
   gültigen zustandsändernden Versuch aus; A versucht anschließend den nun
   veralteten Stand.

**Erwartet:** Jeder regelkonform begonnene falsche Versuch zeigt „falsche Karte
– Strafkarte erhalten“ und fügt genau eine verdeckte Karte hinzu. Technische
Drosselung würde ausdrücklich „Keine Spielstrafe“ melden. Der Versuch mit
veraltetem Fenster/Ziel meldet „zu spät“ beziehungsweise „Zielkarte inzwischen
verändert“ und fügt keine Strafkarte hinzu.

### 2.4 Kurze Netzunterbrechung und Wiederaufnahme

**Ausgangslage:** Laufende Partie, A hat eine Karte gezogen oder
`reaction-foreign` besitzt einen offenen Ausgleich.

1. B aktiviert für 5–10 Sekunden den Flugmodus. A versucht während der Pause
   keine erzwungene Browseraktualisierung.
2. B deaktiviert den Flugmodus und wartet auf Synchronisation.
3. Die offene Aktion genau einmal abschließen und auf beiden Geräten Kartenzahl,
   Zug, Ablage und Punktestand vergleichen.

**Erwartet:** Während der Unterbrechung pausiert die Partie. Danach ist der
Tisch konsistent, die offene Aktion besteht weiter und keine Aktion/Karte ist
doppelt. Alle können ohne Hilfe weiterspielen.

## 3. Optionale Grenzfälle

1. Voll besetzten Sechsertisch mindestens eine Runde spielen; Lesbarkeit und
   erreichbare Touchziele protokollieren.
2. `ability-black-king`, private Einsicht und `reaction-foreign` jeweils mitten
   in Auswahl/Transfer unterbrechen und nach Rückkehr einmal abschließen.
3. Zwei Tabs desselben Spielers öffnen und prüfen, dass nur die ausdrücklich
   übernommene Steuerung Befehle senden kann.
4. Eine Nachricht mit absichtlich falschem Raumcode zehnmal versuchen: danach
   folgt HTTP 429 ohne Hinweis, ob ein geratener anderer Raum existiert.
5. Den Server nach gespeichertem Befehl vor sichtbarer Bestätigung stoppen und
   mit erhaltener Datenbank neu starten; der Befehlsstatus darf keine zweite
   Ausführung ergeben.

## 4. Drei Abschlussfragen

1. War klar, warum eine Reaktion scheiterte?
2. Fühlte sich der Ablauf bei fast gleichzeitigen Aktionen fair an?
3. Konnten wir nach der Unterbrechung ohne Hilfe weiterspielen?

Gerät, Browser/Version, ungefähre Uhrzeit und Antwort je Person notieren.

## 5. Fehler melden

Bitte nur Raumcode, sichtbare Befehlsreferenz (falls vorhanden), ungefähre
lokale Uhrzeit, Gerät/Browser, Schritte, erwartetes und tatsächliches Verhalten
angeben. Screenshots vorher auf private Karten prüfen. Niemals Cookie,
Wiederbeitrittsnachweis, Einladung aus einer nicht freigegebenen Nachricht,
Deckreihenfolge oder private Kartenwerte mitsenden. Eine neutrale Vorlage:

> Raum ABC234, gegen 20:15 Europe/Berlin, iPhone/Safari …; nach Schritt …
> erwartete ich …, sichtbar war …; Befehlsreferenz …
