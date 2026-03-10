// config.js
// Backend connection configuration.
// Update BACKEND_PORT to match your .env BACKEND_PORT value.
// BACKEND_HOST is always 127.0.0.1 for local-only operation.

const CONFIG = {
  BACKEND_HOST: "127.0.0.1",
  BACKEND_PORT: 8000,

  get BASE_URL() {
    return `http://${this.BACKEND_HOST}:${this.BACKEND_PORT}`;
  },

  ENDPOINTS: {
    HEALTH:       "/health",
    EMAIL:        "/email",
    URLS:         "/urls",
    ATTACHMENTS:  "/attachments",
    MANUAL_INPUT: "/manual-input"
  },

  // Maximum text payload size in bytes (100 KB per agent_rules.md rule 7)
  MAX_TEXT_BYTES: 100 * 1024,

  // Maximum body text length in characters (50,000 per gmail_dom_selectors.md)
  MAX_BODY_CHARS: 50000
};
