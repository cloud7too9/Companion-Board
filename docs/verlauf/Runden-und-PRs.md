# Verlauf: Runden, Pull Requests, Git

Archiv aus `planung/UEBERGABE.md` und `planung/WARTELISTE.md` (ausgelagert am 13.10.2026). Was heute gilt, steht dort; hier steht, wie es dazu kam.

PR-Nummern bis #26 meinen das alte Repo `flexibel-visionboard`, ab dem Repo-Umzug am 05.10.2026 das Repo `Companion-Board` (dort ab #1).

## Runde 14.10.2026 (Bauplan „Anmeldung und Dashboard-Zugang“) · Repo `Companion-Board`

Seit dem 14.10.2026 mergt Claude ohne Rückfrage, sobald die CI grün ist (Max: „mergen ab jetzt ohne Rückfragen“).

| PR | Inhalt |
|---|---|
| #33 | Schnell 4, CI und Doku: Test-Läufer `alle.mjs` (läuft nach Fehlern weiter, Zusammenfassung am Ende), doppelte Test-Ports behoben (widgets 3196, karte-mcworld 3200), Actions auf Node-24-Versionen (v6) und festes `ubuntu-24.04`, Widersprüche in PLAN, UEBERGABE, Warteliste (Pi-Update zuerst, E21 ins Archiv), Testzahlen |
| #32 | Schnell 3, Dashboard für Fernseher: angemeldete Anzeige versucht es weiter, wenn das Board weg ist (statt dauerhaft Beispielkarten), letzte Karte bleibt bei kurzem Netzausfall, Layout-Meldungen anderer Anzeigen ignoriert, Build für alte Browser (Chromium 69, Safari 12), kein `Object.hasOwn`, Höhe mit 100vh-Rückfall, Fehlergrenze je Widget und für die Seite (lädt nach 30 s neu), Uhr tickt seltener |
| #31 | Schnell 2, Companion: Service Worker merkt nur erfolgreiche Antworten (Kopie sofort), ganze App-Shell samt Welt-Import im Cache, Seite nach 3 s aus dem Cache, eigener Dauer-Cache für `vendor/` und Texturen; Karte zeichnet beim Ziehen und Zoomen einmal pro Bild; Board-Sheet behält die Scrollstelle; Weltwechsel verwirft späte Antworten der alten Welt; Suche mit kurzer Verzögerung; nach längerem Standby frisch verbinden; Umrechner verliert beim Live-Update den Fokus nicht |
| #30 | Schnell 1, Board-Server: Grenzen je Adresse (Anmeldung, Registrieren, höchstens 10 wartende Konten), Sperren räumen sich auf, `aenderungen` wird gekürzt, `/api/health`, WebSocket-Nachrichten höchstens 64 KB, Geheimnisse nur für den Dienst lesbar, Speicherfehler laut, sauberes Beenden, `sicherung.sh` prüft, packt und kopiert optional weg |
| #29 | Karte: Kategorien ein- und ausblenden (Knopf oben rechts, Schalter je Kategorie, „Alle zeigen“/„Alle ausblenden“, gemerkt pro Gerät; die Liste zeigt weiter alles) |
| #28 | Anmeldeseite: TV-Ansicht (Großbild auf Fernsehern und breiten Bildschirmen, Fernbedienung mit Pfeiltasten, OK und Zifferntasten, Fernseher starten im Dashboard-Login, `?tv`), Test mit Fernseher-Browser (Screenshots `t1`–`t3`) |
| #27 | Anmeldung L5: Dashboard-Login auf der Anmeldeseite (Code, Dashboard-PIN, Layout wählen), „Anzeige-Gerät anmelden“ im Board-Sheet (Code generieren, Widerrufen), Dashboard mit Anzeige-Token; **AN4** (Max): Layout und Raster je Gerät, ein zweites Gerät bekommt eine Kopie; `dashboard-login.test.mjs` (⏸ H16) |
| #26 | Anmeldung L4: Dashboard-Zugänge am Server (`dashboard-zugang.js`) – Zugangs-Code mit Dashboard-PIN, Code → Ticket → Anzeige-Token, Layout wählen, 15-Minuten-Regel, Widerrufen meldet ab; Anzeige-Token neben dem Anzeige-Link für `/api/anzeige/*`, `/api/widgets/*` und `/ws`; `signatur.js` für alle Tokens. Noch ohne Oberfläche (L5 wartet auf AN4) |
| #25 | Anmeldung L1–L3: Konten mit Passwort und PIN, Freigabe neuer Konten, PIN nach über 30 Minuten ohne Kontakt (Hook 403/423, Pongs als Herzschlag), Anmeldeseite unter `/`, Companion unter `/app/`, Offline-Sperre mit lokalem PIN-Hash, Board-PIN abgebaut; alle Tests auf Konten umgestellt, `anmeldung.test.mjs` (⏸ H15) |
| #24 | W4: Strukturbereiche aus Chunk-Tag 119 (AABBVolumes) + Entscheidungen zur Anmeldung (andere Sitzung) |
| #23 | Bauplan „Anmeldung und Dashboard-Zugang“, Referenzschema, H12-Ergebnis (andere Sitzung) |

