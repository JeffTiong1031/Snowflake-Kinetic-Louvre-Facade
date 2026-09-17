/**
 * The control system's flat diagrams, for the explanation's diagram panel:
 * the controller deciding the blade angle, the position command to the DCL-10
 * actuator, the central drive disc, eccentric pins, slotted rods, blade
 * crank arms, slider calculation, and the full opening/closing sequences.
 * Flat vector SVG, built at runtime -- no image files.
 *
 * Each diagram is a group with the viewBox it is shown through, and a
 * tick(t) that animates it, t in seconds since its step began.
 */

import * as C from './constants.js';

const NS = 'http://www.w3.org/2000/svg';
const DEG = Math.PI / 180;
const FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
const MONO = 'ui-monospace, SFMono-Regular, Consolas, monospace';

const BLUE = '#1F4E79';
const ORANGE = '#F0932B';
const FILL = '#DCE9F5';
const GREY = '#9AA5B1';
const INK = '#3A4450';

const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const ease = (x) => {
  const t = clamp01(x);
  return t * t * (3 - 2 * t);
};

/** Blade tilt at time t through one of the loops: [degrees, moving]. */
export function tiltCycle(t, { to, up, hold, down, rest }) {
  const c = t % (up + hold + down + rest);
  if (c < up) return [to * ease(c / up), true];
  if (c < up + hold) return [to, false];
  if (c < up + hold + down) return [to * (1 - ease((c - up - hold) / down)), true];
  return [0, false];
}

function svg(tag, attrs = {}, parent = null) {
  const node = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  if (parent) parent.append(node);
  return node;
}

function label(parent, x, y, content, attrs = {}) {
  const t = svg('text', { x, y, 'font-family': FONT, 'font-size': 15, fill: INK, ...attrs }, parent);
  t.textContent = content;
  return t;
}

const pts = (list) => list.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ');

/** A point at radius r, angle a (radians, anticlockwise from +x) about (cx, cy), on screen. */
const polar = ([cx, cy], r, a) => [cx + r * Math.cos(a), cy - r * Math.sin(a)];

const armAngle = (i) => (i * 60 + C.ARM_PHASE_DEG) * DEG;

/* ================================================================== *
 * Shared base drawing: the hexagonal hub, 6 arms, disc, pins, rods,
 * and 4 blades per arm region.
 * ================================================================== */

/**
 * Draw the full mechanism in face-on view.
 * Returns handles to all animated parts so each diagram mode can
 * highlight / zoom / animate them independently.
 */
