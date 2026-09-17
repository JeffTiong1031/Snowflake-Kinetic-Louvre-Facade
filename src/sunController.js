/**
 * Sun position, sky colour, the light rig, and the louvre response.
 *
 * World convention: +X east, +Y up, -Z north. Azimuth is measured from north,
 * clockwise through east; elevation from the horizon.
 *
 * Three scenes (params.mode):
 *   - 'day'   normal daylight: a soft, hazy sun, no glare; louvres fully open.
 *   - 'hot'   a hot afternoon: strong sun wherever it is put, and the louvres
 *             track it based on sunlight intensity -- closing slightly in early
 *             morning, down to a small gap opening at noon peak sun, and gradually
 *             opening back up into evening. All six gaps of each module share
 *             a single angle driven together from the central hub.
 *   - 'night' a faint cool moon; louvres fully open.
 *   - 'storm' overcast, no sun, the rain closing the view in (the rain and
 *             wind themselves are in weather.js); louvres fully open, edge-on
 *             to the wind.
 */

import * as THREE from 'three';
import * as C from './constants.js';
import { gapOpenAngles } from './louvreControl.js';
// Inlined into the bundle, so the worker costs no extra fetch.
import LouvreWorker from './louvreWorker.js?worker&inline';

const DEG = Math.PI / 180;
const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const lerp = (a, b, t) => a + (b - a) * t;

/** Kuala Lumpur, near enough, for the sun's path. */
const SITE_LATITUDE_DEG = 3.14;
/**
 * The June solstice. Kuala Lumpur sits just north of the equator, so in June
 * the sun passes north of overhead and the north face -- the one carrying the
 * louvres -- is in sun from morning to evening.
 */
const SOLAR_DECLINATION_DEG = 23.44;

/** Top of the tallest thing that can cast a shadow: the tower's crown, with a margin. */
const CASTER_TOP = (C.FLOOR_COUNT * C.FLOOR_HEIGHT + C.CROWN_HEIGHT) * C.MM + 3;
/** Longest the shadow box is allowed to run along the sun ray, either way. */
const SHADOW_REACH_MAX = 900;

/** Below this gap from its target a louvre is set exactly on it, so it comes to rest. */
const SETTLE = 5e-4;

const WARM = new THREE.Color(0xff8c3a);
const NEUTRAL = new THREE.Color(0xffeccf); // a touch warm even at noon, so it reads as sunlight
// The sky's horizon haze -- also the fog colour, which the foot of the sky fades into.
const HAZE_HOT = new THREE.Color(0xc9d6e2);
const HAZE_DUSK = new THREE.Color(0x9c8c88);
const HAZE_DAY = new THREE.Color(0xc6d0da);
const HAZE_NIGHT = new THREE.Color(0x141b29);
const HAZE_STORM = new THREE.Color(0x6a727b);
// Overhead, where the sky is a graded dome: at night and in the storm.
const ZENITH_NIGHT = new THREE.Color(0x03060f);
const ZENITH_STORM = new THREE.Color(0x3a424b);
const HEMI_SKY_STORM = new THREE.Color(0xa3adb8);
const HEMI_SKY_DAY = new THREE.Color(0xbcd8f2);
const HEMI_SKY_DUSK = new THREE.Color(0x2f3648);
const HEMI_SKY_NIGHT = new THREE.Color(0x26314d);
const HAZY_SUN = new THREE.Color(0xfff6ea);
const MOON = new THREE.Color(0xa9bbff);
const DISC_LOW = new THREE.Color(0xffa860);
const DISC_HIGH = new THREE.Color(0xfff4dc);

/** Unit vector toward a point in the sky, from azimuth and elevation in degrees. */
function skyDirection(out, azimuthDeg, elevationDeg) {
  const az = azimuthDeg * DEG;
  const el = elevationDeg * DEG;
  return out.set(Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el)).normalize();
}

