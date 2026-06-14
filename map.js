import * as THREE from "https://unpkg.com/three@0.165.0/build/three.module.js";
import { ethers } from "https://cdn.jsdelivr.net/npm/ethers@6.15.0/+esm";

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
const PUBLIC_MINT_START = 1001;
const PUBLIC_MINT_END = 8000;
const BLOCK_LENGTH = 88;
const ROAD_WIDTH = 6.4;
const ROAD_HALF = ROAD_WIDTH / 2;
const STREET_START_Z = 18;
const STREET_END_Z = -50;
const SPLIT_Z = -46;
const CROSS_STREET_WIDTH = 7.0;
const CROSS_STREET_LENGTH = 28;
const SIDEWALK_WIDTH = 1.35;
const PARCEL_CENTER_X = 8.15;
const LOT_SPACING = 6.35;

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
let visibleOffset = 0;
let selectedHouse = null;
let selectedMesh = null;
let signer = null;
let readContract = null;
let writeContract = null;
let mintPrice = null;
let walletAddress = null;
let streetFocusZ = 8;
let targetStreetFocusZ = 8;

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x071310, 0.035);

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;

const camera = new THREE.PerspectiveCamera(52, window.innerWidth / window.innerHeight, 0.1, 180);
camera.position.set(0, 9.5, 18);
camera.lookAt(0, 0, -8);

const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
const mouseDrift = new THREE.Vector2();
const clickableMeshes = [];
const mapRoot = new THREE.Group();
scene.add(mapRoot);

