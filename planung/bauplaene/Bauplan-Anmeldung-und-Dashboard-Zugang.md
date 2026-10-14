# Bauplan: Anmeldung und Dashboard-Zugang

> Für Claude Code · Repo `Companion-Board` · Stand 14.10.2026 · Entscheidungen von Max (Chat vom 13.10.2026), Nachfragen AN1–AN3, AN5–AN7 und AN10–AN13 beantwortet (L15–L19, Kapitel 9) · **L1–L3 gebaut** (14.10.2026, Kapitel 10), ⏸ H15
> Grundlage: Klick-Prototyp [`companion/entwuerfe/anmeldung-prototyp.html`](../../companion/entwuerfe/anmeldung-prototyp.html) (Mock, im Browser öffnen) und das SQL-Referenzschema [`planung/schema/`](../schema/README.md) (Tabellen `benutzer`, `geraete`, `zugaenge`, `anzeige_geraete` mit ihren Sichten)
>
> Er nennt Dateien, Routen und Branches und baut auf dem Stand von `main` vom 13.10.2026 auf (Netlify + Pi, SQLite, Bauplan „Sitzung“, B3). Er setzt Strang B aus [`PLAN.md`](../PLAN.md) fort (B1/B2 gebaut, B3 gebaut).

---

## 0. So arbeitest du diesen Bauplan ab

1. Lies `UEBERGABE.md`, `planung/UEBERGABE.md`, `koordinaten-board/UEBERGABE.md` und `koordinaten-board/pi/ANLEITUNG.md`. Öffne den Prototyp im Browser und klick ihn einmal durch (Knopf „Simulation“ oben rechts).
2. Arbeite die Phasen in Kapitel 7 der Reihe nach ab. Jede Phase endet mit Tests, README-Notiz und Commit.
3. **Haltepunkte (⏸):** Max die Screenshots zeigen und auf die Warteliste setzen. Seit 14.10.2026 mergt Claude ohne Rückfrage („mergen ab jetzt ohne Rückfragen“); weiter geht es mit dem, was nicht vom Haltepunkt abhängt.
4. Was in Kapitel 9 als **offene Nachfrage** (AN4, AN14) steht, baust du nicht vorweg. Steht eine Annahme (⚠) dabei, baust du die Annahme und meldest es Max.
5. Konventionen wie immer: Deutsch in Code, UI und Commits · nach jedem Commit `Commit erstellt: …` · ansagen, wann gepusht wird · **gemergt wird ohne Rückfrage, sobald die CI grün ist** (Max, 14.10.2026) · Datenmodell minimal.

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
| L12 | PIN am Anzeige-Gerät | Nach über **15 Minuten** ohne Kontakt (eine Konstante, AN6). Während die Anzeige verbunden ist, läuft kein Timer |
| L15 | Board-PIN | **Fällt weg** (AN1). Angemeldet wird nur noch mit Anzeigename + Passwort, danach PIN |
| L16 | Bestehende Konten | Werden **neu angelegt** (AN2). Die bisherigen Konten (ohne Passwort und echten Namen) entfallen bei der Migration samt ihren Geräten |
| L17 | Anzeige-Link | Wird durch **„Code generieren“** ersetzt (AN3), kein Parallelbetrieb |
| L18 | Echter Name | Sichtbar für **alle Konten** des Boards (AN10) |
| L19 | Freigabe neuer Konten | Ein neues Konto gilt erst, **wenn ein bestehendes Konto es freigibt** (AN13). Bis dahin kommt es nicht in die Companion. Einzelheiten ⚠ AN14 |

---

## 3. Ausgangslage im Repo

