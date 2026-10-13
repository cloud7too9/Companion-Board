# Übergabe · Umsetzung des Plans (Stand 13.10.2026)

> **Einstieg für den nächsten Chat:** zuerst [`../UEBERGABE.md`](../UEBERGABE.md) (Arbeitsweise, Konventionen), dann diese Datei, dann [`WARTELISTE.md`](WARTELISTE.md) (was auf Max wartet). Der Plan selbst steht in [`PLAN.md`](PLAN.md).
>
> Diese Datei beschreibt, was aus `PLAN.md` gebaut ist, wo es liegt, wie man es startet und testet und was als Nächstes kommt.
>
> **Erledigtes liegt im Archiv [`../docs/`](../docs/README.md):** abgeschlossene Pläne und Baupläne (Umbauplan, A1–A5, Welt-Import), der Verlauf der Runden mit allen PRs und die erledigten Haltepunkte und Entscheidungen.

---

## 1. Kurzfassung

- **Gebaut und in `main`:**
  - Strang C (ganzer Biom-Import), mit der Fixture-Welt von Max und Biom-ID 195
  - das Widget-Dashboard A0–A6, einschließlich **Anordnen am Handy**
  - aus Strang B die Phasen **B1** (Datenmodell) und **B2** (Accounts mit PIN)
  - der **Umbau auf Netlify + Raspberry Pi** (Phasen 1–6, in Betrieb unter `mainhubv1.com` seit 13.10.2026; Plan im Archiv: `docs/plaene/UMBAUPLAN.md`, Einrichtung: `koordinaten-board/pi/ANLEITUNG.md`)
  - der **Bauplan „Sitzung“** (S1–S4, 13.10.2026): [`bauplaene/Bauplan-Sitzung.md`](bauplaene/Bauplan-Sitzung.md). **Das Widget-Dashboard ist die einzige Anzeige**, „Aufs Board“ legt ein Widget in die Sitzung der Anzeige, `/` und `/anzeige` leiten auf `/dashboard/` um.
  - **CI auf GitHub:** Bei jedem PR und jedem Push auf `main` laufen alle Tests (Kapitel 6)
  - **Nur Bedrock (E15):** Java gibt es nirgendwo mehr
- **Als Nächstes** (Kapitel 9):
  1. ⏸ **H10**: Probe nach dem Umschalten auf das Dashboard (Max, `koordinaten-board/pi/ANLEITUNG.md`). Danach wandert auch der Bauplan „Sitzung“ ins Archiv.
  2. **Offline B3–B5**, neu zugeschnitten (13.10.2026): B3 = Live-Modus ohne Netz, IndexedDB, Nachladen über `/api/aenderungen` (Nachtrag im Offline-Bauplan).
  3. A7 (Größenstufen je Widget): Planungsrunde mit Max
  4. Inhalte, die noch nicht beschrieben sind (Warteliste, Kapitel 4)
  5. **Bauplan „Welt-Funde“** (erweiterter Welt-Import, E21): [`bauplaene/Bauplan-Welt-Funde.md`](bauplaene/Bauplan-Welt-Funde.md) wartet auf die Antworten zu fünf Fragen, danach W1–W3.
- **Git:** Gearbeitet wird im Repo `cloud7too9/Companion-Board` (seit 05.10.2026). **Gemergt wird nur nach Rückfrage bei Max**, auch wenn Claude den Merge ausführt. Die Runden mit allen PRs: `docs/verlauf/Runden-und-PRs.md`.
- **Tests:** alle grün in `main`, lokal und in der CI (Kapitel 6).

---

## 2. Stand je Phase

