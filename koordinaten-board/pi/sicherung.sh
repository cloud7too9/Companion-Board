#!/usr/bin/env bash
# Sicherung von daten.db im laufenden Betrieb (SQLite-Backup-API, Umbau Phase 4/6).
# Cron (als Nutzer board): 15 3 * * * /opt/companion-board/koordinaten-board/pi/sicherung.sh
# Vor jedem Update:        sudo -u board /opt/companion-board/koordinaten-board/pi/sicherung.sh vor-update
# Die Kopie wird geprüft (integrity_check) und gepackt; die letzten 14 Sicherungen bleiben. Mit SICHERUNG_EXTERN
# (z. B. user@laptop:companion-sicherung/, SSH-Schlüssel nötig) schiebt das Skript sie danach vom Pi weg – sonst
# liegt alles auf einer SD-Karte. Bei einem Fehler endet es mit Exit-Code ≠ 0 (Cron meldet das per Mail, wenn
# MAILTO gesetzt ist).
set -euo pipefail
umask 077
DATEN="${DATEN_ORDNER:-/var/lib/companion-board}"
ZIEL="${SICHERUNG_ORDNER:-/var/lib/companion-board/sicherung}"
NAME="daten-$(date +%F)${1:+-$1}"
mkdir -p "$ZIEL"

sqlite3 "$DATEN/daten.db" ".backup '$ZIEL/$NAME.db'"
if [ "$(sqlite3 "$ZIEL/$NAME.db" 'PRAGMA integrity_check;')" != "ok" ]; then
  echo "FEHLER: Sicherung $ZIEL/$NAME.db ist beschädigt" >&2
  exit 1
fi
gzip -f "$ZIEL/$NAME.db"
cp "$DATEN/geheim.txt" "$ZIEL/" 2>/dev/null || true

# Nur die letzten 14 Sicherungen behalten (auch ungepackte von früher)
shopt -s nullglob
alle=("$ZIEL"/daten-*.db "$ZIEL"/daten-*.db.gz)
if [ "${#alle[@]}" -gt 14 ]; then
  ls -1t "${alle[@]}" | tail -n +15 | xargs -r rm --
fi

if [ -n "${SICHERUNG_EXTERN:-}" ]; then
  rsync -a "$ZIEL/" "$SICHERUNG_EXTERN"
  echo "Nach $SICHERUNG_EXTERN kopiert"
fi
echo "Sicherung: $ZIEL/$NAME.db.gz"
