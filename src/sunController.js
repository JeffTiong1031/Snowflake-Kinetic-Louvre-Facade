/**
 * Sun position, sky colour, and the per-module louvre response.
 *
 * World convention: +X east, +Y up, -Z north. Azimuth is measured from north,
 * clockwise through east; elevation from the horizon.
 *
 * Each module works out its own state. A flat facade sees the same incidence
 * everywhere, so the gradient across the grid comes from mutual shading: the
 * modules stand 250mm proud of the glass, and at oblique sun each one shadows
 * its neighbour downwind. Shadow reach per unit standoff is |tangential| /
 * |normal| component of the sun ray, which is what SHADE_GAIN_* scales.
 */

import * as THREE from 'three';
import * as C from './constants.js';

const DEG = Math.PI / 180;
const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);

/** Kuala Lumpur, near enough, for the time-of-day arc. */
const SITE_LATITUDE_DEG = 3.14;

const WARM = new THREE.Color(0xff8c3a);
const NEUTRAL = new THREE.Color(0xfff2df);
const SKY_DAY = new THREE.Color(0x9fb6cc);
const SKY_DUSK = new THREE.Color(0x2c3550);
const HEMI_SKY_DAY = new THREE.Color(0xbcd8f2);
const HEMI_SKY_DUSK = new THREE.Color(0x2f3648);

export function createSunController({ scene, sunLight, hemiLight, facade }) {
  const count = C.MODULE_COUNT;

  const states = new Float32Array(count).fill(1);
  const targets = new Float32Array(count).fill(1);

  // Deterministic per-module offset so the gradient is not glassy-smooth.
  const jitter = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    const h = Math.sin(i * 12.9898 + 78.233) * 43758.5453;
    jitter[i] = (h - Math.floor(h) - 0.5) * C.MODULE_JITTER;
  }

  const sunDir = new THREE.Vector3(0, 1, 0);
  const faceRight = new THREE.Vector3(1, 0, 0).applyQuaternion(facade.faceQuat).normalize();
  const normal = facade.facadeNormal;

  const sunColor = new THREE.Color();
  const skyColor = new THREE.Color();
  const hemiColor = new THREE.Color();

  configureShadowCamera(sunLight, facade);

  /** Solar azimuth/elevation for a decimal hour, equinox, at SITE_LATITUDE_DEG. */
  function solarAngles(hour) {
    const H = (hour - 12) * 15 * DEG;
    const phi = SITE_LATITUDE_DEG * DEG;
    const dec = 0; // equinox

    const north = Math.sin(dec) * Math.cos(phi) - Math.cos(dec) * Math.sin(phi) * Math.cos(H);
    const east = -Math.cos(dec) * Math.sin(H);
    const up = Math.sin(dec) * Math.sin(phi) + Math.cos(dec) * Math.cos(phi) * Math.cos(H);

    let az = Math.atan2(east, north) / DEG;
    if (az < 0) az += 360;
    return { azimuth: az, elevation: Math.asin(clampSigned(up)) / DEG };
  }

  function update(dt, params) {
    const az = params.azimuth * DEG;
    const el = params.elevation * DEG;
    const cosEl = Math.cos(el);

    sunDir.set(Math.sin(az) * cosEl, Math.sin(el), -Math.cos(az) * cosEl).normalize();

    // --- Light rig ---
    const above = Math.max(0, Math.sin(el));
    const dayness = clamp01(params.elevation / 18);

    sunColor.copy(WARM).lerp(NEUTRAL, dayness);
    sunLight.color.copy(sunColor);
    sunLight.intensity = 3.2 * Math.pow(above, 0.6);
    sunLight.visible = params.elevation > 0;

    sunLight.position.copy(facade.fieldCenter).addScaledVector(sunDir, 140);
    sunLight.target.position.copy(facade.fieldCenter);
    sunLight.target.updateMatrixWorld();

    hemiColor.copy(HEMI_SKY_DUSK).lerp(HEMI_SKY_DAY, dayness);
    hemiLight.color.copy(hemiColor);
    hemiLight.intensity = 0.25 + 0.75 * dayness;

    skyColor.copy(SKY_DUSK).lerp(SKY_DAY, dayness);
    scene.background.copy(skyColor);
    scene.fog.color.copy(skyColor);

    // --- Per-module targets ---
    if (params.manualOverride) {
      targets.fill(params.manualState);
    } else {
      computeTargets(params);
    }

    // --- Damped approach, so blades ease rather than snap ---
    const k = 1 - Math.exp(-dt / C.BLADE_RESPONSE_TAU);
    for (let i = 0; i < count; i++) {
      states[i] += (targets[i] - states[i]) * k;
    }

    return states;
  }

  function computeTargets(params) {
    const incidence = normal.dot(sunDir);
    const horizon = clamp01(params.elevation / C.HORIZON_FADE_DEG);

    if (incidence <= 0 || horizon <= 0) {
      targets.fill(1); // sun behind the facade or below the horizon: open up
      return;
    }

    // Shadow reach per unit standoff, along the facade and up it.
    const sx = sunDir.dot(faceRight);
    const sy = sunDir.y;
    const denom = Math.max(incidence, 0.05);
    const reachH = Math.min(1, Math.abs(sx) / denom);
    const reachV = Math.min(1, Math.max(0, sy) / denom);

    const fromEast = sx > 0;

    for (let i = 0; i < count; i++) {
      // Distance from the edge the sun arrives at, in grid fractions.
      const dh = fromEast ? 1 - facade.moduleU[i] : facade.moduleU[i];
      const dv = 1 - facade.moduleV[i]; // the sun is above: upper modules shade lower

      const occlusion = clamp01(
        reachH * dh * C.SHADE_GAIN_HORIZONTAL + reachV * dv * C.SHADE_GAIN_VERTICAL
      );

      const exposure = clamp01(incidence * horizon * (1 - occlusion) + jitter[i]);
      targets[i] = 1 - exposure; // strong sun -> closed, shading the glass
    }
  }

  return { update, solarAngles, states, sunDir };
}

/**
 * Fit the shadow frustum to the module field rather than the whole tower, so a
 * 2048 map lands roughly 2.5cm per texel instead of 5cm.
 */
function configureShadowCamera(sunLight, facade) {
  const radius = Math.max(facade.fieldWidth, facade.fieldHeight) / 2 + 4;
  const cam = sunLight.shadow.camera;
  cam.left = -radius;
  cam.right = radius;
  cam.top = radius;
  cam.bottom = -radius;
  cam.near = 20;
  cam.far = 300;
  cam.updateProjectionMatrix();
}

function clampSigned(x) {
  return x < -1 ? -1 : x > 1 ? 1 : x;
}