function drawMechanism(g, centre, scale) {
  const k = scale;
  const [cx, cy] = centre;

  // Hub hexagon
  const hubR = 50 * k;
  const hubPts = Array.from({ length: 6 }, (_, i) => polar(centre, hubR, armAngle(i)));
  svg('polygon', {
    points: pts(hubPts),
    fill: FILL,
    stroke: BLUE,
    'stroke-width': 2,
    'stroke-linejoin': 'round',
  }, g);

  // 6 structural arms
  const armLen = 220 * k;
  const arms = [];
  for (let i = 0; i < 6; i++) {
    const a = armAngle(i);
    const [x1, y1] = polar(centre, hubR * 0.8, a);
    const [x2, y2] = polar(centre, armLen, a);
    const line = svg('line', {
      x1, y1, x2, y2,
      stroke: '#D9DEE4',
      'stroke-width': 10 * k,
      'stroke-linecap': 'round',
    }, g);
    arms.push({ line, angle: a, end: [x2, y2] });
  }

  // Drive disc (rotatable group)
  const discR = 38 * k;
  const discGroup = svg('g', {}, g);
  svg('circle', {
    cx, cy, r: discR,
    fill: '#E8EDF3',
    stroke: BLUE,
    'stroke-width': 2,
  }, discGroup);

  // 6 eccentric pins on the disc
  const pinR = 26 * k; // eccentric radius (visual)
  const pinDotR = 5 * k;
  const pinDots = [];
  const pinOrbits = [];
  for (let i = 0; i < 6; i++) {
    const a = armAngle(i);
    // Orbit circle (faint)
    const orbit = svg('circle', {
      cx: cx + pinR * Math.cos(a),
      cy: cy - pinR * Math.sin(a),
      r: 0.1, // will be set visible in pin step
      fill: 'none',
      stroke: ORANGE,
      'stroke-width': 1,
      'stroke-dasharray': '4 3',
      opacity: 0,
    }, g);
    pinOrbits.push(orbit);
    // Pin dot (on the disc group so it rotates)
    const [px, py] = polar(centre, pinR, a);
    const dot = svg('circle', {
      cx: px, cy: py, r: pinDotR,
      fill: ORANGE,
      stroke: '#fff',
      'stroke-width': 1.5,
    }, discGroup);
    pinDots.push(dot);
  }

  // Centre shaft dot
  svg('circle', { cx, cy, r: 6 * k, fill: '#fff', stroke: BLUE, 'stroke-width': 1.5 }, discGroup);

  // 6 sliding rods along the arms
  const rodStart = hubR * 1.1;
  const rodLen = 100 * k;
  const rods = [];
  for (let i = 0; i < 6; i++) {
    const a = armAngle(i);
    const [x1, y1] = polar(centre, rodStart, a);
    const [x2, y2] = polar(centre, rodStart + rodLen, a);
    // Guide channel (background)
    svg('line', {
      x1, y1, x2, y2,
      stroke: '#EEF2F6',
      'stroke-width': 8 * k,
      'stroke-linecap': 'round',
    }, g);
    // Rod itself
    const rod = svg('line', {
      x1, y1, x2, y2,
      stroke: BLUE,
      'stroke-width': 4 * k,
      'stroke-linecap': 'round',
    }, g);
    rods.push({ line: rod, angle: a, start: rodStart });
  }

  // Slot indicators at the inner end of each rod
  const slots = [];
  for (let i = 0; i < 6; i++) {
    const a = armAngle(i);
    const slotW = 14 * k;
    const [sx, sy] = polar(centre, rodStart, a);
    // Small perpendicular line = the transverse slot
    const perp = a + Math.PI / 2;
    const slot = svg('line', {
      x1: sx + slotW * Math.cos(perp),
      y1: sy - slotW * Math.sin(perp),
      x2: sx - slotW * Math.cos(perp),
      y2: sy + slotW * Math.sin(perp),
      stroke: BLUE,
      'stroke-width': 2.5 * k,
      'stroke-linecap': 'round',
      opacity: 0.6,
    }, g);
    slots.push(slot);
  }

  // 4 blades per arm region (between adjacent arms)
  const bladeGroups = [];
  for (let i = 0; i < 6; i++) {
    const regionGroup = svg('g', {}, g);
    const a1 = armAngle(i);
    const a2 = armAngle((i + 1) % 6);
    const regionAngle = (a1 + a2) / 2; // bisector of the region
    // Adjust for wrapping
    const midA = a1 + (((a2 - a1) % (2 * Math.PI) + 3 * Math.PI) % (2 * Math.PI) - Math.PI) / 2;

    const blades = [];
    for (let b = 0; b < 4; b++) {
      const frac = (b + 0.5) / 4;
      const bladeR = (rodStart + 20 * k) + frac * (rodLen - 10 * k);
      // Blade pivot on the arm
      const pivotA = a1;
      const [pvx, pvy] = polar(centre, bladeR, pivotA);

      // Crank arm (rotates with blade)
      const crankLen = 24 * k;
      const crank = svg('line', {
        x1: pvx, y1: pvy,
        x2: pvx, y2: pvy,
        stroke: ORANGE,
        'stroke-width': 3 * k,
        'stroke-linecap': 'round',
      }, regionGroup);

      // Blade body (a short arc or line representing the blade)
      const bladeLen = 34 * k;
      const blade = svg('line', {
        x1: pvx, y1: pvy,
        x2: pvx, y2: pvy,
        stroke: BLUE,
        'stroke-width': 6 * k,
        'stroke-linecap': 'round',
        opacity: 0.8,
      }, regionGroup);

      // Pivot dot
      svg('circle', {
        cx: pvx, cy: pvy,
        r: 3 * k,
        fill: '#fff',
        stroke: BLUE,
        'stroke-width': 1.2,
      }, regionGroup);

      blades.push({
        crank, blade,
        pivot: [pvx, pvy],
        crankLen,
        bladeLen,
        armAngle: a1,
        regionMid: midA,
      });
    }
    bladeGroups.push({ group: regionGroup, blades });
  }

  /** Pose the mechanism at a given disc rotation angle (degrees, 0–45). */
  function pose(theta) {
    const rad = theta * DEG;
    discGroup.setAttribute('transform', `rotate(${-theta} ${cx} ${cy})`);

    // Move rods outward proportionally
    const maxSlide = 46 * k / (220 * k) * rodLen; // ~46mm proportional
    const slide = maxSlide * Math.sin(rad) / Math.sin(45 * DEG);

    for (let i = 0; i < 6; i++) {
      const a = rods[i].angle;
      const s = rods[i].start;
      const [x1, y1] = polar(centre, s + slide, a);
      const [x2, y2] = polar(centre, s + rodLen + slide, a);
      rods[i].line.setAttribute('x1', x1);
      rods[i].line.setAttribute('y1', y1);
      rods[i].line.setAttribute('x2', x2);
      rods[i].line.setAttribute('y2', y2);

      // Move slots with the rod
      const slotW = 14 * k;
      const [sx, sy] = polar(centre, s + slide, a);
      const perp = a + Math.PI / 2;
      slots[i].setAttribute('x1', sx + slotW * Math.cos(perp));
      slots[i].setAttribute('y1', sy - slotW * Math.sin(perp));
      slots[i].setAttribute('x2', sx - slotW * Math.cos(perp));
      slots[i].setAttribute('y2', sy + slotW * Math.sin(perp));
    }

    // Rotate blades
    for (let i = 0; i < 6; i++) {
      const bg = bladeGroups[i];
      for (const b of bg.blades) {
        const [pvx, pvy] = b.pivot;
        // Crank swings from the arm direction toward the region
        const crankAngle = b.armAngle + (b.regionMid - b.armAngle > 0 ? 1 : -1) * theta * DEG * 0.5;
        const crankDir = b.regionMid - b.armAngle;
        const swing = crankDir > 0 ? theta * DEG : -theta * DEG;
        const ca = b.armAngle + Math.PI / 2 + swing;
        const [cx2, cy2] = [pvx + b.crankLen * Math.cos(ca), pvy - b.crankLen * Math.sin(ca)];
        b.crank.setAttribute('x2', cx2);
        b.crank.setAttribute('y2', cy2);

        // Blade rotates about its pivot
        const bladeA = b.armAngle + swing * 0.9;
        const [bx2, by2] = [pvx + b.bladeLen * Math.cos(bladeA), pvy - b.bladeLen * Math.sin(bladeA)];
        b.blade.setAttribute('x1', pvx - b.bladeLen * 0.3 * Math.cos(bladeA));
        b.blade.setAttribute('y1', pvy + b.bladeLen * 0.3 * Math.sin(bladeA));
        b.blade.setAttribute('x2', bx2);
        b.blade.setAttribute('y2', by2);
      }
    }
  }

  // Initial pose
  pose(0);

  return {
    discGroup,
    pinDots,
    pinOrbits,
    arms,
    rods,
    slots,
    bladeGroups,
    pose,
    centre,
    hubR,
    pinR,
    discR,
    armLen,
    rodStart,
    rodLen,
    scale: k,
  };
}

