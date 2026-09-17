/**
 * Explanation-only 3D parts that visualise the DCL-10 drive mechanism.
 * These are added to the stand-in copy during explanation mode and do not
 * appear in the normal tower view. Module-local space, metres.
 *
 * High-contrast, solid (non-transparent) engineering models:
 *   - DCL-10 actuator: industrial cobalt casing with brass shaft collar & spec plate
 *   - Drive disc: precision dark gunmetal disc with polished silver rim & orange radial mark
 *   - 6 eccentric pins: bright safety orange pins with brass base, positioned on gap bisectors
 *   - Orbit circle: solid, vibrant orange guide ring at 65 mm eccentric radius
 *   - 6 transverse slots: mechanical slotted blocks at inner end of each sliding rod
 *   - 6 rod extensions: connecting each slot to the carriage inner end
 *   - 8 crank arm overlays: bold orange lever arms with spherical joint caps on focus gap blades
 */

import * as THREE from 'three';
import * as C from './constants.js';
import { sliderShift } from './snowflakeModule.js';

const DEG = Math.PI / 180;
const ARM_PHASE = C.ARM_PHASE_DEG * DEG;

/** Vivid contrasting colors for explanation parts. */
const ORANGE = 0xff7a00;
const SAFETY_ORANGE = 0xff6600;
const INDUSTRIAL_BLUE = 0x123c6b;
const BRASS_GOLD = 0xdfa034;
const POLISHED_CHROME = 0xdee4ec;
const DARK_STEEL = 0x27303d;
const HOUSING_STEEL = 0x3d4957;

/**
 * Build the mechanism parts.
 *
 * @param {THREE.Group} parent — the stand-in copy group (module-local).
 * @param {THREE.Vector3[]} bisectors — one unit vector per gap, from buildBladeLayout.
 * @param {number} carriageStart — carriage bar's inner end (mm from centre, along bisector).
 * @param {number} focusGap — index of the gap featured in close-ups (gap 0).
 * @returns mechanism handle with update and visibility functions.
 */
