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
| H10 | **Wartet auf Max (13.10.2026).** **Bauplan „Sitzung“, S4 · Umschalten:** Die Anzeige ist nur noch das Dashboard. Nach Merge und Update am Pi: `mainhubv1.com` am Fernseher/Tablet öffnen (landet auf `/dashboard/`), per QR aus dem Widget im Mobilfunk beitreten, Ort anlegen, „Aufs Board“ und „Wegnehmen“, Dienst neu starten (Sitzung leer, Layout da). **Anders als früher:** Lange Orte-Listen scrollen nicht von selbst, neue Orte leuchten nicht auf (nur „Neu“). Fehlt dir das? | `claude/festive-euler-a82up2` (PR S4) | Schritte in `koordinaten-board/pi/ANLEITUNG.md`, Abschnitt „Probe nach dem Umschalten auf das Dashboard“; Screenshots `n2-anzeige-netlify.png`, `v8-anzeige-ort.png`, `v10-anzeige-zwei.png` |
| H11 | **Wartet auf Max (13.10.2026).** **Welt-Import: Weltordner statt ZIP** (Bauplan „Welt-Funde“, W0): Karte → Welt → Welt-Import → „Weltordner wählen“ → in der Dateien-App den Ordner der Welt (z. B. `z2l2cn0rmkA=`) oder gleich `minecraftWorlds` wählen. Geht das am iPhone (Safari ab iOS 18.4)? Steht „Gebraucht: … von … Dateien“ da, stimmt der Weltname? Und: Lässt sich der Ordner aus der Dateien-App auf die gestrichelte Fläche ziehen? | `claude/festive-euler-a82up2` (PR #19) | `m4-import-start.png`, `m6b-weltordner.png`, `m6c-welt-waehlen.png` |
| H12 | **Wartet auf Max (13.10.2026).** **Welt-Funde an einer echten Welt** (Bauplan „Welt-Funde“, W1): Was der Import aus der Welt liest (Verliese, Schätze, Strukturen, Portale, Schmiedevorlagen, Rüstung, Banner, Welt-Info), mit dem Spiel vergleichen. Am PC mit Node 22: `cd companion/tools && node welt-pruefen.mjs <Welt.mcworld oder Weltordner>` (oder die Welt an Claude geben). Stimmen Orte und Koordinaten? Fehlt etwas, das du kennst? Steht „Andere Spieler“ da (Realm-Welt)? | `claude/festive-euler-a82up2` (PR W1) | Ausgabe von `welt-pruefen.mjs`, Abschnitt „Funde“ |

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
| E21 | **Bauplan „Welt-Funde“ (erweiterter Welt-Import)** liegt vor: [`bauplaene/Bauplan-Welt-Funde.md`](bauplaene/Bauplan-Welt-Funde.md) (13.10.2026). Aus der hochgeladenen Welt zusätzlich Verliese, Schätze und Strukturen (über die Beute-Tabellen ungeöffneter Truhen), Netherportale, gefundene Schmiedevorlagen, getragene Rüstung, aufgestellte Banner und Welt-Info lesen und per Prüfliste übernehmen. **Fünf Fragen an Max:** Prüfliste oder automatisch, nur eigener Spieler oder alle, Sammelobjekte auch aus Truhen, Portale ohne Gegenstück, Bild der Welt. W0 und W1 sind gebaut (13.10.2026); W1 liest nach den Vorschlägen zu Frage 2 und 3. **Max (13.10.2026):** automatisch übernehmen mit einem Schalter je Art, Portale ohne Gegenstück als Ort auf die Karte, kein Bild der Welt. Frage 2 und 3 gelten nach Vorschlag. | Import liest die Funde mit, übernimmt aber nur die Biome |
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
- [ ] **Ratenbegrenzung bei Cloudflare** für `api.mainhubv1.com/api/beitreten*` (10 je Minute und IP) unter *Security → WAF → Rate limiting rules*. Die Sperre im Server (5 Fehlversuche je Adresse, 60 s) bleibt zusätzlich.

**GitHub:**

- **Branches löschen:** `aufraeumen/doku`, `bereich/biom-ids`, `bereich/profil`, `claude/festive-euler-a82up2` sind gemergt und liegen noch auf GitHub. Der Git-Proxy der Cloud-Sitzung darf keine Branches löschen (HTTP 403).
- **„Automatically delete head branches“** in den Repo-Einstellungen einschalten (Settings → General → Pull Requests), dann verschwinden gemergte Branches von selbst.
