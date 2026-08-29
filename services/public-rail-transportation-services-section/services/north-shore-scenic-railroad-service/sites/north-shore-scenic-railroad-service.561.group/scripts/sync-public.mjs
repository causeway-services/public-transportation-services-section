#!/usr/bin/env node
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { projectProgressiveWebAppArtifacts } from "@red-cup-engineering/project-progressive-web-app-artifacts-service";
import {
  projectWebReleaseManifestArtifact,
  verifyWebReleaseDirectory,
} from "@red-cup-engineering/web-release-candidate-service";
import { checkStaticSiteInventory } from "@red-cup-engineering/static-site-conformance-service";
import {
  NORTH_SHORE_WINDOW_HEADERS,
  NORTH_SHORE_WINDOW_ICON,
} from "@causeway-services/north-shore-scenic-railroad-service/assets";
import { NORTH_SHORE_WINDOW_CLIENT } from "@causeway-services/north-shore-scenic-railroad-service/client";
import { NORTH_SHORE_ROUTE } from "@causeway-services/north-shore-scenic-railroad-service/route-data";
import { renderNorthShoreWindow } from "@causeway-services/north-shore-scenic-railroad-service/render";

const siteDirectory = dirname(dirname(fileURLToPath(import.meta.url)));
const publicDirectory = join(siteDirectory, "public");
const baseUrl = "https://north-shore-scenic-railroad-service.561.group/";
const runtimePaths = Object.freeze(["/api/route", "/healthz"]);
const releaseManifestPath = "release-manifest.json";

const record = (body, mediaType, provenance, cacheControl) => Object.freeze({
  body,
  mediaType,
  provenance,
  ...(cacheControl === undefined ? {} : { cacheControl }),
});

function initialArtifacts() {
  return new Map([
    ["index.html", record(renderNorthShoreWindow(), "text/html; charset=utf-8", "north-shore-window:render")],
    ["app.js", record(NORTH_SHORE_WINDOW_CLIENT, "text/javascript; charset=utf-8", "north-shore-window:client")],
    ["icon.svg", record(NORTH_SHORE_WINDOW_ICON, "image/svg+xml", "north-shore-window:assets")],
    ["route.json", record(`${JSON.stringify(NORTH_SHORE_ROUTE)}\n`, "application/json; charset=utf-8", "north-shore-window:route-data")],
    ["_headers", record(NORTH_SHORE_WINDOW_HEADERS, "text/plain; charset=utf-8", "north-shore-window:cloudflare-carrier")],
    ["404.html", record("<!doctype html><title>Not found</title><p>Not found.</p>\n", "text/html; charset=utf-8", "north-shore-window:cloudflare-carrier")],
    ["route-position-projection.mjs", record(readFileSync(fileURLToPath(import.meta.resolve("@red-cup-engineering/route-position-projection-service"))), "text/javascript; charset=utf-8", "route-position-projection-service")],
    ["route-ride-tracker.mjs", record(readFileSync(fileURLToPath(import.meta.resolve("@causeway-services/north-shore-scenic-railroad-service/ride-tracker"))), "text/javascript; charset=utf-8", "north-shore-window:ride-tracker")],
    ["tufte-browser.mjs", record(readFileSync(fileURLToPath(import.meta.resolve("@red-cup-engineering/web-tufte-gui-services-section/browser"))), "text/javascript; charset=utf-8", "web-tufte-gui-services-section")],
  ]);
}

function requireCleanProjection(name, projection) {
  if (projection.diagnostics.length === 0) return projection;
  throw new Error(`${name} projection failed:\n${JSON.stringify(projection.diagnostics, null, 2)}`);
}

/** Materialize and locally verify the deployment carrier's complete static release. */
export async function syncNorthShorePublicAssets() {
  const artifacts = initialArtifacts();
  const pwa = requireCleanProjection("PWA", projectProgressiveWebAppArtifacts({
    artifacts,
    config: {
      manifest: {
        name: "North Shore Window",
        shortName: "Shore Window",
        description: "Independent, private, offline scenic rail ride companion.",
        startUrl: "/",
        display: "standalone",
        backgroundColor: "#061516",
        themeColor: "#061516",
        orientation: "portrait-primary",
        categories: ["travel", "navigation", "education"],
        icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any maskable" }],
      },
      precache: {
        includePaths: ["index.html", "app.js", "tufte-browser.mjs", "route-position-projection.mjs", "route-ride-tracker.mjs", "icon.svg"],
        additionalUrls: ["/api/route"],
      },
      offlineFallback: "/",
    },
  }));
  for (const artifact of pwa.artifacts) artifacts.set(artifact.path, Object.freeze({
    ...artifact,
    provenance: artifact.source,
  }));

  const release = requireCleanProjection("release manifest", projectWebReleaseManifestArtifact({
    artifacts,
    config: {
      path: releaseManifestPath,
      baseUrl,
      profile: "cloudflare-static-assets",
      excludePaths: ["_headers"],
      metadata: { application: "north-shore-window", runtimePaths },
    },
  }));
  for (const artifact of release.artifacts) artifacts.set(artifact.path, Object.freeze({
    ...artifact,
    provenance: artifact.source,
  }));

  const conformance = checkStaticSiteInventory({ artifacts, manifest: release.manifest, runtimePaths });
  if (!conformance.valid) throw new Error(`static conformance failed:\n${JSON.stringify(conformance.diagnostics, null, 2)}`);

  // public/ is an ignored generated overlay; recreate it so stale files cannot
  // silently enter a deployment outside the release manifest.
  rmSync(publicDirectory, { recursive: true, force: true });
  mkdirSync(publicDirectory, { recursive: true });
  for (const [path, artifact] of artifacts) writeFileSync(join(publicDirectory, path), artifact.body);

  const directoryVerification = await verifyWebReleaseDirectory({
    manifest: release.manifest,
    root: publicDirectory,
  });
  if (!directoryVerification.valid) throw new Error(`release directory verification failed:\n${JSON.stringify(directoryVerification.diagnostics, null, 2)}`);

  return Object.freeze({
    publicDirectory,
    files: Object.freeze([...artifacts.keys()].sort()),
    manifest: release.manifest,
    directoryVerification,
    conformance,
  });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const result = await syncNorthShorePublicAssets();
  process.stdout.write(`sync-public: materialized and verified ${result.files.length} assets (${result.manifest.digest})\n`);
}
