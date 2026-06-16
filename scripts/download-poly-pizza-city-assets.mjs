#!/usr/bin/env node

import { createWriteStream } from "node:fs";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { fileURLToPath } from "node:url";

const API_BASE_URL = "https://api.poly.pizza/v1.1";
const DEFAULT_MAX_MODEL_BYTES = 1_500_000;
const DEFAULT_OUTPUT_DIR = ["assets", "poly-pizza", "city"];
const SEARCH_GROUPS = [
  { group: "cars", query: "car", limit: 4 },
  { group: "lights", query: "street light", limit: 4 },
  { group: "traffic-lights", query: "traffic light", limit: 3 },
  { group: "signs", query: "road sign", limit: 4 },
  { group: "benches", query: "bench", limit: 3 },
  { group: "trees", query: "tree", limit: 4 },
  { group: "trash", query: "trash can", limit: 2 },
  { group: "hydrants", query: "fire hydrant", limit: 2 },
  { group: "streets", query: "street", limit: 3 }
];

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");

async function loadDotEnv() {
  try {
    const text = await readFile(path.join(repoRoot, ".env"), "utf8");
    for (const line of text.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;

      const equalsIndex = trimmed.indexOf("=");
      if (equalsIndex === -1) continue;

      const key = trimmed.slice(0, equalsIndex).trim();
      let value = trimmed.slice(equalsIndex + 1).trim();
      if (!key || process.env[key] !== undefined) continue;

      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }

      process.env[key] = value;
    }
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
}

function parseArgs(argv) {
  const args = {
    out: path.join(repoRoot, ...DEFAULT_OUTPUT_DIR),
    maxModelBytes: DEFAULT_MAX_MODEL_BYTES,
    force: false,
    dryRun: false
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--out") args.out = path.resolve(argv[++index]);
    else if (arg === "--max-model-bytes") args.maxModelBytes = Number(argv[++index]);
    else if (arg === "--force") args.force = true;
    else if (arg === "--dry-run") args.dryRun = true;
    else if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    } else {
      throw new Error(`Unknown option: ${arg}`);
    }
  }

  if (!Number.isFinite(args.maxModelBytes) || args.maxModelBytes < 1) {
    throw new Error("--max-model-bytes must be a positive number");
  }

  return args;
}

function printHelp() {
  console.log(`Download city prop models from Poly Pizza.

Usage:
  node scripts/download-poly-pizza-city-assets.mjs [options]

Options:
  --out <dir>              Output directory. Default: assets/poly-pizza/city
  --max-model-bytes <n>    Skip models larger than this. Default: ${DEFAULT_MAX_MODEL_BYTES}
  --force                  Re-download existing files.
  --dry-run                Search and write no files.
  -h, --help               Show this help.

Environment:
  POLY_PIZZA_API_KEY       Required Poly Pizza API key. Loaded from .env if present.
`);
}

