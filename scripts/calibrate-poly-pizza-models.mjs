#!/usr/bin/env node

import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const ROOT = process.cwd();
const OUTPUT = path.join(ROOT, "assets/poly-pizza/model-calibration.json");
const MANIFESTS = [
  path.join(ROOT, "assets/poly-pizza/houses/manifest.json"),
  path.join(ROOT, "assets/poly-pizza/homes/manifest.json")
];

const CURATED = {
  BH2XHWUNmF: { enabled: true, kind: "house", stories: 2, targetWidth: 2.85, targetDepth: 2.55, targetHeight: 3.35 },
  YDGLLT0emC: { enabled: true, kind: "small-house", stories: 1, targetWidth: 2.35, targetDepth: 2.05, targetHeight: 2.25 },
  "053kskrV4U_": { enabled: true, kind: "small-house", stories: 1, targetWidth: 2.3, targetDepth: 2.0, targetHeight: 2.15 },
  "75V_MLvKMqM": { enabled: true, kind: "house", stories: 2, targetWidth: 2.75, targetDepth: 2.35, targetHeight: 3.25 },
  "2K3bGB-w2qa": { enabled: true, kind: "house", stories: 2, targetWidth: 2.9, targetDepth: 2.45, targetHeight: 3.4 },
  dtgO5dwwtkk: { enabled: true, kind: "apartment", stories: 3, targetWidth: 3.1, targetDepth: 2.65, targetHeight: 4.45 },
  roqiHdrpgc: { enabled: true, kind: "house", stories: 2, targetWidth: 2.95, targetDepth: 2.55, targetHeight: 3.55 },
  "01lqee-dZAr": { enabled: true, kind: "apartment", stories: 3, targetWidth: 3.0, targetDepth: 2.5, targetHeight: 4.65 },
  "6PGyqELX8M-": { enabled: true, kind: "house", stories: 2, targetWidth: 2.65, targetDepth: 2.3, targetHeight: 3.2 },
  bHyQe5jzdiQ: { enabled: true, kind: "small-house", stories: 1, targetWidth: 2.55, targetDepth: 2.3, targetHeight: 2.35 },
  "diphAid-jq6": { enabled: false, reason: "Final footprint does not fit the Metagascar lot after standard house scaling." },
  f7uccD5iyz0: { enabled: false, reason: "Source transform produces extreme world bounds after import." },
  dTSrDa0oz0a: { enabled: false, reason: "Source transform produces extreme world bounds after import." },
  bnZkUs4qEdG: { enabled: false, reason: "Model file is too heavy for the current paged street view." },
  "7O3e5ZO7ec_": { enabled: false, reason: "Model file is too heavy for the current paged street view." },
  imVkxz7oZD: { enabled: false, reason: "Model file is too heavy for the current paged street view." },
  bvLXsDt9mww: { enabled: false, reason: "Model file is too heavy for the current paged street view." },
  "4NNkEGLAdOb": { enabled: false, reason: "Model file is too heavy for the current paged street view." }
};

async function readJson(file) {
  return JSON.parse(await readFile(file, "utf8"));
}

const manifests = (await Promise.all(MANIFESTS.map(readJson))).flat();
const availableIds = new Set(manifests.map((model) => model.id));
const models = {};

for (const [id, calibration] of Object.entries(CURATED)) {
  if (availableIds.has(id)) models[id] = calibration;
}

const calibration = {
  notes: [
    "Game world is normalized around a 1.0-unit exterior door height.",
    "Target dimensions are design-time values used to normalize Poly Pizza GLB assets whose source units vary by model.",
    "Disabled models had unusable source transforms or were too heavy for the street scene."
  ],
  unitSystem: {
    doorHeight: 1,
    floorHeight: 1.45
  },
  models
};

await writeFile(OUTPUT, `${JSON.stringify(calibration, null, 2)}\n`);
console.log(`Wrote ${path.relative(ROOT, OUTPUT)} with ${Object.keys(models).length} calibrated model entries.`);
