/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_MERCHANT_CPI?: string;
  readonly VITE_OAUTH_GOOGLE_CLIENT_ID?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