function makeAsphaltTexture() {
  const size = 128;
  const textureCanvas = document.createElement("canvas");
  textureCanvas.width = size;
  textureCanvas.height = size;
  const ctx = textureCanvas.getContext("2d");
  ctx.fillStyle = "#17191b";
  ctx.fillRect(0, 0, size, size);
  for (let index = 0; index < 1400; index += 1) {
    const shade = 32 + Math.floor(Math.random() * 36);
    ctx.fillStyle = `rgba(${shade},${shade + 2},${shade + 4},0.28)`;
    ctx.fillRect(Math.random() * size, Math.random() * size, 1, 1);
  }
  const texture = new THREE.CanvasTexture(textureCanvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(4, 38);
  return texture;
}

const asphaltTexture = makeAsphaltTexture();

const materials = {
  road: new THREE.MeshStandardMaterial({ color: 0x1a1d1e, map: asphaltTexture, roughness: 0.86, metalness: 0.03 }),
  stripe: new THREE.MeshBasicMaterial({ color: 0xd7ff3f }),
  roadLine: new THREE.MeshBasicMaterial({ color: 0xf4ffe9 }),
  grass: new THREE.MeshStandardMaterial({ color: 0x42a85a, roughness: 0.86 }),
  sidewalk: new THREE.MeshStandardMaterial({ color: 0xa9b5aa, roughness: 0.9, metalness: 0.02 }),
  curb: new THREE.MeshStandardMaterial({ color: 0xe1e7dc, roughness: 0.68 }),
  crosswalk: new THREE.MeshBasicMaterial({ color: 0xf4ffe9 }),
  lot: new THREE.MeshStandardMaterial({ color: 0x1d3f34, roughness: 0.8 }),
  gravel: new THREE.MeshStandardMaterial({ color: 0xa5a99f, roughness: 0.95 }),
  asphalt: new THREE.MeshStandardMaterial({ color: 0x24282a, roughness: 0.82 }),
  brick: new THREE.MeshStandardMaterial({ color: 0xa74835, roughness: 0.78 }),
  concrete: new THREE.MeshStandardMaterial({ color: 0xbac2ba, roughness: 0.76 }),
  basalt: new THREE.MeshStandardMaterial({ color: 0x111719, roughness: 0.7 }),
  cobble: new THREE.MeshStandardMaterial({ color: 0x7f8d84, roughness: 0.92 }),
  crushedStone: new THREE.MeshStandardMaterial({ color: 0xd6d9ce, roughness: 0.96 }),
  selectedLot: new THREE.MeshStandardMaterial({ color: 0x7cffc4, roughness: 0.5, emissive: 0x156b4c }),
  glass: new THREE.MeshStandardMaterial({ color: 0x7cffc4, roughness: 0.2, metalness: 0.1, transparent: true, opacity: 0.58 }),
  coral: new THREE.MeshStandardMaterial({ color: 0xff6f61, roughness: 0.52, emissive: 0x4c0a07, emissiveIntensity: 0.22 }),
  orchid: new THREE.MeshStandardMaterial({ color: 0xc67dff, roughness: 0.46, emissive: 0x35145a, emissiveIntensity: 0.25 }),
  aqua: new THREE.MeshStandardMaterial({ color: 0x3be7ff, roughness: 0.34, emissive: 0x07384b, emissiveIntensity: 0.2 }),
  volt: new THREE.MeshStandardMaterial({ color: 0xd7ff3f, roughness: 0.42, emissive: 0x607300, emissiveIntensity: 0.28 }),
  dark: new THREE.MeshStandardMaterial({ color: 0x101817, roughness: 0.74 }),
  chrome: new THREE.MeshStandardMaterial({ color: 0xe9fff9, roughness: 0.26, metalness: 0.74 })
};

const carMaterials = [
  new THREE.MeshStandardMaterial({ color: 0x3be7ff, roughness: 0.45, metalness: 0.18 }),
  new THREE.MeshStandardMaterial({ color: 0xff6f61, roughness: 0.5, metalness: 0.12 }),
  new THREE.MeshStandardMaterial({ color: 0xc67dff, roughness: 0.48, metalness: 0.16 }),
  new THREE.MeshStandardMaterial({ color: 0xf4ffe9, roughness: 0.42, metalness: 0.2 })
];

scene.add(new THREE.HemisphereLight(0xcfffe6, 0x24172e, 2.7));
const sun = new THREE.DirectionalLight(0xffffff, 3.2);
sun.position.set(8, 13, 7);
scene.add(sun);
const neon = new THREE.PointLight(0x7cffc4, 3.8, 34);
neon.position.set(0, 5, -8);
scene.add(neon);

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

function houseColor(house, index) {
  const text = `${house.homeStyle} ${house.drivewayStyle}`.toLowerCase();
  if (text.includes("pueblo") || text.includes("valet")) return materials.coral;
  if (text.includes("monterey") || text.includes("oyster")) return materials.orchid;
  if (text.includes("second") || text.includes("crushed")) return materials.aqua;
  return [materials.volt, materials.glass, materials.coral, materials.orchid, materials.aqua][index % 5];
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

function styleProfile(homeStyle) {
  const style = String(homeStyle || "").toLowerCase();
  if (style.includes("art deco") || style.includes("international") || style.includes("contemporary")) {
    return { roof: "flat", width: 1.2, depth: 0.92, floors: 2, accent: materials.glass };
  }
  if (style.includes("pueblo") || style.includes("spanish") || style.includes("monterey")) {
    return { roof: "flat", width: 1.1, depth: 1.06, floors: 1, accent: materials.coral };
  }
  if (style.includes("saltbox") || style.includes("cape cod") || style.includes("colonial") || style.includes("dutch")) {
    return { roof: "gable", width: 1.0, depth: 1.0, floors: 2, accent: materials.volt };
  }
  if (style.includes("victorian") || style.includes("queen anne") || style.includes("second empire")) {
    return { roof: "tower", width: 0.96, depth: 1.08, floors: 3, accent: materials.orchid };
  }
  if (style.includes("ranch") || style.includes("prairie") || style.includes("shed")) {
    return { roof: "shed", width: 1.35, depth: 0.82, floors: 1, accent: materials.aqua };
  }
  if (style.includes("gothic") || style.includes("neoclassical") || style.includes("federal") || style.includes("georgian")) {
    return { roof: "steep", width: 1.02, depth: 0.95, floors: 2, accent: materials.chrome };
  }
  return { roof: "hip", width: 1, depth: 1, floors: 2, accent: materials.volt };
}

function drivewayMaterial(driveway) {
  const text = String(driveway || "").toLowerCase();
  if (text.includes("brick")) return materials.brick;
  if (text.includes("asphalt") || text.includes("tar")) return materials.asphalt;
  if (text.includes("concrete") || text.includes("paver")) return materials.concrete;
  if (text.includes("basalt")) return materials.basalt;
  if (text.includes("cobblestone")) return materials.cobble;
  if (text.includes("crushed")) return materials.crushedStone;
  return materials.gravel;
}

function addWindows(group, width, height, depth, colorMaterial, frontSign) {
  const windowMaterial = new THREE.MeshBasicMaterial({ color: 0xd7ff3f });
  const floors = Math.max(1, Math.round(height / 0.75));
  for (let floor = 0; floor < floors; floor += 1) {
    [-0.28, 0.28].forEach((offset) => {
      const frontWindow = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.18, 0.025), windowMaterial);
      frontWindow.position.set(offset * width, 0.52 + floor * 0.48, frontSign * (depth / 2 + 0.016));
      group.add(frontWindow);
    });
  }
  const door = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.48, 0.03), colorMaterial);
  door.position.set(-width * 0.2, 0.34, frontSign * (depth / 2 + 0.022));
  group.add(door);

  const garage = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.42, 0.035), materials.chrome);
  garage.position.set(width * 0.28, 0.31, frontSign * (depth / 2 + 0.024));
  group.add(garage);

  const porch = new THREE.Mesh(new THREE.BoxGeometry(width * 0.52, 0.05, 0.34), materials.sidewalk);
  porch.position.set(0, 0.16, frontSign * (depth / 2 + 0.2));
  group.add(porch);
}

