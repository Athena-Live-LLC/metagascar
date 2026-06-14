import * as THREE from "https://unpkg.com/three@0.165.0/build/three.module.js";

const canvas = document.querySelector("#metaverse-scene");
const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x071310, 0.045);

const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true,
  alpha: true
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;

const camera = new THREE.PerspectiveCamera(48, window.innerWidth / window.innerHeight, 0.1, 120);
camera.position.set(0, 4.6, 13);

const root = new THREE.Group();
scene.add(root);

const hemi = new THREE.HemisphereLight(0xcfffe6, 0x231220, 2.6);
scene.add(hemi);

const sun = new THREE.DirectionalLight(0xffffff, 3.5);
sun.position.set(5, 8, 6);
scene.add(sun);

const point = new THREE.PointLight(0x7cffc4, 3, 22);
point.position.set(-5, 3, 5);
scene.add(point);

const materials = {
  islandTop: new THREE.MeshStandardMaterial({ color: 0x69d271, roughness: 0.72, metalness: 0.05 }),
  islandSide: new THREE.MeshStandardMaterial({ color: 0xb1763a, roughness: 0.86, metalness: 0.02 }),
  water: new THREE.MeshStandardMaterial({
    color: 0x3be7ff,
    roughness: 0.18,
    metalness: 0.08,
    transparent: true,
    opacity: 0.36
  }),
  neonMint: new THREE.MeshStandardMaterial({ color: 0x7cffc4, emissive: 0x1fdc98, emissiveIntensity: 0.7 }),
  neonVolt: new THREE.MeshStandardMaterial({ color: 0xd7ff3f, emissive: 0x8fab00, emissiveIntensity: 0.9 }),
  coral: new THREE.MeshStandardMaterial({ color: 0xff6f61, emissive: 0x9e241c, emissiveIntensity: 0.3 }),
  orchid: new THREE.MeshStandardMaterial({ color: 0xc67dff, emissive: 0x6a27a3, emissiveIntensity: 0.42 }),
  chrome: new THREE.MeshStandardMaterial({ color: 0xe8fff8, roughness: 0.2, metalness: 0.7 }),
  dark: new THREE.MeshStandardMaterial({ color: 0x12121f, roughness: 0.52, metalness: 0.18 })
};

function addIsland() {
  const base = new THREE.Mesh(new THREE.CylinderGeometry(4.2, 2.9, 1.15, 9), materials.islandSide);
  base.position.y = -1.2;
  root.add(base);

  const top = new THREE.Mesh(new THREE.CylinderGeometry(4.35, 4.05, 0.34, 9), materials.islandTop);
  top.position.y = -0.48;
  root.add(top);

  const lagoon = new THREE.Mesh(new THREE.TorusGeometry(3.15, 0.045, 12, 120), materials.water);
  lagoon.rotation.x = Math.PI / 2;
  lagoon.position.y = -0.26;
  root.add(lagoon);

  const portal = new THREE.Mesh(new THREE.TorusGeometry(1.1, 0.045, 12, 96), materials.neonMint);
  portal.position.set(0.5, 0.64, -0.75);
  portal.rotation.y = Math.PI / 5;
  root.add(portal);

  const portalCore = new THREE.Mesh(new THREE.CircleGeometry(0.98, 48), new THREE.MeshBasicMaterial({
    color: 0x7cffc4,
    transparent: true,
    opacity: 0.13,
    side: THREE.DoubleSide
  }));
  portalCore.position.copy(portal.position);
  portalCore.rotation.copy(portal.rotation);
  root.add(portalCore);
}

function addMetaHome(x, z, colorMaterial, scale = 1) {
  const home = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.52, 0.58), colorMaterial);
  const roof = new THREE.Mesh(new THREE.ConeGeometry(0.48, 0.52, 4), materials.neonVolt);
  roof.position.y = 0.52;
  roof.rotation.y = Math.PI / 4;
  const antenna = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.42, 8), materials.chrome);
  antenna.position.y = 1.02;
  home.add(body, roof, antenna);
  home.position.set(x, -0.05, z);
  home.scale.setScalar(scale);
  root.add(home);
  return home;
}

function addPalm(x, z, scale = 1) {
  const palm = new THREE.Group();
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.09, 0.92, 7), materials.islandSide);
  trunk.rotation.z = 0.16;
  const leafGeometry = new THREE.ConeGeometry(0.22, 0.78, 4);
  for (let i = 0; i < 5; i += 1) {
    const leaf = new THREE.Mesh(leafGeometry, materials.neonMint);
    leaf.position.y = 0.58;
    leaf.rotation.z = Math.PI / 2;
    leaf.rotation.y = (i / 5) * Math.PI * 2;
    palm.add(leaf);
  }
  palm.add(trunk);
  palm.position.set(x, 0.02, z);
  palm.scale.setScalar(scale);
  root.add(palm);
}

