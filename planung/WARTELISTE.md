# Warteliste: was auf Max wartet

> Stand 06.10.2026 · gehört zu [`PLAN.md`](PLAN.md)
>
> Max hat gesagt: „Was weitere Eingaben braucht, kommt auf die Warteliste. Alles andere wird erledigt.“ Hier steht deshalb alles, was ohne Max nicht weitergeht: Haltepunkte, Nachfragen, offene Entscheidungen und Inhalte, die noch nicht beschrieben sind. Weitergearbeitet wird an allem anderen.

---

## 1. Haltepunkte (⏸): Ergebnis anschauen, OK geben

> **04.10.2026:** H1 und H3–H6 hat Max abgenommen. Die Screenshots hängen jetzt auch an jedem CI-Lauf (Download „bilder“).

Bei jedem Haltepunkt stehen Branch und Screenshots. Die Screenshots erzeugen die Playwright-Tests in `companion/tests/bilder/` (`npm test` in `companion/tests`).

| # | Haltepunkt | Branch | Was Max anschaut |
|---|---|---|---|
| ~~H1~~ | **OK (04.10.2026).** **Welt-Import (Phase 4 des Biom-Plans, Strang C):** Import-Sheet mit Anleitung, Prüfung, Fortschritt, Ergebnis | `bereich/karte-welt-upload` | `karte-mcworld.test.mjs` → Screenshots des Import-Sheets und der Biom-Ebene |
| ~~H2~~ | **Erledigt: Biom-Plan Phase 1** an der Fixture-Welt von Max (`tests/daten/fixture-seed.mcworld`): Höhenkarte `z*16 + x`, Chunkbase 8 von 8, ID 195 = Dappled Forest. Lag nur auf `bereich/karte-mcworld`, kam mit #19 nach `main`. | `main` | Offen bleibt die Realm-Welt am iPhone (Laufzeit, Speicher). Die IDs von Cherry Grove, Pale Garden und Sulfur Caves sind seit 05.10.2026 aus Mojangs Liste eingetragen. |
| ~~H3~~ | **OK (04.10.2026).** **A2 · Raster** mit Platzhalter-Widgets auf 16:9 und 4:3 | `bereich/widgets-groessen` | `w1-raster-16x9.png`, `w1-raster-4x3.png`, `w2-stufen.png` |
| ~~H4~~ | **OK (04.10.2026).** **A4 · Galerie mit allen 13 Typen** und Karten vom Board | `bereich/widgets-register` | `w4-galerie.png`, `w6-quelle-waehlen.png`, `w5-beispielkarten.png` (ohne Board). Live ausprobieren: `npm run dev` in `companion/widgets` (ohne Board, Galerie im Bearbeiten-Modus) |
| ~~H5~~ | **OK (04.10.2026).** **A5 · Bereichs-Themes** (nicht als Haltepunkt im Plan, aber zum Anschauen) | `bereich/widgets-themes` | `w8-themes.png` (Handbuch als Buch, Baupläne blau, Portale lila), `w7-board-karten.png` (Karte: Oberwelt grün, Nether rot) |
| ~~H6~~ | **OK (04.10.2026).** **A6 · Anzeige am Handy anordnen** (Haltepunkt laut Plan): im Querformat ein Layout für die Anzeige im Zimmer anordnen | `bereich/widgets-anzeigen` | `w9-companion-anordnen-knopf.png`, `w9-anordnen-handy.png`, `w9-anordnen-auswahl.png`, `w10-anzeige-nach-anordnen.png`, `w11-anzeige-vollbild.png`. Live: Board starten, `npm run dashboard:installieren && npm run dashboard:build`, am Handy beitreten → Board → Anzeigen → „Anzeige anordnen“ |

