/**
 * Explanation mode: flies in to one snowflake and walks through how it works,
 * a step at a time. Left-click (or the right arrow key) moves on, right-click
 * (or the left arrow) goes back, N shows the narration, Escape leaves. A drag
 * still orbits the camera.
 *
 * It opens with the control chain -- IP68 sensors, the controller, the DCL-10
 * actuator, the drive disc, eccentric pins, slotted rods, and blades -- built
 * up step by step in a strip across the top, earlier steps greyed.
 *
 * The 3D snowflake module is the primary visual for every step. The 2D diagrams
 * only appear as smaller support panels where the 3D cannot show something
 * clearly: the controller table (step 2), the signal interface (step 3), the
 * pin-in-slot detail (step 6), and the formula (step 7).
 *
 * Explanation-only 3D parts (DCL-10 actuator, drive disc, eccentric pins,
 * slots, rod extensions, crank arms) exist only in this mode, on the focus
 * module's stand-in copy.
 *
 * While it runs it owns the louvre states. Every module takes the same pose as
 * the one being explained, so the whole face reads as one. Highlights are
 * extra meshes laid over the real parts -- copies of the focus module's
 * instances, re-read from the facade each frame.
 */

import * as THREE from 'three';
import * as C from './constants.js';
import {
  buildBladeLayout,
  buildModuleStaticGeometry,
  buildTipGeometry,
  buildHubGeometry,
  slatOutlines,
  tipPanelCentre,
  MODULE_BLADE_COUNT,
  sliderShift,
} from './snowflakeModule.js';
import { buildLdrSensor } from './ldrSensor.js';
import { buildControlDiagrams, tiltCycle } from './controlDiagrams.js';
import { buildExplainMechanism } from './explainMechanism.js';

const DEG = Math.PI / 180;
const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const easeOut = (x) => 1 - (1 - clamp01(x)) ** 3;

const GAPS = C.ARM_COUNT;
const ROW_COUNT = C.SLAT_WIDTHS.length;
const PER_ROW = MODULE_BLADE_COUNT / ROW_COUNT;

const HIGHLIGHT = 0xff8a1f;
const SVG_NS = 'http://www.w3.org/2000/svg';

/** Toward the sun, module-local: +X along the face, +Y up, +Z out of it. From the upper left. */
const SUN_DIR = new THREE.Vector3(-0.55, 0.5, 0.67).normalize();

/** The two IP68 sensor arms: upper-left (arm 5) and lower-right (arm 2). */
const SENSOR_ARMS = [5, 2];

/** Each sensor's reading with the sun there, percent of full light. */
const READINGS = { UL: 92, LR: 21 };

/** One open-close stroke of the mechanism steps, seconds. */
const STROKE_PERIOD = 4.5;
/** How see-through the sensor tips' frames go, 0..1 opacity. */
const GHOST_OPACITY = 0.18;

/**
 * Camera views, module-local metres: eye and look-at point.
 */
const VIEWS = {
  front: { eye: [0.3, 0.2, 3.4], at: [0, 0, 0] },
  oblique: { eye: [1.6, 0.5, 2.4], at: [0, 0, 0] },
  // Two sensor tips, between the chain strip above and the caption card below.
  sensor: { eye: [0.3, 0.1, 2.9], at: [0, -0.12, 0] },
  // The module left of centre, clear of the diagram panel on the right.
  panel: { eye: [1.6, -0.05, 5.0], at: [1.43, -0.2, 0] },
  // Close on the hub to show disc/actuator/pins.
  hub: { eye: [0.15, 0.3, 1.5], at: [0, 0, 0] },
  // Close on one gap (the focus gap).
  gap: { eye: [0.95, 0.45, 1.5], at: [0.45, 0, 0] },
  // Side view.
  side: { eye: [1.65, 0.4, 0.65], at: [0.42, 0, -0.02] },
};

const stroke = (t) => 0.5 + 0.5 * Math.cos((2 * Math.PI * t) / STROKE_PERIOD);
/** A blade tilt from open (0°, edge-on) in degrees, as a louvre state (1 = open). */
const tiltToState = (deg) => 1 - deg / 90;

const ARROW_SVG =
  '<svg viewBox="0 0 40 20" width="40" height="20" aria-hidden="true">' +
  '<line x1="3" y1="10" x2="26" y2="10" stroke="#F0932B" stroke-width="6" stroke-linecap="round"/>' +
  '<path d="M23,2 L38,10 L23,18 z" fill="#F0932B"/></svg>';

