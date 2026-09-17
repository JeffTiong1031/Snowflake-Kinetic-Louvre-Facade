/**
 * Office fit-out seen through the curtain wall: workstations, seated and
 * standing figures, and ceiling light strips, on every floor.
 *
 * Everything is instanced from a merged geometry, so the entire 30-storey
 * fit-out costs four draw calls. Nothing here casts or receives shadows -- it
 * sits inside the building, well outside the shadow camera fitted to the module
 * field, so shadow work on it would be pure cost.
 *
 * Layout runs on a planning grid per floor, skipping the service core. A seeded
 * PRNG keeps the arrangement identical across reloads.
 */

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import * as C from './constants.js';

function mulberry32(seed) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const FLOOR_H = C.FLOOR_HEIGHT * C.MM;
const HALF_X = (C.TOWER_WIDTH_X * C.MM) / 2;
const HALF_Z = (C.TOWER_DEPTH_Z * C.MM) / 2;
const CORE_HX = (C.CORE_WIDTH_X * C.MM) / 2;
const CORE_HZ = (C.CORE_DEPTH_Z * C.MM) / 2;
const SLAB_TOP = (C.SLAB_THICKNESS * C.MM) / 2;

/* ------------------------------------------------------------------ *
 * Component geometries
 * ------------------------------------------------------------------ */

function box(w, h, d, x, y, z) {
  const g = new THREE.BoxGeometry(w, h, d);
  g.translate(x, y, z);
  return g;
}

/**
 * One workstation, built facing +Z: desk in front, task chair behind it.
 * The occupant sits at the origin end and looks toward +Z.
 */
function workstationGeometry() {
  const parts = [
    box(1.55, 0.045, 0.72, 0, 0.735, 0.62), // desk top
    box(0.42, 0.68, 0.58, -0.5, 0.36, 0.62), // pedestal
    box(0.05, 0.68, 0.05, 0.72, 0.36, 0.36), // far leg
    box(0.05, 0.68, 0.05, 0.72, 0.36, 0.88), // far leg
    box(0.52, 0.32, 0.035, 0.1, 0.94, 0.9), // monitor panel
    box(0.16, 0.03, 0.14, 0.1, 0.78, 0.9), // monitor stand
    box(0.46, 0.06, 0.44, 0, 0.44, 0.02), // chair seat
    box(0.44, 0.5, 0.06, 0, 0.72, -0.19), // chair back
    box(0.07, 0.4, 0.07, 0, 0.22, 0.02), // chair post
  ];
  const merged = mergeGeometries(parts, false);
  parts.forEach((p) => p.dispose());
  return merged;
}

/** Seated figure, facing +Z, hips at the origin. */
function seatedGeometry() {
  const parts = [
    box(0.38, 0.19, 0.46, 0, 0.53, 0.2), // thighs
    box(0.17, 0.42, 0.17, -0.1, 0.26, 0.4), // shin
    box(0.17, 0.42, 0.17, 0.1, 0.26, 0.4), // shin
    box(0.4, 0.56, 0.26, 0, 0.9, 0.03), // torso
    box(0.12, 0.34, 0.12, -0.25, 0.92, 0.1), // arm
    box(0.12, 0.34, 0.12, 0.25, 0.92, 0.1), // arm
  ];
  const merged = mergeGeometries(parts, false);
  parts.forEach((p) => p.dispose());
  return merged;
}

/** Standing figure, feet at the origin. */
function standingGeometry() {
  const parts = [
    box(0.18, 0.82, 0.18, -0.11, 0.41, 0), // leg
    box(0.18, 0.82, 0.18, 0.11, 0.41, 0), // leg
    box(0.42, 0.6, 0.26, 0, 1.13, 0), // torso
    box(0.12, 0.5, 0.12, -0.27, 1.16, 0), // arm
    box(0.12, 0.5, 0.12, 0.27, 1.16, 0), // arm
  ];
  const merged = mergeGeometries(parts, false);
  parts.forEach((p) => p.dispose());
  return merged;
}

/** Head, kept separate so it can carry a skin tone of its own. */
function headGeometry() {
  return new THREE.IcosahedronGeometry(0.115, 1);
}

