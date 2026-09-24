/**
 * Supporting 2D diagrams for the explanation mode -- shown in a panel beside
 * the 3D view for things the model cannot show clearly. Built at runtime in
 * SVG, no image files.
 *
 * Only four diagrams remain (the 3D model is the primary visual now):
 *   controller  – the angle-ranges table (step 2)
 *   command     – signal interface + DCL-10 specs (step 3)
 *   link        – drive pin, connecting link and rod (step 6)
 *   calc        – crank formula with live numbers (step 7)
 */

import * as C from './constants.js';

const NS = 'http://www.w3.org/2000/svg';
const DEG = Math.PI / 180;
const FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
const MONO = 'ui-monospace, SFMono-Regular, Consolas, monospace';

const BLUE = '#1F4E79';
const ORANGE = '#F0932B';
/** Orange is too pale for text on white: labels use this darker shade of it. */
const ORANGE_TEXT = '#A85F08';
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
  label(g, 350, tableY + 22, 'Target angle', { 'text-anchor': 'end', 'font-weight': 700, 'font-size': 13, fill: BLUE });

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
    label(g, 20, ry + 14, row[0], { 'font-size': 14, fill: INK });
    label(g, 350, ry + 14, row[1], { 'text-anchor': 'end', 'font-size': 14, 'font-weight': 700, fill: ORANGE_TEXT });
    const highlight = svg('rect', {
      x: -6, y: ry - 2, width: tableW - 8, height: 32, rx: 6,
      fill: ORANGE, 'fill-opacity': 0, stroke: ORANGE, 'stroke-width': 0,
    }, g);
    return { highlight };
  });

  // Threshold note
  const noteY = tableY + tableH + 16;
  label(g, -6, noteY, 'The controller only moves the blades when the difference', { 'font-size': 12, fill: GREY });
  label(g, -6, noteY + 16, 'between current and required angle exceeds a threshold.', { 'font-size': 12, fill: GREY });

  return {
    viewBox: [-170, 10, 560, 380],
    rest: 3,
    tick(t) {
      flows.forEach((flow, i) => {
        flow.setAttribute('opacity', ease((t - 0.2 - i * 0.15) / 0.35));
        flow.setAttribute('stroke-dashoffset', -t * 40);
      });
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
  const ctrlX = 40;
  const ctrlY = 80;
  svg('rect', { x: ctrlX, y: ctrlY, width: 180, height: 70, rx: 10, fill: FILL, stroke: BLUE, 'stroke-width': 2 }, g);
  label(g, ctrlX + 90, ctrlY + 42, 'Controller', { 'text-anchor': 'middle', 'font-weight': 700, fill: BLUE, 'font-size': 14 });

  const actX = 420;
  const actY = 80;
  svg('rect', { x: actX, y: actY, width: 180, height: 70, rx: 10, fill: '#E8EDF3', stroke: BLUE, 'stroke-width': 2 }, g);
  label(g, actX + 90, actY + 30, 'DCL-10', { 'text-anchor': 'middle', 'font-weight': 800, fill: BLUE, 'font-size': 18 });
  label(g, actX + 90, actY + 50, 'actuator', { 'text-anchor': 'middle', 'font-weight': 600, fill: BLUE, 'font-size': 14 });

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
    'text-anchor': 'middle', 'font-weight': 700, 'font-size': 13, fill: ORANGE_TEXT,
  });
  label(g, (ctrlX + 180 + actX) / 2, ctrlY + 93, 'Signal: 0–10 V, 4–20 mA, or RS485/Modbus', {
    'text-anchor': 'middle', 'font-size': 11, fill: GREY,
  });

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

  const specY = 200;
  svg('rect', { x: 100, y: specY, width: 440, height: 100, rx: 10, fill: '#fff', stroke: '#D9DEE4', 'stroke-width': 1.5 }, g);
  label(g, 120, specY + 28, 'DCL-10 specifications', { 'font-weight': 700, 'font-size': 14, fill: BLUE });
  label(g, 120, specY + 54, '24 V  ·  adjustable 0°–90°  ·  100 Nm  ·  ≈30 s per 90°  ·  IP67', { 'font-size': 13, fill: INK });
  label(g, 120, specY + 78, 'This design uses 45° of the 0°–90° range.', { 'font-size': 12, 'font-style': 'italic', fill: GREY });

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
 * Drive pin, connecting link and rod (step 6)
 * ================================================================== */