| Baustein | Ort | Heute | Wird |
|---|---|---|---|
| Einstieg `/` | `netlify/_redirects` | leitet auf `/dashboard/` um (S4) | liefert die **Anmeldeseite** `companion/anmeldung.html`; `/anzeige` leitet weiter aufs Dashboard |
| Companion | Netlify `/app/` (`netlify/bauen.sh`), lokal vom Board unter `/` | Beitreten im Sheet „Beitreten“ mit Board-PIN aus dem QR-Code (`?pin=`, 6 Ziffern) + Name + Konto-PIN | Anmeldung über die Anmeldeseite; Konto-Token wie heute im `localStorage` |
| API | `api.mainhubv1.com` (Pi hinter Cloudflare-Tunnel), CORS in `server.js` | Bearer-Token, `FUER_COMPANION`-Pfade | neue Routen aus Kapitel 5 in die CORS-Liste |
| Beitreten | `/api/beitreten`, `identitaet.js` | Board-PIN + Name + Konto-PIN, Sperre je IP (`CF-Connecting-IP`) | Anmelden mit Anzeigename + Passwort, danach PIN; die Board-PIN fällt weg (L15) |
| Tokens | `identitaet.js` | HMAC-signiert `{ b, g, f }`, Gerät fragt nie wieder | bleibt; zusätzlich prüft der Server bei jeder Anfrage die 30-Minuten-Regel |
| Speicher | `speicher.js` (SQLite, `daten.db`) | je Sammlung eine Tabelle `(id, version, reihenfolge, daten JSON)`, Liste `SAMMLUNGEN` | neue Sammlungen `zugaenge`, `anzeigeGeraete` in `SAMMLUNGEN`; neue Felder landen im JSON |
| Konten | `daten.js` → `benutzer` | `{ id, anzeigename, pinHash, rolle }` | + `echterName`, `passwortHash`, `pinGeaendertAm` |
| Geräte | `daten.js` → `geraete` | `{ id, freigeschaltet, typ, profilId }` | + `freigeschaltetAm`, `letzterKontakt`, `pinBestaetigtAm` |
| Sperre | `sperre.js` | gegen Durchprobieren der PINs | auch für Passwort, Zugangs-Code und Dashboard-PIN |
| Anzeige | `/dashboard/`, Anzeige-Link `?anzeige=…&schluessel=…`, Sitzung je Anzeige (`sitzung.js`) | Anzeige nur mit Link (Umbau Phase 1) | Anzeige-Geräte melden sich per Dashboard-Login an; der Link fällt weg (L17) |
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
  freigegebenAm,       // ISO-Zeit oder null = wartet auf Freigabe (L19)
  freigegebenVon,      // Benutzer-ID des freigebenden Kontos, null beim ersten Konto (⚠ AN14)
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

**Migration beim Laden** (`daten.js`, wie bei B1): fehlende Felder ergänzen (`pinGeaendertAm = am`, `letzterKontakt = jetzt`, `zugaenge: []`, `anzeigeGeraete: []`). Konten ohne `passwortHash` – das sind alle bisherigen – werden **entfernt**, ebenso ihre Geräte (L16); alle legen sich neu an. Was sie angelegt haben, bleibt stehen, der Name in `von` auch (wie im Referenzschema).

---

## 5. Server

### 5.1 Konten (`identitaet.js` erweitern)

