# Bauplan: Sitzung und eine Anzeige

Stand: 13.10.2026 · Grundlage: Entscheidung E16 (Max, 04.10.2026) und Warteliste E20 · Setzt voraus: Bauplan-Widget-Struktur, Bauplan-Widget-Groessensystem, Widget-Dashboard A0–A6 (gebaut)

> **Status: abgenommen (Max, 13.10.2026).** Alle fünf Fragen sind entschieden, siehe „Entschieden“ am Ende. Gebaut wird in den Phasen S1–S4, je auf eigenem Branch.

Dieser Bauplan beschreibt die technischen Entscheidungen. Er baut auf dem auf, was im Repo liegt (Pfade und Zeilen Stand `main` vom 13.10.2026).

## Ziel

1. **Eine Anzeige.** Das Widget-Dashboard (`companion/widgets`, heute unter `/dashboard`) wird die einzige Anzeige. Die alte React-Anzeige (`koordinaten-board/client`, heute unter `/anzeige`) fällt weg. Alles, was sie heute zeigt, gibt es als Widget oder im Kopf des Dashboards.
2. **Eine Sitzung.** Das Board hat je Anzeige eine Sitzung, die lebt, solange der Server läuft. Ein Neustart beginnt mit leerer Sitzung; das gespeicherte Layout bleibt. Inhalte der Sitzung lassen sich während der Laufzeit live ändern.
3. **„Aufs Board“ fügt ein Widget ein.** Statt eine Karte kurz groß zu zeigen, legt „Aufs Board“ den Inhalt als Widget an der ersten freien Stelle in die Sitzung. Am Handy lässt es sich in „Anzeige anordnen“ verschieben und entfernen, oder direkt am Inhalt mit „Wegnehmen“.

Damit sind E16 (Sitzung), E20 (Startseite der Domain) und die doppelte Pflege zweier Anzeigen erledigt.

## Ausgangslage

| Heute | Wo |
|---|---|
| „Aufs Board“ schickt die **fertige Karte** per WebSocket `{ art:"zeigen", karte, anfrage }`; Quellen `ort:<id>`, `sammel:<id>`, `sammelstand`, `banner:<id>`, `portal:<id>`, `ruestung:<id>` | `companion/companion-prototyp.html` (`boardZeigen`, `boardSenden`), `companion/board-karten.js` (`BOARD_KARTEN`) |
| Der Server hält **eine** Karte global im Speicher (`gezeigt`), prüft sie mit `kartePruefen`, sendet `gezeigt` an alle. Kein Timer, nicht je Anzeige | `koordinaten-board/server/src/server.js` (`zeigenBearbeiten`), `zeigen.js` |
| Nur die alte Anzeige stellt `gezeigt` dar (Overlay); das Dashboard hört nur auf `geaendert` | `client/src/anzeige/Gezeigt.tsx`, `widgets/src/features/karten/model/board.store.ts` |
| Layout je Anzeige: `{ layer:[{ id, name, instanzen:[{ id, typ, stufe, x, y, quelle? }] }], aktiverLayer }`, 32 Spalten; dauerhaft in SQLite. Der Server prüft nur die Form | `server/src/layout.js`, `daten.js` (`anzeigeLayout`, `anzeigeLayoutSetzen`, `anzeigeVollbildSetzen`) |
| Größenstufen und Passt-Prüfung gibt es **nur im Dashboard** (TypeScript) | `widgets/src/features/workspace/model/widget-register.ts`, `lib/collision-utils.ts` (`passt`), `model/workspace.store.ts` (`findSlot`) |
| `WIDGETS` ordnet Widget-Typen den Karten aus `BOARD_KARTEN` zu; `quellenVon` kennt `ort`, `sammel`, `banner`, `ruestung`. **Für `portal:<id>` gibt es keinen Widget-Typ** | `server/src/widgets.js` |
| Server-Karten haben kein Biom und keine Rüstungs-Figur (3D), die Handy-Karte schon | `widgets.js` (`kontext`), `companion-prototyp.html` (`boardKontext`) |
| Die alte Anzeige zeigt: Titel, Seed, Dimensions-Tabs, Verbunden-Punkt, Uhr, angeheftete Orte (max. 6), Orte-Spalten je Dimension mit Kennblock, Koordinaten- und Portal-Chip, „Neu“ (90 s), QR-Code mit Adresse und PIN (`qrZeigen`), Spieler, „Zuletzt gespeichert“ | `client/src/anzeige/Anzeige.tsx` |
| Daten dafür: `zustand` (aus `sicht.js`) und `teilnehmer` über den WebSocket, `GET /api/anzeige` für den QR-Code | `server.js`, `sicht.js` |

