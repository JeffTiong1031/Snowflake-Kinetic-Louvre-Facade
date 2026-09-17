/**
 * Explanation-only 3D parts that visualise the DCL-10 drive mechanism.
 * These are added to the stand-in copy during explanation mode and do not
 * appear in the normal tower view. Module-local space, metres.
 *
 *   - DCL-10 actuator (simple box inside the hub)
 *   - Steel drive disc on its shaft
 *   - 6 eccentric pins on the disc
 *   - Faint orbit circles for each pin
 *   - 6 transverse slots at the inner end of each sliding rod
 *   - Rod extension from each slot out to the carriage's inner end
 *   - Crank arm overlays on the focus gap's blades
 *
 * tick(theta) rotates the disc, moves the pins, and shifts the rod extensions
 * to match the carriage displacement at that blade angle.
 */

import * as THREE from 'three';
import * as C from './constants.js';
import { sliderShift } from './snowflakeModule.js';

const DEG = Math.PI / 180;
const ARM_PHASE = C.ARM_PHASE_DEG * DEG;

/** Orange used for explanation highlights. */
const ORANGE = 0xf0932b;
const HIGHLIGHT = 0xff8a1f;

/**
 * Build the mechanism parts.
 *
 * @param {THREE.Group} parent — the stand-in copy group (module-local).
 * @param {THREE.Vector3[]} bisectors — one unit vector per gap, from buildBladeLayout.
 * @param {number} carriageStart — carriage bar's inner end (mm from centre, along bisector).
 * @returns mechanism handle with `group`, `tick(theta)`, `setVisible(vis)`, `crankArms`.
 */