/* ------------------------------------------------------------------ *
 * Layout
 * ------------------------------------------------------------------ */

/** Yaw that turns a +Z-facing item toward the nearest facade. */
function yawToNearestFacade(x, z) {
  const gapX = HALF_X - Math.abs(x);
  const gapZ = HALF_Z - Math.abs(z);
  if (gapX < gapZ) return x > 0 ? Math.PI / 2 : -Math.PI / 2;
  return z > 0 ? 0 : Math.PI;
}

function insideCore(x, z) {
  return (
    Math.abs(x) < CORE_HX + C.CORE_CLEARANCE && Math.abs(z) < CORE_HZ + C.CORE_CLEARANCE
  );
}

/** Every workstation position on one floor plate. */
function planFloor() {
  const cells = [];
  const usableX = HALF_X - C.FITOUT_MARGIN;
  const usableZ = HALF_Z - C.FITOUT_MARGIN;

  const nx = Math.floor((usableX * 2) / C.DESK_PITCH_X);
  const nz = Math.floor((usableZ * 2) / C.DESK_PITCH_Z);

  for (let ix = 0; ix < nx; ix++) {
    for (let iz = 0; iz < nz; iz++) {
      const x = -usableX + (ix + 0.5) * C.DESK_PITCH_X;
      const z = -usableZ + (iz + 0.5) * C.DESK_PITCH_Z;
      if (insideCore(x, z)) continue;
      cells.push({ x, z, ix, iz });
    }
  }
  return cells;
}

/* ------------------------------------------------------------------ *
 * Build
 * ------------------------------------------------------------------ */

export function buildOffices(scene) {
  const rand = mulberry32(778899);
  const cells = planFloor();

  // Work out exact instance counts first, so the meshes are sized correctly.
  // Office floors only: the double-height lobby below them has its own furniture (tower.js).
  const plan = [];
  for (let f = C.LOBBY_FLOORS; f < C.FLOOR_COUNT; f++) {
    for (const cell of cells) {
      if (rand() > C.DESK_FILL) continue;
      const seated = rand() < C.SEATED_FILL;
      const standing = !seated && rand() < C.STANDING_FILL;
      plan.push({ floor: f, x: cell.x, z: cell.z, seated, standing });
    }
  }

  const deskCount = plan.length;
  const seatedCount = plan.filter((p) => p.seated).length;
  const standingCount = plan.filter((p) => p.standing).length;
  const headCount = seatedCount + standingCount;

  const deskMesh = new THREE.InstancedMesh(
    workstationGeometry(),
    new THREE.MeshStandardMaterial({
      color: C.DESK_COLOR,
      roughness: 0.75,
      metalness: 0.05,
      transparent: true,
      depthWrite: true,
    }),
    deskCount
  );

  const seatedMesh = new THREE.InstancedMesh(
    seatedGeometry(),
    new THREE.MeshStandardMaterial({
      roughness: 0.85,
      metalness: 0.0,
      transparent: true,
      depthWrite: true,
    }),
    Math.max(seatedCount, 1)
  );

  const standingMesh = new THREE.InstancedMesh(
    standingGeometry(),
    new THREE.MeshStandardMaterial({
      roughness: 0.85,
      metalness: 0.0,
      transparent: true,
      depthWrite: true,
    }),
    Math.max(standingCount, 1)
  );

  const headMesh = new THREE.InstancedMesh(
    headGeometry(),
    new THREE.MeshStandardMaterial({
      roughness: 0.8,
      metalness: 0.0,
      transparent: true,
      depthWrite: true,
    }),
    Math.max(headCount, 1)
  );

  for (const mesh of [deskMesh, seatedMesh, standingMesh, headMesh]) {
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    scene.add(mesh);
  }

  const m = new THREE.Matrix4();
  const pos = new THREE.Vector3();
  const quat = new THREE.Quaternion();
  const one = new THREE.Vector3(1, 1, 1);
  const euler = new THREE.Euler();
  const tint = new THREE.Color();

  let di = 0;
  let si = 0;
  let ti = 0;
  let hi = 0;

  for (const item of plan) {
    const floorY = item.floor * FLOOR_H + SLAB_TOP;
    const yaw = yawToNearestFacade(item.x, item.z);
    euler.set(0, yaw, 0);
    quat.setFromEuler(euler);

    pos.set(item.x, floorY, item.z);
    m.compose(pos, quat, one);
    deskMesh.setMatrixAt(di++, m);

    if (!item.seated && !item.standing) continue;

    tint.setHex(C.PERSON_COLORS[Math.floor(rand() * C.PERSON_COLORS.length)]);

    let headY;
    if (item.seated) {
      m.compose(pos, quat, one);
      seatedMesh.setMatrixAt(si, m);
      seatedMesh.setColorAt(si, tint);
      si++;
      headY = floorY + 1.31;
    } else {
      // Standing figures step clear of the desk so they do not intersect it.
      const away = new THREE.Vector3(0, 0, -0.85).applyQuaternion(quat);
      pos.set(item.x + away.x, floorY, item.z + away.z);
      m.compose(pos, quat, one);
      standingMesh.setMatrixAt(ti, m);
      standingMesh.setColorAt(ti, tint);
      ti++;
      headY = floorY + 1.56;
    }

    tint.setHex(C.SKIN_COLORS[Math.floor(rand() * C.SKIN_COLORS.length)]);
    m.compose(new THREE.Vector3(pos.x, headY, pos.z), quat, one);
    headMesh.setMatrixAt(hi, m);
    headMesh.setColorAt(hi, tint);
    hi++;
  }

  deskMesh.count = di;
  seatedMesh.count = si;
  standingMesh.count = ti;
  headMesh.count = hi;

  for (const mesh of [deskMesh, seatedMesh, standingMesh, headMesh]) {
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    // Bounds must be derived from the instance matrices, and after count is set.
    mesh.computeBoundingSphere();
  }

  const lightMesh = buildCeilingLights(scene, cells);

  const fitout = [deskMesh, seatedMesh, standingMesh, headMesh];

  return {
    deskCount: di,
    peopleCount: si + ti,

    /** 1 = fully drawn, 0 = skipped entirely. */
    setInteriorFade(v) {
      applyFade(fitout, v);
    },

    setLightFade(v) {
      applyFade([lightMesh], v);
    },
  };
}

