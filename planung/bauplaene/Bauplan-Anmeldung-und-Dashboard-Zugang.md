# Bauplan: Anmeldung und Dashboard-Zugang

> Für Claude Code · Repo `Companion-Board` · Stand 13.10.2026 · Entscheidungen von Max (Chat vom 13.10.2026)
> Grundlage: Klick-Prototyp [`companion/entwuerfe/anmeldung-prototyp.html`](../../companion/entwuerfe/anmeldung-prototyp.html) (Mock, im Browser öffnen) und das SQL-Referenzschema [`planung/schema/`](../schema/README.md) (Tabellen `benutzer`, `geraete`, `zugaenge`, `anzeige_geraete` mit ihren Sichten)
>
> Er nennt Dateien, Routen und Branches und baut auf dem Stand von `main` vom 13.10.2026 auf (Netlify + Pi, SQLite, Bauplan „Sitzung“, B3). Er setzt Strang B aus [`PLAN.md`](../PLAN.md) fort (B1/B2 gebaut, B3 gebaut).

---

## 0. So arbeitest du diesen Bauplan ab

1. Lies `UEBERGABE.md`, `planung/UEBERGABE.md`, `koordinaten-board/UEBERGABE.md` und `koordinaten-board/pi/ANLEITUNG.md`. Öffne den Prototyp im Browser und klick ihn einmal durch (Knopf „Simulation“ oben rechts).
2. Arbeite die Phasen in Kapitel 7 der Reihe nach ab. Jede Phase endet mit Tests, README-Notiz und Commit.
3. **Haltepunkte (⏸):** stoppen, Max Screenshots zeigen, erst nach seinem OK weiter.
4. Was in Kapitel 9 als **Nachfrage** (AN1–AN12) steht, baust du nicht vorweg. Steht eine Annahme (⚠) dabei, baust du die Annahme und meldest es Max.
5. Konventionen wie immer: Deutsch in Code, UI und Commits · nach jedem Commit `Commit erstellt: …` · ansagen, wann gepusht wird · **gemergt wird nur nach Rückfrage bei Max** · Datenmodell minimal.

---

## 1. Ziel

Die **Anmeldeseite wird der Einstieg** unter `/` – das, was man über die Domain `mainhubv1.com` erreicht. Heute leitet `/` auf `/dashboard/` um (Bauplan „Sitzung“, S4). Von der Anmeldeseite geht es künftig in die Companion (`/app/`) oder als Anzeige-Gerät ins Dashboard (`/dashboard/`).

```
/  Anmeldeseite
├─ Companion-App    Anzeigename + Passwort → Startbereich der Companion (/app/)
│                   nach dem Registrieren erst die Willkommenskarte
│                   danach reicht die PIN, nach über 30 Min. offline wieder nötig
└─ Dashboard-Login  Zugangs-Code → Dashboard-PIN → Layout wählen → /dashboard/
                    danach direkt „Layout wählen“, nach über 15 Min. offline Dashboard-PIN
```

---

## 2. Entscheidungen (Max, 13.10.2026)

