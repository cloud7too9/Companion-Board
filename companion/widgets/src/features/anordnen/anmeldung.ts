// Anmeldung beim Anordnen: Die Anmeldeseite (/) legt die Verbindung der Companion (/app/) ab
// (Board-Adresse, Token des Geräts, Name) unter „board.verbindung“. /dashboard liegt auf demselben
// Ursprung, teilt sich also den Speicher – das Handy muss sich nicht noch einmal anmelden.
const SPEICHER = "board.verbindung";

export interface Verbindung {
  token: string;
  name: string;
}

export function verbindungLesen(): Verbindung | null {
  try {
    const v = JSON.parse(localStorage.getItem(SPEICHER) ?? "null");
    return v && typeof v.token === "string" && v.token ? { token: v.token, name: String(v.name ?? "") } : null;
  } catch {
    return null;
  }
}