| Phase | Ergebnis | Wichtige Dateien |
|---|---|---|
| **C** Welt-Import | `.zip`/`.mcworld` im Browser lesen (Web Worker). Biome als Kacheln ans Board, je Welt in `biome/<weltId>.json`. Import-Sheet mit Anleitung (iPhone), Prüfung, Fortschritt. Biom-Ebene auf der Karte. Phase 1 an der Fixture-Welt geprüft. | `companion/biom-welt.js`, `biom-import.worker.js`, `biom-ids.js`, `regeln.js` (`biomImportPruefen`), Board `daten.js` (`biome…`), `companion/tests/daten/fixture-seed.mcworld` |
| **Anzeige-Link** | Jede Anzeige hat einen eigenen Schlüssel. Andere Geräte (TV, Tablet) werden mit dem Link zur Anzeige. QR-Code und Verwaltung stehen im Board-Sheet der Companion. | Board `server.js` (`anzeigeZugang`), `daten.js` (`anzeige…`), `features/karten/lib/zugang.ts` |
| **A0** Übernahme | MainHub läuft als `companion/widgets/` (Vite, React, TS, Tailwind, zustand). | `companion/widgets/` |
| **A1** Raster | 32 Spalten, quadratische Zellen, die Reihen folgen der Höhe. | `lib/raster.ts` |
| **A2** Größen-Vertrag | Größenstufen statt freier Größen. Passt-Prüfung mit Belegungsmatrix. Vollbild als eigene Route. | `model/widget-vertrag.ts`, `lib/collision-utils.ts`, `pages/VollbildPage.tsx` |
| **A3** Struktur | Die Kette Bereich → Widget-Typ → Instanz. Zusatzinhalte je Stufe. Galerie mit Suche. | `model/widget-struktur.ts`, `components/AddPanelModal.tsx` |
| **A4** Register und Karten | **13 Typen**. Typen mit Quelle gibt es mehrfach; die Quelle wählt man beim Hinzufügen. Gehäuse und Inhalt sind getrennt. **Die Karten baut der Server** mit denselben Anzeigeschemas wie „Aufs Board“. Ohne Board gibt es Beispielkarten, Änderungen kommen live über `/ws`. | `companion/board-karten.js`, Board `widgets.js`, `features/karten/`, `model/widget-register.ts` |
| **A5** Themes | Theme je Bereich: Karte nach Dimension, Handbuch als Buch, Baupläne blau mit Gitter, Portale schwarz-lila ohne Rot und Grün. Platzhalter für E8. | `model/widget-themes.ts`, `shared/styles/themes.css` |
| **A6** Layout pro Anzeige | Layout und Reihen je Anzeige am Server. Am Board ist das Dashboard reine Anzeige (live). **Anordnen am Handy** unter `/dashboard/anordnen`: leere Widgets, Auswahl-Leiste, Galerie, Layer, Vollbild steuern. Das Board liefert `/dashboard` aus. | Board `layout.js`, `daten.js` (`anzeigeLayout…`), `pages/AnordnenPage.tsx`, `features/anordnen/` |
| **B1** Datenmodell | IDs neuer Einträge kommen vom Handy (UUID, auch über http). Jeder Eintrag hat `erstellerId`. Es gibt die Sammlungen `benutzer`, `profile`, `geraete`. | `regeln.js` (`neueEintragId`, `idGueltig`), Board `daten.js` (`eintragId`) |
| **B2** Accounts mit PIN | Board-PIN, dann Account wählen oder anlegen (Name + eigene PIN, 4–8 Ziffern). Die PIN wird nur als **scrypt-Hash** gespeichert. Sperre je Gerät und Account. Das Token ist der **Geräteschlüssel**. `werBistDu()` gekapselt an Board und Companion. | Board `identitaet.js`, Companion `IDENTITAET`, Sheet „Beitreten“ |
| **E15** Nur Bedrock | Portal-Prüfung mit festem Suchradius ±128 (`PORTAL_SUCHRADIUS`), kein Umschalter, kein `edition` mehr im Kontext der Karten. Der Welt-Import weist Java-Welten mit klarer Meldung ab. | `companion/board-karten.js`, Portal-Verwaltung in `companion-prototyp.html` |
| **CI** | Drei Jobs bei jedem PR und Push auf `main`, Screenshots als Download „bilder“ | `.github/workflows/tests.yml` |
| **B3–B5** Offline | nicht gebaut. N5 ist hinfällig (HTTPS über Netlify/Cloudflare); B3 neu zugeschnitten, siehe Nachtrag im Offline-Bauplan. Gebaut ist davon schon der Service Worker mit versioniertem Cache (Umbau Phase 5). | `companion/sw.js` |
| **Umbau** Netlify + Pi | Phasen 1–6: Server abgesichert (Anzeige nur mit Link, `HOST`, `CF-Connecting-IP`, CORS, 6-stellige PIN), API-Adresse konfigurierbar, Texterkennung am Handy, SQLite, Netlify-Build mit PWA, Pi mit Tunnel. Plan im Archiv. | `netlify/`, `koordinaten-board/pi/`, `docs/plaene/UMBAUPLAN.md` |
| **E16** Sitzung | S1–S4 gebaut (13.10.2026): Sitzung je Anzeige am Server, „Aufs Board“ mit Quelle, Widgets der Anzeige (Orte, Beitreten, Spieler, Zuletzt), Kopf der Anzeige, Dashboard ist die einzige Anzeige. ⏸ H10 offen. | Board `sitzung.js`, `companion/widget-groessen.mjs`, `features/anzeige/`, `netlify/_redirects` |
| **A7** Größenstufen | nicht gebaut: Planungsrunde mit Max (E6) | – |

