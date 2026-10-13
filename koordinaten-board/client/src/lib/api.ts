// Adresse der API (Umbau Phase 2). Beim Bauen über VITE_API_URL gesetzt, z. B. https://api.mainhubv1.com,
// wenn die Anzeige von Netlify kommt und die API vom Pi. Leer = derselbe Ursprung wie die Seite
// (das Board liefert die Anzeige selbst aus, oder der Vite-Proxy im Dev-Betrieb).
export const API_URL = (import.meta.env.VITE_API_URL ?? '').replace(/\/+$/, '');

/** Vollständige Adresse eines API-Pfads („/api/anzeige“) */
export const apiUrl = (pfad: string, basis = API_URL) => `${basis}${pfad}`;

/** WebSocket-Adresse für /ws, mit ws/wss passend zur API bzw. zur Seite */
export function wsUrl(query: string, basis = API_URL): string {
  const ziel = basis ? new URL(basis) : location;
  const protokoll = ziel.protocol === 'https:' ? 'wss' : 'ws';
  return `${protokoll}://${ziel.host}/ws${query ? `?${query}` : ''}`;
}
