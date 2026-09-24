/**
 * Explanation mode: flies in to one snowflake and walks through how it works,
 * a step at a time. Left-click (or the right arrow key) moves on, right-click
 * (or the left arrow) goes back, N shows the narration, Escape leaves. A drag
 * still orbits the camera.
 *
 * It opens with the control chain -- sunlight, the IP68 sensors, the controller,
 * the DCL-10 actuator, the sliding rod, the louvres -- built up step by step in
 * a strip across the top, earlier steps greyed.
 *
 * 3D FIRST APPROACH:
 * Every step uses the real 3D snowflake module as its primary visual with live
 * kinematic animation. Non-transparent, high-contrast engineering components
 * (DCL-10 actuator, steel drive disc, eccentric pins, transverse slots, sliding
 * rods along gap centre lines, and crank arms) provide immediate clarity.
 * Compact 2D diagrams support steps 2, 3, 6, and 7.
 */

import * as THREE from 'three';
import * as C from './constants.js';
import {
  buildBladeLayout,
  buildModuleStaticGeometry,
  buildTipGeometry,
  buildHubGeometry,
  buildArmGeometry,
  bladeSpineStations,
  slatOutlines,
  tipPanelCentre,
  MODULE_BLADE_COUNT,
  sliderShift,
} from './snowflakeModule.js';
import { buildLdrSensor } from './ldrSensor.js';
import { buildControlDiagrams, tiltCycle } from './controlDiagrams.js';
import { buildExplainMechanism } from './explainMechanism.js';

const DEG = Math.PI / 180;
const GAPS = C.ARM_COUNT;
const ROW_COUNT = C.SLAT_WIDTHS.length;
const PER_ROW = C.MODULE_COUNT * GAPS * 2;
const SVG_NS = 'http://www.w3.org/2000/svg';
const UP = new THREE.Vector3(0, 0, 1);

/** Two sensor tips: Upper Left (arm 5, 300°) and Lower Right (arm 2, 120°). */
const SENSOR_ARMS = [5, 2];

/** Live sensor readings shown in Step 1. */
const READINGS = { UL: 92, LR: 21 };

/** One open-close stroke of the mechanism demo steps, seconds. */
const STROKE_PERIOD = 4.5;
/** How see-through the sensor tips' frames go, 0..1 opacity. */
const GHOST_OPACITY = 0.18;

/**
 * How see-through the six arms go on the steps that show what's inside them.
 * Enough to read the sliding rod housed in each arm, not so much that the
 * module stops reading as a solid frame.
 */
const ARM_GHOST_OPACITY = 0.3;

/**
 * Camera views, module-local metres: eye and look-at point.
 */
const VIEWS = {
  front: { eye: [0.3, 0.2, 3.4], at: [0, 0, 0] },
  oblique: { eye: [1.5, 0.45, 2.2], at: [0, 0, 0] },
  // Two sensor tips, between the chain strip above and the caption card below.
  sensor: { eye: [0.3, 0.1, 2.9], at: [0, -0.12, 0] },
  // The module left of centre, clear of the diagram panel on the right.
  panel: { eye: [1.6, -0.05, 5.0], at: [1.43, -0.2, 0] },
  // Closer on the hub so actuator/disc/pins are large, clear and prominent.
  hub: { eye: [0.12, 0.22, 0.88], at: [0, 0, 0] },
  // Closer on the focus gap showing the sliding rod, crank arms and 8 blades.
  gap: { eye: [0.72, 0.32, 0.95], at: [0.38, 0, 0] },
  // Side view.
  side: { eye: [1.65, 0.4, 0.65], at: [0.42, 0, -0.02] },
};

/** A blade tilt from open (0°, edge-on) in degrees, as a louvre state (1 = open). */
const tiltToState = (deg) => 1 - deg / 90;

const ARROW_SVG =
  '<svg viewBox="0 0 40 20" width="40" height="20" aria-hidden="true">' +
  '<line x1="3" y1="10" x2="26" y2="10" stroke="#F0932B" stroke-width="6" stroke-linecap="round"/>' +
  '<path d="M23,2 L38,10 L23,18 z" fill="#F0932B"/></svg>';

/** Smooth cubic bezier easing. */
function easeInOutCubic(x) {
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
}

/** Tilt cycle for the mechanism demo steps (0° → 45° → 0°). */
const MECH_CYCLE = { to: 45, up: 2.5, hold: 1.5, down: 2.0, rest: 1.0 };

/** Smooth shading motion for Step 9 (0° → 45°). */
function step9Pose(t) {
  const cycle = 10.5;
  const ct = t % cycle;
  if (ct < 1.0) return 0;
  if (ct < 5.5) {
    const u = (ct - 1.0) / 4.5;
    return 45 * easeInOutCubic(u);
  }
  if (ct < 9.0) return 45;
  const u = (ct - 9.0) / 1.5;
  return 45 * (1 - easeInOutCubic(u));
}

/** Smooth return motion for Step 10 (45° → 0°) with intermediate stops. */
function step10Pose(t) {
  const cycle = 15.5;
  const ct = t % cycle;
  if (ct < 1.2) return 45;
  if (ct < 2.8) {
    const u = (ct - 1.2) / 1.6;
    return 45 - 15 * easeInOutCubic(u); // 45 -> 30
  }
  if (ct < 4.2) return 30;
  if (ct < 5.8) {
    const u = (ct - 4.2) / 1.6;
    return 30 - 10 * easeInOutCubic(u); // 30 -> 20
  }
  if (ct < 7.2) return 20;
  if (ct < 8.8) {
    const u = (ct - 7.2) / 1.6;
    return 20 - 10 * easeInOutCubic(u); // 20 -> 10
  }
  if (ct < 10.2) return 10;
  if (ct < 11.8) {
    const u = (ct - 10.2) / 1.6;
    return 10 - 10 * easeInOutCubic(u); // 10 -> 0
  }
  if (ct < 14.0) return 0;
  const u = (ct - 14.0) / 1.5;
  return 45 * easeInOutCubic(u);
}