## Runde 13.10.2026 (Umbau abgeschlossen, Bauplan „Sitzung“) · Repo `Companion-Board`

| PR | Inhalt |
|---|---|
| #22 | Offline B3: live ohne Netz aus dem Spiegel in IndexedDB, `GET /api/aenderungen` mit `nr`/`lauf` in `geaendert`, Nachladen nach Unterbrechung (⏸ H14) |
| #21 | Welt-Funde W3: Strukturbereiche (Chunk-Tag 57), Dörfer, Endtransitportale, Enderdrache; Bauplan „Welt-Funde“ ganz gebaut, offen nur H11–H13 |
| #20 | Welt-Funde lesen (W1) und automatisch übernehmen (W2): NBT-Leser, Sammler, `welt-pruefen.mjs` mit Funden und Weltordner (⏸ H12); Prüfliste mit Schalter je Art, `POST /welten/:id/funde`, Portale ohne Gegenstück als Ort (Antworten von Max zu Frage 1, 4, 5; ⏸ H13) |
| #19 | Welt-Import: Weltordner wählen oder hineinziehen, nur gebrauchte Dateien (W0, ⏸ H11); Bauplan „Welt-Funde“ (erweiterter Welt-Import) zum Abnicken, E21 auf der Warteliste |
| #18 | Aufräumen: Erledigtes aus `planung/` ins Archiv `docs/` (Pläne, Baupläne, Ideen, Verlauf, erledigte Haltepunkte und Entscheidungen), Test-Cache aus dem Repo, `.gitignore` im Hauptordner |
| #17 | S4 Umschalten: Anzeige-Link aufs Dashboard, `/` und `/anzeige` leiten um (E20), `koordinaten-board/client/` und `gezeigt` entfernt, Hinweis „Dieser Anzeige-Link gilt nicht mehr“, Tests auf das Dashboard umgeschrieben; ⏸ H10 wartet auf Max |
| #16 | S3 Widgets der Anzeige: Orte, Beitreten (QR-Code vom Server), Spieler, Zuletzt, Kopf der Anzeige, neues Standard-Layout; ⏸ H9 wartet auf Max |
| #15 | S2 Handy und Dashboard: „Aufs Board“ mit Quelle, Sitzung im Board-Sheet, Kennblock und Absender-Chip im Dashboard, Sitzungs-Layer gesperrt, Brücke `gezeigt` bis S4; Playwright-Tests zu „Aufs Board“ laufen live vom Board |
| #14 | S1 Sitzung am Server: `sitzung.js`, `companion/widget-groessen.mjs` gemeinsam für Server und Dashboard, „Aufs Board“ mit Quelle, `portale.verbindung` |
| #13 | Bauplan „Sitzung und eine Anzeige“ (abgenommen), Offline neu zugeschnitten (N5 hinfällig), Checkliste Pi/Cloudflare, Fix „Fertig“ in Anordnen |
| #12 | Umbau abgeschlossen: Netlify-Probe (H8) und Phase 6 abgehakt, Domain `mainhubv1.com` statt Platzhalter, Betrieb vom Laptop aus entfernt (E18: `netzwerk.js`, Adress-Lernen, Start- und Firewall-Skripte), Entscheidungen zu `/app/` (Prototyp = Hauptstand) und Anzeigegerät (offen) festgehalten, E20 (Startseite) neu auf der Warteliste |

