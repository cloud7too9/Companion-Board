// Signierte Tokens (HMAC-SHA256 mit dem Schlüssel aus geheim.txt): Inhalt als base64url-JSON, dahinter die Signatur.
// `zweck` trennt die Arten (Konto-Token, Ticket, Anzeige-Token): ein Token der einen Art gilt nie als eins der anderen.
// Konto-Tokens haben keinen Zweck (so waren sie schon vor dem Bauplan „Anmeldung“ signiert).
import { createHmac, timingSafeEqual } from 'node:crypto';

export function signierer(geheim, zweck = '') {
  const signieren = (teil) => createHmac('sha256', geheim).update(zweck ? `${zweck}|${teil}` : teil).digest('base64url');
  return {
    erstellen(inhalt) {
      const teil = Buffer.from(JSON.stringify(inhalt)).toString('base64url');
      return `${teil}.${signieren(teil)}`;
    },
    /** → Inhalt oder null (fremd, verändert, kein Token) */
    lesen(token) {
      if (typeof token !== 'string' || !token.includes('.')) return null;
      const [teil, signatur] = token.split('.');
      const erwartet = Buffer.from(signieren(teil));
      const erhalten = Buffer.from(signatur ?? '');
      if (erwartet.length !== erhalten.length || !timingSafeEqual(erwartet, erhalten)) return null;
      try {
        return JSON.parse(Buffer.from(teil, 'base64url').toString('utf8'));
      } catch {
        return null;
      }
    },
  };
}
