# north-shore-scenic-railroad-service.561.group

Thin Cloudflare Worker deployment carrier for North Shore Window. All behavior
lives in `@causeway-services/north-shore-scenic-railroad-service`; this directory
owns only provider configuration and the one-line application composition.

`scripts/sync-public.mjs` materializes the service-owned browser artifacts into
the ignored `public/` deployment overlay. It then uses the shared PWA projector
to derive `manifest.webmanifest` and a byte-revisioned service worker, with a
selective precache that includes every browser module and the Worker-owned
`/api/route` bootstrap. The existing HTML manifest discovery and client-side
service-worker registration remain unchanged.

The same step creates `release-manifest.json`, verifies the materialized files
against it, and runs local static-link conformance. `_headers` and the manifest
itself are declared exclusions; `/api/route` and `/healthz` remain explicit
runtime routes rather than static artifacts. Both `npm test` and the
automatic `predeploy` fail before Wrangler runs if these checks fail.

The directory-bound Wrangler profile is still selected by the authentication
service. Provider authority and deployment remain the ordinary `wrangler
deploy`; this package does not perform post-deploy traffic checks.
