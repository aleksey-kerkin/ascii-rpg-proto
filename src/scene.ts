import * as THREE from 'three';

export const MAP_W = 12, MAP_H = 12;

/** Tag a material so the ASCII pass knows it's a unit (alpha 0.5) vs environment (alpha 1). */
export function tagUnit<T extends THREE.Material>(m: T): T {
  m.onBeforeCompile = (s) => {
    s.fragmentShader = s.fragmentShader.replace('#include <dithering_fragment>', '#include <dithering_fragment>\n gl_FragColor.a = 0.5;');
  };
  m.customProgramCacheKey = () => 'unit';
  return m;
}

const std = (color: number, emissive = 0x000000, ei = 0) =>
  new THREE.MeshStandardMaterial({ color, emissive, emissiveIntensity: ei, roughness: 0.9, metalness: 0.05, flatShading: true });

export function buildWorld(scene: THREE.Scene) {
  const heights: number[][] = Array.from({ length: MAP_H }, () => Array(MAP_W).fill(0));
  const world = new THREE.Group();
  scene.add(world);

  // lights: strong key from one side so faces separate into different glyph densities
  scene.add(new THREE.HemisphereLight(0xbfffd0, 0x0a2010, 0.55));
  const key = new THREE.DirectionalLight(0xffffff, 2.4);
  key.position.set(-6, 14, 4);
  key.target.position.set(6, 0, 6);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  Object.assign(key.shadow.camera, { left: -12, right: 12, top: 12, bottom: -12, near: 1, far: 40 });
  key.shadow.bias = -0.002;
  scene.add(key, key.target);
  const rim = new THREE.DirectionalLight(0x88ffcc, 0.6);
  rim.position.set(12, 6, -6);
  scene.add(rim);

  const holes = new Set(['11,0', '0,11', '11,4', '5,11']);
  const dataTiles = new Set(['3,2', '4,2', '5,2', '6,2', '7,9', '8,10', '1,6']);
  const tileGeo = new THREE.BoxGeometry(0.9, 0.22, 0.9);
  const tileMats = [std(0x30493a), std(0x2a4232), std(0x36503e)];
  const underGeo = new THREE.BoxGeometry(1.0, 0.3, 1.0);
  const underMat = std(0x0c160f);
  const dataMat = std(0x2a5a3a, 0x30ff80, 0.55);
  for (let z = 0; z < MAP_H; z++) for (let x = 0; x < MAP_W; x++) {
    if (holes.has(`${x},${z}`)) continue;
    const isData = dataTiles.has(`${x},${z}`);
    const m = new THREE.Mesh(tileGeo, isData ? dataMat : tileMats[(x * 7 + z * 3) % 3]);
    m.position.set(x, -0.11, z);
    m.receiveShadow = true;
    world.add(m);
    const u = new THREE.Mesh(underGeo, underMat);
    u.position.set(x, -0.3, z);
    world.add(u);
  }

  const block = (x: number, z: number, h: number, mat: THREE.Material, w = 0.96, d = 0.96, base = 0) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, base + h / 2, z);
    m.castShadow = m.receiveShadow = true;
    world.add(m);
    heights[Math.round(z)][Math.round(x)] = Math.max(heights[Math.round(z)][Math.round(x)], base + h);
    return m;
  };

  // ruined L-shaped wall at the back
  const wallMat = std(0x8aa890);
  [2.6, 2.6, 2.1, 1.3, 0.6].forEach((h, i) => block(i, 0, h, wallMat));
  [2.6, 2.4, 1.6, 0.9].forEach((h, i) => i > 0 && block(0, i, h, wallMat));

  // tower block with glowing data windows
  const tower = std(0x70907a);
  block(9.5, 1.5, 3.4, tower, 1.9, 1.9);
  const winMat = std(0x103018, 0x40ff90, 1.4);
  for (let k = 0; k < 4; k++) {
    const w = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.25, 1.4), winMat);
    w.position.set(8.52, 0.6 + k * 0.75, 1.5);
    world.add(w);
    const w2 = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.25, 0.12), winMat);
    w2.position.set(9.5, 0.6 + k * 0.75, 2.48);
    world.add(w2);
  }

  // ruined pillar + fallen chunk
  const pillarMat = std(0x9ab8a0);
  const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.4, 2.3, 7), pillarMat);
  pillar.position.set(7, 1.15, 4);
  pillar.castShadow = pillar.receiveShadow = true;
  world.add(pillar);
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.5, 7), pillarMat);
  cap.position.set(7.05, 2.42, 4.05); cap.rotation.set(0.35, 0, 0.25);
  cap.castShadow = true; world.add(cap);
  const chunk = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 1.3, 7), pillarMat);
  chunk.position.set(8.2, 0.34, 3.2); chunk.rotation.set(0, 0.6, Math.PI / 2);
  chunk.castShadow = chunk.receiveShadow = true; world.add(chunk);
  heights[3][8] = 0.7; heights[4][7] = 2.3;

  // cover: crates, barrier, low wall
  const crate = std(0x7c9a6a);
  block(3, 6, 0.6, crate, 0.8, 0.8);
  block(4, 6, 0.85, crate, 0.8, 0.8);
  const barrier = std(0x6e8e76);
  [6, 7, 8].forEach((x) => block(x, 8, 0.55, barrier, 0.96, 0.4));
  block(1, 9, 0.95, wallMat); block(2, 9, 0.7, wallMat);

  // raised platform in the corner + server monolith
  const plat = std(0x56765e);
  for (let z = 9; z <= 11; z++) for (let x = 9; x <= 11; x++) block(x, z, 0.5, plat);
  const mono = std(0x0e1e14, 0x20ff70, 0.25);
  const mm = block(11, 11, 1.8, mono, 0.6, 0.6, 0.5);
  mm.castShadow = true;

  return { world, heights };
}