| Methode | Route | Inhalt |
|---|---|---|
| POST | `/api/anmelden` | `{ anzeigename, passwort }` → `{ token }`, legt ein Gerät an. Fehlertext immer „Anzeigename oder Passwort stimmt nicht“ |
| POST | `/api/registrieren` | `{ echterName, anzeigename, passwort, pin }` → `{ token }`. Das Konto wartet auf Freigabe (L19); ⚠ das **erste** Konto gilt sofort als freigegeben |
| GET | `/api/ich` | `{ benutzer, pinNoetig, grund, freigegeben }` mit `grund` = `offline:<Minuten>` oder `pinwechsel` |
| GET | `/api/konten` | Nur freigegebene Konten: Alle Konten mit Anzeigename, **echtem Namen** (L18) und `freigegebenAm` |
| POST | `/api/konten/:id/freigeben` | Nur freigegebene Konten: Wartendes Konto freigeben → `freigegebenAm`, `freigegebenVon` |
| DELETE | `/api/konten/:id` | Nur freigegebene Konten: Wartendes Konto ablehnen = löschen (nur solange es wartet) |
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
| DELETE | `/api/dashboard/zugaenge/:id` | Konto | Widerrufen. Meldet alle damit angemeldeten Anzeigen ab (AN5) |
| POST | `/api/dashboard/code` | offen | `{ code }` → `{ ticket }` (signiert, 5 Minuten gültig). **410**, wenn der Code abgelaufen ist |
| POST | `/api/dashboard/freischalten` | Ticket | `{ ticket, pin }` → `{ anzeigeToken }`, legt ein Anzeige-Gerät an |
| GET | `/api/dashboard/sitzung` | Anzeige-Token | `{ pinNoetig, offline }` oder `{ anzeigeId, layouts: [{ id, name, inhalt, widgets }] }` |
| POST | `/api/dashboard/pin` | Anzeige-Token | `{ pin }` → setzt `letzterKontakt` |
| PUT | `/api/dashboard/layout` | Anzeige-Token | `{ anzeigeId }` → gewähltes Layout speichern |
| POST | `/api/dashboard/abmelden` | Anzeige-Token | Anzeige-Gerät löschen |

- **Ablauf eines Codes** (AN5): Ein abgelaufener Code schaltet **keine neuen** Geräte frei. Bereits angemeldete Anzeigen laufen weiter, ihre Anmeldung hängt an der Dashboard-PIN.
- **15-Minuten-Regel** wie 5.1, nur mit `OFFLINE_MINUTEN.anzeige` und ohne PIN-Wechsel. Herzschlag über `/ws` mit Rolle `anzeige`.
- Die Anzeige-Verbindung (`/ws` Rolle `anzeige`, `/api/anzeige/*`) ist erlaubt mit gültigem **Anzeige-Token** – zusätzlich zu `localhost` und `ANZEIGE_OFFEN=1` wie heute.
- **Sperre** (`sperre.js`): Code je IP, Dashboard-PIN je Zugang bzw. Anzeige-Gerät, Passwort je Anzeigename. Wie heute: 5 Fehlversuche, dann warten.

---

## 6. Oberfläche

### 6.1 Anmeldeseite (`companion/anmeldung.html`, neu)

- Aus dem Prototyp übernehmen: Aufbau, Texte, Styles (Oberwelt-Theme wie die Companion). **Mock und Simulation entfernen**, stattdessen die API aus Kapitel 5.
- Eine Datei, Vanilla JS, kein Build, wie die Companion. **Netlify:** `netlify/bauen.sh` kopiert sie als `index.html` in die Wurzel, `konfig.js` mit der API-Adresse daneben; in `netlify/_redirects` fällt die Zeile `/ → /dashboard/` weg. **Lokal:** das Board liefert sie unter `/` aus, die Companion unter `/app` (ohne Cache, `OHNE_CACHE`).
- Ansichten (wie im Prototyp): Anmeldung · Registrierung · Wartet auf Freigabe · Willkommenskarte · PIN-Sperre (Ziffernblock, 4–8 Ziffern, OK-Taste) · PIN zurücksetzen · Dashboard-Login (nur Feld „Zugangs-Code“) · Dashboard-PIN · Layout wählen.
- Die Platzhalter „Companion · Startbereich“ und die Gerätedaten aus dem Prototyp werden **nicht** übernommen; sie stehen dort nur stellvertretend für `/app/`.
- Der Konto-Token liegt im `localStorage` wie heute; der Anzeige-Token getrennt davon (eigener Schlüssel).
- Nach erfolgreicher Anmeldung bzw. richtiger PIN → **direkt `/app/`** (Startbereich der Companion).
- Nach dem Registrieren → ⚠ Ansicht **„Wartet auf Freigabe“** (Anzeigename, Knopf „Erneut prüfen“, „Abmelden“). Sobald das Konto freigegeben ist → **Willkommenskarte** (eigene Ansicht der Anmeldeseite, Knopf „Weiter zur Companion“) → `/app/`. Bis Max den Inhalt liefert, steht dort ein Platzhalter.
- Nach „Anzeige starten“ → `/dashboard/`.
- Ein Gerät mit gültigem Token und ohne PIN-Pflicht springt direkt weiter: Konto → `/app/`, Anzeige → „Layout wählen“.