function addRoof(group, profile, width, height, depth) {
  if (profile.roof === "flat") {
    const roof = new THREE.Mesh(new THREE.BoxGeometry(width * 1.08, 0.16, depth * 1.08), profile.accent);
    roof.position.y = height + 0.22;
    group.add(roof);
    return;
  }

  if (profile.roof === "shed") {
    const roof = new THREE.Mesh(new THREE.BoxGeometry(width * 1.12, 0.18, depth * 1.08), profile.accent);
    roof.position.y = height + 0.24;
    roof.rotation.z = 0.16;
    group.add(roof);
    return;
  }

  if (profile.roof === "tower") {
    const roof = new THREE.Mesh(new THREE.ConeGeometry(Math.max(width, depth) * 0.58, 0.86, 6), profile.accent);
    roof.position.y = height + 0.58;
    group.add(roof);
    const tower = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.28, height * 0.85, 8), materials.glass);
    tower.position.set(width * 0.36, height * 0.58, -depth * 0.18);
    group.add(tower);
    return;
  }

  const segments = profile.roof === "steep" ? 3 : 4;
  const roofHeight = profile.roof === "steep" ? 1.08 : 0.72;
  const roof = new THREE.Mesh(new THREE.ConeGeometry(Math.max(width, depth) * 0.62, roofHeight, segments), profile.accent);
  roof.position.y = height + roofHeight / 2 + 0.16;
  roof.rotation.y = Math.PI / 4;
  group.add(roof);
}

function addParkedCar(side, z, material) {
  const car = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.92, 0.34, 1.72), material);
  body.position.y = 0.26;
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(0.64, 0.28, 0.72), materials.glass);
  cabin.position.y = 0.58;
  const wheelGeometry = new THREE.CylinderGeometry(0.14, 0.14, 0.1, 14);
  [-0.36, 0.36].forEach((x) => {
    [-0.58, 0.58].forEach((wheelZ) => {
      const wheel = new THREE.Mesh(wheelGeometry, materials.dark);
      wheel.rotation.z = Math.PI / 2;
      wheel.position.set(x, 0.14, wheelZ);
      car.add(wheel);
    });
  });
  car.add(body, cabin);
  car.position.set(side * (ROAD_HALF - 0.72), 0.06, z);
  car.rotation.y = side < 0 ? Math.PI : 0;
  mapRoot.add(car);
}

