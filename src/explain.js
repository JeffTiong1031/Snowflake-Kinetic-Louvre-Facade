/**
 * Explanation mode: flies in to one snowflake and walks through how it works,
 * a step at a time. Left-click (or the right arrow key) moves on, right-click
 * (or the left arrow) goes back, N shows the narration, Escape leaves. A drag
 * still orbits the camera.
 *
 * It opens with the control chain -- sunlight, the LDR sensors, the Arduino,
 * the servo, the linkage, the louvres -- built up step by step in a strip
 * across the top, earlier steps greyed. The sensors are shown in the 3D view;
 * the parts the 3D model does not have (the Arduino, the servo, the hub
 * linkage) are shown in a diagram panel beside it. Close-ups of the
 * mechanism follow.
 *
 * While it runs it owns the louvre states. Every module takes the same pose as
 * the one being explained, so the whole face reads as one. Highlights are
 * extra meshes laid over the real parts -- copies of the focus module's
 * instances, re-read from the facade each frame. And while it runs, the focus
 * module's fixed parts are drawn by a copy of their own, its instance in the
 * facade hidden, so the frames of its four sensor tips can turn see-through.
 */

import * as THREE from 'three';
import * as C from './constants.js';
import {
  buildBladeLayout,
  buildModuleStaticGeometry,
  buildTipGeometry,
  slatOutlines,
  tipPanelCentre,
  MODULE_BLADE_COUNT,
} from './snowflakeModule.js';
import { buildLdrSensor } from './ldrSensor.js';
import { buildControlDiagrams, tiltCycle, LINKAGE_CYCLE, LOUVRE_CYCLE } from './controlDiagrams.js';

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

/** Each LDR's reading with the sun there, percent of full light, by corner: the upper left faces it. */
const READINGS = { UL: 92, UR: 58, DL: 64, DR: 21 };

/** One open-close stroke of the mechanism steps, seconds. */
const STROKE_PERIOD = 4.5;
/** How see-through the sensor tips' frames go, 0..1 opacity. */
const GHOST_OPACITY = 0.18;

/**
 * Camera views, module-local metres: eye and look-at point. 'gap' and 'side'
 * look at the focus gap, the one pointing along +X.
 */
const VIEWS = {
  front: { eye: [0.3, 0.2, 3.4], at: [0, 0, 0] },
  gap: { eye: [0.95, 0.45, 1.5], at: [0.45, 0, 0] },
  side: { eye: [1.65, 0.4, 0.65], at: [0.42, 0, -0.02] },
  oblique: { eye: [1.6, 0.5, 2.4], at: [0, 0, 0] },
  // All four sensor tips, between the chain strip above and the caption card below.
  ldr: { eye: [0.3, 0.1, 2.9], at: [0, -0.12, 0] },
  // The module left of centre, clear of the diagram panel on the right.
  panel: { eye: [1.6, -0.05, 5.0], at: [1.43, -0.2, 0] },
};

const stroke = (t) => 0.5 + 0.5 * Math.cos((2 * Math.PI * t) / STROKE_PERIOD);
/** A blade tilt from open (0, edge-on) in degrees, as a louvre state (1 = open). */
const tiltToState = (deg) => 1 - deg / 90;
/** Which corner a point in the module's face is in: 'UL', 'UR', 'DL' or 'DR'. */
const corner = (p) => (p.y > 0 ? 'U' : 'D') + (p.x < 0 ? 'L' : 'R');

