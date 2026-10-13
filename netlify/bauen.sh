#!/usr/bin/env bash
# Baut die Netlify-Seite (Umbau Phase 5) nach netlify/dist:
#   /dashboard/  Anzeige = Widget-Dashboard (companion/widgets, Vite); / und /anzeige leiten dorthin (_redirects, S4)
#   /app/        Companion-PWA (companion/, statische Dateien)     /icons/   Kennblöcke für das Dashboard
# API_URL (z. B. https://api.mainhubv1.com) landet in VITE_API_URL (Dashboard) und in app/konfig.js (Companion).
# Lokal: API_URL=http://127.0.0.1:3000 bash netlify/bauen.sh  → dann netlify/dist mit einem statischen Server ausliefern.
# OHNE_INSTALL=1 überspringt npm ci (wenn node_modules schon da sind, z. B. in den Tests), ZIEL=… baut woanders hin.
set -euo pipefail
cd "$(dirname "$0")/.."
WURZEL=$(pwd)
ZIEL="${ZIEL:-$WURZEL/netlify/dist}"
API_URL="${API_URL:-}"
API_URL="${API_URL%/}"
STAND="${COMMIT_REF:-$(git rev-parse --short HEAD 2>/dev/null || date +%s)}"

echo "Netlify-Seite bauen → $ZIEL (API: ${API_URL:-keine, DEMO-Modus})"
rm -rf "$ZIEL"
mkdir -p "$ZIEL"

# Widget-Dashboard (die Anzeige) unter /dashboard/
# Eigener Ausgabeordner, damit companion/widgets/dist (das Board liefert sie lokal aus) unberührt bleibt
# VITE_COMPANION_PFAD: wohin „Fertig“ in /dashboard/anordnen zurückführt (die Companion liegt hier unter /app/)
( cd companion/widgets && [ -n "${OHNE_INSTALL:-}" ] || npm ci --no-audit --no-fund; VITE_API_URL="$API_URL" VITE_COMPANION_PFAD="/app/" npm run build -- --outDir "$ZIEL/dashboard" --emptyOutDir )

# Companion unter /app/: Seite als index.html, dazu Regeln, Texterkennung, Welt-Import, Icons, Baukasten, Bibliotheken
mkdir -p "$ZIEL/app"
cp companion/companion-prototyp.html "$ZIEL/app/index.html"
cp companion/regeln.js companion/board-karten.js companion/texterkennung.js \
   companion/biom-ids.js companion/biom-dekoder.js companion/biom-welt.js companion/welt-ordner.js companion/biom-import.worker.js \
   companion/manifest.webmanifest companion/sw.js "$ZIEL/app/"
cp -r companion/icons companion/vendor companion/ruestungs-baukasten "$ZIEL/app/"
# Kennblöcke für das Dashboard (es lädt /icons/…)
cp -r companion/icons "$ZIEL/icons"
# konfig.js: Adresse der API, PWA an, Stand für den Cache des Service Workers
cat > "$ZIEL/app/konfig.js" <<KONFIG
// Erzeugt von netlify/bauen.sh (Stand $STAND)
window.COMPANION_KONFIG = { apiAdresse: "$API_URL", pwa: true, stand: "$STAND" };
KONFIG
sed -i "s/__STAND__/$STAND/" "$ZIEL/app/sw.js"

cp netlify/_redirects "$ZIEL/_redirects"
echo "Fertig: $(find "$ZIEL" -type f | wc -l) Dateien, $(du -sh "$ZIEL" | cut -f1)"
