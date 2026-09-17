/**
 * Renderer, camera, controls, lighting, sky, ground.
 *
 * The sky, and the environment map rendered from it, are generated in code
 * (sky.js) -- no image files, no network fetches.
 */

import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { buildEnvironment } from './environment.js';
import { buildCity } from './city.js';
import { createSky } from './sky.js';
import * as C from './constants.js';

export function createScene(canvas) {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    powerPreference: 'high-performance',
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  // Counted over the whole frame, post-processing passes included; the frame loop resets it.
  renderer.info.autoReset = false;

  const scene = new THREE.Scene();
  // Its colour follows the sky's horizon: the sun controller sets it every frame.
  scene.fog = new THREE.Fog(0x9fb6cc, C.FOG_NEAR, C.FOG_FAR);

  const camera = new THREE.PerspectiveCamera(
    C.CAMERA_FOV,
    window.innerWidth / window.innerHeight,
    C.CAMERA_NEAR,
    C.CAMERA_FAR
  );
  camera.position.set(70, 60, -120);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.06;
  controls.minDistance = C.ORBIT_MIN_DISTANCE;
  controls.maxDistance = C.ORBIT_MAX_DISTANCE;
  // Full 360 azimuth; clamp polar so the camera never drops below ground.
  controls.minPolarAngle = 0.05;
  controls.maxPolarAngle = Math.PI / 2 - 0.02;
  controls.target.set(0, 45, 0);
  controls.update();

  // --- Sky, and the environment map it lights and reflects in ---
  const sky = createSky(renderer, scene, camera);

  // --- Lighting ---
  // The sun controller drives intensities, the shadow box and its biases.
  const sunLight = new THREE.DirectionalLight(0xffffff, C.SUN_INTENSITY);
  sunLight.castShadow = true;
  sunLight.shadow.mapSize.set(C.SHADOW_MAP_SIZES[0], C.SHADOW_MAP_SIZES[0]);
  scene.add(sunLight);
  scene.add(sunLight.target);

  const hemiLight = new THREE.HemisphereLight(0xbcd8f2, 0x4a4438, C.FILL_HEMI_DAY);
  scene.add(hemiLight);

  // Flat ambient fill on top of the sky/ground hemisphere, so metal faces
  // turned away from the sun still read as metal rather than going black.
  const ambientLight = new THREE.AmbientLight(0xffffff, C.FILL_AMBIENT);
  scene.add(ambientLight);

  const city = buildCity(scene);
  buildEnvironment(scene, city.isBlocked);

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  return { renderer, scene, camera, controls, sunLight, hemiLight, ambientLight, city, sky };
}
