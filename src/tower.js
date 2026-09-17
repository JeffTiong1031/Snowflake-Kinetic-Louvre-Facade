/**
 * The tower: curtain wall on all four faces, floor slabs and service core; at
 * its foot a double-height lobby set back behind a stone colonnade; at its
 * top a glazed crown screening the rooftop plant.
 *
 * The curtain wall is built as a real one is: vision glass in each storey, an
 * opaque spandrel band at every floor line hiding the slab edge and the
 * ceiling void, mullions and transoms, and -- on the three plain faces --
 * vertical fins that catch the light. Repeated parts are each a single
 * InstancedMesh.
 */

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import * as C from './constants.js';
import { pavingTexture, louvreTexture } from './textures.js';

const HALF_X = (C.TOWER_WIDTH_X * C.MM) / 2;
const HALF_Z = (C.TOWER_DEPTH_Z * C.MM) / 2;
const FLOOR_H = C.FLOOR_HEIGHT * C.MM;
const TOTAL_H = FLOOR_H * C.FLOOR_COUNT;
const PANEL_W = C.PANEL_WIDTH * C.MM;
const HALF_SLAB = (C.SLAB_THICKNESS * C.MM) / 2;

/** Top of the lobby: the first office floor. */
const LOBBY_H = FLOOR_H * C.LOBBY_FLOORS;
const SETBACK = C.LOBBY_SETBACK * C.MM;
const PLINTH_H = C.PLINTH_HEIGHT * C.MM;
/** Underside of the soffit over the colonnade and the lobby. */
const SOFFIT_Y = LOBBY_H - HALF_SLAB - 0.05;

const SPANDREL_BELOW = C.SPANDREL_BELOW * C.MM;
const SPANDREL_ABOVE = C.SPANDREL_ABOVE * C.MM;
/** Vision glass: each storey, less the spandrel band. */
const VISION_H = FLOOR_H - SPANDREL_BELOW - SPANDREL_ABOVE;

const ROOF_TOP = TOTAL_H + 1.2;
const COPING_H = C.COPING_HEIGHT * C.MM;
/** Top of the crown; the mullions and fins run on up to its coping. */
const CROWN_TOP = TOTAL_H + C.CROWN_HEIGHT * C.MM;

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

/** The one face that carries snowflake modules -- and the entrance. The other three stay plain. */
export const MODULE_FACE = 'north';

export function buildTower(scene) {
  const group = new THREE.Group();
  scene.add(group);

  const frameMaterial = new THREE.MeshStandardMaterial({
    color: C.MULLION_COLOR,
    metalness: 0.85,
    roughness: 0.4,
  });

  const glassMaterial = buildGlass(group);
  buildSpandrels(group);
  buildFrame(group, frameMaterial);
  buildInterior(group);
  buildShadowProxy(group);
  const lobby = buildLobby(group, frameMaterial);
  const crown = buildCrown(group);
  const interiorGlow = buildInteriorGlow(group);

  return {
    group,
    totalHeight: TOTAL_H,
    glassMaterial,
    /** 0 = unlit (day), 1 = every floor, the lobby and the crown lit (night). */
    setNightLevel(t) {
      interiorGlow.setLevel(t);
      lobby.setNightLevel(t);
      crown.setNightLevel(t);
    },
  };
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

/** A box or plane's placement: centre, turn and size. */
function placed(position, quaternion, sx, sy, sz) {
  return new THREE.Matrix4().compose(position, quaternion, new THREE.Vector3(sx, sy, sz));
}

/** One InstancedMesh holding a copy of `geometry` at each placement. */
function instanced(geometry, material, matrices) {
  const mesh = new THREE.InstancedMesh(geometry, material, matrices.length);
  matrices.forEach((m, i) => mesh.setMatrixAt(i, m));
  mesh.instanceMatrix.needsUpdate = true;
  mesh.computeBoundingSphere();
  return mesh;
}

function scaleUV(geometry, su, sv) {
  const uv = geometry.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * su, uv.getY(i) * sv);
  uv.needsUpdate = true;
  return geometry;
}

