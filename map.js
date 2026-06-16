import { ethers } from "https://cdn.jsdelivr.net/npm/ethers@6.15.0/+esm";

const BABYLON = window.BABYLON;

const CONTRACT_ADDRESS = "0xF286E4955557361a7D245358b0D47a3f5c735B2e";
const CONTRACT_ABI = [
  "function mintPrice() view returns (uint256)",
  "function ownerOf(uint256 tokenId) view returns (address)",
  "function tokenURI(uint256 tokenId) view returns (string)",
  "function getLand(uint256 tokenId) view returns (string)",
  "function getHomeStyle(uint256 tokenId) view returns (string)",
  "function getHomeSize(uint256 tokenId) view returns (string)",
  "function getDriveway(uint256 tokenId) view returns (string)",
  "function getDrivewayStyle(uint256 tokenId) view returns (string)",
  "function claim(uint256 tokenId) payable"
];

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
const ETH_MAINNET = "0x1";
const PAGE_SIZE = 20;
const LOTS_PER_SIDE = PAGE_SIZE / 2;
const MAX_MODEL_BYTES = 950_000;
const ASSET_IMPORT_CONCURRENCY = 1;
const DETAIL_MODEL_LIMIT = 6;
const LOT_BUILD_BATCH_SIZE = 4;
const STREET_LABEL_INTERVAL_MS = 120;
const STREET_STREAM_IDLE_MS = 420;
const ASSET_IMPORT_IDLE_TIMEOUT_MS = 1200;
const ASSET_IMPORT_MOVE_PAUSE_MS = 160;
const NFT_START = 1;
const NFT_END = 8000;
const STREET_CSV_URL = "data/metagascar.streets.csv";
const STREET_VIEW_RADIUS = 0;
const HOUSE_STREAM_RADIUS = 0;
const PARALLEL_STREET_COUNT = STREET_VIEW_RADIUS * 2 + 1;
const STREET_SPACING = 22;
const ROAD_WIDTH = 6.8;
const ROAD_HALF = ROAD_WIDTH / 2;
const STREET_START_Z = 28;
const SPLIT_Z = -46;
const CROSS_STREET_WIDTH = 7.2;
const CROSS_STREET_LENGTH = 34;
const INTERSECTION_CLEARANCE_Z = SPLIT_Z + CROSS_STREET_WIDTH / 2 + 3.6;
const FIRST_LOT_Z = 15;
const LAST_LOT_Z = INTERSECTION_CLEARANCE_Z + 3.2;
const SIDEWALK_WIDTH = 1.35;
const PARCEL_CENTER_X = 8.45;
const WORLD_EDGE_PADDING = 16.5;
const GRID_WIDTH = STREET_SPACING * (PARALLEL_STREET_COUNT - 1) + ROAD_WIDTH;
const LOT_SPACING = (FIRST_LOT_Z - LAST_LOT_Z) / (LOTS_PER_SIDE - 1);
const STREET_DECOR_ROWS = 6;
const STREET_DECOR_SPACING = (FIRST_LOT_Z - LAST_LOT_Z) / (STREET_DECOR_ROWS - 1);
const STANDARD_DOOR_HEIGHT = 1.0;
const STANDARD_FLOOR_HEIGHT = 1.45;
const ROOF_HEIGHT_ALLOWANCE = 0.5;
const FALLBACK_DOOR_HEIGHT = 0.82;
const FALLBACK_DOOR_WIDTH = 0.34;
const MIN_REASONABLE_MODEL_SCALE = 0.01;
const MAX_REASONABLE_MODEL_SCALE = 28.0;
const MAX_VERTICAL_STRETCH = 2.4;
const MAX_FINAL_HOUSE_HEIGHT = 5.1;
const CALIBRATION_URL = "assets/poly-pizza/model-calibration.json";
const CITY_ASSET_MANIFEST_URL = "assets/poly-pizza/city/manifest.json";
const ASSET_MANIFESTS = [
  "assets/poly-pizza/houses/manifest.json",
  "assets/poly-pizza/homes/manifest.json"
];
const CITY_PROP_TARGETS = {
  cars: { height: 0.62, maxWidth: 1.25, maxDepth: 2.0 },
  lights: { height: 2.35, maxWidth: 0.72, maxDepth: 0.72 },
  "traffic-lights": { height: 2.45, maxWidth: 0.9, maxDepth: 0.9 },
  signs: { height: 1.2, maxWidth: 1.15, maxDepth: 0.75 },
  benches: { height: 0.52, maxWidth: 1.45, maxDepth: 0.72 },
  trees: { height: 1.9, maxWidth: 0.9, maxDepth: 0.9 },
  trash: { height: 0.58, maxWidth: 0.55, maxDepth: 0.55 },
  hydrants: { height: 0.58, maxWidth: 0.5, maxDepth: 0.5 },
  streets: { height: 0.04, maxWidth: 6.8, maxDepth: 6.8 }
};
const MAP_SURFACE_ZONES = {
  road: { label: "road", offset: 0, halfWidth: ROAD_HALF },
  parking: { label: "curbside parking", offset: ROAD_HALF + 0.55, halfWidth: 0.42 },
  curb: { label: "curb", offset: ROAD_HALF + 0.24, halfWidth: 0.18 },
  sidewalk: { label: "sidewalk", offset: ROAD_HALF + SIDEWALK_WIDTH / 2 + 0.28, halfWidth: SIDEWALK_WIDTH / 2 },
  furniture: { label: "sidewalk furniture strip", offset: ROAD_HALF + SIDEWALK_WIDTH + 0.3, halfWidth: 0.42 },
  planting: { label: "planting yard", offset: ROAD_HALF + SIDEWALK_WIDTH + 3.1, halfWidth: 0.85 }
};
const ENABLE_IMPORTED_CITY_PROPS = false;
const CITY_PROP_ZONES = {};
const DISABLED_CITY_ASSET_GROUPS = new Set([
  "cars",
  "trees",
  "streets",
  "lights",
  "traffic-lights",
  "signs",
  "benches",
  "trash",
  "hydrants"
]);

window.METAGASCAR_MAP_ZONES = MAP_SURFACE_ZONES;

const canvas = document.querySelector("#map-scene");
const connectButton = document.querySelector("#connect-wallet");
const mintButton = document.querySelector("#mint-button");
const mintNote = document.querySelector("#mint-note");
const toast = document.querySelector("#toast");
const detailPanel = document.querySelector(".detail-panel");
const blockLabel = document.querySelector("#block-label");
const prevBlock = document.querySelector("#prev-block");
const nextBlock = document.querySelector("#next-block");
const walkForward = document.querySelector("#walk-forward");
const walkBack = document.querySelector("#walk-back");
const streetLabel = document.querySelector("#street-label");
const closePanel = document.querySelector("#close-panel");

const details = {
  status: document.querySelector("#status-pill"),
  name: document.querySelector("#house-name"),
  preview: document.querySelector("#house-preview"),
  token: document.querySelector("#detail-token"),
  land: document.querySelector("#detail-land"),
  home: document.querySelector("#detail-home"),
  size: document.querySelector("#detail-size"),
  driveway: document.querySelector("#detail-driveway"),
  owner: document.querySelector("#detail-owner")
};

let houseData = [];
let streetRows = [];
let streetNames = [];
let assetModels = [];
let cityAssetsByGroup = new Map();
let modelCalibration = null;
let visibleOffset = 0;
let currentStreetIndex = 0;
let renderedStreetCenter = null;
let selectedHouse = null;
let selectedNode = null;
let cityWindowVersion = 0;
let mintStatusRequestId = 0;
let signer = null;
let readContract = null;
let writeContract = null;
let mintPrice = null;
let walletAddress = null;
let renderLoopStarted = false;
let lastStreetLabel = "";
let lastStreetLabelUpdate = 0;
let pendingStreamStreetIndex = null;
let pendingStreamSince = 0;

const engine = new BABYLON.Engine(canvas, true, {
  preserveDrawingBuffer: false,
  stencil: true,
  antialias: true
});
engine.setHardwareScalingLevel(clamp(window.devicePixelRatio / 1.5, 1, 1.75));

const scene = new BABYLON.Scene(engine);
scene.clearColor = new BABYLON.Color4(0.02, 0.07, 0.06, 1);
scene.fogMode = BABYLON.Scene.FOGMODE_EXP2;
scene.fogDensity = 0.025;
scene.fogColor = new BABYLON.Color3(0.03, 0.09, 0.08);
scene.collisionsEnabled = true;

