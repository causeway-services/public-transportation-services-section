import { createHash } from "node:crypto";
import { existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { basename, join, relative, resolve, sep } from "node:path";
import { spawnSync } from "node:child_process";

export const TARGET = Object.freeze({
  accountId: "337e54ee6dc7d488933f473204a6d89e",
  workerName: "koios-news-primary",
  hostname: "koios.news",
  routePattern: "koios.news/*",
  effect: "cloudflare-worker-static-publication",
});
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const parseJson = (path, label) => { try { return JSON.parse(readFileSync(path, "utf8")); } catch (error) { throw new Error(`${label} is not valid JSON: ${path}`); } };
const regularObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const exact = (value, expected, label) => { if (value !== expected) throw new Error(`${label} must be ${JSON.stringify(expected)}`); };

function listedFiles(root) {
  const found = [];
  const visit = (directory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const path = join(directory, entry.name);
      if (entry.isSymbolicLink()) throw new Error(`candidate contains a symlink: ${path}`);
      if (entry.isDirectory()) visit(path);
      else if (entry.isFile()) found.push({ file: relative(root, path).split(sep).join("/"), path });
      else throw new Error(`candidate contains a non-regular entry: ${path}`);
    }
  };
  visit(root); return found;
}

/** Verify the static-delivery-current manifest without reading any retired carrier. */
export function verifyCandidate(candidateDir) {
  const root = resolve(candidateDir);
  if (!existsSync(root) || !lstatSync(root).isDirectory() || lstatSync(root).isSymbolicLink()) throw new Error("candidate must be a regular directory");
  const manifestPath = join(root, "manifest.json");
  if (!existsSync(manifestPath)) throw new Error("candidate lacks manifest.json");
  const manifestBytes = readFileSync(manifestPath);
  const manifest = parseJson(manifestPath, "candidate manifest");
  if (!regularObject(manifest) || manifest.kind !== "koios.news.static-publication-manifest/v1") throw new Error("candidate manifest is not a static-delivery-current manifest");
  if (!regularObject(manifest.provenance) || manifest.provenance.canonicalOrigin !== "https://koios.news") throw new Error("candidate manifest is not bound to https://koios.news");
  if (!Array.isArray(manifest.artifacts) || manifest.artifacts.length === 0) throw new Error("candidate manifest has no artifacts");
  const expected = new Set();
  for (const artifact of manifest.artifacts) {
    if (!regularObject(artifact) || typeof artifact.file !== "string" || !/^[^/]+(?:\/[^/]+)*$/u.test(artifact.file) || artifact.file.includes("..") || typeof artifact.sha256 !== "string" || !/^[a-f0-9]{64}$/u.test(artifact.sha256) || !Number.isSafeInteger(artifact.bytes) || artifact.bytes < 0) throw new Error("candidate manifest contains an invalid artifact entry");
    if (expected.has(artifact.file)) throw new Error(`candidate manifest lists ${artifact.file} twice`);
    expected.add(artifact.file);
    const artifactPath = resolve(root, artifact.file);
    if (!artifactPath.startsWith(`${root}${sep}`) || !existsSync(artifactPath) || !lstatSync(artifactPath).isFile() || lstatSync(artifactPath).isSymbolicLink()) throw new Error(`candidate artifact is missing or unsafe: ${artifact.file}`);
    const bytes = readFileSync(artifactPath);
    if (bytes.length !== artifact.bytes || sha256(bytes) !== artifact.sha256) throw new Error(`candidate artifact digest does not match: ${artifact.file}`);
  }
  const actual = new Set(listedFiles(root).map(({ file }) => file).filter((file) => file !== "manifest.json" && file !== ".koios-static-delivery-current"));
  if (actual.size !== expected.size || [...actual].some((file) => !expected.has(file))) throw new Error("candidate contains files not sealed by its manifest");
  return Object.freeze({ root, manifestDigest: sha256(manifestBytes), artifactCount: expected.size, manifest });
}

export function verifyBinding(bindingPath) {
  const binding = parseJson(resolve(bindingPath), "release binding");
  if (!regularObject(binding) || binding.kind !== "koios.news.cloudflare-release-binding/v1") throw new Error("release binding has the wrong kind");
  for (const [key, value] of Object.entries(TARGET)) exact(binding[key], value, `binding.${key}`);
  return Object.freeze(binding);
}

export function verifyGrant(grantPath, candidate, binding) {
  const grant = parseJson(resolve(grantPath), "release grant");
  if (!regularObject(grant) || grant.kind !== "koios.news.cloudflare-release-grant/v1") throw new Error("release grant has the wrong kind");
  for (const [key, value] of Object.entries(TARGET)) exact(grant[key], value, `grant.${key}`);
  exact(grant.candidateManifestSha256, candidate.manifestDigest, "grant.candidateManifestSha256");
  exact(grant.bindingSha256, sha256(JSON.stringify(binding)), "grant.bindingSha256");
  if (typeof grant.grantId !== "string" || grant.grantId.length < 12) throw new Error("grant.grantId is required");
  if (typeof grant.expiresAt !== "string" || !Number.isFinite(Date.parse(grant.expiresAt)) || Date.parse(grant.expiresAt) <= Date.now()) throw new Error("grant is expired or lacks a valid expiresAt");
  return Object.freeze(grant);
}

