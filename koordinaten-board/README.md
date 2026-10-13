# Koordinaten-Board

Lokales Board für Minecraft-Koordinaten und **der Server der Companion**. Ein Gerät im Raum (Laptop, Mini-PC, Raspberry Pi am TV) zeigt die Orte der aktiven Welt groß an. Alle anderen öffnen per QR-Code die **Companion** am Handy, die das Board selbst ausliefert: Orte (am schnellsten per **Screenshot aus der Seed Map**), Sammelobjekte, Portal-Verbindungen, Banner und Rüstungs-Sets – alle Daten liegen auf dem Board.

Alles läuft offline im eigenen Netz: keine Cloud, kein Konto; die Texterkennung passiert seit Umbau Phase 3 am Handy selbst (im Browser).

## Funktionen

**Optik:** angelehnt an die Live-Karte der Minecraft Companion PWA – jede Dimension färbt die Oberfläche ein (Oberwelt grün, Nether rot, End violett).

**Anzeige** = das **Widget-Dashboard** (`../companion/widgets`, unter `/dashboard`, nur mit **Anzeige-Link**, seit Umbau Phase 1 auch auf dem Board-Gerät selbst). Seit Bauplan „Sitzung“ (S4, 13.10.2026) ist es die einzige Anzeige; die alte React-Anzeige unter `/anzeige` ist entfernt, alte Links leiten mit Schlüssel aufs Dashboard um.
- Widgets im Raster, je Anzeige ein eigenes Layout mit Layern; angeordnet wird am Handy
- **Orte der Welt:** angeheftete Orte groß oben (bis zu 6), alle anderen in drei Spalten (Oberwelt, Nether, End), mit Umrechnung Oberwelt ↔ Nether (÷ 8 / × 8) und „Neu“ für 90 Sekunden. Anders als die alte Anzeige scrollen lange Listen nicht von selbst, und neue Orte leuchten nicht auf
- **Beitreten** (QR-Code, Adresse, PIN), **Spieler** (wer mit dem Handy verbunden ist), **Zuletzt gespeichert**; im Kopf Titel, Seed, Uhr und Verbunden-Punkt
- Was am Handy „Aufs Board“ gelegt wird, erscheint als Widget im Layer „Sitzung“
- Strukturen mit Kennblock (z. B. Netherziegel für „Nether Fortress“) zeigen das Bild statt des Linien-Icons, auch in der Handy-Liste und im Ort-Detail. Bilder: `companion/icons/struktur_kennbloecke/` (der Server liefert sie unter `/icons/` aus), Zuordnung Typ → Bild: `companion/widgets/src/features/karten/lib/kennbloecke.ts`