function linkDiagram(g) {
  const discX = 190;
  const cy = 220;
  /** The pin's 65 mm eccentric radius and the 110 mm link, to one scale. */
  const orbit = 55;
  const perMm = orbit / 65;
  const linkLen = 110 * perMm;
  /** The channel, and with it the rod, end here. */
  const channelEnd = 600;

  // The guide channel, and the rod sliding in it
  svg('rect', {
    x: 300, y: cy - 19, width: channelEnd - 300, height: 38, rx: 6,
    fill: '#EEF2F6', stroke: '#D9DEE4', 'stroke-width': 1.5,
  }, g);
  label(g, 455, cy + 46, 'Guide channel inside the supporting arm', {
    'text-anchor': 'middle', 'font-size': 12, fill: GREY,
  });

  const rod = svg('rect', {
    x: discX + orbit + linkLen, y: cy - 10, width: 10, height: 20, rx: 4,
    fill: FILL, stroke: BLUE, 'stroke-width': 2,
  }, g);
  label(g, 545, cy - 32, 'Sliding rod', {
    'text-anchor': 'middle', 'font-weight': 700, 'font-size': 12, fill: BLUE,
  });

  // The disc, and the circle its pin runs on
  svg('circle', { cx: discX, cy, r: orbit + 18, fill: '#fff', stroke: '#D9DEE4', 'stroke-width': 1.5 }, g);
  svg('circle', {
    cx: discX, cy, r: orbit,
    fill: 'none', stroke: BLUE, 'stroke-width': 1.5, 'stroke-dasharray': '5 5',
  }, g);
  svg('circle', { cx: discX, cy, r: 6, fill: BLUE }, g);
  label(g, discX, cy + orbit + 46, 'Drive disc — pin at 65 mm', {
    'text-anchor': 'middle', 'font-size': 12, 'font-weight': 600, fill: BLUE,
  });

  // Crank, link and the two joints
  const crank = svg('line', {
    x1: discX, y1: cy, x2: 0, y2: 0,
    stroke: BLUE, 'stroke-width': 2, 'stroke-dasharray': '4 3',
  }, g);
  const link = svg('line', {
    x1: 0, y1: 0, x2: 0, y2: 0,
    stroke: ORANGE, 'stroke-width': 7, 'stroke-linecap': 'round',
  }, g);
  const pin = svg('circle', { cx: 0, cy: 0, r: 8, fill: ORANGE, stroke: '#fff', 'stroke-width': 2 }, g);
  const pivot = svg('circle', { cx: 0, cy: 0, r: 7, fill: '#fff', stroke: BLUE, 'stroke-width': 2.5 }, g);

  const pinLabel = label(g, 0, 0, 'Drive pin', {
    'text-anchor': 'middle', 'font-weight': 700, 'font-size': 12, fill: ORANGE_TEXT,
  });
  const linkLabel = label(g, 0, 0, 'Connecting link', {
    'text-anchor': 'middle', 'font-weight': 700, 'font-size': 12, fill: ORANGE_TEXT,
  });

  // How far the rod has been pulled in
  const pullArrow = svg('line', {
    x1: 0, y1: cy - 54, x2: 0, y2: cy - 54,
    stroke: ORANGE, 'stroke-width': 3,
    'marker-end': 'url(#arrow-orange)',
    opacity: 0,
  }, g);
  const pullLabel = label(g, 0, cy - 50, '', {
    'font-weight': 700, 'font-size': 12, fill: ORANGE_TEXT, opacity: 0,
  });

  label(g, 355, 350, 'Disc rotation → pin swings round → link pulls the rod along its arm', {
    'text-anchor': 'middle', 'font-size': 13, 'font-weight': 700, fill: INK,
  });

  const CYCLE = { to: 45, up: 3.0, hold: 1.0, down: 2.5, rest: 1.0 };
  const restEnd = discX + orbit + linkLen;

  return {
    viewBox: [95, 130, 520, 250],
    rest: 2,
    tick(t) {
      const [theta] = tiltCycle(t, CYCLE);
      const rad = theta * DEG;

      // The pin on its circle, and the rod end the fixed-length link reaches.
      const px = discX + orbit * Math.cos(rad);
      const py = cy - orbit * Math.sin(rad);
      const ex = px + Math.sqrt(linkLen * linkLen - (cy - py) ** 2);

      crank.setAttribute('x2', px);
      crank.setAttribute('y2', py);
      link.setAttribute('x1', px);
      link.setAttribute('y1', py);
      link.setAttribute('x2', ex);
      link.setAttribute('y2', cy);
      pin.setAttribute('cx', px);
      pin.setAttribute('cy', py);
      pivot.setAttribute('cx', ex);
      pivot.setAttribute('cy', cy);
      rod.setAttribute('x', ex);
      rod.setAttribute('width', channelEnd - ex);

      pinLabel.setAttribute('x', px);
      pinLabel.setAttribute('y', py - 24);
      linkLabel.setAttribute('x', (px + ex) / 2);
      linkLabel.setAttribute('y', (py + cy) / 2 + 34);

      // The pull, once there is one worth showing.
      const pulled = restEnd - ex;
      const show = ease((pulled - 3) / 10);
      pullArrow.setAttribute('opacity', show);
      pullArrow.setAttribute('x1', restEnd);
      pullArrow.setAttribute('x2', ex + 4);
      pullLabel.setAttribute('opacity', show);
      pullLabel.setAttribute('x', restEnd + 14);
      pullLabel.textContent = `rod pulled in ${Math.round(pulled / perMm)} mm`;
    },
  };
}