/* ================================================================== *
 * Controller decides the blade angle (step 2)
 * ================================================================== */

function controllerDiagram(g) {
  // Controller box
  svg('rect', { x: 40, y: 40, width: 200, height: 60, rx: 10, fill: FILL, stroke: BLUE, 'stroke-width': 2 }, g);
  label(g, 140, 78, 'Controller', { 'text-anchor': 'middle', 'font-weight': 700, fill: BLUE, 'font-size': 16 });

  // Two sensor inputs
  const sensorLabels = ['Sensor 1 (high)', 'Sensor 2 (low)'];
  const flows = [];
  for (let i = 0; i < 2; i++) {
    const y = 55 + i * 30;
    svg('line', { x1: -60, y1: y, x2: 40, y2: y, stroke: '#E6EBF0', 'stroke-width': 4 }, g);
    const flow = svg('line', {
      x1: -60, y1: y, x2: 40, y2: y,
      stroke: ORANGE, 'stroke-width': 2.5,
      'stroke-dasharray': '9 7', opacity: 0,
    }, g);
    label(g, -65, y + 5, sensorLabels[i], { 'text-anchor': 'end', 'font-size': 11, fill: GREY });
    flows.push(flow);
  }

  // Arrow down from controller
  svg('line', { x1: 140, y1: 100, x2: 140, y2: 140, stroke: BLUE, 'stroke-width': 2 }, g);
  svg('path', { d: 'M134,135 L140,148 L146,135', fill: BLUE }, g);

  // Angle ranges table
  const tableY = 155;
  const tableW = 380;
  const tableH = 180;
  svg('rect', { x: -10, y: tableY, width: tableW, height: tableH, rx: 8, fill: '#fff', stroke: '#D9DEE4', 'stroke-width': 1.5 }, g);

  // Header
  svg('rect', { x: -10, y: tableY, width: tableW, height: 32, rx: 8, fill: FILL }, g);
  svg('rect', { x: -10, y: tableY + 24, width: tableW, height: 8, fill: FILL }, g);
  label(g, 90, tableY + 22, 'Sunlight level', { 'font-weight': 700, 'font-size': 13, fill: BLUE });
  label(g, 290, tableY + 22, 'Target angle', { 'font-weight': 700, 'font-size': 13, fill: BLUE });

  // Rows
  const rows = [
    ['Low sunlight', '0°–10°'],
    ['Moderate sunlight', '15°–30°'],
    ['Strong direct sunlight', '35°–45°'],
    ['High-wind alarm', '0° (storm-safe)'],
  ];
  const rowEls = rows.map((row, i) => {
    const ry = tableY + 38 + i * 36;
    if (i < 3) svg('line', { x1: 0, y1: ry - 4, x2: tableW - 20, y2: ry - 4, stroke: '#EEF2F6', 'stroke-width': 1 }, g);
    const left = label(g, 20, ry + 14, row[0], { 'font-size': 14, fill: INK });
    const right = label(g, 290, ry + 14, row[1], { 'font-size': 14, 'font-weight': 700, fill: ORANGE });
    const highlight = svg('rect', {
      x: -6, y: ry - 2, width: tableW - 8, height: 32, rx: 6,
      fill: ORANGE, 'fill-opacity': 0, stroke: ORANGE, 'stroke-width': 0,
    }, g);
    return { left, right, highlight, y: ry };
  });

  // Threshold note
  const noteY = tableY + tableH + 16;
  label(g, -6, noteY, 'The controller only moves the blades when the difference', { 'font-size': 12, fill: GREY });
  label(g, -6, noteY + 16, 'between current and required angle exceeds a threshold.', { 'font-size': 12, fill: GREY });

  return {
    viewBox: [-120, 10, 500, 380],
    rest: 3,
    tick(t) {
      flows.forEach((flow, i) => {
        flow.setAttribute('opacity', ease((t - 0.2 - i * 0.15) / 0.35));
        flow.setAttribute('stroke-dashoffset', -t * 40);
      });
      // Highlight the "strong direct sunlight" row after a beat
      const highlight = ease((t - 1.2) / 0.5);
      rowEls[2].highlight.setAttribute('fill-opacity', highlight * 0.12);
      rowEls[2].highlight.setAttribute('stroke-width', highlight * 2);
    },
  };
}

/* ================================================================== *
 * Position command interface (step 3)
 * ================================================================== */