const camera = new BABYLON.UniversalCamera("playerCamera", new BABYLON.Vector3(0, 2.1, 27), scene);
camera.minZ = 0.05;
camera.maxZ = 180;
camera.fov = 0.92;
camera.speed = 0.82;
camera.angularSensibility = 2600;
camera.inertia = 0.42;
camera.checkCollisions = true;
camera.ellipsoid = new BABYLON.Vector3(0.55, 0.9, 0.55);
camera.setTarget(new BABYLON.Vector3(0, 1.35, -6));
camera.attachControl(canvas, true);
scene.activeCamera = camera;

const WALK_SPEED = 8.5;
const SPRINT_SPEED = 16;
const movementKeys = new Set();

const light = new BABYLON.HemisphericLight("skyLight", new BABYLON.Vector3(0.25, 1, 0.2), scene);
light.intensity = 0.82;
light.groundColor = new BABYLON.Color3(0.18, 0.08, 0.2);

const sun = new BABYLON.DirectionalLight("sun", new BABYLON.Vector3(-0.35, -0.82, -0.18), scene);
sun.position = new BABYLON.Vector3(14, 22, 10);
sun.intensity = 2.25;

const glowLight = new BABYLON.PointLight("metagascarGlow", new BABYLON.Vector3(0, 5, -15), scene);
glowLight.diffuse = BABYLON.Color3.FromHexString("#7cffc4");
glowLight.intensity = 0.65;
glowLight.range = 45;

const shadowGenerator = new BABYLON.ShadowGenerator(1024, sun);
shadowGenerator.useBlurExponentialShadowMap = true;
shadowGenerator.blurKernel = 24;
shadowGenerator.getShadowMap().refreshRate = BABYLON.RenderTargetTexture.REFRESHRATE_RENDER_ONCE;

const dynamicNodes = [];
const pageNodes = [];
const pickableMeshes = [];
const assetImportQueue = [];
let activeAssetImports = 0;
const assetPrefetches = new Map();
const materialCache = new Map();

function mat(name, hex, options = {}) {
  if (materialCache.has(name)) return materialCache.get(name);
  const material = new BABYLON.StandardMaterial(name, scene);
  material.diffuseColor = BABYLON.Color3.FromHexString(hex);
  material.specularColor = BABYLON.Color3.FromHexString(options.specular || "#111111");
  material.emissiveColor = BABYLON.Color3.FromHexString(options.emissive || "#000000");
  material.alpha = options.alpha ?? 1;
  if (material.alpha < 1) material.transparencyMode = BABYLON.Material.MATERIAL_ALPHABLEND;
  materialCache.set(name, material);
  return material;
}

const materials = {
  road: mat("road", "#17191b", { specular: "#080808" }),
  roadLine: mat("roadLine", "#f4ffe9", { emissive: "#293125" }),
  stripe: mat("stripe", "#d7ff3f", { emissive: "#415000" }),
  grass: mat("grass", "#35a557"),
  lot: mat("lot", "#1a4637"),
  sidewalk: mat("sidewalk", "#aeb9ae"),
  curb: mat("curb", "#e1e7dc"),
  concrete: mat("concrete", "#b9c0b8"),
  brick: mat("brick", "#a74835"),
  asphalt: mat("driveAsphalt", "#25292b"),
  gravel: mat("gravel", "#a5aa9f"),
  basalt: mat("basalt", "#111719"),
  cobble: mat("cobble", "#7f8d84"),
  shell: mat("shell", "#d6d9ce"),
  glass: mat("glass", "#7cffc4", { alpha: 0.55, emissive: "#10372d" }),
  aqua: mat("aqua", "#3be7ff", { emissive: "#052e36" }),
  coral: mat("coral", "#ff6f61", { emissive: "#42100c" }),
  orchid: mat("orchid", "#c67dff", { emissive: "#2a0d44" }),
  volt: mat("volt", "#d7ff3f", { emissive: "#334000" }),
  dark: mat("dark", "#101817"),
  selected: mat("selected", "#7cffc4", { emissive: "#125d45", alpha: 0.72 })
};

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("is-visible");
  window.clearTimeout(showToast.timeout);
  showToast.timeout = window.setTimeout(() => toast.classList.remove("is-visible"), 3600);
}

