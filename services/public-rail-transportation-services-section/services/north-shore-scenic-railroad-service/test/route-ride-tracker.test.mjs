import assert from "node:assert/strict";
import test from "node:test";
import { estimateAnticipation, physicalWindowSide, settleRouteRide } from "../src/route-ride-tracker.mjs";

const match = (alongRouteMeters, confidence = "high", extra = {}) => ({ alongRouteMeters, confidence, progress: alongRouteMeters / 10_000, distanceFromRouteMeters: 4, accuracyMeters: 8, ...extra });

test("chainage replay freezes dropout and prevents a backward teleport over 25 m", () => {
  let state = null;
  const settled = [];
  for (const observation of [match(100), match(180), match(171), match(139), match(210), match(500, "low", { distanceFromRouteMeters: 600 }), match(240)]) {
    const result = settleRouteRide(state, observation);
    state = result.state;
    settled.push(result.match.alongRouteMeters);
  }
  assert.deepEqual(settled, [100, 180, 171, 171, 210, 210, 240]);
  assert.equal(state.direction, "outbound");
});

test("manual anchors preview smoothly without corrupting live chainage", () => {
  const live = settleRouteRide(null, match(400));
  const preview = settleRouteRide(live.state, match(8000), { source: "manual" });
  assert.equal(preview.match.alongRouteMeters, 8000);
  assert.strictEqual(preview.state, live.state);
  assert.equal(settleRouteRide(preview.state, match(430)).match.alongRouteMeters, 430);
});

test("direction flips physical side cues", () => {
  assert.equal(physicalWindowSide("lake", "outbound"), "Lake side · right");
  assert.equal(physicalWindowSide("lake", "return"), "Lake side · left");
  assert.equal(physicalWindowSide("land", "return"), "Hillside · right");
});

test("anticipation responds to half and double speed", () => {
  const half = estimateAnticipation(3600, 4);
  const normal = estimateAnticipation(3600, 8);
  const twice = estimateAnticipation(3600, 16);
  assert.ok(half.lowMinutes > normal.lowMinutes);
  assert.ok(twice.lowMinutes < normal.lowMinutes);
});