**Handy: die Companion** (Startseite `/`)
- Der Server liefert die Companion aus (`../companion/companion-prototyp.html`, per `COMPANION_DATEI` austauschbar). Den QR-Code der Anzeige mit der normalen Kamera-App scannen → die Companion öffnet sich mit der PIN → Name eingeben → beigetreten.
- Alle Bereiche arbeiten auf den Daten des Boards (`server/daten/daten.db`, SQLite seit Umbau Phase 4): Welten mit Seed, Orte der Karte, Sammelobjekte, Portal-Verbindungen, Banner, Rüstungs-Sets. Änderungen kommen bei allen Handys live an.
- Der **Rüstungs-Baukasten** der Companion (`companion/ruestungs-baukasten/`: Texturen, fertige Icons, `baukasten.js`, `figur3d.js`, `manifest.json`) wird unter `/ruestungs-baukasten/` ausgeliefert. Erst über http kann die Companion die Texturen umfärben und die 3D-Figur bauen.
- **Screenshot auslesen** macht das Handy selbst (`companion/texterkennung.js`, tesseract.js im Browser; Umbau Phase 3): Kategorie, Variante (die Klammer im Titel, z. B. „Stairway“), X/(Y)/Z und Dimension. Kleine OCR-Fehler werden korrigiert. Der Server liefert dafür nur `texterkennung.js` und `vendor/tesseract/` aus und lädt dieselbe Auswertung per `node:vm` (`server/src/texterkennung.js`) für seine Feature-Liste und Tests.
- **Banner-Anleitungen** („Black Base“, „Cyan Bordure“ …) erkennt dieselbe Texterkennung am Handy, wenn kein Seed-Map-Popup drauf ist: Das Bild wird vergrößert und in Schwarz-Weiß umgewandelt (sonst liest Tesseract weiße Schrift auf Grau nicht), die Zeilen werden unscharf den englischen Farb- und Musternamen aus `regeln.js` zugeordnet (alles in `companion/texterkennung.js`).
- Geprüft wird mit denselben Regeln wie in der Companion: Der Server lädt `../companion/regeln.js` (`server/src/regeln.js`).
- **Anzeige steuern** (Board-Sheet der Companion): Welt auf der Anzeige, Titel, QR-Code zeigen; Orte im Detail „Auf der Anzeige anheften“.
- **Beitreten mit Account** (`server/src/identitaet.js`): Board-PIN aus dem QR-Code (bleibt als Zugang zum Server; seit Umbau Phase 1 mindestens 6 Ziffern), dann Account wählen oder anlegen – Name plus **eigene PIN** (4–8 Ziffern, nur als scrypt-Hash gespeichert). Das Token ist der Geräteschlüssel: Es nennt Account und Gerät (`benutzer`, `profile`, `geraete` in `daten.db`); ein gesperrtes Gerät oder ein Token von vor den Accounts gilt nicht mehr. Einträge tragen die Benutzer-ID als `erstellerId`. Nach **5 falschen PINs** ist das Gerät **60 s gesperrt** (`server/src/sperre.js`) – für die Board-PIN je Gerät, für die eigene PIN je Gerät und Account. Als Adresse des Geräts gilt hinter dem Cloudflare-Tunnel der Header `CF-Connecting-IP` (nur, wenn die Verbindung von `127.0.0.1` kommt, also von `cloudflared`); im Heimnetz die IP des Handys. **CORS** (Umbau Phase 1): Für alle `/api`-Pfade und `/ws` gelten nur die Ursprünge aus `ERLAUBTE_URSPRUENGE` und der eigene Ursprung des Servers, mit allen Methoden (`GET, POST, PUT, DELETE`). Fremde Ursprünge bekommen 403, auch beim WebSocket. Anfragen ohne `Origin` (Kamera-App, `curl`) sind davon nicht betroffen.
- **Aufs Board** (Bauplan „Sitzung“): Jeder Inhalt der Companion (Ort, Sammelobjekt, Sammel-Fortschritt, Portal-Verbindung, Banner, Rüstungs-Set) lässt sich auf die Anzeige legen. Das Handy schickt nur die Quelle (`{ art:"zeigen", quelle:"portal:<id>", anzeigeId? }`), der Server legt den Inhalt als **Widget in die Sitzung der Anzeige** (`server/src/sitzung.js`): erste freie Stelle mit den Größen aus `companion/widget-groessen.mjs`, Antwort `ok { instanzId, titel }`, live `geaendert` „layout“ mit `anzeigeId`; `{ art:"verbergen", instanzId }` nimmt es weg. Die Sitzung erscheint als Layer „Sitzung“ im Layout (nur im Speicher, nach einem Neustart leer); jede Instanz trägt `herkunft` (Quelle, wie die Companion sie nennt), `titel`, `von` und `farbe`. Die Karte des Widgets baut der Server mit den Anzeigeschemas aus `companion/board-karten.js` und prüft sie mit `server/src/zeigen.js`; mit `typ` (Seed-Map-Typ) steht der Kennblock neben dem Titel. Der frühere Weg mit fertiger Karte vom Handy und die Nachricht `gezeigt` sind mit S4 entfallen; eine veraltete Companion bekommt „Die Companion ist veraltet – bitte neu laden“.
- **Welt-Import (Biome)**: Die Companion liest einen hochgeladenen Weltordner (`.zip`/`.mcworld`) selbst im Browser (Web Worker) und schickt die Biome als Kacheln ans Board (`PUT /api/welten/:id/biome`, geprüft mit `biomImportPruefen` aus `regeln.js`, bis 64 MB). Das Board speichert sie in `daten.db` (eine Zeile je Kachel, seit Umbau Phase 4) und meldet `geaendert` „biome“. Die **Funde** aus derselben Welt (Strukturen, Portal-Verbindungen, Schmiedevorlagen, Rüstungs-Sets, Banner) kommen danach in einem Rutsch über `POST /api/welten/:id/funde` (`daten.fundeAnlegen`, jeder Eintrag wie bei seiner eigenen Route geprüft, je Bereich eine Meldung; Bauplan „Welt-Funde“, W2). Worker, Dekoder und Bibliothek liefert es unter `/biom-import.worker.js`, `/biom-welt.js`, `/biom-dekoder.js`, `/biom-ids.js` und `/vendor/` aus. Biom-Punkte aus Screenshots gibt es nicht mehr; alte entfernt der Server beim Übernehmen einer `daten.json` (Sicherung `daten.vor-welt-import.json`).
- **Widget-Dashboard** (`companion/widgets`, die Anzeige): Der Server liefert den Build unter `/dashboard` aus (eigene Routen wie `/dashboard/vollbild/…` → `index.html`; `/dashboard?anzeige=…&schluessel=…` behält den Anzeige-Link). `GET /api/widgets/:typ?quelle=…` liefert die fertige Karte eines Widget-Typs (z. B. `portale.verbindungen`, `banner.banner?quelle=b_3`) aus den Daten der aktiven Welt – gebaut mit denselben Anzeigeschemas wie „Aufs Board“ (`companion/board-karten.js`, per `node:vm` geladen), geprüft mit `zeigen.js`. Ohne Inhalt kommt `{ karte:null, hinweis }` (Bereich geplant, keine Welt, Quelle gelöscht). `GET /api/widgets/:typ/quellen` nennt, was man beim Hinzufügen als Quelle wählen kann. Lesen darf die Anzeige (mit Anzeige-Link) und jedes beigetretene Handy; nach Änderungen meldet `/ws` wie immer `geaendert`. Die Banner-Vorschau rendert der Server als PNG (`pngjs`), die Rüstungs-Figur gibt es nur in der Companion.
- **Layout pro Anzeige** (Widget-Dashboard, A6): Jede Anzeige hat ihr eigenes Widget-Layout (Layer mit Widgets im Raster, aktiver Layer) und meldet, wie viele Reihen auf ihren Bildschirm passen (`PUT /api/anzeige/reihen`). Das Dashboard liest sein Layout über `GET /api/anzeige/layout` (welche Anzeige, sagt der Anzeige-Link). Handys lesen und speichern es über `GET/PUT /api/anzeigen/:id/layout` (Form geprüft in `server/src/layout.js`) und starten mit `PUT /api/anzeigen/:id/vollbild` `{ instanzId|null }` das Vollbild an der Anzeige; Änderungen gehen live als `geaendert` „layout“. Angeordnet wird am Handy unter `/dashboard/anordnen` (aus der Companion: Board → Anzeigen → „Anzeige anordnen“).
- **Nachladen nach Unterbrechung** (Bauplan Offline, B3): Jede `geaendert`-Meldung trägt `nr` (fortlaufend) und `lauf` (neu bei jedem Start); beim Verbinden schickt `/ws` `{ art:"stand", lauf, nr }`. `GET /api/aenderungen?seit=<nr>&lauf=<lauf>` nennt je Bereich einmal `{ bereich, weltId, anzeigeId? }`, was seitdem geändert wurde, oder `alles:true` (anderer Lauf, Lücke größer als die letzten 1 000 Meldungen, Unsinn). Die Nummern führt der Server nur im Speicher.
- **Widgets der Anzeige** (Bauplan „Sitzung“, S3): Orte der Welt, Beitreten, Spieler und „Zuletzt gespeichert“ rendert das Dashboard selbst aus `zustand` und `teilnehmer` vom `/ws`, dazu im Kopf Titel, Seed, Uhr und Verbunden-Punkt. Den QR-Code zum Beitreten liefert `GET /api/anzeige/qr` als SVG (nur mit Anzeige-Link).
- Aus der früheren Handy-Oberfläche des Boards noch nicht übernommen: Notiz, Kartenausschnitt als Bild, Export als JSON.