function commandDiagram(g) {
  // Controller box
  const ctrlX = 40;
  const ctrlY = 80;
  svg('rect', { x: ctrlX, y: ctrlY, width: 180, height: 70, rx: 10, fill: FILL, stroke: BLUE, 'stroke-width': 2 }, g);
  label(g, ctrlX + 90, ctrlY + 30, 'Arduino-based', { 'text-anchor': 'middle', 'font-weight': 700, fill: BLUE, 'font-size': 14 });
  label(g, ctrlX + 90, ctrlY + 50, 'controller', { 'text-anchor': 'middle', 'font-weight': 700, fill: BLUE, 'font-size': 14 });

  // Actuator box
  const actX = 420;
  const actY = 80;
  svg('rect', { x: actX, y: actY, width: 180, height: 70, rx: 10, fill: '#E8EDF3', stroke: BLUE, 'stroke-width': 2 }, g);
  label(g, actX + 90, actY + 30, 'DCL-10', { 'text-anchor': 'middle', 'font-weight': 800, fill: BLUE, 'font-size': 18 });
  label(g, actX + 90, actY + 50, 'actuator', { 'text-anchor': 'middle', 'font-weight': 600, fill: BLUE, 'font-size': 14 });

  // Command line (controller → actuator)
  const cmdY = ctrlY + 25;
  svg('line', { x1: ctrlX + 180, y1: cmdY, x2: actX, y2: cmdY, stroke: '#E6EBF0', 'stroke-width': 4 }, g);
  const cmdFlow = svg('line', {
    x1: ctrlX + 180, y1: cmdY, x2: actX, y2: cmdY,
    stroke: ORANGE, 'stroke-width': 2.5,
    'stroke-dasharray': '9 7',
    'marker-end': 'url(#arrow-orange)',
    opacity: 0,
  }, g);
  label(g, (ctrlX + 180 + actX) / 2, cmdY - 14, 'Position command', {
    'text-anchor': 'middle', 'font-weight': 700, 'font-size': 13, fill: ORANGE,
  });

  // Signal options note
  label(g, (ctrlX + 180 + actX) / 2, cmdY + 24, 'Signal: 0–10 V, 4–20 mA, or RS485/Modbus', {
    'text-anchor': 'middle', 'font-size': 11, fill: GREY,
  });

  // Feedback line (actuator → controller, below)
  const fbY = ctrlY + 55;
  svg('line', { x1: actX, y1: fbY, x2: ctrlX + 180, y2: fbY, stroke: '#E6EBF0', 'stroke-width': 4 }, g);
  const fbFlow = svg('line', {
    x1: actX, y1: fbY, x2: ctrlX + 180, y2: fbY,
    stroke: BLUE, 'stroke-width': 2,
    'stroke-dasharray': '6 5',
    'marker-end': 'url(#arrow-blue)',
    opacity: 0,
  }, g);
  label(g, (ctrlX + 180 + actX) / 2, fbY + 20, 'Position feedback', {
    'text-anchor': 'middle', 'font-weight': 600, 'font-size': 12, fill: BLUE,
  });

  // Spec card
  const specY = 200;
  svg('rect', { x: 100, y: specY, width: 440, height: 100, rx: 10, fill: '#fff', stroke: '#D9DEE4', 'stroke-width': 1.5 }, g);
  label(g, 120, specY + 28, 'DCL-10 specifications', { 'font-weight': 700, 'font-size': 14, fill: BLUE });

  const specs = [
    '24 V  ·  adjustable 0°–90°  ·  100 Nm  ·  ≈30 s per 90°  ·  IP67',
    'This design uses 45° of the 0°–90° range.',
  ];
  label(g, 120, specY + 54, specs[0], { 'font-size': 13, fill: INK });
  label(g, 120, specY + 78, specs[1], { 'font-size': 12, 'font-style': 'italic', fill: GREY });

  return {
    viewBox: [10, 40, 620, 280],
    rest: 2,
    tick(t) {
      cmdFlow.setAttribute('opacity', ease((t - 0.3) / 0.4));
      cmdFlow.setAttribute('stroke-dashoffset', -t * 40);
      fbFlow.setAttribute('opacity', ease((t - 1.2) / 0.4));
      fbFlow.setAttribute('stroke-dashoffset', t * 30);
    },
  };
}

/* ================================================================== *
 * Drive disc (step 4)
 * ================================================================== */

