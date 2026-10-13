# Minecraft Companion & Koordinaten-Board

> **Seit dem 05.10.2026 in diesem Repo `Companion-Board`.** Der Umbau auf Netlify + Raspberry Pi ([`docs/plaene/UMBAUPLAN.md`](docs/plaene/UMBAUPLAN.md), abgeschlossen am 13.10.2026) hat hier ohne den alten Verlauf begonnen; die Historie bis zum Umzug liegt in [`cloud7too9/flexibel-visionboard`](https://github.com/cloud7too9/flexibel-visionboard).

Zwei Projekte für eine gemeinsame Minecraft-Welt im Raum – seit dem 29.09.2026 **ein System**: Das Koordinaten-Board ist der Server der Companion und zeigt die Orte groß im Zimmer an. Jedes Projekt behält seine Technik, Tests und Doku.

| Ordner | Projekt | Stand |
|---|---|---|
| [`companion/`](companion/) | **Companion**: die App am Handy – Karte, Sammelobjekte, Portal-Verwaltung, Banner, Rüstung (eine HTML-Seite + `regeln.js`, Vanilla JS) | aktuelle Arbeit |
| [`companion/widgets/`](companion/widgets/) | **Widgets**: Widget-Dashboard fürs Board unter `/dashboard` (Vite + React + TypeScript, aus MainHub): 13 Widget-Typen, Karten vom Board, Bereichs-Themes, Layout je Anzeige | A0–A6 gebaut, A7 offen |
| [`koordinaten-board/`](koordinaten-board/) | **Koordinaten-Board**: Server der Companion (Daten, Live-Sync, Sitzung der Anzeige; Fastify). Die Anzeige im Zimmer ist das Widget-Dashboard | zusammengeführt, läuft auf dem Pi |
| [`planung/`](planung/) | **Planung, was noch offen ist**: Gesamtplan Widget-Dashboard, Offline-Sync, Welt-Import ([`PLAN.md`](planung/PLAN.md)), Übergabe, Warteliste, offene Ideen und Baupläne | Umbau abgeschlossen (13.10.2026): Betrieb unter `mainhubv1.com`, Server auf dem Pi |
| [`docs/`](docs/README.md) | **Archiv, was erledigt ist**: abgeschlossene Pläne und Baupläne (Umbauplan, Widget-Dashboard A1–A5, Welt-Import), Verlauf der Runden und PRs, erledigte Haltepunkte und Entscheidungen | nur zum Nachschlagen |
| [`referenz/`](referenz/) | **Gemeinsame Referenz**: Datenmodell, Seed-Map-Screenshots, Dashboard-Vorbild | – |

**Neuer Chat / Weitermachen:** zuerst [`UEBERGABE.md`](UEBERGABE.md) lesen (Arbeitsweise, Zusammenspiel, offene Entscheidungen), danach die Übergabe des Projekts, um das es geht. Stand der Umsetzung des Plans: [`planung/UEBERGABE.md`](planung/UEBERGABE.md). Was auf Max wartet, steht in [`planung/WARTELISTE.md`](planung/WARTELISTE.md).

## Wie die Projekte zusammenhängen

- Das **Board** hält alle Daten (`koordinaten-board/server/daten/daten.db`, SQLite) und liefert lokal die Seiten aus wie Netlify: die Anmeldeseite unter `/`, die Companion unter `/app/`. Handys scannen den QR-Code der Anzeige und melden sich mit ihrem Konto an (Anzeigename + Passwort, danach die PIN; neue Konten gibt ein anderes Konto frei); Änderungen kommen bei allen live an.
- Handy und Server prüfen mit **derselben Datei** `companion/regeln.js` und bauen Karten mit derselben Datei `companion/board-karten.js`.
- Die **Anzeige** ist das **Widget-Dashboard** (`/dashboard`, seit Bauplan „Sitzung“ die einzige Anzeige): je Anzeige ein Layout aus Widgets, dazu Orte der aktiven Welt, QR-Code zur Anmeldeseite und Spieler. Jeder Inhalt der Companion lässt sich per „Aufs Board“ als Widget in die Sitzung legen; die Karten baut das Board mit den Anzeigeschemas aus `BOARD_KARTEN`.
- Seed-Map-Screenshots und Banner-Anleitungen liest die Companion seit Umbau Phase 3 am Handy selbst aus (`companion/texterkennung.js`, tesseract.js im Browser).
- Beide nutzen dieselbe Optik (Dimensions-Themes aus `modul-a-live-karte.html`) und dieselben Seed-Map-Screenshots als Grundlage.
- `modul-a-live-karte.html`, die Hauptdatei der Companion-PWA, liegt **nicht** in diesem Repo. Max pflegt sie selbst; das Board kann sie später statt des Prototyps ausliefern (`COMPANION_DATEI`).

## Netlify (Umbau Phase 5)

`netlify.toml` baut die Seite aus diesem Repo: Companion-PWA unter `/app/`, die Anzeige (Widget-Dashboard) unter `/dashboard/`; `/` und alte Links auf `/anzeige` leiten dorthin (`netlify/bauen.sh`, Routen in `netlify/_redirects`). In Netlify: Site aus dem GitHub-Repo anlegen (Branch `main`), unter *Site configuration → Environment variables* `API_URL` auf die Adresse der API setzen (`https://api.mainhubv1.com`; ohne sie laufen die Seiten im DEMO-/Beispiel-Modus). Der Build wird lokal geprüft: `companion/tests/netlify.test.mjs`. Schritte für Domain, Tunnel und Pi: [`koordinaten-board/pi/ANLEITUNG.md`](koordinaten-board/pi/ANLEITUNG.md).

## Schnellstart

```bash
# Alles zusammen: Board starten, dann am Handy den QR-Code der Anzeige scannen
cd koordinaten-board && npm run installieren && npm run build && npm start   # lokal; der Betrieb läuft auf dem Pi, siehe koordinaten-board/pi/ANLEITUNG.md
#   Companion: http://<ip>:3000/?pin=<PIN>   Anzeige (Dashboard): Anzeige-Link aus der Konsole (auch am Board-Gerät, Umbau Phase 1)
#   Anzeige auf einem anderen Gerät (TV, Tablet): Anzeige-Link aus der Konsole oder Companion → Board → Anzeigen
#   npm run build baut das Dashboard (die Anzeige); installieren holt dessen Pakete mit

# Companion ohne Board (DEMO-Mock mit Beispielwelt)
open companion/companion-prototyp.html

# Tests
cd koordinaten-board && npm test                        # Server: Daten, API, Regeln, Auswertung der Texterkennung …
cd companion/tests && npm install && npm test           # Playwright, auch gegen ein echtes Board (vorher: Board bauen)
cd companion/widgets && npm install && npm test         # Widgets: Vitest
```

Auf GitHub laufen dieselben Tests bei jedem Pull Request und jedem Push auf `main` ([`.github/workflows/tests.yml`](.github/workflows/tests.yml)). Die Screenshots der Playwright-Tests hängen als Download „bilder“ am Lauf.

Details stehen jeweils in `companion/README.md` und `koordinaten-board/README.md`.
