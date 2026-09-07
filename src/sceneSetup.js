/**
 * Renderer, camera, controls, lighting, procedural environment map, ground.
 *
 * The environment map is generated in code from RoomEnvironment via PMREM --
 * no image files, no network fetches.
 */

import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
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
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x9fb6cc);
  scene.fog = new THREE.Fog(0x9fb6cc, 300, 900);

  // --- Procedural environment map for glass reflections ---
  const pmrem = new THREE.PMREMGenerator(renderer);
  pmrem.compileEquirectangularShader();
  const envRT = pmrem.fromScene(new RoomEnvironment(), 0.04);
  scene.environment = envRT.texture;
  pmrem.dispose();

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

  // --- Lighting ---
  const sunLight = new THREE.DirectionalLight(0xffffff, 3.0);
  sunLight.castShadow = true;
  sunLight.shadow.mapSize.set(C.SHADOW_MAP_SIZES[0], C.SHADOW_MAP_SIZES[0]);
  sunLight.shadow.bias = -0.0006;
  sunLight.shadow.normalBias = 0.02;
  scene.add(sunLight);
  scene.add(sunLight.target);

  const hemiLight = new THREE.HemisphereLight(0xbcd8f2, 0x4a4438, 0.9);
  scene.add(hemiLight);

  // --- Ground ---
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(1400, 1400),
    new THREE.MeshStandardMaterial({
      color: C.GROUND_COLOR,
      roughness: 0.95,
      metalness: 0.0,
    })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  addNeighbours(scene);

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  return { renderer, scene, camera, controls, sunLight, hemiLight };
}

/** A handful of low-detail blocks, for scale and for something to reflect. */
function addNeighbours(scene) {
  const material = new THREE.MeshStandardMaterial({
    color: C.NEIGHBOUR_COLOR,
    roughness: 0.75,
    metalness: 0.15,
  });

  // Deliberately kept clear of the module face (-Z) so nothing occludes it.
  const blocks = [
    { x: -78, z: 26, w: 30, d: 30, h: 62 },
    { x: 74, z: -12, w: 26, d: 34, h: 48 },
    { x: 12, z: 96, w: 40, d: 28, h: 74 },
    { x: -58, z: 84, w: 24, d: 24, h: 36 },
    { x: 96, z: 62, w: 32, d: 30, h: 55 },
    { x: -104, z: -46, w: 28, d: 26, h: 41 },
  ];

  const geo = new THREE.BoxGeometry(1, 1, 1);
  const mesh = new THREE.InstancedMesh(geo, material, blocks.length);
  mesh.castShadow = true;
  mesh.receiveShadow = true;

  const m = new THREE.Matrix4();
  blocks.forEach((b, i) => {
    m.compose(
      new THREE.Vector3(b.x, b.h / 2, b.z),
      new THREE.Quaternion(),
      new THREE.Vector3(b.w, b.h, b.d)
    );
    mesh.setMatrixAt(i, m);
  });
  mesh.instanceMatrix.needsUpdate = true;
  scene.add(mesh);
}
