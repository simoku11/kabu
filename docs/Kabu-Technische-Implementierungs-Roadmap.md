# Kabu – technische Implementierungs-Roadmap

**Planungsstand: 10. September 2026 · Ziel: mobile Webapp für 2–6 Spieler · Umsetzung: Codex in VS Code**

Diese Roadmap legt die technische Richtung fest und zerlegt die Arbeit in einzeln abnehmbare Schritte. Sie enthält keinen Implementierungscode. Technische Ausgestaltung, Bibliothekskonfiguration, Datenbankmigrationen und Fehlerbehebung übernimmt Codex. Du entscheidest über Spielverhalten, Bedienung, Gestaltung und Betriebsbudget.

Grundlage ist die beigefügte Datei **„Kabu – Regelwerk V1.0.txt“**, Abschnitte 1–31, sowie der verfügbare Projektkontext: Online-Spiel im Handy-Browser; zuerst Zustände, Aktionen, Server-Events und erlaubte Übergänge definieren; das Reaktionsfenster als eigenen serverseitigen Zustand behandeln. Bei Abweichungen von verkürzten früheren Aussagen gilt das vollständige Regelwerk: Auch in der Kabu-Schlussphase werden ausgelöste Pflichtaktionen vor dem endgültigen Rundenende abgewickelt.

## 1. Zielumfang und Verantwortlichkeiten

Die erste veröffentlichbare Version ermöglicht private Partien mit 2–6 Menschen: Raum erstellen, per Link oder Code beitreten, Namen wählen, mehrere Runden spielen, Gesamtwertung sehen und nach einer kurzen Unterbrechung zurückkehren. Die Spieloberfläche wird zuerst funktional und auf echten Handys erprobt. Das endgültige visuelle Design folgt nach der Stabilisierung des Spiels.

**Vorgeschlagene Umfangsgrenze, von dir in M0 zu bestätigen:** Gastzugang ohne Konto, private Räume, feste Teilnehmer während einer Partie, keine Zuschauer, keine Bots, kein öffentliches Matchmaking, kein Chat, keine Rangliste und keine Offline-Partien. Installation als PWA kann später hinzukommen. Einladungen und Reconnect gehören bereits zur ersten Version.

| Verantwortung | Wer entscheidet? |
|---|---|
| Spielregellücken, gewünschtes Spieltempo, Verhalten bei Abbruch | Du, anhand konkreter Vorschläge und Spielszenarien |
| Informationsarchitektur, Touch-Bedienung, visuelle Richtung | Du; Codex erstellt prüfbare Varianten |
| Frameworks, Zustandsverwaltung, Protokoll, Tests, Datenmodell | Codex auf Basis dieser Architektur |
| Technische Detailkorrekturen innerhalb der Architektur | Codex selbstständig, mit kurzer Dokumentation |
| Kosten verursachende Einrichtung, Domain und Produktionsfreigabe | Du vor der jeweiligen Einrichtung bzw. Veröffentlichung |

**Kennzeichnung:** „ENTSCHEIDUNG D…“ bezeichnet eine wichtige Produktentscheidung vor dem angegebenen Meilenstein. Alle Empfehlungen dazu sind Vorschläge, keine bereits beschlossenen Änderungen an V1.0. Codex darf offene Spielregeln nicht stillschweigend festlegen. Unabhängige technische Vorarbeiten können weiterlaufen.

## 2. Empfohlene Gesamtarchitektur

Ein TypeScript-Projekt enthält Browser-App, Spielserver, gemeinsame Nachrichtenverträge und einen getrennten Regelkern. Ein zentraler Server entscheidet alle Spielaktionen. Der Browser zeigt ausschließlich die für seinen Spieler erlaubte Sicht und sendet Handlungswünsche.

| Baustein | Festlegung für V1 | Zweck |
|---|---|---|
| Frontend | React, TypeScript, Vite; responsive CSS | Mobile Oberfläche, klar abgrenzbare Komponenten, schneller Entwicklungsablauf |
| Backend | Node.js in einer bei Projektstart unterstützten LTS-Version, TypeScript, Fastify | Dauerhaft laufender HTTP- und Spielserver |
| Echtzeit | Socket.IO über verschlüsselte Verbindung | Befehle, Bestätigungen, Zustandsupdates, Verbindungsstatus |
| Regelkern | Reines TypeScript-Modul ohne React, Netzwerk oder Datenbank | Deterministische, isoliert prüfbare Spiellogik |
| Vertragsprüfung | Gemeinsame Nachrichtentypen und Laufzeitvalidierung mit Zod | Browser und Server sprechen dasselbe Protokoll; fremde Eingaben bleiben untrusted |
| Speicherung | PostgreSQL; Migrationen über Drizzle | Partien, Sitzungen, Rundenergebnisse, Zustandsversionen und Wiederherstellung |
| Tests | Vitest, fast-check, Socket-Integrationstests, Playwright | Regeln, zufällige Aktionsfolgen, Netzwerkfälle und Bedienabläufe |
| Projektorganisation | pnpm-Workspace, ein Git-Repository | Gemeinsame Typen und nachvollziehbare Änderungen |
| Betrieb | Ein dauerhaft laufender Container plus verwaltetes PostgreSQL in derselben Region | Einfacher Betrieb mit persistenter Wiederherstellung |
| Auslieferung | Der Server liefert zunächst auch die gebaute Browser-App aus | Eine Domain, einfache Sitzungs- und Verbindungskonfiguration |

