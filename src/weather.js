/**
 * The storm: heavy rain driven by a strong wind, and trees bending to it.
 *
 * The rain is a single LineSegments draw. Each of RAIN_DROPS streaks is placed
 * in the vertex shader from a fixed random seed, a running offset and a box
 * that rides just ahead of the camera, so the CPU only sets a few uniforms a
 * frame. Drops wrap around inside the box but hold their place in the world,
 * so they do not swing round with the camera as it orbits.
 *
 * Trees sway through a patch to their vertex shaders (swayInWind): everything
 * is pushed downwind by the square of its height above the ground, so a trunk
 * and its crown -- separate meshes -- bend together.
 */

import * as THREE from 'three';
import * as C from './constants.js';

const DEG = Math.PI / 180;

/** Wind uniforms, shared by the rain and every material swayInWind patches. */
const wind = {
  uWindTime: { value: 0 },
  uWindStrength: { value: 0 },
  // Downwind, as (x, z): +X east, -Z north.
  uWindDir: {
    value: new THREE.Vector2(Math.sin(C.WIND_TOWARD_DEG * DEG), -Math.cos(C.WIND_TOWARD_DEG * DEG)),
  },
};

/** Wind strength over time, around 1: slow surges with quicker gusts on top. */
function gustAt(t) {
  return 0.8 + 0.2 * Math.sin(t * 0.9) + 0.12 * Math.sin(t * 2.3 + 1.0);
}

/* ------------------------------------------------------------------ *
 * Trees in the wind
 * ------------------------------------------------------------------ */

const SWAY_PARS = /* glsl */ `
uniform float uWindTime;
uniform float uWindStrength;
uniform vec2 uWindDir;
`;

/** three's project_vertex, with the lean added once the instance is in place. */
const SWAY_PROJECT = /* glsl */ `
vec4 mvPosition = vec4( transformed, 1.0 );
#ifdef USE_BATCHING
  mvPosition = batchingMatrix * mvPosition;
#endif
#ifdef USE_INSTANCING
  mvPosition = instanceMatrix * mvPosition;
  // Each tree on its own phase, from where it stands.
  float swayPhase = dot( instanceMatrix[ 3 ].xz, vec2( 0.131, 0.087 ) );
  float swayGust = 0.8 + 0.2 * sin( uWindTime * 0.9 + swayPhase )
    + 0.12 * sin( uWindTime * 2.3 + 1.0 + swayPhase )
    + 0.1 * sin( uWindTime * 5.1 + swayPhase * 3.0 );
  float swayHeight = max( mvPosition.y, 0.0 );
  mvPosition.xz += uWindDir * ( uWindStrength * swayGust * ${C.TREE_SWAY.toFixed(5)} * swayHeight * swayHeight );
#endif
mvPosition = modelViewMatrix * mvPosition;
gl_Position = projectionMatrix * mvPosition;
`;

/**
 * Lets an instanced material bend in the wind. With no wind blowing it is
 * left exactly where it was, so the calm scenes are untouched.
 */
export function swayInWind(material) {
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, wind); // the same uniform objects, so one write moves every tree
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${SWAY_PARS}`)
      .replace('#include <project_vertex>', SWAY_PROJECT);
  };
}

/* ------------------------------------------------------------------ *
 * Rain
 * ------------------------------------------------------------------ */

const RAIN_VERTEX = /* glsl */ `
attribute float aTail;

uniform vec3 uOffset;
uniform vec3 uCenter;
uniform float uBox;
uniform vec3 uStreakDir;
uniform float uStreak;
uniform float uOpacity;
uniform vec3 uTower;

varying float vAlpha;

void main() {
  // position is the drop's seed in the unit box. Some fall faster than others.
  float speed = 0.8 + 0.4 * fract( position.x * 91.7 + position.z * 37.3 );
  vec3 q = fract( position + uOffset * speed - uCenter / uBox );
  vec3 drop = uCenter + ( q - 0.5 ) * uBox;
  vec3 world = drop - uStreakDir * ( uStreak * aTail );

  // Faded toward the box walls so they never show, and right at the lens.
  vec3 wall = abs( q - 0.5 ) * 2.0;
  float inBox = 1.0 - smoothstep( 0.7, 1.0, max( max( wall.x, wall.y ), wall.z ) );
  float offLens = smoothstep( 0.03, 0.1, distance( drop, cameraPosition ) / uBox );
  // None inside the tower -- its glass would show them -- or under the ground.
  float inTower = step( abs( drop.x ), uTower.x ) * step( abs( drop.z ), uTower.z ) * step( drop.y, uTower.y );
  float aboveGround = step( 0.0, drop.y );

  vAlpha = uOpacity * inBox * offLens * ( 1.0 - inTower ) * aboveGround * mix( 1.0, 0.2, aTail );
  gl_Position = projectionMatrix * viewMatrix * vec4( world, 1.0 );
}
`;

const RAIN_FRAGMENT = /* glsl */ `
uniform vec3 uColor;
varying float vAlpha;

