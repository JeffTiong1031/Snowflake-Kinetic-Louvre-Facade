/**
 * Animated camera presets. Tweens both the eye and the orbit target with a
 * smootherstep ease, so switching views reads as a move rather than a cut.
 */

import * as THREE from 'three';
import * as C from './constants.js';

const smootherstep = (t) => t * t * t * (t * (t * 6 - 15) + 10);

export function createCameraPresets({ camera, controls, facade, towerHeight }) {
  const normal = facade.facadeNormal;

  /** A module near the middle of the grid, for the close-up. */
  const hero = facade.modulePos[Math.floor(C.GRID_ROWS / 2) * C.GRID_COLS + Math.floor(C.GRID_COLS / 2)];

  const presets = {
    tower: {
      position: new THREE.Vector3(78, 74, -148),
      target: new THREE.Vector3(0, towerHeight * 0.46, 0),
    },
    bay: {
      position: facade.fieldCenter
        .clone()
        .addScaledVector(normal, 15)
        .add(new THREE.Vector3(5.5, 4.5, 0)),
      target: facade.fieldCenter.clone(),
    },
    module: {
      position: hero.clone().addScaledVector(normal, 2.6).add(new THREE.Vector3(0.35, 0.3, 0)),
      target: hero.clone(),
    },
  };

  const fromPos = new THREE.Vector3();
  const fromTarget = new THREE.Vector3();
  let active = null;
  let elapsed = 0;

  function goTo(name) {
    const preset = presets[name];
    if (!preset) return;
    fromPos.copy(camera.position);
    fromTarget.copy(controls.target);
    active = preset;
    elapsed = 0;
    controls.enabled = false;
  }

  function update(dt) {
    if (!active) return;

    elapsed += dt;
    const t = Math.min(1, elapsed / C.PRESET_TWEEN_SECONDS);
    const e = smootherstep(t);

    camera.position.lerpVectors(fromPos, active.position, e);
    controls.target.lerpVectors(fromTarget, active.target, e);

    if (t >= 1) {
      active = null;
      controls.enabled = true;
    }
  }

  /** True while a tween owns the camera, so the main loop can skip damping. */
  const isAnimating = () => active !== null;

  return { goTo, update, isAnimating, presets };
}