function shortenAddress(address) {
  if (!address || address === ZERO_ADDRESS) return "Unminted";
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function traitNumber(value, fallback) {
  const match = String(value || "").match(/\d+/);
  return match ? Number(match[0]) : fallback;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function nextFrame() {
  return new Promise((resolve) => window.requestAnimationFrame(() => resolve()));
}

function delay(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function idleFrame(timeout = ASSET_IMPORT_IDLE_TIMEOUT_MS) {
  if (window.requestIdleCallback) {
    return new Promise((resolve) => window.requestIdleCallback(resolve, { timeout }));
  }
  return delay(32);
}

function scaleFromRange(value, minValue, maxValue, minScale, maxScale) {
  const normalized = (value - minValue) / (maxValue - minValue);
  return minScale + clamp(normalized, 0, 1) * (maxScale - minScale);
}

function parseCsvLine(line) {
  const values = [];
  let current = "";
  let quoted = false;

  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (character === '"') {
      if (quoted && line[index + 1] === '"') {
        current += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (character === "," && !quoted) {
      values.push(current.trim());
      current = "";
    } else {
      current += character;
    }
  }

  values.push(current.trim());
  return values;
}

function streetNameFromAddress(address) {
  return String(address || "").replace(/^\d+\s+/, "").trim();
}

function activeStreetIndex() {
  return currentStreetIndex;
}

function activeStreetName() {
  return streetNames[activeStreetIndex()] || "Metagascar Street";
}

function maxStreetIndex() {
  return Math.max(0, streetNames.length - 1);
}

function worldXForStreet(streetIndex) {
  return streetIndex * STREET_SPACING;
}

function streetIndexForWorldX(x) {
  return clamp(Math.round(x / STREET_SPACING), 0, maxStreetIndex());
}

function streetRowsForIndex(streetIndex) {
  const start = streetIndex * PAGE_SIZE;
  return houseData.slice(start, start + PAGE_SIZE);
}

async function loadStreetRows() {
  const response = await fetch(STREET_CSV_URL);
  if (!response.ok) throw new Error(`Could not load ${STREET_CSV_URL}: HTTP ${response.status}`);
  const rows = (await response.text())
    .trim()
    .split(/\r?\n/)
    .map((line) => parseCsvLine(line))
    .filter((columns) => columns.length >= 7)
    .map((columns) => {
      const sourceId = Number(columns[1]);
      const tokenNumber = sourceId;
      const streetName = streetNameFromAddress(columns[0]);
      return {
        sourceId,
        tokenId: String(tokenNumber),
        address: columns[0],
        streetName,
        name: columns[0],
        loaded: true,
        homeStyle: columns[2],
        homeSize: columns[3],
        drivewayStyle: columns[4],
        driveway: columns[5],
        land: columns[6],
        mintedAt: columns[7],
        hubUrl: columns[8],
        mapUrl: columns[9]
      };
    })
    .filter((row) => row.sourceId >= NFT_START && Number(row.tokenId) <= NFT_END);

  const names = [];
  for (let index = 0; index < rows.length; index += PAGE_SIZE) {
    names.push(rows[index]?.streetName || `Street ${Math.floor(index / PAGE_SIZE) + 1}`);
  }
  streetNames = names;
  return rows;
}

function storyCountForHouse(house) {
  const style = String(house.homeStyle || "").toLowerCase();
  if (style.includes("apartment") || style.includes("second empire")) return 3;
  if (style.includes("victorian") || style.includes("queen anne")) return 3;
  if (style.includes("ranch") || style.includes("pueblo") || style.includes("cottage") || style.includes("cabin")) return 1;
  return traitNumber(house.homeSize, 6000) > 7600 ? 2.5 : 2;
}

function targetHouseDimensions(house, parcelDepth, parcelFrontage, model) {
  const homeSqft = traitNumber(house.homeSize, 6000);
  const modelDefaults = model?.calibration || {};
  const stories = modelDefaults.stories || storyCountForHouse(house);
  const sizeFactor = clamp(Math.sqrt(homeSqft / 6200), 0.84, 1.18);
  const heightFactor = clamp(sizeFactor, 0.94, 1.06);
  const maxWidth = parcelFrontage * 0.76;
  const maxDepth = parcelDepth * 0.74;
  const baseWidth = modelDefaults.targetWidth || 2.55;
  const baseDepth = modelDefaults.targetDepth || 2.25;
  const baseHeight = modelDefaults.targetHeight || (stories * STANDARD_FLOOR_HEIGHT + ROOF_HEIGHT_ALLOWANCE);
  const targetWidth = clamp(baseWidth * sizeFactor, 1.85, maxWidth);
  const targetDepth = clamp(baseDepth * sizeFactor, 1.65, maxDepth);
  const targetHeight = clamp(baseHeight * heightFactor, STANDARD_DOOR_HEIGHT * 1.75, MAX_FINAL_HOUSE_HEIGHT);

  return { targetWidth, targetDepth, targetHeight, stories };
}

function decodeTokenMetadata(tokenURI) {
  const prefix = "data:application/json;base64,";
  if (!tokenURI?.startsWith(prefix)) return null;

  try {
    return JSON.parse(window.atob(tokenURI.slice(prefix.length)));
  } catch (_error) {
    return null;
  }
}

async function loadHouseDetails(house) {
  if (house.loaded) return house;

  const [land, homeStyle, homeSize, driveway, drivewayStyle, tokenURI] = await Promise.all([
    readContract.getLand(house.tokenId),
    readContract.getHomeStyle(house.tokenId),
    readContract.getHomeSize(house.tokenId),
    readContract.getDriveway(house.tokenId),
    readContract.getDrivewayStyle(house.tokenId),
    readContract.tokenURI(house.tokenId)
  ]);
  const metadata = decodeTokenMetadata(tokenURI);

  Object.assign(house, {
    loaded: true,
    name: metadata?.name || `Metagascar #${house.tokenId}`,
    description: metadata?.description || "",
    image: metadata?.image || null,
    land,
    homeStyle,
    homeSize,
    driveway,
    drivewayStyle
  });

  return house;
}

function createBox(name, width, height, depth, position, material, options = {}) {
  const mesh = BABYLON.MeshBuilder.CreateBox(name, { width, height, depth }, scene);
  mesh.position = position;
  mesh.material = material;
  mesh.checkCollisions = options.collisions ?? false;
  mesh.isPickable = options.pickable ?? false;
  if (options.receiveShadows) mesh.receiveShadows = true;
  if (options.castShadows) shadowGenerator.addShadowCaster(mesh);
  if (options.dynamic) dynamicNodes.push(mesh);
  return mesh;
}

function createPlaneBox(name, width, depth, y, z, material, x = 0) {
  return createBox(name, width, 0.05, depth, new BABYLON.Vector3(x, y, z), material, {
    receiveShadows: true
  });
}

function trackPageNode(node) {
  pageNodes.push(node);
  return node;
}

function createStreetNameSign(streetName, streetIndex) {
  const root = new BABYLON.TransformNode(`streetName-${streetIndex}-${streetName}`, scene);
  const roadCenterX = worldXForStreet(streetIndex);
  root.position = new BABYLON.Vector3(roadCenterX, 0, FIRST_LOT_Z + 3.2);
  trackPageNode(root);

  const post = createBox("streetNamePost", 0.08, 1.05, 0.08, new BABYLON.Vector3(-1.6, 0.55, 0), materials.curb);
  post.parent = root;

  const plane = BABYLON.MeshBuilder.CreatePlane("streetNamePanel", { width: 3.3, height: 0.58 }, scene);
  plane.position = new BABYLON.Vector3(0, 1.2, 0);
  const texture = new BABYLON.DynamicTexture(`streetNameTexture-${streetName}`, { width: 512, height: 128 }, scene, false);
  const context = texture.getContext();
  context.fillStyle = "#06110f";
  context.fillRect(0, 0, 512, 128);
  context.strokeStyle = "#7cffc4";
  context.lineWidth = 5;
  context.strokeRect(8, 8, 496, 112);
  context.fillStyle = "#f4ffe9";
  context.font = "bold 40px Arial";
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText(streetName.toUpperCase(), 256, 64, 462);
  texture.update();
  const material = new BABYLON.StandardMaterial(`streetNameMaterial-${streetName}`, scene);
  material.diffuseTexture = texture;
  material.emissiveColor = BABYLON.Color3.FromHexString(streetIndex === currentStreetIndex ? "#153b2d" : "#071b17");
  material.specularColor = BABYLON.Color3.Black();
  plane.material = material;
  plane.parent = root;
}

function addVisibleStreetNames(centerStreetIndex) {
  for (let streetIndex = Math.max(0, centerStreetIndex - STREET_VIEW_RADIUS); streetIndex <= Math.min(maxStreetIndex(), centerStreetIndex + STREET_VIEW_RADIUS); streetIndex += 1) {
    const name = streetNames[streetIndex];
    if (name) createStreetNameSign(name, streetIndex);
  }
}

function drivewayMaterial(driveway) {
  const text = String(driveway || "").toLowerCase();
  if (text.includes("brick")) return materials.brick;
  if (text.includes("asphalt") || text.includes("tar")) return materials.asphalt;
  if (text.includes("concrete") || text.includes("paver")) return materials.concrete;
  if (text.includes("basalt")) return materials.basalt;
  if (text.includes("cobblestone")) return materials.cobble;
  if (text.includes("crushed")) return materials.shell;
  return materials.gravel;
}

function selectCityAsset(group, seed = 0) {
  const assets = cityAssetsByGroup.get(group) || [];
  if (assets.length === 0) return null;
  return assets[Math.abs(seed) % assets.length];
}

function zonePosition(roadCenterX, side, zoneName, z, y = 0.08) {
  const zone = MAP_SURFACE_ZONES[zoneName] || MAP_SURFACE_ZONES.furniture;
  return new BABYLON.Vector3(roadCenterX + side * zone.offset, y, z);
}

function queueCityPropInZone(group, roadCenterX, side, z, options = {}) {
  const zone = options.zone || CITY_PROP_ZONES[group] || "furniture";
  return queueCityProp(group, zonePosition(roadCenterX, side, zone, z, options.y ?? 0.08), {
    ...options,
    zone
  });
}

function queueCityProp(group, position, options = {}) {
  if (!ENABLE_IMPORTED_CITY_PROPS) return null;
  const asset = selectCityAsset(group, options.seed || 0);
  if (!asset) return null;

  const root = new BABYLON.TransformNode(`cityProp-${group}-${asset.id}`, scene);
  root.position = position.clone();
  root.rotation.y = options.rotationY || 0;
  root.metadata = { asset, cityProp: true, zone: options.zone || null };
  trackPageNode(root);

  prefetchAssetModel(asset);
  assetImportQueue.push(() => addCityPropAsset(asset, root, group, options.expectedVersion || cityWindowVersion));
  runNextAssetImport();
  return root;
}

async function addCityPropAsset(asset, root, group, expectedVersion) {
  if (expectedVersion !== cityWindowVersion || root.isDisposed?.()) return;
  const target = CITY_PROP_TARGETS[group] || { height: 1, maxWidth: 1, maxDepth: 1 };
  const { rootUrl, filename } = assetPathParts(asset);

  try {
    await prefetchAssetModel(asset);
    if (expectedVersion !== cityWindowVersion || root.isDisposed?.()) return;
    while (movementKeys.size > 0) await delay(ASSET_IMPORT_MOVE_PAUSE_MS);
    await idleFrame();
    await nextFrame();
    if (expectedVersion !== cityWindowVersion || root.isDisposed?.()) return;

    const result = await BABYLON.SceneLoader.ImportMeshAsync("", rootUrl, filename, scene);
    const importedNodes = [...result.meshes, ...result.transformNodes];
    const meshes = result.meshes.filter((mesh) => mesh instanceof BABYLON.Mesh && mesh.getTotalVertices() > 0);

    if (expectedVersion !== cityWindowVersion || root.isDisposed?.()) {
      for (const node of importedNodes) node.dispose?.();
      return;
    }

    const anchorWorld = root.getAbsolutePosition().clone();
    const modelRoot = new BABYLON.TransformNode(`cityPropContent-${asset.id}`, scene);
    modelRoot.parent = root;

    for (const node of importedNodes) {
      if (!node.parent || !importedNodes.includes(node.parent)) node.parent = modelRoot;
    }

    const bounds = meshBounds(meshes);
    if (bounds) {
      modelRoot.position = new BABYLON.Vector3(-bounds.center.x, -bounds.min.y, -bounds.center.z);
      const heightScale = target.height / Math.max(bounds.size.y, 0.01);
      const widthScale = target.maxWidth / Math.max(bounds.size.x, 0.01);
      const depthScale = target.maxDepth / Math.max(bounds.size.z, 0.01);
      const scale = clamp(Math.min(heightScale, widthScale, depthScale), 0.01, 12);
      modelRoot.scaling = new BABYLON.Vector3(scale, scale, scale);
      modelRoot.computeWorldMatrix(true);
      for (const mesh of meshes) mesh.computeWorldMatrix(true);

      const scaledBounds = meshBounds(meshes);
      if (scaledBounds) {
        root.position.addInPlace(new BABYLON.Vector3(
          anchorWorld.x - scaledBounds.center.x,
          anchorWorld.y - scaledBounds.min.y,
          anchorWorld.z - scaledBounds.center.z
        ));
      }
    }

    for (const mesh of meshes) {
      mesh.isPickable = false;
      mesh.checkCollisions = false;
      mesh.metadata = { asset, cityProp: true };
    }
  } catch (error) {
    console.warn(`Could not load city asset ${asset.localModel}: ${error.message}`);
  }
}

function addStreetFurniture(side, z, roadCenterX = 0, options = {}) {
  const x = zonePosition(roadCenterX, side, "furniture", z).x;
  trackPageNode(createBox("lampPost", 0.08, 2.2, 0.08, new BABYLON.Vector3(x, 1.1, z), materials.dark));
  const lamp = BABYLON.MeshBuilder.CreateSphere("lampGlow", { diameter: 0.34, segments: 12 }, scene);
  lamp.position = new BABYLON.Vector3(x, 2.32, z);
  lamp.material = materials.volt;
  trackPageNode(lamp);
  if (options.streamAssets) {
    queueCityPropInZone("lights", roadCenterX, side, z, {
      expectedVersion: options.expectedVersion,
      rotationY: side < 0 ? Math.PI / 2 : -Math.PI / 2,
      seed: options.seed
    });
  }

  const signX = zonePosition(roadCenterX, side, "furniture", z + 1.8).x;
  trackPageNode(createBox("streetSignPost", 0.06, 1.05, 0.06, new BABYLON.Vector3(signX, 0.55, z + 1.8), materials.curb));
  trackPageNode(createBox("streetSignPanel", 0.7, 0.28, 0.06, new BABYLON.Vector3(signX, 1.12, z + 1.8), materials.aqua));
  if (options.streamAssets) {
    queueCityPropInZone("signs", roadCenterX, side, z + 1.8, {
      expectedVersion: options.expectedVersion,
      rotationY: side < 0 ? Math.PI / 2 : -Math.PI / 2,
      seed: (options.seed || 0) + 3
    });
  }
}

function addCar(side, z, material, roadCenterX = 0, options = {}) {
  const root = new BABYLON.TransformNode("parkedCar", scene);
  trackPageNode(root);
  root.position = zonePosition(roadCenterX, side, "parking", z, 0.04);
  root.rotation.y = side < 0 ? Math.PI : 0;
  createBox("carBody", 0.95, 0.32, 1.65, new BABYLON.Vector3(0, 0.28, 0), material).parent = root;
  createBox("carCabin", 0.62, 0.26, 0.72, new BABYLON.Vector3(0, 0.58, -0.05), materials.glass).parent = root;
  for (const x of [-0.42, 0.42]) {
    for (const wheelZ of [-0.54, 0.54]) {
      const wheel = BABYLON.MeshBuilder.CreateCylinder("wheel", { height: 0.12, diameter: 0.24, tessellation: 12 }, scene);
      wheel.position = new BABYLON.Vector3(x, 0.17, wheelZ);
      wheel.rotation.z = Math.PI / 2;
      wheel.material = materials.dark;
      wheel.parent = root;
    }
  }
}

function addGroundWindow(centerStreetIndex, expectedVersion = cityWindowVersion) {
  const startStreet = Math.max(0, centerStreetIndex - STREET_VIEW_RADIUS);
  const endStreet = Math.min(maxStreetIndex(), centerStreetIndex + STREET_VIEW_RADIUS);
  const startX = worldXForStreet(startStreet);
  const endX = worldXForStreet(endStreet);
  const windowCenterX = (startX + endX) / 2;
  const windowWidth = Math.max(GRID_WIDTH, endX - startX + ROAD_WIDTH);

  trackPageNode(createPlaneBox("grassWindow", windowWidth + 36, 104, -0.03, -18, materials.grass, windowCenterX));
  for (const z of [FIRST_LOT_Z + 6.5, -15.5, SPLIT_Z]) {
    const width = windowWidth + ROAD_WIDTH;
    const depth = z === -15.5 ? CROSS_STREET_WIDTH * 0.72 : CROSS_STREET_WIDTH;
    trackPageNode(createPlaneBox("crossStreet", width, depth, 0.025, z, materials.road, windowCenterX));
  }

  for (let streetIndex = startStreet; streetIndex <= endStreet; streetIndex += 1) {
    const roadCenterX = worldXForStreet(streetIndex);
    const streamAssets = streetIndex === centerStreetIndex;
    trackPageNode(createPlaneBox("road", ROAD_WIDTH, 88, 0.02, -18, materials.road, roadCenterX));
    trackPageNode(createPlaneBox("stopBar", ROAD_WIDTH - 0.8, 0.16, 0.07, SPLIT_Z + CROSS_STREET_WIDTH * 0.52, materials.roadLine, roadCenterX));

    for (const side of [-1, 1]) {
      const sidewalkX = roadCenterX + side * (ROAD_HALF + SIDEWALK_WIDTH / 2 + 0.28);
      trackPageNode(createPlaneBox("sidewalk", SIDEWALK_WIDTH, 88, 0.06, -18, materials.sidewalk, sidewalkX));
      trackPageNode(createBox("curb", 0.18, 0.18, 88, new BABYLON.Vector3(roadCenterX + side * (ROAD_HALF + 0.12), 0.11, -18), materials.curb));
      trackPageNode(createBox("propertyEdge", 0.06, 0.08, 88, new BABYLON.Vector3(roadCenterX + side * (ROAD_HALF + SIDEWALK_WIDTH + 0.48), 0.09, -18), materials.curb));
    }

    for (let index = 0; index < 15; index += 1) {
      trackPageNode(createPlaneBox("centerStripe", 0.2, 1.8, 0.08, FIRST_LOT_Z - index * 4.2, materials.stripe, roadCenterX));
    }

    for (const z of [17.4, INTERSECTION_CLEARANCE_Z]) {
      for (let index = 0; index < 7; index += 1) {
        trackPageNode(createPlaneBox("crosswalk", 0.38, ROAD_WIDTH + 0.8, 0.09, z, materials.roadLine, roadCenterX - 2.7 + index * 0.9));
      }
    }

    const carMaterials = [materials.aqua, materials.coral, materials.orchid, materials.curb];
    for (const side of [-1, 1]) {
      [10.8, -18.8].forEach((z, index) => addCar(side, z, carMaterials[(index + streetIndex + (side > 0 ? 1 : 0)) % carMaterials.length], roadCenterX, {
        expectedVersion,
        streamAssets,
        seed: streetIndex * 11 + index + (side > 0 ? 5 : 0)
      }));

      if (streamAssets) {
        queueCityPropInZone("traffic-lights", roadCenterX, side, INTERSECTION_CLEARANCE_Z + 1.8, {
          expectedVersion,
          rotationY: side < 0 ? Math.PI / 2 : -Math.PI / 2,
          seed: streetIndex * 7 + (side > 0 ? 2 : 0)
        });
        queueCityPropInZone("hydrants", roadCenterX, side, 8.4, {
          expectedVersion,
          rotationY: side < 0 ? Math.PI / 2 : -Math.PI / 2,
          seed: streetIndex * 13 + (side > 0 ? 1 : 0)
        });
      }

      for (let row = 0; row < STREET_DECOR_ROWS; row += 2) {
        const z = FIRST_LOT_Z - row * STREET_DECOR_SPACING;
        addStreetFurniture(side, z - 2.35, roadCenterX, {
          expectedVersion,
          streamAssets,
          seed: streetIndex * 17 + row + (side > 0 ? 4 : 0)
        });
        const treeX = zonePosition(roadCenterX, side, "planting", z + 2.3).x;
        trackPageNode(createBox("treeTrunk", 0.14, 0.9, 0.14, new BABYLON.Vector3(treeX, 0.48, z + 2.3), materials.brick));
        const top = BABYLON.MeshBuilder.CreateSphere("treeTop", { diameter: 0.7, segments: 12 }, scene);
        top.position = new BABYLON.Vector3(treeX, 1.12, z + 2.3);
        top.material = materials.volt;
        trackPageNode(top);
        if (streamAssets && row % 4 === 0) {
          queueCityPropInZone("benches", roadCenterX, side, z - 0.35, {
            expectedVersion,
            rotationY: side < 0 ? Math.PI / 2 : -Math.PI / 2,
            seed: streetIndex * 23 + row + (side > 0 ? 8 : 0)
          });
          queueCityPropInZone("trash", roadCenterX, side, z - 0.95, {
            expectedVersion,
            seed: streetIndex * 29 + row + (side > 0 ? 6 : 0)
          });
        }
      }
    }
  }
}

async function loadAssetManifests() {
  const calibration = await fetch(CALIBRATION_URL)
    .then((response) => {
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return response.json();
    })
    .catch((error) => {
      console.warn(`Could not load ${CALIBRATION_URL}: ${error.message}`);
      return { models: {} };
    });
  modelCalibration = calibration;

  const manifests = await Promise.all(
    ASSET_MANIFESTS.map(async (url) => {
      try {
        const response = await fetch(url);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json();
      } catch (error) {
        console.warn(`Could not load ${url}: ${error.message}`);
        return [];
      }
    })
  );

  const byId = new Map();
  for (const model of manifests.flat()) {
    if (model?.localModel && !byId.has(model.id)) byId.set(model.id, model);
  }
  return Object.entries(calibration.models || {})
    .filter(([_id, settings]) => settings.enabled)
    .map(([id, settings]) => {
      const model = byId.get(id);
      return model ? { ...model, calibration: settings } : null;
    })
    .filter((model) => model && (model.bytes?.model || 0) <= MAX_MODEL_BYTES);
}

async function loadCityAssetManifest() {
  if (!ENABLE_IMPORTED_CITY_PROPS) return new Map();

  try {
    const response = await fetch(CITY_ASSET_MANIFEST_URL);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const manifest = await response.json();
    const byGroup = new Map();

    for (const asset of manifest) {
      if (!asset?.localModel || !asset.group) continue;
      if (DISABLED_CITY_ASSET_GROUPS.has(asset.group)) continue;
      if (!byGroup.has(asset.group)) byGroup.set(asset.group, []);
      byGroup.get(asset.group).push(asset);
    }

    return byGroup;
  } catch (error) {
    console.warn(`Could not load ${CITY_ASSET_MANIFEST_URL}: ${error.message}`);
    return new Map();
  }
}

function meshBounds(meshes) {
  let min = null;
  let max = null;
  for (const mesh of meshes) {
    if (!mesh.getBoundingInfo) continue;
    mesh.computeWorldMatrix(true);
    const vectors = mesh.getBoundingInfo().boundingBox.vectorsWorld;
    for (const vector of vectors) {
      min = min ? BABYLON.Vector3.Minimize(min, vector) : vector.clone();
      max = max ? BABYLON.Vector3.Maximize(max, vector) : vector.clone();
    }
  }
  return min && max ? { min, max, size: max.subtract(min), center: min.add(max).scale(0.5) } : null;
}

function alignImportedHouse(meshes, modelRoot, root, targetLocalPosition) {
  modelRoot.computeWorldMatrix(true);
  for (const mesh of meshes) mesh.computeWorldMatrix(true);

  const bounds = meshBounds(meshes);
  if (!bounds) return;

  const rootPosition = root.getAbsolutePosition();
  const targetWorldCenter = rootPosition.add(targetLocalPosition);
  const targetWorldBottom = rootPosition.y + targetLocalPosition.y;
  modelRoot.position.addInPlace(new BABYLON.Vector3(
    targetWorldCenter.x - bounds.center.x,
    targetWorldBottom - bounds.min.y,
    targetWorldCenter.z - bounds.center.z
  ));
}

function modelMatchesHouse(model, house) {
  const style = String(house.homeStyle || "").toLowerCase();
  const kind = model?.calibration?.kind || "house";
  if (style.includes("apartment") || style.includes("second empire")) return kind === "apartment";
  if (style.includes("ranch") || style.includes("cottage") || style.includes("cabin") || style.includes("pueblo")) {
    return kind === "small-house";
  }
  return kind === "house";
}

function selectAssetModel(house, slotIndex) {
  if (assetModels.length === 0) return null;
  const preferred = assetModels.filter((model) => modelMatchesHouse(model, house));
  const models = preferred.length > 0 ? preferred : assetModels;
  return models[slotIndex % models.length];
}

function assetPathParts(model) {
  const assetPath = model.localModel.replaceAll("\\", "/");
  const slash = assetPath.lastIndexOf("/");
  return {
    rootUrl: assetPath.slice(0, slash + 1),
    filename: assetPath.slice(slash + 1),
    url: assetPath
  };
}

function prefetchAssetModel(model) {
  if (!model?.localModel) return Promise.resolve();
  const { url } = assetPathParts(model);
  if (!assetPrefetches.has(url)) {
    assetPrefetches.set(
      url,
      fetch(url)
        .then((response) => {
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          return response.blob();
        })
        .then(() => undefined)
        .catch((error) => {
          assetPrefetches.delete(url);
          console.warn(`Could not prefetch ${url}: ${error.message}`);
        })
    );
  }
  return assetPrefetches.get(url);
}

function prefetchStreetAssets(rows) {
  const models = rows
    .slice(0, DETAIL_MODEL_LIMIT)
    .map((house, slotIndex) => selectAssetModel(house, slotIndex))
    .filter(Boolean);
  const uniqueModels = [...new Map(models.map((model) => [model.localModel, model])).values()];
  Promise.allSettled(uniqueModels.map(prefetchAssetModel));
}

function finalModelFits(bounds, targetDimensions, parcelDepth, parcelFrontage) {
  if (!bounds) return false;
  const maxLotWidth = parcelFrontage * 0.88;
  const maxLotDepth = parcelDepth * 0.84;
  const maxHeight = Math.min(MAX_FINAL_HOUSE_HEIGHT + 0.4, targetDimensions.targetHeight * 1.28);
  return (
    bounds.size.x <= maxLotWidth &&
    bounds.size.z <= maxLotDepth &&
    bounds.size.y <= maxHeight &&
    bounds.size.x >= 0.8 &&
    bounds.size.z >= 0.7 &&
    bounds.size.y >= STANDARD_DOOR_HEIGHT * 1.3
  );
}

function runNextAssetImport() {
  while (activeAssetImports < ASSET_IMPORT_CONCURRENCY && assetImportQueue.length > 0) {
    if (movementKeys.size > 0) {
      window.setTimeout(runNextAssetImport, ASSET_IMPORT_MOVE_PAUSE_MS);
      return;
    }
    const job = assetImportQueue.shift();
    activeAssetImports += 1;
    job()
      .catch((error) => console.warn(error.message || error))
      .finally(() => {
        activeAssetImports -= 1;
        runNextAssetImport();
      });
  }
}

function queueAssetHouse(house, slotIndex, root, side, parcelDepth, parcelFrontage, expectedVersion) {
  assetImportQueue.push(() => addAssetHouse(house, slotIndex, root, side, parcelDepth, parcelFrontage, expectedVersion));
  runNextAssetImport();
}

async function addAssetHouse(house, slotIndex, root, side, parcelDepth, parcelFrontage, expectedVersion) {
  if (expectedVersion !== cityWindowVersion || root.isDisposed?.()) return;
  const model = selectAssetModel(house, slotIndex);
  if (!model) return;

  const targetDimensions = targetHouseDimensions(house, parcelDepth, parcelFrontage, model);
  const { rootUrl, filename } = assetPathParts(model);

  try {
    await prefetchAssetModel(model);
    if (expectedVersion !== cityWindowVersion || root.isDisposed?.()) return;
    while (movementKeys.size > 0) await delay(ASSET_IMPORT_MOVE_PAUSE_MS);
    await idleFrame();
    await nextFrame();
    if (expectedVersion !== cityWindowVersion || root.isDisposed?.()) return;
    const result = await BABYLON.SceneLoader.ImportMeshAsync("", rootUrl, filename, scene);
    const importedNodes = [...result.meshes, ...result.transformNodes];
    const meshes = result.meshes.filter((mesh) => mesh instanceof BABYLON.Mesh && mesh.getTotalVertices() > 0);

    if (expectedVersion !== cityWindowVersion || root.isDisposed?.()) {
      for (const node of importedNodes) node.dispose?.();
      return;
    }

    const modelRoot = new BABYLON.TransformNode(`polyHouse-${model.id}`, scene);
    modelRoot.parent = root;
    const targetLocalPosition = new BABYLON.Vector3(side * 0.85, 0.24, 0);
    modelRoot.position = targetLocalPosition.clone();
    modelRoot.rotation.y = side < 0 ? Math.PI / 2 : -Math.PI / 2;
    modelRoot.metadata = { house, houseGroup: root, model };

    const contentRoot = new BABYLON.TransformNode(`polyHouseContent-${model.id}`, scene);
    contentRoot.parent = modelRoot;

    for (const node of importedNodes) {
      if (!node.parent || !importedNodes.includes(node.parent)) node.parent = contentRoot;
    }

    const bounds = meshBounds(meshes);
    if (bounds) {
      contentRoot.position = new BABYLON.Vector3(-bounds.center.x, -bounds.min.y, -bounds.center.z);
      const widthScale = targetDimensions.targetWidth / Math.max(bounds.size.x, 0.01);
      const depthScale = targetDimensions.targetDepth / Math.max(bounds.size.z, 0.01);
      const heightScale = targetDimensions.targetHeight / Math.max(bounds.size.y, 0.01);
      const planScale = clamp(Math.min(widthScale, depthScale), MIN_REASONABLE_MODEL_SCALE, MAX_REASONABLE_MODEL_SCALE);
      const verticalScale = clamp(
        heightScale,
        planScale / MAX_VERTICAL_STRETCH,
        Math.min(MAX_REASONABLE_MODEL_SCALE, planScale * MAX_VERTICAL_STRETCH)
      );
      modelRoot.scaling = new BABYLON.Vector3(planScale, verticalScale, planScale);
    }

    alignImportedHouse(meshes, modelRoot, root, targetLocalPosition);

    const finalBounds = meshBounds(meshes);
    if (!finalModelFits(finalBounds, targetDimensions, parcelDepth, parcelFrontage)) {
      modelRoot.dispose();
      console.warn(`Rejected Poly Pizza model ${model.id}; final bounds did not fit lot.`);
      return;
    }

    for (const mesh of meshes) {
      mesh.isPickable = true;
      mesh.checkCollisions = false;
      mesh.metadata = { house, houseGroup: root, model };
      pickableMeshes.push(mesh);
    }

    if (root.metadata?.placeholder) {
      removePickables(root.metadata.placeholder.getChildMeshes(false));
      root.metadata.placeholder.dispose();
      root.metadata.placeholder = null;
    }
  } catch (error) {
    console.warn(`Could not load Poly Pizza model ${model.localModel}: ${error.message}`);
  }
}

function addFallbackHouse(house, slotIndex, root, side) {
  const placeholder = new BABYLON.TransformNode("placeholderHome", scene);
  placeholder.parent = root;
  const colorMaterials = [materials.volt, materials.glass, materials.coral, materials.orchid, materials.aqua];
  const homeSqft = traitNumber(house.homeSize, 6000);
  const stories = storyCountForHouse(house);
  const width = scaleFromRange(homeSqft, 1200, 12000, 1.2, 2.5);
  const depth = scaleFromRange(homeSqft, 1200, 12000, 1.2, 2.2);
  const height = Math.max(1.8, stories * 0.92 + 0.55);
  const body = createBox("fallbackHome", width, height, depth, new BABYLON.Vector3(side * 0.85, 0.25 + height / 2, 0), colorMaterials[slotIndex % colorMaterials.length], {
    pickable: true,
    collisions: false,
    castShadows: true
  });
  body.rotation.y = side < 0 ? Math.PI / 2 : -Math.PI / 2;
  body.parent = placeholder;
  body.metadata = { house, houseGroup: root };
  pickableMeshes.push(body);

  const frontZ = side < 0 ? depth / 2 + 0.025 : -depth / 2 - 0.025;
  const door = createBox("fallbackDoor", FALLBACK_DOOR_WIDTH, FALLBACK_DOOR_HEIGHT, 0.04, new BABYLON.Vector3(side * 0.85 - width * 0.18, 0.25 + FALLBACK_DOOR_HEIGHT / 2, frontZ), materials.dark);
  door.rotation.y = body.rotation.y;
  door.parent = placeholder;

  for (const xOffset of [-0.32, 0.28]) {
    const windowMesh = createBox("fallbackWindow", 0.26, 0.22, 0.045, new BABYLON.Vector3(side * 0.85 + xOffset * width, 0.95, frontZ), materials.volt);
    windowMesh.rotation.y = body.rotation.y;
    windowMesh.parent = placeholder;
  }

  const roof = BABYLON.MeshBuilder.CreateCylinder("fallbackRoof", { diameterTop: 0, diameterBottom: Math.max(width, depth) * 1.2, height: 0.8, tessellation: 4 }, scene);
  roof.position = new BABYLON.Vector3(side * 0.85, height + 0.7, 0);
  roof.rotation.y = Math.PI / 4;
  roof.material = materials.volt;
  roof.parent = placeholder;
  return placeholder;
}

function removePickables(meshes) {
  for (const mesh of meshes) {
    const index = pickableMeshes.indexOf(mesh);
    if (index !== -1) pickableMeshes.splice(index, 1);
  }
}

function createHouseLot(house, slotIndex, streetIndex, options = {}) {
  const { detailed = false, expectedVersion = cityWindowVersion } = options;
  const side = slotIndex < LOTS_PER_SIDE ? -1 : 1;
  const row = slotIndex % LOTS_PER_SIDE;
  const z = FIRST_LOT_Z - row * LOT_SPACING;
  const parcelCenterX = side * PARCEL_CENTER_X;
  const root = new BABYLON.TransformNode(`lot-${house.tokenId}`, scene);
  root.position = new BABYLON.Vector3(worldXForStreet(streetIndex) + parcelCenterX, 0, z);
  root.metadata = { house, baseY: 0 };
  pageNodes.push(root);

  const landSqft = traitNumber(house.land, 18000);
  const parcelDepth = scaleFromRange(landSqft, 15000, 91000, 4.5, 5.9);
  const parcelFrontage = scaleFromRange(landSqft, 15000, 91000, 4.45, 5.35);
  const roadEdgeLocalX = side * ROAD_HALF - parcelCenterX;
  const houseLocalX = side * 0.85;
  const lotFrontLocalX = -side * (parcelDepth / 2 - 0.18);
  const drivewayRun = Math.abs(lotFrontLocalX - houseLocalX);
  const drivewayWidth = house.drivewayStyle?.includes("Valet") ? 1.55 : house.drivewayStyle?.includes("Oyster") ? 1.28 : 1.05;
  const drivewayZ = side * 0.45;

  const lot = createBox("parcel", parcelDepth, 0.12, parcelFrontage, new BABYLON.Vector3(0, 0.06, 0), materials.lot, {
    receiveShadows: true
  });
  lot.parent = root;

  const lawn = createBox("lawn", parcelDepth - 0.36, 0.04, parcelFrontage - 0.36, new BABYLON.Vector3(0, 0.15, 0), materials.grass);
  lawn.parent = root;

  const driveway = createBox("driveway", drivewayRun, 0.06, drivewayWidth, new BABYLON.Vector3((lotFrontLocalX + houseLocalX) / 2, 0.2, drivewayZ), drivewayMaterial(house.driveway), {
    receiveShadows: true
  });
  driveway.parent = root;

  const curbCut = createBox("curbCut", 0.72, 0.07, drivewayWidth + 0.25, new BABYLON.Vector3(lotFrontLocalX - side * 0.18, 0.21, drivewayZ), materials.concrete);
  curbCut.parent = root;

  const walkRun = Math.max(0.65, drivewayRun * 0.5);
  const walk = createBox("walkway", walkRun, 0.04, 0.34, new BABYLON.Vector3((lotFrontLocalX + houseLocalX) / 2, 0.22, -drivewayZ), materials.sidewalk);
  walk.parent = root;

  const mailboxX = lotFrontLocalX - side * 0.36;
  const mailbox = createBox("mailbox", 0.3, 0.18, 0.18, new BABYLON.Vector3(mailboxX, 0.62, drivewayZ - 0.72), materials.aqua);
  mailbox.parent = root;
  const post = createBox("mailboxPost", 0.05, 0.5, 0.05, new BABYLON.Vector3(mailboxX, 0.34, drivewayZ - 0.72), materials.curb);
  post.parent = root;

  root.metadata.placeholder = addFallbackHouse(house, slotIndex, root, side);
  if (detailed) queueAssetHouse(house, slotIndex, root, side, parcelDepth, parcelFrontage, expectedVersion);
  return root;
}

function clearCityWindow() {
  for (const node of pageNodes.splice(0)) node.dispose();
  pickableMeshes.length = 0;
  selectedNode = null;
}

async function renderCityWindow(centerStreetIndex, options = {}) {
  const { resetView = false, selectFirst = true } = options;
  cityWindowVersion += 1;
  const version = cityWindowVersion;
  assetImportQueue.length = 0;
  currentStreetIndex = clamp(centerStreetIndex, 0, maxStreetIndex());
  visibleOffset = currentStreetIndex * PAGE_SIZE;
  renderedStreetCenter = currentStreetIndex;
  blockLabel.textContent = "Loading...";
  prevBlock.disabled = true;
  nextBlock.disabled = true;
  if (resetView) resetPlayerView(false);
  clearCityWindow();

  addGroundWindow(currentStreetIndex);
  addVisibleStreetNames(currentStreetIndex);
  await nextFrame();
  if (version !== cityWindowVersion) return;

  const roots = [];
  const firstStreet = Math.max(0, currentStreetIndex - HOUSE_STREAM_RADIUS);
  const lastStreet = Math.min(maxStreetIndex(), currentStreetIndex + HOUSE_STREAM_RADIUS);

  const streetBatches = await Promise.all(
    Array.from({ length: lastStreet - firstStreet + 1 }, async (_value, index) => {
      const streetIndex = firstStreet + index;
      const rows = await Promise.all(streetRowsForIndex(streetIndex).map(loadHouseDetails));
      return { streetIndex, rows };
    })
  );
  if (version !== cityWindowVersion) return;

  const currentBatch = streetBatches.find((batch) => batch.streetIndex === currentStreetIndex);
  if (currentBatch) prefetchStreetAssets(currentBatch.rows);

  for (const { streetIndex, rows } of streetBatches) {
    for (let slotIndex = 0; slotIndex < rows.length; slotIndex += 1) {
      const house = rows[slotIndex];
      const root = createHouseLot(house, slotIndex, streetIndex, {
        detailed: streetIndex === currentStreetIndex && slotIndex < DETAIL_MODEL_LIMIT,
        expectedVersion: version
      });
      if (streetIndex === currentStreetIndex) roots[slotIndex] = root;
      if ((slotIndex + 1) % LOT_BUILD_BATCH_SIZE === 0) {
        await nextFrame();
        if (version !== cityWindowVersion) return;
      }
    }
    await nextFrame();
    if (version !== cityWindowVersion) return;
  }

  const start = visibleOffset + NFT_START;
  const end = Math.min(visibleOffset + PAGE_SIZE, NFT_END);
  blockLabel.textContent = `${activeStreetName()} · ${start}-${end} of ${houseData.length}`;
  prevBlock.disabled = visibleOffset === 0;
  nextBlock.disabled = visibleOffset + PAGE_SIZE >= houseData.length;
  updateStreetLabel(true);

  const visible = streetRowsForIndex(currentStreetIndex);
  if ((selectFirst || !selectedNode) && visible.length > 0) selectHouse(visible[0], roots[0], false);
}

function setPanelImage(house) {
  details.preview.style.backgroundImage = "";
  const grantee = house.liveOwner === ZERO_ADDRESS
    ? "Available for mint"
    : shortenAddress(house.liveOwner || house.owner) || "Pending mint";
  details.preview.innerHTML = `
    <div class="deed-card">
      <div class="deed-top">
        <div class="deed-mark">M</div>
        <div>
          <p class="deed-kicker">Metagascar County Registry</p>
          <p class="deed-title">Certificate of MetaHome Title</p>
        </div>
        <p class="deed-token">#${escapeHtml(house.tokenId)}</p>
      </div>
      <div class="deed-body">
        <div class="deed-row"><span>Grantee</span><span>${escapeHtml(grantee)}</span></div>
        <div class="deed-row"><span>Parcel</span><span>${escapeHtml(house.land)}</span></div>
        <div class="deed-row"><span>Estate</span><span>${escapeHtml(house.homeStyle)}</span></div>
        <div class="deed-row"><span>Structure</span><span>${escapeHtml(house.homeSize)}</span></div>
        <div class="deed-row"><span>Access</span><span>${escapeHtml(`${house.driveway} / ${house.drivewayStyle}`)}</span></div>
      </div>
      <div class="deed-footer">
        <span class="deed-signature">Recorded by Alpha Explorer Meta</span>
        <span class="deed-seal">Meta<br>Seal</span>
      </div>
    </div>
  `;
}

function updateMintButton(label, disabled, note) {
  mintButton.textContent = label;
  mintButton.disabled = disabled;
  mintNote.textContent = note;
}

function updateStreetLabel(force = false) {
  const now = performance.now();
  if (!force && now - lastStreetLabelUpdate < STREET_LABEL_INTERVAL_MS) return;
  const distanceIntoStreet = Math.round(STREET_START_Z - camera.position.z);
  const atSplit = camera.position.z <= INTERSECTION_CLEARANCE_Z;
  const nextLabel = atSplit ? `${activeStreetName()} cross street` : `${Math.max(0, distanceIntoStreet)}m on ${activeStreetName()}`;
  if (force || nextLabel !== lastStreetLabel) {
    streetLabel.textContent = nextLabel;
    lastStreetLabel = nextLabel;
  }
  lastStreetLabelUpdate = now;
  walkForward.textContent = document.pointerLockElement === canvas ? "World Active" : "Enter World";
}

function resetPlayerView(announce = true) {
  camera.position = new BABYLON.Vector3(worldXForStreet(currentStreetIndex), 2.1, 27);
  camera.setTarget(new BABYLON.Vector3(worldXForStreet(currentStreetIndex), 1.3, -6));
  updateStreetLabel(true);
  if (announce) showToast("View reset to the Metagascar entrance.");
}

function lockWorld() {
  canvas.focus();
  camera.attachControl(canvas, true);
  canvas.requestPointerLock?.();
  showToast("Babylon world controls active. Use WASD and mouse look.");
}

async function refreshMintStatus(house, requestId = mintStatusRequestId) {
  if (!readContract) {
    if (requestId !== mintStatusRequestId || house !== selectedHouse) return;
    updateMintButton("Connect wallet to check mint", false, "Connect a wallet to check live ownership and mint available lots.");
    return;
  }

  try {
    const owner = await readContract.ownerOf(house.tokenId);
    if (requestId !== mintStatusRequestId || house !== selectedHouse) return;
    house.liveOwner = owner;
    details.owner.textContent = shortenAddress(owner);
    details.status.textContent = "Already minted";
    setPanelImage(house);
    updateMintButton("Already minted", true, `Owned by ${shortenAddress(owner)}. This token cannot be minted again.`);
  } catch (_error) {
    if (requestId !== mintStatusRequestId || house !== selectedHouse) return;
    house.liveOwner = ZERO_ADDRESS;
    details.owner.textContent = "Unminted";
    details.status.textContent = "Mint available";
    setPanelImage(house);
    const price = mintPrice === null ? "contract price" : `${ethers.formatEther(mintPrice)} ETH`;
    updateMintButton(`Mint for ${price}`, !writeContract, writeContract ? "This lot appears unminted on-chain." : "Connect wallet to mint this available lot.");
  }
}

function selectHouse(house, meshGroup, announce = true) {
  mintStatusRequestId += 1;
  const requestId = mintStatusRequestId;
  selectedHouse = house;
  if (selectedNode) {
    selectedNode.scaling = BABYLON.Vector3.One();
    selectedNode.position.y = selectedNode.metadata?.baseY || 0;
  }
  selectedNode = meshGroup || null;
  if (selectedNode) selectedNode.scaling = new BABYLON.Vector3(1.04, 1.04, 1.04);

  detailPanel.classList.remove("is-hidden");
  details.status.textContent = "Checking...";
  details.name.textContent = house.name;
  details.token.textContent = `#${house.tokenId}`;
  details.land.textContent = house.land;
  details.home.textContent = house.homeStyle;
  details.size.textContent = house.homeSize;
  details.driveway.textContent = `${house.driveway} / ${house.drivewayStyle}`;
  details.owner.textContent = shortenAddress(house.liveOwner || house.owner);
  setPanelImage(house);
  updateMintButton("Checking mint status...", true, "Reading live Ethereum ownership for this token.");

  window.setTimeout(() => refreshMintStatus(house, requestId), 0);
  if (announce) showToast(`Selected ${house.name}`);
}

async function connectWallet() {
  if (!window.ethereum) {
    showToast("No injected Ethereum wallet found.");
    mintNote.textContent = "Install MetaMask or use a browser with an injected Ethereum wallet.";
    return;
  }

  const browserProvider = new ethers.BrowserProvider(window.ethereum);
  const network = await browserProvider.getNetwork();

  if (network.chainId !== 1n) {
    try {
      await window.ethereum.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: ETH_MAINNET }]
      });
    } catch (_error) {
      showToast("Switch wallet to Ethereum mainnet to mint.");
      return;
    }
  }

  signer = await browserProvider.getSigner();
  walletAddress = await signer.getAddress();
  readContract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, browserProvider);
  writeContract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, signer);
  mintPrice = mintPrice ?? await readContract.mintPrice();
  connectButton.textContent = shortenAddress(walletAddress);
  showToast("Wallet connected.");

  if (selectedHouse) await refreshMintStatus(selectedHouse);
}

