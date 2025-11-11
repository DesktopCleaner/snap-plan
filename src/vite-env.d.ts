/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_GOOGLE_CLIENT_ID: string;
  readonly VITE_GEMINI_API_KEY: string;
  readonly VITE_GEMINI_MODEL?: string;
  readonly VITE_AI_PARSE_MODE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