void main() {
  gl_FragColor = vec4( uColor, vAlpha );
  #include <colorspace_fragment>
}
`;

/** Rain offsets wrap at this many box lengths, well inside float precision. */
const OFFSET_WRAP = 256;

/**
 * @returns update(dt, level): level 0..1 brings the storm in -- rain opacity
 *   and wind strength both follow it.
 */
export function createWeather(scene, camera, controls) {
  const n = C.RAIN_DROPS;
  const seeds = new Float32Array(n * 6);
  const tails = new Float32Array(n * 2);
  for (let i = 0; i < n; i++) {
    const x = Math.random();
    const y = Math.random();
    const z = Math.random();
    seeds.set([x, y, z, x, y, z], i * 6);
    tails[i * 2 + 1] = 1; // each drop's second vertex is the end of its streak
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(seeds, 3));
  geometry.setAttribute('aTail', new THREE.BufferAttribute(tails, 1));

  const uniforms = {
    uOffset: { value: new THREE.Vector3() },
    uCenter: { value: new THREE.Vector3() },
    uBox: { value: C.RAIN_BOX_MIN },
    uStreakDir: { value: new THREE.Vector3(0, -1, 0) },
    uStreak: { value: 0 },
    uOpacity: { value: 0 },
    uColor: { value: new THREE.Color(C.RAIN_COLOR) },
    uTower: {
      value: new THREE.Vector3(
        (C.TOWER_WIDTH_X * C.MM) / 2,
        C.FLOOR_COUNT * C.FLOOR_HEIGHT * C.MM,
        (C.TOWER_DEPTH_Z * C.MM) / 2
      ),
    },
  };

  const rain = new THREE.LineSegments(
    geometry,
    new THREE.ShaderMaterial({
      uniforms,
      vertexShader: RAIN_VERTEX,
      fragmentShader: RAIN_FRAGMENT,
      transparent: true,
      depthWrite: false,
    })
  );
  rain.frustumCulled = false; // placed in the shader: its bounds mean nothing
  rain.renderOrder = 1; // after the glass
  rain.visible = false;
  scene.add(rain);

  const forward = new THREE.Vector3();
  const STEP = Math.log(1.25);
  let time = 0;

  function update(dt, level) {
    rain.visible = level > 0;
    wind.uWindStrength.value = level;
    if (level <= 0) return;

    time += dt;
    wind.uWindTime.value = time;

    // Box sized to the orbit distance, in whole 25% steps: each step reshuffles
    // the drops, so zooming does it now and then, not every frame.
    const want = THREE.MathUtils.clamp(
      camera.position.distanceTo(controls.target) * C.RAIN_BOX_PER_DISTANCE,
      C.RAIN_BOX_MIN,
      C.RAIN_BOX_MAX
    );
    const box = C.RAIN_BOX_MIN * Math.exp(Math.round(Math.log(want / C.RAIN_BOX_MIN) / STEP) * STEP);
    camera.getWorldDirection(forward);
    uniforms.uCenter.value.copy(camera.position).addScaledVector(forward, box * 0.45);
    uniforms.uBox.value = box;

    // Fall and drift, in box lengths.
    const downwind = wind.uWindDir.value;
    const drift = C.RAIN_DRIFT * gustAt(time);
    const o = uniforms.uOffset.value;
    o.x = (o.x + downwind.x * drift * dt) % OFFSET_WRAP;
    o.y = (o.y - C.RAIN_FALL * dt) % OFFSET_WRAP;
    o.z = (o.z + downwind.y * drift * dt) % OFFSET_WRAP;

    uniforms.uStreakDir.value.set(downwind.x * drift, -C.RAIN_FALL, downwind.y * drift).normalize();
    uniforms.uStreak.value = C.RAIN_STREAK * box;
    uniforms.uOpacity.value = C.RAIN_OPACITY * level;
  }

  return { update };
}