/* ================================================================== *
 * Slider calculation (step 7)
 * ================================================================== */

function calcDiagram(g) {
  const cx = 300;
  const cy = 200;

  svg('circle', { cx, cy, r: 6, fill: '#fff', stroke: BLUE, 'stroke-width': 2 }, g);
  label(g, cx + 14, cy + 5, 'Blade pivot', { 'font-size': 12, 'font-weight': 600, fill: INK });

  const crankLen = 120;
  const crank = svg('line', {
    x1: cx, y1: cy, x2: cx + crankLen, y2: cy,
    stroke: ORANGE, 'stroke-width': 4, 'stroke-linecap': 'round',
  }, g);
  const crankEnd = svg('circle', { cx: cx + crankLen, cy, r: 5, fill: ORANGE, stroke: '#fff', 'stroke-width': 1.5 }, g);

  svg('line', {
    x1: cx, y1: cy, x2: cx + crankLen + 40, y2: cy,
    stroke: GREY, 'stroke-width': 1.5, 'stroke-dasharray': '6 5',
  }, g);
  label(g, cx + crankLen + 48, cy + 5, '0°', { 'font-size': 13, 'font-weight': 700, fill: GREY });

  const chordLine = svg('line', {
    x1: 0, y1: 0, x2: 0, y2: 0,
    stroke: ORANGE, 'stroke-width': 2.5, 'stroke-dasharray': '8 4',
  }, g);

  const arcR = 50;
  const angleArc = svg('path', { d: '', fill: ORANGE, 'fill-opacity': 0.12, stroke: ORANGE, 'stroke-width': 2 }, g);
  const angleText = label(g, 0, 0, '', { 'font-weight': 800, 'font-size': 20, fill: ORANGE_TEXT });

  label(g, 60, 380, 'Crank formula:', { 'font-weight': 700, 'font-size': 14, fill: BLUE });
  label(g, 60, 405, 's = 2a·sin(θ/2)', { 'font-family': MONO, 'font-size': 16, fill: INK });
  label(g, 60, 430, 'a = 60 mm (crank arm)', { 'font-size': 13, fill: INK });
  const sValue = label(g, 60, 455, 's = 0 mm', { 'font-weight': 800, 'font-size': 18, fill: ORANGE_TEXT });

  const pinCheck = svg('g', { opacity: 0 }, g);
  svg('rect', { x: 310, y: 360, width: 290, height: 120, rx: 10, fill: '#fff', stroke: '#D9DEE4', 'stroke-width': 1.5 }, pinCheck);
  label(pinCheck, 325, 388, 'Pin radius check:', { 'font-weight': 700, 'font-size': 13, fill: BLUE });
  label(pinCheck, 325, 410, 's = r·sin 45° = 65 × 0.707', { 'font-family': MONO, 'font-size': 13, fill: INK });
  label(pinCheck, 325, 430, '= 45.96 mm ✓', { 'font-family': MONO, 'font-size': 13, 'font-weight': 700, fill: ORANGE_TEXT });

  const designVals = svg('g', { opacity: 0 }, g);
  label(designVals, 325, 460, 'Design values:', { 'font-weight': 700, 'font-size': 12, fill: BLUE });
  const dvs = ['Pin radius ≈ 65 mm', 'Slider stroke ≈ 46 mm', 'Crank arm ≈ 60 mm', 'Blade rotation 0°–45°'];
  dvs.forEach((dv, i) => label(designVals, 335, 478 + i * 16, dv, { 'font-size': 12, fill: INK }));

  const CYCLE = { to: 45, up: 4.0, hold: 3.0, down: 3.0, rest: 1.5 };

  return {
    viewBox: [20, 80, 600, 470],
    rest: 3,
    tick(t) {
      const [theta] = tiltCycle(t, CYCLE);
      const rad = theta * DEG;

      const ex = cx + crankLen * Math.cos(rad);
      const ey = cy - crankLen * Math.sin(rad);
      crank.setAttribute('x2', ex);
      crank.setAttribute('y2', ey);
      crankEnd.setAttribute('cx', ex);
      crankEnd.setAttribute('cy', ey);

      chordLine.setAttribute('x1', cx + crankLen);
      chordLine.setAttribute('y1', cy);
      chordLine.setAttribute('x2', ex);
      chordLine.setAttribute('y2', ey);

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

      const s = 2 * 60 * Math.sin(rad / 2);
      sValue.textContent = `s = ${s.toFixed(1)} mm`;

      const atFull = theta >= 44.5 ? 1 : 0;
      pinCheck.setAttribute('opacity', ease(atFull));
      designVals.setAttribute('opacity', ease(atFull));
    },
  };
}

/* ================================================================== *
 * Build
 * ================================================================== */

export function buildControlDiagrams(root) {
  const defs = svg('defs', {}, root);
  const m = svg('marker', {
    id: 'arrow-orange', viewBox: '0 0 10 10',
    refX: 6, refY: 5, markerWidth: 4.2, markerHeight: 4.2, orient: 'auto-start-reverse',
  }, defs);
  svg('path', { d: 'M0,0 L10,5 L0,10 z', fill: ORANGE }, m);

  const mb = svg('marker', {
    id: 'arrow-blue', viewBox: '0 0 10 10',
    refX: 6, refY: 5, markerWidth: 4.2, markerHeight: 4.2, orient: 'auto-start-reverse',
  }, defs);
  svg('path', { d: 'M0,0 L10,5 L0,10 z', fill: BLUE }, mb);

  const diagrams = {};
  for (const [name, build] of Object.entries({
    controller: controllerDiagram,
    command: commandDiagram,
    link: linkDiagram,
    calc: calcDiagram,
  })) {
    const g = svg('g', {}, defs);
    diagrams[name] = { g, ...build(g) };
    diagrams[name].tick(diagrams[name].rest);
  }
  return { defs, diagrams };
}