/** Tilt cycle for the mechanism demo steps. */
const MECH_CYCLE = { to: 45, up: 2.5, hold: 1.5, down: 2.0, rest: 1.0 };

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
   * The sun arrow, landing on the sensor that faces it
   * -------------------------------------------------------------- */

  const arrow = buildArrow();
  arrow.visible = false;
  scene.add(arrow);

  const UP = new THREE.Vector3(0, 1, 0);
  const sunward = SENSOR_ARMS.reduce((best, arm) => {
    const c = tipPanelCentre(arm);
    const b = tipPanelCentre(best);
    return c.x * SUN_DIR.x + c.y * SUN_DIR.y > b.x * SUN_DIR.x + b.y * SUN_DIR.y ? arm : best;
  });
  const sunDir = SUN_DIR.clone().applyQuaternion(faceQuat);
  const sunTip = toWorld(tipPanelCentre(sunward).setZ(0.03));
  let arrowGrow = 0;

  /* -------------------------------------------------------------- *
   * Highlights over the real parts
   * -------------------------------------------------------------- */

  const glow = new THREE.MeshStandardMaterial({
    color: 0xffa04a,
    emissive: HIGHLIGHT,
    emissiveIntensity: 0.45,
    metalness: 0.3,
    roughness: 0.5,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -4,
  });
  const xray = new THREE.MeshBasicMaterial({
    color: HIGHLIGHT,
    transparent: true,
    opacity: 0.9,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
    fog: false,
  });

  const { bladeMeshes, carriageMesh, linkMesh, lugMesh } = facade.meshes;

  /** A copy of some of a mesh's instances, re-read each frame so it follows them. */
  function mirror(source, indices, material, renderOrder) {
    const mesh = new THREE.InstancedMesh(source.geometry, material, indices.length);
    mesh.frustumCulled = false;
    mesh.renderOrder = renderOrder;
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
   * The focus module's own copy, with see-through sensor tips and hub
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

  // Hub as separate meshes for see-through control
  const ghostHubAlu = staticMesh.material.clone();
  const ghostHubPv = pvMesh.material.clone();
  ghostHubAlu.transparent = true;
  ghostHubPv.transparent = true;
  {
    const rest = buildModuleStaticGeometry({ omitTips: SENSOR_ARMS, omitHub: true });
    const tips = buildTipGeometry(SENSOR_ARMS);
    const hubGeo = buildHubGeometry();
    for (const [geometry, material] of [
      [rest.aluminium, staticMesh.material],
      [rest.pv, pvMesh.material],
      [tips.aluminium, ghostAluminium],
      [tips.pv, ghostPv],
      [hubGeo.aluminium, ghostHubAlu],
      [hubGeo.pv, ghostHubPv],
    ]) {
      const mesh = new THREE.Mesh(geometry, material);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.userData.noAO = material.transparent;
      standInCopy.add(mesh);
    }
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
   * Explanation-only mechanism parts (DCL-10, disc, pins, etc.)
   * -------------------------------------------------------------- */

  // Carriage inner end position (mm from centre along bisector)
  const carriageStart = 456; // approximate, from buildCarriageGeometry
  const mechanism = buildExplainMechanism(standInCopy, bisectors, carriageStart);

  // Crank arm overlays for the focus gap's blades
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

  let hubGhost = 1;
  function setHubGhost(opacity) {
    hubGhost = opacity;
    ghostHubAlu.opacity = opacity;
    ghostHubPv.opacity = opacity;
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
    if (!diagram) return;
    diagramShow.replaceChildren(diagram.g);
    diagramSvg.setAttribute('viewBox', diagram.viewBox.join(' '));
    diagram.tick(0);
    replay(diagramPanel);
  }

  /* -------------------------------------------------------------- *
   * Labels
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
    { set: 'mech', text: 'DCL-10 actuator', at: local(0, 0, C.HUB_Z_OFFSET * C.MM - 0.04), dx: -100, dy: 80 },
    { set: 'mech', text: 'Drive disc', at: local(0.07, 0.07, C.HUB_Z_OFFSET * C.MM + 0.02), dx: 100, dy: -60 },
    { set: 'mech', text: 'Output shaft', at: local(0, 0, C.HUB_Z_OFFSET * C.MM), dx: 60, dy: 50 },
    { set: 'pin', text: 'Drive pin', at: local(0.065, 0, C.HUB_Z_OFFSET * C.MM + 0.02), dx: 80, dy: -40, bare: true },
    { set: 'pin', text: 'Eccentric radius', at: local(0.033, 0, C.HUB_Z_OFFSET * C.MM + 0.02), dx: -90, dy: 60 },
    { set: 'rod', text: 'Transverse slot', at: local(0.065, 0, C.HUB_Z_OFFSET * C.MM + 0.02), dx: -80, dy: -50 },
    { set: 'rod', text: 'Sliding rod', at: polar(0, 0.35, -0.03), dx: 100, dy: -40 },
    { set: 'rod', text: 'Guide channel', at: polar(0, 0.25, 0), dx: -90, dy: 70 },
    { set: 'blade', text: 'Crank arm', at: polar(0, 0.4, -0.01), dx: 80, dy: -50, bare: true },
    { set: 'blade', text: 'Fixed pivot shaft', at: polar(0, 0.38, 0.02), dx: -100, dy: -40 },
    { set: 'blade', text: 'Linkage joint', at: polar(0, 0.42, -0.03), dx: 90, dy: 60, bare: true },
    { set: 'blade', text: 'Sliding rod', at: polar(0, 0.30, -0.03), dx: -80, dy: 80 },
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
      value.className = 'value';
      tag.append(reading, value);
    }
    labelLayer.append(tag);
    return { ...def, world: toWorld(def.at), line, dot, tag, bar, value };
  });

  const sensorLabels = labels.filter((l) => l.set === 'sensor');

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
   * The steps
   * -------------------------------------------------------------- */

  const STEPS = [
    {
      chain: 0,
      short: 'Sensors',
      title: 'Sunlight detection',
      text:
        'Two IP68 outdoor light sensors measure the sunlight intensity falling on the façade. ' +
        'Using two sensors lets the controller compare light levels, so one isolated or shaded ' +
        'sensor cannot control the module incorrectly.',
      notes:
        'The sensors send their readings to the Arduino-based controller. The upper-left sensor ' +
        'reads high (in sun) while the lower-right reads low (in shade).',
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
        'The controller converts sensor readings into a target angle between 0° and 45°. ' +
        'Low sunlight → 0°–10°; moderate → 15°–30°; strong direct → 35°–45°; ' +
        'high-wind alarm → 0° storm-safe position.',
      notes:
        'The controller does not move the blades continuously. It only commands a movement when ' +
        'the difference between the current angle and the required angle exceeds a threshold.',
      view: 'panel',
      sun: true,
      sensors: true,
      labels: 'sensor',
      diagram: 'controller',
      pose: () => 1,
    },
    {
      chain: 2,
      short: 'Position command',
      title: 'The controller sends a position command',
      text:
        'The Arduino-based controller sends a position command to the 24 V DCL-10 actuator. ' +
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
      hubGhost: true,
      mechVisible: true,
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
        'circular path around the shaft. Pins engage transverse slots — not rigidly connected to the rods.',
      notes:
        'The pins sit away from the disc centre (the eccentric radius), so each pin follows a ' +
        'circular path around the shaft.',
      view: 'hub',
      hubGhost: true,
      mechVisible: true,
      showOrbits: true,
      labels: 'pin',
      tau: 0.25,
      pose: () => 1,
      mechPose: (t) => tiltCycle(t, MECH_CYCLE)[0],
    },
    {
      chain: 5,
      short: 'Slotted rods',
      title: 'The slotted rod converts rotation into linear movement',
      text:
        'Each sliding rod runs in a guide channel along the centre line of each region. The pin\'s radial ' +
        'component pushes the rod; the sideways component is absorbed by the pin sliding across the slot.',
      notes:
        'Disc rotation → pin circular movement → guided rod linear movement. All six pins share the ' +
        'same geometry, so all six rods move together by the same distance.',
      view: 'gap',
      hubGhost: true,
      mechVisible: true,
      labels: 'rod',
      diagram: 'slot',
      show: ['driveFocus'],
      tau: 0.25,
      pose: (g, t) => tiltToState(tiltCycle(t, MECH_CYCLE)[0]),
      mechPose: (t) => tiltCycle(t, MECH_CYCLE)[0],
    },
    {
      // No chain — calculation step, chain strip hidden
      title: 'Required slider movement',
      text:
        'With crank arm a = 60 mm and θ = 45°, the chord movement is s = 2a·sin(θ/2) ≈ 46 mm. ' +
        'A pin radius of ≈65 mm working through 45° gives the same stroke.',
      notes:
        'Design values: eccentric pin radius ≈ 65 mm, slider stroke ≈ 46 mm, crank arm ≈ 60 mm, ' +
        'blade rotation 0°–45°.',
      view: 'gap',
      diagram: 'calc',
      mechVisible: true,
      showCranks: true,
      show: ['slats', 'hinges'],
      labels: 'blade',
      tau: 0.25,
      pose: (g, t) => tiltToState(tiltCycle(t, MECH_CYCLE)[0]),
      mechPose: (t) => tiltCycle(t, MECH_CYCLE)[0],
    },
    {
      chain: 6,
      short: 'Blades',
      title: 'Each sliding rod moves eight blades',
      text:
        'One rod per region connects to eight blades through crank arms and linkage joints. ' +
        'When the rod moves inward, the crank arms rotate all eight blades together. ' +
        'One actuator moves all six rods, so all 48 blades rotate simultaneously.',
      notes:
        'Each blade has a fixed pivot shaft, a crank arm, a pinned or spherical linkage joint, ' +
        'and a connection to the common rod.',
      view: 'gap',
      mechVisible: true,
      showCranks: true,
      show: ['driveFocus'],
      labels: 'blade',
      tau: 0.25,
      pose: (g, t) => tiltToState(tiltCycle(t, MECH_CYCLE)[0]),
      mechPose: (t) => tiltCycle(t, MECH_CYCLE)[0],
      zoomOut: true, // zoom from gap to oblique partway
    },
    {
      chainAll: true,
      title: 'Shading movement (0° → 45°)',
      text:
        'The controller commands the actuator → disc rotates ≈45° → each pin pulls its sliding rod inward → ' +
        'crank arms rotate blades to ≈45° → feedback confirms → actuator stops. Real time ≈15 s.',
      view: 'oblique',
      hubGhost: true,
      mechVisible: true,
      show: ['driveAll'],
      tau: 0.15,
      pose: (g, t) => {
        const [theta] = tiltCycle(t, { to: 45, up: 4.0, hold: 3.0, down: 0.001, rest: 2.0 });
        return tiltToState(theta);
      },
      mechPose: (t) => tiltCycle(t, { to: 45, up: 4.0, hold: 3.0, down: 0.001, rest: 2.0 })[0],
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
      hubGhost: true,
      mechVisible: true,
      show: ['driveAll'],
      tau: 0.15,
      pose: (g, t) => {
        // Close 45→0, then intermediate stops
        const totalCycle = 14;
        const ct = t % totalCycle;
        const intermediateStops = [40, 30, 20, 10];
        let theta;
        if (ct < 4) {
          theta = 45 * (1 - easeOut(ct / 3.5));
        } else if (ct < 12) {
          const phase = (ct - 4) / 2;
          const idx = Math.min(Math.floor(phase), intermediateStops.length - 1);
          const frac = phase - idx;
          if (frac < 0.3) {
            const from = idx === 0 ? 0 : intermediateStops[idx - 1];
            theta = from + (intermediateStops[idx] - from) * easeOut(frac / 0.3);
          } else {
            theta = intermediateStops[idx];
          }
        } else {
          theta = 10 * (1 - easeOut((ct - 12) / 1.5));
        }
        return tiltToState(theta);
      },
      mechPose: (t) => {
        const totalCycle = 14;
        const ct = t % totalCycle;
        const intermediateStops = [40, 30, 20, 10];
        if (ct < 4) return 45 * (1 - easeOut(ct / 3.5));
        if (ct < 12) {
          const phase = (ct - 4) / 2;
          const idx = Math.min(Math.floor(phase), intermediateStops.length - 1);
          const frac = phase - idx;
          if (frac < 0.3) {
            const from = idx === 0 ? 0 : intermediateStops[idx - 1];
            return from + (intermediateStops[idx] - from) * easeOut(frac / 0.3);
          }
          return intermediateStops[idx];
        }
        return 10 * (1 - easeOut((ct - 12) / 1.5));
      },
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

    // Mechanism parts
    mechanism.setVisible(!!step.mechVisible);
    mechanism.showOrbits(!!step.showOrbits);

    // Crank arm overlays
    for (const arm of crankArms) arm.visible = !!step.showCranks;

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
    document.body.classList.remove('explaining');
    showDiagram(null);
    showChain(undefined);
    standIn(false);
    setGhost(1);
    setHubGhost(1);
    mechanism.setVisible(false);
    mechanism.showOrbits(false);
    for (const arm of crankArms) arm.visible = false;
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

    const k = 1 - Math.exp(-dt / (step.tau ?? 0.4));
    for (let g = 0; g < GAPS; g++) {
      const target = step.pose(g, t);
      const d = target - pose[g];
      pose[g] = Math.abs(d) < 5e-4 ? target : pose[g] + d * k;
    }
    for (let m = 0; m < C.MODULE_COUNT; m++) states.set(pose, m * GAPS);

    if (arrow.visible) {
      arrowGrow = Math.min(1, arrowGrow + dt / 0.45);
      const pulse = 0.05 * (0.5 + 0.5 * Math.sin(t * 5));
      arrow.position.copy(sunTip).addScaledVector(sunDir, pulse);
      arrow.quaternion.setFromUnitVectors(UP, sunDir);
      arrow.scale.setScalar(1 - (1 - arrowGrow) ** 3);
    }

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

    // Hub ghost
    const hubTarget = step.hubGhost ? GHOST_OPACITY : 1;
    const hg = hubGhost + (hubTarget - hubGhost) * (1 - Math.exp(-dt / 0.3));
    setHubGhost(Math.abs(hubTarget - hg) < 1e-3 ? hubTarget : hg);

    // Mechanism parts
    if (step.mechPose) {
      const theta = step.mechPose(t);
      mechanism.tick(theta);
    }

    // Update crank arm overlay positions
    if (step.showCranks) {
      const phi = (1 - pose[focusGap]) * 90 * DEG;
      focusBlades.forEach((entry, bi) => {
        const arm = crankArms[bi];
        if (!arm.visible) return;
        // The crank arm runs from the hinge pin to the lug on the blade's back.
        // The blade entry has origin (hinge), quat, and grip (in slat frame).
        const hingeWorld = toWorld(entry.origin.clone());
        const gripWorld = entry.grip.clone()
          .applyQuaternion(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), entry.hingeSign * phi))
          .applyQuaternion(entry.quat)
          .add(entry.origin);
        const gripW = toWorld(gripWorld);
        const dir = new THREE.Vector3().subVectors(gripW, hingeWorld);
        const len = dir.length();
        arm.scale.set(1, len / (arm.geometry.parameters.height || 0.033), 1);
        arm.position.addVectors(hingeWorld, gripW).multiplyScalar(0.5);
        arm.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
      });
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
      notesOut.hidden = !(notesOn && step.notes);
    }
  });

  return { enter, exit, update, afterBlades, states, isActive: () => active };
}

