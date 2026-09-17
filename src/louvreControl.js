/**
 * Louvre control: how far each gap's slats may open for a given sun.
 *
 * Each gap opens as wide as it can while the direct sun its slats let through
 * stays within SUN_LEAK_BUDGET of full sun. That is measured on the slats
 * themselves: sun rays are traced in through the closed slats' footprints,
 * past the gap's slats at a trial angle, to the glass, and the share that gets
 * there is weighed by how squarely the sun meets the facade. With the sun off
 * the face there is nothing to keep out, and every gap opens fully.
 *
 * Why trace rather than use a formula: the hinges lie at 60deg to each gap's
 * bisector, so sun that could be caught across the slats mostly runs along
 * them and escapes past their ends. Only the actual outlines get that right.
 *
 * Every module on the flat face sees the same sun, so this runs for one
 * module's six gaps -- and the caller runs it only when the sun has moved.
 */

import * as C from './constants.js';
import { buildBladeLayout, slatOutlines } from './snowflakeModule.js';

const DEG = Math.PI / 180;
const OPEN = C.BLADE_OPEN_ANGLE_DEG * DEG;
const CLOSED = C.BLADE_CLOSED_ANGLE_DEG * DEG;

/**
 * Trial angles: this far apart until the budget is passed, then halved this
 * many times about the crossing, and the answer interpolated between the two
 * trials that bracket it.
 */
const COARSE_STEP = 12 * DEG;
const REFINE = 3;
/**
 * Ray entry points: a grid over each closed slat, this far in from its edges
 * (mm). Fine across the slat -- sun first gets through as a strip along the
 * free edge, a few mm wide -- and coarser along it.
 */
const RAY_STEP_ALONG = 15;
const RAY_STEP_ACROSS = 3.5;
const RAY_MARGIN = 0.5;
/** Rays start this far out along the sun direction, clear of everything. */
const RAY_LEAD = 60;

const HALF_T = C.SLAT_THICKNESS / 2;
/** Closed slats' front face, and the glass, module-local mm. */
const FRONT = C.ARM_DEPTH / 2;
const GLASS = -C.MODULE_STANDOFF;

/* ------------------------------------------------------------------ *
 * One module's slats, set up once
 * ------------------------------------------------------------------ */

/** Outlines, counter-clockwise, and a radius about the slat origin that holds each. */
const outlines = slatOutlines().map((poly) => {
  let area = 0;
  for (let i = 0; i < poly.length; i++) {
    const [x1, y1] = poly[i];
    const [x2, y2] = poly[(i + 1) % poly.length];
    area += x1 * y2 - x2 * y1;
  }
  return area < 0 ? poly.slice().reverse() : poly;
});
const reach = outlines.map((poly) => Math.max(...poly.map(([x, y]) => Math.hypot(x, y))) + HALF_T);

/**
 * Per slat: origin (mm), the hinge axis, and the closed frame's other two axes
 * (module-local). Turning by a about the hinge mixes the latter two.
 */
const slats = buildBladeLayout().map((e) => {
  const q = e.quat;
  const axis = (x, y, z) => {
    // Rotate (x, y, z) by the quaternion.
    const ix = q.w * x + q.y * z - q.z * y;
    const iy = q.w * y + q.z * x - q.x * z;
    const iz = q.w * z + q.x * y - q.y * x;
    const iw = -q.x * x - q.y * y - q.z * z;
    return [
      ix * q.w + iw * -q.x + iy * -q.z - iz * -q.y,
      iy * q.w + iw * -q.y + iz * -q.x - ix * -q.z,
      iz * q.w + iw * -q.z + ix * -q.y - iy * -q.x,
    ];
  };
  return {
    gap: e.gap,
    row: e.row,
    sign: e.hingeSign,
    o: [e.origin.x * 1000, e.origin.y * 1000, e.origin.z * 1000],
    b0: axis(1, 0, 0),
    b1: axis(0, 1, 0),
    b2: axis(0, 0, 1),
  };
});

function insideBy(poly, x, y) {
  let m = Infinity;
  for (let i = 0; i < poly.length; i++) {
    const [x1, y1] = poly[i];
    const [x2, y2] = poly[(i + 1) % poly.length];
    m = Math.min(m, ((x2 - x1) * (y - y1) - (y2 - y1) * (x - x1)) / Math.hypot(x2 - x1, y2 - y1));
  }
  return m;
}

/** Per gap: its slats' indices, and ray entry points on its closed slats' front face. */
const gaps = Array.from({ length: C.ARM_COUNT }, (_, g) => {
  const members = [];
  const entries = [];
  slats.forEach((s, j) => {
    if (s.gap !== g) return;
    members.push(j);
    const poly = outlines[s.row];
    const xs = poly.map((p) => p[0]);
    const ys = poly.map((p) => p[1]);
    for (let x = Math.min(...xs) + RAY_STEP_ALONG / 2; x <= Math.max(...xs); x += RAY_STEP_ALONG) {
      for (let y = Math.min(...ys) + RAY_STEP_ACROSS / 2; y <= Math.max(...ys); y += RAY_STEP_ACROSS) {
        if (insideBy(poly, x, y) < RAY_MARGIN) continue;
        entries.push({
          own: j,
          p: [
            s.o[0] + x * s.b0[0] + y * s.b1[0],
            s.o[1] + x * s.b0[1] + y * s.b1[1],
            FRONT,
          ],
        });
      }
    }
  });
  return { members, entries };
});

/* ------------------------------------------------------------------ *
 * Ray tracing
 * ------------------------------------------------------------------ */