async function mintSelectedHouse() {
  if (!selectedHouse) return;
  if (!writeContract) {
    await connectWallet();
    return;
  }

  await refreshMintStatus(selectedHouse);
  if (selectedHouse.liveOwner && selectedHouse.liveOwner !== ZERO_ADDRESS) return;

  try {
    mintPrice = mintPrice ?? await writeContract.mintPrice();
    updateMintButton("Confirm in wallet...", true, "Your wallet will ask you to confirm the mint transaction.");
    const tx = await writeContract.claim(selectedHouse.tokenId, { value: mintPrice });
    updateMintButton("Minting...", true, `Transaction submitted: ${tx.hash}`);
    showToast("Mint transaction submitted.");
    await tx.wait();
    showToast("Mint confirmed.");
    await refreshMintStatus(selectedHouse);
  } catch (error) {
    updateMintButton("Mint available", false, error.shortMessage || error.message || "Mint transaction failed.");
    showToast("Mint transaction was not completed.");
  }
}

function pickHouse(pointerX, pointerY) {
  const pick = scene.pick(pointerX, pointerY, (mesh) => pickableMeshes.includes(mesh));
  const house = pick?.pickedMesh?.metadata?.house;
  const group = pick?.pickedMesh?.metadata?.houseGroup;
  if (house) {
    selectHouse(house, group);
    return true;
  }
  return false;
}