function discDiagram(g) {
  const mech = drawMechanism(g, [300, 280], 1);
  // Side-view inset: DCL-10 inside hub, shaft perpendicular, disc on shaft
  const inset = svg('g', {}, g);
  svg('rect', { x: 530, y: 40, width: 200, height: 200, rx: 10, fill: '#fff', stroke: '#D9DEE4', 'stroke-width': 1.5 }, inset);
  label(inset, 630, 62, 'Side view', { 'text-anchor': 'middle', 'font-weight': 700, 'font-size': 13, fill: BLUE });

  // Hub cross-section
  svg('rect', { x: 570, y: 80, width: 120, height: 50, rx: 4, fill: FILL, stroke: BLUE, 'stroke-width': 1.5 }, inset);
  label(inset, 630, 110, 'Hub', { 'text-anchor': 'middle', 'font-size': 11, fill: GREY });

  // DCL-10 inside hub
  svg('rect', { x: 595, y: 90, width: 70, height: 30, rx: 3, fill: '#E8EDF3', stroke: BLUE, 'stroke-width': 1.5 }, inset);
  label(inset, 630, 110, 'DCL-10', { 'text-anchor': 'middle', 'font-size': 10, 'font-weight': 700, fill: BLUE });

  // Shaft coming out perpendicular
  svg('line', { x1: 630, y1: 130, x2: 630, y2: 185, stroke: BLUE, 'stroke-width': 4, 'stroke-linecap': 'round' }, inset);
  label(inset, 648, 160, 'Shaft', { 'font-size': 11, fill: INK });

  // Disc at the end of the shaft
  svg('line', { x1: 600, y1: 185, x2: 660, y2: 185, stroke: BLUE, 'stroke-width': 6, 'stroke-linecap': 'round' }, inset);
  label(inset, 630, 210, 'Drive disc', { 'text-anchor': 'middle', 'font-size': 11, 'font-weight': 700, fill: ORANGE });
  // Façade line
  svg('line', { x1: 560, y1: 220, x2: 700, y2: 220, stroke: GREY, 'stroke-width': 1, 'stroke-dasharray': '5 4' }, inset);
  label(inset, 630, 236, 'Façade plane', { 'text-anchor': 'middle', 'font-size': 10, fill: GREY });

  // Labels for the main view
  label(g, 300, 510, 'Face-on view', { 'text-anchor': 'middle', 'font-weight': 700, fill: GREY });

  // Angle arc
  const arcR = 60;
  const arc45 = svg('path', {
    d: '', fill: 'none', stroke: ORANGE, 'stroke-width': 2.5,
    'marker-end': 'url(#arrow-orange)',
  }, g);

  const angleLabel = label(g, 0, 0, '0°', { 'font-weight': 800, 'font-size': 18, fill: ORANGE });

  // Duration label
  const duration = label(g, 300, 480, '', { 'text-anchor': 'middle', 'font-size': 14, fill: INK, opacity: 0 });

  const CYCLE = { to: 45, up: 2.5, hold: 1.5, down: 2.0, rest: 1.0 };

  return {
    viewBox: [30, 30, 730, 500],
    rest: 2,
    tick(t) {
      const [theta] = tiltCycle(t, CYCLE);
      mech.pose(theta);

      // Arc showing current rotation
      const [cx, cy] = mech.centre;
      if (theta > 0.5) {
        const endA = -theta * DEG;
        const ex = cx + arcR * Math.cos(endA);
        const ey = cy - arcR * Math.sin(endA);
        arc45.setAttribute('d',
          `M${cx},${cy - arcR} A${arcR},${arcR} 0 0 1 ${ex.toFixed(1)},${ey.toFixed(1)}`
        );
      } else {
        arc45.setAttribute('d', '');
      }

      angleLabel.textContent = `${Math.round(theta)}°`;
      angleLabel.setAttribute('x', cx + 75);
      angleLabel.setAttribute('y', cy - 50);

      duration.textContent = theta > 1 ? '≈15 s for full 0°→45°' : '';
      duration.setAttribute('opacity', theta > 1 ? 1 : 0);
    },
  };
}

/* ================================================================== *
 * Eccentric pins (step 5)
 * ================================================================== */

function pinsDiagram(g) {
  const mech = drawMechanism(g, [300, 280], 1);

  // Show orbit circles
  for (const orbit of mech.pinOrbits) {
    orbit.setAttribute('r', mech.pinR);
    orbit.setAttribute('opacity', 0.5);
  }

  // Labels
  label(g, 300, 510, 'Each pin follows a circular path around the shaft', {
    'text-anchor': 'middle', 'font-size': 13, fill: INK,
  });
  label(g, 300, 530, 'Pins engage transverse slots — not rigidly connected to the rods', {
    'text-anchor': 'middle', 'font-size': 12, fill: GREY,
  });

  const CYCLE = { to: 45, up: 2.5, hold: 1.0, down: 2.0, rest: 0.8 };

  return {
    viewBox: [30, 30, 560, 520],
    rest: 2,
    tick(t) {
      const [theta] = tiltCycle(t, CYCLE);
      mech.pose(theta);
    },
  };
}

/* ================================================================== *
 * Slotted rod detail (step 6)
 * ================================================================== */

