# Verlauf: erledigte Haltepunkte und Entscheidungen

Archiv aus `planung/WARTELISTE.md`, `UEBERGABE.md` und `koordinaten-board/UEBERGABE.md` (ausgelagert am 13.10.2026). Offenes steht weiter in der [Warteliste](../../planung/WARTELISTE.md). Die Nummern (H…, N…, E…) bleiben, damit Verweise in Plänen und Commits weiter stimmen.

## Haltepunkte (abgenommen)

> **04.10.2026:** H1 und H3–H6 hat Max abgenommen. Die Screenshots hängen jetzt auch an jedem CI-Lauf (Download „bilder“).

| # | Haltepunkt | Branch | Was Max anschaut |
|---|---|---|---|
| ~~H1~~ | **OK (04.10.2026).** **Welt-Import (Phase 4 des Biom-Plans, Strang C):** Import-Sheet mit Anleitung, Prüfung, Fortschritt, Ergebnis | `bereich/karte-welt-upload` | `karte-mcworld.test.mjs` → Screenshots des Import-Sheets und der Biom-Ebene |
| ~~H2~~ | **Erledigt: Biom-Plan Phase 1** an der Fixture-Welt von Max (`tests/daten/fixture-seed.mcworld`): Höhenkarte `z*16 + x`, Chunkbase 8 von 8, ID 195 = Dappled Forest. Lag nur auf `bereich/karte-mcworld`, kam mit #19 nach `main`. | `main` | Offen bleibt die Realm-Welt am iPhone (Laufzeit, Speicher). Die IDs von Cherry Grove, Pale Garden und Sulfur Caves sind seit 05.10.2026 aus Mojangs Liste eingetragen. |
| ~~H3~~ | **OK (04.10.2026).** **A2 · Raster** mit Platzhalter-Widgets auf 16:9 und 4:3 | `bereich/widgets-groessen` | `w1-raster-16x9.png`, `w1-raster-4x3.png`, `w2-stufen.png` |
| ~~H4~~ | **OK (04.10.2026).** **A4 · Galerie mit allen 13 Typen** und Karten vom Board | `bereich/widgets-register` | `w4-galerie.png`, `w6-quelle-waehlen.png`, `w5-beispielkarten.png` (ohne Board). Live ausprobieren: `npm run dev` in `companion/widgets` (ohne Board, Galerie im Bearbeiten-Modus) |
| ~~H5~~ | **OK (04.10.2026).** **A5 · Bereichs-Themes** (nicht als Haltepunkt im Plan, aber zum Anschauen) | `bereich/widgets-themes` | `w8-themes.png` (Handbuch als Buch, Baupläne blau, Portale lila), `w7-board-karten.png` (Karte: Oberwelt grün, Nether rot) |
| ~~H6~~ | **OK (04.10.2026).** **A6 · Anzeige am Handy anordnen** (Haltepunkt laut Plan): im Querformat ein Layout für die Anzeige im Zimmer anordnen | `bereich/widgets-anzeigen` | `w9-companion-anordnen-knopf.png`, `w9-anordnen-handy.png`, `w9-anordnen-auswahl.png`, `w10-anzeige-nach-anordnen.png`, `w11-anzeige-vollbild.png`. Live: Board starten, `npm run dashboard:installieren && npm run dashboard:build`, am Handy beitreten → Board → Anzeigen → „Anzeige anordnen“ |
| ~~H8~~ | **Erledigt (13.10.2026).** **Probe bei Netlify** (Umbauplan Phase 5): Max hat die Companion unter `/app/` als PWA installiert und ist beigetreten. Der Haken in `UMBAUPLAN.md` ist gesetzt, Phase 5 ist abgeschlossen. | `main` | – (weiter mit Phase 6: Pi, Tunnel, Domain) |
| ~~H9~~ | **OK (13.10.2026, Max: „mergen“).** **Bauplan „Sitzung“, S3 · Widgets der Anzeige:** Das Dashboard zeigt alles, was die alte Anzeige zeigt: Orte je Dimension mit Kennblock, Koordinaten, Umrechnung und „Neu“, angeheftete Orte oben, QR-Code mit Adresse und PIN, Spieler, „Zuletzt gespeichert“, im Kopf Titel, Seed, Uhr und Verbunden-Punkt. Fehlt etwas, sieht etwas falsch aus? | `claude/festive-euler-a82up2` (PR S3) | `w12-anzeige-widgets.png` (alle Blöcke nebeneinander, 16:9), zum Vergleich `/anzeige`. Live: Board starten, `npm run dashboard:build`, `/dashboard` mit dem Anzeige-Link öffnen |

