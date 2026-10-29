#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";
import { appendEavt, dedupe, readEavtFile, rowId } from "@red-cup-engineering/eavt";
import { storeToTrace } from "../src/claim-rows.mjs";
import { runJavascriptNodeOperation } from "@red-cup-engineering/javascript-node-services-section/operation";

const DEFAULT_STORE_ROOT =
  "/home/emsenn/info/lib/emsenn/services/561-group/services/public-services-section/services/public-social-services-section/services/public-media-services-section/services/media-services-section/services/public-news-media-services-section/services/koios-news/sites/koios.news/store";
const DEFAULT_TRACE_PATH =
  "/home/emsenn/info/lib/emsenn/services/561-group/services/public-services-section/services/public-social-services-section/services/public-media-services-section/services/media-services-section/services/public-news-media-services-section/services/koios-news/data/logs/claims/koios-store-claims.eavt.jsonl";

/**
 * Projects a koios claim-store into EAVT rows and durably appends every row
 * not already present in the trace file, by content-id — a second run over
 * an unchanged store appends nothing.
 *
 * @param {{storeRoot?: string, tracePath?: string}} [input]
 * @returns {{storeRoot: string, tracePath: string, filesRead: number,
 *   entities: number, rowsProjected: number, rowsAppended: number,
 *   rowsAlreadyPresent: number}}
 */
export function projectStoreClaimsIntoEavt({ storeRoot = DEFAULT_STORE_ROOT, tracePath = DEFAULT_TRACE_PATH } = {}) {
  const { rows, receipts } = storeToTrace(storeRoot);
  const deduped = dedupe(rows);
  const existingIds = new Set(existsSync(tracePath) ? readEavtFile(tracePath).map((row) => rowId(row)) : []);
  let appended = 0;
  for (const row of deduped) {
    const id = rowId(row);
    if (existingIds.has(id)) continue;
    appendEavt(tracePath, row);
    existingIds.add(id);
    appended += 1;
  }
  return {
    storeRoot,
    tracePath,
    filesRead: receipts.length,
    entities: new Set(receipts.map((receipt) => receipt.entity)).size,
    rowsProjected: deduped.length,
    rowsAppended: appended,
    rowsAlreadyPresent: deduped.length - appended,
  };
}

if (import.meta.main) {
  const result = await runJavascriptNodeOperation({ name: "project-store-claims-into-eavt", description: "Projects a koios claim-store into EAVT rows and durably appends every row not already present in the trace file, by content-id — a second run over an unchanged store appends nothing.", operation: projectStoreClaimsIntoEavt }, { arguments: process.argv.slice(2), standardInput: process.stdin, standardOutput: process.stdout });
  process.exitCode = result.exitCode;
}