### 6.2 Companion (`companion-prototyp.html`)

- Läuft weiter unter **`/app/`** (Netlify) bzw. lokal unter `/app`. Alte QR-Codes mit `?pin=…` führen auf die Anmeldeseite (L15).
- Beim Laden `/api/ich`: kein Token → `/`. `pinNoetig` → `/` (die Anmeldeseite zeigt die PIN-Sperre).
- Antwortet eine Anfrage mit **423**, gilt dasselbe. `anmeldungAbgelaufen()` gibt es schon, sie bekommt diesen Fall dazu. Das Sheet „Beitreten“ entfällt.
- **Offline (B3):** Ohne Netz zählt die Companion die 30 Minuten selbst (Zeitpunkt des letzten Server-Kontakts im `localStorage`) und sperrt sich mit der PIN-Abfrage. Die PIN prüft sie dann gegen einen lokalen Hash, den sie bei der letzten Anmeldung abgelegt hat (scrypt-Hash im `localStorage`, AN12).
- **Dashboard-Bereich** im Board-Sheet unter „Anzeigen“ (AN7): Formular „Anzeige-Gerät anmelden“ mit „Code gültig“ (Auswahl aus `GUELTIGKEITEN`), Dashboard-PIN, PIN wiederholen und „Code generieren“. Der neue Code steht groß darüber, mit Gültigkeit. Darunter „Erzeugte Codes“ mit **Widerrufen per zweitem Tippen** („Wirklich?“).
- Der Abschnitt „Anzeige-Link“ entfällt; „Code generieren“ ersetzt ihn (L17).

### 6.3 Dashboard (`companion/widgets`)

- `/dashboard/` liest den Anzeige-Token statt `?anzeige=…&schluessel=…` (`features/karten/lib/zugang.ts`). Fehlt er oder ist er ungültig → `/` mit Reiter Dashboard-Login.
- Die Anzeige zeigt das Layout aus `anzeigeId`; ihre Sitzung (`sitzung.js`) hängt weiter an der Anzeige, nicht am Gerät.

---

## 7. Phasen

Branch: **`board/anmeldung`** für alles. Nach jeder Phase pushen.

### Phase L1 · Datenmodell und Regeln

- Kapitel 4: neue Felder und Sammlungen in `daten.js`, Migration beim Laden, Regeln in `regeln.js`.
- Tests (`node --test`): Migration (alte Konten ohne Passwort und ihre Geräte fallen weg, Einträge bleiben), Eindeutigkeit des Anzeigenamens (`Max` = `MAX`), Regeln für Passwort, PIN und Code.
- Commit: „Datenmodell: Passwort, Geräte-Kontakt, Dashboard-Zugänge“

### Phase L2 · Konten am Server

- Kapitel 5.1 mit PIN-Pflicht-Hook und Herzschlag.
- Tests:
  - Anmelden mit falschem Passwort → 401 mit derselben Meldung wie bei unbekanntem Namen
  - Gerät 29 Min. ohne Kontakt → Anfrage geht durch; 31 Min. → 423
  - PIN zurücksetzen → das eigene Gerät läuft weiter, ein zweites Gerät bekommt 423
  - Prüfung vor Aktualisierung: nach 31 Min. bleibt es bei 423, bis die PIN kommt
  - 5 falsche PINs → 429
  - neues Konto → 403 „wartet auf Freigabe“ bei allen Pfaden außer `/api/ich` und `/api/abmelden`; nach Freigabe geht es durch; das erste Konto ist sofort frei; ablehnen löscht nur wartende Konten
