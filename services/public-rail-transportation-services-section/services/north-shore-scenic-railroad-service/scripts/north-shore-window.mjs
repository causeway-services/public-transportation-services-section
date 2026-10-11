#!/usr/bin/env node
import process from "node:process";
import { projectRoutePosition } from "../src/project-route-position.mjs";
import { NORTH_SHORE_ROUTE } from "../src/north-shore-route-data.mjs";
import { renderNorthShoreWindow } from "../src/render-north-shore-window.mjs";

const action = process.argv[2] || "help";
try {
  if (action === "render") process.stdout.write(renderNorthShoreWindow());
  else if (action === "route") process.stdout.write(`${JSON.stringify(NORTH_SHORE_ROUTE, null, 2)}\n`);
  else if (action === "project") {
    let input = "";
    for await (const chunk of process.stdin) input += chunk;
    process.stdout.write(`${JSON.stringify(projectRoutePosition(JSON.parse(input), NORTH_SHORE_ROUTE.coordinates), null, 2)}\n`);
  } else {
    process.stdout.write("north-shore-window <render|route|project>\n\nproject reads a location observation as JSON on stdin.\n");
    if (action !== "help" && action !== "--help") process.exitCode = 1;
  }
} catch (error) {
  process.stderr.write(`north-shore-window: ${error.message}\n`);
  process.exitCode = 1;
}