function setupEvents() {
  canvas.addEventListener("pointerdown", (event) => {
    if (document.pointerLockElement === canvas) {
      if (!pickHouse(engine.getRenderWidth() / 2, engine.getRenderHeight() / 2)) {
        showToast("Aim at a house and click to inspect its deed.");
      }
      return;
    }
    if (!pickHouse(event.offsetX, event.offsetY)) lockWorld();
  });

  prevBlock.addEventListener("click", async () => {
    await jumpToStreet(currentStreetIndex - 1);
  });

  nextBlock.addEventListener("click", async () => {
    await jumpToStreet(currentStreetIndex + 1);
  });

  walkForward.addEventListener("click", lockWorld);
  walkBack.addEventListener("click", () => resetPlayerView());
  connectButton.addEventListener("click", connectWallet);
  mintButton.addEventListener("click", mintSelectedHouse);
  closePanel.addEventListener("click", () => detailPanel.classList.add("is-hidden"));
  document.addEventListener("pointerlockchange", () => updateStreetLabel(true));
  window.addEventListener("keydown", (event) => {
    const key = event.key.toLowerCase();
    if (["w", "a", "s", "d", "arrowup", "arrowdown", "arrowleft", "arrowright", "shift"].includes(key)) {
      movementKeys.add(key);
      event.preventDefault();
    }
  });
  window.addEventListener("keyup", (event) => {
    movementKeys.delete(event.key.toLowerCase());
  });

  window.addEventListener("resize", () => engine.resize());
}

