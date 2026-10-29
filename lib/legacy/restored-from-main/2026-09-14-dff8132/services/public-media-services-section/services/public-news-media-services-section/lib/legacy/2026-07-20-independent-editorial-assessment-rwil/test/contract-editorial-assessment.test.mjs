import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { readSettlementRecords } from "@emsenn/rwil-rdf-services/client";
import { startRwilProviderProcess } from "@emsenn/rwil-rdf-services/test-provider";

import { ACTOR, CONTEXT, CONTRACT, digest, editorialToolSchema, invokeEditorialAssessment, selectionProblems, solicitEditorialAssessment, validateSelection } from "../src/contract-editorial-assessment.mjs";

const CUSTOMER = "urn:ame:test-publication";
const NOW = "2099-07-18T13:00:00.000Z";
const ROUTE = Object.freeze({
  rmnAgentCard: "https://rmn.example/.well-known/agent-card.json",
  lissAgentCard: "https://liss.example/.well-known/agent-card.json",
  lissAccount: "eip155:31337:0xb0f673032336b99a27b6f2d51d01758abb5688d6",
  lissLaw: "ni:///sha-256;dPKjAceg6De7UofMmCvs-nIEt9oszzMKBawJJn3YMr8",
  childAgentCard: "https://sonnet.example/.well-known/agent-card.json",
  childAccount: "eip155:31337:0x1111111111111111111111111111111111111111",
  childLaw: CONTRACT,
  childModel: "claude-sonnet-4-6",
});
const COMPLETION = Object.freeze({
  tool: "submit_editorial_acceptance", failureLayer: "none", replayFrom: "none", summary: "The exact manuscript is publishable.", requiredRepairs: [], repairTools: [],
  report: "The admitted manuscript and its witnessed evidence support the material claims without a remaining editorial repair. ".repeat(6),
});
const OPTIONS = Object.freeze({ route: ROUTE, infer: async (value) => Object.freeze({
  dryRun: value.executionMode === "dry-run", disposition: value.executionMode === "dry-run" ? "ready" : "completion",
  text: value.executionMode === "dry-run" ? "" : JSON.stringify(COMPLETION), proposalNi: CONTRACT, completionNi: CONTRACT,
  exchange: Object.freeze({ protocol: "A2A", version: "1.0", inputNi: CONTRACT, outputNi: CONTRACT }),
}) });
let temp;
let priorData;
let priorRwil;
let rwil;

test.before(async () => { rwil = await startRwilProviderProcess(); });
test.after(async () => { await rwil.close(); });

test.beforeEach(() => {
  temp = mkdtempSync(join(tmpdir(), "independent-editorial-assessment-"));
  priorData = process.env.INDEPENDENT_EDITORIAL_ASSESSMENT_DATA_ROOT;
  priorRwil = process.env.RWIL_RDF_AGENT;
  process.env.INDEPENDENT_EDITORIAL_ASSESSMENT_DATA_ROOT = join(temp, "provider-data");
  process.env.RWIL_RDF_AGENT = rwil.agentCardUrl;
});
test.afterEach(() => {
  if (priorData === undefined) delete process.env.INDEPENDENT_EDITORIAL_ASSESSMENT_DATA_ROOT; else process.env.INDEPENDENT_EDITORIAL_ASSESSMENT_DATA_ROOT = priorData;
  if (priorRwil === undefined) delete process.env.RWIL_RDF_AGENT; else process.env.RWIL_RDF_AGENT = priorRwil;
  rmSync(temp, { recursive: true, force: true });
});

