export const NORTH_SHORE_WINDOW_CLIENT = String.raw`import { projectRoutePosition } from "/north-shore-route-position.mjs";
import { connectTufteDocument } from "/tufte-browser.mjs";
import { estimateAnticipation, physicalWindowSide, settleRouteRide } from "/route-ride-tracker.mjs";

const byId = (id) => document.getElementById(id);
const metersToText = (meters) => meters < 120 ? "now" : meters < 1000 ? Math.round(meters / 50) * 50 + " m" : (meters / 1609.344).toFixed(1) + " mi";
const loadLocal = (key) => { try { return JSON.parse(localStorage.getItem(key) || "[]"); } catch { return []; } };
const saveLocal = (key, value) => { try { localStorage.setItem(key, JSON.stringify(value)); } catch {} };
const state = { route: null, points: [], routeMeasures: [], lastMatch: null, rideState: null, direction: "unresolved", trace: loadLocal("north-shore-window.trace"), bookmarks: loadLocal("north-shore-window.bookmarks"), voice: false, announced: null, watching: false, watchId: null, wakeLock: null, lastTraceAt: 0, lastTraceMeasure: null };

function pointAtProgress(progress) {
  const route = state.route.coordinates;
  const target = Math.max(0, Math.min(1, progress)) * state.routeMeasures.at(-1);
  let index = state.routeMeasures.findIndex((measure) => measure >= target) - 1;
  index = Math.max(0, Math.min(route.length - 2, index));
  const start = state.routeMeasures[index];
  const end = state.routeMeasures[index + 1];
  const fraction = end === start ? 0 : (target - start) / (end - start);
  return [route[index][0] + (route[index + 1][0] - route[index][0]) * fraction, route[index][1] + (route[index + 1][1] - route[index][1]) * fraction];
}

function mapPoint(coordinate) {
  const box = state.route.box;
  return { x: 28 + (coordinate[0] - box.minLon) / (box.maxLon - box.minLon) * 944, y: 272 - (coordinate[1] - box.minLat) / (box.maxLat - box.minLat) * 244 };
}

function renderMap() {
  const coordinates = state.route.coordinates;
  const lons = coordinates.map((point) => point[0]);
  const lats = coordinates.map((point) => point[1]);
  state.route.box = { minLon: Math.min(...lons), maxLon: Math.max(...lons), minLat: Math.min(...lats), maxLat: Math.max(...lats) };
  const points = coordinates.map(mapPoint).map((point) => point.x.toFixed(1) + "," + point.y.toFixed(1)).join(" ");
  byId("route-shadow").setAttribute("points", points);
  byId("route-line").setAttribute("points", points);
  const layer = byId("poi-layer");
  state.points.forEach((poi) => {
    const point = mapPoint(poi.coordinate);
    const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    circle.setAttribute("class", "poi-dot"); circle.setAttribute("cx", point.x); circle.setAttribute("cy", point.y); circle.setAttribute("r", "5");
    const title = document.createElementNS("http://www.w3.org/2000/svg", "title"); title.textContent = poi.name; circle.append(title); layer.append(circle);
  });
}

function physicalSideLabel(side) {
  return physicalWindowSide(side, state.direction);
}

function selectNext(match) {
  const returnTrip = state.direction === "return";
  const candidates = state.points.filter((point) => returnTrip ? point.measure < match.alongRouteMeters - 40 : point.measure > match.alongRouteMeters + 40);
  candidates.sort((a, b) => returnTrip ? b.measure - a.measure : a.measure - b.measure);
  return candidates[0] || (returnTrip ? state.points[0] : state.points[state.points.length - 1]);
}

function renderTimeline(next) {
  const timeline = byId("timeline");
  timeline.textContent = "";
  const ordered = state.direction === "return" ? [...state.points].reverse() : state.points;
  ordered.forEach((point) => {
    const button = document.createElement("button"); button.type = "button"; button.className = "moment";
    if (point.id === next.id) button.classList.add("next");
    const passed = state.direction === "return" ? point.measure > state.lastMatch.alongRouteMeters : point.measure < state.lastMatch.alongRouteMeters;
    if (passed) button.classList.add("past");
    const mark = document.createElement("i"); mark.className = "mark";
    const label = document.createElement("span"); const strong = document.createElement("strong"); strong.textContent = point.name; const small = document.createElement("small"); small.textContent = point.eyebrow; label.append(strong, document.createElement("br"), small);
    const distance = document.createElement("small"); distance.textContent = metersToText(Math.abs(point.measure - state.lastMatch.alongRouteMeters));
    button.append(mark, label, distance);
    button.addEventListener("click", () => showPoint(point));
    timeline.append(button);
  });
}

function showPoint(point) {
  byId("next-tile").querySelector("h2").textContent = point.name;
  byId("next-story").textContent = point.story;
  const source = byId("next-source"); source.textContent = "Source: "; const link = document.createElement("a"); link.href = point.sourceUrl; link.target = "_blank"; link.rel = "noreferrer"; link.textContent = point.sourceName; source.append(link);
  const side = byId("next-side"); side.dataset.side = point.side; side.textContent = physicalSideLabel(point.side);
}

function update(match, options = {}) {
  const settlement = settleRouteRide(state.rideState, match, options);
  state.rideState = settlement.state;
  state.direction = settlement.direction;
  match = settlement.match;
  state.lastMatch = match;
  const progress = Math.round(match.progress * 100);
  byId("progress-readout").textContent = progress + "%";
  byId("progress-unit").textContent = "along modeled corridor";
  byId("progress-bar").style.width = progress + "%";
  byId("manual-progress").value = Math.round(match.progress * 1000);
  byId("confidence").textContent = match.confidence + " match";
  byId("confidence").closest(".tufte-tile").dataset.confidence = match.confidence;
  byId("position-copy").textContent = match.confidence === "low" ? "GPS is too far from the modeled track to predict safely. Cues are frozen until the match improves." : "Matched about " + metersToText(match.alongRouteMeters) + " from the route origin, ±" + Math.round(match.accuracyMeters) + " m device accuracy.";
  byId("direction-label").textContent = state.direction === "return" ? "Return toward Duluth" : state.direction === "outbound" ? "Outbound toward Northwoods" : "Direction resolving";
  const dot = byId("train-dot"); const mapped = mapPoint([match.longitude, match.latitude]); dot.setAttribute("cx", mapped.x); dot.setAttribute("cy", mapped.y); dot.hidden = false;
  if (match.confidence === "low") { byId("next-distance").textContent = "Predictions paused · " + metersToText(match.distanceFromRouteMeters) + " from route"; return match; }
  const next = selectNext(match); const distance = Math.abs(next.measure - match.alongRouteMeters); showPoint(next);
  const { lowMinutes, highMinutes } = estimateAnticipation(distance, options.speed);
  byId("next-distance").textContent = distance < 120 ? "Look now" : metersToText(distance) + " · roughly " + lowMinutes + "–" + highMinutes + " min at current pace";
  renderTimeline(next);
  if (state.voice && state.announced !== next.id && distance < 650) { state.announced = next.id; const utterance = new SpeechSynthesisUtterance(next.name + ". " + physicalSideLabel(next.side) + ". " + next.story); utterance.rate = 0.92; speechSynthesis.cancel(); speechSynthesis.speak(utterance); if (navigator.vibrate) navigator.vibrate(80); }
  return match;
}

function recordPosition(position) {
  const observation = { latitude: position.coords.latitude, longitude: position.coords.longitude, accuracy: position.coords.accuracy };
  const match = update(projectRoutePosition(observation, state.route.coordinates), { speed: position.coords.speed });
  const moved = state.lastTraceMeasure == null ? Infinity : Math.abs(match.alongRouteMeters - state.lastTraceMeasure);
  if (!state.lastTraceAt || position.timestamp - state.lastTraceAt >= 10000 || moved >= 50) {
    state.trace.push({ type: "Feature", geometry: { type: "Point", coordinates: [observation.longitude, observation.latitude] }, properties: { observedAt: new Date(position.timestamp).toISOString(), accuracy: observation.accuracy, routeProgress: match.progress, routeConfidence: match.confidence } });
    if (state.trace.length > 3000) state.trace.shift();
    state.lastTraceAt = position.timestamp; state.lastTraceMeasure = match.alongRouteMeters;
    saveLocal("north-shore-window.trace", state.trace); renderMemory();
  }
}

function startRide() {
  if (!navigator.geolocation) { byId("location-status").textContent = "This browser does not provide geolocation"; return; }
  byId("start-ride").disabled = true; byId("location-status").textContent = "Requesting location…";
  if (state.watchId != null) navigator.geolocation.clearWatch(state.watchId);
  state.watchId = navigator.geolocation.watchPosition((position) => { state.watching = true; byId("location-pulse").classList.add("live"); byId("location-status").textContent = "Live on this device · " + new Date(position.timestamp).toLocaleTimeString([], {hour:"numeric",minute:"2-digit"}); byId("check-location").classList.add("ready"); byId("check-location").textContent = "Location live"; recordPosition(position); }, (error) => { if (state.watchId != null) navigator.geolocation.clearWatch(state.watchId); state.watchId = null; state.watching = false; byId("location-pulse").classList.remove("live"); byId("start-ride").disabled = false; byId("location-status").textContent = "Location unavailable: " + error.message; byId("confidence").textContent = "manual available"; }, { enableHighAccuracy: true, maximumAge: 3000, timeout: 15000 });
}

function renderMemory() { byId("trace-count").textContent = state.trace.length; byId("bookmark-count").textContent = state.bookmarks.length; }
function bookmark() { if (!state.lastMatch) return; state.bookmarks.push({ observedAt: new Date().toISOString(), progress: state.lastMatch.progress, direction: state.direction }); saveLocal("north-shore-window.bookmarks", state.bookmarks); renderMemory(); byId("bookmark").textContent = "Moment saved"; setTimeout(() => byId("bookmark").textContent = "Save this moment", 1400); }
function exportTrip() { const data = { type:"FeatureCollection", features: state.trace, properties:{ application:"North Shore Window", unofficial:true, exportedAt:new Date().toISOString(), bookmarks:state.bookmarks } }; const link = document.createElement("a"); link.href = URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:"application/geo+json"})); link.download = "north-shore-window-trip.geojson"; link.click(); setTimeout(() => URL.revokeObjectURL(link.href), 1000); }
function clearTrip() { if (!confirm("Clear the trip trace and saved moments from this device?")) return; state.trace=[]; state.bookmarks=[]; saveLocal("north-shore-window.trace",[]); saveLocal("north-shore-window.bookmarks",[]); renderMemory(); }

async function initialize() {
  connectTufteDocument();
  state.route = await fetch("/api/route").then((response) => response.json());
  state.routeMeasures = state.route.coordinates.map((coordinate) => projectRoutePosition({ latitude:coordinate[1], longitude:coordinate[0], accuracy:0 }, state.route.coordinates).alongRouteMeters);
  state.points = state.route.points.map((point) => ({ ...point, measure: projectRoutePosition({ latitude:point.coordinate[1], longitude:point.coordinate[0], accuracy:0 }, state.route.coordinates).alongRouteMeters }));
  renderMap(); renderMemory();
  const initial = projectRoutePosition({ latitude:state.route.coordinates[0][1], longitude:state.route.coordinates[0][0], accuracy:0 }, state.route.coordinates); update(initial); byId("progress-readout").textContent = "Ready"; byId("progress-unit").textContent = "for departure";
  byId("check-privacy").classList.add("ready"); byId("check-privacy").textContent = "On-device only";
  if (!("speechSynthesis" in window) || !("SpeechSynthesisUtterance" in window)) { byId("voice-toggle").disabled = true; byId("voice-toggle").textContent = "Narration unavailable"; }
  if ("serviceWorker" in navigator) { try { await navigator.serviceWorker.register("/service-worker.js"); await navigator.serviceWorker.ready; byId("check-shell").classList.add("ready"); byId("check-shell").textContent = "Offline ready"; } catch { byId("check-shell").textContent = "Offline unavailable"; } }
}

byId("start-ride").addEventListener("click", startRide); byId("bookmark").addEventListener("click", bookmark); byId("export-trip").addEventListener("click", exportTrip); byId("clear-trip").addEventListener("click", clearTrip);
byId("manual-use").addEventListener("click", () => { const progress = Number(byId("manual-progress").value)/1000; const coordinate = pointAtProgress(progress); const match = projectRoutePosition({ latitude:coordinate[1], longitude:coordinate[0], accuracy:0 }, state.route.coordinates); update(match, { source: "manual" }); byId("location-status").textContent = "Manual preview · no location recorded"; });
byId("voice-toggle").addEventListener("click", () => { state.voice=!state.voice; byId("voice-toggle").setAttribute("aria-pressed", String(state.voice)); byId("voice-toggle").textContent = state.voice ? "Narration on" : "Narration off"; if (!state.voice) speechSynthesis.cancel(); });
document.querySelectorAll("[data-mode]").forEach((button) => button.addEventListener("click", () => { document.body.dataset.mode=button.dataset.mode; document.querySelectorAll("[data-mode]").forEach((other) => other.setAttribute("aria-pressed", String(other===button))); }));
byId("wake-lock").addEventListener("click", async () => { try { state.wakeLock = await navigator.wakeLock.request("screen"); byId("check-power").classList.add("ready"); byId("check-power").textContent="Screen awake"; byId("wake-lock").textContent="Screen will stay awake"; } catch { byId("check-power").textContent="Wake lock unavailable"; } });
initialize().catch((error) => { byId("location-status").textContent = "App data unavailable: " + error.message; });
`;