function addStreetSign(side, z, labelWidth = 0.64) {
  const sign = new THREE.Group();
  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.035, 1.05, 8), materials.chrome);
  post.position.y = 0.52;
  const panel = new THREE.Mesh(new THREE.BoxGeometry(labelWidth, 0.28, 0.045), materials.aqua);
  panel.position.y = 1.08;
  sign.add(post, panel);
  sign.position.set(side * (ROAD_HALF + SIDEWALK_WIDTH + 0.42), 0, z);
  sign.rotation.y = side < 0 ? Math.PI / 2 : -Math.PI / 2;
  mapRoot.add(sign);
}

function addStreetSplit() {
  const crossRoad = new THREE.Mesh(new THREE.PlaneGeometry(CROSS_STREET_LENGTH, CROSS_STREET_WIDTH), materials.road);
  crossRoad.rotation.x = -Math.PI / 2;
  crossRoad.position.set(0, 0.019, SPLIT_Z);
  mapRoot.add(crossRoad);

  const stopBar = new THREE.Mesh(new THREE.PlaneGeometry(ROAD_WIDTH - 0.8, 0.18), materials.roadLine);
  stopBar.rotation.x = -Math.PI / 2;
  stopBar.position.set(0, 0.052, SPLIT_Z + CROSS_STREET_WIDTH * 0.52);
  mapRoot.add(stopBar);

  [-1, 1].forEach((side) => {
    const branchStripe = new THREE.Mesh(new THREE.PlaneGeometry(6.2, 0.14), materials.stripe);
    branchStripe.rotation.x = -Math.PI / 2;
    branchStripe.position.set(side * 6.0, 0.052, SPLIT_Z);
    mapRoot.add(branchStripe);

    const outerCurb = new THREE.Mesh(new THREE.BoxGeometry(CROSS_STREET_LENGTH / 2 - 1.5, 0.18, 0.16), materials.curb);
    outerCurb.position.set(side * 7.2, 0.12, SPLIT_Z - CROSS_STREET_WIDTH / 2);
    mapRoot.add(outerCurb);

    const innerCurb = new THREE.Mesh(new THREE.BoxGeometry(CROSS_STREET_LENGTH / 2 - 1.5, 0.18, 0.16), materials.curb);
    innerCurb.position.set(side * 7.2, 0.12, SPLIT_Z + CROSS_STREET_WIDTH / 2);
    mapRoot.add(innerCurb);

    const sidewalk = new THREE.Mesh(new THREE.PlaneGeometry(CROSS_STREET_LENGTH / 2 - 1.2, SIDEWALK_WIDTH), materials.sidewalk);
    sidewalk.rotation.x = -Math.PI / 2;
    sidewalk.position.set(side * 7.15, 0.048, SPLIT_Z - CROSS_STREET_WIDTH / 2 - SIDEWALK_WIDTH / 2 - 0.24);
    mapRoot.add(sidewalk);

    const arrow = new THREE.Group();
    const shaft = new THREE.Mesh(new THREE.BoxGeometry(1.25, 0.03, 0.18), materials.stripe);
    const head = new THREE.Mesh(new THREE.ConeGeometry(0.34, 0.62, 3), materials.stripe);
    head.rotation.z = side < 0 ? Math.PI / 2 : -Math.PI / 2;
    head.position.x = side * 0.82;
    arrow.add(shaft, head);
    arrow.position.set(side * 2.2, 0.06, SPLIT_Z + 0.8);
    mapRoot.add(arrow);

    addStreetSign(side, SPLIT_Z + 3.1, 0.82);
  });
}