/** Face-local x of the centre of panel c, and of joint c, across a face. */
const panelX = (face, c) => -face.width / 2 + (c + 0.5) * PANEL_W;
const jointX = (face, c) => -face.width / 2 + c * PANEL_W;
const columnsOf = (face) => Math.round(face.width / PANEL_W);

/* ------------------------------------------------------------------ *
 * Glazing and spandrels
 * ------------------------------------------------------------------ */

function buildGlass(group) {
  const material = new THREE.MeshPhysicalMaterial({
    color: C.GLASS_COLOR,
    metalness: 0.0,
    roughness: 0.06,
    transparent: true,
    opacity: C.GLASS_OPACITY_NEAR,
    side: THREE.DoubleSide,
    envMapIntensity: C.GLASS_ENV_NEAR,
    clearcoat: 1.0,
    clearcoatRoughness: 0.04,
    // Several glazed layers plus the fit-out behind them: writing depth from
    // the glass would fight between the near and far faces. Depth TESTING stays
    // on, so opaque interior geometry still occludes glazing behind it.
    depthWrite: false,
  });

  const rand = mulberry32(2718);
  const gap = C.MULLION_WIDTH * C.MM;
  const matrices = [];
  const tints = [];

  for (const face of Object.values(FACES)) {
    const q = faceQuaternion(face);
    for (let c = 0; c < columnsOf(face); c++) {
      for (let f = C.LOBBY_FLOORS; f < C.FLOOR_COUNT; f++) {
        const y = f * FLOOR_H + SPANDREL_ABOVE + VISION_H / 2;
        matrices.push(placed(faceToWorld(face, panelX(face, c), y, 0), q, PANEL_W - gap, VISION_H, 1));
        // Float glass differs a touch from batch to batch; so do the panes.
        const k = 1 - rand() * C.GLASS_TINT_VARIATION;
        tints.push(new THREE.Color(k * (1 - rand() * 0.02), k, k));
      }
    }
  }

  const mesh = instanced(new THREE.PlaneGeometry(1, 1), material, matrices);
  tints.forEach((tint, i) => mesh.setColorAt(i, tint));
  mesh.instanceColor.needsUpdate = true;
  mesh.receiveShadow = true;
  mesh.renderOrder = 2;
  group.add(mesh);
  return material;
}

/** The opaque band at each floor line, from the lobby roof up to the roof. */
function buildSpandrels(group) {
  const material = new THREE.MeshStandardMaterial({
    color: C.SPANDREL_COLOR,
    metalness: 0.55,
    roughness: 0.22,
    side: THREE.DoubleSide,
  });

  const gap = C.MULLION_WIDTH * C.MM;
  const height = SPANDREL_BELOW + SPANDREL_ABOVE;
  const matrices = [];
  for (const face of Object.values(FACES)) {
    const q = faceQuaternion(face);
    for (let c = 0; c < columnsOf(face); c++) {
      for (let f = C.LOBBY_FLOORS; f <= C.FLOOR_COUNT; f++) {
        const y = f * FLOOR_H + (SPANDREL_ABOVE - SPANDREL_BELOW) / 2;
        matrices.push(placed(faceToWorld(face, panelX(face, c), y, 0), q, PANEL_W - gap, height, 1));
      }
    }
  }

  const mesh = instanced(new THREE.PlaneGeometry(1, 1), material, matrices);
  mesh.receiveShadow = true;
  group.add(mesh);
}

/* ------------------------------------------------------------------ *
 * Mullions, transoms, fins and the coping
 * ------------------------------------------------------------------ */