| H7 | **Farben der neuen Biome** (06.10.2026): Cherry Grove (rosa), Pale Garden (fahles Graugrün) und Sulfur Caves (schwefelgelb) haben Kartenfarben von Claude (`tools/biom-ids-bauen.mjs`, `NACHTRAG`). **Max (06.10.2026):** Die Biom-Farben werden auch der **Hintergrund der Sammelobjekt-Karten** (siehe E19), dort fallen sie also doppelt auf. | `main` (#9) | Sobald eine Welt eines davon enthält: Welt-Import, dann Prüfliste und Karte anschauen. Andere Farbe gewünscht → eine Zeile im `NACHTRAG`, `npm run biom-ids`. |
| H8 | **Probe bei Netlify** (Umbauplan Phase 5): Die Site läuft schon (PRs bekommen Deploy-Previews), der Haken „erst mit der `.netlify.app`-Adresse testen“ fehlt noch. | `main` | Companion unter `/app/` als PWA installieren, beitreten, danach den Haken in `UMBAUPLAN.md` setzen. Seit #10 erscheint bei einem neuen Build der Knopf „Neue Version · Aktualisieren“. |

Später, wenn es so weit ist: B3 (am echten iPhone im Flugmodus).

**Pull Requests:** Seit dem 04.10.2026 ist alles in `main`: #7, #9–#11 und #19 einzeln, die Kette A2–A6 mit B1/B2 und dem Anzeige-Link in einem Merge über #17. #12–#16 sind darin enthalten und geschlossen (Kapitel 3 in [`UEBERGABE.md`](UEBERGABE.md); diese Nummern meinen das alte Repo). Im neuen Repo: #1–#7 Umbau Phasen 1–5, am 06.10.2026 #8 (Aufräumen), #9 (Biom-IDs) und #10 (Spielerprofil, Aktualisieren). **Gemergt wird nur nach Rückfrage bei Max.**

---

## 2. Nachfragen aus dem Plan (Kapitel 8)

| Nr. | Frage | blockiert |
|---|---|---|
| ~~N1~~ | **Entschieden:** Abgehakt wird im Bereich der Companion (wie heute). „Anzeige anordnen“ ordnet nur an. | – |
| ~~N2~~ | **Entschieden: Weg 1** – React-Route `/dashboard/anordnen` aus `companion/widgets/`, geöffnet aus der Companion (Board → Anzeigen → „Anzeige anordnen“). Gebaut auf `bereich/widgets-anzeigen`. | – |
| ~~N4~~ | **Entschieden („Ja“):** Die Board-PIN im QR-Code bleibt als Zugang zum Server, die Account-PIN kommt dazu. **B2 ist gebaut** (Branch `board/identitaet`): Accounts mit eigener PIN, Auswahl beim Beitreten, Geräteschlüssel, `werBistDu()`. Wer schon beigetreten war, meldet sich einmal neu an (Name + eigene PIN). | – |
| ~~N5~~ | **Entschieden (04.10.2026): HTTPS am Board mit eigenem Zertifikat.** Das Board erzeugt sein Zertifikat selbst, jedes iPhone installiert es einmal als Profil und vertraut ihm. Bleibt im Heimnetz, kostenlos. | – (B3–B5 sind frei) |
| N6 | **„Aktualisieren bei neuen Inhalten“** (Max, 05.10.2026): Gebaut ist der Knopf für eine **neue Version der App** (PWA, #10). War auch gemeint, dass die App bei **neuen Daten anderer Spieler** einen Knopf zeigt, statt sie wie heute sofort live zu übernehmen? | – (nur, falls die Antwort „ja“ ist) |

---

## 3. Offene Entscheidungen

| Nr. | Thema | Stand bis zur Entscheidung |
|---|---|---|
| E6 / A7 | **Größenstufen je Widget** und `seitenleistenBreite` (Planungsrunde) | Die neun neuen Typen haben je eine Platzhalter-Stufe. Die größte Rasterstufe (`32 − Seitenleiste`) gibt es noch nicht. Beobachtet: „Sammel-Fortschritt“ (4×3) ist für seine Karte zu klein, „Alle Sammelobjekte“ (8×8) zeigt nur die Oberwelt-Hälfte. |
| E8 | **Themes für Sammelobjekte, Banner, Rüstung:** vertagt, wird an anderer Stelle geklärt (Max, 04.10.2026) | Oberwelt-Grün als Platzhalter mit eigener Theme-ID (A5) bleibt |
| ~~E15~~ | **Entschieden (04.10.2026): Java gibt es nirgendwo.** Bedrock ist die einzige Edition. Die Umschaltung Bedrock/Java in der Portal-Verwaltung ist entfernt, Handy und Board rechnen mit ±128. | – |
| E17 | **Inhalt des Spielerprofils** (Sidebar, seit #10): Gebaut sind Name und ein runder Platzhalter. Offen: Was zeigt der Platzhalter später, ein hochgeladenes **Profilbild** oder der **Skin** aus dem Spiel? Kommt mehr dazu: eigene Beiträge in der Welt (Orte, Sammelobjekte, Banner, Sets über `erstellerId`), der Standort, die angemeldeten Geräte (sehen, sperren)? Lässt sich das Profil antippen (eigenes Sheet)? | Name + Platzhalter, nicht antippbar |
| E18 | **Umbau Phase 6, letzter Punkt:** Bleibt der Betrieb im Heimnetz vom Laptop aus (`start.bat`/`start.sh` mit LAN-Adresse im QR-Code), oder läuft nach der Pi-Probe alles über Netlify und den Pi? Im zweiten Fall fliegen `netzwerk.js`, das Adress-Lernen (`adresse.txt`) und die Firewall-Skripte raus. | alles bleibt, bis der Pi läuft |
| E19 | **Sammelobjekt-Karten neu** (Max, 06.10.2026): Jede Karte bekommt die **Ansicht der zugeordneten Struktur** (Dungeon oder Struktur, z. B. Außenposten, Waldanwesen, Prüfungskammer) **plus das Icon des Besatzes**; der **Kartenhintergrund wird an das Biom angeglichen**, in dem die Struktur liegt (Farbe aus `biom-ids.js`). **Max liefert die Struktur-Ansichten** (Bilder) noch. Vorbild: `companion/referenz/sammelobjekte/besaetze-fundorte-chancen-duplizieren.png`. Zu klären beim Bau: Zuordnung Struktur → Biom, wo mehrere möglich sind (Außenposten, Schiffswrack, Bastion); ob Fundchancen und Duplizier-Block aus dem Vorbild mit auf die Karte sollen (nicht im Datenmodell). | Liste mit Kennblock-Kopf je Gruppe, Karten nach Dimension eingefärbt |
| ~~E16~~ | **Entschieden (04.10.2026): Das Board bekommt eine Sitzung.** Sie lebt, solange das Board läuft (Neustart = leere Sitzung, das gespeicherte Layout der Anzeige bleibt). Inhalte lassen sich während der Laufzeit live ändern. **„Aufs Board“** zeigt nicht mehr nur kurz groß, sondern fügt den Inhalt als **Widget an der ersten freien Stelle** ein; am Handy lässt er sich verschieben oder entfernen. | Noch nicht gebaut. Zuerst ein Bauplan „Sitzung“ zum Abnicken. Offen darin: ob `/anzeige` damit ganz wegfällt und wie QR-Code und Orte mit Kennblöcken ins Dashboard kommen. |

---

## 4. Inhalte, die noch nicht beschrieben sind

Die Typen stehen im Register und in der Galerie, liefern aber nur einen Hinweis statt einer Karte.

| Widget-Typ | Was fehlt |
|---|---|
| **Koordinatensammlung** (Karte, optional) | Was ist eine „Sammlung“? Eine feste Auswahl von Orten, die man in der Companion zusammenstellt, oder z. B. alle Orte einer Kategorie? Ein Datenmodell dafür gibt es noch nicht. |
| **Eigene Liste** (Sammelobjekte) | „Frei zusammengestellt, schließt Listen nach Art ein“: Wo legt man sie an, und was steht drin? Ein Datenmodell fehlt. |
| **Gesamtkarte** | Sie zeigt vorerst einen Überblick (Orte je Dimension, angeheftete Orte). Für eine echte Karte mit Markern, „ausrichtbar auf Punkt oder Koordinate“, braucht das Kartenformat des Boards einen neuen Block (z. B. `karte` mit Ausschnitt und Markern). Das muss besprochen werden. |
| **Handbuch-Eintrag, Materialliste** | Den Bereich Handbuch gibt es noch nicht („Bereich geplant“). |
| **Bauplan** | Den Bereich Baupläne gibt es noch nicht („Bereich geplant“). |

---

## 5. Erinnerungen (GitHub, nur Max)

- **Branches löschen:** `aufraeumen/doku`, `bereich/biom-ids`, `bereich/profil` sind gemergt und liegen noch auf GitHub. Der Git-Proxy der Cloud-Sitzung darf keine Branches löschen (HTTP 403).
- **„Automatically delete head branches“** in den Repo-Einstellungen einschalten (Settings → General → Pull Requests), dann verschwinden gemergte Branches von selbst.