function buildCeilingLights(scene, cells) {
  const picks = cells.filter(
    (c) => c.ix % C.LIGHT_STRIDE_X === 0 && c.iz % C.LIGHT_STRIDE_Z === 0
  );

  const mesh = new THREE.InstancedMesh(
    new THREE.BoxGeometry(1.5, 0.06, 0.22),
    new THREE.MeshStandardMaterial({
      color: 0x2a2d31,
      emissive: new THREE.Color(C.CEILING_LIGHT_COLOR),
      emissiveIntensity: 1.4,
      roughness: 1.0,
      metalness: 0.0,
      transparent: true,
      depthWrite: true,
    }),
    picks.length * (C.FLOOR_COUNT - C.LOBBY_FLOORS)
  );
  mesh.castShadow = false;
  mesh.receiveShadow = false;

  const m = new THREE.Matrix4();
  const quat = new THREE.Quaternion();
  const one = new THREE.Vector3(1, 1, 1);

  let i = 0;
  for (let f = C.LOBBY_FLOORS; f < C.FLOOR_COUNT; f++) {
    const y = f * FLOOR_H + FLOOR_H - C.CEILING_DROP;
    for (const cell of picks) {
      m.compose(new THREE.Vector3(cell.x, y, cell.z), quat, one);
      mesh.setMatrixAt(i++, m);
    }
  }

  mesh.instanceMatrix.needsUpdate = true;
  mesh.computeBoundingSphere();
  scene.add(mesh);
  return mesh;
}

/**
 * Fade a set of meshes together. At zero the meshes are switched off rather
 * than drawn fully transparent, so the geometry costs nothing at distance.
 */
function applyFade(meshes, v) {
  const visible = v > 0.01;
  for (const mesh of meshes) {
    mesh.visible = visible;
    if (visible) mesh.material.opacity = v;
  }
}