export function buildExplainMechanism(parent, bisectors, carriageStart, focusGap = 0) {
  const group = new THREE.Group();
  parent.add(group);

  /* ---- High-contrast, 100% opaque materials ---- */

  const actuatorMat = new THREE.MeshStandardMaterial({
    color: INDUSTRIAL_BLUE,
    metalness: 0.5,
    roughness: 0.35,
  });
  const plateMat = new THREE.MeshStandardMaterial({
    color: POLISHED_CHROME,
    metalness: 0.85,
    roughness: 0.2,
  });
  const brassMat = new THREE.MeshStandardMaterial({
    color: BRASS_GOLD,
    metalness: 0.85,
    roughness: 0.25,
  });
  const discMat = new THREE.MeshStandardMaterial({
    color: DARK_STEEL,
    metalness: 0.8,
    roughness: 0.25,
  });
  const discRimMat = new THREE.MeshStandardMaterial({
    color: POLISHED_CHROME,
    metalness: 0.9,
    roughness: 0.15,
  });
  const orangeSolidMat = new THREE.MeshStandardMaterial({
    color: SAFETY_ORANGE,
    emissive: 0xff4400,
    emissiveIntensity: 0.25,
    metalness: 0.3,
    roughness: 0.3,
  });
  const orangeHighlightMat = new THREE.MeshBasicMaterial({
    color: ORANGE,
    toneMapped: false,
  });
  const steelMat = new THREE.MeshStandardMaterial({
    color: HOUSING_STEEL,
    metalness: 0.75,
    roughness: 0.35,
  });

  /* ---- DCL-10 actuator box ---- */
  // Sits inside the hub cavity, completely visible when the front plate is off.
  const hubZ = C.HUB_Z_OFFSET * C.MM;
  const hubThick = C.HUB_THICKNESS * C.MM;
  const actuatorDepth = 55 * C.MM;
  const actuatorWidth = 90 * C.MM;
  const actuatorHeight = 65 * C.MM;
  const actuatorZ = hubZ - hubThick / 2 - actuatorDepth / 2 + 5 * C.MM;

  const actuatorGroup = new THREE.Group();
  actuatorGroup.position.set(0, 0, actuatorZ);
  group.add(actuatorGroup);

  // Main blue housing
  const actuatorBody = new THREE.Mesh(
    new THREE.BoxGeometry(actuatorWidth, actuatorHeight, actuatorDepth),
    actuatorMat
  );
  actuatorGroup.add(actuatorBody);

  // Metal mounting faceplate on the front of the actuator
  const faceplate = new THREE.Mesh(
    new THREE.BoxGeometry(actuatorWidth + 6 * C.MM, actuatorHeight + 6 * C.MM, 4 * C.MM),
    plateMat
  );
  faceplate.position.set(0, 0, actuatorDepth / 2 + 2 * C.MM);
  actuatorGroup.add(faceplate);

  // Spec plate badge on top of actuator
  const badge = new THREE.Mesh(
    new THREE.BoxGeometry(45 * C.MM, 2 * C.MM, 28 * C.MM),
    orangeHighlightMat
  );
  badge.position.set(0, actuatorHeight / 2 + 1.2 * C.MM, 0);
  actuatorGroup.add(badge);

  const actuatorLabel = new THREE.Vector3(0, 0, actuatorZ + 15 * C.MM);

  /* ---- Output shaft (Golden brass) ---- */
  const shaftR = 8 * C.MM;
  const shaftLen = hubThick + 25 * C.MM;
  const shaft = new THREE.Mesh(
    new THREE.CylinderGeometry(shaftR, shaftR, shaftLen, 24),
    brassMat
  );
  shaft.geometry.rotateX(Math.PI / 2);
  shaft.position.set(0, 0, hubZ + 5 * C.MM);
  group.add(shaft);

  /* ---- Drive disc ---- */
  const discR = 85 * C.MM;
  const discThick = 5 * C.MM;
  const discZ = hubZ + hubThick / 2 + discThick / 2 + 2 * C.MM;
  const discGroup = new THREE.Group();
  discGroup.position.set(0, 0, discZ);
  group.add(discGroup);

  // Dark precision steel central plate
  const disc = new THREE.Mesh(
    new THREE.CylinderGeometry(discR, discR, discThick, 36),
    discMat
  );
  disc.geometry.rotateX(Math.PI / 2);
  discGroup.add(disc);

  // Polished chrome outer rim
  const discRim = new THREE.Mesh(
    new THREE.TorusGeometry(discR - 1.5 * C.MM, 2 * C.MM, 8, 48),
    discRimMat
  );
  discRim.position.set(0, 0, discThick / 2);
  discGroup.add(discRim);

  // Central brass hub boss
  const hubBoss = new THREE.Mesh(
    new THREE.CylinderGeometry(18 * C.MM, 20 * C.MM, discThick + 4 * C.MM, 24),
    brassMat
  );
  hubBoss.geometry.rotateX(Math.PI / 2);
  discGroup.add(hubBoss);

  // High-contrast orange radial rotation indicator arrow on the disc face
  const arrowGeo = new THREE.BoxGeometry(45 * C.MM, 4 * C.MM, 1.5 * C.MM);
  arrowGeo.translate(25 * C.MM, 0, discThick / 2 + 1 * C.MM);
  const arrowMesh = new THREE.Mesh(arrowGeo, orangeHighlightMat);
  discGroup.add(arrowMesh);

  const discLabel = new THREE.Vector3(discR * 0.7, discR * 0.7, discZ);

  /* ---- 6 eccentric pins on the disc (Aligned on GAP BISECTOR angles) ---- */
  const pinEccentricR = 65 * C.MM;
  const pinDotR = 6 * C.MM;
  const pinHeight = 12 * C.MM;
  const pins = [];

  for (let i = 0; i < 6; i++) {
    // Gap bisector angle: matches the centre lines of the 6 regions!
    const bisAngle = (i / 6) * Math.PI * 2 + ARM_PHASE + Math.PI / 6;

    const pinGroup = new THREE.Group();
    pinGroup.position.set(
      Math.cos(bisAngle) * pinEccentricR,
      Math.sin(bisAngle) * pinEccentricR,
      discThick / 2 + pinHeight / 2
    );

    // Brass mounting collar
    const collar = new THREE.Mesh(
      new THREE.CylinderGeometry(pinDotR * 1.35, pinDotR * 1.5, 3 * C.MM, 16),
      brassMat
    );
    collar.geometry.rotateX(Math.PI / 2);
    collar.position.set(0, 0, -pinHeight / 2 + 1.5 * C.MM);
    pinGroup.add(collar);

    // Solid, vibrant safety orange drive pin
    const pin = new THREE.Mesh(
      new THREE.CylinderGeometry(pinDotR, pinDotR, pinHeight, 16),
      orangeSolidMat
    );
    pin.geometry.rotateX(Math.PI / 2);
    pinGroup.add(pin);

    discGroup.add(pinGroup);
    pins.push(pinGroup);
  }

  /* ---- Orbit circle: solid, crisp orange guide ring at 65 mm radius ---- */
  // Fixed in the hub frame (does not rotate with disc), showing the fixed circular path.
  const orbitRing = new THREE.Mesh(
    new THREE.TorusGeometry(pinEccentricR, 2.2 * C.MM, 10, 64),
    orangeHighlightMat
  );
  orbitRing.position.set(0, 0, discZ + discThick / 2 + pinHeight / 2);
  orbitRing.visible = false;
  group.add(orbitRing);

  /* ---- 6 transverse slots at the inner end of each sliding rod ---- */
  const slotW = 32 * C.MM; // transverse width (allows pin to slide sideways)
  const slotH = 10 * C.MM; // along the rod
  const slotD = 10 * C.MM; // depth
  const slotR = pinEccentricR;
  const slotHandles = [];

  for (let i = 0; i < 6; i++) {
    const bisAngle = (i / 6) * Math.PI * 2 + ARM_PHASE + Math.PI / 6;
    const isFocus = i === focusGap;

    // Slot housing block
    const slotMesh = new THREE.Mesh(
      new THREE.BoxGeometry(slotW, slotH, slotD),
      isFocus ? orangeSolidMat : steelMat
    );
    slotMesh.position.set(
      Math.cos(bisAngle) * slotR,
      Math.sin(bisAngle) * slotR,
      discZ + discThick / 2 + pinHeight / 2
    );
    // Rotate so width is perpendicular to bisector (transverse)
    slotMesh.rotation.z = bisAngle;
    group.add(slotMesh);

    slotHandles.push({
      mesh: slotMesh,
      angle: bisAngle,
      isFocus,
    });
  }

  /* ---- Rod extensions: from each slot out to the carriage inner end ---- */
  const rodExtW = 7 * C.MM;
  const rodExtH = 7 * C.MM;
  const rodExtensions = [];

  for (let i = 0; i < 6; i++) {
    const bisAngle = (i / 6) * Math.PI * 2 + ARM_PHASE + Math.PI / 6;
    const isFocus = i === focusGap;
    const innerR = slotR + slotH / 2;
    const outerR = carriageStart * C.MM;
    const len = outerR - innerR;
    const midR = (innerR + outerR) / 2;

    const extMesh = new THREE.Mesh(
      new THREE.BoxGeometry(len, rodExtW, rodExtH),
      isFocus ? orangeSolidMat : steelMat
    );
    extMesh.position.set(
      Math.cos(bisAngle) * midR,
      Math.sin(bisAngle) * midR,
      discZ + discThick / 2 + pinHeight / 2
    );
    extMesh.rotation.z = bisAngle;
    group.add(extMesh);

    rodExtensions.push({
      mesh: extMesh,
      angle: bisAngle,
      innerR,
      restLen: len,
      restMidR: midR,
      isFocus,
    });
  }

  /* ---- Crank arm overlays: bold solid orange levers with joint spheres ---- */
  function buildCrankArms(bladeEntries) {
    const arms = [];
    const sphereMat = plateMat;
    const jointSphereMat = brassMat;

    for (const entry of bladeEntries) {
      const crankGroup = new THREE.Group();
      crankGroup.renderOrder = 4;
      crankGroup.visible = false;

      // Solid cylindrical lever arm
      const armMesh = new THREE.Mesh(
        new THREE.CylinderGeometry(4 * C.MM, 4 * C.MM, 1, 16),
        orangeSolidMat
      );
      crankGroup.add(armMesh);

      // Fixed pivot shaft joint ball (at blade hinge)
      const hingeBall = new THREE.Mesh(
        new THREE.SphereGeometry(5.5 * C.MM, 12, 12),
        sphereMat
      );
      crankGroup.add(hingeBall);

      // Linkage joint ball (at blade lug)
      const lugBall = new THREE.Mesh(
        new THREE.SphereGeometry(5 * C.MM, 12, 12),
        jointSphereMat
      );
      crankGroup.add(lugBall);

      parent.add(crankGroup);
      arms.push({ group: crankGroup, armMesh, hingeBall, lugBall, entry });
    }
    return arms;
  }

  /* ---- Pose the mechanism at a given blade angle theta (degrees, 0–45) ---- */
  const restShift = sliderShift(90 * DEG); // carriage shift at 0° blade angle (phi = 90°)

  function tick(theta) {
    const rad = theta * DEG;
    // Actuator disc turns about façade normal Z
    discGroup.rotation.z = -rad;

    // Shift of sliding rod: inward displacement matching the carriage in facade.js
    const phi = (90 - theta) * DEG;
    const currentShift = sliderShift(phi);
    const deltaShift = currentShift - restShift; // 0 mm at theta=0, -4.41 mm at theta=45

    // Rod extensions slide radially in lockstep with the carriages
    for (const ext of rodExtensions) {
      const newMidR = ext.restMidR + deltaShift;
      ext.mesh.position.set(
        Math.cos(ext.angle) * newMidR,
        Math.sin(ext.angle) * newMidR,
        ext.mesh.position.z
      );
    }

    // Transverse slots slide radially with the rods
    for (const slot of slotHandles) {
      const newR = slotR + deltaShift;
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
    orbitRing.visible = vis;
  }

  function setFocusHighlight(highlight) {
    for (const ext of rodExtensions) {
      if (ext.isFocus) ext.mesh.material = highlight ? orangeHighlightMat : steelMat;
    }
    for (const slot of slotHandles) {
      if (slot.isFocus) slot.mesh.material = highlight ? orangeHighlightMat : steelMat;
    }
  }

  // Initialise at 0°
  tick(0);

  return {
    group,
    tick,
    setVisible,
    showOrbits,
    setFocusHighlight,
    buildCrankArms,
    actuatorLabel,
    discLabel,
    discZ,
    discR,
    pinEccentricR,
  };
}