Pfade unter `model/`, `lib/`, `components/` und `features/` liegen in `companion/widgets/src/` (`model/`, `lib/` und `components/` unter `features/workspace/`). „Board“ meint `koordinaten-board/server/src/`.

---

## 3. Branches und Mergen

- **Mergen:** nur nach Rückfrage bei Max, immer mit **„Create a merge commit“**.
- **Branch der Cloud-Sitzung:** Claude arbeitet auf dem Branch, den die Sitzung vorgibt, und setzt ihn nach jedem Merge auf den neuen `main` zurück.
- **Empfehlung:** In den Repo-Einstellungen „Automatically delete head branches“ einschalten. Dann verschwindet ein Branch nach dem Merge, und ein PR kann nicht mehr in einen schon gemergten Branch gehen (so ging im alten Repo #8 verloren).
- Repo-Umzug, Umbau-Branches und der Verlauf der gestapelten PRs bis 04.10.2026: `docs/verlauf/Runden-und-PRs.md`.

---

## 4. So hängt jetzt alles zusammen

```
Handy (Companion, /)                 Board-Server (Fastify, :3000)                Anzeige im Zimmer
───────────────────                  ─────────────────────────────                ─────────────────
Beitreten: Board-PIN + Account  ──▶  identitaet.js: anmelden → Token (Gerät)
  (Name + eigene PIN)                werBistDu(req) für API, /ws, Widgets
Daten anlegen (ID vom Handy)    ──▶  daten.js (daten.db, SQLite): erstellerId = Account
„Aufs Board“ (Quelle)           ──▶  /ws zeigen → Sitzung (sitzung.js),      ──▶  /dashboard: Layer „Sitzung“
                                     Karte aus board-karten.js
Board → Anzeigen → anordnen     ──▶  PUT /api/anzeigen/:id/layout, /vollbild
  = /dashboard/anordnen               layout.js prüft, geaendert „layout“      ──▶  /dashboard (Widgets)
                                     GET /api/widgets/:typ → Karte aus              lädt Layout seiner Anzeige,
                                     board-karten.js (gemeinsam mit Handy)           meldet Reihen, rendert Karten
```

- **Eine Quelle für Karten:** `companion/board-karten.js` übersetzt Daten in Karten aus Titel und Blöcken (`koordinaten`, `zeilen`, `text`, `bild`). Die Companion nutzt die Datei für „Aufs Board“, der Server lädt sie per `node:vm` für die Widgets. Neue Daten gehören in beide Kontexte: `boardKontext()` in der Seite und `kontext()` in `widgets.js`.
- **Neuer Widget-Typ:**
  1. Eintrag im Register `widget-register.ts`.
  2. Zuordnung in `WIDGETS` (Board `widgets.js`).
  3. Gegebenenfalls ein Anzeigeschema in `BOARD_KARTEN`.
- **Rollen:**
  - **Anzeige**: jedes Gerät braucht den Anzeige-Link, seit Umbau Phase 1 auch das Board-Gerät selbst (Konsole, `daten/anzeige-link.txt`). Sie hat keine Bedienelemente.
  - **Steuerung**: ein Handy mit Token. Es ändert Layouts und startet das Vollbild.
- **Identität:** Das Token enthält Account und Gerät. Ein gesperrtes Gerät oder ein Token von vor B2 gilt nicht. Hinter `werBistDu()` kann später ein richtiges Login stehen, ohne die Daten anzufassen.
- **Sitzung (E16, gebaut 13.10.2026):** „Aufs Board“ schickt über `/ws` nur die Quelle (`zeigen`), der Server legt ein Widget in die Sitzung der Anzeige; die alte `/anzeige` und die Nachricht `gezeigt` gibt es seit S4 nicht mehr.

---

## 5. Starten und ausprobieren

```bash
cd koordinaten-board
npm run installieren && npm run build                  # Server + Dashboard (die Anzeige, companion/widgets → dist)
npm start                                              # lokal; Betrieb auf dem Pi, siehe koordinaten-board/pi/ANLEITUNG.md
```

- **Handy:** QR-Code der Anzeige scannen → „Beitreten“. Dort die Board-PIN eingeben, einen Account antippen oder einen neuen Namen tippen, dazu die eigene PIN.
- **Anzeige:** nur mit dem Anzeige-Link aus der Konsole (oder Board → Anzeigen), auch auf dem Board-Gerät selbst: `…/dashboard?anzeige=…&schluessel=…`. Alte Links auf `/anzeige` leiten mit Schlüssel dorthin um.
- **Anordnen:** am Handy Board → Anzeigen → „Anzeige anordnen“, am besten im Querformat.
- **Ohne Board:** `cd companion/widgets && npm run dev`. Dann gibt es Beispielkarten, man bearbeitet lokal, die Galerie geht im Bearbeiten-Modus. `companion/companion-prototyp.html` direkt geöffnet läuft im DEMO-Mock.

---

## 6. Tests (alle grün, 13.10.2026)

| Teil | Befehl | Ergebnis |
|---|---|---|
| Board-Server | `cd koordinaten-board && npm test` | 60 Tests |
| Widgets | `cd companion/widgets && npm run typecheck && npm test` | Typecheck ok, 125 Unit-Tests |
| Companion und Dashboard (Playwright) | `cd companion/tests && npm test` | 17 Dateien mit zusammen 659 Prüfungen, dazu 20 Dekoder-Tests |

**CI auf GitHub:** `.github/workflows/tests.yml` führt alle drei Teile bei jedem Pull Request und jedem Push auf `main` aus (Jobs „Board-Server“, „Widgets“, „Companion und Dashboard (Playwright)“, zusammen etwa 5 Minuten). Die Screenshots aus `companion/tests/bilder/`, darunter die Haltepunkte, hängen als Download „bilder“ am Lauf (14 Tage). Ein neuer Push auf denselben PR bricht den alten Lauf ab.

Voraussetzungen für die Playwright-Tests:
- Alles muss gebaut sein:
  - `npm --prefix ../../koordinaten-board run installieren && npm --prefix ../../koordinaten-board run build` (Server-Pakete und das Dashboard)
- In der Cloud-Umgebung braucht es `CHROMIUM=/opt/pw-browsers/chromium` (für Schleifen mit `export`). Auf GitHub installiert die CI Chromium selbst (`npx playwright install --with-deps chromium`).
- Die Tests starten eigene Board-Prozesse auf Ports 3185–3198. Ein hängender Prozess blockiert den nächsten Lauf; mit `ps -eo pid,args | grep "node src/server.js"` finden. Server-Tests und Playwright nicht parallel starten.
- Screenshots für die Haltepunkte landen in `companion/tests/bilder/`.

---

## 7. Wichtig zu wissen (Stolperfallen)

- **Typecheck der Widgets:** Dafür `npm run typecheck` nehmen (`tsc -b`). `tsc -p .` prüft nichts, weil die oberste `tsconfig.json` nur Referenzen enthält. `npm run build` prüft ebenfalls.
- **Die Playwright-Tests laufen gegen `dist`.** Nach Änderungen an den Widgets erst `npm run build`, sonst testet man den alten Stand.
- **Tests auf dem langsameren Runner:** Nach dem Beitreten öffnet die Companion bei einem leeren Board „Noch keine Welt“ erst nach dem Laden der Welten. Ein Test, der Sheets schließt, muss vorher auf dieses Sheet warten (`.sheet-kopf h2` = „Welt“), sonst überdeckt es später den nächsten Klick. Nachstellen lässt sich so etwas mit einer Verzögerung per `page.route("**/api/orte/welten", …)`.
- **Seit Umbau Phase 1:** Die Anzeige braucht auch auf dem Board-Gerät den Anzeige-Link (`daten/anzeige-link.txt`, Konsole). Tests, die ein Board starten, holen ihn mit `anzeigeLinkQuery()` aus `companion/tests/hilfen.mjs`. Liefert ein Test die Companion von einem anderen Ursprung aus als das Board, braucht das Board `ERLAUBTE_URSPRUENGE` mit diesem Ursprung (so in `board.test.mjs`, `anzeigeschema.test.mjs`). Die Test-PIN ist `471100`.
- **Im Betrieb läuft die Companion über `https://mainhubv1.com/app/`** (sicherer Kontext, Service Worker aktiv). Nur lokal vom Board unter `http://localhost:3000` gilt noch:
  - `crypto.randomUUID` gibt es dort nicht. Deshalb erzeugt `neueEintragId()` die IDs aus `getRandomValues`.
  - Service Worker sind dort aus (`konfig.pwa` fehlt).
- **Alte Anmeldungen:** Tokens von vor B2 werden abgelehnt. Die Companion prüft beim Start mit `IDENTITAET.werBistDu()` und öffnet dann das Beitreten. Die Accounts bleiben, auch wenn man `geheim.txt` löscht (nur die Anmeldungen verfallen).
- **Umzug nach SQLite (Umbau Phase 4):** Beim ersten Start mit leerer `daten.db` übernimmt `daten.js` die alte `daten.json` und `biome/*.json` einmal und liest sie danach nie wieder (Sicherung). Tests, die den Stand nach dem Speichern prüfen, laden ein zweites `Daten` statt Dateien zu lesen. Der Server braucht Node 22.13+ (`node:sqlite`), die npm-Skripte setzen `--disable-warning=ExperimentalWarning`.
- **Migrationen beim Laden (nur noch beim Übernehmen von `daten.json`):**
  - Alte Biom-Punkte werden entfernt, mit Sicherung `daten.vor-welt-import.json`.
  - Fehlende `erstellerId` wird zu „unbekannt“.
- **Am Board kein Bearbeiten:** Das Dashboard ist dort reine Anzeige. Geändert wird nur über `/dashboard/anordnen` (Token) oder ohne Board im Browser-Speicher.
- **Portal-Regeln:** Es gibt nur Bedrock (E15). Handy und Board rechnen mit ±128 in beiden Dimensionen.
- **Platzhalter-Größen:** Kleine Widgets schneiden ihre Karte ab, zum Beispiel der Sammel-Fortschritt mit 4×3 Zellen. Das ist bekannt und wird mit A7 gelöst.
- **`SQLITE_CANTOPEN` oder `ENOENT`** in den Server-Tests ist harmlos. Ein verzögertes Speichern trifft auf den schon gelöschten Testordner.
- **GitHub und Git:**
  - Gestapelte PRs lassen sich auf GitHub nicht auf eine andere Basis umstellen („part of a stack“). Lieber keine Stapel mehr, sondern einen PR je abgeschlossenem Schritt direkt gegen `main`.
  - Haben zwei Stränge sich vorher schon gekreuzt (zwei Merge-Basen), meldet GitHub einen Konflikt, den `git` lokal ohne Konflikt löst. Abhilfe: `main` in den Branch mergen und pushen.
  - In der Cloud-Sitzung lehnt der Git-Proxy das Löschen von Branches ab (HTTP 403). Das macht Max auf GitHub.

---

## 8. Was auf Max wartet (Details in `WARTELISTE.md`)

- **H10:** Probe nach dem Umschalten auf das Dashboard.
- **E21:** Bauplan „Welt-Funde“ abnicken, fünf Fragen beantworten.
- **A7/E6:** Planungsrunde zu den Größenstufen je Widget und `seitenleistenBreite`.
- **Inhalte beschreiben:**
  - Koordinatensammlung, Eigene Liste
  - echte Gesamtkarte mit Markern (braucht einen neuen Karten-Block)
  - die Bereiche Handbuch und Baupläne
- **Realm-Welt am iPhone** importieren (Laufzeit, Speicher). Rest von H2.
- **Später:** B3 am echten iPhone (Home-Bildschirm-App, Flugmodus); E8 (Themes) an anderer Stelle.

---

## 9. Nächste Schritte

1. ⏸ **H10** (Max): Probe nach dem Umschalten, Schritte in `koordinaten-board/pi/ANLEITUNG.md`. Kommt dabei etwas zurück, gehört es in den Bauplan „Sitzung“. Danach zieht der Bauplan nach `docs/bauplaene/`.
2. **Offline B3–B5** auf `bereich/offline`, neu zugeschnitten am 13.10.2026 (N5 hinfällig, HTTPS und Service Worker sind da; Einzelheiten im Nachtrag von `bauplaene/Bauplan-Offline-Sync-und-Identitaet.md`):
   - **B3:** Live-Modus ohne Netz statt DEMO-Rückfall (`betriebErkennen`), Datenspiegel der Bereiche in IndexedDB, Server `GET /api/aenderungen?seit=<nr>` plus `nr` in `geaendert`, Nachladen nach Wiederverbinden, Playwright offline **mit Daten**.
   - ⏸ Haltepunkt am echten iPhone (Home-Bildschirm-App, Flugmodus, mit Daten).
   - Danach B4 (Offline-Regel, Warteschlange je Account) und B5 (Zustandswechsel, zuerst beim Abhaken der Sammelobjekte; `von`/`am` bei Wiederholung nicht überschreiben).
3. **Nach A7:** echte Stufen statt der Platzhalter im Register, `SEITENLEISTEN_BREITE` setzen, größte Rasterstufe bauen.
4. **Inhalte**, sobald beschrieben: Typen mit Quelle bekommen ihre Quelle in `widgets.js` (`quellenVon`) und ein Anzeigeschema in `board-karten.js`.
5. **Welt-Funde (E21)** nach dem OK: W1 Funde lesen (⏸ H11 an einer echten Welt), W2 Prüfliste und Übernehmen (⏸ H12 am iPhone), W3 Strukturen ohne Truhe. Einzelheiten im Bauplan.
6. **E8**, wenn an anderer Stelle geklärt: die Platzhalter-Themes in `themes.css` ersetzen. Am Widget-Code ändert sich nichts.