function rodDiagram(g) {
  // Zoomed view of ONE rod with the pin-in-slot detail
  const cx = 300;
  const cy = 250;

  // Guide channel (the arm)
  svg('rect', { x: 80, y: cy - 18, width: 500, height: 36, rx: 6, fill: '#EEF2F6', stroke: '#D9DEE4', 'stroke-width': 1.5 }, g);
  label(g, 330, cy - 30, 'Guide channel along structural arm', { 'text-anchor': 'middle', 'font-size': 12, fill: GREY });

  // Rod (slides left-right)
  const rodW = 340;
  const rod = svg('rect', { x: 100, y: cy - 10, width: rodW, height: 20, rx: 4, fill: FILL, stroke: BLUE, 'stroke-width': 2 }, g);

  // Transverse slot at the inner end of the rod
  const slotX = 120;
  const slotH = 50;
  const slotGroup = svg('g', {}, g);
  svg('rect', { x: slotX - 5, y: cy - slotH / 2, width: 10, height: slotH, rx: 3, fill: '#fff', stroke: BLUE, 'stroke-width': 1.5 }, slotGroup);
  label(g, slotX, cy - slotH / 2 - 10, 'Transverse slot', { 'text-anchor': 'middle', 'font-weight': 700, 'font-size': 12, fill: BLUE });

  // Pin (moves in a circle, but shown as sliding across the slot)
  const pinCX = 90; // pivot centre (actuator axis, off-screen left conceptually)
  const pinEccentric = 50; // visual eccentric radius
  const pin = svg('circle', { cx: slotX, cy: cy, r: 8, fill: ORANGE, stroke: '#fff', 'stroke-width': 2 }, g);

  // Arrow labels for radial and sideways components
  const radialArrow = svg('line', {
    x1: 0, y1: 0, x2: 0, y2: 0,
    stroke: ORANGE, 'stroke-width': 3,
    'marker-end': 'url(#arrow-orange)',
    opacity: 0,
  }, g);
  const radialLabel = label(g, 0, 0, 'Radial → pushes rod', { 'font-weight': 700, 'font-size': 12, fill: ORANGE, opacity: 0 });

  const sideArrow = svg('line', {
    x1: 0, y1: 0, x2: 0, y2: 0,
    stroke: BLUE, 'stroke-width': 2.5,
    'stroke-dasharray': '6 4',
    opacity: 0,
  }, g);
  const sideLabel = label(g, 0, 0, '↕ Sideways → absorbed by slot', { 'font-weight': 600, 'font-size': 12, fill: BLUE, opacity: 0 });

  // Summary at bottom
  label(g, cx, 420, 'Disc rotation → pin circular movement → guided rod linear movement', {
    'text-anchor': 'middle', 'font-size': 13, 'font-weight': 700, fill: INK,
  });
  label(g, cx, 444, 'All six rods move together by the same distance', {
    'text-anchor': 'middle', 'font-size': 12, fill: GREY,
  });

  const CYCLE = { to: 45, up: 3.0, hold: 1.0, down: 2.5, rest: 1.0 };

  return {
    viewBox: [20, 80, 600, 400],
    rest: 2,
    tick(t) {
      const [theta, moving] = tiltCycle(t, CYCLE);
      const rad = theta * DEG;

      // Pin position: circular path, but we show the radial displacement
      const slide = pinEccentric * Math.sin(rad) / Math.sin(45 * DEG) * (45 * DEG > 0.01 ? 1 : 0);
      const sideOffset = pinEccentric * (1 - Math.cos(rad)) * 0.4;

      // Move the rod
      rod.setAttribute('x', 100 + slide * 0.8);
      slotGroup.setAttribute('transform', `translate(${slide * 0.8} 0)`);

      // Pin slides across the slot
      pin.setAttribute('cx', slotX + slide * 0.8);
      pin.setAttribute('cy', cy + sideOffset - sideOffset * 0.5);

      // Component arrows
      const showArrows = ease((t - 0.8) / 0.5);
      radialArrow.setAttribute('opacity', showArrows);
      radialArrow.setAttribute('x1', slotX + slide * 0.8 + 20);
      radialArrow.setAttribute('y1', cy);
      radialArrow.setAttribute('x2', slotX + slide * 0.8 + 65);
      radialArrow.setAttribute('y2', cy);
      radialLabel.setAttribute('opacity', showArrows);
      radialLabel.setAttribute('x', slotX + slide * 0.8 + 70);
      radialLabel.setAttribute('y', cy + 5);

      sideArrow.setAttribute('opacity', showArrows * 0.8);
      sideArrow.setAttribute('x1', slotX + slide * 0.8);
      sideArrow.setAttribute('y1', cy + 14);
      sideArrow.setAttribute('x2', slotX + slide * 0.8);
      sideArrow.setAttribute('y2', cy + 50);
      sideLabel.setAttribute('opacity', showArrows);
      sideLabel.setAttribute('x', slotX + slide * 0.8 + 14);
      sideLabel.setAttribute('y', cy + 68);
    },
  };
}

/* ================================================================== *
 * Slider calculation (step 7)
 * ================================================================== */

