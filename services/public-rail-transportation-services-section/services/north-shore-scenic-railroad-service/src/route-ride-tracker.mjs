const validDirection = (value) => value === "outbound" || value === "return" ? value : "unresolved";

/** Settle one noisy route match into rider chainage without backward teleports. */
export function settleRouteRide(previous, observed, options = {}) {
  if (!observed || !Number.isFinite(observed.alongRouteMeters)) throw new TypeError("one projected route observation is required");
  const before = previous && typeof previous === "object" ? previous : Object.freeze({ match: null, anchorMeters: null, direction: "unresolved" });
  const source = options.source === "manual" ? "manual" : "location";
  if (source === "manual") return Object.freeze({ state: before, match: observed, direction: validDirection(before.direction), frozen: false, reason: "manual-preview" });
  if (observed.confidence === "low" && before.match) {
    const match = Object.freeze({ ...before.match, confidence: "low", distanceFromRouteMeters: observed.distanceFromRouteMeters, accuracyMeters: observed.accuracyMeters });
    return Object.freeze({ state: before, match, direction: validDirection(before.direction), frozen: true, reason: "low-confidence" });
  }
  let direction = validDirection(before.direction);
  let anchorMeters = before.anchorMeters ?? observed.alongRouteMeters;
  const anchorMotion = observed.alongRouteMeters - anchorMeters;
  if (Math.abs(anchorMotion) >= 75) {
    direction = anchorMotion > 0 ? "outbound" : "return";
    anchorMeters = observed.alongRouteMeters;
  }
  if (before.match && direction !== "unresolved") {
    const delta = observed.alongRouteMeters - before.match.alongRouteMeters;
    const contrary = direction === "outbound" ? delta < -25 : delta > 25;
    if (contrary) return Object.freeze({ state: before, match: Object.freeze({ ...before.match, confidence: "medium" }), direction, frozen: true, reason: "contrary-teleport" });
  }
  const state = Object.freeze({ match: observed, anchorMeters, direction });
  return Object.freeze({ state, match: observed, direction, frozen: false, reason: "accepted" });
}

/** Translate a geographic side into the rider's physical window side. */
export function physicalWindowSide(side, direction = "unresolved") {
  if (side === "center") return "Both sides";
  const returning = direction === "return";
  const leftRight = side === "lake" ? (returning ? "left" : "right") : (returning ? "right" : "left");
  return `${side === "lake" ? "Lake side" : "Hillside"} · ${leftRight}`;
}

/** Bound the existing distance/speed anticipation readout. */
export function estimateAnticipation(distanceMeters, speedMetersPerSecond) {
  const distance = Math.max(0, Number(distanceMeters) || 0);
  const speed = Math.max(3, Number(speedMetersPerSecond) || 8);
  const lowMinutes = Math.max(1, Math.floor(distance / (speed * 75)));
  const highMinutes = Math.max(lowMinutes + 1, Math.ceil(distance / (speed * 45)));
  return Object.freeze({ lowMinutes, highMinutes });
}
