import assert from "node:assert/strict";
import test from "node:test";
import { createNorthShoreWindowWorker } from "../src/create-north-shore-window-worker.mjs";
import { NORTH_SHORE_ROUTE } from "../src/north-shore-route-data.mjs";
import { renderNorthShoreWindow } from "../src/render-north-shore-window.mjs";

test("route pack is ordered, sourced, and substantial", () => {
  assert.ok(NORTH_SHORE_ROUTE.coordinates.length > 40);
  assert.ok(NORTH_SHORE_ROUTE.points.length >= 10);
  assert.ok(NORTH_SHORE_ROUTE.points.every((point) => point.sourceUrl && point.story && point.coordinate.length === 2));
});

test("document states independent status and supports the ride controls", () => {
  const html = renderNorthShoreWindow();
  assert.match(html, /Independent & unofficial/);
  assert.match(html, /Start ride/);
  assert.match(html, /Export GeoJSON/);
  assert.match(html, /manifest\.webmanifest/);
  assert.doesNotMatch(html, /North Shore Scenic Railroad[^<]{0,40}(official app|operated by us)/i);
});

test("worker serves dynamic route and health surfaces", async () => {
  const worker = createNorthShoreWindowWorker();
  for (const [path, type] of [["/api/route","application/json"],["/healthz","application/json"]]) {
    const response = await worker.fetch(new Request(`https://example.test${path}`));
    assert.equal(response.status, 200, path);
    assert.match(response.headers.get("content-type"), new RegExp(type.replace("+", "\\+")), path);
    assert.ok((await response.text()).length > 5, path);
  }
});

test("HEAD preserves dynamic status and headers without a body", async () => {
  const response = await createNorthShoreWindowWorker().fetch(new Request("https://example.test/api/route", { method: "HEAD" }));
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type"), /application\/json/);
  assert.equal(await response.text(), "");
});

test("worker delegates static browser requests to the deployment asset binding", async () => {
  const seen = [];
  const response = await createNorthShoreWindowWorker().fetch(new Request("https://example.test/app.js"), { ASSETS: { fetch(request) { seen.push(new URL(request.url).pathname); return new Response("asset"); } } });
  assert.equal(await response.text(), "asset");
  assert.deepEqual(seen, ["/app.js"]);
});

test("worker refuses mutation and unknown routes", async () => {
  const worker = createNorthShoreWindowWorker();
  assert.equal((await worker.fetch(new Request("https://example.test/", {method:"POST"}))).status, 405);
  assert.equal((await worker.fetch(new Request("https://example.test/nope"))).status, 404);
});
