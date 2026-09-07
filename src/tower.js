/**
 * The tower: curtain wall on all four faces, plus floor slabs, service core
 * and roof cap so the building never reads as a hollow glass shell.
 *
 * Glass panels, mullions and transoms are each a single InstancedMesh.
 */

import * as THREE from 'three';
import * as C from './constants.js';

const HALF_X = (C.TOWER_WIDTH_X * C.MM) / 2;
const HALF_Z = (C.TOWER_DEPTH_Z * C.MM) / 2;
const FLOOR_H = C.FLOOR_HEIGHT * C.MM;
const TOTAL_H = FLOOR_H * C.FLOOR_COUNT;
const PANEL_W = C.PANEL_WIDTH * C.MM;

/**
 * The four curtain-wall faces. `yaw` rotates module-local (+X right, +Y up,
 * +Z outward) into world space; `offset` is the face plane position.
 */
export const FACES = {
  south: { yaw: 0, width: C.TOWER_WIDTH_X * C.MM, offset: new THREE.Vector3(0, 0, HALF_Z) },
  east: { yaw: Math.PI / 2, width: C.TOWER_DEPTH_Z * C.MM, offset: new THREE.Vector3(HALF_X, 0, 0) },
  north: { yaw: Math.PI, width: C.TOWER_WIDTH_X * C.MM, offset: new THREE.Vector3(0, 0, -HALF_Z) },
  west: { yaw: -Math.PI / 2, width: C.TOWER_DEPTH_Z * C.MM, offset: new THREE.Vector3(-HALF_X, 0, 0) },
};

/** The one face that carries snowflake modules. The other three stay plain. */
export const MODULE_FACE = 'north';

export function buildTower(scene) {
  const group = new THREE.Group();
  scene.add(group);

  buildGlass(group);
  buildFrame(group);
  buildInterior(group);

  return { group, totalHeight: TOTAL_H };
}

/** Local (x, y) on a face -> world position, pushed out by `out` along the normal. */
export function faceToWorld(face, x, y, out = 0) {
  const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), face.yaw);
  const v = new THREE.Vector3(x, 0, out).applyQuaternion(q);
  return new THREE.Vector3(
    face.offset.x + v.x,
    y,
    face.offset.z + v.z
  );
}

export function faceQuaternion(face) {
  return new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), face.yaw);
}

/* ------------------------------------------------------------------ *
 * Glazing
 * ------------------------------------------------------------------ */

function buildGlass(group) {
  const faces = Object.values(FACES);
  let total = 0;
  for (const f of faces) total += Math.round(f.width / PANEL_W) * C.FLOOR_COUNT;

  const material = new THREE.MeshPhysicalMaterial({
    color: C.GLASS_COLOR,
    metalness: 0.0,
    roughness: 0.06,
    transparent: true,
    opacity: 0.34,
    side: THREE.DoubleSide,
    envMapIntensity: 1.5,
    clearcoat: 1.0,
    clearcoatRoughness: 0.04,
    // Two glazed layers plus an opaque core behind them: writing depth from the
    // glass would fight between the near and far faces.
    depthWrite: false,
  });

  const mesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), material, total);
  mesh.receiveShadow = true;
  mesh.renderOrder = 2;

  const m = new THREE.Matrix4();
  const s = new THREE.Vector3();
  let i = 0;

  for (const face of faces) {
    const q = faceQuaternion(face);
    const cols = Math.round(face.width / PANEL_W);
    const gap = C.MULLION_WIDTH * C.MM;

    s.set(PANEL_W - gap, FLOOR_H - C.TRANSOM_HEIGHT * C.MM, 1);

    for (let c = 0; c < cols; c++) {
      const x = -face.width / 2 + (c + 0.5) * PANEL_W;
      for (let f = 0; f < C.FLOOR_COUNT; f++) {
        const y = (f + 0.5) * FLOOR_H;
        m.compose(faceToWorld(face, x, y, 0), q, s);
        mesh.setMatrixAt(i++, m);
      }
    }
  }

  mesh.instanceMatrix.needsUpdate = true;
  group.add(mesh);
}