async function jumpToStreet(streetIndex) {
  const nextStreetIndex = clamp(streetIndex, 0, maxStreetIndex());
  currentStreetIndex = nextStreetIndex;
  camera.position.x = worldXForStreet(nextStreetIndex);
  camera.setTarget(new BABYLON.Vector3(worldXForStreet(nextStreetIndex), 1.3, camera.position.z - 24));
  await renderCityWindow(nextStreetIndex, { selectFirst: true });
}

function updatePlayerMovement() {
  const direction = new BABYLON.Vector3(0, 0, 0);
  const forward = camera.getForwardRay(1).direction;
  forward.y = 0;
  forward.normalize();
  const right = BABYLON.Vector3.Cross(BABYLON.Axis.Y, forward).normalize();

  if (movementKeys.has("w") || movementKeys.has("arrowup")) direction.addInPlace(forward);
  if (movementKeys.has("s") || movementKeys.has("arrowdown")) direction.subtractInPlace(forward);
  if (movementKeys.has("d") || movementKeys.has("arrowright")) direction.addInPlace(right);
  if (movementKeys.has("a") || movementKeys.has("arrowleft")) direction.subtractInPlace(right);

  if (direction.lengthSquared() === 0) return;

  direction.normalize();
  const speed = movementKeys.has("shift") ? SPRINT_SPEED : WALK_SPEED;
  const deltaSeconds = Math.min(engine.getDeltaTime() / 1000, 0.05);
  camera.position.addInPlace(direction.scale(speed * deltaSeconds));
}

