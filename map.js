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
const MAX_MODEL_BYTES = 1_350_000;
const PUBLIC_MINT_START = 1001;
const PUBLIC_MINT_END = 8000;
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
const LOT_SPACING = (FIRST_LOT_Z - LAST_LOT_Z) / (LOTS_PER_SIDE - 1);
const STREET_DECOR_ROWS = 10;
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
const ASSET_MANIFESTS = [
  "assets/poly-pizza/houses/manifest.json",
  "assets/poly-pizza/homes/manifest.json"
];

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
let assetModels = [];
let modelCalibration = null;
let visibleOffset = 0;
let selectedHouse = null;
let selectedNode = null;
let signer = null;
let readContract = null;
let writeContract = null;
let mintPrice = null;
let walletAddress = null;

const engine = new BABYLON.Engine(canvas, true, {
  preserveDrawingBuffer: true,
  stencil: true,
  antialias: true
});
engine.setHardwareScalingLevel(Math.min(window.devicePixelRatio, 2) / window.devicePixelRatio);

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
const pickableMeshes = [];
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

function scaleFromRange(value, minValue, maxValue, minScale, maxScale) {
  const normalized = (value - minValue) / (maxValue - minValue);
  return minScale + clamp(normalized, 0, 1) * (maxScale - minScale);
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

function addStreetFurniture(side, z) {
  const x = side * (ROAD_HALF + SIDEWALK_WIDTH + 0.15);
  createBox("lampPost", 0.08, 2.2, 0.08, new BABYLON.Vector3(x, 1.1, z), materials.dark);
  const lamp = BABYLON.MeshBuilder.CreateSphere("lampGlow", { diameter: 0.34, segments: 12 }, scene);
  lamp.position = new BABYLON.Vector3(x, 2.32, z);
  lamp.material = materials.volt;
  dynamicNodes.push(lamp);
  const point = new BABYLON.PointLight("streetLamp", lamp.position, scene);
  point.diffuse = BABYLON.Color3.FromHexString("#d7ff3f");
  point.intensity = 0.22;
  point.range = 7;

  const signX = side * (ROAD_HALF + SIDEWALK_WIDTH + 0.72);
  createBox("streetSignPost", 0.06, 1.05, 0.06, new BABYLON.Vector3(signX, 0.55, z + 1.8), materials.curb);
  createBox("streetSignPanel", 0.7, 0.28, 0.06, new BABYLON.Vector3(signX, 1.12, z + 1.8), materials.aqua);
}

function addCar(side, z, material) {
  const root = new BABYLON.TransformNode("parkedCar", scene);
  root.position = new BABYLON.Vector3(side * (ROAD_HALF - 0.75), 0.04, z);
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

function addGround() {
  createPlaneBox("grass", 48, 100, -0.03, -18, materials.grass);
  createPlaneBox("road", ROAD_WIDTH, 88, 0.02, -18, materials.road);
  createPlaneBox("splitRoad", CROSS_STREET_LENGTH, CROSS_STREET_WIDTH, 0.03, SPLIT_Z, materials.road);
  createPlaneBox("stopBar", ROAD_WIDTH - 0.8, 0.16, 0.07, SPLIT_Z + CROSS_STREET_WIDTH * 0.52, materials.roadLine);

  for (const side of [-1, 1]) {
    const sidewalkX = side * (ROAD_HALF + SIDEWALK_WIDTH / 2 + 0.28);
    createPlaneBox("sidewalk", SIDEWALK_WIDTH, 88, 0.06, -18, materials.sidewalk, sidewalkX);
    createBox("curb", 0.18, 0.18, 88, new BABYLON.Vector3(side * (ROAD_HALF + 0.12), 0.11, -18), materials.curb);
    createBox("propertyEdge", 0.06, 0.08, 88, new BABYLON.Vector3(side * (ROAD_HALF + SIDEWALK_WIDTH + 0.48), 0.09, -18), materials.curb);
    createBox("crossCurbNear", CROSS_STREET_LENGTH / 2 - 1.2, 0.16, 0.16, new BABYLON.Vector3(side * 7.8, 0.12, SPLIT_Z + CROSS_STREET_WIDTH / 2), materials.curb);
    createBox("crossCurbFar", CROSS_STREET_LENGTH / 2 - 1.2, 0.16, 0.16, new BABYLON.Vector3(side * 7.8, 0.12, SPLIT_Z - CROSS_STREET_WIDTH / 2), materials.curb);
    createPlaneBox("branchStripe", 6.5, 0.14, 0.08, SPLIT_Z, materials.stripe, side * 6.2);
  }

  for (let index = 0; index < 15; index += 1) {
    createPlaneBox("centerStripe", 0.2, 1.8, 0.08, FIRST_LOT_Z - index * 4.2, materials.stripe);
  }

  for (const z of [17.4, INTERSECTION_CLEARANCE_Z]) {
    for (let index = 0; index < 7; index += 1) {
      createPlaneBox("crosswalk", 0.38, ROAD_WIDTH + 0.8, 0.09, z, materials.roadLine, -2.7 + index * 0.9);
    }
  }

  const carMaterials = [materials.aqua, materials.coral, materials.orchid, materials.curb];
  for (const side of [-1, 1]) {
    [10.8, -2.5, -18.8, -29.4].forEach((z, index) => addCar(side, z, carMaterials[(index + (side > 0 ? 1 : 0)) % carMaterials.length]));
    for (let row = 0; row < STREET_DECOR_ROWS; row += 1) {
      const z = FIRST_LOT_Z - row * STREET_DECOR_SPACING;
      addStreetFurniture(side, z - 2.35);
      const treeX = side * (ROAD_HALF + SIDEWALK_WIDTH + 0.86);
      createBox("treeTrunk", 0.14, 0.9, 0.14, new BABYLON.Vector3(treeX, 0.48, z + 2.3), materials.brick);
      const top = BABYLON.MeshBuilder.CreateSphere("treeTop", { diameter: 0.7, segments: 12 }, scene);
      top.position = new BABYLON.Vector3(treeX, 1.12, z + 2.3);
      top.material = materials.volt;
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

async function addAssetHouse(house, slotIndex, root, side, parcelDepth, parcelFrontage) {
  const model = selectAssetModel(house, slotIndex);
  if (!model) return;

  const targetDimensions = targetHouseDimensions(house, parcelDepth, parcelFrontage, model);
  const assetPath = model.localModel.replaceAll("\\", "/");
  const slash = assetPath.lastIndexOf("/");
  const rootUrl = `${assetPath.slice(0, slash + 1)}`;
  const filename = assetPath.slice(slash + 1);

  try {
    const result = await BABYLON.SceneLoader.ImportMeshAsync("", rootUrl, filename, scene);
    const importedNodes = [...result.meshes, ...result.transformNodes];
    const meshes = result.meshes.filter((mesh) => mesh instanceof BABYLON.Mesh && mesh.getTotalVertices() > 0);

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
      shadowGenerator.addShadowCaster(mesh);
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

function createHouseLot(house, slotIndex) {
  const side = slotIndex < LOTS_PER_SIDE ? -1 : 1;
  const row = slotIndex % LOTS_PER_SIDE;
  const z = FIRST_LOT_Z - row * LOT_SPACING;
  const parcelCenterX = side * PARCEL_CENTER_X;
  const root = new BABYLON.TransformNode(`lot-${house.tokenId}`, scene);
  root.position = new BABYLON.Vector3(parcelCenterX, 0, z);
  root.metadata = { house, baseY: 0 };
  dynamicNodes.push(root);

  const landSqft = traitNumber(house.land, 18000);
  const parcelDepth = scaleFromRange(landSqft, 15000, 91000, 4.5, 5.9);
  const parcelFrontage = scaleFromRange(landSqft, 15000, 91000, 4.45, 5.35);
  const roadEdgeLocalX = side * ROAD_HALF - parcelCenterX;
  const houseLocalX = side * 0.85;
  const drivewayRun = Math.abs(roadEdgeLocalX - houseLocalX);
  const drivewayWidth = house.drivewayStyle?.includes("Valet") ? 1.55 : house.drivewayStyle?.includes("Oyster") ? 1.28 : 1.05;
  const drivewayZ = side * 0.45;

  const lot = createBox("parcel", parcelDepth, 0.12, parcelFrontage, new BABYLON.Vector3(0, 0.06, 0), materials.lot, {
    receiveShadows: true
  });
  lot.parent = root;

  const lawn = createBox("lawn", parcelDepth - 0.36, 0.04, parcelFrontage - 0.36, new BABYLON.Vector3(0, 0.15, 0), materials.grass);
  lawn.parent = root;

  const driveway = createBox("driveway", drivewayRun, 0.06, drivewayWidth, new BABYLON.Vector3((roadEdgeLocalX + houseLocalX) / 2, 0.2, drivewayZ), drivewayMaterial(house.driveway), {
    receiveShadows: true
  });
  driveway.parent = root;

  const curbCut = createBox("curbCut", 0.72, 0.07, drivewayWidth + 0.25, new BABYLON.Vector3(roadEdgeLocalX - side * 0.18, 0.21, drivewayZ), materials.concrete);
  curbCut.parent = root;

  const walk = createBox("walkway", Math.max(0.8, drivewayRun * 0.58), 0.04, 0.34, new BABYLON.Vector3((roadEdgeLocalX + houseLocalX) / 2, 0.22, -drivewayZ), materials.sidewalk);
  walk.parent = root;

  const mailbox = createBox("mailbox", 0.3, 0.18, 0.18, new BABYLON.Vector3(roadEdgeLocalX - side * 0.58, 0.62, drivewayZ - 0.72), materials.aqua);
  mailbox.parent = root;
  const post = createBox("mailboxPost", 0.05, 0.5, 0.05, new BABYLON.Vector3(roadEdgeLocalX - side * 0.58, 0.34, drivewayZ - 0.72), materials.curb);
  post.parent = root;

  root.metadata.placeholder = addFallbackHouse(house, slotIndex, root, side);
  addAssetHouse(house, slotIndex, root, side, parcelDepth, parcelFrontage);
  return root;
}

function clearHouses() {
  for (const node of dynamicNodes.splice(0)) {
    if (node.name.startsWith("lot-")) node.dispose();
  }
  pickableMeshes.length = 0;
  selectedNode = null;
}

async function renderBlock() {
  blockLabel.textContent = "Loading...";
  prevBlock.disabled = true;
  nextBlock.disabled = true;
  resetPlayerView(false);
  clearHouses();

  const visible = await Promise.all(
    houseData.slice(visibleOffset, visibleOffset + PAGE_SIZE).map(loadHouseDetails)
  );
  const roots = visible.map(createHouseLot);

  const start = PUBLIC_MINT_START + visibleOffset;
  const end = Math.min(PUBLIC_MINT_START + visibleOffset + PAGE_SIZE - 1, PUBLIC_MINT_END);
  blockLabel.textContent = `${start}-${end} of ${houseData.length}`;
  prevBlock.disabled = visibleOffset === 0;
  nextBlock.disabled = visibleOffset + PAGE_SIZE >= houseData.length;

  if (visible.length > 0) selectHouse(visible[0], roots[0], false);
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

function updateStreetLabel() {
  const distanceIntoStreet = Math.round(STREET_START_Z - camera.position.z);
  const atSplit = camera.position.z <= INTERSECTION_CLEARANCE_Z;
  streetLabel.textContent = atSplit ? "Left / right split" : `${Math.max(0, distanceIntoStreet)}m down street`;
  walkForward.textContent = document.pointerLockElement === canvas ? "World Active" : "Enter World";
}

function resetPlayerView(announce = true) {
  camera.position = new BABYLON.Vector3(0, 2.1, 27);
  camera.setTarget(new BABYLON.Vector3(0, 1.3, -6));
  updateStreetLabel();
  if (announce) showToast("View reset to the Metagascar entrance.");
}

function lockWorld() {
  canvas.focus();
  camera.attachControl(canvas, true);
  canvas.requestPointerLock?.();
  showToast("Babylon world controls active. Use WASD and mouse look.");
}

async function refreshMintStatus(house) {
  if (!readContract) {
    updateMintButton("Connect wallet to check mint", false, "Connect a wallet to check live ownership and mint available lots.");
    return;
  }

  try {
    const owner = await readContract.ownerOf(house.tokenId);
    house.liveOwner = owner;
    details.owner.textContent = shortenAddress(owner);
    details.status.textContent = "Already minted";
    setPanelImage(house);
    updateMintButton("Already minted", true, `Owned by ${shortenAddress(owner)}. This token cannot be minted again.`);
  } catch (_error) {
    house.liveOwner = ZERO_ADDRESS;
    details.owner.textContent = "Unminted";
    details.status.textContent = "Mint available";
    setPanelImage(house);
    const price = mintPrice === null ? "contract price" : `${ethers.formatEther(mintPrice)} ETH`;
    updateMintButton(`Mint for ${price}`, !writeContract, writeContract ? "This lot appears unminted on-chain." : "Connect wallet to mint this available lot.");
  }
}

function selectHouse(house, meshGroup, announce = true) {
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

  refreshMintStatus(house);
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
  mintPrice = await readContract.mintPrice();
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
    visibleOffset = Math.max(0, visibleOffset - PAGE_SIZE);
    await renderBlock();
  });

  nextBlock.addEventListener("click", async () => {
    visibleOffset = Math.min(Math.max(0, houseData.length - PAGE_SIZE), visibleOffset + PAGE_SIZE);
    await renderBlock();
  });

  walkForward.addEventListener("click", lockWorld);
  walkBack.addEventListener("click", () => resetPlayerView());
  connectButton.addEventListener("click", connectWallet);
  mintButton.addEventListener("click", mintSelectedHouse);
  closePanel.addEventListener("click", () => detailPanel.classList.add("is-hidden"));
  document.addEventListener("pointerlockchange", updateStreetLabel);
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
  camera.position.x = clamp(camera.position.x, -16.5, 16.5);
  camera.position.z = clamp(camera.position.z, SPLIT_Z - CROSS_STREET_WIDTH * 0.54, 28.8);
  camera.position.y = 2.1;
  updateStreetLabel();
}

async function boot() {
  if (!BABYLON) throw new Error("Babylon.js did not load.");
  addGround();
  setupEvents();
  assetModels = await loadAssetManifests();
  if (assetModels.length === 0) showToast("Poly Pizza assets are missing; using fallback homes.");

  const defaultProvider = new ethers.JsonRpcProvider("https://ethereum-rpc.publicnode.com", 1);
  readContract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, defaultProvider);
  mintPrice = await readContract.mintPrice();
  houseData = Array.from(
    { length: PUBLIC_MINT_END - PUBLIC_MINT_START + 1 },
    (_item, index) => ({
      tokenId: String(PUBLIC_MINT_START + index),
      name: `Metagascar #${PUBLIC_MINT_START + index}`,
      loaded: false
    })
  );

  await renderBlock();
  engine.runRenderLoop(() => {
    updatePlayerMovement();
    keepCameraInWorld();
    if (selectedNode) selectedNode.position.y = (selectedNode.metadata?.baseY || 0) + (Math.sin(performance.now() * 0.003) + 1) * 0.02;
    scene.render();
  });
}

boot().catch((error) => {
  console.error(error);
  showToast("Could not load Metagascar Babylon city.");
});
