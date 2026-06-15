import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { createWriteStream } from "node:fs";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { fileURLToPath } from "node:url";

const API_BASE_URL = "https://api.poly.pizza/v1.1";
const DEFAULT_LIMIT = 10;
const DEFAULT_CATEGORY = 8; // Buildings / architecture

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const defaultOutputDir = path.join(repoRoot, "assets", "poly-pizza", "houses");

async function loadDotEnv() {
  const envPath = path.join(repoRoot, ".env");

  try {
    const text = await readFile(envPath, "utf8");
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
    query: "house",
    limit: DEFAULT_LIMIT,
    page: 0,
    category: DEFAULT_CATEGORY,
    license: null,
    out: defaultOutputDir,
    force: false,
    dryRun: false
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--query") args.query = argv[++index];
    else if (arg === "--limit") args.limit = Number(argv[++index]);
    else if (arg === "--page") args.page = Number(argv[++index]);
    else if (arg === "--category") args.category = Number(argv[++index]);
    else if (arg === "--license") args.license = argv[++index];
    else if (arg === "--out") args.out = path.resolve(argv[++index]);
    else if (arg === "--force") args.force = true;
    else if (arg === "--dry-run") args.dryRun = true;
    else if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    } else {
      throw new Error(`Unknown option: ${arg}`);
    }
  }

  if (!args.query?.trim()) throw new Error("--query must not be empty");
  if (!Number.isInteger(args.limit) || args.limit < 1) throw new Error("--limit must be a positive integer");
  if (!Number.isInteger(args.page) || args.page < 0) throw new Error("--page must be a non-negative integer");
  if (!Number.isInteger(args.category) || args.category < 0 || args.category > 11) {
    throw new Error("--category must be an integer from 0 through 11");
  }

  if (args.license !== null && !["cc0", "cc-by", "any"].includes(args.license)) {
    throw new Error("--license must be one of: cc0, cc-by, any");
  }

  return args;
}

function printHelp() {
  console.log(`Download house models from Poly Pizza.

Usage:
  node scripts/download-poly-pizza-houses.mjs [options]

Options:
  --query <term>       Search term. Default: house
  --limit <n>          Number of models to download. Default: ${DEFAULT_LIMIT}
  --page <n>           Starting API page. Default: 0
  --category <n>       Poly Pizza category index. Default: 8 (Buildings)
  --license <type>     any, cc0, or cc-by. Default: any
  --out <dir>          Output directory. Default: assets/poly-pizza/houses
  --force              Re-download existing files.
  --dry-run            Search and write no files.
  -h, --help           Show this help.

Environment:
  POLY_PIZZA_API_KEY   Required Poly Pizza API key. Loaded from .env if present.

Create a key at:
  https://poly.pizza/settings/api
`);
}

function licenseParam(license) {
  if (license === "cc-by") return 0;
  if (license === "cc0") return 1;
  return null;
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
    const pathname = new URL(url).pathname;
    const extension = path.extname(pathname);
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

async function searchModels(args, apiKey) {
  const models = [];
  let page = args.page;
  const license = licenseParam(args.license);

  while (models.length < args.limit) {
    const url = new URL(`${API_BASE_URL}/search/${encodeURIComponent(args.query)}`);
    url.searchParams.set("Limit", String(Math.min(32, args.limit - models.length)));
    url.searchParams.set("Page", String(page));
    url.searchParams.set("Category", String(args.category));
    if (license !== null) url.searchParams.set("License", String(license));

    const payload = await fetchJson(url, apiKey);
    const results = Array.isArray(payload.results) ? payload.results : [];
    if (results.length === 0) break;

    models.push(...results);
    if (models.length >= args.limit || models.length >= Number(payload.total || 0)) break;
    page += 1;
  }

  return models.slice(0, args.limit);
}

function attributionMarkdown(models) {
  const lines = [
    "# Poly Pizza House Model Attribution",
    "",
    "Models downloaded from https://poly.pizza. Keep this file with the downloaded assets.",
    ""
  ];

  for (const model of models) {
    lines.push(`- ${model.title} (${model.id})`);
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
    throw new Error("POLY_PIZZA_API_KEY is required. Add it to .env or export it before running this script. Create one at https://poly.pizza/settings/api.");
  }

  const models = await searchModels(args, apiKey);
  if (models.length === 0) {
    console.log("No Poly Pizza models matched the search.");
    return;
  }

  if (args.dryRun) {
    console.log(`Found ${models.length} models:`);
    for (const model of models) {
      console.log(`- ${model.Title} (${model.ID}) ${model.Licence} ${model.Download}`);
    }
    return;
  }

  const modelsDir = path.join(args.out, "models");
  const thumbnailsDir = path.join(args.out, "thumbnails");
  await mkdir(modelsDir, { recursive: true });
  await mkdir(thumbnailsDir, { recursive: true });

  const manifest = [];

  for (const model of models) {
    const fileBase = `${sanitizeFilePart(model.Title)}-${model.ID}`;
    const modelFile = `${fileBase}${extensionFromUrl(model.Download, ".glb")}`;
    const thumbnailFile = `${fileBase}${extensionFromUrl(model.Thumbnail, ".webp")}`;
    const modelPath = path.join(modelsDir, modelFile);
    const thumbnailPath = path.join(thumbnailsDir, thumbnailFile);

    console.log(`Downloading ${model.Title} (${model.ID})`);
    const modelDownload = await downloadFile(model.Download, modelPath, args.force);
    const thumbnailDownload = await downloadFile(model.Thumbnail, thumbnailPath, args.force);

    manifest.push({
      id: model.ID,
      title: model.Title,
      description: model.Description || "",
      category: model.Category,
      licence: model.Licence,
      attribution: model.Attribution,
      sourceUrl: `https://poly.pizza/m/${model.ID}`,
      creator: model.Creator || null,
      triCount: model["Tri Count"] ?? null,
      animated: Boolean(model.Animated),
      tags: model.Tags || [],
      downloadUrl: model.Download,
      thumbnailUrl: model.Thumbnail,
      localModel: path.relative(repoRoot, modelPath),
      localThumbnail: path.relative(repoRoot, thumbnailPath),
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

  console.log(`Saved ${manifest.length} models to ${path.relative(repoRoot, args.out)}`);
  console.log(`Manifest: ${path.relative(repoRoot, path.join(args.out, "manifest.json"))}`);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