function calcDiagram(g) {
  const cx = 300;
  const cy = 200;

  // Draw a crank arm geometry diagram
  // Pivot point
  svg('circle', { cx, cy, r: 6, fill: '#fff', stroke: BLUE, 'stroke-width': 2 }, g);
  label(g, cx + 14, cy + 5, 'Blade pivot', { 'font-size': 12, 'font-weight': 600, fill: INK });

  // Crank arm (rotates)
  const crankLen = 120; // visual
  const crank = svg('line', {
    x1: cx, y1: cy,
    x2: cx + crankLen, y2: cy,
    stroke: ORANGE, 'stroke-width': 4, 'stroke-linecap': 'round',
  }, g);
  const crankEnd = svg('circle', { cx: cx + crankLen, cy, r: 5, fill: ORANGE, stroke: '#fff', 'stroke-width': 1.5 }, g);

  // Reference line (0° position)
  svg('line', {
    x1: cx, y1: cy, x2: cx + crankLen + 40, y2: cy,
    stroke: GREY, 'stroke-width': 1.5, 'stroke-dasharray': '6 5',
  }, g);
  label(g, cx + crankLen + 48, cy + 5, '0°', { 'font-size': 13, 'font-weight': 700, fill: GREY });

  // Chord line s (distance moved by the crank tip)
  const chordLine = svg('line', {
    x1: 0, y1: 0, x2: 0, y2: 0,
    stroke: ORANGE, 'stroke-width': 2.5, 'stroke-dasharray': '8 4',
  }, g);

  // Angle arc
  const arcR = 50;
  const angleArc = svg('path', { d: '', fill: ORANGE, 'fill-opacity': 0.12, stroke: ORANGE, 'stroke-width': 2 }, g);
  const angleText = label(g, 0, 0, '', { 'font-weight': 800, 'font-size': 20, fill: ORANGE });

  // Live formula display
  const formulaGroup = svg('g', {}, g);
  const formulaTitle = label(formulaGroup, 60, 380, 'Crank formula:', { 'font-weight': 700, 'font-size': 14, fill: BLUE });
  const formula = label(formulaGroup, 60, 405, 's = 2a·sin(θ/2)', { 'font-family': MONO, 'font-size': 16, fill: INK });
  const aLabel = label(formulaGroup, 60, 430, 'a = 60 mm (crank arm)', { 'font-size': 13, fill: INK });
  const sValue = label(formulaGroup, 60, 455, 's = 0 mm', { 'font-weight': 800, 'font-size': 18, fill: ORANGE });

  // Pin check formula (shown at θ = 45°)
  const pinCheck = svg('g', { opacity: 0 }, g);
  svg('rect', { x: 310, y: 360, width: 290, height: 120, rx: 10, fill: '#fff', stroke: '#D9DEE4', 'stroke-width': 1.5 }, pinCheck);
  label(pinCheck, 325, 388, 'Pin radius check:', { 'font-weight': 700, 'font-size': 13, fill: BLUE });
  label(pinCheck, 325, 410, 's = r·sin 45° = 65 × 0.707', { 'font-family': MONO, 'font-size': 13, fill: INK });
  label(pinCheck, 325, 430, '= 45.96 mm ✓', { 'font-family': MONO, 'font-size': 13, 'font-weight': 700, fill: ORANGE });

  // Design values (shown at θ = 45°)
  const designVals = svg('g', { opacity: 0 }, g);
  label(designVals, 325, 460, 'Design values:', { 'font-weight': 700, 'font-size': 12, fill: BLUE });
  const dvs = [
    'Pin radius ≈ 65 mm',
    'Slider stroke ≈ 46 mm',
    'Crank arm ≈ 60 mm',
    'Blade rotation 0°–45°',
  ];
  dvs.forEach((dv, i) => label(designVals, 335, 478 + i * 16, dv, { 'font-size': 12, fill: INK }));

  const CYCLE = { to: 45, up: 4.0, hold: 3.0, down: 3.0, rest: 1.5 };

  return {
    viewBox: [20, 80, 600, 470],
    rest: 3,
    tick(t) {
      const [theta] = tiltCycle(t, CYCLE);
      const rad = theta * DEG;

      // Move crank
      const ex = cx + crankLen * Math.cos(rad);
      const ey = cy - crankLen * Math.sin(rad);
      crank.setAttribute('x2', ex);
      crank.setAttribute('y2', ey);
      crankEnd.setAttribute('cx', ex);
      crankEnd.setAttribute('cy', ey);

      // Chord line from initial position to current position
      chordLine.setAttribute('x1', cx + crankLen);
      chordLine.setAttribute('y1', cy);
      chordLine.setAttribute('x2', ex);
      chordLine.setAttribute('y2', ey);

      // Angle arc
      if (theta > 0.5) {
        const tip = [cx + arcR * Math.cos(rad), cy - arcR * Math.sin(rad)];
        angleArc.setAttribute('d',
          `M${cx},${cy} L${cx + arcR},${cy} A${arcR},${arcR} 0 0 0 ${tip[0].toFixed(1)},${tip[1].toFixed(1)} Z`
        );
      } else {
        angleArc.setAttribute('d', '');
      }

      angleText.textContent = `θ = ${Math.round(theta)}°`;
      angleText.setAttribute('x', cx + arcR + 18);
      angleText.setAttribute('y', cy - 30);

      // Live s value
      const s = 2 * 60 * Math.sin(rad / 2);
      sValue.textContent = `s = ${s.toFixed(1)} mm`;

      // Show pin check and design values when at 45°
      const atFull = theta >= 44.5 ? 1 : 0;
      const fadeIn = ease(atFull);
      pinCheck.setAttribute('opacity', fadeIn);
      designVals.setAttribute('opacity', fadeIn);
    },
  };
}

/* ================================================================== *
 * Each rod moves four blades (step 8)
 * ================================================================== */

function bladesDiagram(g) {
  const mech = drawMechanism(g, [300, 280], 1);

  // Highlight one arm region
  label(g, 300, 510, 'One rod connects to four blades through 60 mm crank arms', {
    'text-anchor': 'middle', 'font-size': 13, fill: INK,
  });
  label(g, 300, 530, 'All 24 blades rotate simultaneously — one actuator, all six rods', {
    'text-anchor': 'middle', 'font-size': 12, 'font-weight': 700, fill: ORANGE,
  });

  const CYCLE = { to: 45, up: 2.5, hold: 1.5, down: 2.0, rest: 1.0 };

  return {
    viewBox: [30, 30, 560, 520],
    rest: 2,
    tick(t) {
      const [theta] = tiltCycle(t, CYCLE);
      mech.pose(theta);
    },
  };
}

/* ================================================================== *
 * Opening sequence (step 9)
 * ================================================================== */