## Nachfragen aus dem Plan (entschieden)

| Nr. | Frage | blockiert |
|---|---|---|
| ~~N1~~ | **Entschieden:** Abgehakt wird im Bereich der Companion (wie heute). „Anzeige anordnen“ ordnet nur an. | – |
| ~~N2~~ | **Entschieden: Weg 1** – React-Route `/dashboard/anordnen` aus `companion/widgets/`, geöffnet aus der Companion (Board → Anzeigen → „Anzeige anordnen“). Gebaut auf `bereich/widgets-anzeigen`. | – |
| ~~N4~~ | **Entschieden („Ja“):** Die Board-PIN im QR-Code bleibt als Zugang zum Server, die Account-PIN kommt dazu. **B2 ist gebaut** (Branch `board/identitaet`): Accounts mit eigener PIN, Auswahl beim Beitreten, Geräteschlüssel, `werBistDu()`. Wer schon beigetreten war, meldet sich einmal neu an (Name + eigene PIN). | – |
| ~~N5~~ | ~~Entschieden (04.10.2026): HTTPS am Board mit eigenem Zertifikat.~~ **Hinfällig seit 13.10.2026:** HTTPS, sicherer Kontext und PWA kommen von Netlify und Cloudflare. B3 ist neu zugeschnitten (Nachtrag in `bauplaene/Bauplan-Offline-Sync-und-Identitaet.md`): Live-Modus ohne Netz, IndexedDB, Nachladen. | – (B3–B5 sind frei) |

## Entscheidungen (entschieden oder erledigt)

| Nr. | Thema | Stand bis zur Entscheidung |
|---|---|---|
| ~~E21~~ | **Entschieden (Max, 13.10.2026), W0–W4 gebaut.** **Bauplan „Welt-Funde“ (erweiterter Welt-Import)** liegt vor: [`bauplaene/Bauplan-Welt-Funde.md`](bauplaene/Bauplan-Welt-Funde.md) (13.10.2026). Aus der hochgeladenen Welt zusätzlich Verliese, Schätze und Strukturen (über die Beute-Tabellen ungeöffneter Truhen), Netherportale, gefundene Schmiedevorlagen, getragene Rüstung, aufgestellte Banner und Welt-Info lesen und per Prüfliste übernehmen. **Fünf Fragen an Max:** Prüfliste oder automatisch, nur eigener Spieler oder alle, Sammelobjekte auch aus Truhen, Portale ohne Gegenstück, Bild der Welt. W0 bis W4 sind gebaut (13.10.2026). **Max (13.10.2026), alle fünf beantwortet:** automatisch übernehmen mit einem Schalter je Art, nur der eigene Spieler, Vorlagen zählen auch aus Truhen, Portale ohne Gegenstück als Ort auf die Karte, kein Bild der Welt. | Import liest die Funde mit, übernimmt aber nur die Biome |
| ~~E15~~ | **Entschieden (04.10.2026): Java gibt es nirgendwo.** Bedrock ist die einzige Edition. Die Umschaltung Bedrock/Java in der Portal-Verwaltung ist entfernt, Handy und Board rechnen mit ±128. | – |
| ~~E18~~ | **Entschieden (13.10.2026): „raus damit.“** Alles läuft über Netlify und den Pi. Entfernt sind `netzwerk.js`, das Adress-Lernen (`adresse.txt`), `start.bat`, `start.sh`, `anzeige-oeffnen.bat` und die Firewall-Skripte. Lokal gilt ohne `OEFFENTLICHE_URL` `localhost`. **Dazu entschieden:** `/app/` bekommt den Prototyp, **der aktuelle Prototyp ist der Hauptstand**; das Anzeigegerät bleibt offen (technisch egal). | – |
| ~~E20~~ | **Erledigt (13.10.2026, Bauplan „Sitzung“, S4):** Das Dashboard ist die einzige Anzeige, `/` und `/anzeige` leiten auf `/dashboard/` um (mit Anzeige-Link). | – |
| ~~E16~~ | **Entschieden (04.10.2026): Das Board bekommt eine Sitzung.** Sie lebt, solange das Board läuft (Neustart = leere Sitzung, das gespeicherte Layout der Anzeige bleibt). Inhalte lassen sich während der Laufzeit live ändern. **„Aufs Board“** zeigt nicht mehr nur kurz groß, sondern fügt den Inhalt als **Widget an der ersten freien Stelle** ein; am Handy lässt er sich verschieben oder entfernen. | **Bauplan abgenommen (13.10.2026):** [`bauplaene/Bauplan-Sitzung.md`](../../planung/bauplaene/Bauplan-Sitzung.md). Entschieden: eigener Sitzungs-Layer, kein Platz → ablehnen, Karte vom Server (ohne Biom/3D vorerst), `/` leitet auf `/dashboard`, alte Anzeige wird gelöscht. Gebaut wird in S1–S4, Haltepunkte H9 und H10. |

