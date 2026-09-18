/**
 * How much sun each module on the facade actually gets, 0..1.
 *
 * The wall is flat, so the direct beam strikes every module at the same angle:
 * on its own it would close the whole field as one. What differs from module to
 * module is whether anything stands between it and the sun, and how much
 * bounced light it can see -- and both of those move with the sun through the
 * day. Three parts, all worked out from the scene's own geometry:
 *
 *   direct    the beam itself, unless a neighbouring building blocks it. Two
 *             rays per module, its top and bottom corners, so the edge of a
 *             shadow crosses a module gradually rather than switching it.
 *   plaza     light off the sunlit ground below. The plaza is a finite patch,
 *             so a module sees less of it the higher up the tower it sits.
 *   neighbour light off the neighbours' sunlit faces. A module near a tall
 *             glass tower whose face the sun is on gets a good deal of it;
 *             one far away, or with nothing in front of it, gets none.
 *
 * Tracing is cheap (a few thousand ray-box tests) but pointless every frame, so
 * it only runs once the sun has moved enough to matter.
 */

import * as THREE from 'three';
import * as C from './constants.js';

const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);

/** Re-trace once the sun has moved this far (unit vector). */
const SUN_MOVE = 0.01;
/** Rays start this far off the glass, clear of the module's own hardware (m). */
const RAY_LEAD = 0.5;
/** Nothing in this city is further off than this, so rays stop there (m). */
const RAY_REACH = 600;

/**
 * Does a vertical box block the ray? The box stands on the ground, x and z
 * across its footprint, y from 0 to h -- the slab test, with the near end of
 * the ray at 0 and the far end at RAY_REACH.
 */
function blocks(ox, oy, oz, dx, dy, dz, box) {
  let near = 0;
  let far = RAY_REACH;

  // x and z slabs, from the footprint; y from the ground to the roof.
  const slabs = [
    [ox, dx, box.x - box.w / 2, box.x + box.w / 2],
    [oy, dy, 0, box.h],
    [oz, dz, box.z - box.d / 2, box.z + box.d / 2],
  ];
  for (const [o, d, lo, hi] of slabs) {
    if (Math.abs(d) < 1e-6) {
      if (o < lo || o > hi) return false; // parallel to this slab and outside it
      continue;
    }
    let t0 = (lo - o) / d;
    let t1 = (hi - o) / d;
    if (t0 > t1) [t0, t1] = [t1, t0];
    if (t0 > near) near = t0;
    if (t1 < far) far = t1;
    if (near > far) return false;
  }
  return true;
}

/**
 * @param modulePos one world position per module, from facade.js.
 * @param normal the facade's outward normal (world).
 * @param footprints the city's buildings: { x, z, w, d, h } each, metres.
 */
