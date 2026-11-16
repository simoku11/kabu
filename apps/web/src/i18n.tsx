import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useState,
} from "react";

export type Language = "de" | "en" | "ru";

const translations: Record<Exclude<Language, "de">, Record<string, string>> = {
  en: {
    Sprache: "Language",
    Host: "Host",
    B: "J",
    D: "Q",
    K: "K",
    A: "A",
    von: "of",
    "Der Server hat nicht rechtzeitig geantwortet.":
      "The server did not respond in time.",
    "Die Übernahme wurde nicht bestätigt.": "Taking control was not confirmed.",
    "Der Befehlsstatus ist noch ungeklärt.":
      "The command status is still unknown.",
    "Dieser Raum wurde nicht gefunden.": "This room was not found.",
    "Du gehörst nicht zu diesem Raum.": "You are not a member of this room.",
    "Der Raum konnte nicht verbunden werden.": "Could not connect to the room.",
    "Verbinde zuerst den Raum.": "Connect to the room first.",
    "Die Steuerung konnte nicht übernommen werden.": "Could not take control.",
    "Der Befehl ist ungültig.": "The command is invalid.",
    "Die Steuerung ist in einem anderen Tab aktiv.":
      "Control is active in another tab.",
    "Zu viele technische Anfragen. Bitte kurz warten.":
      "Too many requests. Please wait a moment.",
    "Der Befehl konnte nicht verarbeitet werden.":
      "The command could not be processed.",
    "Nur der Host kann die Rundenzahl ändern.":
      "Only the host can change the number of rounds.",
    "Nur der Host kann die Partie starten.":
      "Only the host can start the game.",
    "Zum Start werden 2 bis 6 Spieler benötigt.":
      "2 to 6 players are required to start.",
    "Vor dem Start müssen alle Spieler bereit sein.":
      "All players must be ready before starting.",
    "Diese Unterbrechung ist nicht mehr aktuell.":
      "This interruption is no longer current.",
    "Die Wiederbeitrittsfrist läuft noch.":
      "The rejoin period is still active.",
    "Warten ist im aktuellen Zustand nicht verfügbar.":
      "Waiting is not available in the current state.",
    "Nur der Host kann die Wartefrist verlängern.":
      "Only the host can extend the waiting period.",
    "Abbrechen ist im aktuellen Zustand nicht verfügbar.":
      "Ending the game is not available in the current state.",
    "Nur der Host kann die Partie abbrechen.":
      "Only the host can end the game.",
    "Die Partie wurde noch nicht gestartet.": "The game has not started yet.",
    "Diese Runde ist nicht mehr aktuell.": "This round is no longer current.",
    "Die App konnte nicht gestartet werden.": "The app could not be started.",
    "Deine Gastsitzung wird vorbereitet …": "Preparing your guest session …",
    "Verbindung fehlgeschlagen": "Connection failed",
    "Erneut versuchen": "Try again",
    "Private Runde · 2–6 Spieler": "Private game · 2–6 players",
    "Einladung annehmen": "Accept invitation",
    "Gemeinsam an einen Tisch": "Gather around the table",
    "Dein Name": "Your name",
    "z. B. Anna": "e.g. Anna",
    "Raum beitreten": "Join room",
    Rundenzahl: "Number of rounds",
    "Privaten Raum erstellen": "Create private room",
    oder: "or",
    Raumcode: "Room code",
    Beitreten: "Join",
    Online: "Online",
    "Verbinde …": "Connecting …",
    "Link kopieren": "Copy link",
    "Einladungslink kopiert.": "Invitation link copied.",
    Teilnehmer: "Players",
    du: "you",
    Bereit: "Ready",
    Wartet: "Waiting",
    "Freier Platz": "Open seat",
    Runden: "Rounds",
    "Standard: 10": "Default: 10",
    "Partie gestartet": "Game started",
    "Der erste Kartenzug folgt in Meilenstein M3.":
      "The first card draw follows in milestone M3.",
    "Nicht mehr bereit": "Not ready",
    "Ich bin bereit": "I'm ready",
    "Partie starten": "Start game",
    "Raum endgültig verlassen": "Leave room permanently",
    "Raumstand #{value}": "Room state #{value}",
    "Raum konnte nicht erstellt werden.": "The room could not be created.",
    "Beitritt fehlgeschlagen.": "Could not join.",
    "Übernahme fehlgeschlagen.": "Could not take control.",
    "Zustandsabgleich fehlgeschlagen.": "State synchronization failed.",
    "Wiederaufnahme gescheitert. Prüfe die Verbindung und lade die Seite erneut.":
      "Could not reconnect. Check your connection and reload the page.",
    "Aktion nicht gesendet: Verbindung oder Zustandsabgleich ist nicht bereit.":
      "Action not sent: connection or state synchronization is not ready.",
    "Verbindung unterbrochen – der Befehlsstatus wird nach der Rückkehr geprüft.":
      "Connection lost — the command status will be checked after reconnecting.",
    "nicht vom Server empfangen.": "was not received by the server.",
    "war bereits bestätigt.": "was already confirmed.",
    "wurde abgelehnt.": "was rejected.",
    "bestätigt.": "confirmed.",
    "wurde nicht vom Server empfangen.": "was not received by the server.",
    "Eigene Karte ansehen": "View your own card",
    "Gegnerische Karte ansehen": "View an opponent's card",
    "Zwei Karten blind tauschen": "Blindly swap two cards",
    "Eine verdeckte Karte vergeben": "Give away a face-down card",
    "Zwei Karten ansehen und entscheiden": "View two cards and decide",
    Spezialfähigkeit: "Special ability",
    "Nächsten Spieler aussetzen lassen": "Skip the next player",
    "Eine eigene Karte ansehen": "View one of your cards",
    "Eine gegnerische Karte ansehen": "View an opponent's card",
    "Keine Aktion": "No action",
    "Zwei Karten verschiedener Spieler blind tauschen":
      "Blindly swap cards belonging to two different players",
    "Einem Spieler eine verdeckte Karte geben":
      "Give a player a face-down card",
    "Zwei Karten ansehen und tauschen oder behalten":
      "View two cards and swap or keep them",
    "Karte ziehen": "Draw card",
    "Gezogene Karte ablegen": "Discard drawn card",
    "Karte tauschen": "Swap card",
    Reaktionsversuch: "Reaction attempt",
    "Ausgleichskarte übergeben": "Give replacement card",
    "Kabu ansagen": "Call Kabu",
    "Fähigkeitsziel wählen": "Choose ability target",
    "Spieler wählen": "Choose player",
    "Private Einsicht schließen": "Close private view",
    Königsentscheidung: "King decision",
    "Weiter warten": "Keep waiting",
    "Partie abbrechen": "End game",
    Aktion: "Action",
    "Zielkarte inzwischen verändert.": "The target card has changed.",
    "Technisch gedrosselt – bitte kurz warten. Keine Spielstrafe.":
      "Temporarily rate-limited — please wait. No game penalty.",
    "Zielkarte ist gebunden.": "The target card is locked.",
    "Reaktionsfenster bereits verbraucht oder geschlossen.":
      "The reaction window is already used or closed.",
    "Aktion abgelehnt.": "Action rejected.",
    "Ausgleichskarte auswählen": "Select replacement card",
    "Karte für Reaktion auswählen": "Select card for reaction",
    "Eigene Karte zum Tauschen wählen": "Choose your card to swap",
    "Zweite Karte auswählen": "Select second card",
    "Erste Karte auswählen": "Select first card",
    "Keine Kartenauswahl aktiv": "No card selection active",
    Spieler: "Player",
    "Eigene Ausgleichskarte wählen.": "Choose your replacement card.",
    "Ablage oder eigene Karte antippen.":
      "Tap the discard pile or one of your cards.",
    "Offene Karte schließen oder mit anderer Karte reagieren.":
      "Close the open card or react with another card.",
    "Tauschen oder behalten.": "Swap or keep.",
    "Erst reagieren oder rechts die Aktivität ausführen.":
      "React first or use the action on the right.",
    "Passende Karte direkt antippen.": "Tap the matching card.",
    "Oberste Karte ziehen.": "Draw the top card.",
    "Offene Aktion zuerst abschließen oder ablehnen.":
      "Complete or decline the open action first.",
    "An {name}": "To {name}",
    "Aktivität aktiv": "Action active",
    "Aktivität ausführen": "Use action",
    "Ansehen überspringen": "Skip viewing",
    Tauschen: "Swap",
    Behalten: "Keep",
    "Verbindung unterbrochen": "Connection lost",
    "Synchronisiere …": "Synchronizing …",
    "Kartenübersicht öffnen": "Open card guide",
    Kartenübersicht: "Card guide",
    Karten: "Cards",
    "Hauptmenü öffnen": "Open main menu",
    Hauptmenü: "Main menu",
    Menü: "Menu",
    "Spiel in anderem Tab geöffnet": "Game opened in another tab",
    "Dieser Tab zeigt den Tisch nur an und kann keine Aktionen senden.":
      "This tab can only display the table and cannot send actions.",
    "Steuerung übernehmen": "Take control",
    "Partie abgebrochen": "Game ended",
    "Partie pausiert": "Game paused",
    "Fehlend: {names}.": "Missing: {names}.",
    niemand: "nobody",
    "Die Wiederbeitrittsfrist ist abgelaufen.":
      "The rejoin period has expired.",
    "Wiederbeitritt ist 90 Sekunden lang möglich.":
      "Players can rejoin for 90 seconds.",
    "Weitere 90 Sekunden warten": "Wait another 90 seconds",
    "Karten verdecken und schließen": "Turn cards face down and close",
    "Warte auf {names} …": "Waiting for {names} …",
    "Du bist ausgeschieden. Deine Endpunktzahl beträgt {score}.":
      "You are eliminated. Your final score is {score}.",
    "gesendet · wartet auf Bestätigung": "sent · waiting for confirmation",
    "Kabu-Schlussphase": "Final Kabu phase",
    "{name} hat Kabu angesagt.": "{name} called Kabu.",
    "Noch ausstehend: {names}": "Still waiting for: {names}",
    keine: "none",
    "Vorläufiges Rundenende: Bereits ausgelöste Pflichtaktionen werden noch abgeschlossen.":
      "Provisional end of round: mandatory actions already triggered are still being completed.",
    "Entwicklungs-Testszenario laden / zurücksetzen":
      "Load / reset development test scenario",
    Spickzettel: "Quick reference",
    "Kartenübersicht schließen": "Close card guide",
    "Aktionen werden nur ausgelöst, wenn du eine frisch gezogene Karte direkt ablegst. Beim Tauschen oder Reagieren lösen Karten keine Aktion aus.":
      "Actions only trigger when you immediately discard a newly drawn card. Swapping or reacting does not trigger card actions.",
    Karte: "Card",
    Punkte: "Points",
    "Runde verlassen": "Leave round",
    "Zurück zum Hauptmenü?": "Return to main menu?",
    "Bist du sicher, dass du die laufende Runde verlassen möchtest?":
      "Are you sure you want to leave the current round?",
    "In der Runde bleiben": "Stay in round",
    "Wird verlassen …": "Leaving …",
    "Partie beendet": "Game over",
    "Runde {round} beendet": "Round {round} complete",
    "Gewonnen: {names}": "Winner: {names}",
    "Zwischenstand · {round} von {count}": "Standings · {round} of {count}",
    "Rundenergebnis und Gesamtstand": "Round result and overall standings",
    "Ausgeschieden · Endstand: {score}": "Eliminated · Final score: {score}",
    "Kartenpunkte: {score}": "Card points: {score}",
    "Kabu-Strafe: +{score}": "Kabu penalty: +{score}",
    "Runde: {score}": "Round: {score}",
    "Gesamt: {score}": "Total: {score}",
    "Du bist ausgeschieden und schaust nur noch zu.":
      "You are eliminated and can only watch.",
    "Bereit – warte auf die anderen": "Ready — waiting for the others",
    "Bereit für nächste Runde": "Ready for next round",
    "{ready} von {total} bereit": "{ready} of {total} ready",
    "Letztes Kabu-Reaktionsfenster: {seconds} s":
      "Final Kabu reaction window: {seconds} s",
    "{seconds} Sekunden für die Aktivität verbleibend":
      "{seconds} seconds left for the action",
    "Kartenfeld von {name}": "Card area of {name}",
    "aktiver Spieler": "active player",
    "Ausgeschieden · {score} Punkte": "Eliminated · {score} points",
    "Spieler ausgeschieden": "Player eliminated",
    Ausgeschieden: "Eliminated",
    "Gezogene Karte": "Drawn card",
    Gezogen: "Drawn",
    "{name} hält die gezogene Karte": "{name} is holding the drawn card",
    "{name} sieht hier eine Karte an": "{name} is viewing a card here",
    "Falsche Karte aufgedeckt · Strafkarte":
      "Wrong card revealed · Penalty card",
    "Zu späte Reaktion · Strafkarte": "Late reaction · Penalty card",
    Spieltisch: "Game table",
    "Mitspieler in Zugreihenfolge": "Other players in turn order",
    Tischmitte: "Center of table",
    "Oberste Karte ziehen, {count} Karten übrig":
      "Draw top card, {count} cards left",
    "Nachziehstapel, {count} Karten übrig": "Draw pile, {count} cards left",
    "Gezogene Karte auf den Ablagestapel legen":
      "Place drawn card on discard pile",
    Ablagestapel: "Discard pile",
    "Ablagestapel leer": "Discard pile empty",
    Leer: "Empty",
    "Reaktionsfenster: keines": "Reaction window: none",
    "Reaktionsfenster offen · Rang {rank}":
      "Reaction window open · Rank {rank}",
    "Reaktionsfenster verbraucht · Rang {rank} · weitere Versuche geben eine Strafkarte":
      "Reaction window used · Rank {rank} · further attempts add a penalty card",
    Nahe: "Near",
    Ferne: "Far",
    "Verdeckte Karte": "Face-down card",
    "Aufgedeckte Karte": "Revealed card",
    gebunden: "locked",
    "zu spät – Strafkarte erhalten": "too late — penalty card received",
    "falsche Karte – Strafkarte erhalten": "wrong card — penalty card received",
    "zum Schließen antippen": "tap to close",
    auswählen: "select",
    "Karte gehalten": "Card held",
    Gehalten: "Held",
    "Zu spät · Strafkarte": "Too late · Penalty card",
    "Falsche Karte · Strafkarte": "Wrong card · Penalty card",
    "{name} zieht eine Karte.": "{name} draws a card.",
    "{name} legt die gezogene Karte ab.": "{name} discards the drawn card.",
    "{name} tauscht die gezogene Karte.": "{name} swaps the drawn card.",
    "{name} hält eine Karte zum Ansehen.": "{name} holds a card to view it.",
    "{name} legt die angesehenen Karten zurück.":
      "{name} puts the viewed cards back.",
    "{name} tauscht zwei Karten.": "{name} swaps two cards.",
    "{name} reagiert mit einer eigenen Karte.":
      "{name} reacts with their own card.",
    "{name} reagiert auf {owner}s Karte.": "{name} reacts to {owner}'s card.",
    "{name} gibt {recipient} die Ausgleichskarte.":
      "{name} gives {recipient} the replacement card.",
    "{name} erhält eine verdeckte Strafkarte.":
      "{name} receives a face-down penalty card.",
    "{name} deckt eine falsche Karte auf und erhält eine Strafkarte.":
      "{name} reveals a wrong card and receives a penalty card.",
    "{name} reagiert zu spät und erhält eine Strafkarte.":
      "{name} reacts too late and receives a penalty card.",
    "{name} gibt {recipient} eine verdeckte Zusatzkarte.":
      "{name} gives {recipient} an extra face-down card.",
    "{value} Punkte": "{value} points",
    "{seconds} Sekunden verbleibend": "{seconds} seconds remaining",
    "Runde {round} · Zwei nahe Karten ansehen und merken.":
      "Round {round} · View and remember two near cards.",
    "Runde {round} · Startansicht geschlossen. Auf Mitspieler warten.":
      "Round {round} · Initial view closed. Waiting for other players.",
  },
  ru: {
    Sprache: "Язык",
    Host: "Ведущий",
    B: "В",
    D: "Д",
    K: "К",
    A: "Т",
    von: "игрока",
    "Der Server hat nicht rechtzeitig geantwortet.":
      "Сервер не ответил вовремя.",
    "Die Übernahme wurde nicht bestätigt.":
      "Получение управления не подтверждено.",
    "Der Befehlsstatus ist noch ungeklärt.": "Статус команды пока неизвестен.",
    "Dieser Raum wurde nicht gefunden.": "Комната не найдена.",
    "Du gehörst nicht zu diesem Raum.": "Вы не состоите в этой комнате.",
    "Der Raum konnte nicht verbunden werden.":
      "Не удалось подключиться к комнате.",
    "Verbinde zuerst den Raum.": "Сначала подключитесь к комнате.",
    "Die Steuerung konnte nicht übernommen werden.":
      "Не удалось получить управление.",
    "Der Befehl ist ungültig.": "Недопустимая команда.",
    "Die Steuerung ist in einem anderen Tab aktiv.":
      "Управление активно в другой вкладке.",
    "Zu viele technische Anfragen. Bitte kurz warten.":
      "Слишком много запросов. Немного подождите.",
    "Der Befehl konnte nicht verarbeitet werden.":
      "Не удалось обработать команду.",
    "Nur der Host kann die Rundenzahl ändern.":
      "Только ведущий может менять количество раундов.",
    "Nur der Host kann die Partie starten.":
      "Только ведущий может начать игру.",
    "Zum Start werden 2 bis 6 Spieler benötigt.":
      "Для начала нужно от 2 до 6 игроков.",
    "Vor dem Start müssen alle Spieler bereit sein.":
      "Перед началом все игроки должны быть готовы.",
    "Diese Unterbrechung ist nicht mehr aktuell.":
      "Эта пауза больше не актуальна.",
    "Die Wiederbeitrittsfrist läuft noch.":
      "Срок повторного входа ещё не истёк.",
    "Warten ist im aktuellen Zustand nicht verfügbar.":
      "В текущем состоянии ожидание недоступно.",
    "Nur der Host kann die Wartefrist verlängern.":
      "Только ведущий может продлить время ожидания.",
    "Abbrechen ist im aktuellen Zustand nicht verfügbar.":
      "В текущем состоянии прерывание игры недоступно.",
    "Nur der Host kann die Partie abbrechen.":
      "Только ведущий может прервать игру.",
    "Die Partie wurde noch nicht gestartet.": "Игра ещё не началась.",
    "Diese Runde ist nicht mehr aktuell.": "Этот раунд больше не актуален.",
    "Die App konnte nicht gestartet werden.":
      "Не удалось запустить приложение.",
    "Deine Gastsitzung wird vorbereitet …": "Подготавливаем гостевой сеанс …",
    "Verbindung fehlgeschlagen": "Ошибка подключения",
    "Erneut versuchen": "Повторить",
    "Private Runde · 2–6 Spieler": "Частная игра · 2–6 игроков",
    "Einladung annehmen": "Принять приглашение",
    "Gemeinsam an einen Tisch": "Соберитесь за одним столом",
    "Dein Name": "Ваше имя",
    "z. B. Anna": "например, Анна",
    "Raum beitreten": "Войти в комнату",
    Rundenzahl: "Количество раундов",
    "Privaten Raum erstellen": "Создать частную комнату",
    oder: "или",
    Raumcode: "Код комнаты",
    Beitreten: "Войти",
    Online: "В сети",
    "Verbinde …": "Подключение …",
    "Link kopieren": "Скопировать ссылку",
    "Einladungslink kopiert.": "Ссылка-приглашение скопирована.",
    Teilnehmer: "Участники",
    du: "вы",
    Bereit: "Готов",
    Wartet: "Ожидает",
    "Freier Platz": "Свободное место",
    Runden: "Раунды",
    "Standard: 10": "По умолчанию: 10",
    "Partie gestartet": "Игра началась",
    "Der erste Kartenzug folgt in Meilenstein M3.":
      "Первый ход с картой появится на этапе M3.",
    "Nicht mehr bereit": "Не готов",
    "Ich bin bereit": "Я готов",
    "Partie starten": "Начать игру",
    "Raum endgültig verlassen": "Покинуть комнату",
    "Raumstand #{value}": "Состояние комнаты #{value}",
    "Raum konnte nicht erstellt werden.": "Не удалось создать комнату.",
    "Beitritt fehlgeschlagen.": "Не удалось войти.",
    "Übernahme fehlgeschlagen.": "Не удалось получить управление.",
    "Zustandsabgleich fehlgeschlagen.":
      "Не удалось синхронизировать состояние.",
    "Wiederaufnahme gescheitert. Prüfe die Verbindung und lade die Seite erneut.":
      "Не удалось переподключиться. Проверьте соединение и обновите страницу.",
    "Aktion nicht gesendet: Verbindung oder Zustandsabgleich ist nicht bereit.":
      "Действие не отправлено: подключение или синхронизация ещё не готовы.",
    "Verbindung unterbrochen – der Befehlsstatus wird nach der Rückkehr geprüft.":
      "Соединение прервано — статус команды будет проверен после переподключения.",
    "nicht vom Server empfangen.": "не получено сервером.",
    "war bereits bestätigt.": "уже было подтверждено.",
    "wurde abgelehnt.": "было отклонено.",
    "bestätigt.": "подтверждено.",
    "wurde nicht vom Server empfangen.": "не было получено сервером.",
    "Eigene Karte ansehen": "Посмотреть свою карту",
    "Gegnerische Karte ansehen": "Посмотреть карту соперника",
    "Zwei Karten blind tauschen": "Вслепую поменять две карты",
    "Eine verdeckte Karte vergeben": "Передать закрытую карту",
    "Zwei Karten ansehen und entscheiden": "Посмотреть две карты и решить",
    Spezialfähigkeit: "Особая способность",
    "Nächsten Spieler aussetzen lassen": "Пропустить ход следующего игрока",
    "Eine eigene Karte ansehen": "Посмотреть одну свою карту",
    "Eine gegnerische Karte ansehen": "Посмотреть одну карту соперника",
    "Keine Aktion": "Без действия",
    "Zwei Karten verschiedener Spieler blind tauschen":
      "Вслепую поменять карты двух разных игроков",
    "Einem Spieler eine verdeckte Karte geben": "Дать игроку закрытую карту",
    "Zwei Karten ansehen und tauschen oder behalten":
      "Посмотреть две карты и поменять или оставить их",
    "Karte ziehen": "Взять карту",
    "Gezogene Karte ablegen": "Сбросить взятую карту",
    "Karte tauschen": "Поменять карту",
    Reaktionsversuch: "Попытка реакции",
    "Ausgleichskarte übergeben": "Передать заменяющую карту",
    "Kabu ansagen": "Объявить Kabu",
    "Fähigkeitsziel wählen": "Выбрать цель способности",
    "Spieler wählen": "Выбрать игрока",
    "Private Einsicht schließen": "Закрыть личный просмотр",
    Königsentscheidung: "Решение короля",
    "Weiter warten": "Продолжить ожидание",
    "Partie abbrechen": "Прервать игру",
    Aktion: "Действие",
    "Zielkarte inzwischen verändert.": "Целевая карта уже изменилась.",
    "Technisch gedrosselt – bitte kurz warten. Keine Spielstrafe.":
      "Слишком много запросов — немного подождите. Штрафа в игре нет.",
    "Zielkarte ist gebunden.": "Целевая карта заблокирована.",
    "Reaktionsfenster bereits verbraucht oder geschlossen.":
      "Окно реакции уже использовано или закрыто.",
    "Aktion abgelehnt.": "Действие отклонено.",
    "Ausgleichskarte auswählen": "Выберите заменяющую карту",
    "Karte für Reaktion auswählen": "Выберите карту для реакции",
    "Eigene Karte zum Tauschen wählen": "Выберите свою карту для обмена",
    "Zweite Karte auswählen": "Выберите вторую карту",
    "Erste Karte auswählen": "Выберите первую карту",
    "Keine Kartenauswahl aktiv": "Выбор карт не активен",
    Spieler: "Игрок",
    "Eigene Ausgleichskarte wählen.": "Выберите свою заменяющую карту.",
    "Ablage oder eigene Karte antippen.": "Нажмите на сброс или свою карту.",
    "Offene Karte schließen oder mit anderer Karte reagieren.":
      "Закройте открытую карту или отреагируйте другой картой.",
    "Tauschen oder behalten.": "Поменять или оставить.",
    "Erst reagieren oder rechts die Aktivität ausführen.":
      "Сначала отреагируйте или выполните действие справа.",
    "Passende Karte direkt antippen.": "Нажмите на подходящую карту.",
    "Oberste Karte ziehen.": "Возьмите верхнюю карту.",
    "Offene Aktion zuerst abschließen oder ablehnen.":
      "Сначала завершите или отклоните открытое действие.",
    "An {name}": "Игроку {name}",
    "Aktivität aktiv": "Действие активно",
    "Aktivität ausführen": "Выполнить действие",
    "Ansehen überspringen": "Пропустить просмотр",
    Tauschen: "Поменять",
    Behalten: "Оставить",
    "Verbindung unterbrochen": "Соединение прервано",
    "Synchronisiere …": "Синхронизация …",
    "Kartenübersicht öffnen": "Открыть справочник карт",
    Kartenübersicht: "Справочник карт",
    Karten: "Карты",
    "Hauptmenü öffnen": "Открыть главное меню",
    Hauptmenü: "Главное меню",
    Menü: "Меню",
    "Spiel in anderem Tab geöffnet": "Игра открыта в другой вкладке",
    "Dieser Tab zeigt den Tisch nur an und kann keine Aktionen senden.":
      "Эта вкладка только показывает стол и не может отправлять действия.",
    "Steuerung übernehmen": "Получить управление",
    "Partie abgebrochen": "Игра прервана",
    "Partie pausiert": "Игра приостановлена",
    "Fehlend: {names}.": "Отсутствуют: {names}.",
    niemand: "никто",
    "Die Wiederbeitrittsfrist ist abgelaufen.": "Срок повторного входа истёк.",
    "Wiederbeitritt ist 90 Sekunden lang möglich.":
      "Повторный вход возможен в течение 90 секунд.",
    "Weitere 90 Sekunden warten": "Подождать ещё 90 секунд",
    "Karten verdecken und schließen": "Перевернуть карты и закрыть",
    "Warte auf {names} …": "Ожидание: {names} …",
    "Du bist ausgeschieden. Deine Endpunktzahl beträgt {score}.":
      "Вы выбыли. Итоговый счёт: {score}.",
    "gesendet · wartet auf Bestätigung": "отправлено · ожидание подтверждения",
    "Kabu-Schlussphase": "Финальная фаза Kabu",
    "{name} hat Kabu angesagt.": "{name} объявляет Kabu.",
    "Noch ausstehend: {names}": "Ещё ожидаются: {names}",
    keine: "никого",
    "Vorläufiges Rundenende: Bereits ausgelöste Pflichtaktionen werden noch abgeschlossen.":
      "Предварительное завершение раунда: уже начатые обязательные действия ещё выполняются.",
    "Entwicklungs-Testszenario laden / zurücksetzen":
      "Загрузить / сбросить тестовый сценарий",
    Spickzettel: "Шпаргалка",
    "Kartenübersicht schließen": "Закрыть справочник карт",
    "Aktionen werden nur ausgelöst, wenn du eine frisch gezogene Karte direkt ablegst. Beim Tauschen oder Reagieren lösen Karten keine Aktion aus.":
      "Действия срабатывают, только если сразу сбросить только что взятую карту. При обмене или реакции действия карт не срабатывают.",
    Karte: "Карта",
    Punkte: "Очки",
    "Runde verlassen": "Покинуть раунд",
    "Zurück zum Hauptmenü?": "Вернуться в главное меню?",
    "Bist du sicher, dass du die laufende Runde verlassen möchtest?":
      "Вы уверены, что хотите покинуть текущий раунд?",
    "In der Runde bleiben": "Остаться в раунде",
    "Wird verlassen …": "Выход …",
    "Partie beendet": "Игра окончена",
    "Runde {round} beendet": "Раунд {round} завершён",
    "Gewonnen: {names}": "Победитель: {names}",
    "Zwischenstand · {round} von {count}":
      "Промежуточный счёт · {round} из {count}",
    "Rundenergebnis und Gesamtstand": "Результат раунда и общий счёт",
    "Ausgeschieden · Endstand: {score}": "Выбыл · Итог: {score}",
    "Kartenpunkte: {score}": "Очки карт: {score}",
    "Kabu-Strafe: +{score}": "Штраф Kabu: +{score}",
    "Runde: {score}": "Раунд: {score}",
    "Gesamt: {score}": "Всего: {score}",
    "Du bist ausgeschieden und schaust nur noch zu.":
      "Вы выбыли и теперь только наблюдаете.",
    "Bereit – warte auf die anderen": "Готов — ожидание остальных",
    "Bereit für nächste Runde": "Готов к следующему раунду",
    "{ready} von {total} bereit": "Готовы: {ready} из {total}",
    "Letztes Kabu-Reaktionsfenster: {seconds} s":
      "Последнее окно реакции Kabu: {seconds} с",
    "{seconds} Sekunden für die Aktivität verbleibend":
      "На действие осталось {seconds} секунд",
    "Kartenfeld von {name}": "Карты игрока {name}",
    "aktiver Spieler": "активный игрок",
    "Ausgeschieden · {score} Punkte": "Выбыл · {score} очков",
    "Spieler ausgeschieden": "Игрок выбыл",
    Ausgeschieden: "Выбыл",
    "Gezogene Karte": "Взятая карта",
    Gezogen: "Взято",
    "{name} hält die gezogene Karte": "{name} держит взятую карту",
    "{name} sieht hier eine Karte an": "{name} просматривает здесь карту",
    "Falsche Karte aufgedeckt · Strafkarte":
      "Открыта неверная карта · Штрафная карта",
    "Zu späte Reaktion · Strafkarte": "Поздняя реакция · Штрафная карта",
    Spieltisch: "Игровой стол",
    "Mitspieler in Zugreihenfolge": "Соперники в порядке ходов",
    Tischmitte: "Центр стола",
    "Oberste Karte ziehen, {count} Karten übrig":
      "Взять верхнюю карту, осталось: {count}",
    "Nachziehstapel, {count} Karten übrig": "Колода, осталось карт: {count}",
    "Gezogene Karte auf den Ablagestapel legen":
      "Положить взятую карту в сброс",
    Ablagestapel: "Сброс",
    "Ablagestapel leer": "Сброс пуст",
    Leer: "Пусто",
    "Reaktionsfenster: keines": "Окно реакции: отсутствует",
    "Reaktionsfenster offen · Rang {rank}":
      "Окно реакции открыто · Ранг {rank}",
    "Reaktionsfenster verbraucht · Rang {rank} · weitere Versuche geben eine Strafkarte":
      "Окно реакции использовано · Ранг {rank} · дальнейшие попытки дают штрафную карту",
    Nahe: "Ближняя",
    Ferne: "Дальняя",
    "Verdeckte Karte": "Закрытая карта",
    "Aufgedeckte Karte": "Открытая карта",
    gebunden: "заблокирована",
    "zu spät – Strafkarte erhalten": "слишком поздно — получена штрафная карта",
    "falsche Karte – Strafkarte erhalten":
      "неверная карта — получена штрафная карта",
    "zum Schließen antippen": "нажмите, чтобы закрыть",
    auswählen: "выбрать",
    "Karte gehalten": "Карта удерживается",
    Gehalten: "Удерживается",
    "Zu spät · Strafkarte": "Слишком поздно · Штрафная карта",
    "Falsche Karte · Strafkarte": "Неверная карта · Штрафная карта",
    "{name} zieht eine Karte.": "{name} берёт карту.",
    "{name} legt die gezogene Karte ab.": "{name} сбрасывает взятую карту.",
    "{name} tauscht die gezogene Karte.": "{name} меняет взятую карту.",
    "{name} hält eine Karte zum Ansehen.":
      "{name} удерживает карту для просмотра.",
    "{name} legt die angesehenen Karten zurück.":
      "{name} возвращает просмотренные карты.",
    "{name} tauscht zwei Karten.": "{name} меняет две карты местами.",
    "{name} reagiert mit einer eigenen Karte.":
      "{name} реагирует своей картой.",
    "{name} reagiert auf {owner}s Karte.":
      "{name} реагирует на карту игрока {owner}.",
    "{name} gibt {recipient} die Ausgleichskarte.":
      "{name} передаёт игроку {recipient} карту замены.",
    "{name} erhält eine verdeckte Strafkarte.":
      "{name} получает закрытую штрафную карту.",
    "{name} deckt eine falsche Karte auf und erhält eine Strafkarte.":
      "{name} открывает неверную карту и получает штрафную карту.",
    "{name} reagiert zu spät und erhält eine Strafkarte.":
      "{name} реагирует слишком поздно и получает штрафную карту.",
    "{name} gibt {recipient} eine verdeckte Zusatzkarte.":
      "{name} даёт игроку {recipient} дополнительную закрытую карту.",
    "{value} Punkte": "{value} очков",
    "{seconds} Sekunden verbleibend": "Осталось секунд: {seconds}",
    "Runde {round} · Zwei nahe Karten ansehen und merken.":
      "Раунд {round} · Посмотрите и запомните две ближние карты.",
    "Runde {round} · Startansicht geschlossen. Auf Mitspieler warten.":
      "Раунд {round} · Начальный просмотр закрыт. Ожидание других игроков.",
  },
};

