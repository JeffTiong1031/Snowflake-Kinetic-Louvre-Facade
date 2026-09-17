/**
 * Ground, plaza and planting around the tower.
 *
 * The ground is mottled grass. The plaza at the tower's foot is stone paving
 * inside a granite edge, with paths out to the pavements of the roads north
 * and south, and trees in granite planters.
 *
 * Trees are procedural: a tapered trunk and a lumpy crown of five merged
 * spheres. Both are single InstancedMeshes, so the whole landscape costs two
 * draw calls regardless of TREE_COUNT. Placement uses a seeded PRNG, so the
 * layout is identical on every reload. Both bend in the storm's wind
 * (weather.js).
 */

import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import * as C from './constants.js';
import { swayInWind } from './weather.js';
import { grassTexture, pavingTexture } from './textures.js';

/** Small deterministic PRNG, so the landscape does not reshuffle on reload. */
function mulberry32(seed) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function scaleUV(geometry, su, sv) {
  const uv = geometry.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * su, uv.getY(i) * sv);
  uv.needsUpdate = true;
  return geometry;
}

export function buildEnvironment(scene, isBlocked = () => false) {
  buildGround(scene);
  const planters = buildPlaza(scene);
  buildTrees(scene, isBlocked, planters);
}

/* ------------------------------------------------------------------ *
 * Ground and plaza
 * ------------------------------------------------------------------ */

function buildGround(scene) {
  const size = 1600;
  const repeats = size / C.GRASS_TILE;
  const ground = new THREE.Mesh(
    scaleUV(new THREE.PlaneGeometry(size, size), repeats, repeats),
    new THREE.MeshStandardMaterial({
      map: grassTexture(),
      color: C.GROUND_COLOR,
      roughness: 1.0,
      metalness: 0.0,
    })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);
}

/**
 * The paved plaza, lifted a hair off the grass: its granite edge, paths out
 * to the pavements, and planters for trees. Returns the planters' centres.
 */
function buildPlaza(scene) {
  const R = C.PLAZA_RADIUS;
  const tile = C.PAVING_TILE * C.MM;

  // The paths start under the granite edge, which covers where they meet the circle.
  const paved = [scaleUV(new THREE.CircleGeometry(R, 72), (2 * R) / tile, (2 * R) / tile).rotateX(-Math.PI / 2)];
  for (const side of [-1, 1]) {
    const road = Math.min(...C.ROAD_LINES_Z.filter((z) => Math.sign(z) === side).map(Math.abs));
    const from = R - 0.45;
    const to = road - C.ROAD_HALF_WIDTH - C.PAVEMENT_WIDTH + 0.3;
    const length = to - from;
    paved.push(
      scaleUV(new THREE.PlaneGeometry(C.PATH_WIDTH, length), C.PATH_WIDTH / tile, length / tile)
        .rotateX(-Math.PI / 2)
        .translate(0, 0, side * (from + length / 2))
    );
  }
  const plaza = new THREE.Mesh(
    mergeGeometries(paved, false),
    new THREE.MeshStandardMaterial({
      map: pavingTexture({ base: '#' + new THREE.Color(C.PLAZA_COLOR).getHexString(), seed: 21 }),
      roughness: 0.7,
      metalness: 0.0,
    })
  );
  plaza.position.y = 0.02;
  plaza.receiveShadow = true;
  scene.add(plaza);

  // Planters: two either side of the tower's short faces, four off its long faces clear of the paths.
  const planters = [];
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      planters.push([sx * 25.9, sz * 5.5], [sx * 11, sz * 24]);
    }
  }

  const granite = new THREE.MeshStandardMaterial({ color: C.GRANITE_COLOR, roughness: 0.55, metalness: 0.05 });
  const edge = new THREE.Mesh(
    mergeGeometries(
      [
        new THREE.RingGeometry(R - 0.5, R + 0.1, 96).rotateX(-Math.PI / 2).translate(0, 0.03, 0),
        ...planters.map(([x, z]) => new THREE.CylinderGeometry(1.35, 1.45, 0.5, 28).translate(x, 0.25, z)),
      ],
      false
    ),
    granite
  );
  edge.castShadow = true;
  edge.receiveShadow = true;
  scene.add(edge);

  const soil = new THREE.Mesh(
    mergeGeometries(
      planters.map(([x, z]) => new THREE.CircleGeometry(1.2, 24).rotateX(-Math.PI / 2).translate(x, 0.51, z)),
      false
    ),
    new THREE.MeshStandardMaterial({ color: 0x3b3026, roughness: 1.0 })
  );
  soil.receiveShadow = true;
  scene.add(soil);

  return planters;
}

/* ------------------------------------------------------------------ *
 * Trees
 * ------------------------------------------------------------------ */

/**
 * A crown of unit radius: five overlapping spheres, merged, welded, and each
 * vertex pushed in or out a little, so it reads as a leafy mass rather than a
 * polyhedron.
 */
