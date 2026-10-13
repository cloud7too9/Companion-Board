# Archiv: was erledigt ist

Stand: 13.10.2026

Hier liegt, was abgeschlossen ist: Pläne und Baupläne, die gebaut sind, die Ideen dahinter, der Verlauf der Arbeitsrunden und entschiedene Fragen. Nichts davon muss man lesen, um weiterzuarbeiten. Es bleibt zum Nachschlagen, warum etwas so gebaut ist.

**Was offen ist, steht in [`planung/`](../planung/):** der Gesamtplan ([`PLAN.md`](../planung/PLAN.md)), die Übergabe mit dem Stand je Phase ([`UEBERGABE.md`](../planung/UEBERGABE.md)), die [Warteliste](../planung/WARTELISTE.md) und die Baupläne und Ideen, an denen noch gebaut wird (Offline-Sync, Vorgehen Widgets, Sitzung bis zum Haltepunkt H10).

Regel: Ist ein Plan oder Bauplan fertig gebaut und abgenommen, zieht er mit `git mv` hierher und bekommt oben einen Vermerk „Erledigt · Archiv“. Erledigte Haltepunkte, Nachfragen und Entscheidungen wandern aus der Warteliste nach [`verlauf/`](verlauf/). Inhalt wird dabei nicht umgeschrieben.

## Pläne

| Datei | Worum es ging | Erledigt |
|---|---|---|
| [`plaene/UMBAUPLAN.md`](plaene/UMBAUPLAN.md) | Umbau auf Netlify und Raspberry Pi in sechs Phasen: Server absichern, API-Adresse, Texterkennung am Handy, SQLite, Netlify mit PWA, Pi mit Cloudflare-Tunnel | 13.10.2026, in Betrieb unter `mainhubv1.com` |
| [`plaene/PLAN-welt-import-biome.md`](plaene/PLAN-welt-import-biome.md) | Biome aus der Minecraft-Welt (`.mcworld`/`.zip`) im Browser lesen und auf der Karte zeigen (Plan von Max) | Phasen 1–6 bis 01.10.2026; offen nur die Realm-Welt am iPhone |
| [`plaene/ROADMAP-MainHub.md`](plaene/ROADMAP-MainHub.md) | Roadmap des Dashboards aus MainHub, bevor es in die Companion kam | abgelöst am 01.10.2026 durch `planung/PLAN.md` |

## Baupläne und Ideen

Jede Idee der Planungskommission hat einen Bauplan; beide liegen hier, sobald der Bauplan gebaut ist.

| Bauplan | Idee | Gebaut als |
|---|---|---|
| [`Bauplan-Raster-32-Spalten.md`](bauplaene/Bauplan-Raster-32-Spalten.md) | [`Raster-32-Spalten.md`](ideen/Raster-32-Spalten.md) | Phase A1: 32 Spalten, quadratische Zellen |
| [`Bauplan-Widget-Groessensystem.md`](bauplaene/Bauplan-Widget-Groessensystem.md) | [`Widget-Groessensystem.md`](ideen/Widget-Groessensystem.md) | Phase A2: Größenstufen und Passt-Prüfung (echte Stufen je Widget: A7, offen) |
| [`Bauplan-Widget-Struktur.md`](bauplaene/Bauplan-Widget-Struktur.md) | [`Widget-Struktur.md`](ideen/Widget-Struktur.md) | Phase A3: Bereich, Widget-Typ, Instanz, Galerie |
| [`Bauplan-Widget-Inhalte.md`](bauplaene/Bauplan-Widget-Inhalte.md) | [`Widget-Inhalte.md`](ideen/Widget-Inhalte.md) | Phase A4: Register der Widget-Typen, Karten vom Server |
| [`Bauplan-Bereichs-Themes.md`](bauplaene/Bauplan-Bereichs-Themes.md) | [`Bereichs-Themes.md`](ideen/Bereichs-Themes.md) | Phase A5: Theme je Bereich (Themes für Sammelobjekte, Banner, Rüstung: E8, vertagt) |
| [`Bauplan-Welt-Import.md`](bauplaene/Bauplan-Welt-Import.md) | [`Welt-Export-iPhone.md`](ideen/Welt-Export-iPhone.md) | Strang C: Welt-Import per ZIP mit Anleitung |

## Verlauf

| Datei | Inhalt |
|---|---|
| [`verlauf/Runden-und-PRs.md`](verlauf/Runden-und-PRs.md) | Arbeitsrunden vom 04.10. bis 13.10.2026 mit allen Pull Requests, Repo-Umzug, Umbau-Branches, die gestapelten PRs im alten Repo |
| [`verlauf/Entscheidungen-und-Haltepunkte.md`](verlauf/Entscheidungen-und-Haltepunkte.md) | Abgenommene Haltepunkte (H1–H6, H8, H9), entschiedene Nachfragen (N1, N2, N4, N5) und Entscheidungen (E15, E16, E18, E20), projektübergreifende Entscheidungen, gelöste Probleme beim Betrieb vom Laptop |
