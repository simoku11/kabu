# M9 vorgezogen – Kartenanimationen auf zwei Handys abnehmen

## 1. Schnellster Einstieg (ca. 5 Minuten)

1. Im Verzeichnis `Kabu-M1` starten:
   `docker compose up -d postgres`, danach `pnpm db:migrate` und
   `KABU_ENABLE_TEST_SCENARIOS=true VITE_KABU_TEST_SCENARIOS=true pnpm dev`.
2. Rechner und beide Handys müssen im selben WLAN sein. Den von Vite als
   `Network` ausgegebenen Ursprung (zum Beispiel
   `http://192.168.1.20:5173`) in `.env` zu `ALLOWED_ORIGINS` ergänzen und
   `pnpm dev` neu starten. Auf beiden Handys genau diese Adresse öffnen.
3. Handy A erstellt den Raum, Handy B tritt über Link oder Code bei. Beide
   werden bereit, A startet, beide schließen ihre private Startansicht.
4. A lädt unten im Entwicklungsbereich zuerst `reaction-foreign`. Dieses
   Szenario zeigt in wenigen Minuten Ziehen, Reaktion aus einem fremden Feld
   und Ausgleich, ohne auf Zufallskarten zu warten.

## 2. Szenarien

### 2.1 Ziehen und direkt ablegen

**Vorbereitung:** Beliebiges Fähigkeitsszenario laden, zum Beispiel
`ability-own-look`. Der aktive Spieler ist A.

1. A zieht vom Nachziehstapel.
   - **Handy A:** Kartenbewegung zum eigenen unteren Feld; der freigegebene
     Kartenwert erscheint in der gezogenen Karte. Hinweis „A zieht …“.
   - **Handy B:** verdeckte Kartenbewegung zum Feld von A; kein Wert im DOM,
     Hinweis oder Screenreader-Text. Kein automatisches Scrollen.
2. A tippt die Ablage.
   - **Handy A:** Bewegung der gezogenen Karte zur Ablage; dort ist der Wert
     öffentlich.
   - **Handy B:** Bewegung von As Feld zur Ablage; derselbe öffentliche Wert
     erscheint erst auf der Ablage.

### 2.2 Halten, private Einsicht und Schließen

**Vorbereitung:** `ability-own-look` oder `ability-opponent-look` laden, Karte
direkt ablegen, Aktivität starten und ein erlaubtes Ziel wählen.

1. A wählt die Zielkarte.
   - **Handy A:** Karte hebt sich an und zeigt nur A den Wert mit Countdown.
   - **Handy B:** dieselbe Position hebt sich mit öffentlicher Markierung an,
     bleibt aber eine Rückseite. Der Hinweis nennt A, nicht den Kartenwert.
2. A schließt die Ansicht.
   - **Beide Handys:** Karte senkt sich an derselben Position. Nur A hat den
     privaten Wert gesehen.

### 2.3 Normaler Tausch

**Vorbereitung:** Aktiver Spieler A zieht eine Karte und tippt dann eine eigene
Position.

- **Handy A:** Die gezogene Karte läuft verdeckt in das gewählte Feld; die alte
  Feldkarte läuft getrennt zur Ablage.
- **Handy B:** Dieselben beiden Wege sind an As relativem Sitz erkennbar. Nur
  der Wert der neuen Ablage ist öffentlich.

### 2.4 Fähigkeitstausch und Behalten

**Vorbereitung:** `ability-black-queen` für den blinden Tausch oder
`ability-black-king` für Ansehen/Entscheiden laden.

1. A wählt je eine Karte zweier Spieler und bestätigt bei schwarzem König
   „Tauschen“.
   - **Handy A:** Beide Karten wechseln sichtbar ihre Positionen; nur die beim
     schwarzen König erlaubte private Ansicht zeigt Werte.
   - **Handy B:** Zwei Rückseiten kreuzen zwischen den richtigen lokalen
     Spielerfeldern. Keine fremden Werte erscheinen.
2. Szenario zurücksetzen und beim schwarzen König „Behalten“ wählen.
   - **Beide Handys:** Karten senken sich, wechseln aber keinen Platz.

### 2.5 Fremde Reaktion und Ausgleich

**Vorbereitung:** `reaction-foreign` laden. Die Szenariobeschreibung nennt die
passende fremde Position für A.

1. A reagiert mit der passenden Karte aus Bs Feld.
   - **Handy A:** Karte läuft von Bs Feld zur Ablage. Hinweis „A reagiert auf
     Bs Karte“.
   - **Handy B:** Derselbe öffentliche Weg und Hinweis; der Reagierende und der
     Feldbesitzer sind eindeutig.
2. A wählt eine eigene Ausgleichskarte.
   - **Beide Handys:** Eine Rückseite läuft von As Feld genau in Bs geleerte
     Position. Kein Wert wird gezeigt.

### 2.6 Fehlversuch, Strafkarte und roter König

**Vorbereitung:** `reaction-wrong`, danach separat `ability-red-king` laden.

1. A tippt die im Szenario markierte falsche Karte.
   - **Beide Handys:** Die vorhandene öffentliche Fehlaufdeckung zeigt kurz den
     Wert. Danach bewegt sich eine Rückseite vom Nachziehstapel zu A; der
     Hinweis nennt A als Strafkartenempfänger.
2. Im roten-König-Szenario wählt A den Empfänger B.
   - **Beide Handys:** Eine Rückseite bewegt sich vom Nachziehstapel zu Bs
     Spielerfeld; kein Wert wird eingeblendet.

## 3. Frist, Reconnect und reduzierte Bewegung

1. In `reaction-own` eine Reaktion antippen, während noch eine andere Bewegung
   läuft. Die Auswahl muss sofort reagieren; Animationen dürfen keine Klicks
   abfangen und keine Serverfrist verändern.
2. Während einer offenen Aktion auf Handy B 5–10 Sekunden Flugmodus aktivieren
   und danach zurückkehren. Der aktuelle Snapshot muss ohne Nachholbewegungen
   erscheinen; es darf keine Aktion doppelt laufen. Danach einmal regulär
   weiterspielen.
3. Auf einem Handy in den Betriebssystem-/Browser-Einstellungen „Bewegung
   reduzieren“ aktivieren und Seite neu laden. Statt längerer Wege erscheinen
   kurze Hervorhebungen und derselbe öffentliche Aktionshinweis.

## 4. Kleines Hochformat mit zwei und sechs Spielern

1. Zwei Spieler auf etwa 360 × 640 CSS-Pixeln prüfen: eigene Karten bleiben
   unten, Ablage und Nachziehstapel erreichbar, Hinweise verdecken keine
   Auswahl dauerhaft.
2. Mit sechs Spielern (oder sechs getrennten Sitzungen) eine Zieh-, Tausch- und
   Reaktionsaktion ausführen. Auf jedem Gerät muss dieselbe betroffene Karte am
   relativ richtigen Spielerfeld ankommen. Liegt Start oder Ziel außerhalb des
   sichtbaren Bereichs, darf die Seite nicht scrollen; stattdessen muss das
   sichtbare Ziel beziehungsweise Spielerfeld kurz hervorgehoben werden.

Notiere pro Fehler Raumcode, Gerät/Browser, Szenario, handelnden Spieler,
erwartete und tatsächliche Bewegung. Keine Cookies, privaten Kartenwerte oder
Deckinformationen mitsenden.