function buildFrame(group, material) {
  const mullionH = CROWN_TOP - COPING_H - LOBBY_H;
  const midY = LOBBY_H + mullionH / 2;
  const mw = C.MULLION_WIDTH * C.MM;
  const md = C.MULLION_DEPTH * C.MM;
  const finW = C.FIN_WIDTH * C.MM;
  const finD = C.FIN_DEPTH * C.MM;
  const copingD = C.COPING_DEPTH * C.MM;
  const matrices = [];

  for (const [name, face] of Object.entries(FACES)) {
    const q = faceQuaternion(face);

    // Mullions at every panel joint, from the lobby roof up through the crown;
    // on the plain faces, a fin at every FIN_EVERY-th.
    for (let c = 0; c <= columnsOf(face); c++) {
      const x = jointX(face, c);
      matrices.push(placed(faceToWorld(face, x, midY, md / 2), q, mw, mullionH, md));
      if (name !== MODULE_FACE && c % C.FIN_EVERY === 0) {
        matrices.push(placed(faceToWorld(face, x, midY, finD / 2), q, finW, mullionH, finD));
      }
    }

    // Transoms at every floor line, from the lobby roof to the roof.
    for (let f = C.LOBBY_FLOORS; f <= C.FLOOR_COUNT; f++) {
      matrices.push(
        placed(
          faceToWorld(face, 0, f * FLOOR_H, (C.TRANSOM_DEPTH / 2) * C.MM),
          q,
          face.width,
          C.TRANSOM_HEIGHT * C.MM,
          C.TRANSOM_DEPTH * C.MM
        )
      );
    }

    // The coping over the crown, lapping past the corners and over the fins.
    matrices.push(
      placed(faceToWorld(face, 0, CROWN_TOP - COPING_H / 2, copingD / 2 - 0.05), q, face.width + 2 * copingD, COPING_H, copingD)
    );
  }

  const mesh = instanced(new THREE.BoxGeometry(1, 1, 1), material, matrices);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  group.add(mesh);
}

/* ------------------------------------------------------------------ *
 * Slabs, core, roof
 * ------------------------------------------------------------------ */

function buildInterior(group) {
  const inset = C.SLAB_INSET * C.MM;

  // The lobby is double height, floored by the stone plinth: slabs start at the first office floor.
  const floors = [];
  for (let f = C.LOBBY_FLOORS; f <= C.FLOOR_COUNT; f++) floors.push(f);

  const slabMesh = new THREE.InstancedMesh(
    new THREE.BoxGeometry(1, 1, 1),
    new THREE.MeshStandardMaterial({ color: C.SLAB_COLOR, roughness: 0.9, metalness: 0.0 }),
    floors.length
  );
  // Slabs and core throw the tower's shadow; the glass alone would let the sun through.
  slabMesh.castShadow = true;
  slabMesh.receiveShadow = true;

  const q = new THREE.Quaternion();
  floors.forEach((f, i) => {
    slabMesh.setMatrixAt(
      i,
      placed(
        new THREE.Vector3(0, f * FLOOR_H, 0),
        q,
        C.TOWER_WIDTH_X * C.MM - inset,
        C.SLAB_THICKNESS * C.MM,
        C.TOWER_DEPTH_Z * C.MM - inset
      )
    );
  });
  slabMesh.instanceMatrix.needsUpdate = true;
  group.add(slabMesh);

  const core = new THREE.Mesh(
    new THREE.BoxGeometry(C.CORE_WIDTH_X * C.MM, TOTAL_H, C.CORE_DEPTH_Z * C.MM),
    new THREE.MeshStandardMaterial({ color: C.CORE_WALL_COLOR, roughness: 0.9, metalness: 0.0 })
  );
  core.position.y = TOTAL_H / 2;
  core.castShadow = true;
  group.add(core);

  const roof = new THREE.Mesh(
    new THREE.BoxGeometry(C.TOWER_WIDTH_X * C.MM, ROOF_TOP - TOTAL_H, C.TOWER_DEPTH_Z * C.MM),
    new THREE.MeshStandardMaterial({ color: C.SLAB_COLOR, roughness: 0.85, metalness: 0.1 })
  );
  roof.position.y = (TOTAL_H + ROOF_TOP) / 2;
  roof.castShadow = true;
  roof.receiveShadow = true;
  group.add(roof);
}