function keepCameraInWorld() {
  camera.position.x = clamp(camera.position.x, -WORLD_EDGE_PADDING, worldXForStreet(maxStreetIndex()) + WORLD_EDGE_PADDING);
  camera.position.z = clamp(camera.position.z, SPLIT_Z - CROSS_STREET_WIDTH * 0.54, 28.8);
  camera.position.y = 2.1;
  updateStreetLabel();
}

let streamUpdatePromise = null;

function startRenderLoop() {
  if (renderLoopStarted) return;
  renderLoopStarted = true;
  engine.runRenderLoop(() => {
    updatePlayerMovement();
    keepCameraInWorld();
    updateCityStreamForCamera();
    if (selectedNode) selectedNode.position.y = (selectedNode.metadata?.baseY || 0) + (Math.sin(performance.now() * 0.003) + 1) * 0.02;
    scene.render();
  });
}

function updateCityStreamForCamera() {
  if (houseData.length === 0) return;
  const nextStreetIndex = streetIndexForWorldX(camera.position.x);
  if (nextStreetIndex === renderedStreetCenter || streamUpdatePromise) return;
  if (movementKeys.size > 0) {
    pendingStreamStreetIndex = nextStreetIndex;
    pendingStreamSince = performance.now();
    return;
  }
  if (pendingStreamStreetIndex !== nextStreetIndex) {
    pendingStreamStreetIndex = nextStreetIndex;
    pendingStreamSince = performance.now();
    return;
  }
  if (performance.now() - pendingStreamSince < STREET_STREAM_IDLE_MS) return;
  pendingStreamStreetIndex = null;
  streamUpdatePromise = renderCityWindow(nextStreetIndex, { selectFirst: false })
    .catch((error) => {
      console.error(error);
      showToast("Could not stream the next Metagascar street.");
    })
    .finally(() => {
      streamUpdatePromise = null;
    });
}

