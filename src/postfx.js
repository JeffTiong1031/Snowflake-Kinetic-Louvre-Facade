/**
 * Post-processing.
 *
 * The scene renders into a linear, high-range frame buffer, multisampled so
 * edges stay smooth. Ambient occlusion then darkens the creases where
 * surfaces meet -- slats against spines, mullions against glass, buildings on
 * the ground; bloom lets the brightest things -- the sun, glints off glass,
 * lamps and lit windows at night -- glow past their edges; and the result is
 * tone mapped for the screen.
 *
 * setQuality steps the effects down when the frame rate sags: 2 both, 1 bloom
 * only, 0 none -- the scene then renders straight to the screen.
 */

import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/examples/jsm/postprocessing/GTAOPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import * as C from './constants.js';

export function createPostFX(renderer, scene, camera, controls) {
  const composer = new EffectComposer(
    renderer,
    new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: C.POST_MSAA_SAMPLES })
  );

  const ao = new GTAOPass(scene, camera, 1, 1);
  ao.blendIntensity = C.AO_INTENSITY;
  ao.updateGtaoMaterial({ radius: C.AO_RADIUS_MIN, distanceExponent: 1, thickness: 1, scale: 1, samples: 16 });
  ao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 4, rings: 2, samples: 16 });

  // Half resolution: the occlusion is soft anyway, and it is the costliest pass.
  const aoSetSize = ao.setSize.bind(ao);
  ao.setSize = (w, h) => aoSetSize(Math.max(1, Math.ceil(w / 2)), Math.max(1, Math.ceil(h / 2)));

  // GTAOPass leaves points and lines out of the depth it shades from. Sprites,
  // and anything marked userData.noAO -- the see-through sensor frames of the
  // explanation -- stay out too: they are not surfaces to shade around.
  // (Replaces a private method of three 0.185's GTAOPass.)
  ao._overrideVisibility = function () {
    const cache = this._visibilityCache;
    this.scene.traverse((object) => {
      if (
        object.visible &&
        (object.isPoints || object.isLine || object.isLine2 || object.isSprite || object.userData.noAO)
      ) {
        object.visible = false;
        cache.push(object);
      }
    });
  };

  const bloom = new UnrealBloomPass(
    new THREE.Vector2(1, 1),
    C.BLOOM_DAY_STRENGTH,
    C.BLOOM_RADIUS,
    C.BLOOM_DAY_THRESHOLD
  );

  composer.addPass(new RenderPass(scene, camera));
  composer.addPass(ao);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());

  function resize() {
    composer.setPixelRatio(renderer.getPixelRatio());
    composer.setSize(window.innerWidth, window.innerHeight);
  }
  resize();
  window.addEventListener('resize', resize);

  let level = 2;
  let aoRadius = C.AO_RADIUS_MIN;

  function setQuality(q) {
    level = q;
    ao.enabled = q >= 2;
    bloom.enabled = q >= 1;
  }

  /** Bloom's strength, and the brightness (linear, before tone mapping) above which things glow. */
  function setBloom(strength, threshold) {
    bloom.strength = strength;
    bloom.threshold = threshold;
  }

  function render() {
    if (level === 0) {
      renderer.render(scene, camera);
      return;
    }
    // The occlusion reaches as far as suits the view: millimetres of slat
    // close up, metres of street from across the city.
    if (ao.enabled) {
      const want = THREE.MathUtils.clamp(
        camera.position.distanceTo(controls.target) * C.AO_RADIUS_PER_DISTANCE,
        C.AO_RADIUS_MIN,
        C.AO_RADIUS_MAX
      );
      if (Math.abs(want - aoRadius) > aoRadius * 0.05) {
        aoRadius = want;
        ao.updateGtaoMaterial({ radius: aoRadius });
      }
    }
    composer.render();
  }

  return { render, setQuality, setBloom };
}