function addGround() {
  const grass = new THREE.Mesh(new THREE.PlaneGeometry(38, BLOCK_LENGTH + 8), materials.grass);
  grass.rotation.x = -Math.PI / 2;
  grass.position.z = -18;
  mapRoot.add(grass);

  const road = new THREE.Mesh(new THREE.PlaneGeometry(ROAD_WIDTH, BLOCK_LENGTH), materials.road);
  road.rotation.x = -Math.PI / 2;
  road.position.y = 0.015;
  road.position.z = -18;
  mapRoot.add(road);
  addStreetSplit();

  [-1, 1].forEach((side) => {
    const curbX = side * (ROAD_HALF + 0.12);
    const sidewalkX = side * (ROAD_HALF + SIDEWALK_WIDTH / 2 + 0.28);
    const plantingX = side * (ROAD_HALF + SIDEWALK_WIDTH + 0.82);

    const gutter = new THREE.Mesh(new THREE.PlaneGeometry(0.32, BLOCK_LENGTH), materials.asphalt);
    gutter.rotation.x = -Math.PI / 2;
    gutter.position.set(side * (ROAD_HALF - 0.16), 0.026, -18);
    mapRoot.add(gutter);

    const sidewalk = new THREE.Mesh(new THREE.PlaneGeometry(SIDEWALK_WIDTH, BLOCK_LENGTH), materials.sidewalk);
    sidewalk.rotation.x = -Math.PI / 2;
    sidewalk.position.set(sidewalkX, 0.045, -18);
    mapRoot.add(sidewalk);

    const curb = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.2, BLOCK_LENGTH), materials.curb);
    curb.position.set(curbX, 0.12, -18);
    mapRoot.add(curb);

    const propertyEdge = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.08, BLOCK_LENGTH), materials.curb);
    propertyEdge.position.set(side * (ROAD_HALF + SIDEWALK_WIDTH + 0.48), 0.08, -18);
    mapRoot.add(propertyEdge);

    for (let row = 0; row < 10; row += 1) {
      const z = 15 - row * LOT_SPACING;
      const treeTrunk = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 0.9, 8), materials.islandSide || materials.brick);
      treeTrunk.position.set(plantingX, 0.48, z + 2.35);
      mapRoot.add(treeTrunk);
      const treeTop = new THREE.Mesh(new THREE.SphereGeometry(0.34, 14, 10), materials.volt);
      treeTop.position.set(plantingX, 1.12, z + 2.35);
      mapRoot.add(treeTop);
    }
  });

  for (let index = 0; index < 15; index += 1) {
    const stripe = new THREE.Mesh(new THREE.PlaneGeometry(0.22, 1.8), materials.stripe);
    stripe.rotation.x = -Math.PI / 2;
    stripe.position.set(0, 0.032, 15 - index * 4.2);
    mapRoot.add(stripe);
  }

  [-1, 1].forEach((side) => {
    const edgeLine = new THREE.Mesh(new THREE.PlaneGeometry(0.08, 63), materials.roadLine);
    edgeLine.rotation.x = -Math.PI / 2;
    edgeLine.position.set(side * (ROAD_HALF - 0.42), 0.038, -13.5);
    mapRoot.add(edgeLine);

    for (let row = 0; row < 8; row += 1) {
      const parkingLine = new THREE.Mesh(new THREE.PlaneGeometry(0.06, 1.35), materials.roadLine);
      parkingLine.rotation.x = -Math.PI / 2;
      parkingLine.position.set(side * (ROAD_HALF - 1.15), 0.039, 12.2 - row * 8.2);
      mapRoot.add(parkingLine);
    }
  });

  [17.4, -43.2].forEach((z) => {
    for (let index = 0; index < 7; index += 1) {
      const crosswalk = new THREE.Mesh(new THREE.PlaneGeometry(0.38, ROAD_WIDTH + 0.7), materials.crosswalk);
      crosswalk.rotation.x = -Math.PI / 2;
      crosswalk.rotation.z = Math.PI / 2;
      crosswalk.position.set(-2.7 + index * 0.9, 0.041, z);
      mapRoot.add(crosswalk);
    }
  });

  [-1, 1].forEach((side) => {
    [10.8, -2.5, -21.5, -34.5].forEach((z, index) => {
      addParkedCar(side, z, carMaterials[(index + (side > 0 ? 1 : 0)) % carMaterials.length]);
    });
    addStreetSign(side, 17.1);
    addStreetSign(side, -42.7, 0.82);
  });

  for (let row = 0; row < 10; row += 1) {
    const z = 15 - row * LOT_SPACING;
    [-1, 1].forEach((side) => {
      const x = side * (ROAD_HALF + SIDEWALK_WIDTH + 0.16);
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.06, 2.2, 12), materials.chrome);
      post.position.set(x, 1.1, z - 2.35);
      mapRoot.add(post);

      const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.18, 16, 12), materials.volt);
      lamp.position.set(x, 2.26, z - 2.35);
      mapRoot.add(lamp);

      const glow = new THREE.PointLight(0xd7ff3f, 0.65, 5.5);
      glow.position.copy(lamp.position);
      mapRoot.add(glow);
    });
  }
}