| Nr. | Thema | Entscheidung |
|---|---|---|
| L1 | Einstieg | Die Anmeldeseite liegt unter `/` und ist die Seite, die über die Domain erreichbar ist |
| L2 | Aufbau der Seite | Große Überschrift „Companion“, darunter die Navigation **Companion-App \| Dashboard-Login**, darunter „Anmeldung“. Keine Board-Statuszeile, keine Konto-Auswahl |
| L3 | Benutzerkonto | Nutzer-ID, **echter Name**, Anzeigename, **Passwort**, PIN |
| L4 | Passwort | Nur für die **erste Anmeldung auf einem Gerät** und zum **Zurücksetzen der PIN** |
| L5 | PIN | Wird nach jeder **Offline-Phase von über 30 Minuten** verlangt. Gemeint ist die Zeit ohne Kontakt zum Server; solange das Gerät verbunden ist, läuft kein Timer. Nach einem PIN-Wechsel fragen **alle** Geräte des Kontos nach der neuen PIN |
| L6 | Registrieren | Kleiner Knopf „Registrieren“ unter den Feldern Anzeigename und Passwort |
| L7 | Zugangs-Code | 5 Zeichen, zufällig, **Groß- und Kleinschreibung zählt**. Ziffern, Groß- und Kleinbuchstaben **ohne die verwechselbaren `0 O 1 l I`** → 57 Zeichen (`CODE_ZEICHEN`) |
| L8 | Code erzeugen | In der Companion im **Dashboard-Bereich**, Knopf „Code generieren“. Jeder angemeldete Nutzer darf das |
| L9 | Gültigkeit | **Einstellbar** beim Erzeugen: zeitbasiert (Standard 20 Minuten) oder dauerhaft |
| L10 | Dashboard-PIN | **Eigene PIN je Zugang**, festgelegt beim Erzeugen des Codes. Hat nichts mit dem Benutzerkonto zu tun |
| L11 | Anzeige-Gerät | Code → Dashboard-PIN → Layout wählen. Das Gerät **merkt sich die Anmeldung**: beim nächsten Öffnen direkt „Layout wählen“ |
| L13 | Nach der Anmeldung | **Direkt in den Startbereich der Companion** (`/app/`). Keine Zwischenseite |
| L14 | Nach dem Registrieren | Zuerst eine **Willkommenskarte**, danach weiter in die Companion. Den Inhalt der Karte fügt Max später hinzu (AN11) |
| L12 | PIN am Anzeige-Gerät | Nach über **15 Minuten** ohne Kontakt (eine Konstante, siehe AN6). Während die Anzeige verbunden ist, läuft kein Timer |

---

## 3. Ausgangslage im Repo

| Baustein | Ort | Heute | Wird |
|---|---|---|---|
| Einstieg `/` | `netlify/_redirects` | leitet auf `/dashboard/` um (S4) | liefert die **Anmeldeseite** `companion/anmeldung.html`; `/anzeige` leitet weiter aufs Dashboard |
| Companion | Netlify `/app/` (`netlify/bauen.sh`), lokal vom Board unter `/` | Beitreten im Sheet „Beitreten“ mit Board-PIN aus dem QR-Code (`?pin=`, 6 Ziffern) + Name + Konto-PIN | Anmeldung über die Anmeldeseite; Konto-Token wie heute im `localStorage` |
| API | `api.mainhubv1.com` (Pi hinter Cloudflare-Tunnel), CORS in `server.js` | Bearer-Token, `FUER_COMPANION`-Pfade | neue Routen aus Kapitel 5 in die CORS-Liste |
| Beitreten | `/api/beitreten`, `identitaet.js` | Board-PIN + Name + Konto-PIN, Sperre je IP (`CF-Connecting-IP`) | Anmelden mit Anzeigename + Passwort, danach PIN (AN1 zur Board-PIN) |
| Tokens | `identitaet.js` | HMAC-signiert `{ b, g, f }`, Gerät fragt nie wieder | bleibt; zusätzlich prüft der Server bei jeder Anfrage die 30-Minuten-Regel |
| Speicher | `speicher.js` (SQLite, `daten.db`) | je Sammlung eine Tabelle `(id, version, reihenfolge, daten JSON)`, Liste `SAMMLUNGEN` | neue Sammlungen `zugaenge`, `anzeigeGeraete` in `SAMMLUNGEN`; neue Felder landen im JSON |
| Konten | `daten.js` → `benutzer` | `{ id, anzeigename, pinHash, rolle }` | + `echterName`, `passwortHash`, `pinGeaendertAm` |
| Geräte | `daten.js` → `geraete` | `{ id, freigeschaltet, typ, profilId }` | + `freigeschaltetAm`, `letzterKontakt`, `pinBestaetigtAm` |
| Sperre | `sperre.js` | gegen Durchprobieren der PINs | auch für Passwort, Zugangs-Code und Dashboard-PIN |
| Anzeige | `/dashboard/`, Anzeige-Link `?anzeige=…&schluessel=…`, Sitzung je Anzeige (`sitzung.js`) | Anzeige nur mit Link (Umbau Phase 1) | Anzeige-Geräte melden sich per Dashboard-Login an (AN3: Link ablösen oder parallel) |
| Layouts | `anzeigen[].layout` | pro Anzeige ein Layout (E5) | sind die „Anzeige-Layouts“, aus denen das Anzeige-Gerät wählt |
| Offline | `sw.js`, Spiegel in IndexedDB (B3) | Companion läuft ohne Netz aus dem Spiegel | die 30-Minuten-Regel zählt auch am Handy (Kapitel 6.2) |