Vite unterstützt den geplanten Entwicklungs- und Produktionsbuild; die konkrete kompatible Versionskombination wird in M1 festgehalten und per Lockfile fixiert. [Vite-Dokumentation](https://vite.dev/guide/)

**Serverprinzip:** Jeder Raum hat genau einen zuständigen Ausführer mit einer seriellen Eingangsqueue. Verschiedene Räume können unabhängig arbeiten. In einem Raum wird nie gleichzeitig an zwei widersprüchlichen Zustandsänderungen gearbeitet. Warten auf eine menschliche Auswahl blockiert den Prozess nicht: Die offene Auswahl wird als Zustand gespeichert, und weitere erlaubte Befehle können eintreffen.

**Speicherprinzip:** Für jede akzeptierte Zustandsänderung werden neue Zustandsversion, relevante Events und das Ergebnis der Befehls-ID gemeinsam in einer Datenbanktransaktion gespeichert. Erst danach erfolgen Bestätigung und Versand. Ein Absturz nach dem Speichern und vor der Bestätigung führt beim erneuten Senden nicht zur zweiten Ausführung. Scheitert das Speichern, gilt der Befehl nicht als akzeptiert. Der vorläufig berechnete In-Memory-Zustand wird dann verworfen.

Für V1 genügt ein aktueller vollständiger Server-Snapshot je Partie plus ein begrenztes, zugriffsgeschütztes Event-/Befehlsjournal. Das Journal hilft bei Diagnose und Wiederzustellung; die Wiederherstellung muss nicht von einem vollständigen Replay aller historischen Events abhängen. Datenformat- und Regelversion gehören zum Snapshot.

**Skalierung:** Zunächst eine aktive Serverinstanz, keine Microservices und kein Redis. Auch während eines Deployments darf eine Partie nur einen schreibenden Besitzer haben; ein Datenbank-Lease mit Besitzer-Epoche schützt vor überlappenden Prozessen. Erst bei gemessenen Kapazitätsproblemen folgt eine Verteilung ganzer Räume auf mehrere Server. Ein bloßer Nachrichtenadapter ersetzt diese Zuständigkeit nicht.

**Hostingempfehlung:** Ein dauerhaft laufender Render-Web-Service und verwaltetes PostgreSQL in einer passenden gemeinsamen Region sind ein konkreter Startpunkt. Render dokumentiert WebSocket-Unterstützung; Tarife, Region, Backups und Limits prüft Codex vor Einrichtung erneut und legt dir eine Kostenübersicht vor. Die App wird containerisiert, damit ein Anbieterwechsel möglich bleibt. [Render: WebSockets](https://render.com/docs/websocket)

Socket.IO garantiert die Reihenfolge gelieferter Nachrichten innerhalb einer Verbindung, aber standardmäßig keine zuverlässige Wiederzustellung. Deshalb sind unsere Befehls-IDs, Bestätigungen, gespeicherten Ergebnisse und der Snapshot-Abgleich Bestandteil der Anwendung. Die Reihenfolge zwischen mehreren Spielern legt der Raumserver selbst fest. [Socket.IO: Delivery guarantees](https://socket.io/docs/v4/delivery-guarantees/)

## 3. Fachliches Zustands-, Aktions- und Event-Modell

### 3.1 Mehrere gleichzeitig gültige Zustände

Eine einzige Liste „Spieler zieht → Fähigkeit → Reaktion → nächster Zug“ wäre falsch. Das Reaktionsfenster bleibt während einer Fähigkeit und während des nächsten Ziehens offen. Daher werden folgende Ebenen getrennt modelliert:

| Ebene | Zentrale Zustände / Daten |
|---|---|
| Raum | Lobby, laufende Partie, abgeschlossene Partie, geschlossen; Host, Teilnehmer, Einstellungen |
| Partie | Partien-ID, Regelversion, Rundenzahl, aktuelle Runde, Gesamtpunkte |
| Runde | Aufbau, initiales Ansehen, aktiv, vorläufiges Ende, Abrechnung, beendet |
| Regulärer Zug | Zugbeginn, gezogene Karte wartet auf Entscheidung, Fähigkeit wartet auf Auswahl, Zug abgeschlossen; Spieler-ID und Zug-ID |
| Schlussphase | Nicht ausgerufen oder Kabu-Ansager plus explizite Liste noch ausstehender letzter Züge |
| Reaktionsfenster | Nicht vorhanden, offen, verbraucht, ersetzt oder geschlossen; eindeutige Fenster-ID, Referenzablage, Rang |
| Ausstehende Aktionen | Effekt-ID, Ursprung, handelnder Spieler, benötigte Auswahl, Ziele, ggf. Kartenreservierung und Pflichtstatus |
| Spieler | Stabile Spieler-ID, Sitzplatz, Kartenpositionen, Punkte, Bereitschaft; getrennt davon online/offline und Sitzungsbindung |
| Karten | Nur serverintern: Kartenidentität, Rang, Farbe, Aufenthaltsort; öffentlich: Positionen und zulässige Sichtbarkeit |
| Betrieb | Laufend, wegen Verbindung pausiert, wiederherzustellen oder abgebrochen; unabhängig vom fachlichen Rundenstatus |

Die Schlussphase ist keine alternative Runde: Kabu, offenes Reaktionsfenster und ausstehende Fähigkeit können gleichzeitig bestehen. Verbindungsstatus ist keine Spieleridentität; eine neue Socket-ID erzeugt keinen neuen Spieler.

### 3.2 Kartenpositionen und Informationsschutz

Jede Karte befindet sich serverseitig genau an einem Ort: Nachziehstapel, Ablagestapel, Spielerposition oder gezogene Karte des aktiven Spielers. Ein Transfer darf keine Kopie erzeugen. Kartenpositionen haben stabile IDs; entfernte Karten hinterlassen zunächst Lücken. Keine automatische Verdichtung des Feldes.

Der Client erhält keine vollständigen Kartenobjekte mit versteckten Werten. Er erhält nur freigegebene Ansichten: verdeckte Positionen, oberste Ablage, öffentliche Statusdaten und ausdrücklich erlaubte eigene Informationen. Interne Karten-IDs werden nicht als dauerhaft verfolgbare Kennzeichen an Clients gegeben. Eine Positionsbelegung erhält eine opaque Versionskennung, um veraltete Klicks zu erkennen; diese verrät keine Kartenidentität.

Gezogene Karten sieht nur der aktive Spieler. Karten aus Strafaktionen und rotem König werden auch dem Empfänger verdeckt übermittelt. Private Ansichten von Fähigkeiten sind zeitlich bzw. durch Bestätigung begrenzt; danach verbleibt kein nachschlagbares Kartenwissen in der Oberfläche. Der Server unterscheidet eine noch gültige Einsicht von bereits abgeschlossener historischer Information. Reconnect darf keinen neuen Blick auf alte Karten schenken. Bereits gesehene Informationen kann eine Webapp technisch nicht aus dem Gedächtnis oder einem manipulierten Client entfernen; der Schutz besteht darin, vorher unbekannte Informationen gar nicht erst auszuliefern.

### 3.3 Befehle und Events

Ein **Befehl** ist eine Bitte des Clients. Ein **Event** beschreibt ein vom Server akzeptiertes Ergebnis. Die Identität wird aus der authentifizierten Sitzung bestimmt, niemals aus einer frei behaupteten Spieler-ID.

| Bereich | Beispielbefehle | Ergebnis-Events bzw. Antworten |
|---|---|---|
| Lobby | Raum erstellen / beitreten, Bereitschaft ändern, Partie starten | Teilnehmer geändert, Einstellungen bestätigt, Partie gestartet |
| Rundenbeginn | Startkarte ansehen, Ansicht schließen, bereit melden | Private Kartenansicht, Startansicht beendet, Runde freigegeben |
| Zug | Ziehen, gezogene Karte ablegen, mit Position tauschen | Karte privat gezogen, regulär abgelegt, Position ersetzt, Zug fortgeschaltet |
| Fähigkeit | Ziel wählen, Ansicht schließen, Tauschen/Behalten wählen | Effekt gestartet, private Einsicht, Karten getauscht, Effekt beendet |
| Reaktion | Eigene/fremde Position für Fenster wählen, Ausgleichskarte wählen | Reaktion fehlgeschlagen, öffentliche Aufdeckung, Strafkarte hinzugefügt, Erfolg, Transfer ausstehend/erledigt |
| Rundenende | Kabu ansagen, nächste Runde bestätigen | Schlussphase gestartet, vorläufiges Ende, Ende aufgehoben, Runde gewertet, Partie beendet |
| Verbindung | Sitzung wiederaufnehmen, Snapshot anfordern, Befehlsstatus abfragen | Verbindung wiederhergestellt, personalisierter Snapshot, Befehlsbestätigung oder Ablehnung |

Jeder Spielbefehl trägt eine eindeutige Befehls-ID, Partien-/Rundenbezug und passende Kontext-IDs: Zug, Effekt oder Reaktionsfenster sowie Zielposition und Belegungsversion. Jeder bestätigte Zustandswechsel erhält eine monotone Raumsequenz. Eine zufällig zwischenzeitlich erhöhte Gesamtversion allein soll einen ansonsten gültigen Reaktionsversuch nicht verwerfen; entscheidend sind Fenster und konkrete Zielgültigkeit.

Gleiche Befehls-ID mit gleicher Nutzlast liefert dasselbe Ergebnis. Gleiche ID mit anderer Nutzlast wird abgelehnt. Eine Nachricht für ein altes Fenster oder eine inzwischen veränderte Position wird als veraltet abgelehnt und löst keine Spielstrafe aus. Nur ein regelgültig gestarteter Versuch mit tatsächlich falschem Rang erzeugt eine Strafkarte. Ablehnungen verraten keine geheimen Kartenwerte.

Interne Events können geheime Daten enthalten und verbleiben auf dem Server. Öffentliche und private Netzwerk-Events entstehen über getrennte Projektionen mit Empfängerprüfung. Betriebslogs enthalten keine Tokens, Deckreihenfolgen oder privaten Kartenwerte.

### 3.4 Reaktionssystem und Gleichzeitigkeit

1. Eine reguläre Ablage – direkt oder aus einem Tausch – ersetzt das vorige Fenster durch eine neue Fenster-ID mit dem Rang dieser Ablage.
2. Eine erfolgreiche Reaktionsablage verbraucht genau dieses Fenster und öffnet kein neues. Die oberste Ablage kann wechseln, ohne dass ein neues Fenster entsteht. `Verbraucht` sperrt weitere Versuche bis zur nächsten regulären Ablage nicht: Jede weitere Karte gegen dieselbe ID bleibt liegen, wird kurz gezeigt und mit genau einer Strafkarte belegt; ersetzte Fenster bleiben neutral.
3. Fehlversuche zeigen die gewählte Karte öffentlich, legen sie wieder verdeckt zurück und geben dem Verursacher eine Strafkarte. Das Fenster bleibt offen.
4. Der Raumserver verarbeitet Anfragen in seiner Eingangsreihenfolge. Der erste im aktuellen Zustand gültige Erfolg gewinnt. Client-Uhrzeiten entscheiden nicht. Netzlatenz kann nicht vollständig ausgeglichen werden; die UI kommuniziert „zuerst beim Server gültig eingegangen“. Keine zusätzlichen Fairnesswartezeiten in V1.
5. Ein laufender Effekt bleibt unabhängig vom Erfolg einer Reaktion bestehen. Eine durch eine 5 gewonnene Einsicht kann sofort für eine Reaktion genutzt werden.
6. Die fremde Reaktion erzeugt bei Erfolg eine Pflicht zum verdeckten Ausgleichstransfer. Der Erfolg reserviert das Fenster sofort; der Transfer ist eine mehrstufige Aktion. Der Gegner wird wegen seines nur vorübergehend leeren Feldes dabei nicht fälschlich zum Rundensieger.
7. Nach einem fachlich relevanten 0-Karten-Zustand werden keine neuen Reaktionen angenommen. Nur bereits angelegte Pflichtaktionen werden abgeschlossen; anschließend wird erneut geprüft. Ein roter König kann das vorläufige Ende aufheben.
8. Treffen reguläre Ablage, Reaktion und Effektwahl eng zusammen, entscheidet dieselbe Serverqueue. Kein Event darf einen Zustand halb ändern und nebenläufig von einer zweiten Aktion überschrieben werden.

Die Konfliktpolitik für bereits gewählte Effektkarten und offene Transfers wird vor M4 gemäß D4/D5 beschlossen. Reserviert werden nur konkret festgelegte Karten, keine ganzen Spielerfelder. Unbeteiligte zulässige Aktionen bleiben möglich.

## 4. Produktentscheidungen vor der betroffenen Umsetzung

Diese Punkte verhindern spätere verdeckte Regeländerungen. Codex bereitet in M0 pro Punkt ein kurzes Beispielszenario vor; du musst keine technischen Lösungswege auswählen.

| ID / späteste Entscheidung | Offene Frage | Empfohlener Ausgangspunkt |
|---|---|---|
| **D1 · vor M2** | Erste Version: Gastzugang, private Räume, feste Teilnehmer und Rundenzahl? | Umfang wie Abschnitt 1; Host legt vor Start die Anzahl Runden fest, Standard 10. Keine neuen Spieler in laufender Partie. |
| **D2 · vor M3** | Wer beginnt; existiert anfangs eine Ablage; wie lange sieht man die zwei Startkarten; sind „darf“-Fähigkeiten verzichtbar? | Startspieler zuerst zufällig, danach pro Runde rotierend. Ablage startet leer. Genau zwei verschiedene frei gewählte Startpositionen, nach Schließen kein erneutes Öffnen. Kein allgemeiner Countdown. Ansehfähigkeiten können aktiv übersprungen werden. |
| **D3 · vor M5** | Was bedeutet eine 2 in der Kabu-Schlussphase, und kann erneut Kabu gesagt werden? | Ein ausgesetzter Schlusszug zählt als verbraucht. Kein zweites Kabu. Das konkretisiert „jeder andere noch genau einmal“ und muss ausdrücklich bestätigt werden. |
| **D4 · vor M4** | Was geschieht, wenn eine Reaktion ein Ziel einer noch offenen Fähigkeit entfernt; darf man bereits ausgewählte Karten noch abwerfen? | Noch nicht festgelegte Ziele werden bei Auswahl neu geprüft. Beim schwarzen König werden beide Karten nach gültiger gemeinsamer Auswahl bis Tauschen/Behalten reserviert. Vorher entfernte Ziele erfordern neue Auswahl. Gibt es keine zwei unterschiedlichen Besitzer mit Karten mehr, endet der Effekt ohne Tausch. Reservierte Karten kurz sichtbar als gebunden markieren. |
| **D5 · vor M4** | Wie funktioniert der Ausgleich bei fremder Reaktion, einschließlich fremder letzter Karte und eigener letzter Karte? | Abwurf und spätere Übertragung als zusammengehörige Pflichtaktion behandeln. Empfängerposition für den Ersatz reservieren; dort Ausgleichskarte einsetzen. Währenddessen keine zweite Aktion desselben Reagierenden, die seine nötige Ausgleichskarte entziehen könnte; andere Effekte dürfen deren Existenz nicht zerstören. Erst der vollständige Transfer entscheidet über 0 Karten. |
| **D6 · vor M5** | Was passiert mit einer bereits gezogenen, noch nicht abgelegten Karte, wenn jemand auf die vorherige Ablage mit seiner letzten Karte reagiert? | Den normalen Zug nicht neu fortsetzen. Die gezogene Karte kommt offen auf die Ablage, ohne Fähigkeit oder neues Reaktionsfenster. Das ist eine vorgeschlagene Sonderregel für den Abbruch eines offenen Zugs und gehört erst nach deiner Freigabe ins digitale Regelwerk. |
| **D7 · vor M5** | Wann endet das letzte Reaktionsfenster nach dem letzten Kabu-Schlusszug, wenn keine nächste reguläre Ablage mehr kommt? | Nach Abschluss des letzten Zugs und aller Pflichtaktionen beendet der Server die Runde; bereits vorher eingegangene Anfragen werden in Queue-Reihenfolge verarbeitet. Kein zusätzliches zeitliches Fenster. Dadurch kann die letzte Ablage nur während noch offener Zug-/Pflichtaktionen beantwortet werden. Falls du eine garantierte Reaktionschance willst, braucht es stattdessen eine explizite Abschlussfrist. |
| **D8 · vor M3/M4** | Wo liegen zusätzliche Karten und bleiben leere Plätze bestehen? | Bestehende Positionen nie verdichten; neue Karten füllen freie Plätze in fester Reihenfolge, dann Erweiterung um Spalten. Beim Ausgleichstransfer die gerade geleerte Empfängerposition nutzen. |
| **D9 · vor M4** | Was passiert, wenn weder Nachziehstapel noch recycelbarer Ablagestapel eine Pflichtkarte liefern? | Seltene, aber erreichbare Lage durch viele Strafkarten: Runde als technisch definierte Sonderregel ohne Wertung abbrechen und mit denselben Teilnehmern wiederholen. Keine zusätzliche Karte erfinden und keine Strafe still erlassen. |
| **D10 · vor M7** | Wie lange warten wir bei Verbindungsverlust; was passiert bei dauerhaftem Verlassen? | Nach serverseitig erkanntem Verlust Raum pausieren, neue Aktionen sperren, 90 Sekunden Wiederbeitritt ermöglichen; danach verbleibenden Spielern Warten oder Partie abbrechen anbieten. Keine automatische Niederlage, kein Bot und kein Entfernen mit laufender Neuberechnung. Ein Abbruch erzeugt keinen regulären Sieger. Pausemissbrauch ist für private V1 akzeptierter Nachteil. |
| **D11 · in M4 konkretisiert** | Wie lange sind Einsichten/öffentliche Fehlversuche sichtbar und was gilt nach Reconnect? | Private Einsicht bis zum bewussten Schließen, höchstens 10 Sekunden; Reaktion bleibt währenddessen erreichbar. Beim schwarzen König bedeutet Ablauf „Behalten“. Öffentliche Fehlaufdeckung kurz und einheitlich sichtbar, Dauer im Handytest bestimmen; dieselbe sichtbare Belegung ist ohne weitere Strafe als Reaktionsziel gesperrt. Keine Historie mit Kartenwerten. Reconnect stellt nur eine noch offene berechtigte Ansicht mit Restzeit wieder her, niemals eine abgeschlossene. |
| **D12 · vor M9** | Betriebsbudget, Region, Support und Aufbewahrungszeit? | EU-Region, falls Spielgruppe überwiegend dort; feste monatliche Kostenobergrenze von dir. Aktive Zustände bis Partienende bzw. Ablauf; Diagnosejournal zunächst höchstens 7 Tage. Keine dauerhaften persönlichen Profile in V1. |
| **D13 · vor M10** | Visuelle Richtung, Ton, Bewegung, PWA? | Erst zwei Gestaltungsrichtungen anhand desselben Spielbildschirms prüfen. Sound standardmäßig aus, reduzierte Bewegung unterstützen. PWA optional nach stabiler Browser-Version. |

**Zusätzliche Klarstellung für D4–D6:** Codex erstellt eine Konflikttabelle für jede offene Auswahl und jede gleichzeitig mögliche Aktion. Sie muss zeigen, welche Aktion gewinnt, wann neu gewählt wird und was beim vorläufigen Ende noch abgewickelt wird. Eine Regel wie „einfach alles während Fähigkeiten sperren“ wäre mit V1.0 unvereinbar.

## 5. Meilensteine und umsetzbare Arbeitsschritte

Die Reihenfolge ist bewusst: fachlicher Vertrag → technische Basis → dünner Online-Durchstich → vollständige Regeln → Bedienung und Robustheit → Veröffentlichung → Gestaltung. Tests beginnen mit dem ersten Regelbaustein und werden nicht bis zum Ende aufgeschoben.

### M0 – Digitalen Regelvertrag und Abnahmekriterien festhalten

**Ziel:** V1.0 wird eindeutig ausführbar, ohne unbemerkte Regeländerungen.

**Codex setzt um:**

1. Originalregelwerk unverändert im Repository als Quelle ablegen; digitale Ergänzungen getrennt führen.
2. Die 31 Regelabschnitte auf Zustände, Befehle und geplante Tests abbilden.
3. Entscheidungen D1–D13 mit Status, Vorschlag und Beispiel erfassen; D2–D9 zuerst klären.
4. Übergangstabelle einschließlich Vorbedingungen, Sichtbarkeit und Ablehnungen erstellen.
5. Konflikttabelle und Liste von Sicherheitsinvarianten ausarbeiten; daraus kleine Tickets für M1–M5 bilden.

**Zu testen/prüfen:** Fachliche Walkthroughs für 2 und 6 Spieler: 5 ansehen und reagieren; fremde letzte Karte; roter König hebt Ende auf; Kabu-Gleichstand; letzte 2; letzte Ablage; Stapelerschöpfung. Jeder Fall erhält ein erwartetes Ergebnis.

**Du prüfst/entscheidest:** Die vorgeschlagenen digitalen Ergänzungen. Du bekommst Spielsituationen in Alltagssprache, keine Framework-Fragen.

**Fertig, wenn:** Jeder Regelabschnitt zugeordnet ist und für den jeweils nächsten Implementierungsschritt keine relevante Regelentscheidung offenbleibt. Noch keine App-Implementierung in diesem Planungsauftrag.

### M1 – Repository, Entwicklungsumgebung und Testbasis

**Ziel:** Codex kann Änderungen zuverlässig bauen, prüfen und getrennt von Produktivdaten ausführen.

**Codex setzt um:**

1. Workspace mit `apps/web`, `apps/server`, `packages/game-core`, `packages/protocol` und `docs` anlegen.
2. Strenge TypeScript-Prüfung, Formatierung, Linting, Testbefehle und Lockfile einrichten.
3. Minimale Browserseite und Server-Healthcheck verbinden.
4. Lokale PostgreSQL-Umgebung, Migrationen und Beispielkonfiguration ohne Geheimnisse vorbereiten.
5. CI für Installation, Typprüfung, Tests und Produktionsbuild einrichten; Startanleitung dokumentieren.

**Zu testen:** Frischer Checkout lässt sich nach dokumentierten Schritten starten; Browser erreicht Server; Datenbankmigration läuft; CI erkennt absichtlich fehlerhafte Typen/Tests.

**Du prüfst/entscheidest:** Die lokale App lässt sich über den dokumentierten Ablauf öffnen. Keine tiefe technische Entscheidung nötig.

**Fertig, wenn:** Es gibt einen reproduzierbaren Start und eine grüne Basispipeline.

### M2 – Lobby und erster echter Online-Durchstich

**Ziel:** Zwei bis sechs getrennte Browser sitzen im selben Raum und sehen bestätigte Änderungen.

**Codex setzt um:**

1. Gastidentität mit serverseitiger Sitzung und zufälligem, geschütztem Wiederbeitrittsnachweis anlegen; kein Geheimnis im Einladungslink.
2. Raum erstellen, Code/Link teilen, beitreten und Namen anzeigen.
3. Kapazität 2–6, Bereitschaft, Hostrechte und Einstellungen serverseitig validieren.
4. Socket-Verbindung, Raumzuordnung, Sequenznummern, Bestätigungen und personalisierten Snapshot als durchgehenden Weg implementieren.
5. Lobbyzustand speichern; minimale Testumgebung online bereitstellen, sobald D12 für deren Kosten geklärt ist.

**Zu testen:** Gleichzeitiger Beitritt auf den sechsten Platz; siebter Spieler abgelehnt; fremder Raum nicht lesbar; Start nur durch berechtigten Host mit gültiger Besetzung; doppelte Klicks; Session nach Refresh; Hostwechsel in der Lobby nach definierter Regel, empfohlen ältester verbundener Teilnehmer.

**Du prüfst/entscheidest:** **D1.** Einladung am Handy öffnen und einer gemeinsamen Lobby beitreten. Begriffe, Raumnamen, Bereitschaft und Startbedienung beurteilen.

**Fertig, wenn:** Zwei echte Handys können denselben Raum nutzen. Dies ist bereits Multiplayer, aber noch kein vollständiges Kartenspiel.

### M3 – Regelkern: Karten, Aufbau und normaler Zug

**Ziel:** Eine reduzierte Runde funktioniert deterministisch mit korrekten verdeckten Informationen.

**Codex setzt um:**

1. 52 eindeutige Karten, Kartenwerte und Aufenthaltsorte definieren; Produktionsmischen mit serverseitig sicherer Zufallsquelle, deterministische Testdecks separat.
2. Vier Karten je Spieler, zweireihige feste Positionen und genau zwei Startansichten umsetzen.
3. Zugbeginn, Ziehen, direktes Ablegen und Tausch ohne Fähigkeit der herausgetauschten Karte implementieren.
4. Persönliche und öffentliche Projektionen entwickeln; Client enthält niemals den geheimen Vollzustand.
5. Nachmischen unter Erhalt der obersten Ablage sowie stabile Erweiterung der Kartenfelder ergänzen.

**Zu testen:** Kartenerhaltung und Einzigartigkeit nach jeder Aktion; alle Punktwerte einschließlich Königsfarben; Start bei 2–6 Spielern; keine dritte Startkarte; falscher Spieler kann nicht ziehen; gezogene Karte bleibt privat; Tausch bewahrt Position; Stapelrecycling behält oberste Karte.

**Du prüfst/entscheidest:** **D2, D8.** Eigene Kartenpositionen und der Unterschied zwischen Ablegen und Tauschen sind auf dem Handy verständlich. Dies ist eine interne Zwischenversion mit bewusst noch fehlenden Regeln.

**Fertig, wenn:** Reduzierte Züge laufen zwischen echten Clients und alle betreffenden Regeltests sind grün.

### M4 – Spezialfähigkeiten und Reaktionssystem gemeinsam vervollständigen

**Ziel:** Alle Kartenfähigkeiten und gleichzeitigen Reaktionen funktionieren nach demselben serverseitigen Modell.

**Codex setzt um:**

1. Effektdefinitionen für 2, 3–6, 7–10, schwarze Dame, roten König und schwarzen König hinzufügen; Karten ohne Fähigkeit explizit abdecken.
2. Mehrstufige private Einsichten und Zielauswahlen als gespeicherte Effekte entwickeln.
3. Reaktionsfenster mit eigener ID und Lebensdauer implementieren; Öffnen nur bei regulärer Ablage.
4. Eigene Reaktion, Fehlversuch mit öffentlicher Aufdeckung/Strafkarte und genau einen Erfolg je Fenster implementieren.
5. Fremde Reaktion mit Ausgleichstransfer, Reservierungen und geprüfter Konfliktpolitik ergänzen.
6. Alle Aktionen über dieselbe serielle Raumverarbeitung führen; veraltete Targets von falschen Rangversuchen unterscheiden.
7. Stapelerschöpfung und nicht mehr mögliche Effektziele gemäß beschlossenem Ergänzungsvertrag behandeln.

**Zu testen:** Jeder Fähigkeitsfall in erlaubter und unerlaubter Auslöseart; keine Fähigkeiten bei Tausch-/Reaktionsablagen; Königsrang reagiert unabhängig von Farbe; mehrere Fehlversuche, jeweils genau eine Strafkarte; Reaktion mit frisch erhaltener Karte; gleichzeitige gültige Reaktionen ergeben genau einen Erfolg und eine Strafe für jeden gültigen Nachzügler derselben Fenster-ID; neue reguläre Ablage gegen alte Reaktion bleibt neutral; 5 ansehen und dieselbe 5 abwerfen; schwarzer König bleibt trotz Reaktion aktiv; entfernte bzw. reservierte Ziele; fremde letzte Karte und vollständiger Ausgleich.

**Du prüfst/entscheidest:** **D4, D5, D9, D11.** Sind Ansehen, Blindtausch, Königentscheidung und fremde Reaktion nachvollziehbar? Passt die Server-Eingangsreihenfolge als digitale Fairnessregel? Die vollständige Geschwindigkeits-UX folgt in M6.

**Fertig, wenn:** Alle Fähigkeiten und Reaktionen bestehen auch in gezielt gegeneinander ausgespielten Befehlsfolgen. Ein bloßer normaler Probespielverlauf reicht nicht aus.

### M5 – Rundenende, Kabu und vollständige Partie

**Ziel:** Eine komplette Partie endet und wird genau einmal korrekt gewertet.

**Codex setzt um:**

1. Vorläufiges Ende bei 0 Karten, Sperre neuer Reaktionen und Abarbeitung existierender Pflichtaktionen entwickeln.
2. Erneute 0-Karten-Prüfung einschließlich Aufhebung durch roten König implementieren.
3. Kabu ausschließlich am Zugbeginn erlauben; restliche Schlusszüge explizit verwalten, Aussetzen integrieren.
4. Offene gezogene Karte und letztes Reaktionsfenster gemäß D6/D7 behandeln.
5. Karten aufdecken, Rundensumme und Kabu-Strafe berechnen, Ergebnisse einmalig speichern.
6. Nächste Runde, Startspielerrotation, Gesamtsummen und geteilten Gesamtsieg umsetzen.

**Zu testen:** 0 Karten durch eigene/fremde Reaktion; vorübergehend leerer Empfänger erzeugt kein falsches Ende; roter König hebt Ende auf; fortbestehendes Ende nach letzter Pflichtaktion; diese Fälle auch während Kabu; Ansager erhält keinen weiteren Zug; Kabu beim Ziehen verboten; Schlusszug-2; Gleichstand bringt Ansager +10; gemeinsamer Gesamtsieg; doppelte Abschlussnachricht erzeugt keine doppelte Wertung; keine neuen Aktionen nach Abschluss.

**Du prüfst/entscheidest:** **D3, D6, D7.** Du spielst eine vollständige kurze Partie und prüfst das tatsächliche Verhalten bei Schlussphase und Wertung.

**Fertig, wenn:** Das vollständige Regelwerk plus freigegebene Ergänzungen ist zwischen 2–6 Clients spielbar. Das ist die funktionale Alpha.

### M6 – Mobile Bedienung und verständliches Feedback

**Ziel:** Kabu ist im Hochformat schnell, lesbar und ohne versehentliche Aktionen bedienbar.

**Codex setzt um:**

1. Eigenes Feld, fünf mögliche Gegnerfelder, Ablage und Zugstatus für schmale Displays anordnen.
2. Auch stark gewachsene zweireihige Kartenfelder bedienbar machen; Positionen beim Scrollen/Tauschen nicht automatisch umsortieren.
3. Klare Modi für Ziehen/Tauschen, Fähigkeit und Reaktion entwickeln; schnelle Reaktion ohne zusätzliche Bestätigungsdialoge prototypisieren.
4. Reaktionen während privater Ansicht ermöglichen: kein blockierender Vollbilddialog über allen Karten.
5. Sichtbares Feedback für „gesendet“, „bestätigt“, „zu spät“, „Ziel verändert“ und echte Fehlversuche ergänzen. Der Browser entfernt Karten erst nach Serverbestätigung.
6. Touchflächen, Lesbarkeit, Safe Areas, Screenreader-Bezeichnungen ohne Geheimnislecks und reduzierte Bewegung integrieren.

**Zu testen:** iOS Safari und Android Chrome auf echten Geräten; 2 und 6 Spieler; kleine Hochformatansicht, Tastatur in Lobby, Orientierung ändern, lange Namen, sehr viele Karten; Doppeltippen; gleichzeitige Animation und neue Aktion; private Werte auch in Accessibility-Daten verborgen.

**Du prüfst/entscheidest:** Konkrete Bedienvarianten für schnelles Reagieren und Tauschen; Dauer öffentlicher Aufdeckungen gemäß **D11**. Ziel: Du verstehst zu jedem Zeitpunkt „Wer ist dran? Was darf ich tun? Kann ich noch reagieren?“

**Fertig, wenn:** Eine echte Handyspielrunde kommt ohne mündliche Erklärung der Bedienelemente durch die Kernaktionen. Noch kein endgültiges Branding erforderlich.

### M7 – Reconnect, Unterbrechungen und konsistente Wiederaufnahme

**Ziel:** Refresh, Netzwechsel und Serverneustart zerstören keine bestätigte Partie.

**Codex setzt um:**

1. Wiederaufnahme über stabile Identität, erneute Berechtigungsprüfung und frischen persönlichen Snapshot umsetzen.
2. Verpasste bzw. doppelte Events anhand Sequenzen behandeln; bei Lücke Snapshot holen.
3. Offline-Eingaben sperren. Reaktionsversuche nie unbesehen nach Reconnect nachsenden; unklare frühere Befehle über ihre ID abgleichen.
4. Pausen-, Frist- und Abbruchverhalten gemäß D10 implementieren; Serverzeit ist maßgeblich.
5. Aktuelle Effekte, Transfers, Fenster, offene private Einsichten und Wertungen aus gespeicherten Zuständen wiederherstellen.
6. Mehrere Tabs regeln: empfohlen genau eine aktive Steuerverbindung pro Spieler, neue bestätigte Übernahme entzieht der alten die Steuerung.
7. Wiederaufnahme nach Serverabsturz sowie Ablauf ungenutzter Räume ergänzen.

**Zu testen:** Abbruch vor Empfang, während Speicherung und nach Speicherung vor Bestätigung; Refresh nach Ziehen; Unterbrechung beim schwarzen König und im Ausgleichstransfer; Wiederbeitritt während Schlussphase; Handy sperren und App wechseln; WLAN/Mobilfunkwechsel; Serverneustart; altes Token/fremdes Token; zwei Tabs; keine erneute private Einsicht nach bereits abgeschlossener Fähigkeit.

**Du prüfst/entscheidest:** **D10, D11.** Du probierst absichtlich Flugmodus, Sperrbildschirm und Reload und beurteilst die Pausen-/Rückkehrhinweise.

**Fertig, wenn:** Bestätigte Aktionen bleiben erhalten, unbestätigte werden eindeutig geklärt, und alle Spieler landen wieder auf konsistenten Ansichten.

Socket.IO-Recovery kann temporäre Ausfälle abfedern, ist aber laut Dokumentation nicht garantiert. Die eigene Zustandswiederherstellung bleibt deshalb verpflichtend. [Socket.IO: Connection state recovery](https://socket.io/docs/v4/connection-state-recovery/)

### M8 – Missbrauchsschutz, Belastung und Beta-Freigabe

**Ziel:** Die App bleibt auch bei manipulierten Nachrichten und vielen konkurrierenden Aktionen korrekt.

**Codex setzt um:**

1. Validierung und Berechtigung jeder Befehlsart vervollständigen; Raumcodes gegen massenhaftes Erraten schützen.
2. Ursprungsprüfung, sichere Sitzungen, Größenlimits und ausreichend großzügige technische Ratenlimits einrichten. V1.0 erlaubt mehrere Fehlversuche; ein Rate-Limit darf keine versteckte Ein-Versuch-Regel erzeugen.
3. Zufällige gültige/ungültige Aktionsfolgen mit Invarianten testen und Fehlerfälle reproduzierbar speichern.
4. Mehrere Räume mit 6 Clients und gleichzeitigen Reaktionsstößen belasten.
5. Messwerte für Queue-Wartezeit, Befehlsbearbeitung, Datenbankzeit, Wiederaufnahme und Ablehnungsgründe erfassen.
6. Fehlerberichte mit Raum-/Befehlsreferenzen, aber ohne geheime Kartenwerte ermöglichen.

**Zu testen:** Spieleridentität fälschen, verborgene Karten abfragen, doppelte IDs mit anderer Nutzlast, veraltete Effekte, Raumisolation, Karteninvarianten über lange Folgen, Netzverzögerung und Paketverlust, langsame Datenbank und Prozessabbruch. Der Server darf keine Ereignisse bestätigen, deren Speicherung fehlgeschlagen ist.

**Du prüfst/entscheidest:** Eine private Testrunde mit mehreren Menschen durchführen; gefühlte Reaktionsfairness und Verständlichkeit der Fehlerhinweise bewerten. Codex priorisiert technische Fehler selbstständig.

**Fertig, wenn:** Keine bekannten Regel-, Datenverlust- oder Geheimnislecks offen sind. Vorgeschlagene erste Lastabnahme: 20 parallele Räume à 6 Clients, p95 der serverseitigen Befehlsbearbeitung einschließlich Speicherung unter 100 ms. Das ist ein zu messendes Ziel, keine zugesicherte Kapazität; bei Verfehlung optimiert Codex oder legt den erforderlichen Betriebsaufwand vor.

### M9 – Produktionsbetrieb und kontrollierte Veröffentlichung

**Ziel:** Eine versionierte, wiederherstellbare App ist über eine stabile HTTPS-Adresse nutzbar.

**Codex setzt um:**

1. Staging und Produktion mit getrennten Datenbanken und Geheimnissen konfigurieren.
2. Kostenangebot, Betriebsregion und Datenaufbewahrung gemäß D12 konkretisieren; Produktionsressourcen erst nach Kostenfreigabe einrichten.
3. HTTPS/WSS, Healthchecks, Datenbank-Backups und Wiederherstellung dokumentieren und erproben.
4. Deployment mit Raum-Besitzschutz, kontrolliertem Verbindungsabbau und Wiederaufnahme aus gespeicherten Zuständen umsetzen.
5. Datenbankmigrationen und Snapshot-/Protokollversionen absichern. Bei inkompatibler Änderung keine laufenden Partien still migrieren; neue Starts aussetzen und aktive Partien vorher geordnet beenden lassen.
6. Rollback-Ablauf, Störungsanzeige, Supportweg und Monitoring für Fehlerquote/Latenz bereitstellen.

**Zu testen:** Produktionsähnlicher Build; WebSocket über echte Domain; Deploy während Testpartie; genau ein schreibender Raumbesitzer; Backup in isolierte Umgebung zurückspielen; Rollback mit passendem Datenformat; abgelaufene Sitzungen; Netzwechsel auf tatsächlichem Hosting.

**Du prüfst/entscheidest:** **D12**, gewünschte Adresse und Produktionsfreigabe anhand funktionierender Staging-Version und konkreter Kosten. Keine Administrationskenntnisse erforderlich.

**Fertig, wenn:** Einladungslink funktioniert auf echten Handys, Wiederaufnahme und Wiederherstellung sind erprobt, Monitoring ist aktiv und du hast die Veröffentlichung freigegeben.

### M10 – Visuelles Design, Animation und Polish

**Ziel:** Die bereits verlässliche App erhält eine eigenständige, angenehme Gestaltung.

**Codex setzt um:**

1. Zwei Designrichtungen für denselben Lobby- und Spielzustand vorbereiten.
2. Nach Auswahl Kartenstil, Typografie, Farben, Abstände und Interaktionszustände konsistent ausarbeiten.
3. Kurze Animationen für Ablage, Tausch, Fehlversuch und Wertung ergänzen; neue bestätigte Zustände dürfen laufende Animationen überspringen.
4. Optionale Sounds und reduzierte Bewegung integrieren; Spielbarkeit bleibt ohne Ton erhalten.
5. Kurze Regelhilfe, Erstbenutzung und verständliche Leer-/Fehlerzustände ergänzen.
6. Optional PWA-Installation und App-Icon; falls Service Worker, keine privaten Spielantworten cachen und Updatekonflikte in laufenden Partien vermeiden.

**Zu testen:** Animation verändert weder Serverreihenfolge noch erlaubte Eingaben; schnelle Reaktion bleibt erreichbar; Kontrast, Textgröße, schwächere Geräte, Sound aus, reduzierte Bewegung, Asset-Ladefehler und gegebenenfalls PWA-Update.

**Du prüfst/entscheidest:** **D13.** Stil, Ton, Animationstempo und Installierbarkeit. Du nimmst die Gestaltung am eigenen Handy ab.

**Fertig, wenn:** Das gewählte Design ist konsistent, und alle bisherigen Regel-/Multiplayerprüfungen bleiben grün.

### M11 – Ausbau anhand tatsächlicher Nutzung

**Ziel:** Erweiterungen entstehen aus beobachtetem Bedarf.

**Codex setzt um:**

1. Feedback und technische Messwerte auswerten und ein priorisiertes Folgebacklog vorschlagen.
2. Je nach deiner Priorität Konten, Freunde, Statistiken, weitere Raumoptionen oder Zuschauer separat planen.
3. Bots, Matchmaking und Ranglisten als eigene Vorhaben behandeln, weil sie Fairness und Abbruchregeln verändern.
4. Horizontale Skalierung nur bei gemessenem Bedarf planen: eindeutige Raumzuweisung, Besitzerwechsel, geteilte Sitzungen und passende Persistenz.

**Zu testen:** Jede neue Funktion erhält eigene Akzeptanzfälle; vollständige Regeln und Informationsschutz bleiben Regressionstest. Bei Skalierung insbesondere doppelter Raumbesitz, Failover und Reaktionsreihenfolge testen.

**Du prüfst/entscheidest:** Welches reale Nutzerproblem als Nächstes gelöst werden soll und welches zusätzliche Budget gerechtfertigt ist.

**Fertig, wenn:** Der nächste Ausbau hat einen klaren Nutzen und ein eigenes überprüfbares Ziel. M11 ist keine Voraussetzung für die erste fertige Version.

## 6. Verbindliche Qualitätskriterien über alle Meilensteine

| Kriterium | Prüfnachweis |
|---|---|
| Keine Karten verloren oder dupliziert | 52 eindeutige Karten an genau einem serverseitigen Ort, auch nach Transfer, Shuffle und Recovery |
| Keine geheimen Werte vorzeitig übertragen | Netzwerkpayload-, Snapshot- und UI-/Accessibility-Prüfungen für jeden Spielertyp |
| Genau eine erfolgreiche Reaktion pro Fenster | Konkurrenztests mit gültigen/ungültigen Versuchen und Fensterwechsel |
| Keine doppelte Ausführung | Wiederholung derselben Befehls-ID vor/nach Reconnect und Serverneustart |
| Fähigkeiten nur bei direkter Ablage der gezogenen Karte | Tests aller Herkunftsarten, einschließlich Königen und 2 |
| Keine vergessene Pflichtaktion | Rundenende mit rotem König, offenem Transfer und mehrstufigem schwarzen König |
| Wertung genau einmal und regelkonform | Kabu allein bester, schlechter, Gleichstand; geteilte Gesamtwertung; wiederholter Abschluss |
| Reconnect schenkt keine Karteninformation | Nur aktuell berechtigte Ansichten erscheinen; keine historische Wissensliste |
| UI folgt dem Server | Kein lokaler Gewinn, kein lokaler Strafkartenentscheid, keine neue Aktion aus veraltetem Fenster |
| Mobile Bedienbarkeit | Echte Geräte ergänzen Browserautomation; alle Aktionen auch bei 6 Spielern erreichbar |

Playwright kann unter anderem mobile Viewports und Touch-Eigenschaften emulieren. Das unterstützt wiederholbare Tests, ersetzt aber nicht den hier geforderten Test von iOS Safari und Android Chrome auf realen Handys. [Playwright: Emulation](https://playwright.dev/docs/emulation)

## 7. Arbeitsmodus für Codex in VS Code

Die Roadmap dient als übergeordneter Vertrag. Codex bearbeitet jeweils ein kleines Ticket mit sichtbarem Ergebnis. Ein Ticket soll eine fachlich zusammenhängende Änderung enthalten, etwa „falsche fremde Reaktion bestraft den Verursacher“ oder „Reconnect nach bestätigtem Ziehen stellt dieselbe gezogene Karte wieder her“.

Für jedes Ticket dokumentiert Codex:

1. **Zweck und Abhängigkeit:** zu welchem Meilenstein und Regelabschnitt es gehört.
2. **Akzeptanzfälle:** beobachtbares Sollverhalten einschließlich relevanter Ablehnungen.
3. **Umsetzung:** klein genug für einen zusammenhängenden Commit oder Review.
4. **Prüfung:** ausgeführte Tests und verbleibende konkrete Einschränkungen.
5. **Abnahme:** kurzer Ablauf zum Ausprobieren, nur falls das Ticket eine sichtbare Produktänderung enthält.

Codex hält Architekturentscheidungen kurz in `docs/architecture.md`, digitale Regelerweiterungen in `docs/rules-digital.md`, Protokoll und Übergänge in `docs/state-model.md` sowie Entscheidungsliste und Fortschritt in `docs/decisions.md` und `docs/progress.md` fest. Das sind geplante Repository-Dokumente, die im Implementierungsauftrag angelegt werden.

Du musst nicht jeden Commit abnehmen. Technische Arbeiten laufen innerhalb der festgelegten Architektur selbstständig. Rückfragen bündeln sich an den gekennzeichneten Produktentscheidungen und den sichtbaren Meilensteinabnahmen. Meldet Codex eine neue Regellücke, beschreibt es die Spielsituation, den empfohlenen Ausgang und die betroffene Etappe; es ändert keine Regeln auf eigene Faust.

**Abhängigkeitsfolge:** M0 → M1 → M2 → M3 → M4 → M5 → M6 → M7 → M8 → M9 → M10. Erste Online-Prüfung bereits M2; vollständige Alpha M5; private Beta nach M8; belastbare Veröffentlichung nach M9. Gestaltungsideen dürfen früher gesammelt werden, die aufwendige Umsetzung folgt nach der spielerischen Stabilisierung.

**Nächster konkreter Schritt:** Im Folgeauftrag bearbeitet Codex M0 und legt die digitalen Regelentscheidungen als kurze, überprüfbare Spielszenarien vor. Erst danach beginnt die Implementierung der freigegebenen Bereiche. Diese Roadmap selbst erteilt noch keinen Auftrag, Code zu schreiben oder kostenpflichtige Infrastruktur einzurichten.