function addPortalGate() {
  const ring = new THREE.Mesh(new THREE.TorusGeometry(3.2, 0.08, 16, 120), materials.glass);
  ring.position.set(0, 4.1, -44);
  ring.rotation.y = Math.PI / 2;
  mapRoot.add(ring);

  const core = new THREE.Mesh(
    new THREE.CircleGeometry(3.05, 64),
    new THREE.MeshBasicMaterial({ color: 0x7cffc4, transparent: true, opacity: 0.12, side: THREE.DoubleSide })
  );
  core.position.copy(ring.position);
  core.rotation.copy(ring.rotation);
  mapRoot.add(core);
}

function createHouseMesh(house, slotIndex) {
  const side = slotIndex < 10 ? -1 : 1;
  const row = slotIndex % 10;
  const z = 15 - row * LOT_SPACING;
  const parcelCenterX = side * PARCEL_CENTER_X;
  const group = new THREE.Group();
  const landSqft = traitNumber(house.land, 18000);
  const homeSqft = traitNumber(house.homeSize, 6000);
  const profile = styleProfile(house.homeStyle);
  const parcelDepth = scaleFromRange(landSqft, 15000, 91000, 4.4, 5.8);
  const parcelFrontage = scaleFromRange(landSqft, 15000, 91000, 5.0, 6.1);
  const baseWidth = scaleFromRange(homeSqft, 1200, 12000, 1.1, 2.35) * profile.width;
  const baseDepth = scaleFromRange(homeSqft, 1200, 12000, 1.0, 2.05) * profile.depth;
  const bodyHeight = scaleFromRange(homeSqft, 1200, 12000, 0.82, 1.85) + (profile.floors - 1) * 0.32;
  const roadEdgeLocalX = side * ROAD_HALF - parcelCenterX;
  const houseLocalX = side * 0.85;
  const houseLocalZ = 0;
  const houseRotation = side < 0 ? Math.PI / 2 : -Math.PI / 2;
  const frontX = houseLocalX - side * (baseDepth / 2);
  const drivewayCenterX = (roadEdgeLocalX + frontX) / 2;
  const drivewayRun = Math.abs(roadEdgeLocalX - frontX);
  const drivewayWidth = house.drivewayStyle?.includes("Valet") ? 1.55 : house.drivewayStyle?.includes("Oyster") ? 1.28 : 1.05;
  const drivewayZ = houseLocalZ + side * baseWidth * 0.24;

  const lot = new THREE.Mesh(new THREE.BoxGeometry(parcelDepth, 0.12, parcelFrontage), materials.lot);
  lot.position.y = 0.06;
  group.add(lot);

  const lawnInset = new THREE.Mesh(new THREE.BoxGeometry(parcelDepth - 0.36, 0.035, parcelFrontage - 0.36), materials.grass);
  lawnInset.position.y = 0.14;
  group.add(lawnInset);

  const propertyLine = new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.BoxGeometry(parcelDepth, 0.05, parcelFrontage)),
    new THREE.LineBasicMaterial({ color: 0xcfffe6, transparent: true, opacity: 0.32 })
  );
  propertyLine.position.y = 0.18;
  group.add(propertyLine);

  [-1, 1].forEach((fenceSide) => {
    const fence = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.34, parcelFrontage - 0.32), materials.curb);
    fence.position.set(fenceSide * parcelDepth * 0.48, 0.28, 0);
    group.add(fence);
  });

  const houseModule = new THREE.Group();
  houseModule.position.set(houseLocalX, 0, houseLocalZ);
  houseModule.rotation.y = houseRotation;

  const bodyMaterial = houseColor(house, slotIndex);
  const body = new THREE.Mesh(new THREE.BoxGeometry(baseWidth, bodyHeight, baseDepth), bodyMaterial);
  body.position.y = 0.16 + bodyHeight / 2;
  houseModule.add(body);
  addWindows(houseModule, baseWidth, bodyHeight, baseDepth, materials.dark, 1);
  addRoof(houseModule, profile, baseWidth, bodyHeight, baseDepth);
  group.add(houseModule);

  const driveway = new THREE.Mesh(
    new THREE.BoxGeometry(drivewayRun, 0.045, drivewayWidth),
    drivewayMaterial(house.driveway)
  );
  driveway.position.set(drivewayCenterX, 0.165, drivewayZ);
  group.add(driveway);

  const curbCut = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.055, drivewayWidth + 0.25), materials.concrete);
  curbCut.position.set(roadEdgeLocalX - side * 0.18, 0.18, drivewayZ);
  group.add(curbCut);

  const walkway = new THREE.Mesh(new THREE.BoxGeometry(Math.max(0.7, drivewayRun * 0.62), 0.035, 0.34), materials.sidewalk);
  walkway.position.set((roadEdgeLocalX + frontX) / 2, 0.19, houseLocalZ - side * baseWidth * 0.24);
  group.add(walkway);

  if (house.drivewayStyle?.includes("Oyster")) {
    for (let index = 0; index < 6; index += 1) {
      const shell = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6), materials.crushedStone);
      shell.scale.set(1.4, 0.28, 0.9);
      shell.position.set(drivewayCenterX + side * (index - 2.5) * 0.22, 0.22, drivewayZ + 0.46);
      group.add(shell);
    }
  }

  if (house.drivewayStyle?.includes("Valet")) {
    const valetPost = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.04, 0.7, 10), materials.coral);
    valetPost.position.set(frontX - side * 0.36, 0.5, drivewayZ + 0.72);
    group.add(valetPost);
  }

  const mailbox = new THREE.Group();
  const mailboxPost = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.03, 0.5, 8), materials.chrome);
  mailboxPost.position.y = 0.25;
  const mailboxBox = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.18, 0.18), materials.aqua);
  mailboxBox.position.y = 0.56;
  mailbox.add(mailboxPost, mailboxBox);
  mailbox.position.set(roadEdgeLocalX - side * 0.58, 0.08, drivewayZ - 0.72);
  group.add(mailbox);

  const antenna = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.8, 8), materials.glass);
  antenna.position.set(0.48, bodyHeight + 1.08, -0.18);
  houseModule.add(antenna);

  const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.12, 16, 12), materials.volt);
  beacon.position.copy(antenna.position);
  beacon.position.y += 0.46;
  houseModule.add(beacon);

  group.position.set(parcelCenterX, 0, z);
  group.userData.house = house;
  group.userData.baseY = 0;

  group.traverse((child) => {
    if (child.isMesh) {
      child.userData.house = house;
      child.userData.houseGroup = group;
      clickableMeshes.push(child);
    }
  });

  mapRoot.add(group);
  return group;
}