export function verifyRollback(rollbackPath, binding) {
  const rollback = parseJson(resolve(rollbackPath), "rollback binding");
  if (!regularObject(rollback) || rollback.kind !== "koios.news.cloudflare-rollback-binding/v1") throw new Error("rollback binding has the wrong kind");
  for (const [key, value] of Object.entries(TARGET)) exact(rollback[key], value, `rollback.${key}`);
  if (typeof rollback.priorVersionId !== "string" || rollback.priorVersionId.length < 1) throw new Error("rollback.priorVersionId is required");
  return Object.freeze(rollback);
}

function command(binary, args) { return Object.freeze({ program: binary, args: Object.freeze(args), credentialPolicy: "Cloudflare credentials are read only by the child process; this carrier never prints environment values or command output." }); }
function receiptPath(path, receipt) {
  if (!path) return receipt;
  const target = resolve(path);
  if (existsSync(target)) throw new Error(`refusing to overwrite immutable receipt: ${target}`);
  mkdirSync(resolve(target, ".."), { recursive: true });
  writeFileSync(target, `${JSON.stringify(receipt, null, 2)}\n`, { mode: 0o600, flag: "wx" });
  return Object.freeze({ ...receipt, receiptPath: target });
}

export function plan({ phase = "plan", candidateDir, bindingPath, grantPath, rollbackPath, previewReceiptPath, wrangler = "wrangler" }) {
  const candidate = verifyCandidate(candidateDir); const binding = verifyBinding(bindingPath);
  const base = { kind: "koios.news.cloudflare-release-plan/v1", phase, candidate: { manifestSha256: candidate.manifestDigest, artifactCount: candidate.artifactCount }, binding: TARGET, immutableReceipt: true, probe: { method: "GET", expectedHost: TARGET.hostname, expectedManifestSha256: candidate.manifestDigest, refusal: "A successful TLS response alone is insufficient; retain response headers/body digest and compare the served artifact." } };
  if (phase === "plan") return Object.freeze({ ...base, disposition: "dry-run", commands: [command(wrangler, ["deploy", "--name", `${TARGET.workerName}-preview-${candidate.manifestDigest.slice(0, 12)}`]), command(wrangler, ["deploy", "--name", TARGET.workerName]), command(wrangler, ["rollback", "--name", TARGET.workerName, "--version-id", "<priorVersionId>"])], refusal: "No Cloudflare process is started in plan mode. Preview requires --apply and a matching grant; release additionally requires a verified preview receipt and rollback binding." });
  const grant = verifyGrant(grantPath, candidate, binding);
  if (phase === "preview") return Object.freeze({ ...base, disposition: "preview-authorized", grantId: grant.grantId, commands: [command(wrangler, ["deploy", "--name", `${TARGET.workerName}-preview-${candidate.manifestDigest.slice(0, 12)}`])], next: "Record the resulting preview URL and an exact probe in an immutable receipt before requesting release." });
  if (phase !== "release") throw new Error(`unknown phase: ${phase}`);
  const rollback = verifyRollback(rollbackPath, binding);
  const preview = parseJson(resolve(previewReceiptPath), "preview receipt");
  if (!regularObject(preview) || preview.kind !== "koios.news.cloudflare-preview-receipt/v1" || preview.candidateManifestSha256 !== candidate.manifestDigest || preview.binding?.hostname !== TARGET.hostname || preview.probe?.accepted !== true) throw new Error("release requires an accepted preview receipt for this exact candidate and hostname");
  return Object.freeze({ ...base, disposition: "release-authorized", grantId: grant.grantId, previewReceiptSha256: sha256(readFileSync(resolve(previewReceiptPath))), rollback: { priorVersionId: rollback.priorVersionId }, commands: [command(wrangler, ["deploy", "--name", TARGET.workerName]), command(wrangler, ["rollback", "--name", TARGET.workerName, "--version-id", rollback.priorVersionId])], next: "Release is one route-bound Worker deployment. If its retained post-release probe fails, execute only the listed rollback command with the same explicit grant." });
}

export function executeAuthorized({ phase, plan: releasePlan, receiptOut, executor = (program, args) => spawnSync(program, args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }) }) {
  if (!releasePlan || !["preview-authorized", "release-authorized"].includes(releasePlan.disposition)) throw new Error("only an authorized preview or release plan can execute");
  const deployment = releasePlan.commands[0]; const result = executor(deployment.program, deployment.args);
  if (!result || result.status !== 0) throw new Error(`Cloudflare command failed without exposing its output (status=${result?.status ?? "unknown"})`);
  const receipt = phase === "preview"
    ? { kind: "koios.news.cloudflare-preview-receipt/v1", candidateManifestSha256: releasePlan.candidate.manifestSha256, binding: TARGET, grantId: releasePlan.grantId, deployment: { command: deployment.args }, probe: { accepted: false, required: "Record a separate exact HTTPS probe before release." } }
    : { kind: "koios.news.cloudflare-release-receipt/v1", candidateManifestSha256: releasePlan.candidate.manifestSha256, binding: TARGET, grantId: releasePlan.grantId, previewReceiptSha256: releasePlan.previewReceiptSha256, rollback: releasePlan.rollback, deployment: { command: deployment.args }, probe: { accepted: false, required: "Record a post-release exact HTTPS probe; rollback is pre-bound if it fails." } };
  return receiptPath(receiptOut, receipt);
}