/**
 * The tower's shadow. Glass casts none, so on their own the slabs throw a
 * striped shadow with sun between every floor. An invisible box just inside
 * the glass line casts a solid one instead. Being one-sided, it goes into the
 * shadow map by its back faces, so it shades only what lies beyond the tower
 * -- the ground, the neighbours, the modules when the sun is behind -- and
 * never the floors inside it, which the slabs above them shade. It stops at
 * the lobby roof: the glazed lobby under it lets the light through.
 */
function buildShadowProxy(group) {
  const inset = C.SHADOW_PROXY_INSET * C.MM;
  const proxy = new THREE.Mesh(
    new THREE.BoxGeometry(
      C.TOWER_WIDTH_X * C.MM - 2 * inset,
      TOTAL_H - LOBBY_H,
      C.TOWER_DEPTH_Z * C.MM - 2 * inset
    ),
    new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false })
  );
  proxy.position.y = (LOBBY_H + TOTAL_H) / 2;
  proxy.castShadow = true;
  group.add(proxy);
}

/* ------------------------------------------------------------------ *
 * The foot: plinth, colonnade, lobby, canopy
 * ------------------------------------------------------------------ */

function buildLobby(group, frameMaterial) {
  const stone = new THREE.MeshStandardMaterial({ color: C.COLUMN_COLOR, roughness: 0.38, metalness: 0.05 });
  const metal = new THREE.MeshStandardMaterial({ color: C.CANOPY_COLOR, roughness: 0.32, metalness: 0.35 });
  const glass = new THREE.MeshPhysicalMaterial({
    color: C.LOBBY_GLASS_COLOR,
    metalness: 0.0,
    roughness: 0.04,
    transparent: true,
    opacity: C.LOBBY_GLASS_OPACITY,
    side: THREE.DoubleSide,
    clearcoat: 1.0,
    clearcoatRoughness: 0.04,
    depthWrite: false,
  });

  const entrance = FACES[MODULE_FACE];
  const drumR = (C.DOOR_DRUM_DIAMETER * C.MM) / 2;
  const glassH = SOFFIT_Y - PLINTH_H;
  const glassY = PLINTH_H + glassH / 2;
  const lmw = C.LOBBY_MULLION_WIDTH * C.MM;
  const lmd = C.LOBBY_MULLION_DEPTH * C.MM;
  const parts = [];

  // --- Glazing, set back behind the colonnade, with a gap for the revolving door ---
  const panes = [];
  const bars = [];
  for (const face of Object.values(FACES)) {
    const q = faceQuaternion(face);
    const width = face.width - 2 * SETBACK;
    const cols = Math.round(width / PANEL_W);
    const pitch = width / cols;
    const isEntrance = face === entrance;

    for (let c = 0; c < cols; c++) {
      const x = -width / 2 + (c + 0.5) * pitch;
      if (isEntrance && Math.abs(x) < drumR) continue;
      panes.push(placed(faceToWorld(face, x, glassY, -SETBACK), q, pitch - lmw, glassH, 1));
    }
    for (let c = 0; c <= cols; c++) {
      const x = -width / 2 + c * pitch;
      if (isEntrance && Math.abs(x) < drumR - 0.01) continue;
      bars.push(placed(faceToWorld(face, x, glassY, -SETBACK + lmd / 2), q, lmw, glassH, lmd));
    }
    // Head and sill.
    for (const y of [PLINTH_H + 0.04, SOFFIT_Y - 0.04]) {
      bars.push(placed(faceToWorld(face, 0, y, -SETBACK + lmd / 2), q, width, 0.08, lmd));
    }
  }
  const paneMesh = instanced(new THREE.PlaneGeometry(1, 1), glass, panes);
  paneMesh.renderOrder = 2;
  const barMesh = instanced(new THREE.BoxGeometry(1, 1, 1), frameMaterial, bars);
  barMesh.castShadow = true;
  parts.push(paneMesh, barMesh);

  // --- Colonnade: square stone columns on the face line, carrying the tower ---
  const colSize = C.COLUMN_SIZE * C.MM;
  const colH = SOFFIT_Y - PLINTH_H;
  const columns = [];
  for (const [name, face] of Object.entries(FACES)) {
    const q = faceQuaternion(face);
    let bays = Math.max(1, Math.round(face.width / (C.COLUMN_SPACING * C.MM)));
    if (face === entrance && bays % 2 === 0) bays -= 1;
    // Corner columns belong to the long faces, so none is built twice.
    const corners = name === 'north' || name === 'south';
    for (let c = corners ? 0 : 1; c <= (corners ? bays : bays - 1); c++) {
      const x = THREE.MathUtils.clamp(
        -face.width / 2 + (c * face.width) / bays,
        -face.width / 2 + colSize / 2,
        face.width / 2 - colSize / 2
      );
      columns.push(placed(faceToWorld(face, x, PLINTH_H + colH / 2, -colSize / 2), q, colSize, colH, colSize));
    }
  }
  const columnMesh = instanced(new THREE.BoxGeometry(1, 1, 1), stone, columns);
  columnMesh.castShadow = true;
  columnMesh.receiveShadow = true;
  parts.push(columnMesh);

  // --- Soffit over the colonnade and the lobby ---
  const soffitT = LOBBY_H - HALF_SLAB - SOFFIT_Y;
  const soffit = new THREE.Mesh(
    new THREE.BoxGeometry(C.TOWER_WIDTH_X * C.MM, soffitT, C.TOWER_DEPTH_Z * C.MM),
    new THREE.MeshStandardMaterial({ color: C.SOFFIT_COLOR, roughness: 0.55, metalness: 0.1 })
  );
  soffit.position.y = SOFFIT_Y + soffitT / 2;
  soffit.castShadow = true;
  soffit.receiveShadow = true;
  parts.push(soffit);

  // --- Entrance canopy: a thin blade from the lobby glass out past the columns ---
  const q = faceQuaternion(entrance);
  const canopyD = C.CANOPY_DEPTH * C.MM;
  const canopyT = C.CANOPY_THICKNESS * C.MM;
  const canopyY = C.CANOPY_HEIGHT * C.MM;
  const canopy = new THREE.Mesh(new THREE.BoxGeometry(C.CANOPY_WIDTH * C.MM, canopyT, canopyD), metal);
  canopy.position.copy(faceToWorld(entrance, 0, canopyY, canopyD / 2 - SETBACK));
  canopy.quaternion.copy(q);
  canopy.castShadow = true;
  canopy.receiveShadow = true;
  parts.push(canopy);

  // --- Downlights: a grid in the soffit, and a row under the canopy's edge ---
  const lampMaterial = new THREE.MeshBasicMaterial({ color: 0x000000 });
  const flat = new THREE.Quaternion();
  const lamps = [];
  const pitch = C.DOWNLIGHT_PITCH * C.MM;
  for (let x = -HALF_X + pitch / 2; x < HALF_X; x += pitch) {
    for (let z = -HALF_Z + pitch / 2; z < HALF_Z; z += pitch) {
      lamps.push(placed(new THREE.Vector3(x, SOFFIT_Y - 0.005, z), flat, 1, 1, 1));
    }
  }
  for (const x of [-4, -1.4, 1.4, 4]) {
    lamps.push(placed(faceToWorld(entrance, x, canopyY - canopyT / 2 - 0.005, canopyD - SETBACK - 1.2), flat, 1, 1, 1));
  }
  // A disc facing down.
  const lampMesh = instanced(new THREE.CircleGeometry(0.16, 16).rotateX(Math.PI / 2), lampMaterial, lamps);
  parts.push(lampMesh);

  // --- Revolving door: a glass drum with three leaves, under a metal crown ---
  const drumH = C.DOOR_DRUM_HEIGHT * C.MM;
  const drumAt = faceToWorld(entrance, 0, PLINTH_H + drumH / 2, -SETBACK);
  const drumGlass = new THREE.Mesh(
    mergeGeometries(
      [
        new THREE.CylinderGeometry(drumR, drumR, drumH, 40, 1, true),
        ...[0, 1, 2].map((k) =>
          new THREE.BoxGeometry(drumR * 0.96, drumH - 0.1, 0.04)
            .translate(drumR * 0.48, 0, 0)
            .rotateY((k * 2 * Math.PI) / 3 + 0.4)
        ),
      ],
      false
    ),
    glass
  );
  drumGlass.position.copy(drumAt);
  drumGlass.renderOrder = 2;
  const drumFrame = new THREE.Mesh(
    mergeGeometries(
      [
        new THREE.CylinderGeometry(drumR + 0.08, drumR + 0.08, 0.35, 40).translate(0, drumH / 2 + 0.175, 0),
        new THREE.CylinderGeometry(drumR + 0.04, drumR + 0.04, 0.04, 40).translate(0, -drumH / 2 + 0.02, 0),
        new THREE.CylinderGeometry(0.06, 0.06, drumH, 12),
      ],
      false
    ),
    frameMaterial
  );
  drumFrame.position.copy(drumAt);
  drumFrame.castShadow = true;
  parts.push(drumGlass, drumFrame);

  // --- In the lobby: a reception desk before the core, benches, trees in planters ---
  const side = Math.sign(entrance.offset.z); // toward the entrance face
  const coreHX = (C.CORE_WIDTH_X * C.MM) / 2;
  const coreHZ = (C.CORE_DEPTH_Z * C.MM) / 2;
  const deskZ = side * (coreHZ + 2);
  const benchX = coreHX + 4;
  const trees = [
    [-5.5, side * (coreHZ + 3.1)],
    [5.5, side * (coreHZ + 3.1)],
    [-benchX, -side * 5.5],
    [benchX, -side * 5.5],
  ];
  const furniture = [
    new THREE.BoxGeometry(5.2, 1.1, 0.9).translate(0, PLINTH_H + 0.55, deskZ),
    ...[-1, 1].map((s) => new THREE.BoxGeometry(0.6, 0.45, 3.2).translate(s * benchX, PLINTH_H + 0.225, 0)),
    ...trees.flatMap(([x, z]) => [
      new THREE.CylinderGeometry(0.5, 0.42, 0.7, 20).translate(x, PLINTH_H + 0.35, z),
      new THREE.CylinderGeometry(0.06, 0.08, 1.9, 8).translate(x, PLINTH_H + 1.4, z),
    ]),
  ];
  const furnitureMesh = new THREE.Mesh(mergeGeometries(furniture, false), stone);
  furnitureMesh.castShadow = true;
  furnitureMesh.receiveShadow = true;
  const leaves = new THREE.Mesh(
    mergeGeometries(
      trees.map(([x, z]) => new THREE.IcosahedronGeometry(1.1, 1).scale(1, 1.15, 1).translate(x, PLINTH_H + 2.9, z)),
      false
    ),
    new THREE.MeshStandardMaterial({ color: C.LOBBY_LEAF_COLOR, roughness: 0.85, flatShading: true })
  );
  leaves.castShadow = true;
  parts.push(furnitureMesh, leaves);

  // --- The stone plinth the tower stands on, which is also the lobby floor ---
  const margin = C.PLINTH_MARGIN * C.MM;
  const plinthX = C.TOWER_WIDTH_X * C.MM + 2 * margin;
  const plinthZ = C.TOWER_DEPTH_Z * C.MM + 2 * margin;
  const tile = C.PAVING_TILE * C.MM;
  const plinth = new THREE.Mesh(
    scaleUV(new THREE.BoxGeometry(plinthX, PLINTH_H, plinthZ), plinthX / tile, plinthZ / tile),
    new THREE.MeshStandardMaterial({
      map: pavingTexture({ base: '#' + new THREE.Color(C.STONE_COLOR).getHexString() }),
      roughness: 0.6,
      metalness: 0.0,
    })
  );
  plinth.position.y = PLINTH_H / 2;
  plinth.receiveShadow = true;
  parts.push(plinth);

  for (const part of parts) group.add(part);

  return {
    /** The downlights are dark discs by day, and light up with the night. */
    setNightLevel(t) {
      lampMaterial.color.setScalar(0.06 + t * C.DOWNLIGHT_GLOW);
    },
  };
}