function clearHouses() {
  for (let index = mapRoot.children.length - 1; index >= 0; index -= 1) {
    const child = mapRoot.children[index];
    if (child.userData.generatedHouse) mapRoot.remove(child);
  }
  clickableMeshes.length = 0;
}

async function renderBlock() {
  blockLabel.textContent = "Loading...";
  prevBlock.disabled = true;
  nextBlock.disabled = true;
  targetStreetFocusZ = 8;
  streetFocusZ = 8;
  updateStreetLabel();
  clearHouses();
  const visible = await Promise.all(
    houseData.slice(visibleOffset, visibleOffset + PAGE_SIZE).map(loadHouseDetails)
  );

  visible.forEach((house, index) => {
    const houseMesh = createHouseMesh(house, index);
    houseMesh.userData.generatedHouse = true;
  });

  const start = PUBLIC_MINT_START + visibleOffset;
  const end = Math.min(PUBLIC_MINT_START + visibleOffset + PAGE_SIZE - 1, PUBLIC_MINT_END);
  blockLabel.textContent = `${start}-${end} of ${houseData.length}`;
  prevBlock.disabled = visibleOffset === 0;
  nextBlock.disabled = visibleOffset + PAGE_SIZE >= houseData.length;

  if (visible.length > 0) selectHouse(visible[0], clickableMeshes[0]?.userData.houseGroup, false);
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
  const progress = Math.round(((8 - targetStreetFocusZ) / 52) * 100);
  streetLabel.textContent = progress >= 96 ? "Left / Right split" : `Street ${Math.min(100, Math.max(0, progress))}%`;
  walkBack.disabled = targetStreetFocusZ >= 8;
  walkForward.disabled = targetStreetFocusZ <= -44;
}

