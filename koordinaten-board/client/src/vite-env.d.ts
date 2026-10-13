/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Adresse der API beim Bauen (Umbau Phase 2), z. B. https://api.mainhubv1.com; leer = eigener Ursprung */
  readonly VITE_API_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