function addBottle(x, z) {
  const bottle = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, 0.48, 14), materials.water);
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.065, 0.24, 12), materials.chrome);
  neck.position.y = 0.35;
  bottle.add(body, neck);
  bottle.position.set(x, -0.03, z);
  bottle.rotation.z = 1.2;
  root.add(bottle);
}

function addHybridAnimal(x, z, type, scale = 1) {
  const animal = new THREE.Group();
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.26, 20, 16), type === "lemur" ? materials.orchid : materials.coral);
  body.scale.set(1.25, 0.72, 0.72);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.17, 18, 14), materials.neonMint);
  head.position.set(0.34, 0.14, 0);
  const horn = new THREE.Mesh(new THREE.ConeGeometry(0.055, 0.28, 9), materials.neonVolt);
  horn.position.set(0.46, 0.34, 0);
  horn.rotation.z = -0.55;
  const tail = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.035, 8, 32), materials.neonVolt);
  tail.position.set(-0.36, 0.1, 0);
  tail.rotation.y = Math.PI / 2;
  animal.add(body, head, horn, tail);

  if (type === "hover") {
    const wingA = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.46, 3), materials.chrome);
    const wingB = wingA.clone();
    wingA.position.set(0.02, 0.07, 0.32);
    wingB.position.set(0.02, 0.07, -0.32);
    wingA.rotation.x = Math.PI / 2;
    wingB.rotation.x = -Math.PI / 2;
    animal.add(wingA, wingB);
  }

  animal.position.set(x, 0.1, z);
  animal.scale.setScalar(scale);
  root.add(animal);
  return animal;
}

function addRocket() {
  const rocket = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.22, 1.05, 18), materials.chrome);
  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.17, 0.42, 18), materials.coral);
  const flame = new THREE.Mesh(new THREE.ConeGeometry(0.13, 0.45, 14), materials.neonVolt);
  nose.position.y = 0.72;
  flame.position.y = -0.75;
  flame.rotation.x = Math.PI;
  rocket.add(body, nose, flame);
  return rocket;
}

addIsland();
addMetaHome(-1.75, -0.95, materials.coral, 1.08);
addMetaHome(1.88, 0.62, materials.orchid, 0.9);
addMetaHome(-0.74, 1.7, materials.neonMint, 0.72);
addPalm(-2.7, 0.6, 1.05);
addPalm(2.6, -0.88, 0.9);
addPalm(0.4, 2.45, 0.78);
addBottle(2.1, 1.55);
addBottle(-2.15, -1.85);

const creatures = [
  addHybridAnimal(-2.2, 0.05, "lemur", 1),
  addHybridAnimal(1.45, -1.5, "hover", 0.92),
  addHybridAnimal(0.65, 1.48, "lemur", 0.72)
];

const rockets = [addRocket(), addRocket()];
rockets.forEach((rocket, index) => {
  rocket.position.y = 2.5 + index * 0.75;
  root.add(rocket);
});

const stars = new THREE.Group();
const starMaterial = new THREE.MeshBasicMaterial({ color: 0xf3ffe7 });
for (let i = 0; i < 90; i += 1) {
  const star = new THREE.Mesh(new THREE.SphereGeometry(0.018 + Math.random() * 0.02, 6, 6), starMaterial);
  star.position.set((Math.random() - 0.5) * 24, Math.random() * 12 - 1, (Math.random() - 0.5) * 18);
  stars.add(star);
}
scene.add(stars);

const clock = new THREE.Clock();
const pointer = new THREE.Vector2();

window.addEventListener("pointermove", (event) => {
  pointer.x = (event.clientX / window.innerWidth - 0.5) * 2;
  pointer.y = (event.clientY / window.innerHeight - 0.5) * 2;
});

window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

function animate() {
  const elapsed = clock.getElapsedTime();
  root.rotation.y = elapsed * 0.08 + pointer.x * 0.08;
  root.rotation.x = -0.18 + pointer.y * 0.03;

  creatures.forEach((creature, index) => {
    creature.position.y = 0.12 + Math.sin(elapsed * 2.1 + index) * 0.08;
    creature.rotation.y = Math.sin(elapsed + index) * 0.25;
  });

  rockets.forEach((rocket, index) => {
    const radius = 5.7 + index * 1.1;
    const speed = elapsed * (0.42 + index * 0.16) + index * Math.PI;
    rocket.position.x = Math.cos(speed) * radius;
    rocket.position.z = Math.sin(speed) * radius - 0.5;
    rocket.position.y = 2.35 + Math.sin(elapsed * 1.4 + index) * 0.5;
    rocket.rotation.z = -speed + Math.PI / 2;
  });

  stars.rotation.y = elapsed * 0.012;
  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}

animate();