## 4. Datenmodell (`daten.js` / `daten.db`)

Gespeichert wird wie heute über `daten.js` und `speicher.js` (je Sammlung JSON-Zeilen in `daten.db`). Die Feldnamen folgen dem SQL-Referenzschema (`planung/schema/`), damit eine spätere Umstellung auf eigene Tabellen 1:1 geht. `zugaenge` und `anzeigeGeraete` kommen in `SAMMLUNGEN`.

```js
benutzer: [{
  id,                  // Nutzer-ID (UUID)
  echterName,          // 1–60 Zeichen
  anzeigename,         // 1–24 Zeichen, eindeutig ohne Groß-/Kleinschreibung (toLocaleLowerCase('de'))
  passwortHash,        // scrypt wie pinHashen()
  pinHash,             // scrypt, PIN 4–8 Ziffern
  pinGeaendertAm,      // ISO-Zeit; Geräte mit älterer pinBestaetigtAm brauchen die neue PIN
  rolle: 'Besitzer',   // bleibt laut Bauplan Offline-Sync (im SQL-Schema noch nicht)
  am,
}],
geraete: [{            // Geräte der Benutzer (Handys)
  id, benutzerId, typ, profilId,          // wie B2
  freigeschaltetAm,    // erste Anmeldung mit Passwort
  letzterKontakt,      // letzte Anfrage bzw. letzter Herzschlag über /ws
  pinBestaetigtAm,     // letzte richtige PIN (oder Passwort)
}],
zugaenge: [{           // Dashboard-Zugänge, erzeugt in der Companion
  id,
  code,                // 5 Zeichen, im Klartext (wird in der Companion angezeigt), eindeutig
  pinHash,             // Dashboard-PIN, scrypt
  erstelltVon,         // Benutzer-ID
  erstelltAm,
  gueltigBis,          // ISO-Zeit oder null = dauerhaft
}],
anzeigeGeraete: [{     // per Dashboard-Login angemeldete Anzeigen (TV, Tablet …)
  id,
  zugangId,            // Zugang, mit dem es angemeldet wurde
  anzeigeId,           // gewähltes Layout (= Eintrag in anzeigen) oder null
  letzterKontakt,
}],
```

**Regeln** (in `companion/regeln.js`, damit Handy und Server dasselbe prüfen):

- `passwortPruefen`: mindestens 8 Zeichen
- `KONTO_PIN` bleibt `^\d{4,8}$` und gilt auch für die Dashboard-PIN
- `CODE_ZEICHEN = "23456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz"` (57 Zeichen, ohne `0 O 1 l I`)
- `ZUGANGS_CODE = /^[0-9A-Za-z]{5}$/` – das Eingabefeld bleibt bewusst großzügig; ein vertipptes `0` oder `l` ist einfach ein falscher Code
- Erzeugen mit `crypto.randomInt(CODE_ZEICHEN.length)` (gleichverteilt, so wie `neuerCode()` im Prototyp ohne Modulo-Verzerrung)
- `GUELTIGKEITEN = [20, 5, 60, 1440, null]` (Minuten, `null` = dauerhaft; Standard ist der erste Eintrag)
- `OFFLINE_MINUTEN = { konto: 30, anzeige: 15 }`

**Migration beim Laden** (`daten.js`, wie bei B1): fehlende Felder ergänzen (`pinGeaendertAm = am`, `letzterKontakt = jetzt`, `zugaenge: []`, `anzeigeGeraete: []`). Konten ohne `passwortHash` und `echterName` siehe AN2.

---

## 5. Server