async function boot() {
  if (!BABYLON) throw new Error("Babylon.js did not load.");
  setupEvents();
  startRenderLoop();

  const [loadedAssetModels, loadedCityAssets, loadedStreetRows] = await Promise.all([
    loadAssetManifests(),
    loadCityAssetManifest(),
    loadStreetRows()
  ]);
  assetModels = loadedAssetModels;
  cityAssetsByGroup = loadedCityAssets;
  if (assetModels.length === 0) showToast("Poly Pizza assets are missing; using fallback homes.");
  streetRows = loadedStreetRows;
  houseData = streetRows.slice(0, NFT_END - NFT_START + 1);

  const defaultProvider = new ethers.JsonRpcProvider("https://ethereum-rpc.publicnode.com", 1);
  readContract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, defaultProvider);
  readContract.mintPrice()
    .then((price) => {
      mintPrice = price;
      if (selectedHouse?.liveOwner === ZERO_ADDRESS) refreshMintStatus(selectedHouse);
    })
    .catch((error) => console.warn(`Could not read mint price yet: ${error.shortMessage || error.message}`));

  currentStreetIndex = 0;
  await renderCityWindow(currentStreetIndex, { resetView: true, selectFirst: true });
}

boot().catch((error) => {
  console.error(error);
  showToast("Could not load Metagascar Babylon city.");
});