/** A slat turned in by phi: origin and its three local axes, module-local. */
const posed = slats.map(() => ({ o: null, row: 0, c0: null, c1: [0, 0, 0], c2: [0, 0, 0] }));

function pose(j, phi) {
  const s = slats[j];
  const a = s.sign * phi;
  const c = Math.cos(a);
  const n = Math.sin(a);
  const ps = posed[j];
  ps.o = s.o;
  ps.row = s.row;
  ps.c0 = s.b0;
  for (let k = 0; k < 3; k++) {
    ps.c1[k] = c * s.b1[k] + n * s.b2[k];
    ps.c2[k] = -n * s.b1[k] + c * s.b2[k];
  }
}

const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const rel = [0, 0, 0];

/** Does the ray S + tD, 0 <= t <= tEnd, pass through posed slat j? */
function hits(j, S, D, tEnd) {
  const ps = posed[j];
  rel[0] = S[0] - ps.o[0];
  rel[1] = S[1] - ps.o[1];
  rel[2] = S[2] - ps.o[2];

  // Quick reject: the ray never comes within the slat's reach of its origin.
  const tc = Math.max(0, Math.min(tEnd, -dot(rel, D)));
  const qx = rel[0] + tc * D[0];
  const qy = rel[1] + tc * D[1];
  const qz = rel[2] + tc * D[2];
  const r = reach[ps.row];
  if (qx * qx + qy * qy + qz * qz > r * r) return false;

  // In the slat's frame: clip to its thickness, then to its outline.
  const sx = dot(rel, ps.c0);
  const sy = dot(rel, ps.c1);
  const sz = dot(rel, ps.c2);
  const dx = dot(D, ps.c0);
  const dy = dot(D, ps.c1);
  const dz = dot(D, ps.c2);
  let t0 = 0;
  let t1 = tEnd;
  if (Math.abs(dz) < 1e-12) {
    if (Math.abs(sz) > HALF_T) return false;
  } else {
    let a = (-HALF_T - sz) / dz;
    let b = (HALF_T - sz) / dz;
    if (a > b) [a, b] = [b, a];
    t0 = Math.max(t0, a);
    t1 = Math.min(t1, b);
    if (t0 > t1) return false;
  }
  const poly = outlines[ps.row];
  for (let i = 0; i < poly.length; i++) {
    const [x1, y1] = poly[i];
    const [x2, y2] = poly[(i + 1) % poly.length];
    const ex = x2 - x1;
    const ey = y2 - y1;
    const A = ex * (sy - y1) - ey * (sx - x1);
    const B = ex * dy - ey * dx;
    if (Math.abs(B) < 1e-15) {
      if (A < 0) return false;
    } else if (B > 0) {
      t0 = Math.max(t0, -A / B);
    } else {
      t1 = Math.min(t1, -A / B);
    }
    if (t0 > t1) return false;
  }
  return true;
}

const S = [0, 0, 0];
const D = [0, 0, 0];

/** Share of full sun reaching the glass through gap g's slats, turned in by phi. */
function admitted(g, phi, sun) {
  const { members, entries } = gaps[g];
  for (const j of members) pose(j, phi);
  D[0] = -sun.x;
  D[1] = -sun.y;
  D[2] = -sun.z;

  let through = 0;
  for (const { own, p } of entries) {
    S[0] = p[0] + sun.x * RAY_LEAD;
    S[1] = p[1] + sun.y * RAY_LEAD;
    S[2] = p[2] + sun.z * RAY_LEAD;
    const tEnd = (S[2] - GLASS) / sun.z;
    // Its own slat stops most rays; try that first.
    if (hits(own, S, D, tEnd)) continue;
    let stopped = false;
    for (const j of members) {
      if (j !== own && hits(j, S, D, tEnd)) {
        stopped = true;
        break;
      }
    }
    if (!stopped) through++;
  }
  return (through / entries.length) * sun.z;
}

/**
 * For a sun direction (unit, module-local: +Z out of the facade), the angle in
 * from flat (radians) each gap may open to: the widest that lets through no
 * more than SUN_LEAK_BUDGET of full sun.
 *
 * @param {{x: number, y: number, z: number}} sun
 * @param {Float32Array} out one angle per gap
 */
export function gapOpenAngles(sun, out) {
  if (sun.z <= 1e-6) {
    out.fill(OPEN);
    return out;
  }
  const budget = C.SUN_LEAK_BUDGET;
  for (let g = 0; g < C.ARM_COUNT; g++) {
    // The last trial within budget, and the first over it.
    let lo = CLOSED;
    let loLeak = admitted(g, CLOSED, sun);
    if (loLeak > budget) {
      out[g] = CLOSED;
      continue;
    }
    let hi = -1;
    let hiLeak = 0;
    for (let phi = CLOSED + COARSE_STEP; lo < OPEN; phi += COARSE_STEP) {
      phi = Math.min(phi, OPEN);
      const leak = admitted(g, phi, sun);
      if (leak > budget) {
        hi = phi;
        hiLeak = leak;
        break;
      }
      lo = phi;
      loLeak = leak;
    }
    if (hi < 0) {
      out[g] = OPEN;
      continue;
    }
    for (let k = 0; k < REFINE; k++) {
      const mid = (lo + hi) / 2;
      const leak = admitted(g, mid, sun);
      if (leak > budget) {
        hi = mid;
        hiLeak = leak;
      } else {
        lo = mid;
        loLeak = leak;
      }
    }
    out[g] = lo + ((hi - lo) * (budget - loLeak)) / (hiLeak - loLeak);
  }
  return out;
}