/* ------------------------------------------------------------------ *
 * The crown: fritted glass screen, rooftop plant, lift overrun
 * ------------------------------------------------------------------ */

function buildCrown(group) {
  const frit = new THREE.MeshStandardMaterial({
    color: C.FRIT_COLOR,
    roughness: 0.3,
    metalness: 0.1,
    transparent: true,
    opacity: C.FRIT_OPACITY,
    side: THREE.DoubleSide,
    emissive: new THREE.Color(C.CROWN_GLOW_COLOR),
    emissiveIntensity: 0,
  });

  const gap = C.MULLION_WIDTH * C.MM;
  const bottom = TOTAL_H + SPANDREL_ABOVE;
  const height = CROWN_TOP - COPING_H - bottom;
  const panes = [];
  for (const face of Object.values(FACES)) {
    const q = faceQuaternion(face);
    for (let c = 0; c < columnsOf(face); c++) {
      panes.push(placed(faceToWorld(face, panelX(face, c), bottom + height / 2, 0), q, PANEL_W - gap, height, 1));
    }
  }
  const screen = instanced(new THREE.PlaneGeometry(1, 1), frit, panes);
  screen.castShadow = true;
  screen.renderOrder = 2;
  group.add(screen);

  // Plant enclosure behind louvres, set back from the crown.
  const setback = C.PLANT_SETBACK * C.MM;
  const plantH = C.PLANT_HEIGHT * C.MM;
  const plantX = C.TOWER_WIDTH_X * C.MM - 2 * setback;
  const plantZ = C.TOWER_DEPTH_Z * C.MM - 2 * setback;
  const plant = new THREE.Mesh(
    scaleUV(new THREE.BoxGeometry(plantX, plantH, plantZ), 1, plantH),
    new THREE.MeshStandardMaterial({ map: louvreTexture(), color: C.PLANT_COLOR, roughness: 0.55, metalness: 0.5 })
  );
  plant.position.y = ROOF_TOP + plantH / 2;
  plant.castShadow = true;
  plant.receiveShadow = true;
  group.add(plant);

  // Four cooling fans on it, and the lift overrun rising through it over the core.
  const fans = new THREE.Mesh(
    mergeGeometries(
      [-8, 8].flatMap((x) =>
        [-3, 3].map((z) => new THREE.CylinderGeometry(1.3, 1.3, 0.9, 24).translate(x, ROOF_TOP + plantH + 0.45, z))
      ),
      false
    ),
    new THREE.MeshStandardMaterial({ color: 0x4a4e53, roughness: 0.5, metalness: 0.6 })
  );
  fans.castShadow = true;
  group.add(fans);

  const overrunH = C.OVERRUN_HEIGHT * C.MM;
  const overrun = new THREE.Mesh(
    new THREE.BoxGeometry(8, overrunH, 5),
    new THREE.MeshStandardMaterial({ color: C.CORE_WALL_COLOR, roughness: 0.9, metalness: 0.0 })
  );
  overrun.position.y = ROOF_TOP + overrunH / 2;
  overrun.castShadow = true;
  overrun.receiveShadow = true;
  group.add(overrun);

  return {
    setNightLevel(t) {
      frit.emissiveIntensity = t * C.CROWN_GLOW;
    },
  };
}