export function createSunController({
  scene,
  camera,
  controls,
  sunLight,
  hemiLight,
  ambientLight,
  facade,
  sky,
}) {
  const gaps = C.ARM_COUNT;
  /** One state per gap of each module, module by module: 0 = closed, 1 = open. */
  const count = C.MODULE_COUNT * gaps;

  const states = new Float32Array(count).fill(1);
  const targets = new Float32Array(count).fill(1);

  const closedAngle = C.BLADE_CLOSED_ANGLE_DEG * DEG;
  const travel = C.BLADE_OPEN_ANGLE_DEG * DEG - closedAngle;
  /** Each gap's opening angle for the current sun: open until the first answer is in. */
  const gapAngles = new Float32Array(gaps).fill(C.BLADE_OPEN_ANGLE_DEG * DEG);
  const gapTargets = new Float32Array(gaps);

  /** Toward the sun (or, at night, the moon): whatever lights the scene. */
  const sunDir = new THREE.Vector3(0, 1, 0);
  /** The sun in module-local terms: +X along the facade, +Y up, +Z out of it. */
  const sunLocal = new THREE.Vector3();
  const toModule = facade.faceQuat.clone().invert();

  const hemiColor = new THREE.Color();

  /** What the sky shows, set by each scene's light rig (see sky.js). */
  const look = {
    sun: sunDir,
    turbidity: C.HOT_SKY_TURBIDITY,
    rayleigh: C.HOT_SKY_RAYLEIGH,
    mie: C.SKY_MIE,
    mieG: C.SKY_MIE_G,
    sunDisc: 1,
    clouds: C.SKY_CLOUDS,
    cloudDensity: C.SKY_CLOUD_DENSITY,
    gain: C.SKY_GAIN,
    horizon: new THREE.Color(),
    zenith: new THREE.Color(),
    gradient: 0,
    overcast: 0,
  };

  const sunDisc = buildSunDisc();
  scene.add(sunDisc);

  /** Solar azimuth/elevation for a decimal hour (local solar time) on the June solstice. */
  function solarAngles(hour) {
    const H = (hour - 12) * 15 * DEG;
    const phi = SITE_LATITUDE_DEG * DEG;
    const dec = SOLAR_DECLINATION_DEG * DEG;

    const north = Math.sin(dec) * Math.cos(phi) - Math.cos(dec) * Math.sin(phi) * Math.cos(H);
    const east = -Math.cos(dec) * Math.sin(H);
    const up = Math.sin(dec) * Math.sin(phi) + Math.cos(dec) * Math.cos(phi) * Math.cos(H);

    let az = Math.atan2(east, north) / DEG;
    if (az < 0) az += 360;
    return { azimuth: az, elevation: Math.asin(clampSigned(up)) / DEG };
  }

  function update(dt, params) {
    let elevation;
    if (params.mode === 'hot') {
      elevation = params.elevation;
      skyDirection(sunDir, params.azimuth, elevation);
      lightHotAfternoon(params);
    } else if (params.mode === 'night') {
      elevation = C.MOON_ELEVATION;
      skyDirection(sunDir, C.MOON_AZIMUTH, elevation);
      lightNight();
    } else {
      elevation = C.DAY_SUN_ELEVATION;
      skyDirection(sunDir, C.DAY_SUN_AZIMUTH, elevation);
      if (params.mode === 'storm') lightStorm();
      else lightNormalDay();
    }
    const storm = params.mode === 'storm';
    // The fog is the sky's horizon haze, so the far ground melts into it.
    scene.fog.color.copy(look.horizon);
    sky.set(look);
    sky.update(dt);
    scene.fog.near = storm ? C.STORM_FOG_NEAR : C.FOG_NEAR;
    scene.fog.far = storm ? C.STORM_FOG_FAR : C.FOG_FAR;

    fitShadow(elevation * DEG);

    // --- Louvre targets ---
    if (params.manualOverride) {
      targets.fill(params.manualState);
    } else if (params.mode === 'hot') {
      computeTargets(params);
    } else {
      // No harsh sun to keep out: open for daylight and view. In the storm the
      // slats stand edge-on to the wind, so it passes through them.
      targets.fill(1);
    }

    // The demo cycle carries its own easing and holds, and every louvre must
    // turn in absolute sync -- so it bypasses the damping entirely.
    if (params.autoAnimate) {
      states.fill(params.manualState);
      return states;
    }

    // --- Damped approach, so the slats ease to a new angle and then stop ---
    const k = 1 - Math.exp(-dt / C.BLADE_RESPONSE_TAU);
    for (let i = 0; i < count; i++) {
      const d = targets[i] - states[i];
      states[i] = Math.abs(d) < SETTLE ? targets[i] : states[i] + d * k;
    }

    return states;
  }

  /* -------------------------------------------------------------- *
   * The light rigs, one per scene
   * -------------------------------------------------------------- */

  /** Strong sun where the user puts it; weak fill beside it, so sunlit faces stand out. */
  function lightHotAfternoon(params) {
    const el = params.elevation * DEG;
    const above = Math.max(0, Math.sin(el));
    const dayness = clamp01(params.elevation / 18);
    // Fades the sun in over its first few degrees rather than switching it on at 0.
    const risen = clamp01(params.elevation / 3);

    sunLight.color.copy(WARM).lerp(NEUTRAL, dayness);
    sunLight.intensity = C.SUN_INTENSITY * Math.pow(above, 0.5) * risen;
    sunLight.visible = params.elevation > 0;

    hemiColor.copy(HEMI_SKY_DUSK).lerp(HEMI_SKY_DAY, dayness);
    hemiLight.color.copy(hemiColor);
    hemiLight.intensity = lerp(C.FILL_HEMI_DUSK, C.FILL_HEMI_DAY, dayness);
    ambientLight.intensity = C.FILL_AMBIENT;
    scene.environmentIntensity = lerp(C.FILL_ENV_DUSK, C.FILL_ENV_DAY, dayness);

    // A clear sky, hazier and redder as the sun drops.
    look.turbidity = lerp(C.DUSK_SKY_TURBIDITY, C.HOT_SKY_TURBIDITY, dayness);
    look.rayleigh = lerp(C.DUSK_SKY_RAYLEIGH, C.HOT_SKY_RAYLEIGH, dayness);
    look.mie = C.SKY_MIE;
    look.sunDisc = 1;
    look.clouds = C.SKY_CLOUDS;
    look.gradient = 0;
    look.overcast = 0;
    look.horizon.copy(HAZE_DUSK).lerp(HAZE_HOT, dayness);

    // The sun in the sky: always the same distance out along the ray from the
    // eye, so it sits at infinity however the camera moves.
    sunDisc.visible = params.elevation > -1;
    sunDisc.position.copy(camera.position).addScaledVector(sunDir, C.SUN_DISC_DISTANCE);
    sunDisc.material.color.copy(DISC_LOW).lerp(DISC_HIGH, dayness);
  }

  /** A hazy day: a weak, soft sun and a bright even sky, so nothing glares. */
  function lightNormalDay() {
    sunLight.color.copy(HAZY_SUN);
    sunLight.intensity = C.SUN_INTENSITY * C.DAY_SUN_SHARE;
    sunLight.visible = true;

    hemiLight.color.copy(HEMI_SKY_DAY);
    hemiLight.intensity = C.DAY_FILL_HEMI;
    ambientLight.intensity = C.DAY_FILL_AMBIENT;
    scene.environmentIntensity = C.DAY_FILL_ENV;

    // A milky sky, and no sun disc: nothing glares.
    look.turbidity = C.DAY_SKY_TURBIDITY;
    look.rayleigh = C.DAY_SKY_RAYLEIGH;
    look.mie = C.DAY_SKY_MIE;
    look.sunDisc = 0;
    look.clouds = C.DAY_SKY_CLOUDS;
    look.gradient = 0;
    look.overcast = 0;
    look.horizon.copy(HAZE_DAY);
    sunDisc.visible = false;
  }

  /** A faint cool moon and a dark sky. */
  function lightNight() {
    sunLight.color.copy(MOON);
    sunLight.intensity = C.MOON_INTENSITY;
    sunLight.visible = true;

    hemiLight.color.copy(HEMI_SKY_NIGHT);
    hemiLight.intensity = C.NIGHT_FILL_HEMI;
    ambientLight.intensity = C.NIGHT_FILL_AMBIENT;
    scene.environmentIntensity = C.NIGHT_FILL_ENV;

    look.sunDisc = 0;
    look.gradient = 1;
    look.overcast = 0;
    look.horizon.copy(HAZE_NIGHT);
    look.zenith.copy(ZENITH_NIGHT);
    sunDisc.visible = false;
  }

  /** Overcast: no sun at all, just a low grey sky. */
  function lightStorm() {
    sunLight.visible = false;

    hemiLight.color.copy(HEMI_SKY_STORM);
    hemiLight.intensity = C.STORM_FILL_HEMI;
    ambientLight.intensity = C.STORM_FILL_AMBIENT;
    scene.environmentIntensity = C.STORM_FILL_ENV;

    look.sunDisc = 0;
    look.gradient = 1;
    look.overcast = 1;
    look.horizon.copy(HAZE_STORM);
    look.zenith.copy(ZENITH_STORM);
    sunDisc.visible = false;
  }

  /* -------------------------------------------------------------- *
   * Louvre angles for the hot afternoon
   * -------------------------------------------------------------- */

  /**
   * Tracing the slats is the costly part, so it runs in a worker and the frame
   * loop never waits on it: whenever the last answer is back and the sun has
   * moved since, the new sun goes off; its answer lands a few frames later and
   * the louvres ease to it. Without a worker it runs here instead.
   */
  const requestedSun = new THREE.Vector3(NaN, NaN, NaN);
  let tracing = false;
  let worker = null;
  try {
    worker = new LouvreWorker();
    worker.onmessage = ({ data }) => {
      gapAngles.set(data);
      tracing = false;
    };
    worker.onerror = () => {
      worker = null;
      tracing = false;
      requestedSun.set(NaN, NaN, NaN); // trace again, here
    };
  } catch {
    worker = null;
  }

  /** Peak solar elevation in degrees (at solar noon on the June solstice). */
  const NOON_ELEVATION_DEG = 69.7;

  /**
   * Modulates the louvre opening based on sunlight intensity hitting the facade.
   * In early morning (low intensity), the louvres close slightly; at solar noon
   * (peak intensity), they close down to a small gap opening (C.LOUVRE_MIN_GAP_OPENING);
   * as the sun descends toward evening (from 12 to 7 or 8 PM), they gradually open back up.
   * All six gaps of each module share this single unified target.
   */
  function computeTargets(params) {
    sunLocal.copy(sunDir).applyQuaternion(toModule);

    let sharedTarget = 1.0;
    if (params.elevation > 0 && sunLocal.z > 0) {
      const elRad = params.elevation * DEG;
      // Normalized sunlight intensity: 0 at horizon, 1.0 at peak solar noon.
      const intensity = clamp01(Math.sin(elRad) / Math.sin(NOON_ELEVATION_DEG * DEG));
      const minOpening = C.LOUVRE_MIN_GAP_OPENING ?? 0.10;
      sharedTarget = 1.0 - (1.0 - minOpening) * Math.pow(intensity, 1.25);
    }

    const sharedAngle = closedAngle + sharedTarget * travel;
    gapAngles.fill(sharedAngle);
    gapTargets.fill(sharedTarget);
    targets.fill(sharedTarget);
  }

  /* -------------------------------------------------------------- *
   * Shadow box, fitted to the view
   * -------------------------------------------------------------- */

  const UP = new THREE.Vector3(0, 1, 0);
  const ORIGIN = new THREE.Vector3();
  const lookM = new THREE.Matrix4();
  const lightX = new THREE.Vector3();
  const lightY = new THREE.Vector3();
  const center = new THREE.Vector3();
  const STEP = Math.log(1.25);

  /**
   * Centre the shadow box on the orbit target and size it to the orbit
   * distance, so the louvre shadows are sharp close up and the tower's own
   * shadow lands on the ground from further out. The box runs along the ray
   * from above the roof to the ground, whatever the light's height.
   */
  function fitShadow(el) {
    const shadow = sunLight.shadow;
    const cam = shadow.camera;

    const want = THREE.MathUtils.clamp(
      camera.position.distanceTo(controls.target) * C.SHADOW_FIT_PER_DISTANCE,
      C.SHADOW_RADIUS_MIN,
      C.SHADOW_RADIUS_MAX
    );
    // Whole 25% steps, so zooming re-fits the box now and then, not every frame.
    const radius = Math.min(
      C.SHADOW_RADIUS_MAX,
      C.SHADOW_RADIUS_MIN * Math.exp(Math.ceil(Math.log(want / C.SHADOW_RADIUS_MIN) / STEP - 1e-9) * STEP)
    );
    const texel = (2 * radius) / shadow.mapSize.x;

    // Snap the centre to whole shadow texels across the ray, in the same frame
    // the shadow camera builds for itself, so edges hold still while panning.
    center.copy(controls.target);
    lookM.lookAt(sunDir, ORIGIN, UP);
    lightX.setFromMatrixColumn(lookM, 0);
    lightY.setFromMatrixColumn(lookM, 1);
    const cx = center.dot(lightX);
    const cy = center.dot(lightY);
    center
      .addScaledVector(lightX, Math.round(cx / texel) * texel - cx)
      .addScaledVector(lightY, Math.round(cy / texel) * texel - cy);

    // How far along the ray the box must reach: sunward to the roof, away to the ground.
    const sinEl = Math.max(Math.sin(el), Math.sin(4 * DEG));
    const spread = radius * Math.cos(el);
    const toRoof = Math.min(SHADOW_REACH_MAX, (CASTER_TOP - center.y + spread) / sinEl);
    const toGround = Math.min(SHADOW_REACH_MAX, (center.y + spread) / sinEl);

    sunLight.position.copy(center).addScaledVector(sunDir, toRoof + 1);
    sunLight.target.position.copy(center);
    sunLight.target.updateMatrixWorld();

    cam.left = -radius;
    cam.right = radius;
    cam.top = radius;
    cam.bottom = -radius;
    cam.near = 0.5;
    cam.far = toRoof + toGround + 2;
    cam.updateProjectionMatrix();

    // Biases scale with the texel, so neither acne nor floating shadows appear
    // as the box grows and shrinks. bias is in the box's 0..1 depth range.
    shadow.normalBias = texel * 0.8;
    shadow.bias = -(texel * 0.5) / (cam.far - cam.near);
  }

  return { update, solarAngles, states, sunDir };
}

/**
 * The sun as seen in the sky: a bright disc in a soft glow, drawn from a
 * canvas gradient (no image files), added over the sky and never fogged.
 */
function buildSunDisc() {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const g = canvas.getContext('2d');
  const r = size / 2;

  const glow = g.createRadialGradient(r, r, 0, r, r, r);
  glow.addColorStop(0.0, 'rgba(255, 255, 255, 1)');
  glow.addColorStop(0.07, 'rgba(255, 255, 255, 1)'); // the disc itself
  glow.addColorStop(0.1, 'rgba(255, 246, 224, 0.6)');
  glow.addColorStop(0.3, 'rgba(255, 232, 196, 0.18)');
  glow.addColorStop(1.0, 'rgba(255, 220, 170, 0)');
  g.fillStyle = glow;
  g.fillRect(0, 0, size, size);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;

  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      fog: false,
      toneMapped: false,
    })
  );
  const s = 2 * C.SUN_DISC_DISTANCE * Math.tan((C.SUN_DISC_ANGLE_DEG * DEG) / 2);
  sprite.scale.set(s, s, 1);
  return sprite;
}

function clampSigned(x) {
  return x < -1 ? -1 : x > 1 ? 1 : x;
}
