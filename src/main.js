/**
 * Entry point: assemble the scene, then run the frame loop.
 */

import * as THREE from 'three';
import * as C from './constants.js';
import { createScene } from './sceneSetup.js';
import { buildTower } from './tower.js';
import { buildFacade } from './facade.js';
import { buildOffices } from './office.js';
import { buildStreetLights } from './streetLights.js';
import { createWeather } from './weather.js';
import { createExplainMode } from './explain.js';
import { createDetailController } from './detail.js';
import { createSunController } from './sunController.js';
import { createCameraPresets } from './cameraPresets.js';
import { createPostFX } from './postfx.js';
import { createUI } from './ui.js';

const canvas = document.getElementById('view');
const { renderer, scene, camera, controls, sunLight, hemiLight, ambientLight, city, sky } =
  createScene(canvas);

const tower = buildTower(scene);
const facade = buildFacade(scene);
const offices = buildOffices(scene);
const streetLights = buildStreetLights(scene, city.isBuilding);
const weather = createWeather(scene, camera, controls);
const postfx = createPostFX(renderer, scene, camera, controls);

const lerp = (a, b, t) => a + (b - a) * t;

/** Steps a 0..1 level toward its target, taking `seconds` for the whole way. */
function ramp(level, target, dt, seconds) {
  const step = dt / seconds;
  return target > level ? Math.min(target, level + step) : Math.max(target, level - step);
}

/**
 * Night lighting -- the tower's lit floors, the neighbours' lit windows --
 * comes on over NIGHT_FADE_SECONDS when the Night scene is picked, and goes
 * off the same way. The street lamps come on at night and in the storm's
 * gloom, and fade the same. Bloom follows them: by day only the sun and its
 * glints glow; once the lamps and windows are lit, they do.
 */
let nightLevel = 0;
let lampLevel = 0;

function updateNightLights(dt, mode) {
  const lamps = mode === 'night' || mode === 'storm' ? 1 : 0;
  if (lampLevel !== lamps) {
    lampLevel = ramp(lampLevel, lamps, dt, C.NIGHT_FADE_SECONDS);
    streetLights.setLevel(lampLevel);
  }

  const night = mode === 'night' ? 1 : 0;
  if (nightLevel !== night) {
    nightLevel = ramp(nightLevel, night, dt, C.NIGHT_FADE_SECONDS);
    tower.setNightLevel(nightLevel);
    city.setNightLevel(nightLevel);
  }

  const glow = Math.max(nightLevel, lampLevel);
  postfx.setBloom(
    lerp(C.BLOOM_DAY_STRENGTH, C.BLOOM_NIGHT_STRENGTH, glow),
    lerp(C.BLOOM_DAY_THRESHOLD, C.BLOOM_NIGHT_THRESHOLD, glow)
  );
}

/** The storm's rain and wind build over STORM_FADE_SECONDS, and die away the same. */
let stormLevel = 0;

function updateWeather(dt, mode) {
  stormLevel = ramp(stormLevel, mode === 'storm' ? 1 : 0, dt, C.STORM_FADE_SECONDS);
  weather.update(dt, stormLevel);
}

const detail = createDetailController({
  camera,
  offices,
  glassMaterial: tower.glassMaterial,
  towerHeight: tower.totalHeight,
});

const sun = createSunController({
  scene,
  camera,
  controls,
  sunLight,
  hemiLight,
  ambientLight,
  facade,
  sky,
  city,
});

const presets = createCameraPresets({
  camera,
  controls,
  facade,
  towerHeight: tower.totalHeight,
});

/**
 * The explanation walks through one module under plain daylight, whatever
 * scene is picked; leaving it hands the louvres back to the scene from the
 * pose it left them in.
 */
const explain = createExplainMode({
  scene,
  camera,
  canvas,
  facade,
  flyTo: presets.flyTo,
  onExit: () => {
    sun.states.set(explain.states);
    ui.setExplaining(false);
  },
});
const EXPLAIN_SCENE = { mode: 'day', manualOverride: false, manualState: 1, autoAnimate: false };

const ui = createUI({
  onPreset: (name) => {
    explain.exit();
    presets.goTo(name);
  },
  onExplain: () => {
    if (explain.isActive()) {
      explain.exit();
    } else {
      explain.enter(sun.states);
      ui.setExplaining(true);
    }
  },
  onSceneChange: () => explain.exit(),
  solarAngles: sun.solarAngles,
});

presets.goTo('tower');

// Dev server only -- stripped from production builds: lets scripted
// screenshots place the camera exactly.
if (import.meta.env.DEV) window.__snowflake = { camera, controls, presets, sun, facade };

/* ------------------------------------------------------------------ *
 * Adaptive quality
 * ------------------------------------------------------------------ */