const ARROW_SVG =
  '<svg viewBox="0 0 40 20" width="40" height="20" aria-hidden="true">' +
  '<line x1="3" y1="10" x2="26" y2="10" stroke="#F0932B" stroke-width="6" stroke-linecap="round"/>' +
  '<path d="M23,2 L38,10 L23,18 z" fill="#F0932B"/></svg>';

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
  const sunward = C.LDR_ARMS.reduce((best, arm) => {
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
    polygonOffset: true, // drawn over the slat it copies
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -4,
  });
  /** Seen through whatever is in front, so the parts behind the slats show. */
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
      const [[x0], [x1]] = outlines[e.row]; // the first two corners lie on the hinge
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
   * The focus module's own copy, with see-through sensor tips
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
  {
    const rest = buildModuleStaticGeometry({ omitTips: C.LDR_ARMS });
    const tips = buildTipGeometry(C.LDR_ARMS);
    for (const [geometry, material] of [
      [rest.aluminium, staticMesh.material],
      [rest.pv, pvMesh.material],
      [tips.aluminium, ghostAluminium],
      [tips.pv, ghostPv],
    ]) {
      const mesh = new THREE.Mesh(geometry, material);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      // The see-through sensor frames are not surfaces for the ambient occlusion to shade.
      mesh.userData.noAO = material.transparent;
      standInCopy.add(mesh);
    }
  }

  // An LDR inside each sensor tip's frame. With the sun on them, each glows as
  // brightly as it reads, and the tips facing away from the sun lie in shade.
  const glowSize = 0.13;
  const glowTexture = ringGlow(((C.LDR_DIAMETER / 2) * C.MM * 1.15) / (glowSize / 2));
  const shadeZ = (C.TIP_PANEL_THICKNESS / 2 + C.TIP_PV_RISE + 2) * C.MM;
  const sensors = C.LDR_ARMS.map((arm) => {
    const centre = tipPanelCentre(arm);
    const at = centre.clone().setZ(C.LDR_DEPTH * C.MM);
    const ldr = buildLdrSensor();
    ldr.position.copy(at);
    standInCopy.add(ldr);

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

    // Shade: a dark diamond over the tip, as deep as the sensor is short of full light.
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

    return { halo, shade, level: READINGS[corner(centre)] / 100 };
  });
  scene.add(standInCopy);

  // The focus module's instance in the facade, and the one that hides it.
  const shownMatrix = new THREE.Matrix4();
  staticMesh.getMatrixAt(focus, shownMatrix); // fixed parts: this never changes
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

  /* -------------------------------------------------------------- *
   * The diagram panel: the parts the 3D model does not have
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
   * Labels, and the sensor signals into the Arduino diagram
   * -------------------------------------------------------------- */

  const polar = (deg, r, z) => local(Math.cos(deg * DEG) * r, Math.sin(deg * DEG) * r, z);
  const LABELS = [
    { set: 'frame', text: 'Hub', at: local(0, 0, 0.045), dx: -80, dy: 90 },
    { set: 'frame', text: 'Spine, faced with PV cells', at: polar(150, 0.62, 0.03), dx: -120, dy: -60 },
    { set: 'frame', text: 'PV panel at each tip', at: tipPanelCentre(1).setZ(0.02), dx: 110, dy: -30 },
    { set: 'frame', text: 'Chevron slats', at: polar(0, 0.45, 0.022), dx: 120, dy: 60 },
    ...C.LDR_ARMS.map((arm) => {
      const c = tipPanelCentre(arm);
      return {
        set: 'ldr',
        text: 'LDR sensor',
        key: corner(c),
        at: c.clone().setZ(C.LDR_DEPTH * C.MM),
        dx: Math.sign(c.x) * 40,
        dy: -Math.sign(c.y) * 60,
        bare: true, // no dot: it would sit right on the sensor
      };
    }),
  ];
  /** Which set of labels is up, if any. */
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
    if (def.set === 'ldr') {
      // The sensor's reading, shown in the LDR step.
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
  /** The LDR labels in analog-input order: upper left A0, upper right A1, lower left A2, lower right A3. */
  const ldrLabels = ['UL', 'UR', 'DL', 'DR'].map((k) => labels.find((l) => l.key === k));
  const signals = ldrLabels.map(() => {
    const path = document.createElementNS(SVG_NS, 'path');
    path.setAttribute('class', 'signal');
    path.style.display = 'none';
    svg.append(path);
    return path;
  });

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
      // A bare label's line stops short of its point, leaving what it names in view.
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
      ldrLabels.forEach((l, k) => {
        // Settled readings flicker a little, as a real analog input does.
        const v = READINGS[l.key] * grow * (1 + 0.025 * Math.sin(t * 2.2 + k * 1.3) * grow);
        l.bar.style.width = `${v.toFixed(1)}%`;
        l.value.textContent = `${Math.round(v)}%`;
      });
    }

    // Each sensor's signal, from its label across to its analog input in the diagram.
    if (step.signals && diagram === diagrams.arduino) {
      const ctm = diagramSvg.getScreenCTM();
      ldrLabels.forEach((l, k) => {
        const r = l.tag.getBoundingClientRect();
        const [sx, sy] = [r.right, r.top + r.height / 2];
        const [ix, iy] = diagram.inputs[k];
        const p = new DOMPoint(ix, iy).matrixTransform(ctm);
        const bend = Math.max(60, (p.x - sx) * 0.45);
        signals[k].setAttribute('d', `M${sx},${sy} C${sx + bend},${sy} ${p.x - bend},${p.y} ${p.x},${p.y}`);
        signals[k].setAttribute('stroke-dashoffset', -t * 40);
        signals[k].style.opacity = clamp01(t / 0.4);
      });
    }
  }

  /* -------------------------------------------------------------- *
   * The steps
   *
   * The control chain first (chain: its place in the strip), each with a
   * short visible line and the presenter's narration (notes, on N). Then the
   * mechanism close-ups.
   * -------------------------------------------------------------- */

  const STEPS = [
    {
      chain: 0,
      short: 'Sunlight',
      title: 'Sunlight',
      text: 'falls on the sensor module',
      notes:
        'Sunlight arrives from a specific direction. The dividers shade some LDRs while others ' +
        'receive direct light, so the sensors never read the same value.',
      view: 'ldr',
      sun: true,
      sensors: true,
      labels: 'ldr',
      pose: () => 1,
    },
    {
      chain: 1,
      short: 'LDR sensors',
      title: 'LDR Sensors',
      text: 'detect light intensity from four directions',
      notes:
        "Each LDR's resistance drops as light increases, producing four different analog voltages. " +
        'The difference between them encodes the sun’s direction.',
      view: 'ldr',
      sun: true,
      sensors: true,
      labels: 'ldr',
      readings: true,
      pose: () => 1,
    },
    {
      chain: 2,
      short: 'Arduino Uno',
      title: 'Arduino Uno',
      text: 'analyses data and calculates target louvre angle',
      notes:
        'The Arduino reads all four analog inputs, compares them to find which direction is ' +
        'brightest, and converts that into a target angle between 0 and 45 degrees.',
      view: 'panel',
      sun: true,
      sensors: true,
      labels: 'ldr',
      signals: true,
      diagram: 'arduino',
      pose: () => 1,
    },
    {
      chain: 3,
      short: 'SG90 servo',
      title: 'SG90 Servo Motor',
      text: 'receives signal and rotates',
      notes:
        'The Arduino sends a PWM control signal. The servo rotates its horn to the commanded ' +
        'position and holds it there.',
      view: 'panel',
      sun: true,
      diagram: 'servo',
      pose: () => 1,
    },
    {
      chain: 4,
      short: 'Linkage',
      title: 'Linkage Mechanism',
      text: 'transmits motion to all louvre blades',
      notes:
        'The linkage converts the single servo movement into synchronised motion, so every ' +
        'blade turns together by the same amount.',
      view: 'panel',
      sun: true,
      diagram: 'linkage',
      tau: 0.12,
      // The 3D louvres turn with the diagram's blades, all together.
      pose: (g, t) => tiltToState(tiltCycle(t, LINKAGE_CYCLE)[0]),
    },
    {
      chain: 5,
      short: 'Louvres',
      title: 'Trapezoidal Louvre Rotation (0–45°)',
      text: 'adjusts shading angle of all blades simultaneously',
      notes:
        'The blades tilt to the calculated angle, blocking direct glare while still letting ' +
        'daylight in. The loop then repeats continuously.',
      view: 'panel',
      sun: true,
      diagram: 'louvres',
      tau: 0.12,
      pose: (g, t) => tiltToState(tiltCycle(t, LOUVRE_CYCLE)[0]),
    },
    {
      title: 'The fixed frame',
      text:
        'A hexagonal hub, six spines faced with solar (PV) cells, and a PV panel at each tip. ' +
        'Between each pair of spines, four rows of chevron slats fill the gap.',
      view: 'front',
      labels: 'frame',
      pose: () => 0,
    },
    {
      title: 'Each slat turns on a hinge',
      text:
        'The highlighted slats hinge on pins along their outer edges (orange lines). Closed, they ' +
        'lie flat, flush with the spines. Open, they swing in until they stand edge-on to the façade.',
      view: 'gap',
      show: ['slats', 'hinges'],
      tau: 0.25,
      pose: (g, t) => (g === focusGap ? stroke(t) : 1),
    },
    {
      title: 'The drive behind each gap',
      text:
        'Behind each gap a carriage runs along its centre line, shown in orange through the slats. ' +
        'As it slides out, links pull on a lug on the back of each slat and swing it open. ' +
        'One carriage moves all eight slats of its gap together.',
      view: 'side',
      show: ['driveFocus'],
      tau: 0.25,
      pose: (g, t) => (g === focusGap ? stroke(t) : 1),
    },
    {
      title: 'Six carriages, moved together',
      text:
        'The hub linkage pushes all six carriages out at once, so the slats in every gap turn ' +
        'by the same amount at the same time.',
      view: 'oblique',
      show: ['driveAll'],
      tau: 0.25,
      pose: (g, t) => stroke(t),
    },
    {
      title: 'No harsh sun, or a storm: fully open',
      text:
        'On an ordinary day and at night there is no harsh sun to keep out, so every slat opens fully ' +
        'for daylight and view. In a storm they open fully too: edge-on to the wind, the slats let it ' +
        'pass straight through instead of taking its full force.',
      view: 'front',
      pose: () => 1,
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
  const loopChip = document.createElement('div');
  loopChip.className = 'chain-loop';
  loopChip.textContent = '↻ loop repeats';
  chainEl.append(loopChip);

  /** Shows the chain up to step c (its index in the strip); none outside the chain. */
  function showChain(c) {
    chainEl.hidden = c === undefined;
    if (c === undefined) return;
    chips.forEach((chip, k) => {
      chip.classList.toggle('shown', k <= c);
      chip.classList.toggle('past', k < c);
      chip.classList.toggle('active', k === c);
    });
    chainArrows.forEach((a, k) => {
      // Arrow k runs from step k into step k + 1.
      a.classList.toggle('shown', k + 1 <= c);
      a.classList.toggle('past', k + 1 < c);
    });
    loopChip.classList.toggle('shown', c === chain.length - 1);
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

    const show = step.show ?? [];
    for (const key of ['slats', 'driveFocus', 'driveAll']) {
      for (const o of overlays[key]) o.mesh.visible = show.includes(key);
    }
    hinges.visible = show.includes('hinges');

    labelSet = step.labels ?? null;
    labelLayer.hidden = !labelSet;
    labelLayer.classList.toggle('readings', !!step.readings);
    for (const l of labels) {
      const on = l.set === labelSet;
      for (const el of [l.line, l.dot, l.tag]) el.style.display = on ? '' : 'none';
      if (l.bare) l.dot.style.display = 'none';
    }
    for (const path of signals) path.style.display = step.signals ? '' : 'none';

    showDiagram(step.diagram);
    showChain(step.chain);

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
    document.body.classList.add('explaining'); // the side panel steps aside
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
      // Grows in from its tip, then shimmers a little, in and out along the ray.
      const pulse = 0.05 * (0.5 + 0.5 * Math.sin(t * 5));
      arrow.position.copy(sunTip).addScaledVector(sunDir, pulse);
      arrow.quaternion.setFromUnitVectors(UP, sunDir);
      arrow.scale.setScalar(1 - (1 - arrowGrow) ** 3);
    }

    // The sensor tips' frames fade see-through for the sensor steps; each LDR
    // inside glows as brightly as it reads, the ones facing away in shade.
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
   * Input: a click steps, a drag stays the camera's
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
 * The sun, as an arrow: tip at the origin pointing down -Y, body up +Y, so
 * turning +Y onto the sun direction points it in at the module.
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

/**
 * A soft ring of glow, drawn on a canvas: clear out to `clear` (a fraction of
 * the radius), brightest just beyond, fading to nothing at the rim.
 */
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