### 5.1 Konten (`identitaet.js` erweitern)

| Methode | Route | Inhalt |
|---|---|---|
| POST | `/api/anmelden` | `{ anzeigename, passwort }` → `{ token }`, legt ein Gerät an. Fehlertext immer „Anzeigename oder Passwort stimmt nicht“ |
| POST | `/api/registrieren` | `{ echterName, anzeigename, passwort, pin }` → `{ token }` |
| GET | `/api/ich` | `{ benutzer, pinNoetig, grund }` mit `grund` = `offline:<Minuten>` oder `pinwechsel` |
| POST | `/api/pin` | `{ pin }` → setzt `pinBestaetigtAm` und `letzterKontakt` |
| POST | `/api/pin/zuruecksetzen` | `{ passwort, neuePin }` → neue PIN, `pinGeaendertAm = jetzt`, **dieses** Gerät gilt sofort als bestätigt |
| POST | `/api/abmelden` | Gerät löschen |

Alle neuen Pfade kommen in die CORS-Liste in `server.js`, weil Anmeldeseite (Netlify) und API (`api.mainhubv1.com`) verschiedene Ursprünge haben.

**PIN-Pflicht (Kern der Regel L5):** Ein `onRequest`-Hook prüft bei jeder Anfrage mit Token:

1. Zuerst die Regel aus `geraete_status`: `jetzt − letzterKontakt > 30 Min.` **oder** `pinBestaetigtAm < benutzer.pinGeaendertAm` → Antwort **423** „PIN nötig“ (außer für `/api/ich`, `/api/pin`, `/api/pin/zuruecksetzen`, `/api/abmelden`).
2. **Erst danach** `letzterKontakt` aktualisieren. Andersherum wäre ein Gerät nie „offline“.
3. `letzterKontakt` nur im Speicher hochzählen und höchstens einmal pro Minute speichern (`speicher.js` schreibt nur geänderte Zeilen), damit nicht jede Anfrage eine neue Version der Zeile und einen Eintrag in `aenderungen` erzeugt.
4. Über `/ws` hält ein Herzschlag (alle 60 s) `letzterKontakt` frisch. **Solange die Companion verbunden ist, läuft kein Timer.**

### 5.2 Dashboard-Zugänge (neues Modul `dashboard-zugang.js`)

| Methode | Route | Wer | Inhalt |
|---|---|---|---|
| POST | `/api/dashboard/zugaenge` | Konto | `{ minuten \| null, pin }` → `{ id, code, gueltigBis }`. Code eindeutig unter allen Zugängen |
| GET | `/api/dashboard/zugaenge` | Konto | Liste mit Code, Gültigkeit, Ersteller und Zahl der angemeldeten Anzeigen |
| DELETE | `/api/dashboard/zugaenge/:id` | Konto | Widerrufen. Meldet alle damit angemeldeten Anzeigen ab (⚠ AN5) |
| POST | `/api/dashboard/code` | offen | `{ code }` → `{ ticket }` (signiert, 5 Minuten gültig). **410**, wenn der Code abgelaufen ist |
| POST | `/api/dashboard/freischalten` | Ticket | `{ ticket, pin }` → `{ anzeigeToken }`, legt ein Anzeige-Gerät an |
| GET | `/api/dashboard/sitzung` | Anzeige-Token | `{ pinNoetig, offline }` oder `{ anzeigeId, layouts: [{ id, name, inhalt, widgets }] }` |
| POST | `/api/dashboard/pin` | Anzeige-Token | `{ pin }` → setzt `letzterKontakt` |
| PUT | `/api/dashboard/layout` | Anzeige-Token | `{ anzeigeId }` → gewähltes Layout speichern |
| POST | `/api/dashboard/abmelden` | Anzeige-Token | Anzeige-Gerät löschen |