## Runde 05./06.10.2026 · Repo `Companion-Board`

| PR | Inhalt |
|---|---|
| #8 | Aufräumen: alte Handy-Oberfläche aus dem Anzeige-Client, überholter Entwurf, Doku-Stand nach Umbau Phase 5, Repo-Name |
| #9 | Biom-IDs vollständig aus Mojangs `mojang-biomes.json` (Cherry Grove 192, Pale Garden 193, Sulfur Caves 194) |
| #10 | Companion: Spielerprofil oben in der Sidebar (Name + Platzhalter), Knopf „Neue Version · Aktualisieren“ als PWA |

Neu auf der Warteliste: H7 (Farben der neuen Biome), H8 (Probe bei Netlify), N6 („Aktualisieren“ auch bei neuen Daten?), E17 (Inhalt des Spielerprofils), E18 (Heimnetz-Betrieb vom Laptop behalten?), E19 (Sammelobjekt-Karten mit Struktur-Ansicht, Besatz-Icon und Biom-Hintergrund; Max liefert die Ansichten), Kapitel 5 (Branches löschen).

## Runde 04.10.2026 · altes Repo `flexibel-visionboard`

| PR | Inhalt |
|---|---|
| #19 | Ergebnisse von Phase 1 des Biom-Plans nachgeholt: Fixture-Welt von Max, Biom-ID 195 = Dappled Forest, Höhenkarte `z*16 + x`. Lagen nur auf `bereich/karte-mcworld`. |
| #20 | Die ganze Kette A2–A6 + B1/B2 + Anzeige-Link in einem Merge (ersetzt die gestapelten #12–#17) |
| #21 | CI: `.github/workflows/tests.yml`, dazu ein Fix für eine Race Condition in `anzeige-link.test.mjs` |
| #22 | Nur Bedrock: Java-Umschaltung entfernt. Entscheidungen festgehalten. Diese Übergabe. |

Entscheidungen von Max (Details in `WARTELISTE.md` und `PLAN.md`, Kapitel 7):

| Nr. | Entscheidung |
|---|---|
| N5 | HTTPS am Board mit **eigenem Zertifikat**, das iPhone vertraut ihm einmal *(hinfällig seit 13.10.2026: HTTPS über Netlify/Cloudflare)* |
| E15 | **Nur Bedrock**, Java gibt es nirgendwo |
| E16 | Das Board bekommt eine **Sitzung**, die lebt, solange das Board läuft. „Aufs Board“ fügt den Inhalt als **Widget an der ersten freien Stelle** ein, am Handy verschieb- und entfernbar. |
| E8 | Themes für Sammelobjekte, Banner, Rüstung: **vertagt**, wird an anderer Stelle geklärt |
| H1, H3–H6 | abgenommen |
| Mergen | **nur nach Rückfrage bei Max** |

Frühere Entscheidungen (01.10.2026): Strang C als ganzer Biom-Import, N1 (abgehakt wird im Bereich der Companion), N2 (Anordnen als React-Route `/dashboard/anordnen`), N4 (Board-PIN im QR-Code bleibt, Account-PIN kommt dazu), Arbeitsweise „Was Eingaben braucht, kommt auf die Warteliste, alles andere wird erledigt“.