/* ------------------------------------------------------------------ *
 * Lit floors at night
 * ------------------------------------------------------------------ */

/**
 * Warm light on every office floor, seen through the glass from any distance.
 * Each floor plate is split into zones; each zone is a glowing ceiling panel
 * at the suspended ceiling, just under the spandrel (what floors above eye
 * level show) and a dimmer lit floor on the slab (what floors below it show).
 * A few zones are dim or dark, so the tower reads as lived in rather than
 * uniformly lit. The lobby floor glows too; its ceiling is the soffit, lit by
 * the downlights. The material is unlit -- the panels are the light -- and
 * they are hidden by day.
 */
function buildInteriorGlow(group) {
  const rand = mulberry32(5150);
  const slabX = C.TOWER_WIDTH_X * C.MM - C.SLAB_INSET * C.MM;
  const slabZ = C.TOWER_DEPTH_Z * C.MM - C.SLAB_INSET * C.MM;
  const zoneX = slabX / C.INTERIOR_ZONES_X;
  const zoneZ = slabZ / C.INTERIOR_ZONES_Z;

  const warm = new THREE.Color(C.INTERIOR_GLOW_COLOR);
  const flat = new THREE.Quaternion();
  const ceilingAt = [];
  const floorAt = [];
  const levels = [];

  function zone(x, z, sx, sz, ceilingY, floorY, level) {
    ceilingAt.push(placed(new THREE.Vector3(x, ceilingY, z), flat, sx, 1, sz));
    floorAt.push(placed(new THREE.Vector3(x, floorY, z), flat, sx, 1, sz));
    levels.push(level);
  }

  // The lobby: just its floor -- the ceiling panel is tucked out of sight inside the soffit.
  zone(
    0,
    0,
    C.TOWER_WIDTH_X * C.MM - 2 * SETBACK - 0.1,
    C.TOWER_DEPTH_Z * C.MM - 2 * SETBACK - 0.1,
    SOFFIT_Y + 0.02,
    PLINTH_H + 0.01,
    0.9
  );

  for (let f = C.LOBBY_FLOORS; f < C.FLOOR_COUNT; f++) {
    for (let ix = 0; ix < C.INTERIOR_ZONES_X; ix++) {
      for (let iz = 0; iz < C.INTERIOR_ZONES_Z; iz++) {
        const r = rand();
        const level = r < 0.08 ? 0 : r < 0.2 ? 0.25 + rand() * 0.15 : 0.75 + rand() * 0.25;
        zone(
          -slabX / 2 + (ix + 0.5) * zoneX,
          -slabZ / 2 + (iz + 0.5) * zoneZ,
          zoneX,
          zoneZ,
          (f + 1) * FLOOR_H - SPANDREL_BELOW - 0.01,
          f * FLOOR_H + HALF_SLAB + 0.01,
          level
        );
      }
    }
  }

  const material = new THREE.MeshBasicMaterial({ color: 0x000000 });
  // A plane faces +Z; turned to face down for ceilings, up for floors.
  const ceilings = instanced(new THREE.PlaneGeometry(1, 1).rotateX(Math.PI / 2), material, ceilingAt);
  const floors = instanced(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), material, floorAt);

  const tint = new THREE.Color();
  levels.forEach((level, i) => {
    ceilings.setColorAt(i, tint.copy(warm).multiplyScalar(level));
    floors.setColorAt(i, tint.copy(warm).multiplyScalar(level * C.INTERIOR_FLOOR_SHARE));
  });

  for (const mesh of [ceilings, floors]) {
    mesh.instanceColor.needsUpdate = true;
    mesh.visible = false;
    group.add(mesh);
  }

  return {
    setLevel(t) {
      const lit = t > 0.01;
      ceilings.visible = lit;
      floors.visible = lit;
      material.color.setScalar(t * C.INTERIOR_GLOW);
    },
  };
}

/** Small deterministic PRNG, so the lit zones are the same on every reload. */
function mulberry32(seed) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
