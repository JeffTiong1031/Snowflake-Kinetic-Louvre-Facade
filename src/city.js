/**
 * Urban context: a road grid with pavements and zebra crossings, the
 * neighbouring office blocks, and traffic.
 *
 * The blocks come in three facade styles -- glass curtain wall, punched
 * windows in stone, ribbon windows in concrete -- each over a glazed
 * shopfront storey under a canopy and capped by a cornice; the taller ones
 * may step back higher up, and there is plant on the roofs. Every surface of
 * a kind merges into one geometry, so the whole skyline is a handful of draw
 * calls. Walls are single-sided quads rather than boxes, so each can carry
 * UVs sized to its own texture tile.
 *
 * Textures come from canvases generated at runtime (textures.js). No image
 * files are loaded.
 */

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import * as C from './constants.js';
import { facadeTextures, shopfrontTextures, pavingTexture } from './textures.js';

function mulberry32(seed) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Repeating window grid. One tile covers 8x8 windows. */
export const FACADE_TILE_WINDOWS = 8;

/** Same length as every carriageway. */
const ROAD_LENGTH = C.CITY_EXTENT * 2 + 60;

/* ------------------------------------------------------------------ *
 * Procedural textures
 * ------------------------------------------------------------------ */

/** Asphalt with edge lines and a dashed centre line, tiling along the road. */
function makeRoadTexture() {
  const w = 128;
  const h = 256;
  const cv = document.createElement('canvas');
  cv.width = w;
  cv.height = h;

  const g = cv.getContext('2d');
  g.fillStyle = '#33363b';
  g.fillRect(0, 0, w, h);

  g.fillStyle = '#c9cdd2';
  g.fillRect(6, 0, 3, h);
  g.fillRect(w - 9, 0, 3, h);

  g.fillStyle = '#d8dce0';
  for (let y = 12; y < h; y += 64) g.fillRect(w / 2 - 2, y, 4, 32);

  const tex = new THREE.CanvasTexture(cv);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

/* ------------------------------------------------------------------ *
 * Helpers
 * ------------------------------------------------------------------ */

function scaleUV(geo, su, sv) {
  const uv = geo.attributes.uv;
  for (let i = 0; i < uv.count; i++) {
    uv.setXY(i, uv.getX(i) * su, uv.getY(i) * sv);
  }
  uv.needsUpdate = true;
  return geo;
}

/** True if (x, z) lies on any carriageway, plus an optional margin. */
export function isOnRoad(x, z, margin = 0) {
  const limit = C.ROAD_HALF_WIDTH + margin;
  for (const rx of C.ROAD_LINES_X) if (Math.abs(x - rx) <= limit) return true;
  for (const rz of C.ROAD_LINES_Z) if (Math.abs(z - rz) <= limit) return true;
  return false;
}

/**
 * The stretches of one road between the roads crossing it: [from, to] pairs
 * along it, each end either the road's own end (±ROAD_LENGTH / 2) or the
 * centreline of a crossing road.
 */
function stretches(crossLines) {
  const ends = [-ROAD_LENGTH / 2, ...[...crossLines].sort((a, b) => a - b), ROAD_LENGTH / 2];
  const out = [];
  for (let i = 0; i < ends.length - 1; i++) out.push([ends[i], ends[i + 1]]);
  return out;
}

/* ------------------------------------------------------------------ *
 * Build
 * ------------------------------------------------------------------ */

export function buildCity(scene) {
  buildRoads(scene);
  const { footprints, glowMaterials } = buildBuildings(scene);
  const cars = buildCars(scene);

  /** Inside a building's footprint, plus a margin (m). */
  function isBuilding(x, z, margin = 1) {
    for (const f of footprints) {
      if (Math.abs(x - f.x) < f.w / 2 + margin && Math.abs(z - f.z) < f.d / 2 + margin) return true;
    }
    return false;
  }

  /** Anything the landscaping must not plant on: roads with their pavements, and buildings. */
  function isBlocked(x, z) {
    if (isOnRoad(x, z, C.PAVEMENT_WIDTH + 1)) return true;
    for (const f of footprints) {
      if (Math.abs(x - f.x) < f.w / 2 + 4 && Math.abs(z - f.z) < f.d / 2 + 4) return true;
    }
    return false;
  }

  return {
    isBlocked,
    isBuilding,
    updateCars: cars.update,
    buildingCount: footprints.length,
    /** 0 = day, 1 = night: the lit windows and the shops glow. */
    setNightLevel(t) {
      for (const material of glowMaterials) material.emissiveIntensity = t * C.CITY_WINDOW_GLOW;
    },
  };
}

/* ------------------------------------------------------------------ *
 * Roads, pavements, crossings
 * ------------------------------------------------------------------ */

function buildRoads(scene) {
  const tex = makeRoadTexture();
  const width = C.ROAD_HALF_WIDTH * 2;

  const alongX = [];
  const alongZ = [];

  for (const rz of C.ROAD_LINES_Z) {
    // Built running along Z like the others, texture down the carriageway, then turned to run along X.
    const g = new THREE.PlaneGeometry(width, ROAD_LENGTH);
    scaleUV(g, 1, ROAD_LENGTH / width);
    g.rotateX(-Math.PI / 2);
    g.rotateY(Math.PI / 2);
    g.translate(0, C.ROAD_Y_ALONG_X, rz);
    alongX.push(g);
  }

  for (const rx of C.ROAD_LINES_X) {
    const g = new THREE.PlaneGeometry(width, ROAD_LENGTH);
    scaleUV(g, 1, ROAD_LENGTH / width);
    g.rotateX(-Math.PI / 2);
    g.translate(rx, C.ROAD_Y_ALONG_Z, 0);
    alongZ.push(g);
  }

  const material = new THREE.MeshStandardMaterial({
    map: tex,
    color: 0xffffff,
    roughness: 0.92,
    metalness: 0.0,
  });

  for (const set of [alongX, alongZ]) {
    const merged = mergeGeometries(set, false);
    set.forEach((g) => g.dispose());
    const mesh = new THREE.Mesh(merged, material);
    mesh.receiveShadow = true;
    scene.add(mesh);
  }

  buildPavements(scene);
  buildCrossings(scene);
}

/**
 * Raised pavements along both sides of every road. Those along X run on to
 * the crossing roads' kerbs, taking in the corners; those along Z stop at the
 * pavements they meet, so none overlap.
 */
function buildPavements(scene) {
  const half = C.ROAD_HALF_WIDTH;
  const pave = C.PAVEMENT_WIDTH;
  const kerb = C.KERB_HEIGHT;
  const tile = C.PAVEMENT_TILE;
  const edge = ROAD_LENGTH / 2;
  const slabs = [];

  for (const rz of C.ROAD_LINES_Z) {
    for (const [a, b] of stretches(C.ROAD_LINES_X)) {
      const from = a === -edge ? a : a + half;
      const to = b === edge ? b : b - half;
      const len = to - from;
      for (const side of [-1, 1]) {
        const g = new THREE.BoxGeometry(len, kerb, pave);
        scaleUV(g, len / tile, pave / tile);
        slabs.push(g.translate((from + to) / 2, kerb / 2, rz + side * (half + pave / 2)));
      }
    }
  }

  for (const rx of C.ROAD_LINES_X) {
    for (const [a, b] of stretches(C.ROAD_LINES_Z)) {
      const from = a === -edge ? a : a + half + pave;
      const to = b === edge ? b : b - half - pave;
      const len = to - from;
      for (const side of [-1, 1]) {
        const g = new THREE.BoxGeometry(pave, kerb, len);
        scaleUV(g, pave / tile, len / tile);
        slabs.push(g.translate(rx + side * (half + pave / 2), kerb / 2, (from + to) / 2));
      }
    }
  }

  const mesh = new THREE.Mesh(
    mergeGeometries(slabs, false),
    new THREE.MeshStandardMaterial({
      map: pavingTexture({ base: '#aeaba4', joint: '#8d8983', slabs: 6, variation: 0.05, seed: 17 }),
      roughness: 0.85,
      metalness: 0.0,
    })
  );
  slabs.forEach((g) => g.dispose());
  mesh.receiveShadow = true;
  scene.add(mesh);
}

/** Zebra crossings on every road, either side of each junction. */
function buildCrossings(scene) {
  const half = C.ROAD_HALF_WIDTH;
  const stripes = [];
  const y = Math.max(C.ROAD_Y_ALONG_X, C.ROAD_Y_ALONG_Z) + 0.008;

  const zebra = (along, cross, alongX) => {
    for (let s = -half + 1; s <= half - 1; s += 1) {
      const g = new THREE.PlaneGeometry(alongX ? 3 : 0.5, alongX ? 0.5 : 3).rotateX(-Math.PI / 2);
      stripes.push(alongX ? g.translate(along, y, cross + s) : g.translate(cross + s, y, along));
    }
  };

  for (const rz of C.ROAD_LINES_Z) {
    for (const rx of C.ROAD_LINES_X) for (const side of [-1, 1]) zebra(rx + side * (half + 2.5), rz, true);
  }
  for (const rx of C.ROAD_LINES_X) {
    for (const rz of C.ROAD_LINES_Z) for (const side of [-1, 1]) zebra(rz + side * (half + 2.5), rx, false);
  }

  const mesh = new THREE.Mesh(
    mergeGeometries(stripes, false),
    new THREE.MeshStandardMaterial({
      color: 0xe6e6e1,
      roughness: 0.7,
      metalness: 0.0,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    })
  );
  stripes.forEach((g) => g.dispose());
  mesh.receiveShadow = true;
  scene.add(mesh);
}

/* ------------------------------------------------------------------ *
 * Neighbouring blocks
 * ------------------------------------------------------------------ */

const STYLES = ['glass', 'stone', 'concrete'];

function buildBuildings(scene) {
  const rand = mulberry32(31337);

  const sets = { glass: [], stone: [], concrete: [], shop: [], roof: [], trim: [] };
  const footprints = [];

  const towerKeepOutX = (C.TOWER_WIDTH_X * C.MM) / 2 + C.PLAZA_RADIUS;
  const towerKeepOutZ = (C.TOWER_DEPTH_Z * C.MM) / 2 + C.PLAZA_RADIUS;

  let attempts = 0;
  while (footprints.length < C.BUILDING_COUNT && attempts < C.BUILDING_COUNT * 80) {
    attempts++;

    const x = (rand() * 2 - 1) * C.CITY_EXTENT;
    const z = (rand() * 2 - 1) * C.CITY_EXTENT;

    const w = C.BUILDING_MIN_SIZE + rand() * (C.BUILDING_MAX_SIZE - C.BUILDING_MIN_SIZE);
    const d = C.BUILDING_MIN_SIZE + rand() * (C.BUILDING_MAX_SIZE - C.BUILDING_MIN_SIZE);
    const h = C.BUILDING_MIN_HEIGHT + rand() * (C.BUILDING_MAX_HEIGHT - C.BUILDING_MIN_HEIGHT);

    // Clear of the subject tower and its plaza
    if (Math.abs(x) < towerKeepOutX + w / 2 && Math.abs(z) < towerKeepOutZ + d / 2) continue;

    // Clear of every carriageway and its pavements
    if (roadOverlaps(x, z, w, d)) continue;

    // Clear of other buildings
    let clash = false;
    for (const f of footprints) {
      if (Math.abs(x - f.x) < (w + f.w) / 2 + 6 && Math.abs(z - f.z) < (d + f.d) / 2 + 6) {
        clash = true;
        break;
      }
    }
    if (clash) continue;

    const r = rand();
    const style = STYLES[r < 0.4 ? 0 : r < 0.72 ? 1 : 2];
    pushBuilding(sets, rand, x, z, w, d, h, style);
    footprints.push({ x, z, w, d, h });
  }

  const glowMaterials = [];
  const lit = (params, [map, glowMap]) => {
    const material = new THREE.MeshStandardMaterial({
      map,
      // Off by day; the lit windows and shops glow at night (setNightLevel).
      emissiveMap: glowMap,
      emissive: 0xffffff,
      emissiveIntensity: 0,
      color: 0xffffff,
      ...params,
    });
    glowMaterials.push(material);
    return material;
  };

  const materials = {
    glass: lit({ roughness: 0.22, metalness: 0.35 }, facadeTextures('glass')),
    stone: lit({ roughness: 0.85, metalness: 0.0 }, facadeTextures('stone', { seed: 5821 })),
    concrete: lit({ roughness: 0.9, metalness: 0.0 }, facadeTextures('concrete', { seed: 6007 })),
    shop: lit({ roughness: 0.3, metalness: 0.2 }, shopfrontTextures()),
    roof: new THREE.MeshStandardMaterial({
      map: pavingTexture({ base: '#8d9196', joint: '#6d7176', slabs: 8, variation: 0.06, seed: 11 }),
      roughness: 0.95,
      metalness: 0.0,
    }),
    trim: new THREE.MeshStandardMaterial({ color: C.CITY_TRIM_COLOR, roughness: 0.7, metalness: 0.05 }),
  };

  for (const [key, geometries] of Object.entries(sets)) {
    if (!geometries.length) continue;
    const mesh = new THREE.Mesh(mergeGeometries(geometries, false), materials[key]);
    geometries.forEach((g) => g.dispose());
    mesh.castShadow = key !== 'roof';
    mesh.receiveShadow = true;
    scene.add(mesh);
  }

  return { footprints, glowMaterials };
}

function roadOverlaps(x, z, w, d) {
  const clear = C.ROAD_HALF_WIDTH + C.PAVEMENT_WIDTH + 1.5;
  for (const rx of C.ROAD_LINES_X) {
    if (Math.abs(x - rx) < clear + w / 2) return true;
  }
  for (const rz of C.ROAD_LINES_Z) {
    if (Math.abs(z - rz) < clear + d / 2) return true;
  }
  return false;
}

/**
 * One block: a shopfront storey under a canopy, the office floors above in
 * its facade style -- stepping back part way up, if tall enough and so drawn
 * -- a cornice at the top and at any step, and plant on the roof.
 */
function pushBuilding(sets, rand, x, z, w, d, h, style) {
  const base = C.CITY_BASE_HEIGHT;
  const tileW = C.WINDOW_CELL_W * FACADE_TILE_WINDOWS;
  const tileH = C.WINDOW_CELL_H * FACADE_TILE_WINDOWS;

  walls(sets.shop, x, z, w, d, 0, base, C.SHOPFRONT_TILE, base, 0);
  band(sets.trim, x, z, w, d, base - 0.3, 0.25, 1.4);

  let topW = w;
  let topD = d;
  if (h >= C.CITY_SETBACK_MIN_HEIGHT && rand() < 0.6) {
    const split = base + (h - base) * (0.55 + rand() * 0.2);
    walls(sets[style], x, z, w, d, base, split, tileW, tileH, 0);
    roof(sets.roof, x, z, w, d, split);
    band(sets.trim, x, z, w, d, split - 0.05, 0.6, 0.3, 0.3);
    topW = w - 2 * C.CITY_SETBACK;
    topD = d - 2 * C.CITY_SETBACK;
    // Window rows carry on from the storeys below.
    walls(sets[style], x, z, topW, topD, split, h, tileW, tileH, (split - base) / tileH);
  } else {
    walls(sets[style], x, z, w, d, base, h, tileW, tileH, 0);
  }
  roof(sets.roof, x, z, topW, topD, h);
  band(sets.trim, x, z, topW, topD, h - 0.05, 0.8, 0.35, 0.3);

  const units = 1 + Math.floor(rand() * 2);
  for (let i = 0; i < units; i++) {
    const pw = topW * (0.2 + rand() * 0.2);
    const pd = topD * (0.2 + rand() * 0.2);
    const ph = 1.8 + rand() * 1.4;
    const px = x + (rand() - 0.5) * (topW - pw - 2);
    const pz = z + (rand() - 0.5) * (topD - pd - 2);
    sets.trim.push(new THREE.BoxGeometry(pw, ph, pd).translate(px, h + ph / 2, pz));
  }
}

/**
 * Four single-sided wall quads round a w x d footprint, from y0 to y1, their
 * UVs sized to a tileW x tileH texture tile, starting v0 tiles up.
 */
function walls(set, x, z, w, d, y0, y1, tileW, tileH, v0) {
  const h = y1 - y0;
  for (const wall of [
    { fw: w, rotY: 0, ox: 0, oz: d / 2 },
    { fw: w, rotY: Math.PI, ox: 0, oz: -d / 2 },
    { fw: d, rotY: Math.PI / 2, ox: w / 2, oz: 0 },
    { fw: d, rotY: -Math.PI / 2, ox: -w / 2, oz: 0 },
  ]) {
    const g = new THREE.PlaneGeometry(wall.fw, h);
    const uv = g.attributes.uv;
    for (let i = 0; i < uv.count; i++) {
      uv.setXY(i, uv.getX(i) * (wall.fw / tileW), v0 + uv.getY(i) * (h / tileH));
    }
    g.rotateY(wall.rotY);
    g.translate(x + wall.ox, y0 + h / 2, z + wall.oz);
    set.push(g);
  }
}

/** A flat roof over a w x d footprint at height y, its paving sized to the texture. */
function roof(set, x, z, w, d, y) {
  const tile = C.PAVING_TILE * C.MM;
  const g = new THREE.PlaneGeometry(w, d);
  scaleUV(g, w / tile, d / tile);
  g.rotateX(-Math.PI / 2);
  g.translate(x, y, z);
  set.push(g);
}

/**
 * A band round a footprint's edge -- cornice, canopy or ledge: t tall from
 * y, reaching `out` past the walls and `inset` back behind them.
 */
function band(set, x, z, w, d, y, t, out, inset = 0) {
  const depth = out + inset;
  const mid = (out - inset) / 2;
  const long = w + 2 * out;
  const cy = y + t / 2;
  set.push(
    new THREE.BoxGeometry(long, t, depth).translate(x, cy, z + d / 2 + mid),
    new THREE.BoxGeometry(long, t, depth).translate(x, cy, z - d / 2 - mid),
    new THREE.BoxGeometry(depth, t, d - 2 * inset).translate(x + w / 2 + mid, cy, z),
    new THREE.BoxGeometry(depth, t, d - 2 * inset).translate(x - w / 2 - mid, cy, z)
  );
}

/* ------------------------------------------------------------------ *
 * Traffic
 * ------------------------------------------------------------------ */

function carGeometry() {
  const body = new THREE.BoxGeometry(4.3, 1.15, 1.85);
  body.translate(0, 0.62, 0);

  const cabin = new THREE.BoxGeometry(2.25, 0.85, 1.62);
  cabin.translate(-0.15, 1.58, 0);

  const merged = mergeGeometries([body, cabin], false);
  body.dispose();
  cabin.dispose();
  return merged;
}

const CAR_COLORS = [0xd94f45, 0x2f6fb5, 0xe8e6e1, 0x2b2f34, 0xc8a33a, 0x4a8c62];

function buildCars(scene) {
  const rand = mulberry32(90210);

  const mesh = new THREE.InstancedMesh(
    carGeometry(),
    new THREE.MeshStandardMaterial({ roughness: 0.45, metalness: 0.35 }),
    C.CAR_COUNT
  );
  mesh.castShadow = true;

  const limit = C.CITY_EXTENT + 30;
  const cars = [];
  const tint = new THREE.Color();

  for (let i = 0; i < C.CAR_COUNT; i++) {
    const alongX = rand() < 0.5;
    const lines = alongX ? C.ROAD_LINES_Z : C.ROAD_LINES_X;
    const line = lines[Math.floor(rand() * lines.length)];
    const forward = rand() < 0.5 ? 1 : -1;

    cars.push({
      alongX,
      // Opposing directions sit either side of the centreline.
      cross: line + forward * C.CAR_LANE_OFFSET,
      pos: (rand() * 2 - 1) * limit,
      dir: forward,
      speed: C.CAR_SPEED_MIN + rand() * (C.CAR_SPEED_MAX - C.CAR_SPEED_MIN),
    });

    tint.setHex(CAR_COLORS[Math.floor(rand() * CAR_COLORS.length)]);
    mesh.setColorAt(i, tint);
  }

  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  scene.add(mesh);

  const m = new THREE.Matrix4();
  const pos = new THREE.Vector3();
  const quat = new THREE.Quaternion();
  const one = new THREE.Vector3(1, 1, 1);
  const euler = new THREE.Euler();

  function update(dt) {
    for (let i = 0; i < cars.length; i++) {
      const car = cars[i];
      car.pos += car.dir * car.speed * dt;
      if (car.pos > limit) car.pos = -limit;
      else if (car.pos < -limit) car.pos = limit;

      if (car.alongX) {
        pos.set(car.pos, 0, car.cross);
        euler.set(0, car.dir > 0 ? 0 : Math.PI, 0);
      } else {
        pos.set(car.cross, 0, car.pos);
        euler.set(0, car.dir > 0 ? -Math.PI / 2 : Math.PI / 2, 0);
      }

      quat.setFromEuler(euler);
      m.compose(pos, quat, one);
      mesh.setMatrixAt(i, m);
    }
    mesh.instanceMatrix.needsUpdate = true;
  }

  update(0);
  return { update };
}
