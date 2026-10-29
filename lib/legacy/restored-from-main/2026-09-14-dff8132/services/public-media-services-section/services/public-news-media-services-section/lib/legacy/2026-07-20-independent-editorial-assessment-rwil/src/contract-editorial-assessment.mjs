#!/usr/bin/env node

import { createHash, randomUUID } from "node:crypto";
import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { sendRmnTask } from "@emsenn/a2a-services-section/client";
import { semanticId } from "@emsenn/rmn-semantic-conformance";
import { conformTerm } from "@emsenn/rmn-semantic-conformance/client";
import { createSettlementStore, loadSettlementAccount, relationalRwilDocument } from "@emsenn/rwil-rdf-services/client";

import { CONTRACT } from "./law.mjs";

export const CONTEXT = "https://www.w3.org/ns/activitystreams";
export const ACTOR = "urn:ame:independent-editorial-assessment";
export { CONTRACT };
export const EDITORIAL_TOOLS = Object.freeze(["submit_editorial_acceptance", "submit_revision_request", "submit_editorial_refusal"]);
export const EDITORIAL_REPAIR_TOOLS = Object.freeze(["replace_exact_body_text", "repair_editorial_surfaces"]);
const FAILURE_LAYERS = Object.freeze(["sources", "assignment", "instructions", "deterministic-gates", "writer-model", "draft-repair", "none"]);
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const CHILD_OPERATION_TYPE = ["product", ["mark"], ["product", ["mark"], ["product", ["mark"], ["mark"]]]];
const CHILD_BUNDLE_TYPE = ["product", ["effect"], CHILD_OPERATION_TYPE];
const OUTER_OPERATION_TYPE = ["product", CHILD_BUNDLE_TYPE, ["mark"]];
const OUTER_BUNDLE_TYPE = ["product", ["effect"], OUTER_OPERATION_TYPE];
const FORBIDDEN_KEYS = new Set(["root", "roots", "path", "paths", "contentDir", "dataDir", "storeDir", "manuscriptPath", "outputPath", "customerFilesystem"]);
function forbiddenKey(key) { return FORBIDDEN_KEYS.has(key) || /(?:path|paths|root|roots|dir|dirs)$/iu.test(key); }

export function digest(value) { return typeof value === "string" || Buffer.isBuffer(value) || value instanceof Uint8Array
  ? `sha256:${createHash("sha256").update(value).digest("hex")}` : semanticId(relationalRwilDocument(value)); }