- **Ablauf eines Codes** (⚠ AN5): Ein abgelaufener Code schaltet **keine neuen** Geräte frei. Bereits angemeldete Anzeigen laufen weiter, ihre Anmeldung hängt an der Dashboard-PIN.
- **15-Minuten-Regel** wie 5.1, nur mit `OFFLINE_MINUTEN.anzeige` und ohne PIN-Wechsel. Herzschlag über `/ws` mit Rolle `anzeige`.
- Die Anzeige-Verbindung (`/ws` Rolle `anzeige`, `/api/anzeige/*`) ist erlaubt mit gültigem **Anzeige-Token** – zusätzlich zu `localhost` und `ANZEIGE_OFFEN=1` wie heute.
- **Sperre** (`sperre.js`): Code je IP, Dashboard-PIN je Zugang bzw. Anzeige-Gerät, Passwort je Anzeigename. Wie heute: 5 Fehlversuche, dann warten.

---

## 6. Oberfläche

### 6.1 Anmeldeseite (`companion/anmeldung.html`, neu)

- Aus dem Prototyp übernehmen: Aufbau, Texte, Styles (Oberwelt-Theme wie die Companion). **Mock und Simulation entfernen**, stattdessen die API aus Kapitel 5.
- Eine Datei, Vanilla JS, kein Build, wie die Companion. **Netlify:** `netlify/bauen.sh` kopiert sie als `index.html` in die Wurzel, `konfig.js` mit der API-Adresse daneben; in `netlify/_redirects` fällt die Zeile `/ → /dashboard/` weg. **Lokal:** das Board liefert sie unter `/` aus, die Companion unter `/app` (ohne Cache, `OHNE_CACHE`).
- Ansichten (wie im Prototyp): Anmeldung · Registrierung · Willkommenskarte · PIN-Sperre (Ziffernblock, 4–8 Ziffern, OK-Taste) · PIN zurücksetzen · Dashboard-Login (nur Feld „Zugangs-Code“) · Dashboard-PIN · Layout wählen.
- Die Platzhalter „Companion · Startbereich“ und die Gerätedaten aus dem Prototyp werden **nicht** übernommen; sie stehen dort nur stellvertretend für `/app/`.
- Der Konto-Token liegt im `localStorage` wie heute; der Anzeige-Token getrennt davon (eigener Schlüssel).
- Nach erfolgreicher Anmeldung bzw. richtiger PIN → **direkt `/app/`** (Startbereich der Companion).
- Nach dem Registrieren → **Willkommenskarte** (eigene Ansicht der Anmeldeseite, Knopf „Weiter zur Companion“) → `/app/`. Bis Max den Inhalt liefert, steht dort ein Platzhalter.
- Nach „Anzeige starten“ → `/dashboard/`.
- Ein Gerät mit gültigem Token und ohne PIN-Pflicht springt direkt weiter: Konto → `/app/`, Anzeige → „Layout wählen“.

### 6.2 Companion (`companion-prototyp.html`)

- Läuft weiter unter **`/app/`** (Netlify) bzw. lokal unter `/app`. Alte QR-Codes mit `?pin=…` führen auf die Anmeldeseite (AN1).
- Beim Laden `/api/ich`: kein Token → `/`. `pinNoetig` → `/` (die Anmeldeseite zeigt die PIN-Sperre).
- Antwortet eine Anfrage mit **423**, gilt dasselbe. `anmeldungAbgelaufen()` gibt es schon, sie bekommt diesen Fall dazu. Das Sheet „Beitreten“ entfällt.
- **Offline (B3):** Ohne Netz zählt die Companion die 30 Minuten selbst (Zeitpunkt des letzten Server-Kontakts im `localStorage`) und sperrt sich mit der PIN-Abfrage. Die PIN prüft sie dann gegen einen lokalen Hash, den sie bei der letzten Anmeldung abgelegt hat (⚠ AN12).
- **Dashboard-Bereich** (⚠ AN7: im Board-Sheet unter „Anzeigen“): Formular „Anzeige-Gerät anmelden“ mit „Code gültig“ (Auswahl aus `GUELTIGKEITEN`), Dashboard-PIN, PIN wiederholen und „Code generieren“. Der neue Code steht groß darüber, mit Gültigkeit. Darunter „Erzeugte Codes“ mit **Widerrufen per zweitem Tippen** („Wirklich?“).
- Der Abschnitt „Anzeige-Link“ entfällt nach AN3.

