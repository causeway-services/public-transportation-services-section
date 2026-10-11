export const NORTH_SHORE_WINDOW_ICON = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><rect width="512" height="512" rx="112" fill="#071516"/><path d="M70 348C164 86 326 100 442 194" fill="none" stroke="#79e4c0" stroke-width="48" stroke-linecap="round"/><circle cx="264" cy="270" r="55" fill="#ffd56f" stroke="#fff" stroke-width="20"/></svg>`;

export const NORTH_SHORE_WINDOW_HEADERS = `/*
  Referrer-Policy: strict-origin-when-cross-origin
  X-Content-Type-Options: nosniff
  X-Frame-Options: DENY
  Permissions-Policy: camera=(), microphone=(), geolocation=(self)
  Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; manifest-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'

/service-worker.js
  Cache-Control: no-cache
  Service-Worker-Allowed: /
`;
