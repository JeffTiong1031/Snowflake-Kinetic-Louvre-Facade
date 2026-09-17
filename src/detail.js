/**
 * Distance-driven level of detail.
 *
 * Real curtain wall does not show you its interior from across the street: the
 * glazing reads as a reflective sheet, and only close up does the fit-out
 * behind it resolve. This reproduces that by tying two things to how far the
 * camera is from the tower envelope:
 *
 *   - the office fit-out fades out, and past the far bound stops being drawn
 *     at all, which is where its cost goes away too;
 *   - the glazing simultaneously gets more opaque and more reflective.
 *
 * Distance is measured to the tower's bounding box rather than its centre, so
 * standing at the base of a 105m tower counts as close, not 50m away.
 */

import * as THREE from 'three';
import * as C from './constants.js';

/** Hermite ease between two bounds; 0 at or below a, 1 at or above b. */
function smoothstep(a, b, x) {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

const lerp = (a, b, t) => a + (b - a) * t;

export function createDetailController({ camera, offices, glassMaterial, towerHeight }) {
  const halfX = (C.TOWER_WIDTH_X * C.MM) / 2;
  const halfZ = (C.TOWER_DEPTH_Z * C.MM) / 2;

  const envelope = new THREE.Box3(
    new THREE.Vector3(-halfX, 0, -halfZ),
    new THREE.Vector3(halfX, towerHeight, halfZ)
  );

  // Only push material changes when they actually move, so we are not dirtying
  // uniforms every frame while the camera sits still.
  let lastInterior = -1;
  let lastLights = -1;
  let lastGlass = -1;

  function update() {
    const distance = envelope.distanceToPoint(camera.position);

    const interior = 1 - smoothstep(C.INTERIOR_FADE_NEAR, C.INTERIOR_FADE_FAR, distance);
    const lights = 1 - smoothstep(C.LIGHT_FADE_NEAR, C.LIGHT_FADE_FAR, distance);

    if (Math.abs(interior - lastInterior) > 0.002) {
      offices.setInteriorFade(interior);
      lastInterior = interior;
    }

    // Tracked separately: the lighting band reaches well past the point where
    // the furniture has already faded to nothing.
    if (Math.abs(lights - lastLights) > 0.002) {
      offices.setLightFade(lights);
      lastLights = lights;
    }

    // Glazing turns reflective over the same band the interior fades across.
    const glass = smoothstep(C.INTERIOR_FADE_NEAR, C.INTERIOR_FADE_FAR, distance);
    if (Math.abs(glass - lastGlass) > 0.002) {
      glassMaterial.opacity = lerp(C.GLASS_OPACITY_NEAR, C.GLASS_OPACITY_FAR, glass);
      glassMaterial.envMapIntensity = lerp(C.GLASS_ENV_NEAR, C.GLASS_ENV_FAR, glass);
      lastGlass = glass;
    }

    return { distance, interior };
  }

  return { update };
}