/* ------------------------------------------------------------------ *
 * Mullions and transoms
 * ------------------------------------------------------------------ */

function buildFrame(group) {
  const faces = Object.values(FACES);

  let count = 0;
  for (const f of faces) count += Math.round(f.width / PANEL_W) + 1; // verticals
  count += faces.length * (C.FLOOR_COUNT + 1); // transoms

  const material = new THREE.MeshStandardMaterial({
    color: C.MULLION_COLOR,
    metalness: 0.85,
    roughness: 0.4,
  });

  const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), material, count);
  mesh.castShadow = true;
  mesh.receiveShadow = true;

  const m = new THREE.Matrix4();
  const s = new THREE.Vector3();
  let i = 0;

  for (const face of faces) {
    const q = faceQuaternion(face);
    const cols = Math.round(face.width / PANEL_W);
    const out = (C.MULLION_DEPTH / 2) * C.MM;

    // Vertical mullions, full height, one per panel joint.
    s.set(C.MULLION_WIDTH * C.MM, TOTAL_H, C.MULLION_DEPTH * C.MM);
    for (let c = 0; c <= cols; c++) {
      const x = -face.width / 2 + c * PANEL_W;
      m.compose(faceToWorld(face, x, TOTAL_H / 2, out), q, s);
      mesh.setMatrixAt(i++, m);
    }

    // Transoms at every floor line.
    s.set(face.width, C.TRANSOM_HEIGHT * C.MM, C.TRANSOM_DEPTH * C.MM);
    for (let f = 0; f <= C.FLOOR_COUNT; f++) {
      m.compose(faceToWorld(face, 0, f * FLOOR_H, (C.TRANSOM_DEPTH / 2) * C.MM), q, s);
      mesh.setMatrixAt(i++, m);
    }
  }

  mesh.instanceMatrix.needsUpdate = true;
  group.add(mesh);
}

/* ------------------------------------------------------------------ *
 * Slabs, core, roof
 * ------------------------------------------------------------------ */

function buildInterior(group) {
  const inset = C.SLAB_INSET * C.MM;

  const slabMesh = new THREE.InstancedMesh(
    new THREE.BoxGeometry(1, 1, 1),
    new THREE.MeshStandardMaterial({ color: C.SLAB_COLOR, roughness: 0.9, metalness: 0.0 }),
    C.FLOOR_COUNT + 1
  );
  slabMesh.receiveShadow = true;

  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const s = new THREE.Vector3(
    C.TOWER_WIDTH_X * C.MM - inset,
    C.SLAB_THICKNESS * C.MM,
    C.TOWER_DEPTH_Z * C.MM - inset
  );

  for (let f = 0; f <= C.FLOOR_COUNT; f++) {
    m.compose(new THREE.Vector3(0, f * FLOOR_H, 0), q, s);
    slabMesh.setMatrixAt(f, m);
  }
  slabMesh.instanceMatrix.needsUpdate = true;
  group.add(slabMesh);

  const coreInset = C.CORE_INSET * C.MM;
  const core = new THREE.Mesh(
    new THREE.BoxGeometry(
      C.TOWER_WIDTH_X * C.MM - coreInset,
      TOTAL_H,
      C.TOWER_DEPTH_Z * C.MM - coreInset
    ),
    new THREE.MeshStandardMaterial({ color: C.CORE_COLOR, roughness: 1.0, metalness: 0.0 })
  );
  core.position.y = TOTAL_H / 2;
  group.add(core);

  const roof = new THREE.Mesh(
    new THREE.BoxGeometry(C.TOWER_WIDTH_X * C.MM, 1.2, C.TOWER_DEPTH_Z * C.MM),
    new THREE.MeshStandardMaterial({ color: C.SLAB_COLOR, roughness: 0.85, metalness: 0.1 })
  );
  roof.position.y = TOTAL_H + 0.6;
  roof.castShadow = true;
  roof.receiveShadow = true;
  group.add(roof);
}
