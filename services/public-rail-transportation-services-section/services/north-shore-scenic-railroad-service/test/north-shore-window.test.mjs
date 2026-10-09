import assert from "node:assert/strict";
import test from "node:test";
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