function demand(overrides = {}) {
  const bytes = "---\ntitle: Test\ndraft: true\n---\n\nA sufficiently exact manuscript body with a cited source.";
  const standards = { publishable: true, findings: [] };
  const evidence = [{ sourceUrl: "https://example.test/source", claim: "The reported event occurred." }];
  const run = { provider: "newswire-editorial-production" };
  const pipeline = [];
  return {
    type: "EditorialAssessmentDemand",
    slug: "test-manuscript",
    manuscript: { bytes, digest: digest(bytes) },
    editorialContext: { standards, run, evidence, pipeline, digest: digest({ standards, run, evidence, pipeline }) },
    authorities: { publicationPolicyDigest: digest({ policy: "publication" }), genreLawDigest: digest({ law: "genre" }), editorialDutyDigest: digest({ duty: "editorial" }) },
    executionMode: "dry-run",
    model: "claude-sonnet-4-6",
    ...overrides,
  };
}
function solicitation(value = demand()) { const sourceActivity = { "@context": CONTEXT, id: `urn:source:${digest(value)}`, type: "Create", actor: CUSTOMER, target: ACTOR, object: value }; return { "@context": CONTEXT, id: `urn:solicitation:${digest(sourceActivity)}`, type: "Offer", actor: CUSTOMER, target: ACTOR, object: { type: "ServiceSolicitation", contract: CONTRACT, demand: `urn:demand:${digest(value)}`, sourceActivity } }; }
function contract(offer) { const allowedActions = ["invoke-service", ...offer.object.effects]; const capability = { type: "Capability", issuer: CUSTOMER, holder: ACTOR, invocationTarget: ACTOR, parentOffer: offer.id, allowedActions, attenuation: { demandDigest: offer.object.demandDigest, providerScope: offer.object.scope, customerTerritoryMutation: false } }; return { "@context": CONTEXT, type: "Accept", actor: CUSTOMER, target: ACTOR, object: { type: "ServiceContract", law: CONTRACT, offer, capability } }; }

test("the provider contracts a schema-bound Sonnet route and returns readiness without editorial authority", async () => {
  const offer = await solicitEditorialAssessment(solicitation(), NOW, OPTIONS);
  assert.equal(offer.type, "Offer", JSON.stringify(offer));
  assert.equal(offer.object.service, "assess-manuscript");
  assert.deepEqual(offer.object.scope.inferenceRoute, ROUTE);
  assert.equal(offer.object.scope.toolSchemaDigest, digest(editorialToolSchema()));
  assert.deepEqual(offer.object.effects, ["inference", "provider-local-rwil-evidence"]);
  const result = await invokeEditorialAssessment(contract(offer), NOW, OPTIONS);
  assert.equal(result.type, "Accept");
  assert.equal(result.object.disposition, "ready");
  assert.equal(result.object.dryRun, true);
  assert.equal("toolSelection" in result.object, false);
  assert.equal(readSettlementRecords(join(temp, "provider-data"), "independent-editorial-assessment.provider.offer").length, 1);
  assert.equal(readSettlementRecords(join(temp, "provider-data"), "independent-editorial-assessment.provider.exchange").length, 1);
});

test("acceptance is a complete tool act and cannot smuggle publication-state work into repairs", () => {
  const report = "Editorial evidence supports this exact manuscript without a remaining material repair. ".repeat(8);
  assert.equal(validateSelection({ tool: "submit_editorial_acceptance", failureLayer: "none", replayFrom: "none", summary: "Publishable.", requiredRepairs: [], repairTools: [], report }), true);
  assert.equal(validateSelection({ tool: "submit_editorial_acceptance", failureLayer: "none", replayFrom: "none", summary: "Publishable.", requiredRepairs: ["toggle draft false"], repairTools: [], report }), false);
  assert.match(editorialToolSchema().properties.requiredRepairs.description, /publication flags are never repairs/u);
});

