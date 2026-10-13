# Bauplan: Erweiterter Welt-Import („Welt-Funde“)

Stand: 13.10.2026 · Grundlage: Frage von Max („Was kann man aus dem .mcworld-Upload alles bekommen?“, 13.10.2026) und Auswertung der Testwelt `companion/tests/daten/fixture-seed.mcworld` · Setzt voraus: Welt-Import (Strang C, im Archiv: `docs/bauplaene/Bauplan-Welt-Import.md`, `docs/plaene/PLAN-welt-import-biome.md`)

> **Status: W0 und W1 gebaut (13.10.2026), W2 und W3 Entwurf.** Auf Wunsch von Max kam zuerst W0: den Weltordner direkt wählen oder hineinziehen, nur die gebrauchten Dateien behalten. Danach W1 („mergen und weiter“, Max 13.10.2026): Die Funde werden gelesen, die Companion zeigt sie noch nicht. **Max hat Frage 1, 4 und 5 beantwortet (13.10.2026, Abschnitt „Entscheidungen“):** automatisch übernehmen mit einem Schalter je Art, Portale ohne Gegenstück auf die Karte, kein Bild der Welt. Frage 2 und 3 gelten weiter nach Vorschlag.

Dieser Bauplan beschreibt die technischen Entscheidungen. Er baut auf dem auf, was im Repo liegt (Stand `main` vom 13.10.2026).

## Ziel

1. **Mehr aus derselben Datei.** Der Welt-Import liest heute nur Seed, Name, Version und je Chunk das Biom. Dieselbe Datei verrät auch, wo Verliese, Schätze und Strukturen liegen, welche Netherportale es gibt, was der Spieler trägt und besitzt und welche Banner aufgestellt sind.
2. **Funde statt Abtippen.** Was der Import findet, wird automatisch übernommen (Entscheidung 13.10.2026, statt einzeln abzuhaken): daraus werden Orte, Portal-Verbindungen, gefundene Sammelobjekte, Rüstungs-Sets und Banner, geprüft mit denselben Regeln wie bei der Eingabe von Hand.
3. **Nichts geht verloren.** Funde kommen nur dazu. Der Import löscht und überschreibt nichts außer den Biomen, wie heute.

## Ausgangslage

| Heute | Wo |
|---|---|
| Der Worker liest die ZIP Datei für Datei, ein Besucher sieht **jeden** LevelDB-Eintrag, behält aber nur Data3D (Tag 43) | `companion/biom-welt.js` (`weltLesen`, `streamingLesen`), `biom-import.worker.js` |
| `level.dat` wird mit einem kleinen NBT-Leser gelesen, nur `RandomSeed`, `LevelName`, `lastOpenedWithVersion` | `biom-dekoder.js` (`levelDatLesen`) |
| Prüfliste: Chunks, Vorschau, häufigste Biome, unbekannte IDs; „Übernehmen“ ersetzt den Biom-Import der Welt, der Seed muss passen | `companion-prototyp.html` (Abschnitt Welt-Import), `regeln.js` (`biomImportPruefen`) |
| Orte kommen von Hand (`quelle:"manuell"`) oder aus Screenshots (`"screenshot"`); der Server kennt nur diese zwei | Board `daten.js` (Ort anlegen), `regeln.js` (`instanzPruefen`) |
| Doppelte erkennt die Companion nur beim Screenshot-Import (gleicher Ort, gleiches Banner) | `companion-prototyp.html` (Screenshot-Prüfliste) |
| Synthetische Testwelten baut `tests/welt-bauen.mjs`, echte Welt zum Prüfen: `tools/welt-pruefen.mjs` | `companion/tests/`, `companion/tools/` |

**Ausgewertet an der Testwelt** (klein, 30 Chunks, Bedrock 1.26.51):

| Eintrag | Anzahl | Inhalt |
|---|---|---|
| Block-Entities (Tag 49) | 23 | 10 Truhen mit Beute-Tabelle, 6 Spawner mit Mob, 7 Sculk-Blöcke, jeweils mit Koordinate |
| Lebewesen (`actorprefix…`) | 10 | Art (`identifier`) und Position |
| Spieler `~local_player` | 1 | Position, Dimension, Inventar (36), Rüstung, Endertruhe, Level |
| `level.dat` | 116 Felder | Spielmodus, Schwierigkeit, Zeit, Spawn, Spielregeln, Hardcore, Cheats, Experimente |