- Commit: „Anmeldung mit Passwort, PIN nach 30 Minuten offline“

### Phase L3 · Anmeldeseite unter `/`

- Kapitel 6.1 (nur Reiter Companion-App) und 6.2 (Weiterleitungen, 423, Offline-Sperre), `netlify/bauen.sh` und `_redirects`; `companion/tests/netlify.test.mjs` prüft den Build.
- Playwright: Anmelden → landet auf `/app/`, Registrieren → „Wartet auf Freigabe“ → zweites Konto gibt frei → Willkommenskarte → `/app/`, PIN-Sperre nach simulierter Offline-Zeit (Zeit am Server per Test-Schalter vorstellen), PIN zurücksetzen. Screenshots nach `companion/tests/bilder/`.
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

### Phase L6 · Aufräumen (L15, L17)

- Board-PIN abbauen (QR-Code mit `?pin=`, `/api/beitreten`, Sheet „Beitreten“) und den Anzeige-Link mit Schlüssel (`?anzeige=…&schluessel=…`, Abschnitt „Anzeige-Link“).
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
| ~~AN1~~ | **Entschieden (Max, 13.10.2026): Die Board-PIN fällt weg** (L15), Abbau in L6. | – | – |
| ~~AN2~~ | **Entschieden (Max, 13.10.2026): Konten werden neu angelegt** (L16). Die Migration entfernt die alten Konten samt Geräten. | – | – |
| ~~AN3~~ | **Entschieden (Max, 13.10.2026): Der Anzeige-Link wird durch „Code generieren“ ersetzt** (L17), Abbau in L6. | – | – |
| ~~AN4~~ | **Entschieden (Max, 14.10.2026): „Layout und Rasteranzahl/-größe pro Gerät“.** Gebaut: Jedes Anzeige-Gerät hat seine eigene Anzeige (Layout, Reihen, Vollbild, Sitzung). „Layout wählen“ übernimmt eine freie Anzeige; zeigt schon ein anderes Gerät sie, bekommt dieses eine Kopie („Board 2“), die man in der Companion eigens anordnet. Die Reihen misst jedes Gerät selbst, die 32 Spalten bleiben. | – | – |
| ~~AN5~~ | **Bestätigt (Max, 13.10.2026): ja und ja.** Angemeldete Anzeigen laufen nach Ablauf des Codes weiter; Widerrufen meldet alle Anzeigen des Codes ab. | – | – |
| ~~AN6~~ | **Bestätigt (Max, 13.10.2026): 15 Minuten** (`OFFLINE_MINUTEN.anzeige`). | – | – |
| ~~AN7~~ | **Bestätigt (Max, 13.10.2026): im Board-Sheet** unter „Anzeigen“. | – | – |
| ~~AN8~~ | **Domain:** erledigt durch den Umbau – Seiten unter `mainhubv1.com` (Netlify), API unter `api.mainhubv1.com` (Pi, Tunnel), beides mit HTTPS. | – | – |
| ~~AN9~~ | **Entschieden (Max, 13.10.2026):** Die verwechselbaren Zeichen `0 O 1 l I` werden beim Erzeugen weggelassen, siehe L7. | – | – |
| ~~AN10~~ | **Entschieden (Max, 13.10.2026): alle Konten des Boards** sehen den echten Namen (L18). | – | – |
| ~~AN11~~ | **Bestätigt (Max, 13.10.2026): Platzhalter** mit „Willkommen, <Anzeigename>“ und „Weiter zur Companion“, bis Max den Inhalt liefert. | – | – |
| ~~AN12~~ | **Bestätigt (Max, 13.10.2026): ja**, lokaler scrypt-Hash der Konto-PIN im `localStorage`. | – | – |
| ~~AN13~~ | **Entschieden (Max, 14.10.2026): Neue Konten gelten erst, wenn ein bestehendes Konto sie freigibt** (L19). | – | – |
| AN14 | ⚠ **Freigabe im Einzelnen:** Das erste Konto gilt sofort als freigegeben (nach der Migration gibt es keins, das freigeben könnte). Jedes freigegebene Konto darf freigeben und ablehnen; ablehnen löscht das wartende Konto. Freigegeben wird im **Board-Sheet unter „Konten“**. Ein wartendes Konto sieht nach der Anmeldung nur „Wartet auf Freigabe“. | so wie links | – |