/**
 * The sun, as an arrow: tip at the origin pointing down -Y, body up +Y.
 */
function buildArrow() {
  const material = new THREE.MeshBasicMaterial({ color: HIGHLIGHT, toneMapped: false, fog: false });
  const headLength = 0.24;
  const shaftLength = 1.1;

  const head = new THREE.ConeGeometry(0.085, headLength, 24);
  head.rotateX(Math.PI);
  head.translate(0, headLength / 2, 0);

  const shaft = new THREE.CylinderGeometry(0.028, 0.028, shaftLength, 16);
  shaft.translate(0, headLength + shaftLength / 2, 0);

  const group = new THREE.Group();
  group.add(new THREE.Mesh(head, material), new THREE.Mesh(shaft, material));
  return group;
}

/** A soft ring of glow, drawn on a canvas. */
function ringGlow(clear) {
  const size = 128;
  const r = size / 2;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const g = canvas.getContext('2d');
  const gradient = g.createRadialGradient(r, r, 0, r, r, r);
  gradient.addColorStop(0, 'rgba(255, 255, 255, 0)');
  gradient.addColorStop(clear, 'rgba(255, 255, 255, 0)');
  gradient.addColorStop(Math.min(0.95, clear + 0.12), 'rgba(255, 255, 255, 0.8)');
  gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
  g.fillStyle = gradient;
  g.fillRect(0, 0, size, size);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/** A thin rod from a to b (world). */
function rod(a, b, radius, material) {
  const dir = new THREE.Vector3().subVectors(b, a);
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, dir.length(), 8), material);
  mesh.position.addVectors(a, b).multiplyScalar(0.5);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
  return mesh;
}