Daraus ergeben sich **6 Verliese** (Spawner mit Zombie oder Spinne, daneben `simple_dungeon`-Truhen) und **1 vergrabener Schatz** (`buriedtreasure`, X 72 · Y 47 · Z −56). Das ist die Grundwahrheit für die Tests.

## W0: Weltordner statt ZIP (gebaut 13.10.2026)

Max (13.10.2026): „Als erstes ein Upload-Feld, in das man den ganzen Ordner vom iPhone ziehen kann. Danach sollen lediglich die Dateien behalten werden, die gebraucht werden.“

- **Ordner wählen:** Knopf „Weltordner wählen“ (`<input type="file" webkitdirectory>`). Safari am iPhone kann das **ab iOS 18.4**; davor öffnet der Knopf nur die normale Dateiauswahl. Deshalb bleibt „ZIP oder .mcworld wählen“ als Rückweg daneben.
- **Hineinziehen:** Fläche „Weltordner hierher ziehen“; Ordner werden über `webkitGetAsEntry` rekursiv gelesen (Safari liefert höchstens 100 Einträge je `readEntries`, darum bis zur leeren Antwort). Die Einträge holt die Seite noch im `drop`-Ereignis, danach gibt der Browser sie nicht mehr heraus. Ob Ziehen aus der Dateien-App am iPhone klappt, ist nicht belegt; am iPad und am Rechner geht es. Eine abgelegte ZIP geht wie gewählt.
- **Nur Gebrauchtes behalten** (`companion/welt-ordner.js`): `level.dat`, `levelname.txt`, `db/CURRENT`, `db/MANIFEST-*`, `db/*.ldb`, `db/*.log`. Liegen bleiben `resource_packs/`, `behavior_packs/`, `world_*_packs.json`, `world_icon.jpeg`, `level.dat_old`, `db/LOCK`, `db/LOG` (Aufbau wie im Screenshot von Max). Nur diese Dateien gehen an den Worker; die Bestätigung zeigt „Gebraucht: 8 von 17 Dateien · 38 KB“. `world_icon.jpeg` kommt erst mit Frage 5 dazu.
- **Mehrere Welten:** Wer gleich `minecraftWorlds` wählt, bekommt die Welten darin mit ihrem Namen aus `levelname.txt` zur Auswahl. Ein Ordner ohne `level.dat` und `db/CURRENT` ergibt „Darin ist keine Welt …“.
- **Gleicher Leser:** `biom-welt.js` nimmt die Ordner-Liste wie eine ZIP (`ordnerAlsEintraege`); Aufbauprüfung, Streaming und Ergebnis sind dieselben. Tests: Ordner und ZIP liefern dieselben Kacheln, auch für die Testwelt von Max; Ablage mit 150 Dateien in `db/`; Playwright wählt Ordner (`setInputFiles` mit Verzeichnis), `minecraftWorlds` und zieht eine ZIP auf die Fläche.

## W1: Funde lesen (gebaut 13.10.2026)

