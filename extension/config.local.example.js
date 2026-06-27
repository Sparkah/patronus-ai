// Template. Copy this to config.local.js (which is gitignored) and fill in your keys
// for a zero-setup local run. The popup's key fields override whatever is here.
self.__PATRONUS_DEFAULTS = {
  GEMINI_API_KEY: "",          // https://goo.gle/hackathon-account  (or aistudio.google.com/api-keys)
  GEMINI_MODEL: "gemini-2.5-flash",
  SLNG_API_KEY: "",            // https://app.slng.ai  -> API Keys
  TAVILY_API_KEY: "",          // https://tavily.com
  MUBIT_API_KEY: "",           // https://console.mubit.ai  (Minima model routing)
  N8N_WEBHOOK_URL: "",         // n8n: a Webhook-trigger workflow's Production URL
  SUPERLINKED_URL: "",         // Superlinked: cluster endpoint base
  SUPERLINKED_TOKEN: ""        // Superlinked: API key
};