export function buildExplainMechanism(parent, bisectors, carriageStart) {
  const group = new THREE.Group();
  parent.add(group);

  /* ---- Materials ---- */

  const steel = new THREE.MeshStandardMaterial({
    color: 0xb8bcc2,
    metalness: 0.85,
    roughness: 0.32,
  });
  const orangeMat = new THREE.MeshBasicMaterial({
    color: HIGHLIGHT,
    transparent: true,
    opacity: 0.92,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
    fog: false,
  });
  const orbitMat = new THREE.MeshBasicMaterial({
    color: ORANGE,
    transparent: true,
    opacity: 0.25,
    depthTest: false,
    depthWrite: false,
    side: THREE.DoubleSide,
  });

  /* ---- DCL-10 actuator box ---- */
  // Sits inside the hub, behind the hub plate. A simple box.
  const hubZ = C.HUB_Z_OFFSET * C.MM;
  const hubThick = C.HUB_THICKNESS * C.MM;
  const actuatorDepth = 40 * C.MM; // how far it extends behind the hub
  const actuatorWidth = 80 * C.MM;
  const actuatorHeight = 50 * C.MM;
  const actuatorZ = hubZ - hubThick / 2 - actuatorDepth / 2;
  const actuator = new THREE.Mesh(
    new THREE.BoxGeometry(actuatorWidth, actuatorHeight, actuatorDepth),
    new THREE.MeshStandardMaterial({
      color: 0x3a3e45,
      metalness: 0.7,
      roughness: 0.5,
    })
  );
  actuator.position.set(0, 0, actuatorZ);
  group.add(actuator);

  // Label anchor for "DCL-10 actuator"
  const actuatorLabel = new THREE.Vector3(0, 0, actuatorZ);

  /* ---- Output shaft ---- */
  const shaftR = 6 * C.MM;
  const shaftLen = hubThick + 10 * C.MM; // through the hub plate + a little in front
  const shaft = new THREE.Mesh(
    new THREE.CylinderGeometry(shaftR, shaftR, shaftLen, 16),
    steel
  );
  shaft.geometry.rotateX(Math.PI / 2); // axis Y → Z
  shaft.position.set(0, 0, hubZ);
  group.add(shaft);

  /* ---- Drive disc ---- */
  const discR = 85 * C.MM;
  const discThick = 4 * C.MM;
  const discZ = hubZ + hubThick / 2 + discThick / 2 + 2 * C.MM; // just in front of the hub
  const discGroup = new THREE.Group();
  discGroup.position.set(0, 0, discZ);
  group.add(discGroup);

  const disc = new THREE.Mesh(
    new THREE.CylinderGeometry(discR, discR, discThick, 32),
    steel
  );
  disc.geometry.rotateX(Math.PI / 2);
  discGroup.add(disc);

  // Label anchor for "Drive disc"
  const discLabel = new THREE.Vector3(discR * 0.7, discR * 0.7, discZ);

  /* ---- 6 eccentric pins on the disc ---- */
  const pinEccentricR = 65 * C.MM; // eccentric radius
  const pinDotR = 5 * C.MM;
  const pinHeight = 8 * C.MM;
  const pins = [];
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + ARM_PHASE;
    const pin = new THREE.Mesh(
      new THREE.CylinderGeometry(pinDotR, pinDotR, pinHeight, 12),
      orangeMat
    );
    pin.geometry.rotateX(Math.PI / 2);
    pin.position.set(
      Math.cos(a) * pinEccentricR,
      Math.sin(a) * pinEccentricR,
      discThick / 2 + pinHeight / 2
    );
    discGroup.add(pin);
    pins.push(pin);
  }

  /* ---- Orbit circles (faint rings showing pin paths) ---- */
  const orbits = [];
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + ARM_PHASE;
    // A torus ring at the pin's rest position, in the disc plane
    const orbit = new THREE.Mesh(
      new THREE.TorusGeometry(pinEccentricR, 1.5 * C.MM, 8, 48),
      orbitMat
    );
    orbit.position.set(0, 0, discThick / 2 + pinHeight / 2);
    orbit.visible = false;
    // Only need one orbit ring — all pins share the same eccentric radius
    if (i === 0) {
      discGroup.add(orbit);
      orbits.push(orbit);
    }
  }

  /* ---- 6 transverse slots at the inner end of each rod ---- */
  // The slot sits on the disc plane, at the gap bisector, where the pin engages.
  const slotW = 25 * C.MM;
  const slotH = 6 * C.MM;
  const slotD = 6 * C.MM;
  const slotR = pinEccentricR; // at the eccentric radius along each bisector
  const slotHandles = [];
  for (let i = 0; i < 6; i++) {
    const bisAngle = (i / 6) * Math.PI * 2 + ARM_PHASE + Math.PI / 6; // gap bisector
    const slot = new THREE.Mesh(
      new THREE.BoxGeometry(slotW, slotH, slotD),
      steel
    );
    // Position at the pin engagement point, along the bisector
    slot.position.set(
      Math.cos(bisAngle) * slotR,
      Math.sin(bisAngle) * slotR,
      discZ + discThick / 2 + pinHeight / 2
    );
    // Rotate so it's perpendicular to the bisector (transverse)
    slot.rotation.z = bisAngle;
    group.add(slot);
    slotHandles.push({ mesh: slot, angle: bisAngle });
  }

  /* ---- Rod extensions: from each slot out to the carriage's inner end ---- */
  const rodExtW = 4 * C.MM;
  const rodExtH = 4 * C.MM;
  const rodExtensions = [];
  for (let i = 0; i < 6; i++) {
    const bisAngle = (i / 6) * Math.PI * 2 + ARM_PHASE + Math.PI / 6;
    const innerR = slotR + slotW / 2;
    const outerR = carriageStart * C.MM;
    const len = outerR - innerR;
    const midR = (innerR + outerR) / 2;

    const ext = new THREE.Mesh(
      new THREE.BoxGeometry(len, rodExtW, rodExtH),
      steel
    );
    ext.position.set(
      Math.cos(bisAngle) * midR,
      Math.sin(bisAngle) * midR,
      discZ + discThick / 2 + pinHeight / 2
    );
    ext.rotation.z = bisAngle;
    group.add(ext);
    rodExtensions.push({
      mesh: ext,
      angle: bisAngle,
      innerR,
      restLen: len,
      restMidR: midR,
    });
  }

  /* ---- Crank arm overlays ---- */
  // These are built per blade (for the focus gap) in explain.js, not here.
  // We expose a helper to build them on demand.

  /**
   * Build crank arm overlays for a set of blades.
   * @param {object[]} bladeEntries — entries from buildBladeLayout for the focus gap.
   * @returns {THREE.Mesh[]} — one cylinder mesh per blade, added to parent.
   */
  function buildCrankArms(bladeEntries) {
    const arms = [];
    for (const entry of bladeEntries) {
      const crankLen = Math.hypot(
        entry.grip.x - 0,
        entry.grip.y - 0,
        entry.grip.z - 0
      );
      const arm = new THREE.Mesh(
        new THREE.CylinderGeometry(2.5 * C.MM, 2.5 * C.MM, crankLen || 0.033, 8),
        orangeMat
      );
      arm.renderOrder = 3;
      arm.visible = false;
      parent.add(arm);
      arms.push(arm);
    }
    return arms;
  }

  /* ---- Pose the mechanism at a given disc rotation (degrees, 0–45) ---- */
  function tick(theta) {
    const rad = theta * DEG;
    discGroup.rotation.z = -rad; // disc rotates about Z (the façade normal)

    // Slide rod extensions outward by the carriage displacement
    const shift = sliderShift(rad); // metres
    for (const ext of rodExtensions) {
      const newLen = ext.restLen + shift;
      const newMidR = ext.innerR + newLen / 2;
      ext.mesh.scale.x = newLen / ext.restLen;
      ext.mesh.position.set(
        Math.cos(ext.angle) * newMidR,
        Math.sin(ext.angle) * newMidR,
        ext.mesh.position.z
      );
    }

    // Slots shift with the rod
    for (const slot of slotHandles) {
      const newR = slotR + shift;
      slot.mesh.position.set(
        Math.cos(slot.angle) * newR,
        Math.sin(slot.angle) * newR,
        slot.mesh.position.z
      );
    }
  }

  function setVisible(vis) {
    group.visible = vis;
  }

  function showOrbits(vis) {
    for (const o of orbits) o.visible = vis;
  }

  // Initialise at 0°
  tick(0);

  return {
    group,
    tick,
    setVisible,
    showOrbits,
    buildCrankArms,
    actuatorLabel,
    discLabel,
    discZ,
    discR,
    pinEccentricR,
  };
}
