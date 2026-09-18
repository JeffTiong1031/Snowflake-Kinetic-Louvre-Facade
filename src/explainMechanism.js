/**
 * Explanation-only 3D parts that visualise the DCL-10 drive mechanism.
 * These are added to the stand-in copy during explanation mode and do not
 * appear in the normal tower view. Module-local space, metres.
 *
 * High-contrast, solid (non-transparent) engineering models:
 *   - DCL-10 actuator: industrial cobalt casing with brass shaft collar & spec plate
 *   - Drive disc: precision dark gunmetal disc with polished silver rim & orange radial mark
 *   - 6 eccentric pins: bright safety orange pins with brass base, on the arm centre lines
 *   - Orbit circle: solid, vibrant orange guide ring at 65 mm eccentric radius
 *   - 6 rod assemblies: a connecting link from the drive pin, a riser bracket,
 *     the rod itself housed inside its supporting arm, and a pair of struts at
 *     each row out to the blades either side of it
 *   - 8 crank arm overlays: bold orange lever arms with spherical joint caps on focus gap blades
 */

import * as THREE from 'three';
import * as C from './constants.js';

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
 * @param driveStations — from bladeSpineStations(): where each row of blades
 *   ends at its arm, in the arm's frame (mm), innermost first.
 * @param {number} focusGap — index of the gap featured in close-ups (gap 0).
 * @returns mechanism handle with update and visibility functions.
 */