---

## 10. Stand der Umsetzung (14.10.2026)

**L1–L5 gebaut**, auf dem Branch der Cloud-Sitzung (`claude/festive-euler-a82up2`) statt `board/anmeldung`, ein PR je Schritt (L1–L3 zusammen, L4 und L5 einzeln). ⏸ **H15** (Max meldet sich nach dem Pi-Update am Handy an; Screenshots `a1`–`a8`, `n6-offline-pin.png`), ⏸ **H16** (Max meldet TV bzw. Tablet mit einem Code an; Screenshots `d1`–`d7`).

| Phase | Gebaut |
|---|---|
| L1 | `daten.js`: Felder aus Kapitel 4, `zugaenge` und `anzeigeGeraete` in `SAMMLUNGEN`, `kontenUmstellen()` bei jedem Laden (Konten ohne Passwort samt Profilen und Geräten weg, Ersteller → „unbekannt“, auch in `erledigt` und Sammelobjekten). `regeln.js`: `KONTO_PIN`, `PASSWORT_MIN`, `kontoPruefen`, `passwortPruefen`, `anzeigenameSauber`, `CODE_ZEICHEN`, `ZUGANGS_CODE`, `GUELTIGKEITEN`, `gueltigkeitPruefen`, `OFFLINE_MINUTEN` |
| L2 | `identitaet.js` neu, Routen aus 5.1, Hook in `server.js` (Reihenfolge 401 → 403 wartet → 423 PIN → Kontakt), `/ws` mit 4030/4023, Sperren (Passwort je Anzeigename, PIN je Gerät, Zurücksetzen je Konto). Server-Tests: `identitaet.test.js`, `api.test.js` (Konten, Passwort-Sperre, PIN-Pflicht mit Test-Uhr) |
| L3 | `companion/anmeldung.html`, Server und Netlify liefern sie unter `/`, die Companion unter `/app/`; Companion leitet bei fehlendem Token, 401, 423 und wartendem Konto dorthin; Konten im Board-Sheet; Offline-Sperre. Playwright: `anmeldung.test.mjs` (neu), alle anderen Tests auf Konten umgestellt |
| L4 | `dashboard-zugang.js` (neu) mit den Routen aus 5.2, `signatur.js` (neu, HMAC-Signatur für Konto-Token, Ticket und Anzeige-Token, je mit eigenem Zweck), `daten.js` (Zugänge und Anzeige-Geräte). `server.js`: Anzeige-Token neben dem Anzeige-Link für `/api/anzeige/*`, `/api/widgets/*` und `/ws` (Rolle `anzeige`, Herzschlag, 4023 PIN nötig, 4003 widerrufen). Server-Tests: `dashboard-zugang.test.js` (neu), `api.test.js` (ganzer Ablauf mit Test-Uhr) |
| L5 | Anmeldeseite: Reiter **Dashboard-Login** (Code, Dashboard-PIN, Layout wählen, „Anzeige starten“, „Anzeige abmelden“), Anzeige-Token unter `board.anzeige`. Companion: **„Anzeige-Gerät anmelden“** im Board-Sheet (Gültigkeit, Dashboard-PIN, „Code generieren“, „Erzeugte Codes“ mit Widerrufen). Dashboard: liest den Anzeige-Token (`zugang.ts`), schickt ohne Zugang und bei 401/403/409/423 bzw. 4001/4003/4023 zur Anmeldeseite (`/?dashboard`). Server: AN4 (eigene Anzeige je Gerät, `anzeigeKopieren`). Playwright: `dashboard-login.test.mjs` (neu, Screenshots `d1`–`d7`) |

