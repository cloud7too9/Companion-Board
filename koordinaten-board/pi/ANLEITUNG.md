# Pi, Cloudflare, Netlify: Anleitung für die Phasen 5 und 6

Stand: 13.10.2026 · gehört zu [`../../planung/UMBAUPLAN.md`](../../planung/UMBAUPLAN.md)

Der Code für die Phasen 1 bis 5 ist fertig und lokal geprüft. Ab hier braucht es Konten, die Domain und den Pi, also Max. Die Domain ist `mainhubv1.com` (seit 13.10.2026; API unter `api.mainhubv1.com`).

## Reihenfolge (wann was)

| Schritt | Wann | Wer |
|---|---|---|
| 1. Netlify-Site anlegen, erst ohne Domain (`<name>.netlify.app`) | jetzt | Max |
| 2. Pi aufsetzen: Node 22, Repo, API als Dienst, Daten vom Laptop übernehmen | jetzt, parallel zu 1 | Max (Befehle unten) |
| 3. Cloudflare-Konto, Domain hinzufügen, Nameserver umstellen | sobald 1 läuft | Max |
| 4. Tunnel auf dem Pi (`api.mainhubv1.com`) | nach 3 (die Domain muss bei Cloudflare liegen) | Max (Befehle unten) |
| 5. In Netlify `API_URL=https://api.mainhubv1.com` setzen, Domain zuordnen | nach 4 | Max |
| 6. Probe über Mobilfunk: QR scannen, beitreten, Ort anlegen, Board aktualisiert sich | nach 5 | Max |

**Wann startet der Pi?** Schon bei Schritt 2 kann er im Heimnetz den Laptop als Server ablösen (dann noch `HOST=0.0.0.0` und ohne `OEFFENTLICHE_URL`, die Handys kommen wie heute per QR-Code über die LAN-Adresse). Für die Online-Fassung (Schritt 4 bis 6) wird die Datei `/etc/companion-board.env` auf `HOST=127.0.0.1`, `OEFFENTLICHE_URL`, `COMPANION_PFAD=/app/` und `ERLAUBTE_URSPRUENGE` umgestellt und der Dienst neu gestartet. Bis dahin läuft alles lokal weiter wie heute.

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
sudo nano /etc/companion-board.env                 # Domain eintragen; fürs Heimnetz vorerst HOST=0.0.0.0, OEFFENTLICHE_URL und COMPANION_PFAD auskommentieren
sudo systemctl daemon-reload
sudo systemctl enable --now companion-board
sudo journalctl -u companion-board -f              # Konsole: PIN, Anzeige-Link, „daten.json nach daten.db übernommen“
                                                   # Die Warnung „widgets/dist must exist“ ist harmlos: das Dashboard kommt von Netlify
```

**Daten vom Laptop mitnehmen:** `koordinaten-board/server/daten/` vom Laptop (daten.json oder schon daten.db, dazu `pin.txt`, `geheim.txt`, `biome/`) nach `/var/lib/companion-board/` kopieren, bevor der Dienst das erste Mal startet; `sudo chown -R board:board /var/lib/companion-board`. Eine `daten.json` übernimmt der Server beim ersten Start selbst nach `daten.db`.

**Update:** `cd /opt/companion-board && sudo -u board git pull && cd koordinaten-board/server && sudo -u board npm ci --omit=dev && sudo systemctl restart companion-board`.

**Sicherung:** `pi/sicherung.sh` zieht nachts eine Kopie von `daten.db` (SQLite-Backup im laufenden Betrieb). Cron als `board`: `sudo -u board crontab -e` → `15 3 * * * /opt/companion-board/koordinaten-board/pi/sicherung.sh`. Die Kopien vom Pi wegholen (Laptop oder Hetzner), z. B. `scp` oder `rsync` von außen.

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

**Einstellungen, die man nicht braucht:** *SSL/TLS* betrifft nur den Proxy (also `api`), dort passt *Full*. Keine *Page Rules*, kein *Access*, keine Firewall-Regel nötig. Optional unter *Security → WAF → Rate limiting rules*: Anfragen an `api.mainhubv1.com/api/beitreten*` auf z. B. 10 pro Minute je IP begrenzen (Schutz vor PIN-Raten, zusätzlich zur Sperre im Server).

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
sudo nano /etc/companion-board.env                 # HOST=127.0.0.1, OEFFENTLICHE_URL, COMPANION_PFAD=/app/, ERLAUBTE_URSPRUENGE
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

1. Am Fernseher oder Tablet `https://mainhubv1.com/anzeige?anzeige=…&schluessel=…` öffnen (Anzeige-Link aus `journalctl -u companion-board` oder aus der Companion unter Board → Anzeigen). Das Dashboard: `https://mainhubv1.com/dashboard?anzeige=…&schluessel=…`.
2. Am Handy **im Mobilfunk** (WLAN aus) den QR-Code scannen → `https://mainhubv1.com/app/?pin=…` → beitreten → „Zum Home-Bildschirm“ (Safari: Teilen → Zum Home-Bildschirm; Chrome: Installieren).
3. Ort anlegen oder Screenshot auslesen (die Texterkennung lädt beim ersten Mal etwa 7 MB) → die Anzeige aktualisiert sich live.
4. Flugmodus an, App vom Home-Bildschirm öffnen: Die Seite geht auf (App-Shell aus dem Cache); Daten gibt es erst wieder mit Netz (Offline-Warteschlange kommt mit B3–B5).

## Aufräumen nach der Probe (Phase 6, Umbauplan)

`netzwerk.js`, das Adress-Lernen (`adresse.txt`) und die Firewall-Skripte braucht der Pi nicht mehr; sie bleiben für den Betrieb im Heimnetz vom Laptop aus erhalten. Für den Pi ist `OEFFENTLICHE_URL` gesetzt, dann wird die LAN-Adresse nicht mehr benutzt.
