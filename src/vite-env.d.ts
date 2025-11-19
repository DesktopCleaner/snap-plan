/// <reference types="vite/client" />

interface ImportMetaEnv {
  // Backend URL (optional, defaults to http://localhost:3001)
  readonly VITE_BACKEND_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

