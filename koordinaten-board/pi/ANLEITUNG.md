# Pi, Cloudflare, Netlify: Anleitung für die Phasen 5 und 6

Stand: 13.10.2026 · gehört zum Umbauplan (erledigt, im Archiv: [`../../docs/plaene/UMBAUPLAN.md`](../../docs/plaene/UMBAUPLAN.md))

**Stand 13.10.2026: alles eingerichtet und über Mobilfunk geprobt.** Diese Anleitung bleibt, damit der Pi jederzeit neu aufsetzbar ist. Ab hier braucht es Konten, die Domain und den Pi, also Max. Die Domain ist `mainhubv1.com` (seit 13.10.2026; API unter `api.mainhubv1.com`).

## Reihenfolge (wann was)

| Schritt | Wann | Wer |
|---|---|---|
| 1. Netlify-Site anlegen, erst ohne Domain (`<name>.netlify.app`) | jetzt | Max |
| 2. Pi aufsetzen: Node 22, Repo, API als Dienst, Daten vom Laptop übernehmen | jetzt, parallel zu 1 | Max (Befehle unten) |
| 3. Cloudflare-Konto, Domain hinzufügen, Nameserver umstellen | sobald 1 läuft | Max |
| 4. Tunnel auf dem Pi (`api.mainhubv1.com`) | nach 3 (die Domain muss bei Cloudflare liegen) | Max (Befehle unten) |
| 5. In Netlify `API_URL=https://api.mainhubv1.com` setzen, Domain zuordnen | nach 4 | Max |
| 6. Probe über Mobilfunk: QR scannen, anmelden, Ort anlegen, Board aktualisiert sich | nach 5 | Max |

**Wann startet der Pi?** Schon bei Schritt 2 kann er im Heimnetz den Laptop als Server ablösen (dann noch `HOST=0.0.0.0` und ohne `OEFFENTLICHE_URL`, die Handys kommen wie heute per QR-Code über die LAN-Adresse). Für die Online-Fassung (Schritt 4 bis 6) wird die Datei `/etc/companion-board.env` auf `HOST=127.0.0.1`, `OEFFENTLICHE_URL` und `ERLAUBTE_URSPRUENGE` umgestellt und der Dienst neu gestartet. Bis dahin läuft alles lokal weiter wie heute.

## 1. Netlify

