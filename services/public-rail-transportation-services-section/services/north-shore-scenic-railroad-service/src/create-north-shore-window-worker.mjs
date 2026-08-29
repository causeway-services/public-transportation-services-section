import { NORTH_SHORE_ROUTE } from "./north-shore-route-data.mjs";

const headers = {
  "cache-control": "public, max-age=300, stale-while-revalidate=86400",
  "referrer-policy": "strict-origin-when-cross-origin",
  "x-content-type-options": "nosniff",
  "x-frame-options": "DENY",
  "permissions-policy": "camera=(), microphone=(), geolocation=(self)",
  "content-security-policy": "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; manifest-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'"
};

const routeDocument = JSON.stringify(NORTH_SHORE_ROUTE);

const respond = (body, contentType, status = 200, extraHeaders = {}) => new Response(body, { status, headers: { ...headers, "content-type": contentType, ...extraHeaders } });

/** Create the provider-neutral Fetch worker for the complete public service. */
export function createNorthShoreWindowWorker() {
  return {
    async fetch(request, env = {}) {
      const url = new URL(request.url);
      if (request.method !== "GET" && request.method !== "HEAD") return respond(JSON.stringify({error:"method not allowed"}), "application/json; charset=utf-8", 405, {allow:"GET, HEAD"});
      let response;
      if (url.pathname === "/api/route") response = respond(routeDocument, "application/json; charset=utf-8");
      else if (url.pathname === "/healthz") response = respond(JSON.stringify({ok:true,service:"north-shore-window",unofficial:true}), "application/json; charset=utf-8", 200, {"cache-control":"no-store"});
      else if (env.ASSETS?.fetch) return env.ASSETS.fetch(request);
      else response = respond("Not found", "text/plain; charset=utf-8", 404);
      if (request.method === "HEAD") return new Response(null, { status: response.status, headers: response.headers });
      return response;
    }
  };
}
