/**
 * Entry point: assemble the scene, then run the frame loop.
 */

import * as THREE from 'three';
import * as C from './constants.js';
import { createScene } from './sceneSetup.js';
import { buildTower } from './tower.js';
import { buildFacade } from './facade.js';
import { createSunController } from './sunController.js';
import { createCameraPresets } from './cameraPresets.js';
import { createUI } from './ui.js';

const canvas = document.getElementById('view');
const { renderer, scene, camera, controls, sunLight, hemiLight } = createScene(canvas);

const tower = buildTower(scene);
const facade = buildFacade(scene);

const sun = createSunController({ scene, sunLight, hemiLight, facade });

const presets = createCameraPresets({
  camera,
  controls,
  facade,
  towerHeight: tower.totalHeight,
});

const ui = createUI({
  onPreset: (name) => presets.goTo(name),
  solarAngles: sun.solarAngles,
});

presets.goTo('tower');

/* ------------------------------------------------------------------ *
 * Adaptive shadow quality
 * ------------------------------------------------------------------ */

let shadowStep = 0;
let starvedFor = 0;

function considerShadowDowngrade(fps, dt) {
  if (shadowStep >= C.SHADOW_MAP_SIZES.length - 1) return;

  if (fps < C.SHADOW_DEGRADE_FPS) {
    starvedFor += dt;
    if (starvedFor >= C.SHADOW_DEGRADE_SECONDS) {
      shadowStep++;
      starvedFor = 0;
      const size = C.SHADOW_MAP_SIZES[shadowStep];
      sunLight.shadow.mapSize.set(size, size);
      // Drop the old target so three rebuilds it at the new size.
      sunLight.shadow.map?.dispose();
      sunLight.shadow.map = null;
    }
  } else {
    starvedFor = 0;
  }
}

/* ------------------------------------------------------------------ *
 * Frame loop
 * ------------------------------------------------------------------ */

const timer = new THREE.Timer();

let fpsAccum = 0;
let fpsFrames = 0;
let fps = 60;
let statsTimer = 0;
let movingModules = 0;

renderer.setAnimationLoop(() => {
  timer.update();
  const dt = Math.min(timer.getDelta(), 0.1);

  presets.update(dt);
  if (!presets.isAnimating()) controls.update();

  const states = sun.update(dt, ui.params);
  movingModules = facade.updateBlades(states);

  renderer.render(scene, camera);

  // --- Stats, sampled rather than written every frame ---
  fpsAccum += dt;
  fpsFrames++;
  statsTimer += dt;

  if (statsTimer >= 0.5) {
    fps = fpsFrames / fpsAccum;
    considerShadowDowngrade(fps, statsTimer);

    ui.setStats({
      fps,
      blades: facade.bladeCount,
      moving: movingModules,
      calls: renderer.info.render.calls,
      shadow: C.SHADOW_MAP_SIZES[shadowStep],
    });

    fpsAccum = 0;
    fpsFrames = 0;
    statsTimer = 0;
  }
});