## Projektübergreifende Entscheidungen (aus `UEBERGABE.md`)

**Entschieden am 29.09.2026** (Zusammenführung): Datenhaltung → Board im Heimnetz; OCR-Anbindung → umgesetzt; https ↔ http → im Heimnetz gelöst, weil Companion und API vom selben Server kommen; Board-Steuerung → durch die Companion ersetzt.

- ~~Aufs Board~~ – **entschieden (04.10.2026):** Das Board bekommt eine Sitzung, die lebt, solange das Board läuft. „Aufs Board“ fügt den Inhalt als Widget an der ersten freien Stelle ein, am Handy verschieb- und entfernbar. **Gebaut (13.10.2026)** nach `planung/bauplaene/Bauplan-Sitzung.md`, S1–S4; das Dashboard ist die einzige Anzeige.
- ~~Edition als Eigenschaft der Welt~~ – **entschieden (04.10.2026):** Es gibt nur Bedrock. Die Umschaltung Bedrock/Java in der Portal-Verwaltung ist entfernt.
- **Hetzner später**: Soll die Companion auch von unterwegs erreichbar sein (https, PWA installierbar)? Dann läuft derselbe Server dort, oder das Board verbindet sich nach außen. **Erledigt mit dem Umbau (13.10.2026):** Die Companion kommt von Netlify (`https://mainhubv1.com/app/`, installierbar als PWA), die API läuft auf dem Pi hinter einem Cloudflare-Tunnel. Hetzner braucht es dafür nicht.
- **Dashboard: Wird am Handy oder an der Anzeige im Zimmer bearbeitet?** Am Handy (N2, Phase A6: „Anzeige anordnen“ unter `/dashboard/anordnen`); die Anzeige zeigt nur an.

## Gelöst bei Max (Betrieb vom Laptop aus, bis Umbau Phase 6; aus `koordinaten-board/UEBERGABE.md`)

- Der QR-Code zeigte die Hyper-V-Adresse `172.24.0.1` statt WLAN `192.168.8.184`. Gelöst war das über Routen-Wahl und Adress-Lernen (`netzwerk.js`, `adresse.txt`); **beides ist seit dem 13.10.2026 entfernt** (E18), weil der Server auf dem Pi mit `OEFFENTLICHE_URL` läuft. Lokal gilt `http://localhost:3000`, fürs WLAN setzt man `OEFFENTLICHE_URL` von Hand.
- Die Firewall-Freigabe (Skript entfernt) brauchte ein **Admin-Terminal**.
