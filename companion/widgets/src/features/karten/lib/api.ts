// Adresse der API (Umbau Phase 2). Beim Bauen über VITE_API_URL gesetzt, z. B. https://api.mainhubv1.com,
// wenn das Dashboard von Netlify kommt und die API vom Pi. Leer = derselbe Ursprung wie die Seite
// (das Board liefert /dashboard selbst aus, oder der Vite-Proxy im Dev-Betrieb).
export const API_URL = (import.meta.env.VITE_API_URL ?? "").replace(/\/+$/, "");

/** Vollständige Adresse eines API-Pfads, optional mit Query-Parametern */
export function apiUrl(pfad: string, parameter: Record<string, string> = {}, basis = API_URL): string {
  const q = new URLSearchParams(parameter).toString();
  return `${basis}${pfad}${q ? `?${q}` : ""}`;
}

/** WebSocket-Adresse für /ws, mit ws/wss passend zur API bzw. zur Seite */
export function wsUrl(parameter: Record<string, string> = {}, basis = API_URL): string {
  const ziel = basis ? new URL(basis) : location;
  const protokoll = ziel.protocol === "https:" ? "wss:" : "ws:";
  return apiUrl("/ws", parameter, `${protokoll}//${ziel.host}`);
}