**Abweichungen vom Bauplan** (bewusst, kurz begründet):

- **Board-PIN schon mit L3 abgebaut** (QR-Code mit `?pin=`, `/api/beitreten`, Sheet „Beitreten“, QR-Scanner der Companion, `RAUM_PIN`/`pin.txt`), nicht erst in L6: Die Migration aus L1 entfernt alle Konten ohne Passwort; ein weiter offenes Beitreten hätte sofort wieder solche Konten angelegt. Der **Anzeige-Link** bleibt bis L5/L6.
- **Lokaler PIN-Hash mit PBKDF2** (SHA-256, 200 000 Runden, WebCrypto, `regeln.js` `pinLokalHashen`) statt scrypt (AN12): Der Browser hat scrypt nicht eingebaut. Abgelegt wird er, sobald die PIN auf dem Gerät einmal richtig eingegeben wurde (Registrieren, PIN-Sperre, PIN zurücksetzen); nach einer Anmeldung nur mit Passwort gibt es ihn erst nach der ersten PIN. Ohne ihn entsperrt ohne Netz erst wieder das Board.
- **PIN nachreichen:** Wer die App ohne Netz mit der PIN entsperrt, muss sie wieder online nicht ein zweites Mal eingeben: Die Companion reicht sie einmal an `POST /api/pin` nach (nur im Speicher, einmalig).
- **Herzschlag** ist das Pong auf den Ping, den der Server ohnehin alle 25 s schickt (kein eigener Takt am Handy). Am Handy hält ein Minutentakt `board.kontakt` frisch, solange die Live-Verbindung steht.
- **Manifest:** Bereich (`scope`) ab `/`, Start weiter `/app/`, damit die Anmeldeseite in der Home-Bildschirm-App bleibt und nicht in einer Browser-Ansicht aufgeht. Die Anmeldeseite hängt auf Netlify dasselbe Manifest ein.
- **Reiter Dashboard-Login** zeigt bis L5 einen Hinweis (Anzeige-Geräte öffnen ihren Anzeige-Link).
- **Board nicht erreichbar** auf der Anmeldeseite: Hinweis mit „Offline weiter zur Companion“ (die läuft dann aus dem Spiegel, B3).
- **Altes Board** (vor dem Pi-Update): Die Anmeldeseite meldet „der Pi braucht ein Update“; schon angemeldete Handys laufen mit dem alten Token weiter, `IDENTITAET.werBistDu()` versteht beide Antworten von `/api/ich`.
- **Test-Uhr:** `TEST_UHR=1` schaltet `POST /api/test/uhr { minuten }` frei (Kapitel 7, L3 „Zeit am Server per Test-Schalter vorstellen“).

**Zu L4 im Einzelnen** (Ergänzungen zu Kapitel 5.2):

- **Anzeige-Token** im Header `Authorization: Bearer …` oder als `?anzeigeToken=…` (WebSocket). Konto-Token, Ticket und Anzeige-Token sind mit verschiedenen Zwecken signiert. Keins gilt an Stelle eines anderen.
- **Antworten der Anzeige-API** (`/api/anzeige/*`, `/api/widgets/*`) für ein Anzeige-Gerät:
  - **423** `{ error:"pin" }`: über 15 Minuten ohne Kontakt.
  - **409** `{ error:"layout" }`: noch kein Layout gewählt oder die gewählte Anzeige gelöscht.
  - **403**: ohne Link und ohne gültigen Token.
  - `/ws` schließt in denselben Fällen mit 4023 bzw. 4003.
