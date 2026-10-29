#!/usr/bin/env node

import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { appendFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const CONTEXT = "https://www.w3.org/ns/activitystreams";
export const ACTOR = "urn:ame:independent-editorial-assessment";
export const CONTRACT = "independent-editorial-assessment/editorial-assessment/v1";
export const EDITORIAL_TOOLS = Object.freeze(["submit_editorial_acceptance", "submit_revision_request", "submit_editorial_refusal"]);
const FAILURE_LAYERS = Object.freeze(["sources", "assignment", "instructions", "deterministic-gates", "writer-model", "draft-repair", "none"]);
const LISS_ACTOR = "urn:ame:logical-inference-service-section";
const LISS_CONTRACT = "liss-inference-service";
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_LISS_ROOT = resolve(ROOT, "../../../../../red-cup-engineering/services/logical-inference-service-section");
const SIBLING_LISS_ROOT = resolve(ROOT, "../logical-inference-service-section");
const FORBIDDEN_KEYS = new Set(["root", "roots", "path", "paths", "contentDir", "dataDir", "storeDir", "manuscriptPath", "outputPath", "customerFilesystem"]);

function canonical(value) { if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`; if (value !== null && typeof value === "object") return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`; return JSON.stringify(value); }
export function digest(value) { return `sha256:${createHash("sha256").update(canonical(value)).digest("hex")}`; }
function contentId(value) { return `urn:${digest(value)}`; }
function isRecord(value) { return value !== null && typeof value === "object" && !Array.isArray(value); }
function validInstant(value) { return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/u.test(value) && !Number.isNaN(Date.parse(value)); }
function dataRoot() { return resolve(process.env["INDEPENDENT_EDITORIAL_ASSESSMENT_DATA_ROOT"] ?? join(ROOT, "data")); }
function append(kind, value, instant) { const day = instant.slice(0, 10); const [year, month, date] = day.split("-"); const path = join(dataRoot(), "events", year, month, date, `${day}-independent-editorial-assessment-events.jsonl`); mkdirSync(dirname(path), { recursive: true }); appendFileSync(path, `${JSON.stringify({ kind, ...value, recordedAt: instant })}\n`, "utf8"); }
function response(type, source, object, instant) { const body = { actor: ACTOR, type, target: source?.actor ?? "urn:actor:unknown", inReplyTo: source?.id ?? null, object }; return Object.freeze({ "@context": CONTEXT, id: contentId(body), ...body, published: instant }); }
function refusal(source, code, reason, instant, details = {}) { const result = response("Reject", source, Object.freeze({ type: "Refusal", contract: CONTRACT, code, reason, ...details }), instant); append("provider.refusal", { code, reason, activityDigest: digest(source ?? null), responseDigest: digest(result) }, instant); return result; }
function forbidden(value, prefix = "demand") { if (Array.isArray(value)) return value.flatMap((item, index) => forbidden(item, `${prefix}[${index}]`)).at(0); if (!isRecord(value)) return undefined; for (const [key, child] of Object.entries(value)) { if (FORBIDDEN_KEYS.has(key)) return `${prefix}.${key}`; const nested = forbidden(child, `${prefix}.${key}`); if (nested !== undefined) return nested; } return undefined; }
function demandFrom(activity) { const sourceActivity = activity?.object?.sourceActivity; const demand = sourceActivity?.object; return sourceActivity?.type === "Create" && demand?.type === "EditorialAssessmentDemand" ? { sourceActivity, demand } : undefined; }
function validateDemand(demand) {
  const failures = []; const overreach = forbidden(demand); if (overreach !== undefined) failures.push(`customer territory authority is inadmissible at ${overreach}`);
  if (typeof demand?.slug !== "string" || demand.slug.trim() === "") failures.push("slug");
  if (typeof demand?.manuscript?.bytes !== "string" || demand.manuscript.bytes.trim() === "" || demand.manuscript.digest !== digest(demand.manuscript.bytes)) failures.push("manuscript exact bytes and digest");
  if (!isRecord(demand?.editorialContext?.standards) || !Array.isArray(demand?.editorialContext?.evidence) || demand.editorialContext.digest !== digest({ standards: demand.editorialContext.standards, run: demand.editorialContext.run ?? null, evidence: demand.editorialContext.evidence, pipeline: demand.editorialContext.pipeline ?? [] })) failures.push("editorialContext exact digest");
  for (const field of ["publicationPolicyDigest", "genreLawDigest", "editorialDutyDigest"]) if (typeof demand?.authorities?.[field] !== "string" || !demand.authorities[field].startsWith("sha256:")) failures.push(`authorities.${field}`);
  if (!["dry-run", "live"].includes(demand?.executionMode)) failures.push("executionMode");
  if (typeof demand?.model !== "string" || !/sonnet/iu.test(demand.model)) failures.push("model(sonnet)");
  return [...new Set(failures)];
}
export function editorialToolSchema() {
  return Object.freeze({ type: "object", additionalProperties: false, properties: Object.freeze({
    tool: Object.freeze({ type: "string", enum: EDITORIAL_TOOLS }),
    failureLayer: Object.freeze({ type: "string", enum: FAILURE_LAYERS }),
    replayFrom: Object.freeze({ type: "string", minLength: 1, maxLength: 120 }),
    summary: Object.freeze({ type: "string", minLength: 1, maxLength: 2000 }),
    requiredRepairs: Object.freeze({ type: "array", maxItems: 20, items: Object.freeze({ type: "string", minLength: 1, maxLength: 1000 }) }),
    report: Object.freeze({ type: "string", minLength: 500 }),
  }), required: Object.freeze(["tool", "failureLayer", "replayFrom", "summary", "requiredRepairs", "report"]) });
}
function editorialPrompt(demand) {
  return [
    "You hold an independent editorial assessment duty. Do not rewrite the manuscript and do not authorize publication directly. Select exactly one bounded customer tool through the supplied schema and put all substantive judgment in the prose report field.",
    "Select submit_editorial_acceptance only when the deterministic standards reading is clear, every material factual claim is supported by the witnessed evidence, attribution is visible, headline and lede are faithful, and the prose is specific, useful, non-repetitive, and not padded with confident abstraction.",
    "Select submit_revision_request when a bounded repair can make the exact manuscript publishable. Select submit_editorial_refusal when the thesis, assignment, or evidence basis requires replay rather than surface repair.",
    "Diagnose the earliest causal failure layer. Do not blame the writer model for defects compelled by thin sources or an unsupported assignment. Treat historical production gates as provenance, not current truth; the supplied deterministic standards reading governs the current bytes.",
    "The report must explain findings, audit material claims against witnessed evidence, state required repairs, and explain the pipeline diagnosis. Free-form words resembling ACCEPT or REFUSE have no effect; only the validated tool field is actionable.",
    `SLUG\n${demand.slug}`,
    `DETERMINISTIC STANDARDS\n${JSON.stringify(demand.editorialContext.standards)}`,
    `PRODUCTION RUN\n${JSON.stringify(demand.editorialContext.run ?? null)}`,
    `WITNESSED SOURCE AND CLAIM RECORDS\n${JSON.stringify(demand.editorialContext.evidence)}`,
    `OPERATIVE PIPELINE ARTIFACTS\n${JSON.stringify(demand.editorialContext.pipeline ?? [])}`,
    `MANUSCRIPT\n${demand.manuscript.bytes}`,
  ].join("\n\n");
}
function lissRoot() { return resolve(process.env["EDITORIAL_ASSESSMENT_LISS_ROOT"] ?? (existsSync(join(SIBLING_LISS_ROOT, "package.json")) ? SIBLING_LISS_ROOT : DEFAULT_LISS_ROOT)); }
function endpoint(root, operation) { const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8")); const path = pkg.bin?.[operation]; if (typeof path !== "string") throw new Error(`LISS does not advertise ${operation}`); return resolve(root, path); }
function invokeLiss(operation, activity, instant, timeout) { const root = lissRoot(); const temp = mkdtempSync(join(tmpdir(), "editorial-assessment-liss-")); const inputPath = join(temp, "input.json"); const outputPath = join(temp, "output.json"); try { writeFileSync(inputPath, `${JSON.stringify(activity)}\n`, "utf8"); const execution = spawnSync(process.execPath, [endpoint(root, operation), "--operation", operation, "--now", instant, "--input-file", inputPath, "--output-file", outputPath], { cwd: root, encoding: "utf8", timeout, env: process.env }); let output; try { output = JSON.parse(readFileSync(outputPath, "utf8")); } catch { throw new Error(execution.error?.message || execution.stderr || execution.stdout || `LISS ${operation} exited ${execution.status}`); } return output; } finally { rmSync(temp, { recursive: true, force: true }); } }
function lissSolicitation(demand, customerSource) {
  const request = Object.freeze({ type: "RoutedInferenceRequest", executionMode: demand.executionMode, messages: Object.freeze([{ role: "user", content: editorialPrompt(demand) }]), admissibleTiers: Object.freeze(["leader-claude"]), models: Object.freeze({ "leader-claude": demand.model }), sufficiency: Object.freeze([{ type: "min-chars", value: 500 }]), maxTokens: 6000, outputSchema: editorialToolSchema() });
  const sourceObject = Object.freeze({ type: "Note", content: `Independently assess exact manuscript ${demand.slug} and select one bounded editorial tool.`, attachment: Object.freeze([request]) });
  const source = Object.freeze({ "@context": CONTEXT, id: contentId({ customerSource: customerSource.id, sourceObject }), type: "Create", actor: ACTOR, target: LISS_ACTOR, object: sourceObject });
  const object = Object.freeze({ type: "ServiceSolicitation", demand: contentId({ customerSource: customerSource.id, request: digest(request) }), sourceActivity: source, requestedEvidence: Object.freeze(["provider-authored-contract", "provider-validated-tool-selection", "provider-owned-result"]) });
  return Object.freeze({ "@context": CONTEXT, id: contentId({ actor: ACTOR, target: LISS_ACTOR, object }), type: "Offer", actor: ACTOR, target: LISS_ACTOR, object });
}
function lissContract(solicitation, offer) { const allowedActions = Object.freeze(["invoke-service", ...(offer.object.effects ?? [])]); const capability = Object.freeze({ id: contentId({ solicitation: solicitation.id, offer: offer.id, allowedActions }), type: "Capability", issuer: ACTOR, holder: LISS_ACTOR, invocationTarget: LISS_ACTOR, parentOffer: offer.id, allowedActions, attenuation: Object.freeze({ sourceActivity: offer.object.sourceActivity, requestDigest: offer.object.requestDigest, providerScope: offer.object.scope, customerTerritoryMutation: false }), capTP: Object.freeze({ target: LISS_ACTOR, method: "invoke-service" }) }); const object = Object.freeze({ type: "ServiceContract", contract: LISS_CONTRACT, demand: solicitation.object.demand, offer, capability }); return Object.freeze({ "@context": CONTEXT, id: contentId({ actor: ACTOR, target: LISS_ACTOR, object }), type: "Accept", actor: ACTOR, target: LISS_ACTOR, inReplyTo: offer.id, object }); }

export function solicitEditorialAssessment(activity, instant = new Date().toISOString()) {
  if (!validInstant(instant)) throw new Error(`explicit UTC instant required: ${instant}`);
  if (activity?.["@context"] !== CONTEXT || activity?.type !== "Offer" || activity?.target !== ACTOR || activity?.object?.type !== "ServiceSolicitation") return refusal(activity, "wrong-boundary", "solicitation must be an ActivityStreams Offer<ServiceSolicitation> addressed to Independent Editorial Assessment", instant);
  const found = demandFrom(activity); if (found === undefined) return refusal(activity, "unrecognized-demand", "source activity must create one EditorialAssessmentDemand", instant);
  const failures = validateDemand(found.demand); if (failures.length > 0) return refusal(activity, "inadmissible-demand", `editorial assessment demand is incomplete or over-authorized: ${failures.join(", ")}`, instant, { failures });
  const childSolicitation = lissSolicitation(found.demand, found.sourceActivity); let lissOffer;
  try { lissOffer = invokeLiss("solicit-service", childSolicitation, instant, 30_000); } catch (error) { return refusal(activity, "liss-unavailable", error instanceof Error ? error.message : String(error), instant); }
  if (lissOffer?.type !== "Offer" || lissOffer?.actor !== LISS_ACTOR) return refusal(activity, "liss-route-refused", "LISS did not offer the schema-bound Sonnet route", instant, { providerResult: lissOffer });
  const demandDigest = digest(found.demand); const effects = Object.freeze([...(lissOffer.object.effects ?? [])]);
  const object = Object.freeze({ type: "ExecutableServiceOffer", service: "assess-manuscript", contract: CONTRACT, sourceActivity: found.sourceActivity, demandDigest, operation: "invoke-service", scope: Object.freeze({ lissRequestDigest: lissOffer.object.requestDigest, lissRoute: lissOffer.object.scope, toolSchemaDigest: digest(editorialToolSchema()) }), effects, requirements: Object.freeze(effects.map((effect) => Object.freeze({ type: "ResourceGrant", effect }))), childSolicitation, lissOffer, price: Object.freeze({ amount: 0, currency: "USD" }) });
  const offer = response("Offer", activity, object, instant); append("provider.offer", { offerId: offer.id, demandDigest, lissOfferId: lissOffer.id, effects }, instant); return offer;
}
function validateInvocation(activity) { if (activity?.["@context"] !== CONTEXT || activity?.type !== "Accept" || activity?.target !== ACTOR) return "invocation must be an ActivityStreams Accept addressed to Independent Editorial Assessment"; const contract = activity.object; const offer = contract?.offer; if (contract?.type !== "ServiceContract" || contract?.contract !== CONTRACT || offer?.actor !== ACTOR || offer?.object?.contract !== CONTRACT) return `invocation must accept ${CONTRACT}`; const demand = offer.object.sourceActivity?.object; if (digest(demand) !== offer.object.demandDigest || validateDemand(demand).length > 0) return "accepted editorial demand changed or is no longer admissible"; if (offer.object.scope?.toolSchemaDigest !== digest(editorialToolSchema()) || offer.object.scope?.lissRequestDigest !== offer.object.lissOffer?.object?.requestDigest || canonical(offer.object.scope?.lissRoute) !== canonical(offer.object.lissOffer?.object?.scope)) return "accepted editorial tool or LISS route changed"; const capability = contract.capability; if (capability?.type !== "Capability" || capability.holder !== ACTOR || capability.invocationTarget !== ACTOR || capability.parentOffer !== offer.id || capability.attenuation?.demandDigest !== offer.object.demandDigest || canonical(capability.attenuation?.providerScope) !== canonical(offer.object.scope)) return "accepted contract lacks an exact editorial-assessment capability"; for (const effect of offer.object.effects ?? []) if (!capability.allowedActions?.includes(effect)) return `customer capability does not grant ${effect}`; return undefined; }
function validateSelection(value) { if (!isRecord(value) || !EDITORIAL_TOOLS.includes(value.tool) || !FAILURE_LAYERS.includes(value.failureLayer) || typeof value.replayFrom !== "string" || typeof value.summary !== "string" || !Array.isArray(value.requiredRepairs) || value.requiredRepairs.some((item) => typeof item !== "string") || typeof value.report !== "string" || value.report.length < 500) return false; if (value.tool === "submit_editorial_acceptance" && (value.failureLayer !== "none" || value.requiredRepairs.length !== 0)) return false; return true; }
export function invokeEditorialAssessment(activity, instant = new Date().toISOString()) {
  if (!validInstant(instant)) throw new Error(`explicit UTC instant required: ${instant}`); const invalid = validateInvocation(activity); if (invalid !== undefined) return refusal(activity, "invalid-contract", invalid, instant);
  const offer = activity.object.offer; let providerResult; try { providerResult = invokeLiss("invoke-service", lissContract(offer.object.childSolicitation, offer.object.lissOffer), instant, 1_200_000); } catch (error) { return refusal(activity, "liss-unavailable", error instanceof Error ? error.message : String(error), instant); }
  if (providerResult?.type !== "Accept") return refusal(activity, "inference-obstructed", "LISS did not complete the exact schema-bound Sonnet route", instant, { providerResult });
  if (providerResult.object?.dryRun === true) { const exchangeId = contentId({ offer: offer.id, ready: providerResult.id, instant }); const providerExchange = Object.freeze({ id: exchangeId, exchangeId, provider: "independent-editorial-assessment", service: "assess-manuscript", contract: CONTRACT, outcome: "ready", price: offer.object.price, demandDigest: offer.object.demandDigest, upstreamResultDigest: digest(providerResult), recordedAt: instant }); const object = Object.freeze({ type: "EditorialToolSelectionDelivery", contract: CONTRACT, disposition: "ready", dryRun: true, demandDigest: offer.object.demandDigest, providerResult, providerExchange }); const result = response("Accept", activity, object, instant); append("provider.exchange", { ...providerExchange, responseDigest: digest(result) }, instant); return result; }
  const selection = providerResult.object?.structuredOutput; if (!validateSelection(selection)) return refusal(activity, "invalid-tool-selection", "LISS completion carried no valid bounded editorial tool selection", instant, { providerResult });
  const exchangeId = contentId({ offer: offer.id, selection: digest(selection), instant }); const providerExchange = Object.freeze({ id: exchangeId, exchangeId, provider: "independent-editorial-assessment", service: "assess-manuscript", contract: CONTRACT, outcome: "completion", price: offer.object.price, demandDigest: offer.object.demandDigest, toolSelectionDigest: digest(selection), upstreamResultDigest: digest(providerResult), recordedAt: instant });
  const object = Object.freeze({ type: "EditorialToolSelectionDelivery", contract: CONTRACT, disposition: "completion", dryRun: false, demandDigest: offer.object.demandDigest, manuscriptDigest: offer.object.sourceActivity.object.manuscript.digest, editorialContextDigest: offer.object.sourceActivity.object.editorialContext.digest, toolSelection: Object.freeze(selection), toolSelectionDigest: digest(selection), providerResult, providerExchange }); const result = response("Accept", activity, object, instant); append("provider.exchange", { ...providerExchange, responseDigest: digest(result) }, instant); return result;
}
function arg(flag) { const index = process.argv.indexOf(flag); return index === -1 ? undefined : process.argv[index + 1]; }
if (process.argv[1] === fileURLToPath(import.meta.url)) { const operation = arg("--operation") ?? "solicit-service"; const instant = arg("--now") ?? new Date().toISOString(); const activity = JSON.parse(readFileSync(arg("--input-file") ?? 0, "utf8")); const result = operation === "solicit-service" ? solicitEditorialAssessment(activity, instant) : operation === "invoke-service" ? invokeEditorialAssessment(activity, instant) : refusal(activity, "unknown-operation", `unknown operation ${operation}`, instant); const output = `${JSON.stringify(result, null, 2)}\n`; const outputPath = arg("--output-file"); if (outputPath === undefined) process.stdout.write(output); else writeFileSync(outputPath, output, "utf8"); if (result.type === "Reject") process.exitCode = 2; }