function openDiagram(g) {
  const mech = drawMechanism(g, [300, 280], 1);

  // Chain: controller → disc → pins → rods → cranks → blades → feedback → stop
  const chainLabels = [
    'Controller commands',
    'Disc rotates ≈45°',
    'Pins push rods outward',
    'Crank arms rotate blades',
    'All 24 blades reach ≈45°',
    'Feedback confirms → stop',
  ];
  const chainY = 500;
  const chainEls = chainLabels.map((text, i) => {
    const x = 35 + i * 95;
    const chip = svg('rect', { x, y: chainY, width: 88, height: 28, rx: 6, fill: '#fff', stroke: '#D9DEE4', 'stroke-width': 1 }, g);
    label(g, x + 44, chainY + 18, text, { 'text-anchor': 'middle', 'font-size': 8, fill: INK });
    if (i < chainLabels.length - 1) {
      svg('path', { d: `M${x + 90},${chainY + 14} l8,0`, stroke: ORANGE, 'stroke-width': 1.5 }, g);
    }
    return chip;
  });

  const duration = label(g, 300, 550, 'Real time ≈15 s', {
    'text-anchor': 'middle', 'font-weight': 700, 'font-size': 14, fill: INK, opacity: 0,
  });

  const angleLabel = label(g, 300, 470, '', {
    'text-anchor': 'middle', 'font-weight': 800, 'font-size': 20, fill: ORANGE,
  });

  // 7 seconds total: sweep 0→45, then hold
  const CYCLE = { to: 45, up: 4.0, hold: 3.0, down: 0.001, rest: 2.0 };

  return {
    viewBox: [10, 30, 610, 550],
    rest: 2,
    tick(t) {
      const [theta] = tiltCycle(t, CYCLE);
      mech.pose(theta);

      angleLabel.textContent = `${Math.round(theta)}°`;

      // Highlight chain chips in sequence
      const phase = t / 4.0; // which chain step is active
      chainEls.forEach((chip, i) => {
        const active = phase >= i * 0.6 && phase < (i + 1) * 0.6 + 0.3;
        chip.setAttribute('stroke', active ? ORANGE : '#D9DEE4');
        chip.setAttribute('stroke-width', active ? 2 : 1);
        chip.setAttribute('fill', active ? '#FFF8F0' : '#fff');
      });

      duration.setAttribute('opacity', theta > 40 ? 1 : 0);
    },
  };
}

/* ================================================================== *
 * Closing sequence (step 10)
 * ================================================================== */

function closeDiagram(g) {
  const mech = drawMechanism(g, [300, 280], 1);

  label(g, 300, 500, 'The mechanism can stop at any intermediate angle', {
    'text-anchor': 'middle', 'font-size': 13, fill: INK,
  });

  const angleLabel = label(g, 300, 470, '', {
    'text-anchor': 'middle', 'font-weight': 800, 'font-size': 20, fill: ORANGE,
  });

  // Intermediate stop indicators
  const stopLabel = label(g, 300, 530, '', {
    'text-anchor': 'middle', 'font-weight': 700, 'font-size': 14, fill: BLUE, opacity: 0,
  });

  // Animation: close from 45→0, then pause at intermediate stops
  // Phase 1 (0–4s): close 45→0
  // Phase 2 (4–12s): show intermediate stops: 40°, 30°, 20°, 10°
  const totalCycle = 14;
  const intermediateStops = [40, 30, 20, 10];

  return {
    viewBox: [30, 30, 560, 520],
    rest: 2,
    tick(t) {
      const ct = t % totalCycle;
      let theta;
      let stopText = '';

      if (ct < 4) {
        // Close: 45 → 0
        theta = 45 * (1 - ease(ct / 3.5));
      } else if (ct < 12) {
        // Intermediate stops
        const phase = (ct - 4) / 2; // 0–4, each stop gets 2s
        const idx = Math.min(Math.floor(phase), intermediateStops.length - 1);
        const frac = phase - idx;
        if (frac < 0.3) {
          // Sweep to stop angle
          const from = idx === 0 ? 0 : intermediateStops[idx - 1];
          theta = from + (intermediateStops[idx] - from) * ease(frac / 0.3);
        } else {
          theta = intermediateStops[idx];
        }
        stopText = `Intermediate stop: ${intermediateStops[idx]}°`;
      } else {
        // Return to 0
        theta = 10 * (1 - ease((ct - 12) / 1.5));
      }

      mech.pose(theta);
      angleLabel.textContent = `${Math.round(theta)}°`;

      stopLabel.textContent = stopText;
      stopLabel.setAttribute('opacity', stopText ? 1 : 0);
    },
  };
}

/* ================================================================== *
 * Building them
 * ================================================================== */

/**
 * Builds every diagram into `root` (an <svg>), each in its own group, kept
 * in <defs> until shown.
 * @returns {{ defs: SVGDefsElement, diagrams: Record<string, {g, viewBox, tick, rest}> }}
 */
export function buildControlDiagrams(root) {
  const defs = svg('defs', {}, root);
  // Orange arrow marker
  const m = svg('marker', {
    id: 'arrow-orange',
    viewBox: '0 0 10 10',
    refX: 6,
    refY: 5,
    markerWidth: 4.2,
    markerHeight: 4.2,
    orient: 'auto-start-reverse',
  }, defs);
  svg('path', { d: 'M0,0 L10,5 L0,10 z', fill: ORANGE }, m);

  // Blue arrow marker (for feedback lines)
  const mb = svg('marker', {
    id: 'arrow-blue',
    viewBox: '0 0 10 10',
    refX: 6,
    refY: 5,
    markerWidth: 4.2,
    markerHeight: 4.2,
    orient: 'auto-start-reverse',
  }, defs);
  svg('path', { d: 'M0,0 L10,5 L0,10 z', fill: BLUE }, mb);

  const diagrams = {};
  for (const [name, build] of Object.entries({
    controller: controllerDiagram,
    command: commandDiagram,
    disc: discDiagram,
    pins: pinsDiagram,
    rod: rodDiagram,
    calc: calcDiagram,
    blades: bladesDiagram,
    open: openDiagram,
    close: closeDiagram,
  })) {
    const g = svg('g', {}, defs);
    diagrams[name] = { g, ...build(g) };
    diagrams[name].tick(diagrams[name].rest);
  }
  return { defs, diagrams };
}