- **Wo:** `companion/nbt.js` (NBT in Little Endian, auch für `level.dat` in `biom-dekoder.js`) und `companion/welt-funde.js` (`fundeSammler`). `biom-welt.js` reicht jeden LevelDB-Eintrag an den Sammler; `weltLesen` liefert `{ meta, kacheln, funde }`, der Worker schickt `funde` mit `fertig`. Die Seite legt sie in `wi.ergebnis.funde` ab, zeigt sie aber erst ab W2. `tools/welt-pruefen.mjs` druckt die Funde mit deutschen Namen.
- **Testwelt von Max:** genau 6 Verliese und 1 vergrabener Schatz an den bekannten Koordinaten, Spieler bei X 0 · Y 74 · Z 0, Überleben, Normal. Streaming und „komplett“ finden dasselbe.
- **Abweichungen vom Entwurf, beim Bauen entschieden:**
  - **Verliese:** Ein Verlies hat genau einen Spawner. Je Spawner ein Ort, die Truhen gehören zum nächsten. In der Testwelt liegen zwei Verliese nur 16 Blöcke auseinander; mit verketteter Nähe wären es 5 statt 6 gewesen.
  - **Spawner** zählen auch für andere Strukturen: Höhlenspinne → Mine, Silberfisch → Festung, Lohe → Netherfestung, Magmawürfel → Bastionsruine.
  - **Portal-Paare** bildet erst die Seite in W2, mit `zielSuchen` aus `board-karten.js` (nichts doppelt pflegen). W1 liefert die Liste der Portale; `welt-pruefen.mjs` zeigt die Paare schon über dieselbe Funktion.
  - **Lederfarbe** kommt als Hex-Wert (`lederfarbe`), die nächste Farbe aus `FARBEN` wählt W2. `welt-funde.js` hängt nicht an `regeln.js` (der Worker ist ein Modul); ein Test hält Kategorien, Muster, Farben, Rüstungen und Vorlagen mit `regeln.js` zusammen.
  - **Rüstungsständer** werden auch Sets („Rüstungsständer bei X · Z“), wie im Abschnitt Aufbau vorgesehen.
  - **Welt-Info** heißt `tage` (vergangene Tage, `Time` ÷ 24 000) statt `tag`.
  - **Andere Spieler** (`player_…`) werden nur gezählt (Frage 2).
  - **Kaputte Einträge** kosten nur ihren Fund; `fehler` zählt Einträge, deren letzter Stand nicht lesbar ist.
- **Tests:** `companion/tests/welt-funde.test.mjs` (11): NBT-Leser (alle Typen, kaputte und zu tief verschachtelte Daten, `__proto__`), Testwelt von Max, die synthetische Fundewelt aus `welt-bauen.mjs` (`fundeweltBauen`: Strukturen, Löschen und Überschreiben in der `.log`, Lebewesen auch im alten Format, Portale, Spieler, Vorlagen, Rüstung, Banner, Welt-Info), Ordner = ZIP = „komplett“, Abgleich mit `regeln.js`. Playwright `karte-mcworld`: Der Worker liefert die Funde im DEMO und live vom Board.

## Was gelesen wird

| Quelle in der Welt | Was daraus wird | In der Testwelt | Phase |
|---|---|---|---|
| Truhen, Fässer, Shulkerkisten (Block-Entity) mit `LootTable` | **Ort** der Struktur, Kategorie über die Beute-Tabelle (Tabelle unten) | ja | W1 |
| Spawner (`MobSpawner`) neben `simple_dungeon`-Truhen | **Ort** „Dungeon“, Mob als Zusatz | ja | W1 |
| Lore mit Truhe (Akteur `minecraft:chest_minecart`) mit Beute-Tabelle | **Ort** „Mineshaft“ | nein | W1 |
| Seltsamer Kies und Sand (`BrushableBlock`) mit Beute-Tabelle | **Ort** „Trail Ruins“ oder „Desert Well“ / „Desert Temple“ | nein | W1 |
| Tresor und Prüfungs-Spawner (`Vault`, `TrialSpawner`) | **Ort** „Trial Chamber“ | nein | W1 |
| Global `portals` (Liste der Netherportale mit Position, Dimension, Ausrichtung) | **Portal-Verbindungen**, Paare über die Prüf-Logik der Portal-Verwaltung (W2) | nein | W1 |
| `~local_player`: Inventar, Endertruhe, Rüstung | **Sammelobjekte gefunden** (Schmiedevorlagen), **Rüstungs-Set** aus der getragenen Rüstung samt Besatz | ja (leer) | W1 |
| Gegenstände in allen Behältern (`Items`) | **Sammelobjekte gefunden** | ja | W1 |
| Banner (Block-Entity `Banner`, `Base`, `Patterns`) | **Banner** mit Grundfarbe und Mustern | nein | W1 |
| `level.dat` | **Welt-Info** im Welt-Sheet: Spielmodus, Schwierigkeit, Tag, Spawn, zuletzt gespielt, Hardcore, Cheats | ja | W1 |
| Strukturbereiche (Tag 57, `HardcodedSpawners`) | **Orte** „Nether Fortress“, „Witch Hut“, „Monument“, „Outpost“ ohne Truhe | nein | W3 |
| Dörfer (`VILLAGE_<id>_INFO`) | **Ort** „Village“ mit Mittelpunkt | nein | W3 |
| Das End (`TheEnd`): Drache besiegt, Transittore | **Orte** „End Gateway“, Hinweis im Welt-Sheet | nein | W3 |
| `world_icon.jpeg` | ~~Bild der Welt~~ entfällt (Frage 5, Max 13.10.2026) | nein | – |