export function buildExplainMechanism(parent, bisectors, driveStations, focusGap = 0) {
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
  // A highlighted rod draws through the arm that houses it, the way a cutaway
  // shows a part running inside a section.
  const xrayMat = new THREE.MeshBasicMaterial({
    color: ORANGE,
    transparent: true,
    opacity: 0.95,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
    fog: false,
  });
  // The same, in the rod's own steel, for the steps that fade the arms to show
  // what runs inside them: three faded surfaces would otherwise wash it out.
  // Transparent (at full opacity) so it is drawn in the same pass as the faded
  // arms and, by renderOrder, after them -- an opaque mesh would be painted over.
  const xraySteelMat = new THREE.MeshBasicMaterial({
    color: HOUSING_STEEL,
    transparent: true,
    opacity: 1,
    toneMapped: false,
    depthTest: false,
    depthWrite: false,
    fog: false,
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

  /* ---- 6 eccentric pins on the disc (aligned on the ARM centre lines) ---- */
  const pinEccentricR = 65 * C.MM;
  const pinDotR = 6 * C.MM;
  const pinHeight = 12 * C.MM;
  const pins = [];

  for (let i = 0; i < 6; i++) {
    // Arm angle: each pin drives the rod housed in that supporting arm.
    const armAngle = (i / 6) * Math.PI * 2 + ARM_PHASE;

    const pinGroup = new THREE.Group();
    pinGroup.position.set(
      Math.cos(armAngle) * pinEccentricR,
      Math.sin(armAngle) * pinEccentricR,
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

  /* ---- Rod assemblies: link, riser, rod and struts, one per supporting arm ---- */
  //
  // Each rod is housed in a supporting arm, running along the arm's centre line
  // against the back of its web -- where a drive rod would really sit -- rather
  // than out in front of the blades. A connecting link joins its inner end to
  // the drive pin, and a riser bracket carries that end forward to the pin's
  // plane. Turning the disc swings the link, which pulls the rod along its arm:
  // a slider-crank, the pin its crank and the rod its slider.
  //
  // Housed means hidden: seen from the front the arm covers its rod completely.
  // The steps that are about the rod highlight it, and a highlighted rod draws
  // through the arm (xrayMat), the way a cutaway shows a part inside a section.
  const linkZ = discZ + discThick / 2 + pinHeight / 2; // the pin's own plane
  // Long enough that at full travel it stays well off lining up with the arm,
  // where a slider-crank stops pulling cleanly.
  const linkLen = 110 * C.MM;
  const linkW = 9 * C.MM;
  const linkD = 8 * C.MM;
  const pivotR = 7 * C.MM;
  /** Where the rod's inner end sits with the disc at rest. */
  const restEnd = pinEccentricR + linkLen;

  // Well inside the arm's web (64 mm), and clear of the slat ends, which stop
  // SLAT_SPINE_GAP off the arm's side and swing back in the pockets beside it.
  const rodW = 10 * C.MM;
  const rodH = 7 * C.MM;
  /** Tucked against the back of the arm's web. */
  const rodZ = -(C.ARM_DEPTH / 2) * C.MM - rodH / 2;
  const riserW = 10 * C.MM; // along the rod
  // Pick-up struts: from one point on the rod, a pair splaying out to the two
  // blades that end there -- one each side of the arm. They follow the blades
  // themselves, which meet their spine at SPREAD, so each pair makes a V.
  const STRUT_SPREAD = 60 * DEG;
  const strutW = 7 * C.MM;
  const strutH = 6 * C.MM;
  /** The arm along the leading side of the focus gap: the one close-ups face. */
  const focusArm = (focusGap + 1) % 6;

  const rods = [];

  for (let i = 0; i < 6; i++) {
    const armAngle = (i / 6) * Math.PI * 2 + ARM_PHASE;
    const isFocus = i === focusArm;
    const material = isFocus ? orangeSolidMat : steelMat;
    const cos = Math.cos(armAngle);
    const sin = Math.sin(armAngle);

    // Everything but the link slides along the arm together.
    const assembly = new THREE.Group();
    group.add(assembly);

    // The connecting link, pinned to the drive pin at one end and to the rod at
    // the other. It swings rather than slides, so tick() places it itself.
    const link = new THREE.Mesh(new THREE.BoxGeometry(linkLen, linkW, linkD), material);
    group.add(link);

    // The pivot the link takes hold of, at the rod's inner end.
    const pivotGeo = new THREE.CylinderGeometry(pivotR, pivotR, linkD + 6 * C.MM, 16);
    pivotGeo.rotateX(Math.PI / 2);
    const pivot = new THREE.Mesh(pivotGeo, material);
    pivot.position.set(cos * restEnd, sin * restEnd, linkZ);
    assembly.add(pivot);

    // The rod itself: out past the last blade it drives, so it runs the full
    // length of the blades either side of its arm.
    const outerR =
      (driveStations[driveStations.length - 1].along + C.SLIDER_LENGTH) * C.MM;
    const midR = (restEnd + outerR) / 2;
    const rodMesh = new THREE.Mesh(new THREE.BoxGeometry(outerR - restEnd, rodW, rodH), material);
    rodMesh.position.set(cos * midR, sin * midR, rodZ);
    rodMesh.rotation.z = armAngle;
    assembly.add(rodMesh);

    // Riser bracket: carries the rod forward from the arm to the pivot.
    const riserTop = linkZ + linkD / 2;
    const riserBottom = rodZ - rodH / 2;
    const riserMesh = new THREE.Mesh(
      new THREE.BoxGeometry(riserW, rodW, riserTop - riserBottom),
      material
    );
    riserMesh.position.set(cos * restEnd, sin * restEnd, (riserTop + riserBottom) / 2);
    riserMesh.rotation.z = armAngle;
    assembly.add(riserMesh);

    // At each station a pair of struts out to the two blades that end there:
    // what makes one rod move all eight of them.
    const pickups = [];
    for (const { along, offset } of driveStations) {
      // The strut leaves the rod inboard of the blade end, so that it runs out
      // at the blade's own angle and meets it at its end.
      const root = (along - offset / Math.tan(STRUT_SPREAD)) * C.MM;
      const len = (offset / Math.sin(STRUT_SPREAD)) * C.MM;
      for (const side of [1, -1]) {
        const strutAngle = armAngle + side * STRUT_SPREAD;
        const strut = new THREE.Mesh(new THREE.BoxGeometry(len, strutW, strutH), material);
        strut.position.set(
          cos * root + Math.cos(strutAngle) * (len / 2),
          sin * root + Math.sin(strutAngle) * (len / 2),
          rodZ
        );
        strut.rotation.z = strutAngle;
        assembly.add(strut);
        pickups.push(strut);
      }
    }

    rods.push({
      assembly,
      link,
      angle: armAngle,
      dir: new THREE.Vector2(cos, sin),
      parts: [link, pivot, rodMesh, riserMesh, ...pickups],
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
  function tick(theta) {
    const rad = theta * DEG;
    // Actuator disc turns about façade normal Z
    discGroup.rotation.z = -rad;

    // Slider-crank: the pin swings round on its 65 mm radius and the link, whose
    // length never changes, drags each rod in along its arm -- about 29 mm at
    // 45°, the sideways part of the pin's travel taken up by the link swinging.
    const sideways = pinEccentricR * Math.sin(rad);
    const rodEnd = pinEccentricR * Math.cos(rad) + Math.sqrt(linkLen ** 2 - sideways ** 2);
    const deltaShift = rodEnd - restEnd;

    for (const rod of rods) {
      rod.assembly.position.set(rod.dir.x * deltaShift, rod.dir.y * deltaShift, 0);

      // The link spans pin to pivot: put it on that line, turned to match.
      const pinAngle = rod.angle - rad;
      const px = Math.cos(pinAngle) * pinEccentricR;
      const py = Math.sin(pinAngle) * pinEccentricR;
      const ex = rod.dir.x * rodEnd;
      const ey = rod.dir.y * rodEnd;
      rod.link.position.set((px + ex) / 2, (py + ey) / 2, linkZ);
      rod.link.rotation.z = Math.atan2(ey - py, ex - px);
    }
  }

  function setVisible(vis) {
    group.visible = vis;
  }

  function showOrbits(vis) {
    orbitRing.visible = vis;
  }

  /**
   * Rod finish, from the two things a step can ask for: the focus rod picked
   * out in orange, and the rods drawn through the arms that house them.
   */
  let highlightOn = false;
  let seeThroughOn = false;

  function applyRodMaterials() {
    for (const rod of rods) {
      const highlight = highlightOn && rod.isFocus;
      const through = highlight || seeThroughOn;
      for (const part of rod.parts) {
        part.material = highlight ? xrayMat : seeThroughOn ? xraySteelMat : steelMat;
        part.renderOrder = through ? 5 : 0;
      }
    }
  }

  function setFocusHighlight(highlight) {
    highlightOn = highlight;
    applyRodMaterials();
  }

  /** Draw the rods through the arms, for the steps that fade the arms. */
  function setSeeThrough(on) {
    seeThroughOn = on;
    applyRodMaterials();
  }

  // Initialise at 0°
  tick(0);

  return {
    group,
    tick,
    setVisible,
    showOrbits,
    setFocusHighlight,
    setSeeThrough,
    buildCrankArms,
    actuatorLabel,
    discLabel,
    discZ,
    discR,
    pinEccentricR,
  };
}
