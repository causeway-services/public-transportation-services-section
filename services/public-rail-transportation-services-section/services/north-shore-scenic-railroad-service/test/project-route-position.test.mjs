import assert from "node:assert/strict";
import test from "node:test";
import { projectRoutePosition } from "../src/project-route-position.mjs";

const route = [[-92, 46], [-91.99, 46], [-91.98, 46]];

test("projects a GPS observation into North Shore route progress", () => {
  const match = projectRoutePosition({ latitude: 46.0001, longitude: -91.995, accuracy: 5 }, route);
  assert.equal(match.index, 0);
  assert.ok(match.progress > 0.2 && match.progress < 0.3);
  assert.ok(match.distanceFromRouteMeters > 10 && match.distanceFromRouteMeters < 12);
  assert.equal(match.confidence, "high");
  assert.ok(match.bearingDegrees > 80 && match.bearingDegrees < 100);
});

test("freezes a distant or uncertain GPS fix out of the rail-guide prediction path", () => {
  assert.equal(projectRoutePosition({ latitude: 46.01, longitude: -91.995, accuracy: 10 }, route).confidence, "low");
  assert.equal(projectRoutePosition({ latitude: 46.0001, longitude: -91.995, accuracy: 500 }, route).confidence, "low");
});

test("rejects observations and rail-route coordinates that cannot be projected", () => {
  assert.throws(() => projectRoutePosition({}, route), /latitude/);
  assert.throws(() => projectRoutePosition({ latitude: 1, longitude: 2 }, []), /route/);
});
