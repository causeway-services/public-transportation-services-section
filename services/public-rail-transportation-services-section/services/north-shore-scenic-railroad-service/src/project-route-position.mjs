/** Match one device location to the North Shore Window's modeled rail route. */
export function projectRoutePosition(observation, route) {
  if (!observation || !Number.isFinite(Number(observation.latitude)) || !Number.isFinite(Number(observation.longitude))) {
    throw new TypeError("observation must contain finite latitude and longitude");
  }
  if (!Array.isArray(route) || route.length < 2 || route.some((point) => !Array.isArray(point) || point.length < 2 || !point.every(Number.isFinite))) {
    throw new TypeError("route must contain at least two finite [longitude, latitude] coordinates");
  }

  const radius = 6371008.8;
  const radians = Math.PI / 180;
  const originLatitude = Number(observation.latitude) * radians;
  const scaleX = radius * Math.cos(originLatitude) * radians;
  const scaleY = radius * radians;
  const pointX = Number(observation.longitude) * scaleX;
  const pointY = Number(observation.latitude) * scaleY;
  const lengths = [];
  let routeLengthMeters = 0;
  for (let index = 0; index < route.length - 1; index += 1) {
    const dx = (route[index + 1][0] - route[index][0]) * scaleX;
    const dy = (route[index + 1][1] - route[index][1]) * scaleY;
    const length = Math.hypot(dx, dy);
    lengths.push(length);
    routeLengthMeters += length;
  }

  let best;
  let beforeMeters = 0;
  for (let index = 0; index < route.length - 1; index += 1) {
    const startX = route[index][0] * scaleX;
    const startY = route[index][1] * scaleY;
    const dx = (route[index + 1][0] - route[index][0]) * scaleX;
    const dy = (route[index + 1][1] - route[index][1]) * scaleY;
    const squaredLength = dx * dx + dy * dy;
    const segmentFraction = squaredLength === 0 ? 0 : Math.max(0, Math.min(1, ((pointX - startX) * dx + (pointY - startY) * dy) / squaredLength));
    const projectedX = startX + segmentFraction * dx;
    const projectedY = startY + segmentFraction * dy;
    const distanceFromRouteMeters = Math.hypot(pointX - projectedX, pointY - projectedY);
    if (!best || distanceFromRouteMeters < best.distanceFromRouteMeters) {
      const longitude = route[index][0] + segmentFraction * (route[index + 1][0] - route[index][0]);
      const latitude = route[index][1] + segmentFraction * (route[index + 1][1] - route[index][1]);
      const bearingDegrees = (Math.atan2(dx, dy) / radians + 360) % 360;
      best = { index, segmentFraction, longitude, latitude, bearingDegrees, distanceFromRouteMeters, alongRouteMeters: beforeMeters + segmentFraction * lengths[index] };
    }
    beforeMeters += lengths[index];
  }

  const accuracyMeters = Math.max(0, Number(observation.accuracy) || 0);
  const confidence = best.distanceFromRouteMeters <= 35 && accuracyMeters <= 40
    ? "high"
    : best.distanceFromRouteMeters <= 150 && accuracyMeters <= 250
      ? "medium"
      : "low";
  const progress = routeLengthMeters ? best.alongRouteMeters / routeLengthMeters : 0;
  return Object.freeze({
    ...best,
    routeLengthMeters,
    remainingRouteMeters: Math.max(0, routeLengthMeters - best.alongRouteMeters),
    progress,
    accuracyMeters,
    confidence
  });
}
