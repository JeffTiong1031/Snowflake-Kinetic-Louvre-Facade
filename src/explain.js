/**
 * Explanation mode: flies in to one snowflake and walks through how it works,
 * a step at a time. Left-click (or the right arrow key) moves on, right-click
 * (or the left arrow) goes back, N shows the narration, Escape leaves. A drag
 * still orbits the camera.
 *
 * It opens with the control chain -- IP68 sensors, the controller, the DCL-10
 * actuator, the drive disc, eccentric pins, slotted rods, and blades -- built
 * up step by step in a strip across the top, earlier steps greyed. The sensors
 * are shown in the 3D view; the parts the 3D model does not have (the disc,
 * pins, rods, crank arms) are shown in 2D diagram panels.
 *
 * While it runs it owns the louvre states. Every module takes the same pose as
 * the one being explained, so the whole face reads as one. And while it runs,
 * the focus module's fixed parts are drawn by a copy of their own, its instance
 * in the facade hidden, so the frames of its two sensor tips can turn
 * see-through.
 */

import * as THREE from 'three';
import * as C from './constants.js';
import {
  buildBladeLayout,
  buildModuleStaticGeometry,
  buildTipGeometry,
  tipPanelCentre,
  MODULE_BLADE_COUNT,
} from './snowflakeModule.js';
import { buildLdrSensor } from './ldrSensor.js';
import { buildControlDiagrams } from './controlDiagrams.js';

const DEG = Math.PI / 180;
const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const easeOut = (x) => 1 - (1 - clamp01(x)) ** 3;

const GAPS = C.ARM_COUNT;

const HIGHLIGHT = 0xff8a1f;
const SVG_NS = 'http://www.w3.org/2000/svg';

/** Toward the sun, module-local: +X along the face, +Y up, +Z out of it. From the upper left. */
const SUN_DIR = new THREE.Vector3(-0.55, 0.5, 0.67).normalize();

/** The two IP68 sensor arms: upper-left (arm 5) and lower-right (arm 2). */
const SENSOR_ARMS = [5, 2];

/** Each sensor's reading with the sun there, percent of full light: the upper left faces it. */
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
};

/** Which corner a sensor arm is in. */
const sensorCorner = (arm) => {
  const c = tipPanelCentre(arm);
  return (c.y > 0 ? 'U' : '') + (c.x < 0 ? 'L' : '') + (c.y <= 0 ? 'L' : '') + (c.x >= 0 ? 'R' : '');
};

/** A blade tilt from open (0°, edge-on) in degrees, as a louvre state (1 = open). */
const tiltToState = (deg) => 1 - deg / 90;

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
    const rest = buildModuleStaticGeometry({ omitTips: SENSOR_ARMS });
    const tips = buildTipGeometry(SENSOR_ARMS);
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

  // An IP68 light sensor inside each sensor tip's frame. With the sun on them,
  // each glows as brightly as it reads.
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

    return { halo, shade, level: sensorReadings[idx] };
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
   * Labels for the 3D sensor view
   * -------------------------------------------------------------- */

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
    if (def.set === 'sensor') {
      // The sensor's reading, shown in the sensor step.
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
      sensorLabels.forEach((l, k) => {
        const base = l.key === 'UL' ? READINGS.UL : READINGS.LR;
        // Settled readings flicker a little, as a real sensor does.
        const v = base * grow * (1 + 0.025 * Math.sin(t * 2.2 + k * 1.3) * grow);
        l.bar.style.width = `${v.toFixed(1)}%`;
        l.value.textContent = `${Math.round(v)}%`;
      });
    }
  }

  /* -------------------------------------------------------------- *
   * The steps
   *
   * The control chain first (chain: its place in the strip), each with a
   * short visible line. Then the mechanism details.
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
      pose: () => 1, // 0° = state 1 (edge-on, open)
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
      view: 'panel',
      diagram: 'disc',
      pose: () => 1,
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
      view: 'panel',
      diagram: 'pins',
      pose: () => 1,
    },
    {
      chain: 5,
      short: 'Slotted rods',
      title: 'The slotted rod converts rotation into linear movement',
      text:
        'Each sliding rod runs in a guide channel along one structural arm. The pin\'s radial component ' +
        'pushes the rod; the sideways component is absorbed by the pin sliding across the slot.',
      notes:
        'Disc rotation → pin circular movement → guided rod linear movement. All six pins share the ' +
        'same geometry, so all six rods move together by the same distance.',
      view: 'panel',
      diagram: 'rod',
      pose: () => 1,
    },
    {
      // No chain — this is a calculation step, chain strip hidden
      title: 'Required slider movement',
      text:
        'With crank arm a = 60 mm and θ = 45°, the chord movement is s = 2a·sin(θ/2) ≈ 46 mm. ' +
        'A pin radius of ≈65 mm working through 45° gives the same stroke.',
      notes:
        'Design values: eccentric pin radius ≈ 65 mm, slider stroke ≈ 46 mm, crank arm ≈ 60 mm, ' +
        'blade rotation 0°–45°.',
      view: 'panel',
      diagram: 'calc',
      pose: () => 1,
    },
    {
      chain: 6,
      short: 'Blades',
      title: 'Each sliding rod moves four blades',
      text:
        'One rod per arm connects to four blades through 60 mm crank arms and linkage joints. ' +
        'When the rod moves outward, the crank arms rotate all four blades together. ' +
        'One actuator moves all six rods, so all 24 blades rotate simultaneously.',
      notes:
        'Each blade has a fixed pivot shaft, a 60 mm crank arm, a pinned or spherical linkage joint, ' +
        'and a connection to the common rod.',
      view: 'panel',
      diagram: 'blades',
      pose: () => 1,
    },
    {
      chainAll: true, // show all chips lit, with sequential highlight
      title: 'Shading movement (0° → 45°)',
      text:
        'The controller commands the actuator → disc rotates ≈45° → pins push rods outward ≈46 mm → ' +
        'crank arms rotate blades to ≈45° → feedback confirms → actuator stops. Real time ≈15 s.',
      view: 'panel',
      diagram: 'open',
      pose: () => 1,
    },
    {
      chainAll: true,
      title: 'Return movement (45° → 0°)',
      text:
        'The actuator reverses → pins pull rods inward → crank arms pull blades back toward 0° → ' +
        'feedback confirms the position → actuator stops. The mechanism can stop at any intermediate angle.',
      notes:
        'The mechanism can also stop at intermediate angles such as 10°, 20°, 30° or 40°.',
      view: 'panel',
      diagram: 'close',
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

  /** Shows the chain up to step c (its index in the strip); 'all' lights every chip; undefined hides. */
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
      // Arrow k runs from step k into step k + 1.
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

    // The sensor tips' frames fade see-through for the sensor steps; each sensor
    // inside glows as brightly as it reads.
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

  /** After the facade has drawn this frame's states: bring the labels along. */
  function afterBlades() {
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
