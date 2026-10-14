import { Component, useEffect, type ReactNode } from "react";

interface Props {
  children: ReactNode;
  /** Was statt des Inhalts erscheint, wenn er abstürzt */
  ersatz: ReactNode;
  /** Ändert sich der Schlüssel (z. B. neue Karte vom Board), wird es erneut versucht */
  neuVersuchen?: unknown;
}

/**
 * Fängt Fehler beim Rendern ab, damit ein kaputtes Widget nicht die ganze Anzeige mitnimmt –
 * am Fernseher bliebe sonst eine weiße Seite stehen, bis jemand neu lädt.
 */
export class Fehlergrenze extends Component<Props, { fehler: boolean; schluessel: unknown }> {
  state = { fehler: false, schluessel: this.props.neuVersuchen };

  static getDerivedStateFromError() {
    return { fehler: true };
  }

  static getDerivedStateFromProps(props: Props, state: { fehler: boolean; schluessel: unknown }) {
    return props.neuVersuchen !== state.schluessel ? { fehler: false, schluessel: props.neuVersuchen } : null;
  }

  componentDidCatch(fehler: unknown) {
    console.error("Widget abgestürzt:", fehler);
  }

  render() {
    return this.state.fehler ? this.props.ersatz : this.props.children;
  }
}

/** Ganze Seite abgestürzt: Hinweis und nach 30 Sekunden selbst neu laden (der Fernseher hat niemanden, der klickt) */
export function SeiteAbgestuerzt() {
  useEffect(() => {
    const t = setTimeout(() => location.reload(), 30_000);
    return () => clearTimeout(t);
  }, []);
  return (
    <div className="flex h-full items-center justify-center p-6 text-center text-text-muted" data-testid="abgestuerzt">
      <p>Da ist etwas schiefgegangen. Die Seite lädt in 30 Sekunden neu.</p>
    </div>
  );
}

/** Ersatz für ein abgestürztes Widget; mit der nächsten Karte vom Board wird es erneut versucht */
export const WIDGET_FEHLER = (
  <p className="flex h-full items-center justify-center text-center text-sm text-text-muted" data-testid="widget-fehler">
    Dieses Widget konnte nicht angezeigt werden
  </p>
);
