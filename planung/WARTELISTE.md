# Warteliste: was auf Max wartet

> Stand 13.10.2026 · gehört zu [`PLAN.md`](PLAN.md)
>
> Max hat gesagt: „Was weitere Eingaben braucht, kommt auf die Warteliste. Alles andere wird erledigt.“ Hier steht deshalb alles, was ohne Max nicht weitergeht: Haltepunkte, Nachfragen, offene Entscheidungen und Inhalte, die noch nicht beschrieben sind. Weitergearbeitet wird an allem anderen.

---

## 1. Haltepunkte (⏸): Ergebnis anschauen, OK geben

Bei jedem Haltepunkt stehen Branch und Screenshots. Die Screenshots erzeugen die Playwright-Tests in `companion/tests/bilder/` (`npm test` in `companion/tests`).

| # | Haltepunkt | Branch | Was Max anschaut |
|---|---|---|---|
| H7 | **Farben der neuen Biome** (06.10.2026): Cherry Grove (rosa), Pale Garden (fahles Graugrün) und Sulfur Caves (schwefelgelb) haben Kartenfarben von Claude (`tools/biom-ids-bauen.mjs`, `NACHTRAG`). **Max (06.10.2026):** Die Biom-Farben werden auch der **Hintergrund der Sammelobjekt-Karten** (siehe E19), dort fallen sie also doppelt auf. | `main` (#9) | Sobald eine Welt eines davon enthält: Welt-Import, dann Prüfliste und Karte anschauen. Andere Farbe gewünscht → eine Zeile im `NACHTRAG`, `npm run biom-ids`. |
| H10 | **Wartet auf Max (13.10.2026).** **Bauplan „Sitzung“, S4 · Umschalten:** Die Anzeige ist nur noch das Dashboard. Nach Merge und Update am Pi: den Anzeige-Link am Fernseher/Tablet öffnen (`mainhubv1.com` ist seit dem Bauplan „Anmeldung“ die Anmeldeseite), per QR aus dem Widget im Mobilfunk anmelden, Ort anlegen, „Aufs Board“ und „Wegnehmen“, Dienst neu starten (Sitzung leer, Layout da). **Anders als früher:** Lange Orte-Listen scrollen nicht von selbst, neue Orte leuchten nicht auf (nur „Neu“). Fehlt dir das? | `claude/festive-euler-a82up2` (PR S4) | Schritte in `koordinaten-board/pi/ANLEITUNG.md`, Abschnitt „Probe nach dem Umschalten auf das Dashboard“; Screenshots `n2-anzeige-netlify.png`, `v8-anzeige-ort.png`, `v10-anzeige-zwei.png` |
| H11 | **Wartet auf Max (13.10.2026).** **Welt-Import: Weltordner statt ZIP** (Bauplan „Welt-Funde“, W0): Karte → Welt → Welt-Import → „Weltordner wählen“ → in der Dateien-App den Ordner der Welt (z. B. `z2l2cn0rmkA=`) oder gleich `minecraftWorlds` wählen. Geht das am iPhone (Safari ab iOS 18.4)? Steht „Gebraucht: … von … Dateien“ da, stimmt der Weltname? Und: Lässt sich der Ordner aus der Dateien-App auf die gestrichelte Fläche ziehen? | `claude/festive-euler-a82up2` (PR #19) | `m4-import-start.png`, `m6b-weltordner.png`, `m6c-welt-waehlen.png` |
| ~~H12~~ | **Erledigt (Max, 13.10.2026: „H12 ja“, Liste bestätigt; „W4 ja“ → W4 gebaut, PR „W4“).** Ausgewertet von Claude an Max' Welt „letztes mal – Kopie“ (1.26.52): Ergebnis im Bauplan „Welt-Funde“, Abschnitt „H12: Ergebnis“. **Wichtigster Befund:** Tag 57 gibt es nicht mehr, Strukturbereiche stehen in Tag 0x77 → W4. ~~Welt-Funde an einer echten Welt~~ (Bauplan „Welt-Funde“, W1): Was der Import aus der Welt liest (Verliese, Schätze, Strukturen, Portale, Schmiedevorlagen, Rüstung, Banner, Welt-Info; seit W3 auch Außenposten, Hexenhütten, Ozeanmonumente, Netherfestungen ohne Truhe, Dörfer, Endtransitportale, Enderdrache), mit dem Spiel vergleichen. Am PC mit Node 22: `cd companion/tools && node welt-pruefen.mjs <Welt.mcworld oder Weltordner>` (oder die Welt an Claude geben). Stimmen Orte und Koordinaten? Fehlt etwas, das du kennst? Steht „Andere Spieler“ da (Realm-Welt)? | `claude/festive-euler-a82up2` (PR W1) | Ausgabe von `welt-pruefen.mjs`, Abschnitt „Funde“ |
| H13 | **Wartet auf Max (13.10.2026).** **Welt-Funde übernehmen am iPhone** (Bauplan „Welt-Funde“, W2): Welt-Import mit deiner Welt, in „Welt prüfen“ die Karte „Aus der Welt“ ansehen (je Art Anzahl und Schalter, alle an), Unerwünschtes abschalten (z. B. Verliese), „Übernehmen“. Stimmen Orte, Portal-Verbindungen, Schmiedevorlagen, Rüstungs-Sets, Banner und die Welt-Info? Ein zweiter Import derselben Welt sollte überall „schon bekannt“ zeigen. | `claude/festive-euler-a82up2` (PR W1/W2) | `m12-funde.png` |
| H14 | **Wartet auf Max (13.10.2026).** **Offline mit Daten** (Bauplan Offline, B3): Companion als Home-Bildschirm-App öffnen, einmal Karte, Sammelobjekte und Portale ansehen (dann liegen sie im Spiegel). Flugmodus an, App ganz schließen und neu öffnen: Siehst du deine Orte (unten „Offline“, oben kurz „Offline · Stand vom …“) statt Beispieldaten? Lena legt in der Zeit einen Ort an. Flugmodus aus: Nach ein paar Sekunden „Verbunden“ und Lenas Ort ist da? | `claude/festive-euler-a82up2` (PR B3) | `n5-offline-spiegel.png` |
| H15 | **Wartet auf Max (14.10.2026).** **Anmeldung mit Konto** (Bauplan „Anmeldung und Dashboard-Zugang“, L3): Nach Merge und **Pi-Update** gleich `mainhubv1.com` am Handy öffnen und **registrieren** (das erste Konto gilt sofort; alle alten Konten sind weg, Einträge bleiben). Ein zweites Handy registriert sich, du gibst es in der Companion unter Board → Konten frei. Über eine halbe Stunde liegen lassen → fragt nach der PIN; „PIN vergessen?“ mit dem Passwort. Passen Texte und Ablauf? | `claude/festive-euler-a82up2` (PR Anmeldung) | `a1-anmeldung.png` bis `a8-board-weg.png`, `n6-offline-pin.png`; Schritte in `koordinaten-board/pi/ANLEITUNG.md`, „Probe der Anmeldung“ |

Später: B3 am echten iPhone im Flugmodus, mit Daten.

Erledigte Haltepunkte, Nachfragen und Entscheidungen stehen im Archiv: [`docs/verlauf/Entscheidungen-und-Haltepunkte.md`](../docs/verlauf/Entscheidungen-und-Haltepunkte.md).

---

## 2. Nachfragen aus dem Plan (Kapitel 8)

| Nr. | Frage | blockiert |
|---|---|---|
| N6 | **„Aktualisieren bei neuen Inhalten“** (Max, 05.10.2026): Gebaut ist der Knopf für eine **neue Version der App** (PWA, #10). War auch gemeint, dass die App bei **neuen Daten anderer Spieler** einen Knopf zeigt, statt sie wie heute sofort live zu übernehmen? | – (nur, falls die Antwort „ja“ ist) |

---

## 3. Offene Entscheidungen

| Nr. | Thema | Stand bis zur Entscheidung |
|---|---|---|
| E6 / A7 | **Größenstufen je Widget** und `seitenleistenBreite` (Planungsrunde) | Die neun neuen Typen haben je eine Platzhalter-Stufe. Die größte Rasterstufe (`32 − Seitenleiste`) gibt es noch nicht. Beobachtet: „Sammel-Fortschritt“ (4×3) ist für seine Karte zu klein, „Alle Sammelobjekte“ (8×8) zeigt nur die Oberwelt-Hälfte. |
| E8 | **Themes für Sammelobjekte, Banner, Rüstung:** vertagt, wird an anderer Stelle geklärt (Max, 04.10.2026) | Oberwelt-Grün als Platzhalter mit eigener Theme-ID (A5) bleibt |
| E17 | **Inhalt des Spielerprofils** (Sidebar, seit #10): Gebaut sind Name und ein runder Platzhalter. Offen: Was zeigt der Platzhalter später, ein hochgeladenes **Profilbild** oder der **Skin** aus dem Spiel? Kommt mehr dazu: eigene Beiträge in der Welt (Orte, Sammelobjekte, Banner, Sets über `erstellerId`), der Standort, die angemeldeten Geräte (sehen, sperren)? Lässt sich das Profil antippen (eigenes Sheet)? | Name + Platzhalter, nicht antippbar |
| E21 | **Bauplan „Welt-Funde“ (erweiterter Welt-Import)** liegt vor: [`bauplaene/Bauplan-Welt-Funde.md`](bauplaene/Bauplan-Welt-Funde.md) (13.10.2026). Aus der hochgeladenen Welt zusätzlich Verliese, Schätze und Strukturen (über die Beute-Tabellen ungeöffneter Truhen), Netherportale, gefundene Schmiedevorlagen, getragene Rüstung, aufgestellte Banner und Welt-Info lesen und per Prüfliste übernehmen. **Fünf Fragen an Max:** Prüfliste oder automatisch, nur eigener Spieler oder alle, Sammelobjekte auch aus Truhen, Portale ohne Gegenstück, Bild der Welt. W0 bis W4 sind gebaut (13.10.2026). **Max (13.10.2026), alle fünf beantwortet:** automatisch übernehmen mit einem Schalter je Art, nur der eigene Spieler, Vorlagen zählen auch aus Truhen, Portale ohne Gegenstück als Ort auf die Karte, kein Bild der Welt. | Import liest die Funde mit, übernimmt aber nur die Biome |
| E22 | **Bauplan „Anmeldung und Dashboard-Zugang“** liegt vor (13.10.2026): [`bauplaene/Bauplan-Anmeldung-und-Dashboard-Zugang.md`](bauplaene/Bauplan-Anmeldung-und-Dashboard-Zugang.md), Prototyp `companion/entwuerfe/anmeldung-prototyp.html`, Referenzschema [`schema/`](schema/README.md). Anmeldeseite als Einstieg unter `/`, Konten mit Passwort und PIN (30 Min. offline), Dashboard-Login mit Zugangs-Code + Dashboard-PIN + Layout-Wahl. **Max (13.10.2026):** Board-PIN fällt weg (AN1), Konten werden neu angelegt (AN2), Anzeige-Link wird durch „Code generieren“ ersetzt (AN3), echter Name für alle sichtbar (AN10), lokaler PIN-Hash ja (AN12); AN5, AN6 (15 Min.), AN7 (Board-Sheet), AN11 (Platzhalter) bestätigt. **Max (14.10.2026):** Neue Konten gelten erst nach Freigabe durch ein bestehendes Konto (AN13, L19). **Noch offen:** AN4 (gleiches Layout auf verschieden großen Geräten, blockiert L5); ⚠ AN14 (Einzelheiten der Freigabe: erstes Konto sofort frei, jedes freigegebene Konto darf freigeben und ablehnen, im Board-Sheet unter „Konten“) ist so gebaut. **Max (14.10.2026): „mergen ab jetzt ohne Rückfragen“.** | **L1–L4 gebaut** (14.10.2026): Konten mit Passwort und PIN, Freigabe, Anmeldeseite unter `/`, Companion unter `/app/`, Board-PIN abgebaut; ⏸ H15. Dashboard-Zugänge am Server (L4, noch ohne Oberfläche). L5 wartet auf AN4, dann L6 |
| E19 | **Sammelobjekt-Karten neu** (Max, 06.10.2026): Jede Karte bekommt die **Ansicht der zugeordneten Struktur** (Dungeon oder Struktur, z. B. Außenposten, Waldanwesen, Prüfungskammer) **plus das Icon des Besatzes**; der **Kartenhintergrund wird an das Biom angeglichen**, in dem die Struktur liegt (Farbe aus `biom-ids.js`). **Max liefert die Struktur-Ansichten** (Bilder) noch. Vorbild: `companion/referenz/sammelobjekte/besaetze-fundorte-chancen-duplizieren.png`. Zu klären beim Bau: Zuordnung Struktur → Biom, wo mehrere möglich sind (Außenposten, Schiffswrack, Bastion); ob Fundchancen und Duplizier-Block aus dem Vorbild mit auf die Karte sollen (nicht im Datenmodell). | Liste mit Kennblock-Kopf je Gruppe, Karten nach Dimension eingefärbt |

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

## 5. Erinnerungen (nur Max)

**Pi und Cloudflare (Absicherung, 13.10.2026):**

- [ ] **Sicherung läuft?** Am Pi `sudo -u board crontab -l` muss die Zeile `15 3 * * * /opt/companion-board/koordinaten-board/pi/sicherung.sh` zeigen; Kopien liegen unter `/var/lib/companion-board/sicherung/`.
- [ ] **Kopie vom Pi wegholen**, sonst liegt alles auf einer SD-Karte: vom Laptop aus z. B. `rsync -a board@<pi>:/var/lib/companion-board/sicherung/ ~/companion-sicherung/` (Befehl steht in `koordinaten-board/pi/ANLEITUNG.md`, Abschnitt Sicherung).
- [ ] **Ratenbegrenzung bei Cloudflare** für `api.mainhubv1.com/api/anmelden`, `/api/registrieren`, `/api/pin*`, `/api/dashboard/code`, `/api/dashboard/freischalten` und `/api/dashboard/pin` (10 je Minute und IP) unter *Security → WAF → Rate limiting rules*. Die Sperre im Server (5 Fehlversuche, 60 s) bleibt zusätzlich.

**Pi-Update (14.10.2026):** Seit dem Bauplan „Anmeldung“ meldet sich die Companion über die Anmeldeseite mit Passwort an; ohne Update am Pi meldet die Seite „der Pi braucht ein Update“ (schon angemeldete Handys laufen weiter). Mit dem Update fallen alle alten Konten weg: **gleich danach registrieren**, das erste Konto gilt sofort. Das Update bringt auch die Routen von W2 und B3 (`POST /api/welten/:id/funde`, `GET /api/aenderungen`), falls noch nicht geschehen. Am Pi:

- [ ] `cd /opt/companion-board && sudo -u board git pull && cd koordinaten-board/server && sudo -u board npm ci --omit=dev && sudo systemctl restart companion-board` (wie in `koordinaten-board/pi/ANLEITUNG.md`, „Update“)

**GitHub:**

- **Branches löschen:** `umbau/anleitung-trixie`, `umbau/api-adresse`, `umbau/netlify`, `umbau/ocr-im-browser`, `umbau/pi-dienste`, `umbau/sqlite`, `planung/warteliste` und `claude/vibrant-mccarthy-qzhzq4` sind ganz in `main` und liegen noch auf GitHub. `bereich/karte-mcworld` hat noch einen Commit, der nicht in `main` ist (Stand aus dem alten Repo, 05.10.2026; wohl überholt). Der Git-Proxy der Cloud-Sitzung darf keine Branches löschen (HTTP 403).
- „Automatically delete head branches“ ist seit dem 13.10.2026 an: gemergte Branches verschwinden von selbst.
