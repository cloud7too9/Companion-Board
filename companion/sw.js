// Service Worker der Companion-PWA (Umbau Phase 5): App-Shell im Cache, damit die Seite am Handy auch ohne
// Netz aufgeht. Nur aktiv, wenn konfig.js `pwa: true` setzt (Netlify) – lokal vom Board kommt die Seite
// weiter ohne Cache. Der Stand (__STAND__) wird beim Bauen eingesetzt; ein neuer Stand räumt alte Caches weg.
// Daten gehen nie durch den Cache: Anfragen an andere Ursprünge (die API) laufen immer ins Netz.
//
// Zwei Caches: `companion-<Stand>` für Seite, Regeln und Module (wechselt mit jedem Stand) und DAUER für große,
// selten geänderte Dateien (vendor/ mit tesseract und LevelDB, ruestungs-baukasten/, icons/). DAUER bleibt über
// Updates hinweg; ändert sich dort etwas, DAUER hochzählen.
const STAND = "__STAND__";
const CACHE = `companion-${STAND}`;
const DAUER = "companion-dauer-1";
const SHELL = ["./", "konfig.js", "regeln.js", "board-karten.js", "texterkennung.js", "biom-ids.js",
  "biom-dekoder.js", "biom-welt.js", "welt-ordner.js", "nbt.js", "welt-funde.js", "biom-import.worker.js",
  "manifest.webmanifest", "icons/app/icon-180.png", "icons/app/icon-192.png", "icons/app/icon-512.png"];
/** Wie lange die Seite aufs Netz wartet, bevor sie aus dem Cache kommt (schwaches Netz am Handy) */
const SEITE_WARTEN_MS = 3000;

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((alle) => Promise.all(alle.filter((k) => k !== CACHE && k !== DAUER).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

/** Antwort merken – nur vollständige, erfolgreiche; die Kopie entsteht sofort, bevor die Seite die Antwort liest */
function merken(cache, request, antwort) {
  if (!antwort.ok || antwort.type === "opaqueredirect") return;
  const kopie = antwort.clone();
  caches.open(cache).then((c) => c.put(request, kopie)).catch(() => {});
}

const ausDemCache = (request) => caches.match(request, { ignoreSearch: true }).then((a) => a ?? caches.match("./"));

self.addEventListener("fetch", (e) => {
  const { request } = e;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;                       // API, CDN: immer Netz
  const basis = new URL("./", self.location.href).pathname;
  if (!url.pathname.startsWith(basis)) return;                           // nur der eigene Bereich (/app/)
  if (request.mode === "navigate" || url.pathname.endsWith("konfig.js")) {
    // Seite und Konfiguration: erst Netz (neuer Stand), nach SEITE_WARTEN_MS oder ohne Netz aus dem Cache.
    // Kommt das Netz später doch noch, landet die neue Seite trotzdem im Cache.
    const netz = fetch(request).then((antwort) => { merken(CACHE, request, antwort); return antwort; });
    e.respondWith(new Promise((fertig) => {
      let erledigt = false;
      const nimm = (antwort) => { if (!erledigt && antwort){ erledigt = true; fertig(antwort); } };
      const zeit = setTimeout(() => ausDemCache(request).then((a) => a && nimm(a)), SEITE_WARTEN_MS);
      netz.then((a) => { clearTimeout(zeit); nimm(a); })
        .catch(() => { clearTimeout(zeit); ausDemCache(request).then((a) => nimm(a ?? Response.error())); });
    }));
    return;
  }
  // Alles andere (Regeln, Icons, Texturen, tesseract.js, Welt-Import): erst Cache, sonst Netz und merken
  const pfad = url.pathname.slice(basis.length);
  const cache = /^(vendor|ruestungs-baukasten|icons)\//.test(pfad) ? DAUER : CACHE;
  e.respondWith(caches.match(request).then((treffer) => treffer ?? fetch(request).then((antwort) => {
    merken(cache, request, antwort);
    return antwort;
  })));
});