function moveStreet(delta) {
  targetStreetFocusZ = Math.min(8, Math.max(-44, targetStreetFocusZ + delta));
  updateStreetLabel();
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

  if (selectedMesh) selectedMesh.scale.setScalar(1);
  selectedMesh = meshGroup || selectedMesh;
  if (selectedMesh) selectedMesh.scale.setScalar(1.08);

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

function setupEvents() {
  window.addEventListener("pointermove", (event) => {
    mouseDrift.x = (event.clientX / window.innerWidth - 0.5) * 2;
    mouseDrift.y = (event.clientY / window.innerHeight - 0.5) * 2;
  });

  canvas.addEventListener("click", (event) => {
    const rect = canvas.getBoundingClientRect();
    pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(pointer, camera);
    const hit = raycaster.intersectObjects(clickableMeshes, false)[0];
    if (hit?.object?.userData?.house) {
      selectHouse(hit.object.userData.house, hit.object.userData.houseGroup);
    }
  });

  prevBlock.addEventListener("click", async () => {
    visibleOffset = Math.max(0, visibleOffset - PAGE_SIZE);
    await renderBlock();
  });

  nextBlock.addEventListener("click", async () => {
    visibleOffset = Math.min(Math.max(0, houseData.length - PAGE_SIZE), visibleOffset + PAGE_SIZE);
    await renderBlock();
  });

  walkForward.addEventListener("click", () => moveStreet(-8));
  walkBack.addEventListener("click", () => moveStreet(8));

  window.addEventListener("keydown", (event) => {
    if (event.key === "ArrowUp" || event.key.toLowerCase() === "w") moveStreet(-4);
    if (event.key === "ArrowDown" || event.key.toLowerCase() === "s") moveStreet(4);
  });

  canvas.addEventListener("wheel", (event) => {
    event.preventDefault();
    moveStreet(event.deltaY > 0 ? -4 : 4);
  }, { passive: false });

  connectButton.addEventListener("click", connectWallet);
  mintButton.addEventListener("click", mintSelectedHouse);
  closePanel.addEventListener("click", () => detailPanel.classList.add("is-hidden"));

  window.addEventListener("resize", () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });
}

function animate() {
  const time = performance.now() * 0.001;
  streetFocusZ += (targetStreetFocusZ - streetFocusZ) * 0.08;
  mapRoot.rotation.y = mouseDrift.x * 0.04;
  camera.position.x = mouseDrift.x * 1.2;
  camera.position.y = 9.5 + mouseDrift.y * -0.35;
  camera.position.z = streetFocusZ + 11;
  camera.lookAt(mouseDrift.x * 0.8, 0.2, streetFocusZ - 20);

  for (const mesh of clickableMeshes) {
    const group = mesh.userData.houseGroup;
    if (group && group === selectedMesh) {
      group.position.y = Math.sin(time * 3) * 0.08;
    }
  }

  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}

async function boot() {
  addGround();
  addPortalGate();
  setupEvents();

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
  animate();
}

boot().catch((error) => {
  console.error(error);
  showToast("Could not load Metagascar map data.");
});
