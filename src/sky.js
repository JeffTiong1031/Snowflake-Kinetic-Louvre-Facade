/**
 * The sky, and what the building reflects.
 *
 * By day the sky is three's analytic daylight model (Preetham), sun and all,
 * with a little cloud. At night and in the storm it is a graded dome instead,
 * darker overhead -- in the storm, mottled by the cloud deck.
 *
 * The environment map -- what glass and metal reflect, and the soft light
 * they pick up from the sky -- is rendered from this same sky over a dark
 * ground, so reflections always match what is overhead. It is re-rendered
 * only when the sky changes, and at most every ENV_MIN_INTERVAL while the sun
 * is being dragged.
 *
 * The foot of the sky fades into the fog colour, so the fogged far ground
 * meets the horizon without a seam. All generated in code: no image files.
 */

import * as THREE from 'three';
import { Sky } from 'three/examples/jsm/objects/Sky.js';
import * as C from './constants.js';

/** Brightest the sky may get (the sun disc), so the half-float frame buffer never overflows. */
const SKY_CLAMP = 48;

/** Least time, seconds, between two environment re-renders while the sky keeps changing. */
const ENV_MIN_INTERVAL = 0.25;

const SKY_PARS = /* glsl */ `
uniform float skyGain;
uniform vec3 horizonColor;
uniform float horizonBlend;
uniform float gradient;
uniform vec3 zenithColor;
uniform float overcast;
uniform float saturation;
`;

const SKY_OUT = /* glsl */ `
texColor = min( texColor * skyGain, vec3( ${SKY_CLAMP.toFixed(1)} ) );

// Night and storm: a graded dome, darker overhead; in the storm, mottled by the cloud deck.
vec3 dome = mix( horizonColor, zenithColor, pow( clamp( direction.y, 0.0, 1.0 ), 0.55 ) );
float deck = fbm( direction.xz / ( max( direction.y, 0.0 ) + 0.12 ) * 1.6 + time * 0.004 );
dome *= mix( 1.0, 0.7 + 0.6 * deck, overcast );
texColor = mix( texColor, dome, gradient );
texColor = mix( vec3( dot( texColor, vec3( 0.2126, 0.7152, 0.0722 ) ) ), texColor, saturation );

// The foot of the sky fades into the fog, so the fogged far ground meets it cleanly.
texColor = mix( horizonColor, texColor, smoothstep( -0.01, horizonBlend, direction.y ) );
gl_FragColor = vec4( texColor, 1.0 );
`;

/** The sky's own uniforms that a look sets, by the look's name for them. */
const LOOK_UNIFORMS = {
  turbidity: 'turbidity',
  rayleigh: 'rayleigh',
  mie: 'mieCoefficient',
  mieG: 'mieDirectionalG',
  sunDisc: 'showSunDisc',
  clouds: 'cloudCoverage',
  cloudDensity: 'cloudDensity',
  gain: 'skyGain',
  gradient: 'gradient',
  overcast: 'overcast',
};

function patchSky(material) {
  Object.assign(material.uniforms, {
    skyGain: { value: 1 },
    horizonColor: { value: new THREE.Color() },
    horizonBlend: { value: C.SKY_HORIZON_BLEND },
    gradient: { value: 0 },
    zenithColor: { value: new THREE.Color() },
    overcast: { value: 0 },
    saturation: { value: 1 },
  });
  const source = material.fragmentShader;
  material.fragmentShader = source
    .replace('uniform float time;', `uniform float time;\n${SKY_PARS}`)
    .replace('gl_FragColor = vec4( texColor, 1.0 );', SKY_OUT);
  if (!material.fragmentShader.includes('uniform float skyGain;') || !material.fragmentShader.includes('mix( horizonColor, texColor')) {
    console.warn('sky.js: the Sky shader has changed; the horizon blend and night dome are missing.');
  }
}

/**
 * @returns set(look) -- look: { sun (unit Vector3), turbidity, rayleigh, mie,
 *   mieG, sunDisc (0/1), clouds, cloudDensity, gain, horizon (Color, also the
 *   fog colour), zenith (Color), gradient (0 daylight .. 1 dome), overcast };
 *   update(dt) once a frame.
 */
export function createSky(renderer, scene, camera) {
  const sky = new Sky();
  patchSky(sky.material);
  // Drawn at the far plane wherever it is, so it only has to enclose the eye.
  sky.scale.setScalar(C.SKY_DOME_SIZE);
  sky.frustumCulled = false;
  sky.userData.noAO = true;
  scene.add(sky);
  scene.background = null;

  // The environment: the same sky, without the sun disc, over a dark ground.
  const envScene = new THREE.Scene();
  const envSky = new Sky();
  patchSky(envSky.material);
  envSky.scale.setScalar(50);
  envScene.add(envSky);

  const envGround = new THREE.Mesh(
    new THREE.CircleGeometry(40, 32).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial()
  );
  envGround.position.y = -1;
  envScene.add(envGround);

  const pmrem = new THREE.PMREMGenerator(renderer);
  let envTarget = null;
  let dirty = true;
  let sinceEnv = Infinity;

  function renderEnvironment() {
    const from = sky.material.uniforms;
    const to = envSky.material.uniforms;
    for (const name in from) {
      const value = from[name].value;
      if (value && value.copy) to[name].value.copy(value);
      else to[name].value = value;
    }
    to.showSunDisc.value = 0;
    to.saturation.value = C.ENV_SATURATION;
    envGround.material.color.copy(from.horizonColor.value).multiplyScalar(C.ENV_GROUND_SHARE);

    const next = pmrem.fromScene(envScene, 0, 0.1, 100);
    scene.environment = next.texture;
    envTarget?.dispose();
    envTarget = next;
  }

  function set(look) {
    const u = sky.material.uniforms;
    let changed = false;
    for (const key in LOOK_UNIFORMS) {
      const uniform = u[LOOK_UNIFORMS[key]];
      if (uniform.value !== look[key]) {
        uniform.value = look[key];
        changed = true;
      }
    }
    for (const [uniform, value] of [
      [u.sunPosition, look.sun],
      [u.horizonColor, look.horizon],
      [u.zenithColor, look.zenith],
    ]) {
      if (!uniform.value.equals(value)) {
        uniform.value.copy(value);
        changed = true;
      }
    }
    if (changed) dirty = true;
  }

  function update(dt) {
    sky.position.copy(camera.position);
    sky.material.uniforms.time.value += dt;
    sinceEnv += dt;
    if (dirty && sinceEnv >= ENV_MIN_INTERVAL) {
      renderEnvironment();
      dirty = false;
      sinceEnv = 0;
    }
  }

  return { set, update };
}