Nicht gelesen werden: jeder einzelne Block (SubChunks, zu teuer am iPhone), Lebewesen außer Loren und Rüstungsständern, Karten-Items, Daten anderer Spieler (Frage 2).

**Was in der Testwelt fehlt, ist aus der Beschreibung des Bedrock-Formats übernommen.** Feldnamen und Kodierungen (Portal-Liste, Besatz an Rüstungsteilen, Farbcodes der Banner, Strukturbereiche) werden in W1 bzw. W3 an einer echten Welt von Max geprüft, bevor Code darauf baut (Haltepunkt H12).

### Beute-Tabelle → Kategorie

Die Beute-Tabelle steht nur in **ungeöffneten** Behältern (`loot_tables/chests/<name>.json`). Zugeordnet wird über den Namen ohne Pfad, als Liste in `welt-funde.js`; eine unbekannte Tabelle wird gezählt und in der Prüfliste gemeldet, nicht geraten.

| Name der Beute-Tabelle (Anfang) | Kategorie (`FEATURE_KATEGORIEN`) | Dimension |
|---|---|---|
| `simple_dungeon` | Dungeon | Oberwelt |
| `buriedtreasure` | Treasure | Oberwelt |
| `abandoned_mineshaft` | Mineshaft | Oberwelt |
| `village/` | Village | Oberwelt |
| `ancient_city` | Ancient City | Oberwelt |
| `stronghold_` | Stronghold | Oberwelt |
| `woodland_mansion` | Mansion | Oberwelt |
| `pillager_outpost` | Outpost | Oberwelt |
| `desert_pyramid` | Desert Temple | Oberwelt |
| `jungle_temple` | Jungle Temple | Oberwelt |
| `shipwreck` | Shipwreck | Oberwelt |
| `underwater_ruin`, `ocean_ruin` | Ocean Ruins | Oberwelt |
| `igloo` | Igloo | Oberwelt |
| `ruined_portal` | Ruined Portal | Oberwelt oder Nether |
| `trail_ruins` | Trail Ruins | Oberwelt |
| `desert_well` | Desert Well | Oberwelt |
| `trial_chambers/` | Trial Chamber | Oberwelt |
| `nether_bridge` | Nether Fortress | Nether |
| `bastion_` | Bastion | Nether |
| `end_city_treasure` | End City | End |

## Regeln