/**
 * When the frame rate sags for a while, step down: ambient occlusion first,
 * then shadow resolution, then bloom, then shadows again. ?quality=high in
 * the address pins the top step (for presentation screenshots); ?quality=low
 * starts at the bottom.
 */
const QUALITY_STEPS = [
  { post: 2, shadow: 0 },
  { post: 1, shadow: 1 },
  { post: 0, shadow: 1 },
  { post: 0, shadow: 2 },
];
const pinnedQuality = new URLSearchParams(window.location.search).get('quality');
let qualityStep =
  pinnedQuality === 'high' ? 0 : pinnedQuality === 'low' ? QUALITY_STEPS.length - 1 : 1;
let starvedFor = 0;

function applyQuality() {
  const step = QUALITY_STEPS[qualityStep];
  postfx.setQuality(step.post);
  const size = C.SHADOW_MAP_SIZES[step.shadow];
  if (sunLight.shadow.mapSize.x !== size) {
    sunLight.shadow.mapSize.set(size, size);
    // Drop the old target so three rebuilds it at the new size.
    sunLight.shadow.map?.dispose();
    sunLight.shadow.map = null;
  }
}
applyQuality();

function considerDowngrade(fps, dt) {
  if (pinnedQuality === 'high' || qualityStep >= QUALITY_STEPS.length - 1) return;

  if (fps < C.SHADOW_DEGRADE_FPS) {
    starvedFor += dt;
    if (starvedFor >= C.SHADOW_DEGRADE_SECONDS) {
      qualityStep++;
      starvedFor = 0;
      applyQuality();
    }
  } else {
    starvedFor = 0;
  }
}

/* ------------------------------------------------------------------ *
 * Actuator motion profile
 * ------------------------------------------------------------------ */

/**
 * Open fraction over one cycle, phase 0..1: hold closed, stroke open, hold
 * open, stroke closed. Each stroke is half a sine wave -- zero speed at both
 * ends -- so the louvres ease in and out of the holds like a pneumatic ram
 * cushioning at the end of its travel.
 */
function actuatorStroke(phase) {
  const hold = C.ANIMATE_DWELL_FRACTION;
  const stroke = 0.5 - hold;

  if (phase < hold) return 0;
  if (phase < hold + stroke) return 0.5 - 0.5 * Math.cos(((phase - hold) / stroke) * Math.PI);
  if (phase < 2 * hold + stroke) return 1;
  return 0.5 + 0.5 * Math.cos(((phase - 2 * hold - stroke) / stroke) * Math.PI);
}

/* ------------------------------------------------------------------ *
 * Frame loop
 * ------------------------------------------------------------------ */

// Pre-compile scene materials and run a warmup frame so shader compilation
// completes before the stats timer and animation loop start.
renderer.compile(scene, camera);
postfx.render();
renderer.info.reset();

const timer = new THREE.Timer();

let fpsAccum = 0;
let fpsFrames = 0;
let fps = 60;
let statsTimer = 0;
let movingModules = 0;
let animPhase = 0;

renderer.setAnimationLoop(() => {
  timer.update();
  const dt = Math.min(timer.getDelta(), 0.1);

  city.updateCars(dt);
  presets.update(dt);
  if (!presets.isAnimating()) controls.update();

  const explaining = explain.isActive();
  const sceneParams = explaining ? EXPLAIN_SCENE : ui.params;

  // Demo animation: closed -> open -> closed, time-based, every louvre in sync.
  if (ui.params.autoAnimate && !explaining) {
    animPhase = (animPhase + dt / C.ANIMATE_PERIOD_SECONDS) % 1;
    ui.setAnimatedState(actuatorStroke(animPhase));
  }

  detail.update();
  updateNightLights(dt, sceneParams.mode);
  updateWeather(dt, sceneParams.mode);

  const states = sun.update(dt, sceneParams);
  movingModules = facade.updateBlades(explaining ? explain.update(dt) : states);
  if (explaining) explain.afterBlades();

  renderer.info.reset();
  postfx.render();

  // --- Stats, sampled rather than written every frame ---
  fpsAccum += dt;
  fpsFrames++;
  statsTimer += dt;

  if (statsTimer >= 0.5) {
    fps = fpsFrames / fpsAccum;
    considerDowngrade(fps, statsTimer);

    ui.setStats({
      fps,
      blades: facade.bladeCount,
      moving: movingModules,
      calls: renderer.info.render.calls,
      shadow: C.SHADOW_MAP_SIZES[QUALITY_STEPS[qualityStep].shadow],
    });

    fpsAccum = 0;
    fpsFrames = 0;
    statsTimer = 0;
  }
});