## Git: Repo-Umzug und Umbau-Branches

- **Repo-Umzug (05.10.2026):** Gearbeitet wird seitdem in `cloud7too9/Companion-Board`. `main` dort ist der Stand von `flexibel-visionboard` (`main` 9d5be46, Merge von PR #26) als **ein Start-Commit ohne Verlauf**. Die 16 gemergten Branches und alle PR-Nummern bis #26 gibt es nur noch im alten Repo; löschen muss Max dort nichts mehr. Die PR-Nummern in dieser Datei meinen das alte Repo.
- **Mitgenommen:** `bereich/karte-mcworld` als eigener Stand ohne Eltern (ältere Fassung der Biom-Phasen 2–4: Prüfseite `welt-pruefen.html`, `welt-import.test.mjs`). #7 und #19 haben den Inhalt ersetzt; der Branch ist zum Nachschlagen, ein Merge scheitert absichtlich an „unrelated histories“.
- **Umbau:** je Phase ein Branch `umbau/<phase>` mit PR gegen `main` (`UMBAUPLAN.md`). Gemergt sind #1 (Phase 1, Branch `claude/vibrant-mccarthy-qzhzq4` in der Rolle von `umbau/server-absichern`), #2 `umbau/api-adresse`, #3 `umbau/ocr-im-browser`, #4 `umbau/sqlite`, #5 `umbau/netlify`, #6 `umbau/pi-dienste`, #7 `umbau/anleitung-trixie`. Die Branches sind nach dem Merge gelöscht.

## Git: Verlauf bis 04.10.2026 (altes Repo)

- #7 (Strang C), #9 (MainHub), #10 (A0), #11 (A1) wurden einzeln gemergt.
- #8 (Anzeige-Link) wurde in `bereich/karte-welt-upload` gemergt, als der schon in `main` war. Der Anzeige-Link kam erst mit #20 nach `main` (über `9f7dee9`).
- #12–#17 waren gestapelt (jeder PR auf seinen Vorgänger). GitHub ließ die Basis von #17 nicht auf `main` umstellen („part of a stack“). Darum brachte **#20** denselben Branch `board/identitaet` in einem Merge nach `main`; #12 hat GitHub selbst als gemergt markiert, #13–#17 sind geschlossen.
- Commits der Kette (ohne Merges): C `84ed32f` · `5a1d02e` · `e9c1efd` · `2570c56`; Anzeige-Link `51db22f`; A0 `b6d4082`; A1 `7ab7275` · `bedcfda` · `ca7eba6`; A2 `c777042` · `5de5ccc` · `e8d03ee` · `76f9fc2`; A3 `223f46c`; A4 `e00aeea` … `876aad6`; A5 `23f3a36` … `c54583a`; A6 `0905882` · `90ba916` · `d1873ae` · `766544a`; B1/B2 `75d4f89` · `1cae081` · `c09ec0a` · `8ee1ad6`.

## Pull Requests laut Warteliste (Stand 13.10.2026)

**Pull Requests:** Seit dem 04.10.2026 ist alles in `main`: #7, #9–#11 und #19 einzeln, die Kette A2–A6 mit B1/B2 und dem Anzeige-Link in einem Merge über #17. #12–#16 sind darin enthalten und geschlossen (Kapitel 3 in [`planung/UEBERGABE.md`](../../planung/UEBERGABE.md); diese Nummern meinen das alte Repo). Im neuen Repo: #1–#7 Umbau Phasen 1–5, am 06.10.2026 #8 (Aufräumen), #9 (Biom-IDs) und #10 (Spielerprofil, Aktualisieren), #11 (Warteliste), am 13.10.2026 #12 (Umbau abgeschlossen, E18). **Gemergt wird nur nach Rückfrage bei Max.**