- **Ein Ort je Struktur.** Mehrere Behälter derselben Kategorie, die nah beieinander liegen, ergeben einen Ort. Nähe je Kategorie (Vorschlag): 16 Blöcke für Dungeon, Treasure, Igloo, Ruined Portal, Desert Well; 48 für Tempel, Schiffswrack, Ruinen, Außenposten; 96 für Village, Mansion, Bastion, Nether Fortress, End City, Trial Chamber; 160 für Ancient City und Stronghold. Koordinate des Orts: beim Verlies der Spawner, sonst der Behälter, der dem Mittelpunkt am nächsten liegt (eine echte Blockposition, Y inklusive).
- **Schon bekannt.** Liegt in der Welt schon ein Ort derselben Kategorie innerhalb derselben Nähe, ist der Fund „schon bekannt“: in der Prüfliste ausgegraut, nicht angehakt. Für Portale gilt dasselbe mit 8 Blöcken, für Banner der Vergleich wie beim Screenshot (`bannerSchluessel`), für Rüstungs-Sets der gleiche Aufbau aller vier Teile.
- **Herkunft.** Orte aus dem Import tragen `quelle:"welt"`. Der Server nimmt den Wert an (heute nur `manuell` und `screenshot`); `instanzPruefen` lässt ihn wie `manuell` zu, also ohne neue Varianten. Die Companion zeigt im Ort-Detail „aus dem Welt-Import“.
- **Wem gehört der Fund.** `von` und `erstellerId` setzt der Server wie immer aus dem Token, also für den Account, der importiert.
- **Sammelobjekte nur dazu.** Liegt eine Schmiedevorlage (`minecraft:<id>_armor_trim_smithing_template`, `minecraft:netherite_upgrade_smithing_template`) im Inventar, in der Endertruhe oder in einem Behälter (Frage 3), wird das Sammelobjekt als gefunden angeboten. Ein Import setzt nie etwas auf „offen“ zurück.
- **Portale als Paare.** Aus der Portal-Liste werden Verbindungen nur dort, wo ein Oberwelt- und ein Netherportal sich nach der Prüf-Logik der Portal-Verwaltung gegenseitig treffen (±128, Bedrock). Name: „Portal bei X · Z“ der Oberwelt. Ein Portal ohne Gegenstück wird ein Ort „Eigene Orte · Netherportal“ (Frage 4, Max 13.10.2026).
- **Rüstung.** Die getragene Rüstung wird ein Set „Getragene Rüstung (<Datum>)“, wenn mindestens ein Teil eine bekannte Rüstung ist; Besatz und Material über die IDs aus `regeln.js` (`besatzMuster`, `besatzMaterial`), gefärbtes Leder auf die nächste Farbe aus `FARBEN`. Geprüft mit `ruestungPruefen`, was nicht passt, fällt mit Meldung weg.
- **Banner.** Jedes aufgestellte Banner wird ein Vorschlag „Banner bei X · Z“, geprüft mit `bannerPruefen`. Das Unheilvolle Banner der Plünderer (`Type` 1) wird übersprungen. Muster-Kürzel und Farbcodes des Formats werden über eine Tabelle in `welt-funde.js` auf `MUSTER` und `FARBEN` abgebildet.
- **Welt passt.** Funde gelten nur für die Welt, deren Seed passt, wie die Biome (`biomImportPruefen`). Banner und Rüstungs-Sets sind weltübergreifend, wie heute.
- **Grenzen sagen.** Die Prüfliste nennt, was der Import nicht sehen kann: nur erkundete Chunks; geöffnete Truhen verlieren ihre Beute-Tabelle; Stand ist der Zeitpunkt des Exports.

## Aufbau

- **`companion/nbt.js`** (neu, ES-Modul): NBT in Little Endian lesen, alle Tag-Arten, mehrere Compounds hintereinander (Block-Entities liegen so). `levelDatLesen` in `biom-dekoder.js` nutzt ihn statt des eigenen Lesers.
- **`companion/welt-funde.js`** (neu, ES-Modul): `fundeSammler()` bekommt im selben Durchlauf wie die Biome jeden Eintrag (`aufnehmen` in `biom-welt.js`) und behält nur, was er braucht: Tag 49 nach `id` gefiltert, `portals`, `~local_player`, `actorprefix…` nur Loren mit Truhe und Rüstungsständer, später Tag 57, `VILLAGE_…_INFO`, `TheEnd`. Am Ende `fundeAuswerten()` → `{ orte, portale, sammelobjekte, ruestung, banner, info, unbekannt }`. Die Zuordnungstabellen (Beute-Tabelle, Nähe, Muster-Kürzel, Farbcodes) stehen hier.
- **`biom-welt.js`** reicht jeden Eintrag zusätzlich an den Sammler; Ergebnis `{ meta, kacheln, funde }`. Speicher: nur gefilterte Funde, kein Rohwert bleibt liegen.
- **Worker** schickt `funde` mit `fertig` zurück. **`tools/welt-pruefen.mjs`** druckt die Funde aus, damit eine echte Welt am PC geprüft werden kann, ohne die Companion.
- **Companion** (überholt durch die Entscheidungen vom 13.10.2026: Schalter je Art statt Haken je Fund, eine Route `POST /welten/:id/funde`)**:** Die Prüfliste des Welt-Imports bekommt unter den Biomen Abschnitte „Orte“, „Portale“, „Sammelobjekte“, „Rüstung“, „Banner“ und „Welt“, jeweils mit Haken, Anzahl und „schon bekannt“. „Übernehmen“ schickt erst die Biome (wie heute), dann die angehakten Funde über die bestehende API (`POST /orte/instanzen`, `POST /portale/welten/:id`, `PUT /sammelobjekte/welten/:id/:objekt`, `POST /ruestung`, `POST /banner`), mit IDs vom Handy (B1). Fortschritt und Fehler je Fund in der Liste. Der DEMO-Mock kann dasselbe.
- **Server:** `quelle:"welt"` annehmen; Welt-Info (`spielmodus`, `schwierigkeit`, `tag`, `spawn`, `zuletztGespielt`, `hardcore`, `cheats`) als Teil von `import` speichern und in `GET /welten/:id/biome` zurückgeben (`biomImportPruefen` und `biomImportSauber` erweitern). Keine neuen Routen (überholt: `POST /welten/:id/funde`, siehe „Entscheidungen“).