test("a revision can select an exact body repair but cannot target repeated or absent bytes", () => {
  const report = "The manuscript has one local modality defect and the remaining exact bytes are publication-ready. ".repeat(8);
  const value = { tool: "submit_revision_request", failureLayer: "writer-model", replayFrom: "bounded-body-repair", summary: "Replace one certainty claim.", requiredRepairs: ["replace certainty with supported modality"], repairTools: [{ tool: "replace_exact_body_text", before: "will decide", after: "may decide" }], report };
  assert.equal(validateSelection(value, "---\ntitle: Test\n---\nThe geometry will decide the final."), true);
  assert.equal(validateSelection(value, "---\ntitle: Test\n---\nThe match is open."), false);
  assert.equal(validateSelection(value, "---\ntitle: Test\n---\nIt will decide; perhaps it will decide."), false);
});

test("an otherwise valid revision survives unusable exact coordinates as a prose repair", async () => {
  const report = "The manuscript needs one material sentence repair, but the diagnosis remains valid without an exact byte edit. ".repeat(8);
  const selection = { tool: "submit_revision_request", failureLayer: "writer-model", replayFrom: "draft-repair", summary: "Repair the unsupported sentence.", requiredRepairs: ["remove the unsupported claim"], repairTools: [{ tool: "replace_exact_body_text", before: "a sentence the manuscript does not contain", after: "a supported sentence" }], report };
  const infer = async () => ({ disposition: "completion", dryRun: false, text: JSON.stringify(selection), proposalNi: "ni:///sha-256;fixture", completionNi: "ni:///sha-256;result", exchange: {} });
  const offer = await solicitEditorialAssessment(solicitation(), NOW, OPTIONS);
  const result = await invokeEditorialAssessment(contract(offer), NOW, { ...OPTIONS, infer });
  assert.equal(result.type, "Accept");
  assert.deepEqual(result.object.toolSelection.repairTools, []);
  assert.deepEqual(result.object.discardedRepairToolProblems, ["repair-tools[0]-body-span-absent"]);
  assert.equal(result.object.toolSelection.requiredRepairs.length, 1);
});

test("the editor selects a deterministic surface repair instead of smuggling frontmatter through a body tool", () => {
  const report = "The body is sound, but its projected summary contains a carrier defect that deterministic code can repair. ".repeat(8);
  const manuscript = "---\ntitle: Test\nsummary: Broken summary.\n---\nThe reported body is complete.";
  const surfaceRepair = { tool: "submit_revision_request", failureLayer: "deterministic-gates", replayFrom: "bounded-surface-repair", summary: "Regenerate editorial surfaces.", requiredRepairs: ["project summary from body"], repairTools: [{ tool: "repair_editorial_surfaces" }], report };
  assert.equal(validateSelection(surfaceRepair, manuscript), true);
  const frontmatterThroughBody = { ...surfaceRepair, repairTools: [{ tool: "replace_exact_body_text", before: "summary: Broken summary.", after: "summary: Better summary." }] };
  assert.equal(validateSelection(frontmatterThroughBody, manuscript), false);
  assert.deepEqual(selectionProblems(frontmatterThroughBody, manuscript), ["repair-tools[0]-body-span-absent"]);
  assert.match(editorialToolSchema().properties.repairTools.description, /never address frontmatter bytes/iu);
});

test("customer paths cannot substitute for carried manuscript and evidence values", async () => {
  const result = await solicitEditorialAssessment(solicitation(demand({ roots: ["/"], manuscriptPath: "/customer/draft.md" })), NOW, OPTIONS);
  assert.equal(result.type, "Reject");
  assert.equal(result.object.code, "inadmissible-demand");
  assert.match(result.object.reason, /customer territory authority is inadmissible/u);
});

test("an accepted assessment cannot change manuscript bytes or the tool schema", async () => {
  const offer = await solicitEditorialAssessment(solicitation(), NOW, OPTIONS);
  const changed = structuredClone(contract(offer));
  changed.object.offer.object.sourceActivity.object.manuscript.bytes += " Changed.";
  const result = await invokeEditorialAssessment(changed, NOW, OPTIONS);
  assert.equal(result.type, "Reject");
  assert.equal(result.object.code, "invalid-contract");
  assert.match(result.object.reason, /changed or is no longer admissible/u);
});