## Starten

Voraussetzung: [Node.js](https://nodejs.org) **22.13 oder neuer** (seit Umbau Phase 4 wegen `node:sqlite`; Node 22 LTS passt).

**Betrieb:** Der Server läuft auf dem Raspberry Pi als Dienst hinter einem Cloudflare-Tunnel (`api.mainhubv1.com`), die Seiten kommen von Netlify (`mainhubv1.com`). Einrichtung und Update: [`pi/ANLEITUNG.md`](pi/ANLEITUNG.md). Die Startskripte für den Betrieb vom Laptop aus (`start.bat`, `start.sh`, Firewall-Freigabe, LAN-Erkennung) sind mit Umbau Phase 6 entfallen (E18, 13.10.2026).

**Lokal (Entwicklung):**
```bash
npm run installieren
npm run build
npm start
```
Ohne `OEFFENTLICHE_URL` zeigen QR-Code und Anzeige-Link auf `http://localhost:3000`. Sollen Handys im WLAN den lokalen Server erreichen, die eigene Adresse setzen (`OEFFENTLICHE_URL=http://192.168.178.23:3000`) und die Firewall des Rechners für den Port freigeben.

**Dashboard von einem anderen Server** (Umbau Phase 2): Es liest beim Bauen `VITE_API_URL` (z. B. `https://api.mainhubv1.com`) für `fetch` und WebSocket; leer heißt eigener Ursprung. Die Companion liest ihre Board-Adresse aus `companion/konfig.js`. Der Server braucht dann den Ursprung der Seiten in `ERLAUBTE_URSPRUENGE`.

`npm run installieren` holt die Pakete von Server und Dashboard, `npm run build` baut das Dashboard (die Anzeige, `../companion/widgets/dist`). Geöffnet wird es mit dem Anzeige-Link `http://…:3000/dashboard?anzeige=…&schluessel=…`.

Die Konsole zeigt dann die Adresse für die Handys und die PIN. Einfacher: den QR-Code auf der Anzeige scannen – die PIN ist darin schon enthalten.

**Anzeige auf einem anderen Gerät** (TV-Browser, Tablet, zweiter Laptop): Der Server läuft auf einem Rechner, die Anzeige kann auf jedem Gerät im WLAN laufen. Dafür hat jede Anzeige einen **Anzeige-Link** mit eigenem Schlüssel:
- Die Konsole nennt ihn beim Start: `Anzeige: http://192.168.…:3000/dashboard?anzeige=a_1&schluessel=…`
- In der Companion unter **Board → Anzeigen**: Link kopieren oder als QR-Code zeigen (mit dem Tablet abscannen), Anzeigen anlegen und umbenennen. **Neuer Schlüssel** macht alte Links ungültig; verbundene Anzeigen mit altem Link werden getrennt.
- Der Browser merkt sich den Schlüssel – nach einem Neustart des TVs reicht `http://…:3000/dashboard`. Alte Links auf `/anzeige` leiten dorthin um, mit Schlüssel.
- **Auch das Gerät, auf dem der Server läuft, braucht den Link** (Umbau Phase 1: hinter einem Tunnel käme sonst jede Anfrage aus dem Internet als `localhost` herein). Der Server schreibt den Link der ersten Anzeige nach `<Datenordner>/anzeige-link.txt` (auf dem Pi `/var/lib/companion-board/`). Den Notschalter `ANZEIGE_OFFEN` gibt es nicht mehr.

## Handy verbindet nicht?

**Im Betrieb (Pi + Netlify):** `https://api.mainhubv1.com/api/server` muss `{"name":"koordinaten-board"}` liefern. Kommt nichts, am Pi `sudo systemctl status companion-board cloudflared` und `journalctl -u companion-board -f` ansehen (Fehlersuche in `pi/ANLEITUNG.md`). Kommt ein CORS-Fehler in der App, fehlt der Ursprung der Seiten in `ERLAUBTE_URSPRUENGE` (`/etc/companion-board.env`).

**Lokaler Server im WLAN:**
1. **Adresse:** `OEFFENTLICHE_URL=http://<eigene IP>:3000` setzen (`ipconfig` → WLAN-Adapter, `ip a` unter Linux); sonst zeigt der QR-Code auf `localhost`.
2. **Firewall:** eingehende Verbindungen auf dem Port für das eigene Netz erlauben (Windows: „Private Netzwerke erlauben“ beim ersten Start, oder eine Regel für `node.exe` in der Firewall).
3. **Selbes Netz:** Handy im gleichen WLAN wie der Rechner – nicht im Gäste-WLAN (Geräte sind dort voneinander abgeschottet) und nicht über mobile Daten.
4. **Adresse genau so eingeben:** `http://…:3000` – mit Port, ohne `https`.
5. **Gegenprobe:** Die Adresse aus dem QR-Code im Browser auf dem Rechner selbst öffnen. Lädt sie dort, aber nicht am Handy, liegt es an Firewall oder Netz.

## Ablauf mit der Seed Map

1. Auf der Seed Map (z. B. chunkbase.com) einen Ort antippen, sodass das Popup mit Name und Koordinaten aufklappt
2. Screenshot machen – die Dimension oben im Dropdown darf mit drauf sein, dann wird sie mit erkannt
3. In der Companion (Karte) unten auf **Screenshot** tippen, einen oder gleich mehrere Screenshots auswählen
4. Erkannte Werte prüfen, ggf. korrigieren → **speichern**

Ist ein Popup von Werbung verdeckt oder nicht aufgeklappt, meldet das Board „Kein Popup gefunden“ statt falsche Werte zu raten.

## Auf dem Raspberry Pi (Umbau Phase 6)

Dienstdatei, Umgebung, Tunnel-Konfiguration und Sicherung liegen in [`pi/`](pi/), die Schritte für Pi, Cloudflare und Netlify in [`pi/ANLEITUNG.md`](pi/ANLEITUNG.md).

## Entwicklung

```bash
npm run dev:server    # Server mit Auto-Neustart auf :3000
npm run dev:dashboard # Vite für das Dashboard (companion/widgets, siehe dessen README)
npm test              # Server-Tests: Daten, Companion-API, Regeln, Auswertung der Texterkennung, Karten, Netzwerk, PIN-Sperre
```

Aufbau:
```
server/src/server.js        Fastify: Beitritt, WebSocket, liefert Companion (/) und Anzeige (Dashboard, /dashboard) aus
server/src/daten.js         gemeinsame Daten im Speicher: Welten, Orte, Sammelobjekte, Banner, Rüstungs-Sets, Portale, Anzeigen, Accounts, Einstellungen
server/src/speicher.js      SQLite (daten.db, node:sqlite, WAL): je Sammlung eine Tabelle mit version je Zeile, Änderungsnummer, Biome je Kachel
server/werkzeuge/nach-sqlite.mjs  Umzug daten.json → daten.db von Hand (macht der Server beim ersten Start auch selbst)
server/src/companion-api.js REST-API der Companion unter /api (Vertrag: companion-prototyp.html, Abschnitt 4)
server/src/regeln.js        lädt ../companion/regeln.js (und board-karten.js) per node:vm – dieselben Regeln wie am Handy
server/src/widgets.js       Widget-Typ + Quelle → Karte fürs Dashboard (GET /api/widgets/:typ)
server/src/layout.js        Widget-Layout einer Anzeige prüfen (Form, Widget-Typen, Grenzen)
server/src/sicht.js         Orte der aktiven Welt in der Form, die die Anzeige kennt
server/src/texterkennung.js lädt ../companion/texterkennung.js per node:vm: Feature-Liste und Auswertung der Texterkennung (OCR selbst läuft am Handy)
server/src/zeigen.js        Karten prüfen (Widgets, „Aufs Board“)
server/src/sitzung.js       Sitzung je Anzeige (Bauplan „Sitzung“): Widgets von „Aufs Board“, nur im Speicher, erste freie Stelle
../companion/widget-groessen.mjs  Größenstufen aller Widget-Typen und Passt-Prüfung, gemeinsam für Server und Dashboard
server/src/sperre.js        Sperre nach falschen PINs
../companion/widgets/       Widget-Dashboard = die Anzeige (Vite, React; VITE_API_URL beim Bauen für Netlify ↔ Pi)
```

Neue Feature-Typen für die Texterkennung: Liste `FEATURES` in `../companion/texterkennung.js`. Kategorien, Biome und Regeln stehen in `../companion/regeln.js`.

## Daten

Alles liegt in `server/daten/`:
- `daten.db` (+ `daten.db-wal`, `daten.db-shm`) – **SQLite seit Umbau Phase 4**: alle Welten, Orte, Sammelobjekte, Banner, Rüstungs-Sets, Portal-Verbindungen, Anzeigen mit ihren Schlüsseln, Accounts, Geräte, Einstellungen und die Biome des Welt-Imports (eine Zeile je Kachel). Jede Zeile trägt `version`, jede geschriebene Zeile landet in `aenderungen` (fortlaufende Nummer, später für das Nachholen nach Verbindungsabbruch). **Sichern** im laufenden Betrieb: `sqlite3 daten.db ".backup sicherung.db"` (nachts per Cron vom Pi wegkopieren); bei gestopptem Server reicht Kopieren.
- `daten.json`, `biome/<weltId>.json` – der Stand **vor** dem Umzug nach SQLite. Beim ersten Start mit leerer `daten.db` übernimmt der Server sie einmal (Konsole meldet es) und liest sie danach nie wieder; sie bleiben als Sicherung liegen. Von Hand: `npm run nach-sqlite -- <Ordner>` (an einer Kopie ausprobieren).
- `daten.vor-welt-import.json` – Sicherung, falls beim Umstieg auf den Welt-Import alte Biom-Punkte entfernt wurden
- `zustand.json`, `medien/` – Orte und Bilder der früheren Handy-Oberfläche; werden nicht mehr gelesen und bleiben als Sicherung liegen
- `pin.txt` – Board-PIN, 6 Ziffern (löschen = neue PIN beim nächsten Start; eine alte 4-stellige ersetzt der Server beim Start)
- `anzeige-link.txt` – Anzeige-Link der ersten Anzeige (aufs Dashboard), z. B. für einen Kiosk-Browser (schreibt der Server bei jedem Start und bei „Neuer Schlüssel“)
- `geheim.txt` – Schlüssel für die Anmeldungen (löschen = alle Handys müssen sich neu anmelden; die Accounts bleiben)

## Einstellungen per Umgebungsvariable

| Variable | Standard | Zweck |
|---|---|---|
| `PORT` | `3000` | Port des Servers |
| `ERLAUBTE_URSPRUENGE` | `http://localhost:5173,http://127.0.0.1:5173` | Ursprünge (kommagetrennt), die `/api` und `/ws` aus dem Browser nutzen dürfen, z. B. später `https://mainhubv1.com`. Der eigene Ursprung des Servers gilt immer |
| `HOST` | `0.0.0.0` | Lausch-Adresse. Im Heimnetz bleibt `0.0.0.0` (Handys im WLAN); auf dem Pi hinter `cloudflared` `127.0.0.1`, dann erreicht den Server nur der Tunnel |
| `RAUM_PIN` | zufällig, in `pin.txt` | feste Board-PIN setzen, mindestens 6 Ziffern (sonst startet der Server nicht) |
| `OEFFENTLICHE_URL` | `http://localhost:3000` | Adresse im QR-Code und im Anzeige-Link; auf dem Pi die Netlify-Adresse (`https://mainhubv1.com`), lokal fürs WLAN die eigene IP. Die automatische LAN-Erkennung ist mit Umbau Phase 6 entfallen |
| `COMPANION_PFAD` | `/` | Pfad der Companion unter dieser Adresse: lokal `/`, auf Netlify `/app/` (Umbau Phase 5) |
| `DATEN_ORDNER` | `server/daten` | Speicherort |
| `COMPANION_ORDNER` | `../companion` | Ordner mit Companion-Seite, `regeln.js`, `icons/`, `ruestungs-baukasten/` und den Dateien des Welt-Imports (`biom-*.js`, `vendor/`) |
| `COMPANION_DATEI` | `companion-prototyp.html` | Seite, die unter `/` ausgeliefert wird (der Prototyp ist der Hauptstand, Entscheidung von Max, 13.10.2026) |