- **Kontakt** zählt bei jeder erlaubten Anfrage der Anzeige und bei jedem Pong. In `daten.db` landet er höchstens einmal pro Minute, wie bei den Konten.
- **`GET /api/dashboard/sitzung`** gibt `anzeigeId: null` zurück, wenn die gewählte Anzeige gelöscht ist. Die Anzeige wählt dann neu. Wird eine Anzeige gelöscht, schließt `/ws` der Geräte, die sie gewählt hatten, mit 4003.
- **Live:** Erzeugen, Freischalten, Widerrufen und Abmelden melden `geaendert` mit Bereich `zugaenge`. Companion und Dashboard ignorieren ihn bis L5.
- **Abgelaufene Codes** bleiben in der Liste (`gueltig: false`), bis jemand sie widerruft. Angemeldete Anzeigen laufen weiter (AN5).
- **Noch ohne Oberfläche:** Companion und Dashboard nutzen die Zugänge erst mit L5.

**Zu L5 im Einzelnen:**

- **Einstieg:** `/?dashboard` (so schickt das Dashboard zurück) oder ein Gerät, das nur als Anzeige angemeldet ist, landet im Reiter Dashboard-Login. Mit gültigem Anzeige-Token und ohne PIN-Pflicht zeigt er gleich „Layout wählen“, das gewählte Layout ist vorausgewählt.
- **Layout wählen (AN4):** Die Auswahl zeigt je Anzeige die Bereiche und die Zahl der Widgets. Läuft eine schon auf einem anderen Gerät, steht dort „dieses bekommt eine Kopie“. `PUT /api/dashboard/layout` antwortet `{ anzeigeId, kopie }`; eine Kopie meldet `geaendert` „anzeigen“, sie erscheint in der Companion unter Board → Anzeigen.
- **Dashboard ohne Zugang** (weder Link noch Anzeige-Token) geht zur Anmeldeseite statt leere Widgets mit „braucht ihren Anzeige-Link“ zu zeigen. Ein alter Anzeige-Link läuft bis L6 weiter wie bisher.
- **Konto und Anzeige auf einem Gerät** bleiben getrennt (`board.verbindung` und `board.anzeige`). Abmelden des einen lässt das andere stehen.
- **TV-Ansicht** (Max, 14.10.2026: „Die Login Seite braucht eine TV Browser Ansicht“):
  - **Großbild** auf Fernsehern und breiten Bildschirmen im Querformat (ab 900 px Breite): zwei Spalten, links Titel und Reiter, rechts die Ansicht. Alles vergrößert mit `--tv-zoom` aus Höhe und Breite (knapp 2 bei Full HD), passt auch auf 960 × 540.
  - **Fernbedienung** auf Fernsehern (Kennung im Browser: Tizen, webOS, Android TV, Fire TV …) oder mit `?tv`: Pfeiltasten springen zum nächsten Element, OK löst aus, deutlicher Fokusrahmen.
    - Zifferntasten tippen PIN und Code. Wer die PIN mit Zifferntasten tippt, landet danach auf OK.
    - Ein Layout ist gewählt, sobald der Fokus darauf steht. OK startet dann die Anzeige.
    - Ein Fernseher ohne Konto öffnet gleich den Dashboard-Login.
- **Offen (Vorschlag für L6):** Anzeigen lassen sich noch nicht löschen. Wechselt ein Gerät auf ein Layout, das schon ein anderes zeigt, bekommt es eine neue Kopie, und seine bisherige Anzeige bleibt in der Liste stehen. Abhilfe: „Anzeige löschen“ unter Board → Anzeigen (nur, wenn kein Gerät sie zeigt).

**Als Nächstes:** L6 (Anzeige-Link mit Schlüssel abbauen, Doku).