## Modell

```ts
// Server, nur im Speicher (Map anzeigeId → Sitzung); nie in SQLite
interface Sitzung {
  anzeigeId: string;
  instanzen: SitzungsInstanz[];
}

interface SitzungsInstanz {          // wie WidgetInstanz im Layout, plus Herkunft
  id: string;                        // randomUUID
  typ: string;                       // Widget-Typ aus WIDGETS
  stufe: string;                     // kleinste angebotene Stufe des Typs
  x: number; y: number;              // erste freie Stelle
  quelle: string;                    // z. B. "portal:<id>", "sammelstand"
  von: string; farbe: string;        // wer es aufs Board gelegt hat
  am: string;                        // ISO-Zeit
}
```

**Der Sitzungs-Layer.** `anzeigeLayout(anzeigeId)` liefert das gespeicherte Layout **plus** einen Layer `{ id:"sitzung", name:"Sitzung", instanzen }` aus der Sitzung, an erster Stelle, sobald die Sitzung ein Widget hat (eine leere Sitzung erscheint nicht, damit bestehende Layouts und der Layer-Umschalter unverändert bleiben; S1). Für Dashboard und „Anzeige anordnen“ ist er ein Layer wie jeder andere: anschauen, Widgets verschieben, Stufe wechseln, entfernen, Vollbild. Nicht erlaubt: löschen, umbenennen, Widgets aus der Galerie hinzufügen (dafür gibt es „Aufs Board“).

**Speichern trennen.** `anzeigeLayoutSetzen` nimmt das vom Handy geschickte Layout, zieht den Layer `sitzung` heraus und schreibt dessen Instanzen in die Sitzung (Speicher). Der Rest geht wie heute über `speichernVerzoegert` in SQLite. `aktiverLayer = "sitzung"` wird mitgespeichert; nach einem Neustart zeigt der Server dann den leeren Sitzungs-Layer. Ist das unerwünscht, fällt `aktiverLayer` beim Start auf den ersten gespeicherten Layer zurück (Vorschlag: so).

**Vollbild.** `vollbild` darf auf eine Sitzungs-Instanz zeigen; `imAktivenLayer` prüft gegen das gemischte Layout. Nach einem Neustart ist so ein Vollbild weg, wie die Sitzung.

## Regeln

- **Quelle → Widget-Typ.** Die Quelle `<art>:<id>` einer „Aufs Board“-Anfrage wird über eine neue Tabelle `QUELLE_ZU_TYP` in `widgets.js` abgebildet:

  | Quelle | Widget-Typ | Stand |
  |---|---|---|
  | `ort:<id>` | `karte.einzelkoordinate` | vorhanden |
  | `sammel:<id>` | `sammelobjekte.einzelobjekt` | vorhanden |
  | `sammelstand` | `sammelobjekte.status` | vorhanden |
  | `banner:<id>` | `banner.banner` | vorhanden |
  | `ruestung:<id>` | `ruestung.set` | vorhanden |
  | `portal:<id>` | **`portale.verbindung`** (neu: eine Verbindung, Karte `portalKarte`) | neu in `WIDGETS`, `quellenVon`, Register, Galerie |