type Replacements = Record<string, string | number>;
type I18nValue = {
  language: Language;
  setLanguage: (language: Language) => void;
  t: (german: string, replacements?: Replacements) => string;
};

const I18nContext = createContext<I18nValue>({
  language: "de",
  setLanguage: () => undefined,
  t: (text, replacements) => interpolate(text, replacements),
});

function interpolate(text: string, replacements?: Replacements) {
  if (!replacements) return text;
  return Object.entries(replacements).reduce(
    (value, [key, replacement]) =>
      value.replaceAll(`{${key}}`, String(replacement)),
    text,
  );
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [language, setLanguage] = useState<Language>(() => {
    const stored = window.localStorage.getItem("kabu-language");
    return stored === "en" || stored === "ru" || stored === "de"
      ? stored
      : "de";
  });

  useEffect(() => {
    window.localStorage.setItem("kabu-language", language);
    document.documentElement.lang = language;
  }, [language]);

  const t = (german: string, replacements?: Replacements) =>
    interpolate(
      language === "de" ? german : (translations[language][german] ?? german),
      replacements,
    );

  return (
    <I18nContext.Provider value={{ language, setLanguage, t }}>
      {children}
    </I18nContext.Provider>
  );
}

export function useI18n() {
  return useContext(I18nContext);
}

export function LanguageMenu() {
  const { language, setLanguage, t } = useI18n();
  return (
    <label className="language-menu">
      <span>{t("Sprache")}</span>
      <select
        aria-label={t("Sprache")}
        value={language}
        onChange={(event) => setLanguage(event.target.value as Language)}
      >
        <option value="de">Deutsch</option>
        <option value="en">English</option>
        <option value="ru">Русский</option>
      </select>
    </label>
  );
}