### 6.3 Dashboard (`companion/widgets`)

- `/dashboard/` liest den Anzeige-Token statt `?anzeige=…&schluessel=…` (`features/karten/lib/zugang.ts`). Fehlt er oder ist er ungültig → `/` mit Reiter Dashboard-Login.
- Die Anzeige zeigt das Layout aus `anzeigeId`; ihre Sitzung (`sitzung.js`) hängt weiter an der Anzeige, nicht am Gerät.

---

## 7. Phasen

Branch: **`board/anmeldung`** für alles. Nach jeder Phase pushen.

### Phase L1 · Datenmodell und Regeln

- Kapitel 4: neue Felder und Sammlungen in `daten.js`, Migration beim Laden, Regeln in `regeln.js`.
- Tests (`node --test`): Migration vorhandener Konten und Geräte, Eindeutigkeit des Anzeigenamens (`Max` = `MAX`), Regeln für Passwort, PIN und Code.
- Commit: „Datenmodell: Passwort, Geräte-Kontakt, Dashboard-Zugänge“

### Phase L2 · Konten am Server

- Kapitel 5.1 mit PIN-Pflicht-Hook und Herzschlag.
- Tests:
  - Anmelden mit falschem Passwort → 401 mit derselben Meldung wie bei unbekanntem Namen
  - Gerät 29 Min. ohne Kontakt → Anfrage geht durch; 31 Min. → 423
  - PIN zurücksetzen → das eigene Gerät läuft weiter, ein zweites Gerät bekommt 423
  - Prüfung vor Aktualisierung: nach 31 Min. bleibt es bei 423, bis die PIN kommt
  - 5 falsche PINs → 429
- Commit: „Anmeldung mit Passwort, PIN nach 30 Minuten offline“

### Phase L3 · Anmeldeseite unter `/`

- Kapitel 6.1 (nur Reiter Companion-App) und 6.2 (Weiterleitungen, 423, Offline-Sperre), `netlify/bauen.sh` und `_redirects`; `companion/tests/netlify.test.mjs` prüft den Build.
- Playwright: Anmelden → landet auf `/app/`, Registrieren → Willkommenskarte → `/app/`, PIN-Sperre nach simulierter Offline-Zeit (Zeit am Server per Test-Schalter vorstellen), PIN zurücksetzen. Screenshots nach `companion/tests/bilder/`.
- Commit: „Anmeldeseite als Einstieg unter /“
- ⏸ **Haltepunkt:** Max die Screenshots zeigen (Anmeldung, Registrierung, PIN-Sperre, PIN zurücksetzen) und am Handy anmelden lassen.

### Phase L4 · Dashboard-Zugänge am Server

- Kapitel 5.2.
- Tests:
  - Code erzeugen → Format, eindeutig, enthält nie `0 O 1 l I` (1 000 Codes erzeugen und prüfen)
  - abgelaufener Code → 410
  - dauerhafter Code geht nach Tagen noch
  - falsche Dashboard-PIN → 401, nach 5 Versuchen 429
  - Anzeige 14 Min. offline → läuft; 16 Min. → PIN nötig
  - Widerrufen → Anzeige-Token ungültig, `/ws` schließt mit 4003
- Commit: „Dashboard-Zugänge mit Code und Dashboard-PIN“

### Phase L5 · Dashboard-Login und Code generieren

- Kapitel 6.1 (Reiter Dashboard-Login), 6.2 (Dashboard-Bereich der Companion), 6.3.
- Playwright: Code in der Companion erzeugen → auf zweitem Browser-Kontext Code + Dashboard-PIN → Layout wählen → `/dashboard/` zeigt das Layout → neu laden → direkt „Layout wählen“.
- Commits: „Companion: Code für Anzeige-Geräte generieren“, „Dashboard-Login auf der Anmeldeseite“
- ⏸ **Haltepunkt:** Max am TV bzw. Tablet eine Anzeige mit Code anmelden lassen (nach Pi-Update).

### Phase L6 · Aufräumen (nach AN1 und AN3)