- **Erste freie Stelle rechnet der Server.** Dafür wandern die **Größenstufen je Typ** (heute Werte in `widget-register.ts`) und die **Passt-Prüfung** (`passt` aus `collision-utils.ts`, rund 25 Zeilen) in eine gemeinsame Datei `companion/widget-groessen.js` (klassisches Script wie `regeln.js`: der Server lädt sie per `node:vm`, das Dashboard importiert sie über einen kleinen Adapter und nimmt die Werte von dort). Dann rechnen Server und Dashboard mit denselben Zahlen; nichts wird doppelt gepflegt. Die Suche läuft wie `findSlot`: kleinste Stufe des Typs, zeilenweise von oben links, Fläche `32 × reihen` der Anzeige (`a.reihen`; ohne Meldung 18).
- **Kein Platz frei:** Antwort `fehler` mit Text „Kein Platz auf der Anzeige. In ‚Anzeige anordnen‘ Platz schaffen.“, das Handy zeigt den Toast. Keine Verdrängung (entschieden, Frage 2).
- **Welcher Layer?** „Aufs Board“ legt das Widget in die Sitzung und macht den Sitzungs-Layer aktiv, falls er es nicht ist. So sieht man den Inhalt sofort (entschieden, Frage 1).
- **Welche Anzeige?** Heute gibt es meist eine. Die Anfrage darf `anzeigeId` tragen; fehlt sie, nimmt der Server die erste Anzeige (`anzeigenListe()[0]`). Das Board-Sheet am Handy bekommt bei mehreren Anzeigen eine Auswahl (klein, kann in S2 nachgezogen werden).
- **Mehrfach aufs Board:** Dieselbe Quelle ein zweites Mal legt kein zweites Widget an, sondern antwortet `ok` mit der vorhandenen `instanzId` (idempotent, wie der Knopf heute „Liegt auf dem Board“ zeigt).
- **Das Board bleibt reine Anzeige** (Bauplan Offline-Sync, Abschnitt 1): Entfernen, Verschieben und Vollbild gehen nur vom Handy aus.

## Protokoll

WebSocket, Rolle `steuerung` (Handy), wie heute:

| Nachricht | heute | neu |
|---|---|---|
| `zeigen` | `{ art, karte, anfrage }` | `{ art:"zeigen", quelle, anzeigeId?, anfrage }`. Der Server baut die Karte selbst mit `widgetKarte(typ, quelle)`; `kartePruefen` bleibt als Schutz. Antwort `ok { anfrage, instanzId }` |
| `verbergen` | `{ art, id }` | `{ art:"verbergen", instanzId, anfrage }` entfernt die Instanz aus der Sitzung |
| `gezeigt` | Karte an alle | **entfällt mit S4.** Bis dahin schickt der Server nach „Aufs Board“ die am Server gebaute Karte weiter als `gezeigt`, damit die alte Anzeige sie groß zeigt (Brücke, S2). Dazu `geaendert { bereich:"layout", anzeigeId }` an alle; das Dashboard lädt sein Layout wie heute neu, „Anzeige anordnen“ ebenso |

**Preis dieser Entscheidung:** Die Karte entsteht am Server, nicht mehr am Handy. Dort fehlen heute der Biom-Name (`biomName`) und das Foto der 3D-Rüstungsfigur (`ruestungFoto`). Für Orte zeigt das Widget dann kein Biom, für Rüstungs-Sets die Zeilen statt der Figur, genau wie heute schon die Galerie-Widgets. Folgearbeit außerhalb dieses Bauplans: Biom aus den importierten Kacheln am Server nachschlagen; die Figur als Foto mit der Anfrage mitschicken und am Server zwischenspeichern (Verzicht vorerst entschieden, Frage 3).

`geaendert` bekommt für den Bereich `layout` die `anzeigeId`. Das Dashboard und „Anordnen“ laden nur noch bei passender ID neu (heute laden alle).

## Handy (Companion)

- Knopf „Aufs Board“ schickt die Quelle statt der Karte. `boardKontext()` wird für „Aufs Board“ nicht mehr gebraucht (bleibt für den Rest).
- Zustand „Liegt auf dem Board · Wegnehmen“ kommt aus dem Layout der Anzeige (Sitzungs-Layer, `quelle`), nicht mehr aus `bd.gezeigt`. Die Companion lädt dazu `GET /api/anzeigen/:id/layout` beim Öffnen und nach `geaendert` `layout`.
- Board-Sheet: Abschnitt „Auf der Anzeige“ listet alle Sitzungs-Widgets (Titel, Bereich, von, Zeit) mit „Wegnehmen“ und einem Knopf „Alle wegnehmen“.
- „Anzeige anordnen“: zeigt den Sitzungs-Layer wie jeden anderen; Galerie-Knopf dort ausgeblendet, Löschen und Umbenennen des Layers gesperrt.

## Dashboard: Ersatz der alten Anzeige

Vier neue Widget-Typen, Bereich `board` (neu im Register, Theme neutral) und einer im Bereich `karte`:

| Typ | Inhalt | Daten |
|---|---|---|
| `board.beitreten` | QR-Code (aus `beitrittsUrl`, SVG im Browser wie heute), Adresse, PIN; nur sichtbar, wenn `qrZeigen` | `GET /api/anzeige` (hat das Dashboard schon für den Link), `einstellungen.qrZeigen` aus `zustand` |
| `karte.orte` | Orte je Dimension mit Kennblock, Koordinaten- und Portal-Chip (Oberwelt ↔ Nether), „Neu“ 90 s; Stufen: eine Dimension, alle drei nebeneinander; Option „nur angeheftete“ | `zustand.orte` aus `sicht.js`, gesendet beim Verbinden und bei `geaendert` `orte` |
| `board.spieler` | Teilnehmer-Chips | `teilnehmer` über den WebSocket |
| `board.zuletzt` | „Zuletzt gespeichert“, 8 Einträge | `zustand.orte`, sortiert nach `erstelltAm` |
| Kopf des Dashboards | Titel (`einstellungen.titel`), Seed gekürzt, Uhr, Verbunden-Punkt; ersetzt „Dashboard · Layer · Anzeigename“ an der Anzeige | `zustand`, Verbindungszustand des Stores |

Technisch:

- `board.store.ts` verarbeitet neu `zustand` und `teilnehmer` (heute nur `geaendert`) und hält sie im Store. Keine neuen REST-Routen.
- `KarteAnsicht.tsx` zeigt den Kennblock über `karte.typ` (wie `Gezeigt.tsx` mit `kennblockDatei`). Damit haben auch Einzelkoordinate und Sitzungs-Widgets ihren Kennblock.
- Neues Standard-Layout (`default-layout.ts`): Orte alle Dimensionen groß, Beitreten, Spieler, Sammel-Fortschritt; Sitzungs-Layer leer.
- Die Sitzungs-Widgets zeigen oben rechts klein „von <Name>“ in der Farbe des Spielers (aus `SitzungsInstanz.von`/`farbe`, über das Layout mitgeliefert).

## Startseite und Wegfall von `/anzeige` (E20)

- **`/` = Dashboard.** Der Pfad `/dashboard` bleibt (Routen, Links, Tests ändern sich nicht), `/` leitet per `netlify/_redirects` auf `/dashboard/` weiter, mit Query (entschieden, Frage 4).
- `netlify/bauen.sh`: Anzeige-Build entfällt; Dashboard weiter nach `/dashboard/`, Kennblöcke weiter nach `/icons/`.
- Server: `anzeigeLink` zeigt auf `/dashboard?anzeige=…&schluessel=…`; Auslieferung von `CLIENT_DIST` und die `/anzeige`-Weiche im `setNotFoundHandler` entfallen; Konsole und `anzeige-link.txt` nennen den Dashboard-Link. Lokal liefert der Server das Dashboard aus `companion/widgets/dist` wie heute; `npm run build` im Board baut dann das Dashboard statt des Clients.
- `koordinaten-board/client/` wird nach H10 gelöscht (entschieden, Frage 5). CI-Job „Board installieren und bauen“ entsprechend angepasst.
- Tests, die umgeschrieben werden: `server/test/api.test.js` (Pfad `/anzeige` → `/dashboard`, Nachricht `gezeigt` → Layout), Playwright `anzeige-link`, `anzeigeschema`, `board`, `live`, `netlify` (Selektoren `.a-*`/`.g-*` → Dashboard, „Aufs Board“ prüft das Sitzungs-Widget), `widgets-anordnen` (ohne `client/dist`).
- Doku: `koordinaten-board/README.md`, `UEBERGABE.md`, `pi/ANLEITUNG.md` (Probe-Abschnitt), `netlify.toml`-Kommentar, `UMBAUPLAN.md` (Zielbild).

## Phasen, Haltepunkte, Branches