export function createFacadeExposure({ modulePos, normal, footprints }) {
  const count = modulePos.length;

  // Across the facade, and where each module sits along it: -1 at one end of
  // the field, +1 at the other. The sweep below rides on this.
  const across = new THREE.Vector3(0, 1, 0).cross(normal).normalize();
  const centre = new THREE.Vector3();
  for (const pos of modulePos) centre.add(pos);
  centre.divideScalar(count);
  const place = modulePos.map((pos) => pos.clone().sub(centre).dot(across));
  const halfWidth = Math.max(...place.map(Math.abs)) || 1;
  for (let i = 0; i < place.length; i++) place[i] /= halfWidth;
  /** 0 = in shadow with nothing bounced in, 1 = the full share of the sun. */
  const values = new Float32Array(count).fill(1);

  const tracedSun = new THREE.Vector3(NaN, NaN, NaN);
  const out = new THREE.Vector3();

  /**
   * How much of the sunlit plaza this module can see: a finite patch of ground,
   * so its share falls away with height in the same way a view factor does.
   */
  function plazaShare(y) {
    const t = Math.max(0, y) / C.EXPOSURE_PLAZA_HEIGHT;
    return 1 / (1 + t * t);
  }

  /**
   * Light reaching a module off the neighbours' sunlit faces. Each building
   * offers the face that looks at the module; it counts for something only if
   * the sun is on that face, the module can see it (it stands in front of the
   * facade), and it is near enough.
   */
  function neighbourShare(pos, sun) {
    let sum = 0;
    for (const box of footprints) {
      const toX = box.x - pos.x;
      const toZ = box.z - pos.z;
      const distance = Math.hypot(toX, toZ);
      if (distance < 1 || distance > C.EXPOSURE_NEIGHBOUR_RANGE) continue;

      // In front of the facade, or behind it where this module cannot see it?
      const facing = (toX * normal.x + toZ * normal.z) / distance;
      if (facing <= 0) continue;

      // The face turned toward the module, and whether the sun is on it.
      const faceX = -toX / distance;
      const faceZ = -toZ / distance;
      const lit = faceX * sun.x + faceZ * sun.z;
      if (lit <= 0) continue;

      // Nothing to catch the light above the roof.
      const rise = Math.max(0, pos.y - box.h);
      const reach = 1 / (1 + (distance / C.EXPOSURE_NEIGHBOUR_FALLOFF) ** 2);
      const above = 1 / (1 + (rise / C.EXPOSURE_NEIGHBOUR_FALLOFF) ** 2);
      sum += lit * facing * reach * above;
    }
    // Softly, so that a module with several neighbours in view still reads
    // above one with a single neighbour instead of both pinning at 1.
    return sum / (C.EXPOSURE_NEIGHBOUR_SOFT + sum);
  }

  /**
   * Recompute, but only once the sun has moved. `sun` points at the sun (world,
   * unit); `elevation` is its height in degrees, so that a sun below the
   * horizon leaves nothing to shade against.
   */
  function update(sun, elevation) {
    if (tracedSun.distanceTo(sun) < SUN_MOVE) return values;
    tracedSun.copy(sun);

    const facing = sun.x * normal.x + sun.y * normal.y + sun.z * normal.z;
    if (elevation <= 0 || facing <= 0) {
      values.fill(0); // no sun on this face at all
      return values;
    }

    const up = Math.sin(elevation * (Math.PI / 180));
    const half = (C.MODULE_PITCH_Y * C.MM) / 2;

    for (let i = 0; i < count; i++) {
      const pos = modulePos[i];
      out.copy(pos).addScaledVector(normal, RAY_LEAD);

      // Its top and bottom corners, so a shadow edge crosses it gradually.
      let clear = 0;
      for (const dy of [half, -half]) {
        let hit = false;
        for (const box of footprints) {
          if (blocks(out.x, out.y + dy, out.z, sun.x, sun.y, sun.z, box)) {
            hit = true;
            break;
          }
        }
        if (!hit) clear += 0.5;
      }

      const direct = C.EXPOSURE_DIRECT_SHARE * clear;
      const bounced =
        up *
        (C.EXPOSURE_PLAZA * plazaShare(pos.y) +
          C.EXPOSURE_NEIGHBOUR * neighbourShare(pos, sun));

      // The sweep: the end of the facade the sun is on reads hotter, and as the
      // sun crosses from one side to the other so does the bright end. This one
      // is a design decision rather than a measurement -- see the constant.
      const sweep = C.EXPOSURE_SUN_SWEEP * place[i] * sun.dot(across);

      values[i] = Math.min(1, direct + bounced + sweep);
    }

    // On a flat wall the real spread is only a few per cent, which no one would
    // see. Stretch it about its own average: which module is brighter than
    // which, and how that shifts through the day, is the geometry's answer --
    // EXPOSURE_CONTRAST only decides how plainly the field shows it.
    let mean = 0;
    for (let i = 0; i < count; i++) mean += values[i];
    mean /= count;
    for (let i = 0; i < count; i++) {
      values[i] = clamp01(mean + C.EXPOSURE_CONTRAST * (values[i] - mean));
    }

    return values;
  }

  return { values, update };
}
