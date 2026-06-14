import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Contract, JsonRpcProvider, formatEther } from "ethers";

const CONTRACT_ADDRESS = "0xF286E4955557361a7D245358b0D47a3f5c735B2e";
const CHAIN_ID = 1;
const DEFAULT_RPC_URL = "https://ethereum-rpc.publicnode.com";
const SOURCIFY_METADATA_URL =
  `https://sourcify.dev/server/repository/contracts/full_match/${CHAIN_ID}/${CONTRACT_ADDRESS}/metadata.json`;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const outputDir = path.join(repoRoot, "data", "metagascar-contract");

const FALLBACK_ABI = [
  "function name() view returns (string)",
  "function symbol() view returns (string)",
  "function owner() view returns (address)",
  "function mintPrice() view returns (uint256)",
  "function totalSupply() view returns (uint256)",
  "function tokenByIndex(uint256 index) view returns (uint256)",
  "function ownerOf(uint256 tokenId) view returns (address)",
  "function tokenURI(uint256 tokenId) view returns (string)",
  "function getLand(uint256 tokenId) view returns (string)",
  "function getHomeStyle(uint256 tokenId) view returns (string)",
  "function getHomeSize(uint256 tokenId) view returns (string)",
  "function getDriveway(uint256 tokenId) view returns (string)",
  "function getDrivewayStyle(uint256 tokenId) view returns (string)"
];

const HOUSE_METHODS = [
  "getLand",
  "getHomeStyle",
  "getHomeSize",
  "getDriveway",
  "getDrivewayStyle"
];

function parseArgs(argv) {
  const args = {
    limit: null,
    start: 0,
    out: outputDir,
    fetchTokenMetadata: true
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--limit") args.limit = Number(argv[++index]);
    else if (arg === "--start") args.start = Number(argv[++index]);
    else if (arg === "--out") args.out = path.resolve(argv[++index]);
    else if (arg === "--no-token-metadata") args.fetchTokenMetadata = false;
    else if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    }
  }

  if (!Number.isInteger(args.start) || args.start < 0) {
    throw new Error("--start must be a non-negative integer");
  }

  if (args.limit !== null && (!Number.isInteger(args.limit) || args.limit < 1)) {
    throw new Error("--limit must be a positive integer");
  }

  return args;
}

function printHelp() {
  console.log(`Download Metagascar NFT house data from Ethereum.

Usage:
  node scripts/download-metagascar-contract-data.mjs [options]

Options:
  --start <n>              Start at enumerable token index n. Default: 0
  --limit <n>              Download at most n tokens.
  --out <dir>              Output directory. Default: data/metagascar-contract
  --no-token-metadata      Skip fetching tokenURI JSON.
  -h, --help               Show this help.

Environment:
  ETH_RPC_URL              Ethereum mainnet RPC URL. Defaults to ${DEFAULT_RPC_URL}
`);
}

async function fetchJson(url) {
  const response = await fetch(url, {
    headers: { accept: "application/json" }
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status} for ${url}`);
  }

  return response.json();
}

async function loadAbi() {
  try {
    const metadata = await fetchJson(SOURCIFY_METADATA_URL);
    if (Array.isArray(metadata?.output?.abi)) {
      return {
        abi: metadata.output.abi,
        source: SOURCIFY_METADATA_URL
      };
    }
  } catch (error) {
    console.warn(`Could not fetch Sourcify ABI: ${error.message}`);
  }

  console.warn("Using fallback ABI with ERC-721 and Metagascar house read methods.");
  return {
    abi: FALLBACK_ABI,
    source: "fallback"
  };
}

function tokenUriToHttp(uri) {
  if (!uri) return null;
  if (uri.startsWith("ipfs://")) {
    return `https://ipfs.io/ipfs/${uri.slice("ipfs://".length)}`;
  }
  if (uri.startsWith("ar://")) {
    return `https://arweave.net/${uri.slice("ar://".length)}`;
  }
  if (uri.startsWith("http://") || uri.startsWith("https://")) {
    return uri;
  }
  return null;
}

function tokenUriToDataJson(uri) {
  const prefix = "data:application/json;base64,";
  if (!uri?.startsWith(prefix)) return null;

  const encoded = uri.slice(prefix.length);
  return JSON.parse(Buffer.from(encoded, "base64").toString("utf8"));
}

async function maybeFetchTokenMetadata(tokenURI, enabled) {
  if (!enabled) return null;

  try {
    const inlineMetadata = tokenUriToDataJson(tokenURI);
    if (inlineMetadata) return inlineMetadata;
  } catch (error) {
    return {
      error: `Could not decode tokenURI data JSON: ${error.message}`
    };
  }

  const url = tokenUriToHttp(tokenURI);
  if (!url) return null;

  try {
    return await fetchJson(url);
  } catch (error) {
    return {
      error: error.message,
      source: url
    };
  }
}