function sanitizeFilePart(value) {
  return String(value || "model")
    .normalize("NFKD")
    .replace(/[^\w.-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80)
    .toLowerCase() || "model";
}

function extensionFromUrl(url, fallback) {
  try {
    const extension = path.extname(new URL(url).pathname);
    return extension || fallback;
  } catch (_error) {
    return fallback;
  }
}

async function fetchJson(url, apiKey) {
  const response = await fetch(url, {
    headers: {
      accept: "application/json",
      "x-auth-token": apiKey
    }
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`HTTP ${response.status} for ${url}: ${body.slice(0, 240)}`);
  }

  return response.json();
}

async function contentLength(url) {
  try {
    const response = await fetch(url, { method: "HEAD" });
    if (!response.ok) return null;
    const length = Number(response.headers.get("content-length"));
    return Number.isFinite(length) ? length : null;
  } catch (_error) {
    return null;
  }
}

async function searchGroup(group, apiKey, maxModelBytes) {
  const url = new URL(`${API_BASE_URL}/search/${encodeURIComponent(group.query)}`);
  url.searchParams.set("Limit", "24");
  url.searchParams.set("Page", "0");

  const payload = await fetchJson(url, apiKey);
  const results = Array.isArray(payload.results) ? payload.results : [];
  const selected = [];
  const seenIds = new Set();

  for (const model of results) {
    if (selected.length >= group.limit) break;
    if (!model.Download || !model.Thumbnail || seenIds.has(model.ID)) continue;

    const bytes = await contentLength(model.Download);
    if (bytes !== null && bytes > maxModelBytes) continue;

    selected.push({ ...model, group: group.group, modelBytesHint: bytes });
    seenIds.add(model.ID);
  }

  return selected;
}

async function downloadFile(url, outputPath, force) {
  if (!force) {
    try {
      const file = await stat(outputPath);
      if (file.isFile()) return { skipped: true, bytes: file.size };
    } catch (_error) {
      // File does not exist; download it.
    }
  }

  const response = await fetch(url);
  if (!response.ok || !response.body) {
    throw new Error(`HTTP ${response.status} while downloading ${url}`);
  }

  await pipeline(response.body, createWriteStream(outputPath));
  const file = await stat(outputPath);
  return { skipped: false, bytes: file.size };
}

function attributionMarkdown(models) {
  const lines = [
    "# Poly Pizza City Asset Attribution",
    "",
    "Models downloaded from https://poly.pizza. Keep this file with the downloaded assets.",
    ""
  ];

  for (const model of models) {
    lines.push(`- ${model.title} (${model.id})`);
    lines.push(`  - Group: ${model.group}`);
    lines.push(`  - Licence: ${model.licence}`);
    lines.push(`  - Creator: ${model.creator?.Username || "Unknown"}`);
    lines.push(`  - Source: ${model.sourceUrl}`);
    lines.push(`  - Attribution: ${model.attribution}`);
  }

  return `${lines.join("\n")}\n`;
}

async function main() {
  await loadDotEnv();
  const args = parseArgs(process.argv.slice(2));
  const apiKey = process.env.POLY_PIZZA_API_KEY;

  if (!apiKey || apiKey === "your_poly_pizza_api_key_here") {
    throw new Error("POLY_PIZZA_API_KEY is required. Add it to .env or export it before running this script.");
  }

  const matches = (await Promise.all(
    SEARCH_GROUPS.map((group) => searchGroup(group, apiKey, args.maxModelBytes))
  )).flat();

  if (args.dryRun) {
    for (const group of SEARCH_GROUPS) {
      const groupMatches = matches.filter((model) => model.group === group.group);
      console.log(`\n## ${group.group}`);
      for (const model of groupMatches) {
        console.log(`- ${model.Title} (${model.ID}) ${model.Licence} ${model.modelBytesHint ?? "unknown"} bytes`);
      }
    }
    return;
  }

  const modelsDir = path.join(args.out, "models");
  const thumbnailsDir = path.join(args.out, "thumbnails");
  await mkdir(modelsDir, { recursive: true });
  await mkdir(thumbnailsDir, { recursive: true });

  const manifest = [];

  for (const model of matches) {
    const fileBase = `${model.group}-${sanitizeFilePart(model.Title)}-${model.ID}`;
    const modelFile = `${fileBase}${extensionFromUrl(model.Download, ".glb")}`;
    const thumbnailFile = `${fileBase}${extensionFromUrl(model.Thumbnail, ".webp")}`;
    const modelPath = path.join(modelsDir, modelFile);
    const thumbnailPath = path.join(thumbnailsDir, thumbnailFile);

    console.log(`Downloading ${model.group}: ${model.Title} (${model.ID})`);
    const [modelDownload, thumbnailDownload] = await Promise.all([
      downloadFile(model.Download, modelPath, args.force),
      downloadFile(model.Thumbnail, thumbnailPath, args.force)
    ]);

    manifest.push({
      id: model.ID,
      group: model.group,
      title: model.Title,
      description: model.Description,
      category: model.Category,
      licence: model.Licence,
      attribution: model.Attribution,
      sourceUrl: model.SourceURL,
      creator: model.Creator,
      triCount: model.TriCount,
      animated: model.Animated,
      tags: model.Tags,
      downloadUrl: model.Download,
      thumbnailUrl: model.Thumbnail,
      localModel: path.relative(repoRoot, modelPath).replaceAll(path.sep, "/"),
      localThumbnail: path.relative(repoRoot, thumbnailPath).replaceAll(path.sep, "/"),
      bytes: {
        model: modelDownload.bytes,
        thumbnail: thumbnailDownload.bytes
      },
      skipped: {
        model: modelDownload.skipped,
        thumbnail: thumbnailDownload.skipped
      }
    });
  }

  await writeFile(path.join(args.out, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  await writeFile(path.join(args.out, "ATTRIBUTION.md"), attributionMarkdown(manifest));
  console.log(`Wrote ${path.relative(repoRoot, args.out)}/manifest.json with ${manifest.length} assets.`);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
