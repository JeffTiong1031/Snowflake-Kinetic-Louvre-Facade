/**
 * Snowflake module geometry, built procedurally.
 *
 * Module-local frame: X = facade right, Y = facade up, Z = outward normal.
 * Everything static (hub, bolts, arms, arrowhead tips, aluminium frame ring)
 * merges into ONE BufferGeometry so the whole field of modules costs a single
 * instanced draw call. Blades are separate -- they are the only moving parts.
 */

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import * as C from './constants.js';

const DEG = Math.PI / 180;
const lerp = (a, b, t) => a + (b - a) * t;

/** Blades on one module: 6 arms, both sides, N per side. */
export const MODULE_BLADE_COUNT = C.ARM_COUNT * 2 * C.BLADES_PER_SIDE;

/* ------------------------------------------------------------------ *
 * Static hardware
 * ------------------------------------------------------------------ */

/** Flat diamond / arrowhead lying in the facade plane, long axis along X. */
function diamondGeometry(length, width, thickness) {
  const shape = new THREE.Shape();
  shape.moveTo(-length / 2, 0);
  shape.lineTo(0, -width / 2);
  shape.lineTo(length / 2, 0);
  shape.lineTo(0, width / 2);
  shape.closePath();

  const geo = new THREE.ExtrudeGeometry(shape, { depth: thickness, bevelEnabled: false });
  geo.translate(0, 0, -thickness / 2);
  return geo;
}

/**
 * All non-moving parts of one module, in module-local metres.
 * Returns a single merged, non-indexed-group BufferGeometry.
 */
export function buildModuleStaticGeometry() {
  const parts = [];

  // --- Central hexagonal hub plate. Cylinder axis is Y, so lay it onto Z. ---
  const hub = new THREE.CylinderGeometry(
    C.HUB_RADIUS * C.MM,
    C.HUB_RADIUS * C.MM,
    C.HUB_THICKNESS * C.MM,
    6
  );
  hub.rotateX(Math.PI / 2);
  hub.rotateZ(Math.PI / 6); // put a flat on top rather than a vertex
  parts.push(hub);

  // --- Six bolt heads near the hub perimeter, standing proud of its face. ---
  for (let i = 0; i < C.BOLT_COUNT; i++) {
    const a = (i / C.BOLT_COUNT) * Math.PI * 2 + Math.PI / 6;
    const bolt = new THREE.CylinderGeometry(
      C.BOLT_HEAD_RADIUS * C.MM,
      C.BOLT_HEAD_RADIUS * C.MM,
      C.BOLT_HEAD_HEIGHT * C.MM,
      6
    );
    bolt.rotateX(Math.PI / 2);
    bolt.translate(
      Math.cos(a) * C.BOLT_CIRCLE_RADIUS * C.MM,
      Math.sin(a) * C.BOLT_CIRCLE_RADIUS * C.MM,
      (C.HUB_THICKNESS / 2 + C.BOLT_HEAD_HEIGHT / 2) * C.MM
    );
    parts.push(bolt);
  }

  // --- Six square-section arms, each capped with a flat arrowhead tip. ---
  const armStart = C.HUB_RADIUS * 0.5 * C.MM;
  const armEnd = C.ARM_LENGTH * C.MM;
  const armLen = armEnd - armStart;

  for (let i = 0; i < C.ARM_COUNT; i++) {
    const theta = (i / C.ARM_COUNT) * Math.PI * 2;

    const arm = new THREE.BoxGeometry(armLen, C.ARM_SECTION * C.MM, C.ARM_SECTION * C.MM);
    arm.translate(armStart + armLen / 2, 0, 0);
    arm.rotateZ(theta);
    parts.push(arm);

    const tip = diamondGeometry(
      C.TIP_LENGTH * C.MM,
      C.TIP_WIDTH * C.MM,
      C.TIP_THICKNESS * C.MM
    );
    tip.translate(armEnd, 0, 0);
    tip.rotateZ(theta);
    parts.push(tip);
  }

  // --- Aluminium frame ring the hub bolts onto (mounting layer). ---
  const ring = new THREE.TorusGeometry(
    C.MODULE_FRAME_RADIUS * C.MM,
    C.MODULE_FRAME_TUBE * C.MM,
    8,
    24
  );
  const ringZ = -(C.MODULE_FRAME_TUBE + C.HUB_THICKNESS) * C.MM;
  ring.translate(0, 0, ringZ);
  parts.push(ring);

  // --- Two mounting brackets reaching back to the secondary support frame. ---
  const bracketZ = -(C.MODULE_STANDOFF - C.SECONDARY_FRAME_OFFSET - C.SECONDARY_FRAME_DEPTH / 2) * C.MM;
  for (const sign of [1, -1]) {
    const bracket = new THREE.BoxGeometry(
      C.BRACKET_WIDTH * C.MM,
      C.BRACKET_THICKNESS * C.MM,
      C.BRACKET_LENGTH * C.MM
    );
    bracket.translate(
      0,
      (sign * C.BRACKET_SPACING) / 2 * C.MM,
      bracketZ + (C.BRACKET_LENGTH / 2) * C.MM
    );
    parts.push(bracket);
  }

  // Box/Cylinder/Torus come back indexed, ExtrudeGeometry does not, and
  // mergeGeometries refuses a mixed set. Flatten everything first.
  const flattened = parts.map((p) => (p.index ? p.toNonIndexed() : p));

  const merged = mergeGeometries(flattened, false);
  if (!merged) throw new Error('buildModuleStaticGeometry: geometry merge failed');

  parts.forEach((p) => p.dispose());
  flattened.forEach((p, i) => {
    if (p !== parts[i]) p.dispose();
  });

  merged.computeBoundingSphere();
  return merged;
}

