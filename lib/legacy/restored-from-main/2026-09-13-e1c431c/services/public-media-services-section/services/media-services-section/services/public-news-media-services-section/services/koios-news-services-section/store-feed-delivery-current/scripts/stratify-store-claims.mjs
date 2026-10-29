#!/usr/bin/env node
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { readEavtFile } from "@red-cup-engineering/eavt";
import { stratifyStore } from "../src/claim-rows.mjs";
import { runJavascriptNodeOperation } from "@red-cup-engineering/javascript-node-services-section/operation";

const DEFAULT_TRACE_PATH =
  "/home/emsenn/info/lib/emsenn/services/561-group/services/public-services-section/services/public-social-services-section/services/public-media-services-section/services/media-services-section/services/public-news-media-services-section/services/koios-news/data/logs/claims/koios-store-claims.eavt.jsonl";
const DEFAULT_RECORDS_DIR =
  "/home/emsenn/info/lib/emsenn/services/561-group/services/public-services-section/services/public-social-services-section/services/public-media-services-section/services/media-services-section/services/public-news-media-services-section/services/koios-news/data/records/claims";

/**
 * Latest-row date (YYYY-MM-DD) across an {e,a,v,t} trace, ISO-8601 `t`
 * assumed — this dates the projection, never the wall clock.
 *
 * @param {readonly {t: string}[]} rows
 * @returns {string}
 * @throws {Error} When `rows` carries no string `t` to date by.
 */
function latestDate(rows) {
  const dates = rows.map((row) => row.t).filter((t) => typeof t === "string");
  if (dates.length === 0) throw new Error("stratify-store-claims: trace has no rows to date the projection by");
  return dates.reduce((max, t) => (t > max ? t : max)).slice(0, 10);
}

/**
 * Reads an EAVT claim trace off disk, stratifies every entity in it, and
 * writes the projection, dated by the trace's own latest row `t`.
 *
 * @param {{tracePath?: string, out?: string}} [input]
 * @returns {{tracePath: string, out: string, summary: {entities: number,
 *   rows: number, asserted: number, saturated: number, settled: number}}}
 */
export function stratifyStoreClaims({ tracePath = DEFAULT_TRACE_PATH, out } = {}) {
  const rows = readEavtFile(tracePath);
  const projection = stratifyStore(rows);
  const outPath = out ?? `${DEFAULT_RECORDS_DIR}/${latestDate(rows)}-koios-claim-strata.json`;
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, `${JSON.stringify(projection, null, 2)}\n`);
  return { tracePath, out: outPath, summary: projection.summary };
}

if (import.meta.main) {
  const result = await runJavascriptNodeOperation({ name: "stratify-store-claims", description: "Reads an EAVT claim trace off disk, stratifies every entity in it, and writes the projection, dated by the trace's own latest row `t`.", operation: stratifyStoreClaims }, { arguments: process.argv.slice(2), standardInput: process.stdin, standardOutput: process.stdout });
  process.exitCode = result.exitCode;
}