export function createExplainMode({ scene, camera, canvas, facade, flyTo, onExit }) {
  const layout = buildBladeLayout();
  const faceQuat = facade.faceQuat;

  /** The module explained: the middle one, as in the Single module view. */
  const focus = Math.floor(C.GRID_ROWS / 2) * C.GRID_COLS + Math.floor(C.GRID_COLS / 2);
  const origin = facade.modulePos[focus];
  const toWorld = (v) => v.clone().applyQuaternion(faceQuat).add(origin);
  const local = (x, y, z) => new THREE.Vector3(x, y, z);

  const bisectors = Array.from({ length: GAPS }, (_, g) => layout.find((e) => e.gap === g).bisector);
  /** The gap whose centre line points most nearly along +X. */
  const focusGap = bisectors.reduce((best, b, g) => (b.x > bisectors[best].x ? g : best), 0);

  /* -------------------------------------------------------------- *
   * Highlights: duplicate meshes overlaid on the real ones
   * -------------------------------------------------------------- */

  const { bladeMeshes, carriageMesh, linkMesh, lugMesh } = facade.meshes;

  const xray = new THREE.MeshBasicMaterial({
    color: 0xff7a00,
    transparent: true,
    opacity: 0.95,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
    fog: false,
  });

  const glow = new THREE.MeshBasicMaterial({
    color: 0xff9800,
    transparent: true,
    opacity: 0.88,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
    fog: false,
    side: THREE.DoubleSide,
  });

  function mirror(source, indices, material, renderOrder = 2) {
    const mesh = new THREE.InstancedMesh(source.geometry, material, indices.length);
    mesh.renderOrder = renderOrder;
    mesh.frustumCulled = false;
    mesh.visible = false;
    scene.add(mesh);

    const m = new THREE.Matrix4();
    return {
      mesh,
      sync() {
        for (let i = 0; i < indices.length; i++) {
          source.getMatrixAt(indices[i], m);
          mesh.setMatrixAt(i, m);
        }
        mesh.instanceMatrix.needsUpdate = true;
      },
    };
  }

  // Each slat's slot in its row mesh, as the facade numbers them.
  const slotOf = [];
  {
    const next = new Array(ROW_COUNT).fill(0);
    layout.forEach((e) => slotOf.push(next[e.row]++));
  }
  const slatIndices = Array.from({ length: ROW_COUNT }, () => []);
  layout.forEach((e, b) => {
    if (e.gap === focusGap) slatIndices[e.row].push(focus * PER_ROW + slotOf[b]);
  });

  function driveOf(gaps) {
    const blades = [];
    layout.forEach((e, b) => {
      if (gaps.includes(e.gap)) blades.push(focus * MODULE_BLADE_COUNT + b);
    });
    return [
      mirror(carriageMesh, gaps.map((g) => focus * GAPS + g), xray, 3),
      mirror(linkMesh, blades, xray, 3),
      mirror(lugMesh, blades, xray, 3),
    ];
  }

  const overlays = {
    slats: bladeMeshes.map((mesh, r) => mirror(mesh, slatIndices[r], glow, 2)),
    driveFocus: driveOf([focusGap]),
    driveAll: driveOf([...Array(GAPS).keys()]),
  };

  // The focus gap's hinge lines: along each slat's outer edge, where it turns.
  const hinges = new THREE.Group();
  {
    const outlines = slatOutlines();
    layout.forEach((e) => {
      if (e.gap !== focusGap) return;
      const [[x0], [x1]] = outlines[e.row];
      const a = local(x0 * C.MM, 0, 0).applyQuaternion(e.quat).add(e.origin);
      const b = local(x1 * C.MM, 0, 0).applyQuaternion(e.quat).add(e.origin);
      hinges.add(rod(toWorld(a), toWorld(b), 0.004, xray));
    });
  }
  hinges.visible = false;
  hinges.renderOrder = 3;
  hinges.children.forEach((c) => (c.renderOrder = 3));
  scene.add(hinges);

  /* -------------------------------------------------------------- *
   * The focus module's stand-in copy: solid hub with removable cover
   * -------------------------------------------------------------- */

  const { staticMesh, pvMesh } = facade.meshes;
  const standInCopy = new THREE.Group();
  standInCopy.position.copy(origin);
  standInCopy.quaternion.copy(faceQuat);
  standInCopy.visible = false;

  const ghostAluminium = staticMesh.material.clone();
  const ghostPv = pvMesh.material.clone();
  ghostAluminium.transparent = true;
  ghostPv.transparent = true;

  // Hub as solid separate meshes (NO TRANSPARENCY - completely solid)
  const hubGeo = buildHubGeometry();
  const hubAluMesh = new THREE.Mesh(hubGeo.aluminium, staticMesh.material.clone());
  const hubPvMesh = new THREE.Mesh(hubGeo.pv, pvMesh.material.clone());
  hubAluMesh.castShadow = true;
  hubAluMesh.receiveShadow = true;
  hubPvMesh.castShadow = true;
  hubPvMesh.receiveShadow = true;

  // The six arms are meshes of their own: each houses a sliding rod, and the
  // steps that show the drive fade them to let it through (setArmGhost).
  const ARMS = [...Array(C.ARM_COUNT).keys()];
  const armAluminium = staticMesh.material.clone();
  const armPv = pvMesh.material.clone();
  const armMeshes = [];

  {
    const rest = buildModuleStaticGeometry({
      omitTips: SENSOR_ARMS,
      omitHub: true,
      omitArms: ARMS,
    });
    const tips = buildTipGeometry(SENSOR_ARMS);
    const arms = buildArmGeometry(ARMS);
    for (const [geometry, material] of [
      [rest.aluminium, staticMesh.material],
      [rest.pv, pvMesh.material],
      [tips.aluminium, ghostAluminium],
      [tips.pv, ghostPv],
      [arms.aluminium, armAluminium],
      [arms.pv, armPv],
    ]) {
      const mesh = new THREE.Mesh(geometry, material);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.userData.noAO = material.transparent;
      if (material === armAluminium || material === armPv) armMeshes.push(mesh);
      standInCopy.add(mesh);
    }
    standInCopy.add(hubAluMesh, hubPvMesh);
  }

  function setHubCover(open) {
    hubAluMesh.visible = !open;
    hubPvMesh.visible = !open;
  }

  // IP68 light sensors inside each sensor tip's frame
  const glowSize = 0.13;
  const glowTexture = ringGlow(((C.LDR_DIAMETER / 2) * C.MM * 1.15) / (glowSize / 2));
  const shadeZ = (C.TIP_PANEL_THICKNESS / 2 + C.TIP_PV_RISE + 2) * C.MM;
  const sensorReadings = [READINGS.UL / 100, READINGS.LR / 100];
  const sensors = SENSOR_ARMS.map((arm, idx) => {
    const centre = tipPanelCentre(arm);
    const at = centre.clone().setZ(C.LDR_DEPTH * C.MM);
    const sensor = buildLdrSensor();
    sensor.position.copy(at);
    standInCopy.add(sensor);

    const halo = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: glowTexture,
        color: 0xfff1b0,
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthTest: false,
        depthWrite: false,
        toneMapped: false,
        fog: false,
      })
    );
    halo.scale.setScalar(glowSize);
    halo.position.copy(at);
    halo.renderOrder = 4;
    halo.visible = false;
    standInCopy.add(halo);

    const a = (arm * 60 + C.ARM_PHASE_DEG) * DEG;
    const h = (C.TIP_PANEL_SIZE / Math.SQRT2) * C.MM;
    const point = (u, v) =>
      new THREE.Vector2(centre.x + u * Math.cos(a) - v * Math.sin(a), centre.y + u * Math.sin(a) + v * Math.cos(a));
    const shade = new THREE.Mesh(
      new THREE.ShapeGeometry(new THREE.Shape([point(h, 0), point(0, h), point(-h, 0), point(0, -h)])),
      new THREE.MeshBasicMaterial({ color: 0x16202c, transparent: true, opacity: 0, depthWrite: false })
    );
    shade.position.z = shadeZ;
    shade.renderOrder = 3;
    shade.visible = false;
    standInCopy.add(shade);

    return { halo, shade, level: sensorReadings[idx] };
  });
  scene.add(standInCopy);

  /* -------------------------------------------------------------- *
   * High-contrast 3D mechanism parts (DCL-10, disc, pins, slots, rods)
   * -------------------------------------------------------------- */

  const mechanism = buildExplainMechanism(standInCopy, bisectors, bladeSpineStations(), focusGap);

  // Crank arm overlays for the focus gap's 8 blades
  const focusBlades = layout.filter((e) => e.gap === focusGap);
  const crankArms = mechanism.buildCrankArms(focusBlades);

  /* -------------------------------------------------------------- *
   * Stand-in show/hide and ghost control
   * -------------------------------------------------------------- */

  const shownMatrix = new THREE.Matrix4();
  staticMesh.getMatrixAt(focus, shownMatrix);
  const hiddenMatrix = new THREE.Matrix4().makeScale(0, 0, 0);

  function standIn(on) {
    for (const mesh of [staticMesh, pvMesh]) {
      mesh.setMatrixAt(focus, on ? hiddenMatrix : shownMatrix);
      mesh.instanceMatrix.needsUpdate = true;
    }
    standInCopy.visible = on;
  }

  let ghost = 1;
  function setGhost(opacity) {
    ghost = opacity;
    ghostAluminium.opacity = opacity;
    ghostPv.opacity = opacity;
  }

  /**
   * Fade the arms to show the rod inside. Opaque they stay ordinary solid
   * geometry; see-through they stop writing depth (so the rod behind shows),
   * stop casting a solid shadow, and drop out of the ambient occlusion pass.
   */
  let armGhost = 1;
  function setArmGhost(opacity) {
    const wasSolid = armGhost >= 1;
    const solid = opacity >= 1;
    armGhost = opacity;
    for (const material of [armAluminium, armPv]) {
      material.opacity = opacity;
      material.depthWrite = solid;
      if (solid !== wasSolid) {
        material.transparent = !solid;
        material.needsUpdate = true;
      }
    }
    for (const mesh of armMeshes) {
      mesh.castShadow = solid;
      mesh.userData.noAO = !solid;
    }
  }

  /* -------------------------------------------------------------- *
   * The diagram panel
   * -------------------------------------------------------------- */

  const diagramPanel = document.getElementById('explainDiagram');
  const diagramSvg = document.getElementById('explainDiagramSvg');
  const { defs: diagramDefs, diagrams } = buildControlDiagrams(diagramSvg);
  const diagramShow = document.createElementNS(SVG_NS, 'g');
  diagramSvg.append(diagramShow);
  let diagram = null;

  function showDiagram(name) {
    const wanted = name ? diagrams[name] : null;
    if (wanted === diagram) return;
    if (diagram) {
      diagram.tick(diagram.rest);
      diagramDefs.append(diagram.g);
    }
    diagram = wanted;
    diagramPanel.hidden = !diagram;
    if (diagram) {
      diagramSvg.setAttribute('viewBox', diagram.viewBox);
      diagramShow.replaceChildren(diagram.g);
    }
  }

  /* -------------------------------------------------------------- *
   * 3D Labels
   * -------------------------------------------------------------- */

  const polar = (deg, r, z) => local(Math.cos(deg * DEG) * r, Math.sin(deg * DEG) * r, z);
  const LABELS = [
    ...SENSOR_ARMS.map((arm, idx) => {
      const c = tipPanelCentre(arm);
      return {
        set: 'sensor',
        text: 'IP68 light sensor',
        key: idx === 0 ? 'UL' : 'LR',
        at: c.clone().setZ(C.LDR_DEPTH * C.MM),
        dx: Math.sign(c.x) * 40,
        dy: -Math.sign(c.y) * 60,
        bare: true,
      };
    }),
    { set: 'mech', text: 'DCL-10 actuator', at: local(0, 0, C.HUB_Z_OFFSET * C.MM - 0.04), dx: -110, dy: 80 },
    { set: 'mech', text: 'Drive disc', at: local(0.07, 0.07, C.HUB_Z_OFFSET * C.MM + 0.02), dx: 110, dy: -60 },
    { set: 'mech', text: 'Output shaft', at: local(0, 0, C.HUB_Z_OFFSET * C.MM), dx: 60, dy: 50 },
    { set: 'pin', text: 'Drive pin', at: polar(30, 0.065, C.HUB_Z_OFFSET * C.MM + 0.02), dx: 90, dy: -40, bare: true },
    { set: 'pin', text: 'Eccentric radius (65 mm)', at: polar(30, 0.033, C.HUB_Z_OFFSET * C.MM + 0.02), dx: -100, dy: 60 },
    { set: 'rod', text: 'Connecting link', at: polar(15, 0.12, C.HUB_Z_OFFSET * C.MM + 0.02), dx: -90, dy: -50 },
    { set: 'rod', text: 'Sliding rod', at: polar(30, 0.35, -0.0245), dx: -120, dy: 60 },
    { set: 'rod', text: 'Guide channel', at: polar(30, 0.28, 0.018), dx: -90, dy: 70 },
    { set: 'blade', text: 'Crank arm', at: polar(0, 0.4, -0.01), dx: 80, dy: -50, bare: true },
    { set: 'blade', text: 'Fixed pivot shaft', at: polar(0, 0.38, 0.02), dx: -110, dy: -40 },
    { set: 'blade', text: 'Linkage joint', at: polar(0, 0.42, -0.03), dx: 90, dy: 60, bare: true },
    { set: 'blade', text: 'Sliding rod', at: polar(30, 0.45, -0.0245), dx: -115, dy: -45 },
  ];
  let labelSet = null;

  const labelLayer = document.getElementById('explainLabels');
  const svg = document.createElementNS(SVG_NS, 'svg');
  labelLayer.append(svg);
  const labels = LABELS.map((def) => {
    const line = document.createElementNS(SVG_NS, 'line');
    const dot = document.createElementNS(SVG_NS, 'circle');
    dot.setAttribute('r', '4');
    svg.append(line, dot);
    const tag = document.createElement('div');
    tag.className = 'explain-tag';
    const text = document.createElement('span');
    text.textContent = def.text;
    tag.append(text);
    let bar = null;
    let value = null;
    if (def.set === 'sensor') {
      const reading = document.createElement('span');
      reading.className = 'reading';
      bar = document.createElement('i');
      reading.append(bar);
      value = document.createElement('b');
      reading.append(value);
      tag.append(reading);
    }
    labelLayer.append(tag);
    return { ...def, world: toWorld(def.at), line, dot, tag, bar, value };
  });
  const sensorLabels = labels.filter((l) => l.set === 'sensor');

  // Sun direction arrow
  const sunDir = new THREE.Vector3(0.35, 0.3, 0.88).normalize();
  const sunTip = toWorld(tipPanelCentre(SENSOR_ARMS[0]).setZ(0.04));
  const arrow = new THREE.Group();
  arrow.add(rod(new THREE.Vector3(0, 0, 0.8), new THREE.Vector3(0, 0, 0.1), 0.015, xray));
  const cone = new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.1, 16), xray);
  cone.position.z = 0.05;
  cone.rotation.x = Math.PI / 2;
  arrow.add(cone);
  arrow.visible = false;
  scene.add(arrow);
  let arrowGrow = 0;

  const projected = new THREE.Vector3();
  function placeLabels() {
    camera.updateMatrixWorld();
    const w = window.innerWidth;
    const h = window.innerHeight;
    for (const l of labels) {
      if (l.set !== labelSet) continue;
      projected.copy(l.world).project(camera);
      const shown = projected.z < 1;
      const x = (projected.x * 0.5 + 0.5) * w;
      const y = (-projected.y * 0.5 + 0.5) * h;
      for (const el of [l.line, l.dot, l.tag]) el.style.visibility = shown ? '' : 'hidden';
      l.dot.setAttribute('cx', x);
      l.dot.setAttribute('cy', y);
      const start = l.bare ? 16 / Math.hypot(l.dx, l.dy) : 0;
      l.line.setAttribute('x1', x + l.dx * start);
      l.line.setAttribute('y1', y + l.dy * start);
      l.line.setAttribute('x2', x + l.dx);
      l.line.setAttribute('y2', y + l.dy);
      l.tag.style.transform =
        `translate(${x + l.dx}px, ${y + l.dy}px) translate(${l.dx < 0 ? '-100%' : '0'}, -50%)`;
    }

    if (step.readings) {
      const grow = easeOut((t - 0.15) / 0.9);
      sensorLabels.forEach((l, k) => {
        const base = l.key === 'UL' ? READINGS.UL : READINGS.LR;
        const v = base * grow * (1 + 0.025 * Math.sin(t * 2.2 + k * 1.3) * grow);
        l.bar.style.width = `${v.toFixed(1)}%`;
        l.value.textContent = `${Math.round(v)}%`;
      });
    }
  }

  /* -------------------------------------------------------------- *
   * The 10 Steps
   * -------------------------------------------------------------- */

  const STEPS = [
    {
      chain: 0,
      short: 'Sunlight',
      title: 'Sunlight detection',
      text:
        'Two IP68 outdoor light sensors measure sunlight intensity falling on the façade. ' +
        'Using two sensors lets the controller compare readings, so one shaded sensor cannot control incorrectly.',
      notes:
        'Mounted at opposite snowflake tips (upper-left and lower-right). Both send readings to ' +
        'the controller.',
      view: 'sensor',
      sun: true,
      sensors: true,
      labels: 'sensor',
      readings: true,
      pose: () => 1,
    },
    {
      chain: 1,
      short: 'Controller',
      title: 'The controller decides the required blade angle',
      text:
        'The controller converts sensor readings into a target louvre angle (0°–45°). ' +
        'Low sunlight → 0°–10°; moderate → 15°–30°; strong direct → 35°–45°; high-wind alarm → 0° storm-safe.',
      notes:
        'The controller moves blades only when the difference between current and required angle ' +
        'exceeds a selected threshold -- avoiding unnecessary motor wear.',
      view: 'panel',
      diagram: 'controller',
      sun: true,
      sensors: true,
      pose: () => 1,
    },
    {
      chain: 2,
      short: 'Position command',
      title: 'The controller sends a position command',
      text:
        'The controller sends a position command to the 24 V DCL-10 actuator. ' +
        'Signal options: 0–10 V, 4–20 mA, or RS485/Modbus. The actuator provides position feedback.',
      notes:
        'Manufacturer data: adjustable 0°–90° range, 100 Nm standard torque, about 30 s for 90° ' +
        'of rotation, IP67. This design uses 45° of the 0°–90° range.',
      view: 'panel',
      diagram: 'command',
      pose: () => 1,
    },
    {
      chain: 3,
      short: 'Actuator + disc',
      title: 'The actuator rotates the central drive disc',
      text:
        'The DCL-10 is mounted inside the hexagonal hub with its shaft perpendicular to the façade. ' +
        'A steel drive disc is fixed to the shaft. It turns ≈45° for full blade movement, taking ≈15 s.',
      notes:
        '90° takes 30 s, so 45° takes 15 s. The disc is keyed or splined to the output shaft.',
      view: 'hub',
      hubOpen: true,
      mechVisible: true,
      ghostArms: true,
      labels: 'mech',
      tau: 0.25,
      pose: () => 1,
      mechPose: (t) => tiltCycle(t, MECH_CYCLE)[0],
    },
    {
      chain: 4,
      short: 'Pins',
      title: 'Six off-centre pins move around the actuator axis',
      text:
        'The disc carries six equally spaced drive pins at an eccentric radius. Each pin follows a ' +
        'circular path around the shaft. A connecting link takes each pin to the rod inside its arm.',
      notes:
        'The pins sit away from the disc centre (the eccentric radius), so each pin follows a ' +
        'circular path around the shaft.',
      view: 'hub',
      hubOpen: true,
      mechVisible: true,
      showOrbits: true,
      labels: 'pin',
      tau: 0.25,
      pose: () => 1,
      mechPose: (t) => tiltCycle(t, MECH_CYCLE)[0],
    },
    {
      chain: 5,
      short: 'Linkage',
      title: 'The connecting link turns rotation into straight-line pull',
      text:
        'Each sliding rod runs in a guide channel inside one of the six supporting arms. A link of fixed ' +
        'length joins the drive pin to the rod\'s inner end, so as the pin swings round it pulls the rod ' +
        'along the arm; the sideways part of the pin\'s travel is taken up by the link swinging over.',
      notes:
        'Disc rotation → pin swings round → link pulls the rod along its arm. All six pins share the ' +
        'same geometry, so all six rods move together by the same distance.',
      view: 'gap',
      hubOpen: true,
      mechVisible: true,
      focusHighlight: true,
      labels: 'rod',
      diagram: 'link',
      show: ['driveFocus'],
      tau: 0.25,
      pose: (g, t) => tiltToState(tiltCycle(t, MECH_CYCLE)[0]),
      mechPose: (t) => tiltCycle(t, MECH_CYCLE)[0],
    },
    {
      chain: 6,
      short: 'Blades',
      title: 'Each sliding rod moves eight blades',
      text:
        'One rod per arm connects to eight blades — the four on each side of it — through crank ' +
        'arms and linkage joints. ' +
        'When the rod moves inward, the crank arms rotate all eight blades together. ' +
        'One actuator moves all six rods, so all 48 blades rotate simultaneously.',
      notes:
        'Each blade has a fixed pivot shaft, a crank arm, a pinned or spherical linkage joint, ' +
        'and a connection to the common rod.',
      view: 'gap',
      hubOpen: false,
      mechVisible: true,
      focusHighlight: true,
      showCranks: true,
      show: ['slats', 'driveFocus'],
      labels: 'blade',
      tau: 0.25,
      pose: (g, t) => tiltToState(tiltCycle(t, MECH_CYCLE)[0]),
      mechPose: (t) => tiltCycle(t, MECH_CYCLE)[0],
      zoomOut: true,
    },
    {
      chainAll: true,
      title: 'Shading movement (0° → 45°)',
      text:
        'The controller commands the actuator → disc rotates ≈45° → each pin pulls its sliding rod inward → ' +
        'crank arms rotate blades to ≈45° → feedback confirms → actuator stops. Real time ≈15 s.',
      view: 'oblique',
      hubOpen: false,
      mechVisible: true,
      show: ['driveAll'],
      directPose: true,
      liveBadge: 'step9',
      pose: (g, t) => tiltToState(step9Pose(t)),
      mechPose: (t) => step9Pose(t),
    },
    {
      chainAll: true,
      title: 'Return movement (45° → 0°)',
      text:
        'The actuator reverses → the six drive pins push the sliding rods outward → the rods push the blade ' +
        'crank arms → blades return toward 0° → feedback confirms → actuator stops. ' +
        'The mechanism can stop at any intermediate angle.',
      notes:
        'The mechanism can also stop at intermediate angles such as 10°, 20°, 30° or 40°.',
      view: 'oblique',
      hubOpen: false,
      mechVisible: true,
      show: ['driveAll'],
      directPose: true,
      liveBadge: 'step10',
      pose: (g, t) => tiltToState(step10Pose(t)),
      mechPose: (t) => step10Pose(t),
    },
  ];

  /* -------------------------------------------------------------- *
   * The chain strip, and the caption card
   * -------------------------------------------------------------- */

  const chainEl = document.getElementById('explainChain');
  const chain = STEPS.filter((s) => s.chain !== undefined);
  const chips = [];
  const chainArrows = [];
  chain.forEach((s, k) => {
    if (k > 0) {
      const a = document.createElement('div');
      a.className = 'chain-arrow';
      a.innerHTML = ARROW_SVG;
      chainEl.append(a);
      chainArrows.push(a);
    }
    const chip = document.createElement('div');
    chip.className = 'chain-step';
    const number = document.createElement('b');
    number.textContent = String(k + 1);
    chip.append(number, s.short);
    chainEl.append(chip);
    chips.push(chip);
  });

  function showChain(c) {
    if (c === undefined) {
      chainEl.hidden = true;
      return;
    }
    chainEl.hidden = false;
    if (c === 'all') {
      chips.forEach((chip) => {
        chip.classList.add('shown');
        chip.classList.remove('past');
        chip.classList.add('active');
      });
      chainArrows.forEach((a) => {
        a.classList.add('shown');
        a.classList.remove('past');
      });
      return;
    }
    chips.forEach((chip, k) => {
      chip.classList.toggle('shown', k <= c);
      chip.classList.toggle('past', k < c);
      chip.classList.toggle('active', k === c);
    });
    chainArrows.forEach((a, k) => {
      a.classList.toggle('shown', k + 1 <= c);
      a.classList.toggle('past', k + 1 < c);
    });
  }

  const card = document.getElementById('explainCard');
  const body = document.getElementById('explainBody');
  const countOut = document.getElementById('explainCount');
  const titleOut = document.getElementById('explainTitle');
  const textOut = document.getElementById('explainText');
  const notesOut = document.getElementById('explainNotes');
  const angleBadge = document.getElementById('explainAngleBadge');
  const hintOut = document.getElementById('explainHint');
  const dotsOut = document.getElementById('explainDots');
  const dots = STEPS.map(() => dotsOut.appendChild(document.createElement('i')));
  document.getElementById('explainExit').addEventListener('click', () => exit());
  let notesOn = false;

  function replay(el) {
    el.classList.remove('enter');
    void el.offsetWidth;
    el.classList.add('enter');
  }

  /* -------------------------------------------------------------- *
   * Running it
   * -------------------------------------------------------------- */

  const states = new Float32Array(C.MODULE_COUNT * GAPS);
  const pose = new Float32Array(GAPS);
  let active = false;
  let index = 0;
  let step = null;
  let t = 0;

  function fly(viewName) {
    const view = VIEWS[viewName];
    flyTo(toWorld(local(...view.eye)), toWorld(local(...view.at)));
  }

  function go(i) {
    const prev = step;
    index = i;
    step = STEPS[i];
    t = 0;
    delete step._zoomed;

    // Immediately snap pose to step's initial t=0 angle
    if (step.pose) {
      const initial = step.pose(0, 0);
      for (let g = 0; g < GAPS; g++) pose[g] = initial;
    }

    if (!prev || prev.view !== step.view) fly(step.view);

    if (step.sun && !arrow.visible) {
      arrowGrow = 0;
      arrow.visible = true;
    } else if (!step.sun) {
      arrow.visible = false;
    }

    // Overlay visibility
    const show = step.show ?? [];
    for (const key of ['slats', 'driveFocus', 'driveAll']) {
      for (const o of overlays[key]) o.mesh.visible = show.includes(key);
    }
    hinges.visible = show.includes('hinges');

    // Hub cover: open inspection cutaway (NO TRANSPARENCY)
    setHubCover(!!step.hubOpen);

    // Mechanism parts & highlights
    mechanism.setVisible(!!step.mechVisible);
    mechanism.showOrbits(!!step.showOrbits);
    mechanism.setFocusHighlight(!!step.focusHighlight);
    mechanism.setSeeThrough(!!step.ghostArms);

    // Crank arm overlays
    for (const { group: armGroup } of crankArms) {
      armGroup.visible = !!step.showCranks;
    }

    // Angle badge
    if (angleBadge) {
      angleBadge.hidden = !step.liveBadge;
    }

    labelSet = step.labels ?? null;
    labelLayer.hidden = !labelSet;
    labelLayer.classList.toggle('readings', !!step.readings);
    for (const l of labels) {
      const on = l.set === labelSet;
      for (const el of [l.line, l.dot, l.tag]) el.style.display = on ? '' : 'none';
      if (l.bare) l.dot.style.display = 'none';
    }

    showDiagram(step.diagram);

    // Chain strip
    if (step.chainAll) {
      showChain('all');
    } else if (step.chain !== undefined) {
      showChain(step.chain);
    } else {
      showChain(undefined);
    }

    const last = i === STEPS.length - 1;
    countOut.textContent = `Step ${i + 1} of ${STEPS.length}`;
    titleOut.textContent = step.title;
    textOut.textContent = step.text;
    notesOut.textContent = step.notes ?? '';
    notesOut.hidden = !(notesOn && step.notes);
    const keys = last
      ? 'Left-click: finish · Right-click: back'
      : i === 0
        ? 'Left-click: next · Esc: exit'
        : 'Left-click: next · Right-click: back';
    hintOut.textContent = step.notes ? `${keys} · N: notes` : keys;
    dots.forEach((d, k) => d.classList.toggle('on', k === i));
    replay(body);
  }

  function next() {
    if (index < STEPS.length - 1) go(index + 1);
    else exit();
  }

  function back() {
    if (index > 0) go(index - 1);
  }

  /** @param from the louvre states on show now, so the explanation starts from them. */
  function enter(from) {
    if (active) return;
    for (let g = 0; g < GAPS; g++) pose[g] = from[focus * GAPS + g];
    active = true;
    step = null;
    card.hidden = false;
    document.body.classList.add('explaining');
    standIn(true);
    go(0);
  }

  function exit() {
    if (!active) return;
    active = false;
    card.hidden = true;
    labelLayer.hidden = true;
    if (angleBadge) angleBadge.hidden = true;
    document.body.classList.remove('explaining');
    showDiagram(null);
    showChain(undefined);
    standIn(false);
    setGhost(1);
    setArmGhost(1);
    setHubCover(false);
    mechanism.setVisible(false);
    mechanism.showOrbits(false);
    mechanism.setFocusHighlight(false);
    mechanism.setSeeThrough(false);
    for (const { group: armGroup } of crankArms) armGroup.visible = false;
    for (const s of sensors) {
      s.halo.visible = false;
      s.shade.visible = false;
    }
    arrow.visible = false;
    hinges.visible = false;
    for (const list of Object.values(overlays)) for (const o of list) o.mesh.visible = false;
    onExit?.();
  }

  /** Advances the step's motion; returns the louvre states to draw. */
  function update(dt) {
    t += dt;

    if (step.directPose) {
      for (let g = 0; g < GAPS; g++) {
        pose[g] = step.pose(g, t);
      }
    } else {
      const k = 1 - Math.exp(-dt / (step.tau ?? 0.4));
      for (let g = 0; g < GAPS; g++) {
        const target = step.pose(g, t);
        const d = target - pose[g];
        pose[g] = Math.abs(d) < 5e-4 ? target : pose[g] + d * k;
      }
    }
    for (let m = 0; m < C.MODULE_COUNT; m++) states.set(pose, m * GAPS);

    // Live angle badge text
    if (angleBadge && !angleBadge.hidden) {
      if (step.liveBadge === 'step9') {
        const theta = step9Pose(t);
        const status = theta < 0.5 ? 'Actuator ready at 0°' : theta >= 44.5 ? 'Target 45° reached · Actuator stopped' : 'Rotating 0° → 45°';
        angleBadge.textContent = `Blade angle: 0° → 45° · Live: ${Math.round(theta)}° [${status}]`;
      } else if (step.liveBadge === 'step10') {
        const theta = step10Pose(t);
        let status = 'Reversing 45° → 0°';
        if (Math.abs(theta - 45) < 0.5) status = 'Starting from 45°';
        else if (Math.abs(theta - 30) < 0.5) status = 'Intermediate stop: 30°';
        else if (Math.abs(theta - 20) < 0.5) status = 'Intermediate stop: 20°';
        else if (Math.abs(theta - 10) < 0.5) status = 'Intermediate stop: 10°';
        else if (theta < 0.5) status = 'Full return reached (0°) · Actuator stopped';
        angleBadge.textContent = `Blade angle: 45° → 0° · Live: ${Math.round(theta)}° [${status}]`;
      }
    }

    // Step 8 dynamic zoom-out partway
    if (step.zoomOut && t > 3.2 && !step._zoomed) {
      step._zoomed = true;
      fly('oblique');
      for (const o of overlays.driveAll) o.mesh.visible = true;
      for (const o of overlays.slats) o.mesh.visible = false;
    }

    if (arrow.visible) {
      arrowGrow = Math.min(1, arrowGrow + dt / 0.45);
      const pulse = 0.05 * (0.5 + 0.5 * Math.sin(t * 5));
      arrow.position.copy(sunTip).addScaledVector(sunDir, pulse);
      arrow.quaternion.setFromUnitVectors(UP, sunDir);
      arrow.scale.setScalar(1 - (1 - arrowGrow) ** 3);
    }

    // Arm ghost: the steps that show the drive fade the arms over it
    const armTarget = step.ghostArms ? ARM_GHOST_OPACITY : 1;
    const a = armGhost + (armTarget - armGhost) * (1 - Math.exp(-dt / 0.3));
    setArmGhost(Math.abs(armTarget - a) < 1e-3 ? armTarget : a);

    // Sensor tip ghost
    const ghostTarget = step.sensors ? GHOST_OPACITY : 1;
    const g = ghost + (ghostTarget - ghost) * (1 - Math.exp(-dt / 0.3));
    setGhost(Math.abs(ghostTarget - g) < 1e-3 ? ghostTarget : g);
    const sensing = clamp01((1 - ghost) / (1 - GHOST_OPACITY));
    for (const s of sensors) {
      s.halo.visible = sensing > 0.01;
      s.halo.material.opacity = sensing * (0.25 + 0.75 * s.level) * (0.8 + 0.2 * Math.sin(t * 4));
      s.shade.visible = sensing > 0.01;
      s.shade.material.opacity = sensing * (1 - s.level) * 0.55;
    }

    // Mechanism parts
    if (step.mechPose) {
      const theta = step.mechPose(t);
      mechanism.tick(theta);
    }

    // Update crank arm overlay positions in lockstep with blades
    if (step.showCranks) {
      const phi = pose[focusGap] * 90 * DEG;
      crankArms.forEach(({ group: armGroup, armMesh, hingeBall, lugBall, entry }) => {
        armGroup.visible = true;
        const turn = new THREE.Quaternion().setFromAxisAngle(
          new THREE.Vector3(1, 0, 0),
          entry.hingeSign > 0 ? phi : -phi
        );
        const hingeLocal = entry.origin.clone();
        const lugLocal = entry.lug.clone()
          .applyQuaternion(turn)
          .applyQuaternion(entry.quat)
          .add(entry.origin);

        const hingeWorld = toWorld(hingeLocal);
        const lugWorld = toWorld(lugLocal);
        const dir = new THREE.Vector3().subVectors(lugWorld, hingeWorld);
        const len = dir.length();

        armMesh.scale.set(1, len, 1);
        armMesh.position.addVectors(hingeWorld, lugWorld).multiplyScalar(0.5);
        armMesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());

        hingeBall.position.copy(hingeWorld);
        lugBall.position.copy(lugWorld);
      });
    } else {
      for (const { group: armGroup } of crankArms) armGroup.visible = false;
    }

    if (diagram) diagram.tick(t);
    return states;
  }

  /** After the facade has drawn this frame's states: bring the highlights and labels along. */
  function afterBlades() {
    for (const list of Object.values(overlays)) {
      for (const o of list) if (o.mesh.visible) o.sync();
    }
    if (!labelLayer.hidden) placeLabels();
  }

  /* -------------------------------------------------------------- *
   * Input
   * -------------------------------------------------------------- */

  let down = null;
  canvas.addEventListener('pointerdown', (e) => {
    if (active) down = { x: e.clientX, y: e.clientY, time: performance.now(), button: e.button };
  });
  canvas.addEventListener('pointerup', (e) => {
    if (!active || !down || e.button !== down.button) return;
    const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y);
    const quick = performance.now() - down.time < 450;
    down = null;
    if (moved > 6 || !quick) return;
    if (e.button === 0) next();
    else if (e.button === 2) back();
  });
  canvas.addEventListener('contextmenu', (e) => {
    if (active) e.preventDefault();
  });
  window.addEventListener('keydown', (e) => {
    if (!active) return;
    if (e.key === 'ArrowRight') next();
    else if (e.key === 'ArrowLeft') back();
    else if (e.key === 'Escape') exit();
    else if (e.key === 'n' || e.key === 'N') {
      notesOn = !notesOn;
      notesOut.hidden = !(notesOn && step?.notes);
    }
  });

  return {
    enter,
    exit,
    update,
    afterBlades,
    isActive: () => active,
  };
}

/* ------------------------------------------------------------------ *
 * Helpers
 * ------------------------------------------------------------------ */

function easeOut(t) {
  const c = Math.max(0, Math.min(1, t));
  return 1 - (1 - c) ** 3;
}

function clamp01(v) {
  return Math.max(0, Math.min(1, v));
}

function rod(a, b, r, mat) {
  const dir = new THREE.Vector3().subVectors(b, a);
  const len = dir.length();
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, 8), mat);
  m.position.addVectors(a, b).multiplyScalar(0.5);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
  return m;
}

function ringGlow(innerFraction) {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const g = ctx.createRadialGradient(size / 2, size / 2, (size / 2) * innerFraction, size / 2, size / 2, size / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.35, 'rgba(255,230,120,0.85)');
  g.addColorStop(0.7, 'rgba(255,180,40,0.3)');
  g.addColorStop(1, 'rgba(255,140,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  return new THREE.CanvasTexture(canvas);
}