## Entscheidungen von Max (13.10.2026) und was sich für W2 ändert

- **Frage 1 → automatisch übernehmen, mit einem Schalter je Art.** In einer großen Welt stehen auch Strukturen, die der Spieler nie gesehen hat (das Spiel erzeugt die Chunks rund um ihn samt Verliesen und Minen), also leicht hunderte Verliese. Max wählte deshalb: Die Prüfliste zeigt unter den Biomen je Art eine Zeile mit Anzahl und Schalter (z. B. „Verlies 412“, „Wüstentempel 3“, „Portal-Verbindung 2“, „Schmiedevorlage 4“), alle an. Kein Abhaken einzelner Funde. „Übernehmen“ legt die Biome und alles Eingeschaltete an; schon Bekanntes wird gezählt und übersprungen.
- **Frage 4 → ein Portal ohne Gegenstück wird ein Ort.** Eine Portal-Verbindung braucht beide Seiten (`verbindungRegelPruefen`). Ein einzelnes Portal wird deshalb ein Ort „Eigene Orte · Netherportal“ in seiner Dimension, mit eigenem Schalter.
- **Frage 5 → kein Bild der Welt.** `world_icon.jpeg` bleibt liegen, W3 ohne diesen Punkt.
- **Eine Route statt vieler Anfragen:** Hunderte Funde einzeln über `POST /orte/instanzen` usw. hießen hunderte Anfragen und je eine `geaendert`-Meldung an alle Geräte. Neu ist deshalb `POST /welten/:id/funde { orte, verbindungen, sammelobjekte, ruestung, banner }`: Der Server prüft jeden Eintrag mit denselben Regeln und Funktionen wie die einzelnen Routen, legt alles in einem Rutsch an und meldet je Bereich einmal. Was eine Regel ablehnt, kommt mit Meldung zurück, der Rest wird angelegt. Der DEMO-Mock kann dasselbe.
- **„Schon bekannt“ prüft die Companion** mit dem, was sie geladen hat (Orte, Verbindungen, Sammelstand, Banner, Sets), und schickt nur Neues. Zwei Geräte, die gleichzeitig dieselbe Welt importieren, könnten doppelt anlegen; das bleibt in Kauf genommen.
- **Welt-Info** wird Teil des Imports (`import.info`, `biomImportSauber`) und steht im Welt-Sheet.

## Phasen, Haltepunkte, Branches

| Phase | Inhalt | Tests |
|---|---|---|
| **W0** Weltordner statt ZIP · **gebaut 13.10.2026** | Ordner wählen oder hineinziehen, nur gebrauchte Dateien, Auswahl bei mehreren Welten, ZIP bleibt als Rückweg | `node --test` (Ordner = ZIP, auch Testwelt von Max; Ablage rekursiv), Playwright `karte-mcworld`. ⏸ **H11:** Max wählt am iPhone den Weltordner (und probiert das Hineinziehen aus der Dateien-App) |
| **W1** Funde lesen · **gebaut 13.10.2026** | `nbt.js`, `welt-funde.js`, Sammler im Durchlauf von `biom-welt.js`, Worker und `welt-pruefen.mjs` geben Funde aus. Truhen, Spawner, Loren, Kies, Tresore, Portale, Spieler, Behälter-Inhalte, Banner, Rüstungsständer, Welt-Info | `node --test welt-funde.test.mjs`: NBT-Leser; Testwelt ergibt genau 6 Verliese und 1 Schatz an den bekannten Koordinaten; `fundeweltBauen` mit Portalen, Bannern, Rüstung und Vorlagen; unbekannte Beute-Tabelle wird gemeldet. ⏸ **H12:** Max lässt `welt-pruefen.mjs` (oder Claude mit seiner Datei) über seine echte Welt laufen und vergleicht die Liste mit dem Spiel |
| **W2** Übersicht und automatisch Übernehmen | Je Art eine Zeile mit Anzahl und Schalter (Entscheidungen 13.10.2026), „schon bekannt“, Portal-Paare (`zielSuchen` aus `board-karten.js`), Portale ohne Gegenstück als „Eigene Orte · Netherportal“, Lederfarbe → `FARBEN`, Übernehmen über `POST /welten/:id/funde`, `quelle:"welt"` und Welt-Info am Server, Welt-Info im Welt-Sheet | Playwright `karte-mcworld` (DEMO) und live gegen das Board: Funde erscheinen, schon bekannte sind ausgegraut, Übernehmen legt Orte, Verbindung, Sammelobjekt, Set und Banner an, zweiter Import legt nichts doppelt an. ⏸ **H13:** Max importiert am iPhone und schaut Prüfliste und Karte an |
| **W3** Strukturen ohne Truhe | Strukturbereiche (Tag 57), Dörfer, End-Transittore (Bild der Welt entfällt, Frage 5) | wie W1, an einer Welt von Max mit diesen Strukturen |

