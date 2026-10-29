import { readFileSync } from "node:fs";
import { compileRmlLaw } from "@emsenn/rmn-semantic-conformance/law";

export const EDITORIAL_ASSESSMENT_LAW = compileRmlLaw(readFileSync(new URL("../content/contracts/editorial-assessment-service.rml", import.meta.url), "utf8"));
export const CONTRACT = EDITORIAL_ASSESSMENT_LAW.id;