/* ------------------------------------------------------------------ *
 * Blades
 * ------------------------------------------------------------------ */

/**
 * Unit blade: a trapezoidal plate hinged on its own local X axis.
 *
 *   x in [0,1] runs along the hinge, y in [0,1] is the width away from it,
 *   z is thickness, centred. Width at the free end (x=1) tapers to
 *   BLADE_TIP_TAPER.
 *
 * Instance scale (length, width, thickness) sizes it; rotation about local X
 * swings it out of the facade plane.
 */
export function buildBladeGeometry() {
  const shape = new THREE.Shape();
  shape.moveTo(0, 0);
  shape.lineTo(1, 0);
  shape.lineTo(1, C.BLADE_TIP_TAPER);
  shape.lineTo(0, 1);
  shape.closePath();

  const geo = new THREE.ExtrudeGeometry(shape, { depth: 1, bevelEnabled: false });
  geo.translate(0, 0, -0.5);
  return geo;
}

/**
 * Where every blade of one module sits, in module-local space.
 *
 * Each entry carries the hinge origin, the orientation that aligns the unit
 * blade's local axes with (hinge direction, width direction, plate normal),
 * the scale, and a hinge sign. The sign exists because the two sides of an arm
 * are mirror images: without it one side would swing toward the glass while the
 * other swings away. With it, every blade opens outward.
 */
export function buildBladeLayout() {
  const layout = [];

  const dir = new THREE.Vector3();
  const perp = new THREE.Vector3();
  const norm = new THREE.Vector3();
  const basis = new THREE.Matrix4();

  for (let arm = 0; arm < C.ARM_COUNT; arm++) {
    const theta = (arm / C.ARM_COUNT) * Math.PI * 2;
    const ux = Math.cos(theta);
    const uy = Math.sin(theta);

    for (const side of [1, -1]) {
      for (let b = 0; b < C.BLADES_PER_SIDE; b++) {
        const f = C.BLADES_PER_SIDE === 1 ? 0 : b / (C.BLADES_PER_SIDE - 1);

        const t = lerp(C.BLADE_FIRST_T, C.BLADE_LAST_T, f) * C.MM;
        const length = lerp(C.BLADE_LENGTH_INNER, C.BLADE_LENGTH_OUTER, f) * C.MM;
        const width = lerp(C.BLADE_WIDTH_INNER, C.BLADE_WIDTH_OUTER, f) * C.MM;

        // Hinge axis: 45deg to the arm line, swept back so the mirrored pair
        // reads as a chevron pointing outward.
        const hingeAngle = theta + side * C.BLADE_HINGE_ANGLE_DEG * DEG;
        const dx = Math.cos(hingeAngle);
        const dy = Math.sin(hingeAngle);

        // Width direction: perpendicular to the hinge, in the facade plane,
        // pointing toward the arm tip so consecutive blades tile.
        let px = -dy;
        let py = dx;
        if (px * ux + py * uy < 0) {
          px = -px;
          py = -py;
        }

        dir.set(dx, dy, 0);
        perp.set(px, py, 0);
        norm.crossVectors(dir, perp);

        basis.makeBasis(dir, perp, norm);
        const quat = new THREE.Quaternion().setFromRotationMatrix(basis);

        // Sit the hinge on the arm's side face, standing proud of it.
        const sideX = -uy * side;
        const sideY = ux * side;
        const half = (C.ARM_SECTION / 2) * C.MM;

        layout.push({
          origin: new THREE.Vector3(
            t * ux + sideX * half,
            t * uy + sideY * half,
            C.BLADE_Z_OFFSET * C.MM
          ),
          quat,
          scale: new THREE.Vector3(length, width, C.BLADE_THICKNESS * C.MM),
          hingeSign: norm.z > 0 ? 1 : -1,
        });
      }
    }
  }

  return layout;
}