async function readOptional(contract, method, args = []) {
  try {
    const value = await contract[method](...args);
    return { ok: true, value };
  } catch (error) {
    return { ok: false, error: error.shortMessage || error.message };
  }
}

function jsonReplacer(_key, value) {
  if (typeof value === "bigint") return value.toString();
  return value;
}

function csvEscape(value) {
  if (value === null || value === undefined) return "";
  const text = String(value);
  if (/[",\n\r]/.test(text)) return `"${text.replaceAll('"', '""')}"`;
  return text;
}

function tokensToCsv(tokens) {
  const headers = [
    "tokenId",
    "owner",
    "tokenURI",
    "land",
    "homeStyle",
    "homeSize",
    "driveway",
    "drivewayStyle",
    "metadataName",
    "metadataImage"
  ];

  const rows = tokens.map((token) => [
    token.tokenId,
    token.owner,
    token.tokenURI,
    token.house.land,
    token.house.homeStyle,
    token.house.homeSize,
    token.house.driveway,
    token.house.drivewayStyle,
    token.metadata?.name,
    token.metadata?.image
  ]);

  return [headers, ...rows]
    .map((row) => row.map(csvEscape).join(","))
    .join("\n");
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const rpcUrl = process.env.ETH_RPC_URL || DEFAULT_RPC_URL;
  const provider = new JsonRpcProvider(rpcUrl, CHAIN_ID);
  const { abi, source } = await loadAbi();
  const contract = new Contract(CONTRACT_ADDRESS, abi, provider);

  const [name, symbol, owner, mintPrice, totalSupply] = await Promise.all([
    contract.name(),
    contract.symbol(),
    readOptional(contract, "owner").then((result) => result.value ?? null),
    readOptional(contract, "mintPrice").then((result) => result.value ?? null),
    contract.totalSupply()
  ]);

  const total = Number(totalSupply);
  const end = args.limit === null ? total : Math.min(total, args.start + args.limit);

  if (args.start >= total) {
    throw new Error(`--start ${args.start} is outside totalSupply ${total}`);
  }

  console.log(`Contract: ${name} (${symbol})`);
  console.log(`Address: ${CONTRACT_ADDRESS}`);
  console.log(`ABI: ${source}`);
  console.log(`Total supply: ${total}`);
  console.log(`Downloading enumerable indexes ${args.start} through ${end - 1}`);

  const tokens = [];

  for (let index = args.start; index < end; index += 1) {
    const tokenIdBigInt = await contract.tokenByIndex(index);
    const tokenId = tokenIdBigInt.toString();

    const [ownerAddress, tokenURI, land, homeStyle, homeSize, driveway, drivewayStyle] =
      await Promise.all([
        contract.ownerOf(tokenIdBigInt),
        contract.tokenURI(tokenIdBigInt),
        contract.getLand(tokenIdBigInt),
        contract.getHomeStyle(tokenIdBigInt),
        contract.getHomeSize(tokenIdBigInt),
        contract.getDriveway(tokenIdBigInt),
        contract.getDrivewayStyle(tokenIdBigInt)
      ]);

    const metadata = await maybeFetchTokenMetadata(tokenURI, args.fetchTokenMetadata);

    tokens.push({
      tokenId,
      enumerableIndex: index,
      owner: ownerAddress,
      tokenURI,
      house: {
        land,
        homeStyle,
        homeSize,
        driveway,
        drivewayStyle
      },
      metadata
    });

    console.log(`Downloaded token ${tokenId} (${index + 1}/${end})`);
  }

  const summary = {
    contractAddress: CONTRACT_ADDRESS,
    chainId: CHAIN_ID,
    abiSource: source,
    readAt: new Date().toISOString(),
    rpcUrl: rpcUrl.replace(/(api[_-]?key=|\/v3\/)[^/?#]+/i, "$1***"),
    name,
    symbol,
    owner,
    mintPriceWei: mintPrice?.toString() ?? null,
    mintPriceEth: mintPrice === null ? null : formatEther(mintPrice),
    totalSupply: totalSupply.toString(),
    downloadedCount: tokens.length,
    startIndex: args.start,
    endIndexExclusive: end,
    houseMethods: HOUSE_METHODS
  };

  await mkdir(args.out, { recursive: true });
  await writeFile(path.join(args.out, "abi.json"), JSON.stringify(abi, jsonReplacer, 2));
  await writeFile(path.join(args.out, "contract-summary.json"), JSON.stringify(summary, jsonReplacer, 2));
  await writeFile(path.join(args.out, "tokens.json"), JSON.stringify(tokens, jsonReplacer, 2));
  await writeFile(path.join(args.out, "tokens.csv"), `${tokensToCsv(tokens)}\n`);

  console.log(`Wrote ${tokens.length} token records to ${args.out}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