| Phase | Inhalt | Branch | Tests |
|---|---|---|---|
| **S1** Sitzung am Server · **gebaut 13.10.2026** | `sitzung.js` (Map, erste freie Stelle), `widget-groessen.mjs` gemeinsam, `QUELLE_ZU_TYP`, `portale.verbindung` in `WIDGETS`, `zeigen`/`verbergen` neu, Sitzungs-Layer in `anzeigeLayout`/`anzeigeLayoutSetzen`, `geaendert` mit `anzeigeId`. Alte Nachricht `gezeigt` bleibt in S1 parallel bestehen, damit die alte Anzeige bis S4 weiterläuft | `bereich/sitzung-server` | `node --test`: Sitzung (anlegen, idempotent, kein Platz, Neustart leer, Layout mischt, Speichern filtert), Größen gemeinsam |
| **S2** Handy und Dashboard · **gebaut 13.10.2026** | Companion schickt Quelle, Zustand aus dem Layout, Board-Sheet-Liste, Anzeige-Auswahl; Dashboard und „Anordnen“ zeigen den Sitzungs-Layer (gesperrt für Löschen/Umbenennen/Galerie), `portale.verbindung` im Register und in der Galerie, Kennblock in `KarteAnsicht`, „von“-Chip | `bereich/sitzung-dashboard` | Playwright: Aufs Board → Widget erscheint im Dashboard, Wegnehmen, Anordnen verschiebt Sitzungs-Widget |
| **S3** Widgets der Anzeige | `board.beitreten`, `karte.orte`, `board.spieler`, `board.zuletzt`, Kopf; Store verarbeitet `zustand`/`teilnehmer`; neues Standard-Layout | `bereich/anzeige-widgets` | Playwright-Screenshots ⏸ **H9:** Dashboard mit allen Blöcken der alten Anzeige nebeneinander (16:9), Max vergleicht mit `/anzeige` |
| **S4** Umschalten und Aufräumen | `/` → Dashboard, `anzeigeLink`, `_redirects`, `bauen.sh`, `gezeigt` entfernt, `client/` gelöscht, Tests und Doku umgeschrieben | `aufraeumen/alte-anzeige` | alle Tests grün ⏸ **H10:** Probe am Fernseher/Tablet mit dem Anzeige-Link und über Mobilfunk: beitreten per QR aus dem Widget, Ort anlegen, „Aufs Board“, Wegnehmen, Neustart des Dienstes → Sitzung leer, Layout da |

Jede Phase ein PR gegen `main`, gemergt nach Rückfrage. S1 und S2 können ohne Haltepunkt durchlaufen; S3 wartet auf H9, S4 auf H10.

## Nicht Teil dieses Bauplans (offen)

- Echte Größenstufen je Widget (A7, E6): Die neuen Typen bekommen vorerst je eine Platzhalter-Stufe wie die anderen.
- Themes für Sammelobjekte, Banner, Rüstung (E8).
- Biom am Server und Rüstungs-Figur am Server (Folgearbeit, siehe Protokoll).
- Inhalte aus Warteliste Kapitel 4 (Koordinatensammlung, Eigene Liste, echte Gesamtkarte, Handbuch, Baupläne).
- Eine Sitzung, die einen Neustart übersteht (bewusst nicht, E16).

## Entschieden (Max, 13.10.2026)

1. **Eigener Sitzungs-Layer.** „Aufs Board“ legt das Widget in den Sitzungs-Layer, nicht in den aktiven Layer; die Sitzung ist nach einem Neustart leer, das Layout bleibt.
2. **Kein Platz frei: ablehnen** mit Hinweis, keine Verdrängung.
3. **Karte vom Server:** Verzicht auf Biom-Name und 3D-Figur auf dem Board, bis die Folgearbeit kommt.
4. **Pfad:** `/dashboard` bleibt, `/` leitet dorthin um.
5. **`koordinaten-board/client/` wird gelöscht** (nach H10).

## Reihenfolge und Git

1. ~~Fragen 1–5 beantworten~~ erledigt (13.10.2026)
2. S1 auf `bereich/sitzung-server` → Commits „Sitzung: Modell und erste freie Stelle“, „Widget-Größen gemeinsam“, „Aufs Board legt Sitzungs-Widget an“, PR
3. S2 auf `bereich/sitzung-dashboard` → Commits „Companion: Aufs Board mit Quelle“, „Dashboard: Sitzungs-Layer und Kennblöcke“, „Portal-Verbindung als Widget“, PR
4. S3 auf `bereich/anzeige-widgets` → Commits je Widget, „Kopf der Anzeige“, Screenshots, PR, ⏸ H9
5. S4 auf `aufraeumen/alte-anzeige` → Commits „Startseite: Dashboard“, „Alte Anzeige entfernt“, „Tests und Doku“, PR, ⏸ H10