1. Bei [netlify.com](https://www.netlify.com) anmelden (GitHub-Login reicht) → *Add new site → Import an existing project* → GitHub → `cloud7too9/Companion-Board`, Branch `main`. Build-Befehl und Ordner kommen aus `netlify.toml`, nichts eintragen.
2. *Site configuration → Environment variables*: `API_URL` erst einmal leer lassen oder weglassen. Die Seite läuft dann im DEMO-/Beispiel-Modus: gut zum Anschauen von `/`, `/app/` und `/dashboard/` unter `https://<name>.netlify.app`.
3. Nach Schritt 4 (Tunnel): `API_URL = https://api.mainhubv1.com` setzen, *Deploys → Trigger deploy*.
4. Domain: *Domain management → Add a domain* → `mainhubv1.com` und `www.mainhubv1.com`. Netlify nennt dann die DNS-Einträge (siehe Cloudflare, Abschnitt 3). Das Zertifikat stellt Netlify selbst aus, sobald die Einträge stimmen (dauert bis zu einer Stunde).
5. Jeder Push auf `main` baut die Seite neu; Pull Requests bekommen eine Vorschau-Adresse.

## 2. Raspberry Pi (Raspberry Pi OS Lite, 64 Bit)

```bash
# Node 22 (node:sqlite braucht mindestens 22.13)
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs git sqlite3
node -v                                            # v22.x

# Nutzer und Ordner
sudo useradd --system --create-home --shell /usr/sbin/nologin board
sudo mkdir -p /opt/companion-board /var/lib/companion-board
sudo chown -R board:board /opt/companion-board /var/lib/companion-board

# Repo und API (nur der Server, keine Seiten, keine Texterkennung)
sudo -u board git clone https://github.com/cloud7too9/Companion-Board.git /opt/companion-board
cd /opt/companion-board/koordinaten-board/server && sudo -u board npm ci --omit=dev

# Dienst
sudo cp /opt/companion-board/koordinaten-board/pi/companion-board.service /etc/systemd/system/
sudo cp /opt/companion-board/koordinaten-board/pi/companion-board.env /etc/companion-board.env
sudo nano /etc/companion-board.env                 # Domain eintragen; fürs Heimnetz vorerst HOST=0.0.0.0 und OEFFENTLICHE_URL auskommentieren
sudo systemctl daemon-reload
sudo systemctl enable --now companion-board
sudo journalctl -u companion-board -f              # Konsole: Adresse der Anmeldung, Anzeige-Link, „daten.json nach daten.db übernommen“
                                                   # Die Warnung „widgets/dist must exist“ ist harmlos: das Dashboard kommt von Netlify
```

**Daten vom Laptop mitnehmen:** `koordinaten-board/server/daten/` vom Laptop (daten.json oder schon daten.db, dazu `geheim.txt`, `biome/`) nach `/var/lib/companion-board/` kopieren, bevor der Dienst das erste Mal startet; `sudo chown -R board:board /var/lib/companion-board`. Eine `daten.json` übernimmt der Server beim ersten Start selbst nach `daten.db`.

**Update:** `cd /opt/companion-board && sudo -u board git pull && cd koordinaten-board/server && sudo -u board npm ci --omit=dev && sudo systemctl restart companion-board`.

**Update auf die Anmeldung mit Passwort** (Bauplan „Anmeldung und Dashboard-Zugang“, 14.10.2026): Beim ersten Start nach dem Update entfernt der Server alle bisherigen Konten (ohne Passwort) samt ihren Geräten; Orte, Banner und alles andere bleiben stehen, der Ersteller heißt dann „unbekannt“. **Gleich danach** `https://mainhubv1.com/` öffnen und registrieren: Das **erste** Konto gilt sofort, jedes weitere wartet, bis ein freigegebenes Konto es in der Companion unter Board → Konten freigibt. `RAUM_PIN` und `COMPANION_PFAD` in `/etc/companion-board.env` braucht es nicht mehr (der Server liest sie nicht), `pin.txt` im Datenordner darf weg.

**Sicherung:** `pi/sicherung.sh` zieht nachts eine Kopie von `daten.db` (SQLite-Backup im laufenden Betrieb). Cron als `board`: `sudo -u board crontab -e` → `15 3 * * * /opt/companion-board/koordinaten-board/pi/sicherung.sh`. Die Kopien vom Pi wegholen (Laptop oder Hetzner), sonst liegt alles auf einer SD-Karte, z. B. vom Laptop: `rsync -a board@<pi>:/var/lib/companion-board/sicherung/ ~/companion-sicherung/` (Nutzer `board` hat keine Shell; dann mit dem eigenen Pi-Nutzer kopieren, der die Dateien lesen darf, oder `sudo` in einem Cron auf dem Pi, der nach außen schiebt).

**RAM messen** (Umbauplan): `free -m` und `ps -o rss,cmd -C node,cloudflared` nach dem Start und nach einem Welt-Import. `MemoryMax=400M` in der Dienstdatei ist die Leitplanke.

## 3. Cloudflare (Domain und Tunnel)

**Konto und Domain**

1. Kostenloses Konto bei [cloudflare.com](https://dash.cloudflare.com) → *Add a domain* → `mainhubv1.com` → Plan *Free*. Cloudflare liest die vorhandenen DNS-Einträge ein.
2. Cloudflare zeigt zwei Nameserver (`…ns.cloudflare.com`). Beim Registrar (dort, wo die Domain gekauft ist) die Nameserver auf diese beiden umstellen. Die Domain bleibt beim Registrar; nur das DNS wandert. Umstellung dauert Minuten bis Stunden, Cloudflare schickt eine Mail, wenn die Zone aktiv ist.

**DNS-Einträge** (*DNS → Records*)

| Typ | Name | Inhalt | Proxy |
|---|---|---|---|
| CNAME | `@` | `apex-loadbalancer.netlify.com` | **aus** (graue Wolke, „DNS only“) |
| CNAME | `www` | `<name>.netlify.app` | **aus** (graue Wolke) |
| CNAME | `api` | legt `cloudflared tunnel route dns` selbst an | an (orange Wolke, kommt vom Tunnel) |

Cloudflare flacht den CNAME auf `@` automatisch ab (CNAME flattening). Falls Netlify stattdessen einen A-Record verlangt: `A @ 75.2.60.5`, ebenfalls Proxy aus. Die graue Wolke ist wichtig: Nur dann kann Netlify das Zertifikat für die Domain ausstellen.

**Einstellungen, die man nicht braucht:** *SSL/TLS* betrifft nur den Proxy (also `api`), dort passt *Full*. Keine *Page Rules*, kein *Access*, keine Firewall-Regel nötig. **Empfohlen** (Stand 13.10.2026 noch offen, siehe Warteliste Kapitel 5) unter *Security → WAF → Rate limiting rules*: Anfragen an `api.mainhubv1.com/api/anmelden`, `/api/registrieren`, `/api/pin*` und `/api/dashboard/code`, `/api/dashboard/freischalten`, `/api/dashboard/pin` auf z. B. 10 pro Minute je IP begrenzen (Schutz vor Passwort-, PIN- und Code-Raten, zusätzlich zur Sperre im Server).

**Tunnel auf dem Pi**

```bash
# cloudflared installieren (Debian/Raspberry Pi OS, arm64)
curl -fsSL https://pkg.cloudflare.com/cloudflare-main.gpg | sudo tee /usr/share/keyrings/cloudflare-main.gpg >/dev/null
# Cloudflare hat (Stand 10/2026) kein Verzeichnis für Debian 13 „trixie“ – deshalb fest „bookworm“, die Pakete sind dieselben
echo "deb [signed-by=/usr/share/keyrings/cloudflare-main.gpg] https://pkg.cloudflare.com/cloudflared bookworm main" | sudo tee /etc/apt/sources.list.d/cloudflared.list
sudo apt-get update && sudo apt-get install -y cloudflared
# Falls apt hakt: Paket direkt von GitHub (dann ohne Updates über apt)
#   curl -fsSL -o /tmp/cloudflared.deb https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-arm64.deb
#   sudo apt-get install -y /tmp/cloudflared.deb

cloudflared tunnel login                           # öffnet eine Cloudflare-Seite (Link in der Konsole): Domain auswählen
cloudflared tunnel create board                    # legt ~/.cloudflared/<TUNNEL-ID>.json an
cloudflared tunnel route dns board api.mainhubv1.com   # legt den CNAME api → <TUNNEL-ID>.cfargotunnel.com an

sudo mkdir -p /etc/cloudflared
sudo cp ~/.cloudflared/<TUNNEL-ID>.json /etc/cloudflared/
sudo cp /opt/companion-board/koordinaten-board/pi/cloudflared-config.yml /etc/cloudflared/config.yml
sudo nano /etc/cloudflared/config.yml             # <TUNNEL-ID> und Domain eintragen
sudo cloudflared service install                   # Dienst „cloudflared“, startet mit dem Pi
sudo systemctl status cloudflared

# Jetzt die API auf den Tunnel umstellen
sudo nano /etc/companion-board.env                 # HOST=127.0.0.1, OEFFENTLICHE_URL, ERLAUBTE_URSPRUENGE
sudo systemctl restart companion-board
curl https://api.mainhubv1.com/api/server         # → {"name":"koordinaten-board"}
```

**Tunnel stirbt sofort mit „Couldn't resolve SRV record … region1.v2.argotunnel.com … no such host“:** Der Router (z. B. Vodafone GigaCube) beantwortet SRV-Abfragen nicht. Dann fragt der Pi direkt Cloudflare oder Google als DNS:

```bash
nmcli -t -f NAME,DEVICE con show --active            # Name der WLAN-Verbindung, z. B. netplan-wlan0-gigacube-2E8C
sudo nmcli con mod "<NAME>" ipv4.dns "1.1.1.1 8.8.8.8" ipv4.ignore-auto-dns yes
sudo nmcli con up "<NAME>"                           # WLAN kommt nach ein paar Sekunden wieder
sudo systemctl restart cloudflared
```

Taucht nach einem Neustart wieder der Router als DNS auf, in `/etc/netplan/90-NM-*.yaml` unter `wlan0` eintragen: `nameservers: { addresses: [1.1.1.1, 8.8.8.8] }` und `dhcp4-overrides: { use-dns: false }`, dann `sudo netplan apply`.

Der Tunnel baut die Verbindung vom Pi nach außen auf: Am Router (bei deiner Mutter oder in der neuen Wohnung) muss nichts freigegeben werden, und ein Umzug ändert nichts an der Adresse.

## 4. Probe (Umbauplan, Phase 6)

1. Am Fernseher oder Tablet den Anzeige-Link `https://mainhubv1.com/dashboard?anzeige=…&schluessel=…` öffnen (aus `journalctl -u companion-board` oder aus der Companion unter Board → Anzeigen). Die Anzeige ist seit Bauplan „Sitzung“ (S4) das Widget-Dashboard; alte Links auf `/anzeige` leiten dorthin um. Unter `https://mainhubv1.com/` liegt seit dem Bauplan „Anmeldung“ die Anmeldeseite.
2. Am Handy **im Mobilfunk** (WLAN aus) den QR-Code scannen → Anmeldeseite `https://mainhubv1.com/` → anmelden oder registrieren → Companion unter `/app/` → „Zum Home-Bildschirm“ (Safari: Teilen → Zum Home-Bildschirm; Chrome: Installieren).
3. Ort anlegen oder Screenshot auslesen (die Texterkennung lädt beim ersten Mal etwa 7 MB) → die Anzeige aktualisiert sich live.
4. Flugmodus an, App vom Home-Bildschirm öffnen: Die Seite geht auf (App-Shell aus dem Cache), die Daten kommen aus dem Spiegel (B3). Nach über 30 Minuten ohne Verbindung fragt sie nach der PIN. Offline anlegen kommt mit B4.

## Probe nach dem Umschalten auf das Dashboard (Bauplan „Sitzung“, S4, Haltepunkt H10)

Nach dem Merge baut Netlify die Seite neu; am Pi einmal das **Update** (oben) ausführen, damit der Server den neuen Anzeige-Link schreibt und die alte Anzeige nicht mehr kennt.

1. Am Fernseher oder Tablet den Anzeige-Link öffnen (`https://mainhubv1.com/dashboard/` merkt sich danach den Schlüssel). `https://mainhubv1.com/` ist seit dem Bauplan „Anmeldung“ die Anmeldeseite.
2. Im Kopf stehen Titel, Seed, Uhr und ein grüner Punkt „Verbunden“; die Widgets zeigen Orte, den QR-Code zur Anmeldeseite und Spieler.
3. Am Handy **im Mobilfunk** den QR-Code aus dem Widget „Beitreten“ scannen, anmelden, einen Ort anlegen: erscheint live im Widget „Orte der Welt“, das Handy unter „Spieler“.
4. Einen Inhalt „Aufs Board“ legen: Die Anzeige wechselt auf den Layer „Sitzung“ und zeigt das Widget mit „von <Name>“. „Wegnehmen“ am Handy nimmt es wieder weg.
5. `sudo systemctl restart companion-board`: Die Anzeige verbindet sich neu, die Sitzung ist leer, das Layout ist noch da.

## Probe der Anmeldung (Bauplan „Anmeldung“, L3, Haltepunkt H15)

Nach dem Merge baut Netlify die Anmeldeseite unter `/`; am Pi einmal das **Update** (oben) ausführen.

1. Gleich danach `https://mainhubv1.com/` am Handy öffnen → „Registrieren“: echter Name, Anzeigename, Passwort (mindestens 8 Zeichen), PIN. Als erstes Konto gilt es sofort → Willkommenskarte → „Weiter zur Companion“. Danach am besten „Zum Home-Bildschirm“.
2. Ein zweites Handy registriert sich → „Wartet auf Freigabe“. Am ersten Handy Board → Konten → „Freigeben“: Das zweite Handy geht von selbst weiter zur Willkommenskarte.
3. Das Handy über eine halbe Stunde liegen lassen (oder die App ganz schließen) und wieder öffnen: „Hallo, … Bitte bestätige mit deiner PIN.“ Mit „PIN vergessen?“ lässt sie sich mit dem Passwort neu setzen; ein anderes Gerät desselben Kontos fragt danach nach der neuen PIN.
4. Flugmodus, über 30 Minuten nach dem letzten Kontakt: Die App fragt auch ohne Netz nach der PIN. Wieder online geht es ohne zweite Abfrage weiter.

## Probe des Dashboard-Logins (Bauplan „Anmeldung“, L5, Haltepunkt H16)

Nach dem Merge baut Netlify Anmeldeseite und Dashboard neu; am Pi einmal das **Update** (oben) ausführen.

1. In der Companion Board → „Anzeige-Gerät anmelden“: Gültigkeit wählen (Standard 20 Minuten), Dashboard-PIN zweimal, „Code generieren“. Der Code steht groß darüber.
2. Am Fernseher oder Tablet `https://mainhubv1.com/` öffnen → Reiter „Dashboard-Login“ → Code (Groß- und Kleinschreibung zählt) → Dashboard-PIN → Layout wählen → „Anzeige starten“. Neu laden geht ohne Code.
3. Ein zweites Gerät mit demselben Code und demselben Layout: Es bekommt eine eigene Kopie („Board 2“) mit eigenem Raster. Angeordnet wird sie in der Companion unter Board → Anzeigen.
4. Das Gerät über eine Viertelstunde ohne Verbindung (WLAN aus): Danach fragt es nach der Dashboard-PIN.
5. In der Companion unter „Erzeugte Codes“ zweimal „Widerrufen“: Alle Anzeigen des Codes landen wieder beim Dashboard-Login.

## Aufräumen nach der Probe (Phase 6, Umbauplan): erledigt

Am 13.10.2026 entfernt (E18): `netzwerk.js`, das Adress-Lernen (`adresse.txt`), `start.bat`, `start.sh`, `anzeige-oeffnen.bat` und die Firewall-Skripte. Der Server nimmt die Adresse für QR-Code und Anzeige-Link nur noch aus `OEFFENTLICHE_URL` (auf dem Pi gesetzt); ohne sie gilt `http://localhost:<PORT>` für die Entwicklung.