function contentId(value) { return semanticId(relationalRwilDocument(value)); }
function equivalent(left, right) { return digest(left) === digest(right); }
function isRecord(value) { return value !== null && typeof value === "object" && !Array.isArray(value); }
function validInstant(value) { return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/u.test(value) && !Number.isNaN(Date.parse(value)); }
function dataRoot(env = process.env) { return resolve(env["INDEPENDENT_EDITORIAL_ASSESSMENT_DATA_ROOT"] ?? join(ROOT, "data")); }
function store(env = process.env) { return createSettlementStore({ settlementRoot: ROOT, dataRoot: dataRoot(env), agentUrl: env.RWIL_RDF_AGENT }); }
async function append(kind, value, instant, env = process.env) {
  const record = { type: "EditorialAssessmentEvidence", law: CONTRACT, kind, ...value, recordedAt: instant };
  if (env.RWIL_RDF_AGENT) return store(env).record({ category: `independent-editorial-assessment.${kind}`, recordedAt: instant, record });
  // Evidence projection must not make the editorial service unavailable.  A
  // missing separately hired RWIL/RDF provider falls back to this provider's
  // own append-only territory; a later projection may lift the same bytes.
  const date = instant.slice(0, 10);
  const [year, month, day] = date.split("-");
  const type = kind.replace(/[^a-z0-9-]+/giu, "-").replace(/^-|-$/gu, "").toLowerCase();
  const directory = join(dataRoot(env), type, year, month, day);
  mkdirSync(directory, { recursive: true });
  const path = join(directory, `${date}-independent-editorial-assessment-${type}.jsonl`);
  appendFileSync(path, `${JSON.stringify(record)}\n`, "utf8");
  return Object.freeze({ carrier: "provider-local-jsonl", path, record });
}
function response(type, source, object, instant) { const body = { actor: ACTOR, type, target: source?.actor ?? "urn:actor:unknown", inReplyTo: source?.id ?? null, law: CONTRACT, object }; return Object.freeze({ "@context": CONTEXT, id: contentId(body), ...body, published: instant }); }
async function refusal(source, code, reason, instant, details = {}) { const result = response("Reject", source, Object.freeze({ type: "Refusal", law: CONTRACT, code, reason, ...details }), instant); await append("provider.refusal", { code, reason, activityDigest: digest(source ?? null), responseDigest: digest(result) }, instant); return result; }
function forbidden(value, prefix = "demand") { if (Array.isArray(value)) return value.flatMap((item, index) => forbidden(item, `${prefix}[${index}]`)).at(0); if (!isRecord(value)) return undefined; for (const [key, child] of Object.entries(value)) { if (forbiddenKey(key)) return `${prefix}.${key}`; const nested = forbidden(child, `${prefix}.${key}`); if (nested !== undefined) return nested; } return undefined; }
function demandFrom(activity) { const sourceActivity = activity?.object?.sourceActivity; const demand = sourceActivity?.object; return sourceActivity?.type === "Create" && demand?.type === "EditorialAssessmentDemand" ? { sourceActivity, demand } : undefined; }
function validateDemand(demand) {
  const failures = []; const overreach = forbidden(demand); if (overreach !== undefined) failures.push(`customer territory authority is inadmissible at ${overreach}`);
  if (typeof demand?.slug !== "string" || demand.slug.trim() === "") failures.push("slug");
  if (typeof demand?.manuscript?.bytes !== "string" || demand.manuscript.bytes.trim() === "" || demand.manuscript.digest !== digest(demand.manuscript.bytes)) failures.push("manuscript exact bytes and digest");
  if (!isRecord(demand?.editorialContext?.standards) || !Array.isArray(demand?.editorialContext?.evidence) || demand.editorialContext.digest !== digest({ standards: demand.editorialContext.standards, run: demand.editorialContext.run ?? null, evidence: demand.editorialContext.evidence, pipeline: demand.editorialContext.pipeline ?? [] })) failures.push("editorialContext exact digest");
  for (const field of ["publicationPolicyDigest", "genreLawDigest", "editorialDutyDigest"]) if (typeof demand?.authorities?.[field] !== "string" || !demand.authorities[field].startsWith("ni:///sha-256;")) failures.push(`authorities.${field}`);
  if (!["dry-run", "live"].includes(demand?.executionMode)) failures.push("executionMode");
  if (typeof demand?.model !== "string" || !/sonnet/iu.test(demand.model)) failures.push("model(sonnet)");
  return [...new Set(failures)];
}
export function editorialToolSchema() {
  return Object.freeze({ type: "object", additionalProperties: false, properties: Object.freeze({
    tool: Object.freeze({ type: "string", enum: EDITORIAL_TOOLS, description: "Choose acceptance only when no manuscript repair remains; acceptance requires failureLayer=none and requiredRepairs=[]." }),
    failureLayer: Object.freeze({ type: "string", enum: FAILURE_LAYERS, description: "The earliest defective layer. Must be none for submit_editorial_acceptance." }),
    replayFrom: Object.freeze({ type: "string", minLength: 1, maxLength: 120 }),
    summary: Object.freeze({ type: "string", minLength: 1, maxLength: 2000 }),
    requiredRepairs: Object.freeze({ type: "array", maxItems: 20, description: "Material manuscript repairs only. Must be an empty array for submit_editorial_acceptance; publication flags are never repairs.", items: Object.freeze({ type: "string", minLength: 1, maxLength: 1000 }) }),
    repairTools: Object.freeze({ type: "array", maxItems: 20, description: "Executable bounded repairs. Select replace_exact_body_text for one exact unique Markdown-body span. Select repair_editorial_surfaces to have deterministic code regenerate summary and description from the admitted body and prune carrier artifacts. Never address frontmatter bytes with a body tool. Leave empty when replay from an earlier layer or a full prose contribution is genuinely required.", items: Object.freeze({ oneOf: Object.freeze([
      Object.freeze({ type: "object", additionalProperties: false, properties: Object.freeze({
        tool: Object.freeze({ const: "replace_exact_body_text" }),
        before: Object.freeze({ type: "string", minLength: 1, maxLength: 6000 }),
        after: Object.freeze({ type: "string", maxLength: 6000 }),
      }), required: Object.freeze(["tool", "before", "after"]) }),
      Object.freeze({ type: "object", additionalProperties: false, properties: Object.freeze({
        tool: Object.freeze({ const: "repair_editorial_surfaces" }),
      }), required: Object.freeze(["tool"]) }),
    ]) }) }),
    report: Object.freeze({ type: "string", minLength: 500 }),
  }), required: Object.freeze(["tool", "failureLayer", "replayFrom", "summary", "requiredRepairs", "repairTools", "report"]) });
}
function editorialPrompt(demand) {
  return [
    "You hold an independent editorial assessment duty. Do not rewrite the manuscript and do not authorize publication directly. Select exactly one bounded customer tool through the supplied schema and put all substantive judgment in the prose report field.",
    "Select submit_editorial_acceptance only when the deterministic standards reading is clear, every material factual claim is supported by the witnessed evidence, attribution is visible, headline and lede are faithful, and the prose is specific, useful, non-repetitive, and not padded with confident abstraction. Acceptance MUST carry failureLayer=none and requiredRepairs=[] exactly.",
    "Select submit_revision_request when a bounded repair can make the exact manuscript publishable. Select submit_editorial_refusal when the thesis, assignment, or evidence basis requires replay rather than surface repair.",
    "When every material defect is local, fill repairTools with bounded acts instead of asking another model to rewrite the manuscript. For body prose, each replace_exact_body_text before value must copy one exact unique span from the Markdown body; after is the complete replacement and may be empty for deletion. For malformed summary, description, or carrier preamble, select repair_editorial_surfaces; deterministic Koios code projects those surfaces from the admitted body, so never copy or replace frontmatter bytes. Preserve all unmentioned bytes. Use an empty repairTools array only when exact bounded edits cannot faithfully perform the repair.",
    "Diagnose the earliest causal failure layer. Do not blame the writer model for defects compelled by thin sources or an unsupported assignment. Treat historical production gates as provenance, not current truth; the supplied deterministic standards reading governs the current bytes. Never request toggling draft, gates_clear, or other publication-state flags: Koios performs that deterministic work after an accepted editorial selection.",
    "Apply ordinary newsroom verification to model-written prose: model output is never evidence. Prefer original and named sources, check whether consequential assertions are corroborated, preserve uncertainty and source motives, and make explicit what the reporting does not establish.",
    "When the manuscript criticizes a person or institution, alleges wrongdoing, or reports a dispute, require evidence that the criticized subject's response is represented or that a documented opportunity to respond was sought. If the carried sources cannot support fairness, diagnose sources or assignment as the earliest failure layer and replay from reporting rather than polishing the prose.",
    "Check for needless harm, sensationalism, stereotypes, unattributed opinion, and commercial influence. Reported analysis must remain visibly distinct from advocacy, advertising, and unsupported interpretation.",
    "The report must explain findings, audit material claims against witnessed evidence, state required repairs, and explain the pipeline diagnosis. Free-form words resembling ACCEPT or REFUSE have no effect; only the validated tool field is actionable.",
    `SLUG\n${demand.slug}`,
    `DETERMINISTIC STANDARDS\n${JSON.stringify(demand.editorialContext.standards)}`,
    `PRODUCTION RUN\n${JSON.stringify(demand.editorialContext.run ?? null)}`,
    `WITNESSED SOURCE AND CLAIM RECORDS\n${JSON.stringify(demand.editorialContext.evidence)}`,
    `OPERATIVE PIPELINE ARTIFACTS\n${JSON.stringify(demand.editorialContext.pipeline ?? [])}`,
    `MANUSCRIPT\n${demand.manuscript.bytes}`,
  ].join("\n\n");
}
function required(env, name) { const value = env[name]; if (typeof value !== "string" || value.length === 0) throw new Error(`${name} is required`); return value; }
function inferenceRoute(options = {}) {
  if (options.route) return Object.freeze(structuredClone(options.route));
  const env = options.env ?? process.env;
  return Object.freeze({
    rmnAgentCard: required(env, "RMN_CONFORMANCE_AGENT"),
    lissAgentCard: required(env, "LISS_AGENT_CARD_URL"),
    lissAccount: required(env, "LISS_ACCOUNT"),
    lissLaw: required(env, "LISS_LAW"),
    childAgentCard: required(env, "CLAUDE_CHILD_AGENT_CARD_URL"),
    childAccount: required(env, "CLAUDE_CHILD_ACCOUNT"),
    childLaw: required(env, "CLAUDE_CHILD_LAW"),
    childModel: required(env, "CLAUDE_CHILD_MODEL"),
  });
}
function routeProblem(route, demand) {
  if (!/^https?:\/\//u.test(route?.rmnAgentCard ?? "") || !/^https?:\/\//u.test(route?.lissAgentCard ?? "") || !/^https?:\/\//u.test(route?.childAgentCard ?? "")) return "inference route must name three Agent Card URLs";
  if (!/^eip155:[0-9]+:0x[0-9a-f]{40}$/u.test(route?.lissAccount ?? "") || !/^eip155:[0-9]+:0x[0-9a-f]{40}$/u.test(route?.childAccount ?? "")) return "inference route must name chain-qualified smart accounts";
  if (!/^ni:\/\/\/sha-256;[A-Za-z0-9_-]{43}$/u.test(route?.lissLaw ?? "") || !/^ni:\/\/\/sha-256;[A-Za-z0-9_-]{43}$/u.test(route?.childLaw ?? "")) return "inference route must name exact RMN law identities";
  if (route.childModel !== demand.model) return "inference route model does not match the admitted demand";
  return null;
}
function resultParts(result) { return Array.isArray(result?.parts) ? result.parts : (result?.artifacts ?? []).flatMap((artifact) => artifact.parts ?? []); }
function resultText(result) { const part = resultParts(result).find((value) => value?.content?.$case === "text" || typeof value?.text === "string"); return part?.content?.value ?? part?.text ?? ""; }
async function executeInferenceRoute(demand, route, { send = sendRmnTask } = {}) {
  const caller = loadSettlementAccount(ROOT).settlement;
  const childInstruction = `Return only one JSON value conforming to the supplied editorial tool schema.\n\nOUTPUT SCHEMA:\n${JSON.stringify(editorialToolSchema())}`;
  const childOperation = ["pair", ["mark", childInstruction], ["pair", ["mark", editorialPrompt(demand)], ["pair", ["mark", route.childModel], ["mark", demand.executionMode]]]];
  const childOperationValue = await conformTerm({ agentUrl: route.rmnAgentCard, term: childOperation, expectedType: CHILD_OPERATION_TYPE });
  const childCell = { law: route.childLaw, caller: route.lissAccount, provider: route.childAccount,
    precondition: contentId({ law: CONTRACT, term: "child-precondition" }), operation: childOperationValue.term,
    postcondition: contentId({ law: CONTRACT, term: "child-postcondition" }), refusal: contentId({ law: CONTRACT, term: "child-refusal" }),
    evidenceRoot: contentId({ law: CONTRACT, term: "child-four-bottom" }), outcome: { positiveEvidence: false, negativeEvidence: false }, measures: [], parent: null };
  const childTerm = ["pair", ["effect", childCell], childOperation];
  const child = await conformTerm({ agentUrl: route.rmnAgentCard, term: childTerm, expectedType: CHILD_BUNDLE_TYPE });
  const outerOperation = ["pair", childTerm, ["mark", route.childAgentCard]];
  const outerOperationValue = await conformTerm({ agentUrl: route.rmnAgentCard, term: outerOperation, expectedType: OUTER_OPERATION_TYPE });
  const outerCell = { law: route.lissLaw, caller, provider: route.lissAccount,
    precondition: contentId({ law: CONTRACT, term: "outer-precondition" }), operation: outerOperationValue.term,
    postcondition: contentId({ law: CONTRACT, term: "outer-postcondition" }), refusal: contentId({ law: CONTRACT, term: "outer-refusal" }),
    evidenceRoot: contentId({ law: CONTRACT, term: "outer-four-bottom" }), outcome: { positiveEvidence: false, negativeEvidence: false }, measures: [], parent: null };
  const outer = await conformTerm({ agentUrl: route.rmnAgentCard, term: ["pair", ["effect", outerCell], outerOperation], expectedType: OUTER_BUNDLE_TYPE });
  const exchange = await send({ agentUrl: route.lissAgentCard, message: { messageId: randomUUID(), role: "ROLE_USER",
    parts: [{ raw: outer.canonicalBytesBase64, metadata: { ni: outer.term }, filename: "editorial-assessment.rmn.cbor", mediaType: "application/rmn+cbor" }], metadata: { law: CONTRACT } } });
  return Object.freeze({ dryRun: demand.executionMode === "dry-run", disposition: exchange.result?.metadata?.disposition ?? "unknown",
    text: resultText(exchange.result), proposalNi: outer.term, completionNi: exchange.outputNi, exchange });
}

export async function solicitEditorialAssessment(activity, instant = new Date().toISOString(), options = {}) {
  if (!validInstant(instant)) throw new Error(`explicit UTC instant required: ${instant}`);
  if (activity?.["@context"] !== CONTEXT || activity?.type !== "Offer" || activity?.target !== ACTOR || activity?.object?.type !== "ServiceSolicitation" || activity.object.contract !== CONTRACT) return refusal(activity, "wrong-boundary", "solicitation must be an ActivityStreams Offer<ServiceSolicitation> naming the exact editorial-assessment RMN law", instant);
  const found = demandFrom(activity); if (found === undefined) return refusal(activity, "unrecognized-demand", "source activity must create one EditorialAssessmentDemand", instant);
  const failures = validateDemand(found.demand); if (failures.length > 0) return refusal(activity, "inadmissible-demand", `editorial assessment demand is incomplete or over-authorized: ${failures.join(", ")}`, instant, { failures });
  let route; try { route = inferenceRoute(options); } catch (error) { return refusal(activity, "inference-route-unavailable", error.message, instant); }
  const routeInvalid = routeProblem(route, found.demand); if (routeInvalid) return refusal(activity, "inference-route-invalid", routeInvalid, instant);
  const demandDigest = digest(found.demand); const effects = Object.freeze(["inference", "provider-local-rwil-evidence"]);
  const scope = Object.freeze({ inferenceRoute: route, inferenceRouteDigest: digest(route), toolSchemaDigest: digest(editorialToolSchema()) });
  const object = Object.freeze({ type: "ExecutableServiceOffer", service: "assess-manuscript", law: CONTRACT, sourceActivity: found.sourceActivity, demandDigest, operation: "invoke-service", scope, effects, requirements: Object.freeze(effects.map((effect) => Object.freeze({ type: "ResourceGrant", effect }))), terms: Object.freeze({ type: "UnpricedServiceTerms", assetPaymentRequired: false }) });
  const offer = response("Offer", activity, object, instant); await append("provider.offer", { offerId: offer.id, demandDigest, inferenceRouteDigest: scope.inferenceRouteDigest, effects }, instant); return offer;
}
function validateInvocation(activity) { if (activity?.["@context"] !== CONTEXT || activity?.type !== "Accept" || activity?.target !== ACTOR) return "invocation must be an ActivityStreams Accept addressed to Independent Editorial Assessment"; const contract = activity.object; const offer = contract?.offer; if (contract?.type !== "ServiceContract" || contract?.law !== CONTRACT || offer?.actor !== ACTOR || offer?.law !== CONTRACT || offer?.object?.law !== CONTRACT) return `invocation must accept ${CONTRACT}`; const demand = offer.object.sourceActivity?.object; if (digest(demand) !== offer.object.demandDigest || validateDemand(demand).length > 0) return "accepted editorial demand changed or is no longer admissible"; const scope = offer.object.scope; if (scope?.toolSchemaDigest !== digest(editorialToolSchema()) || scope?.inferenceRouteDigest !== digest(scope?.inferenceRoute) || routeProblem(scope?.inferenceRoute, demand)) return "accepted editorial tool or inference route changed"; const capability = contract.capability; if (capability?.type !== "Capability" || capability.holder !== ACTOR || capability.invocationTarget !== ACTOR || capability.parentOffer !== offer.id || capability.attenuation?.demandDigest !== offer.object.demandDigest || !equivalent(capability.attenuation?.providerScope, offer.object.scope)) return "accepted contract lacks an exact editorial-assessment capability"; for (const effect of offer.object.effects ?? []) if (!capability.allowedActions?.includes(effect)) return `customer capability does not grant ${effect}`; return undefined; }
function manuscriptBody(bytes) { const match = /^---\r?\n[\s\S]*?\r?\n---\r?\n([\s\S]*)$/u.exec(bytes); return match?.[1]; }
export function selectionProblems(value, manuscriptBytes) {
  const problems = [];
  if (!isRecord(value)) return Object.freeze(["selection-not-an-object"]);
  if (!EDITORIAL_TOOLS.includes(value.tool)) problems.push("unknown-editorial-tool");
  if (!FAILURE_LAYERS.includes(value.failureLayer)) problems.push("unknown-failure-layer");
  if (typeof value.replayFrom !== "string" || value.replayFrom.length === 0) problems.push("replay-from-missing");
  if (typeof value.summary !== "string" || value.summary.length === 0) problems.push("summary-missing");
  if (!Array.isArray(value.requiredRepairs) || value.requiredRepairs.some((item) => typeof item !== "string")) problems.push("required-repairs-invalid");
  if (!Array.isArray(value.repairTools)) problems.push("repair-tools-invalid");
  if (typeof value.report !== "string" || value.report.length < 500) problems.push("report-too-short");
  const repairTools = Array.isArray(value.repairTools) ? value.repairTools : [];
  for (const [index, repair] of repairTools.entries()) {
    if (!isRecord(repair) || !EDITORIAL_REPAIR_TOOLS.includes(repair.tool)) { problems.push(`repair-tools[${index}]-unknown`); continue; }
    if (repair.tool === "replace_exact_body_text" && (typeof repair.before !== "string" || repair.before.length === 0 || typeof repair.after !== "string" || repair.before === repair.after)) problems.push(`repair-tools[${index}]-body-arguments-invalid`);
    if (repair.tool === "repair_editorial_surfaces" && Object.keys(repair).some((key) => key !== "tool")) problems.push(`repair-tools[${index}]-surface-arguments-forbidden`);
  }
  if (value.tool !== "submit_revision_request" && repairTools.length !== 0) problems.push("repair-tools-require-revision");
  if (value.tool === "submit_editorial_acceptance" && (value.failureLayer !== "none" || !Array.isArray(value.requiredRepairs) || value.requiredRepairs.length !== 0)) problems.push("acceptance-carries-defects");
  if (manuscriptBytes !== undefined) {
    let body = manuscriptBody(manuscriptBytes); if (body === undefined) problems.push("manuscript-body-unreadable");
    else for (const [index, repair] of repairTools.entries()) {
      if (!isRecord(repair) || repair.tool !== "replace_exact_body_text" || typeof repair.before !== "string" || typeof repair.after !== "string") continue;
      const first = body.indexOf(repair.before);
      if (first < 0) problems.push(`repair-tools[${index}]-body-span-absent`);
      else if (body.indexOf(repair.before, first + repair.before.length) >= 0) problems.push(`repair-tools[${index}]-body-span-not-unique`);
      else body = `${body.slice(0, first)}${repair.after}${body.slice(first + repair.before.length)}`;
    }
  }
  return Object.freeze([...new Set(problems)]);
}
export function validateSelection(value, manuscriptBytes) {
  return selectionProblems(value, manuscriptBytes).length === 0;
}
function discardInapplicableExactRepairs(selection, manuscriptBytes) {
  if (!Array.isArray(selection?.repairTools) || manuscriptBytes === undefined) return Object.freeze({ selection, discardedProblems: Object.freeze([]) });
  let body = manuscriptBody(manuscriptBytes);
  if (body === undefined) return Object.freeze({ selection, discardedProblems: Object.freeze([]) });
  const retained = [], discardedProblems = [];
  for (const [index, repair] of selection.repairTools.entries()) {
    if (!isRecord(repair) || repair.tool !== "replace_exact_body_text" || typeof repair.before !== "string" || typeof repair.after !== "string") {
      retained.push(repair); continue;
    }
    const first = body.indexOf(repair.before);
    if (first < 0) { discardedProblems.push(`repair-tools[${index}]-body-span-absent`); continue; }
    if (body.indexOf(repair.before, first + repair.before.length) >= 0) { discardedProblems.push(`repair-tools[${index}]-body-span-not-unique`); continue; }
    retained.push(repair);
    body = `${body.slice(0, first)}${repair.after}${body.slice(first + repair.before.length)}`;
  }
  const filtered = Object.freeze({ ...selection, repairTools: Object.freeze(retained) });
  if (selectionProblems(filtered, manuscriptBytes).length > 0) return Object.freeze({ selection, discardedProblems: Object.freeze([]) });
  return Object.freeze({ selection: filtered, discardedProblems: Object.freeze(discardedProblems) });
}
function transientInferenceTransport(error) {
  return /(?:fetch failed|ECONNRESET|ECONNREFUSED|UND_ERR|socket hang up)/iu.test(error instanceof Error ? error.message : String(error));
}
export async function invokeEditorialAssessment(activity, instant = new Date().toISOString(), options = {}) {
  if (!validInstant(instant)) throw new Error(`explicit UTC instant required: ${instant}`); const invalid = validateInvocation(activity); if (invalid !== undefined) return refusal(activity, "invalid-contract", invalid, instant);
  const offer = activity.object.offer; const demand = offer.object.sourceActivity.object; let providerResult;
  const infer = options.infer ?? executeInferenceRoute;
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try { providerResult = await infer(demand, offer.object.scope.inferenceRoute, options); break; }
    catch (error) {
      if (attempt === 1 && transientInferenceTransport(error)) continue;
      return refusal(activity, "inference-obstructed", error instanceof Error ? error.message : String(error), instant, { attempts: attempt });
    }
  }
  if (!providerResult || !["completion", "ready"].includes(providerResult.disposition)) return refusal(activity, "inference-obstructed", "the contracted A2A inference route did not complete the exact RMN effect cell", instant, { providerResult });
  if (providerResult.dryRun === true) { const exchangeId = contentId({ offer: offer.id, ready: providerResult.proposalNi, instant }); const providerExchange = Object.freeze({ id: exchangeId, exchangeId, provider: ACTOR, service: "assess-manuscript", law: CONTRACT, outcome: "ready", terms: offer.object.terms, demandDigest: offer.object.demandDigest, upstreamResultDigest: digest(providerResult), proposalNi: providerResult.proposalNi, completionNi: providerResult.completionNi, recordedAt: instant }); const object = Object.freeze({ type: "EditorialToolSelectionDelivery", law: CONTRACT, disposition: "ready", dryRun: true, demandDigest: offer.object.demandDigest, providerResult, providerExchange }); const result = response("Accept", activity, object, instant); await append("provider.exchange", { ...providerExchange, responseDigest: digest(result) }, instant); return result; }
  let selection; try { selection = JSON.parse(providerResult.text); } catch { return refusal(activity, "invalid-tool-selection", "the A2A inference route did not return one JSON editorial tool selection", instant, { providerResult }); }
  const admitted = discardInapplicableExactRepairs(selection, demand.manuscript.bytes);
  selection = admitted.selection;
  const problems = selectionProblems(selection, demand.manuscript.bytes); if (problems.length > 0) return refusal(activity, "invalid-tool-selection", `the A2A inference route delivered an editorial tool selection that failed deterministic admission: ${problems.join(", ")}`, instant, { problems, providerResult });
  const exchangeId = contentId({ offer: offer.id, selection: digest(selection), instant }); const providerExchange = Object.freeze({ id: exchangeId, exchangeId, provider: ACTOR, service: "assess-manuscript", law: CONTRACT, outcome: "completion", terms: offer.object.terms, demandDigest: offer.object.demandDigest, toolSelectionDigest: digest(selection), upstreamResultDigest: digest(providerResult), recordedAt: instant });
  const object = Object.freeze({ type: "EditorialToolSelectionDelivery", law: CONTRACT, disposition: "completion", dryRun: false, demandDigest: offer.object.demandDigest, manuscriptDigest: offer.object.sourceActivity.object.manuscript.digest, editorialContextDigest: offer.object.sourceActivity.object.editorialContext.digest, toolSelection: Object.freeze(selection), toolSelectionDigest: digest(selection), ...(admitted.discardedProblems.length === 0 ? {} : { discardedRepairToolProblems: admitted.discardedProblems }), providerResult, providerExchange }); const result = response("Accept", activity, object, instant); await append("provider.exchange", { ...providerExchange, responseDigest: digest(result) }, instant); return result;
}
function arg(flag) { const index = process.argv.indexOf(flag); return index === -1 ? undefined : process.argv[index + 1]; }
if (process.argv[1] === fileURLToPath(import.meta.url)) { const operation = arg("--operation") ?? "solicit-service"; const instant = arg("--now") ?? new Date().toISOString(); const activity = JSON.parse(readFileSync(arg("--input-file") ?? 0, "utf8")); const result = operation === "solicit-service" ? await solicitEditorialAssessment(activity, instant) : operation === "invoke-service" ? await invokeEditorialAssessment(activity, instant) : await refusal(activity, "unknown-operation", `unknown operation ${operation}`, instant); const output = `${JSON.stringify(result, null, 2)}\n`; const outputPath = arg("--output-file"); if (outputPath === undefined) process.stdout.write(output); else writeFileSync(outputPath, output, "utf8"); if (result.type === "Reject") process.exitCode = 2; }