Jede Phase ein PR gegen `main`, gemergt nach Rückfrage. Branch: der Branch der Sitzung (`claude/…`), wie bei Bauplan „Sitzung“.

## Nicht Teil dieses Bauplans (offen)

- Jeden Block lesen (SubChunks), etwa für Erze, Endportalrahmen oder selbst gebaute Basen: zu teuer am iPhone, eigener Bauplan, falls gewünscht.
- Dorfbewohner mit ihren Handelsangeboten, benannte Haustiere, Karten-Items als Bild.
- Daten anderer Spieler aus Mehrspieler-Welten und Realms (Frage 2).
- Der Skin des Spielers: Er steht nach heutigem Wissen nicht in der Welt (betrifft E17).
- Funde löschen, wenn sie in einer neueren Welt fehlen: Der Import fügt nur hinzu.

## Zu entscheiden (Max)

1. ~~**Übernehmen:** Prüfliste mit Haken, alles Neue vorausgewählt (Vorschlag) – oder alles ohne Rückfrage übernehmen?~~ **Max (13.10.2026): automatisch übernehmen**, mit einem Schalter je Art (siehe „Entscheidungen“).
2. **Spielerdaten** (in W1 vorläufig nach Vorschlag)**:** Nur der eigene Spieler der Welt (`~local_player`, Vorschlag) – oder auch die anderen Spieler einer Mehrspieler-Welt? Deren Inventar und Position wären dann für alle am Board sichtbar, und welcher Account zu welchem Spieler gehört, steht nicht in der Welt. Nachtrag W1: In einer heruntergeladenen Realm-Welt steht vermutlich auch der eigene Spieler nicht als `~local_player`, sondern wie alle als `player_server_…`. Dann käme nach dem Vorschlag aus einer Realm-Welt gar keine Rüstung und kein Inventar. `welt-pruefen.mjs` zeigt „Andere Spieler: N“, H12 klärt es.
3. **Sammelobjekte** (in W1 vorläufig nach Vorschlag)**:** Gefunden, sobald die Vorlage irgendwo in der Welt liegt, auch in einer Truhe (Vorschlag) – oder nur, wenn der Spieler sie bei sich oder in der Endertruhe hat?
4. ~~**Portal ohne Gegenstück:** Nur als Hinweis in der Prüfliste (Vorschlag) – oder als eigener Ort, damit man es auf der Karte sieht?~~ **Max (13.10.2026): auch auf der Karte zeigen** → „Eigene Orte · Netherportal“.
5. ~~**Bild der Welt:** `world_icon.jpeg` mit hochladen und als Bild der Welt in Companion und Dashboard zeigen (etwa 50–150 KB je Welt) – ja oder nein?~~ **Max (13.10.2026): nein.**

## Reihenfolge und Git

1. ~~W0 Weltordner statt ZIP~~ gebaut 13.10.2026, ⏸ H11
2. ~~Fragen 1, 4 und 5 beantworten~~ Max 13.10.2026; 2 und 3 gelten nach Vorschlag
3. ~~W1 Funde lesen~~ gebaut 13.10.2026, ⏸ H12
4. W2 → Commits „Prüfliste mit Funden“, „Funde übernehmen“, „Welt-Info am Server“, PR, ⏸ H13
5. W3 → PR
6. Danach zieht der Bauplan ins Archiv (`docs/bauplaene/`).