- Board-PIN im QR-Code und Anzeige-Link mit Schlüssel abbauen oder als Übergang behalten, je nach Antwort.
- README, `UEBERGABE.md`, `planung/UEBERGABE.md` und `koordinaten-board/pi/ANLEITUNG.md` nachziehen: Einstieg `/`, Ablauf der Anmeldung, Pi-Update.
- Commit: „Alte Zugänge abgebaut: Board-PIN, Anzeige-Link“

---

## 8. Sicherheit

- Passwort, PIN und Dashboard-PIN nur als scrypt-Hash. Der Zugangs-Code liegt im Klartext, weil die Companion ihn anzeigt. Er allein reicht nicht, die Dashboard-PIN gehört dazu.
- Seiten und API laufen über HTTPS (Netlify, Cloudflare-Tunnel). Die Ratenbegrenzung bei Cloudflare (Warteliste, Erinnerungen) sollte auch `/api/anmelden` und `/api/dashboard/code` abdecken.
- Fehlertexte verraten nicht, ob ein Anzeigename existiert.
- 5 Zeichen aus 57 ergeben rund 600 Millionen Codes. Zusammen mit der Sperre und der Dashboard-PIN reicht das.

---

## 9. Nachfragen

| Nr. | Frage | Annahme bis zur Antwort | blockiert |
|---|---|---|---|
| AN1 | Bleibt die **Board-PIN im QR-Code**, wenn die Anmeldeseite über eine Domain erreichbar ist? Sie steht in der URL und schützt dann wenig. | bleibt vorerst bestehen, wird aber nicht mehr gebraucht | L6 |
| AN2 | **Bestehende Konten** haben weder Passwort noch echten Namen. Beim nächsten Anmelden mit der alten PIN beides nachtragen lassen („Konto vervollständigen“), oder Konten neu anlegen? | – | L1 |
| AN3 | Wird der **Anzeige-Link mit Schlüssel** durch den Dashboard-Login ersetzt oder bleibt er parallel? | parallel bis L6 | L6 |
| AN4 | Zeigen zwei Geräte **dasselbe Layout** bei unterschiedlicher Bildschirmgröße, passen die gemeldeten `reihen` nicht für beide. Layout pro Gerät kopieren oder mit der kleineren Reihenzahl arbeiten? | – | L5 |
| AN5 | ⚠ Laufen bereits angemeldete Anzeigen **nach Ablauf des Codes** weiter? Meldet **Widerrufen** alle Anzeigen des Codes ab? | ja und ja (so im Prototyp) | – |
| AN6 | 15 oder 30 Minuten für Anzeige-Geräte? | 15 (`OFFLINE_MINUTEN.anzeige`) | – |
| AN7 | ⚠ Wo genau liegt der **Dashboard-Bereich** in der Companion: im Board-Sheet unter „Anzeigen“ oder als eigener Eintrag in der Sidebar? | Board-Sheet unter „Anzeigen“ | – |
| ~~AN8~~ | **Domain:** erledigt durch den Umbau – Seiten unter `mainhubv1.com` (Netlify), API unter `api.mainhubv1.com` (Pi, Tunnel), beides mit HTTPS. | – | – |
| ~~AN9~~ | **Entschieden (Max, 13.10.2026):** Die verwechselbaren Zeichen `0 O 1 l I` werden beim Erzeugen weggelassen, siehe L7. | – | – |
| AN10 | Wer sieht den **echten Namen** – nur der Nutzer selbst oder alle Konten des Boards? | nur der Nutzer selbst | L3 |
| AN11 | **Inhalt der Willkommenskarte** nach dem Registrieren | Platzhalter mit „Willkommen, <Anzeigename>“ und „Weiter zur Companion“ | – |
| AN12 | ⚠ **PIN offline prüfen:** Darf die Companion einen Hash der Konto-PIN lokal ablegen, damit die 30-Minuten-Sperre auch ohne Netz greift? Ohne ihn kann sie offline nur sperren, aber nicht entsperren. | lokaler scrypt-Hash im `localStorage` | L3 |