function canopyGeometry() {
  const blobs = [
    { r: 1.0, x: 0, y: 0, z: 0 },
    { r: 0.74, x: 0.6, y: 0.3, z: 0.25 },
    { r: 0.7, x: -0.52, y: 0.28, z: -0.32 },
    { r: 0.62, x: 0.1, y: 0.62, z: -0.1 },
    { r: 0.6, x: -0.2, y: 0.05, z: 0.62 },
  ].map(({ r, x, y, z }) => new THREE.IcosahedronGeometry(r, 1).translate(x, y, z));

  let crown = mergeGeometries(blobs, false);
  blobs.forEach((b) => b.dispose());
  crown.deleteAttribute('normal');
  crown.deleteAttribute('uv');
  crown = mergeVertices(crown);

  const p = crown.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const y = p.getY(i);
    const z = p.getZ(i);
    const k = 1 + 0.09 * Math.sin(x * 7.1 + y * 3.3) * Math.cos(z * 6.7 - y * 2.9);
    p.setXYZ(i, x * k, y * k, z * k);
  }
  crown.computeVertexNormals();
  return crown;
}

/** Trees in the plaza's planters first, then a seeded scatter in a ring round it. */
function buildTrees(scene, isBlocked, planters) {
  const rand = mulberry32(20260908);
  const capacity = C.TREE_COUNT + planters.length;

  const trunkGeo = new THREE.CylinderGeometry(0.55, 1.0, 1, 8);
  trunkGeo.translate(0, 0.5, 0); // base at origin so instances sit on the ground

  const trunkMesh = new THREE.InstancedMesh(
    trunkGeo,
    new THREE.MeshStandardMaterial({
      color: C.TRUNK_COLOR,
      roughness: 0.95,
      metalness: 0.0,
    }),
    capacity
  );
  trunkMesh.castShadow = true;

  const canopyMesh = new THREE.InstancedMesh(
    canopyGeometry(),
    new THREE.MeshStandardMaterial({
      roughness: 0.9,
      metalness: 0.0,
    }),
    capacity
  );
  canopyMesh.castShadow = true;
  canopyMesh.receiveShadow = true;

  swayInWind(trunkMesh.material);
  swayInWind(canopyMesh.material);

  const m = new THREE.Matrix4();
  const pos = new THREE.Vector3();
  const quat = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  const euler = new THREE.Euler();

  const tint = new THREE.Color();
  const leafA = new THREE.Color(C.CANOPY_COLOR_A);
  const leafB = new THREE.Color(C.CANOPY_COLOR_B);

  let placed = 0;

  function plant(x, z, height) {
    const trunkH = height * 0.42;
    const trunkR = height * 0.036;
    const canopyR = height * 0.3;

    // Trunk
    euler.set(0, rand() * Math.PI * 2, 0);
    quat.setFromEuler(euler);
    pos.set(x, 0, z);
    scale.set(trunkR, trunkH, trunkR);
    m.compose(pos, quat, scale);
    trunkMesh.setMatrixAt(placed, m);

    // Canopy, wobbled a little on each axis so no two read identically
    euler.set((rand() - 0.5) * 0.35, rand() * Math.PI * 2, (rand() - 0.5) * 0.35);
    quat.setFromEuler(euler);
    pos.set(x, trunkH + canopyR * 0.62, z);
    scale.set(
      canopyR * (0.85 + rand() * 0.35),
      canopyR * (0.8 + rand() * 0.45),
      canopyR * (0.85 + rand() * 0.35)
    );
    m.compose(pos, quat, scale);
    canopyMesh.setMatrixAt(placed, m);

    tint.copy(leafA).lerp(leafB, rand());
    canopyMesh.setColorAt(placed, tint);

    placed++;
  }

  for (const [x, z] of planters) plant(x, z, 9 + rand() * 1.5);

  // Keep planting off the plaza and outside the tower footprint.
  const keepOutX = (C.TOWER_WIDTH_X * C.MM) / 2 + 6;
  const keepOutZ = (C.TOWER_DEPTH_Z * C.MM) / 2 + 6;

  let attempts = 0;
  while (placed < capacity && attempts < C.TREE_COUNT * 120) {
    attempts++;

    // Square-root radius keeps the ring evenly covered rather than crowding in.
    const a = rand() * Math.PI * 2;
    const t = Math.sqrt(rand());
    const radius = C.TREE_RING_INNER + t * (C.TREE_RING_OUTER - C.TREE_RING_INNER);

    const x = Math.cos(a) * radius;
    const z = Math.sin(a) * radius;

    if (Math.hypot(x, z) < C.PLAZA_RADIUS + 1.5) continue;
    if (Math.abs(x) < keepOutX && Math.abs(z) < keepOutZ) continue;
    if (isBlocked(x, z)) continue;

    plant(x, z, C.TREE_HEIGHT_MIN + rand() * (C.TREE_HEIGHT_MAX - C.TREE_HEIGHT_MIN));
  }

  trunkMesh.count = placed;
  canopyMesh.count = placed;
  trunkMesh.instanceMatrix.needsUpdate = true;
  canopyMesh.instanceMatrix.needsUpdate = true;
  if (canopyMesh.instanceColor) canopyMesh.instanceColor.needsUpdate = true;
  trunkMesh.computeBoundingSphere();
  canopyMesh.computeBoundingSphere();

  scene.add(trunkMesh);
  scene.add(canopyMesh);
}
