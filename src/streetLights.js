/**
 * Street lamps along every road, lit at night.
 *
 * Poles and heads are instanced. The light itself is faked -- real lights by
 * the hundred would cost far too much -- so each lit head glows, a soft halo
 * sits round it, and a warm pool of light spreads on the ground beneath. The
 * lit part fades with setLevel(0..1) and is switched off entirely in clear daylight.
 *
 * Textures come from canvases generated at runtime. No image files are loaded.
 */

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import * as C from './constants.js';

/** Same length as the carriageways in city.js. */
const ROAD_LENGTH = C.CITY_EXTENT * 2 + 60;
/** The lamp head hangs just under the end of the arm. */
const HEAD_DROP = 0.22;

/**
 * @param {THREE.Scene} scene
 * @param {(x: number, z: number) => boolean} isBuilding true inside a building's footprint
 */
export function buildStreetLights(scene, isBuilding) {
  const lamps = placeLamps(isBuilding);

  // --- Poles with their arms, and the heads: instanced alike ---
  const poleGeo = mergeGeometries(
    [
      new THREE.CylinderGeometry(0.08, 0.12, C.LAMP_HEIGHT, 8).translate(0, C.LAMP_HEIGHT / 2, 0),
      new THREE.BoxGeometry(C.LAMP_ARM, 0.08, 0.08).translate(C.LAMP_ARM / 2, C.LAMP_HEIGHT - 0.1, 0),
    ],
    false
  );
  const headGeo = new THREE.BoxGeometry(0.7, 0.14, 0.32).translate(
    C.LAMP_ARM,
    C.LAMP_HEIGHT - HEAD_DROP,
    0
  );

  const poles = new THREE.InstancedMesh(
    poleGeo,
    new THREE.MeshStandardMaterial({ color: 0x3b4046, metalness: 0.6, roughness: 0.5 }),
    lamps.length
  );
  poles.castShadow = true;

  const headMaterial = new THREE.MeshStandardMaterial({
    color: 0x2c2f33,
    metalness: 0.3,
    roughness: 0.6,
    emissive: new THREE.Color(C.LAMP_COLOR),
    emissiveIntensity: 0,
  });
  const heads = new THREE.InstancedMesh(headGeo, headMaterial, lamps.length);

  // --- Halos round the heads, and pools of light on the ground ---
  const haloPositions = new Float32Array(lamps.length * 3);
  const halo = new THREE.Points(
    new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(haloPositions, 3)),
    new THREE.PointsMaterial({
      map: radialTexture([
        [0, 'rgba(255, 255, 255, 1)'],
        [0.15, 'rgba(255, 240, 210, 0.7)'],
        [0.45, 'rgba(255, 220, 170, 0.15)'],
        [1, 'rgba(255, 210, 150, 0)'],
      ]),
      color: C.LAMP_COLOR,
      size: C.LAMP_HALO_SIZE,
      sizeAttenuation: true,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    })
  );

  const poolMaterial = new THREE.MeshBasicMaterial({
    map: radialTexture([
      [0, 'rgba(255, 255, 255, 1)'],
      [0.35, 'rgba(255, 255, 255, 0.55)'],
      [0.7, 'rgba(255, 255, 255, 0.15)'],
      [1, 'rgba(255, 255, 255, 0)'],
    ]),
    color: C.LAMP_COLOR,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    // Lies on the road and grass: pulled toward the eye so it never flickers into them.
    polygonOffset: true,
    polygonOffsetFactor: -4,
    polygonOffsetUnits: -4,
  });
  const pools = new THREE.InstancedMesh(
    new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2),
    poolMaterial,
    lamps.length
  );
  pools.renderOrder = 1;

  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  const one = new THREE.Vector3(1, 1, 1);
  const pos = new THREE.Vector3();
  const poolScale = new THREE.Vector3(C.LAMP_POOL_DIAMETER, 1, C.LAMP_POOL_DIAMETER);

  lamps.forEach((lamp, i) => {
    // Turn the arm (local +X) toward the road.
    q.setFromAxisAngle(up, Math.atan2(-lamp.dz, lamp.dx));
    m.compose(pos.set(lamp.x, 0, lamp.z), q, one);
    poles.setMatrixAt(i, m);
    heads.setMatrixAt(i, m);

    const hx = lamp.x + lamp.dx * C.LAMP_ARM;
    const hz = lamp.z + lamp.dz * C.LAMP_ARM;
    haloPositions.set([hx, C.LAMP_HEIGHT - HEAD_DROP - 0.1, hz], i * 3);
    // Just over the kerb, so the pavement does not cut the pool off at the road's edge.
    m.compose(pos.set(hx, C.KERB_HEIGHT + 0.01, hz), q.identity(), poolScale);
    pools.setMatrixAt(i, m);
  });

  for (const mesh of [poles, heads, pools]) {
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
    scene.add(mesh);
  }
  halo.geometry.computeBoundingSphere();
  scene.add(halo);

  /** 0 = off (clear day), 1 = fully lit (night, or the storm). */
  function setLevel(t) {
    const lit = t > 0.01;
    headMaterial.emissiveIntensity = t * C.LAMP_GLOW;
    halo.visible = lit;
    pools.visible = lit;
    halo.material.opacity = t;
    poolMaterial.opacity = t * C.LAMP_POOL_STRENGTH;
  }
  setLevel(0);

  return { setLevel, count: lamps.length };
}

/**
 * Lamp positions, each with (dx, dz): the unit direction from the pole back
 * toward its road, which its arm follows.
 */
function placeLamps(isBuilding) {
  const lamps = [];
  const edge = C.ROAD_HALF_WIDTH + C.LAMP_SETBACK;
  const clearOf = (along, crossLines) =>
    crossLines.every((c) => Math.abs(along - c) > C.ROAD_HALF_WIDTH + C.LAMP_CROSSING_CLEAR);

  // Roads running along X sit at the Z lines, and cross the X lines -- and the reverse.
  for (const [lines, crossLines, alongX] of [
    [C.ROAD_LINES_Z, C.ROAD_LINES_X, true],
    [C.ROAD_LINES_X, C.ROAD_LINES_Z, false],
  ]) {
    for (const line of lines) {
      for (const side of [-1, 1]) {
        const stagger = side > 0 ? 0 : C.LAMP_SPACING / 2;
        for (let s = -ROAD_LENGTH / 2 + 4 + stagger; s <= ROAD_LENGTH / 2 - 4; s += C.LAMP_SPACING) {
          if (!clearOf(s, crossLines)) continue;
          const across = line + side * edge;
          const x = alongX ? s : across;
          const z = alongX ? across : s;
          if (isBuilding(x, z) || Math.hypot(x, z) < C.PLAZA_RADIUS + 2) continue;
          lamps.push({ x, z, dx: alongX ? 0 : -side, dz: alongX ? -side : 0 });
        }
      }
    }
  }
  return lamps;
}

/** A soft round canvas texture from colour stops, centre to edge. */
function radialTexture(stops) {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const g = canvas.getContext('2d');
  const r = size / 2;
  const gradient = g.createRadialGradient(r, r, 0, r, r, r);
  for (const [at, color] of stops) gradient.addColorStop(at, color);
  g.fillStyle = gradient;
  g.fillRect(0, 0, size, size);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}
