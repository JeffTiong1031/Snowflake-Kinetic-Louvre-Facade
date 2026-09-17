/**
 * The control system's flat diagrams, for the explanation's diagram panel:
 * the Arduino reading the four LDRs and deciding, the SG90 servo taking its
 * PWM signal, the hub linkage, and the trapezoidal blades tilting. Flat
 * vector SVG, built at runtime -- no image files.
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

/** The angle the Arduino settles on in the worked example, degrees of blade tilt. */
export const TARGET_ANGLE = 30;

/**
 * Blade tilt loops, seconds: the linkage step drives to the target, the
 * louvre step sweeps the full 0-45 range. The 3D slats follow the same.
 */
export const LINKAGE_CYCLE = { to: TARGET_ANGLE, up: 1.2, hold: 1.6, down: 1.0, rest: 0.4 };
export const LOUVRE_CYCLE = { to: 45, up: 1.4, hold: 1.2, down: 1.4, rest: 0.6 };

const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const ease = (x) => {
  const t = clamp01(x);
  return t * t * (3 - 2 * t);
};

/** Blade tilt at time t through one of the loops above: [degrees, moving]. */
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
const rectAttrs = ({ x, y, w, h }) => ({ x, y, width: w, height: h });

/** A polyline with its corners rounded to radius r, as path data. */
function roundedPath(points, r) {
  let d = `M${points[0][0]},${points[0][1]}`;
  for (let i = 1; i < points.length - 1; i++) {
    const [px, py] = points[i - 1];
    const [x, y] = points[i];
    const [nx, ny] = points[i + 1];
    const k1 = Math.min(r, Math.hypot(x - px, y - py) / 2) / Math.hypot(x - px, y - py);
    const k2 = Math.min(r, Math.hypot(nx - x, ny - y) / 2) / Math.hypot(nx - x, ny - y);
    d += ` L${x - (x - px) * k1},${y - (y - py) * k1} Q${x},${y} ${x + (nx - x) * k2},${y + (ny - y) * k2}`;
  }
  const [lx, ly] = points[points.length - 1];
  return `${d} L${lx},${ly}`;
}

/** A point at radius r, angle a (radians, anticlockwise from +x) about (cx, cy), on screen. */
const polar = ([cx, cy], r, a) => [cx + r * Math.cos(a), cy - r * Math.sin(a)];

/** Offset by d along angle a's tangent (anticlockwise), on screen. */
const along = ([x, y], d, a) => [x - d * Math.sin(a), y - d * Math.cos(a)];

const armAngle = (i) => (i * 60 + C.ARM_PHASE_DEG) * DEG;

/* ------------------------------------------------------------------ *
 * The Arduino Uno, upright: USB and power on top, power and analog
 * headers down the left, digital down the right
 * ------------------------------------------------------------------ */

function drawUno(parent, x, y) {
  const g = svg('g', { transform: `translate(${x} ${y})` }, parent);
  svg('rect', { x: 0, y: 0, width: 240, height: 340, rx: 14, fill: FILL, stroke: BLUE, 'stroke-width': 2 }, g);
  svg('rect', { x: 26, y: -18, width: 58, height: 52, rx: 3, fill: '#C9D3DD', stroke: BLUE, 'stroke-width': 1.5 }, g);
  svg('rect', { x: 162, y: -12, width: 46, height: 58, rx: 5, fill: INK }, g);

  const header = (hx, hy, n) => {
    svg('rect', { x: hx, y: hy, width: 14, height: 16 * n, rx: 2, fill: INK }, g);
    for (let k = 0; k < n; k++) {
      svg('rect', { x: hx + 4, y: hy + 5 + 16 * k, width: 6, height: 6, fill: '#8B96A2' }, g);
    }
  };
  header(4, 84, 8); // power
  header(4, 212, 6); // analog A0-A5
  header(222, 60, 8); // digital 0-7
  header(222, 200, 8); // digital 8-13

  // ICSP header: its bottom row carries GND and 5V.
  svg('rect', { x: 100, y: 296, width: 44, height: 30, rx: 2, fill: INK }, g);
  for (const px of [104, 118, 132]) {
    for (const py of [299, 313]) svg('rect', { x: px, y: py, width: 8, height: 8, fill: '#8B96A2' }, g);
  }

  // The ATmega328P, the crystal, the reset button.
  svg('rect', { x: 98, y: 130, width: 46, height: 150, rx: 3, fill: INK }, g);
  for (let k = 0; k < 14; k++) {
    for (const [x1, x2] of [[92, 98], [144, 150]]) {
      svg('line', { x1, y1: 137 + k * 10, x2, y2: 137 + k * 10, stroke: '#8B96A2', 'stroke-width': 2 }, g);
    }
  }
  svg('circle', { cx: 121, cy: 138, r: 3.5, fill: '#5B6673' }, g);
  svg('rect', { x: 60, y: 176, width: 14, height: 34, rx: 7, fill: '#C9D3DD', stroke: BLUE, 'stroke-width': 1.2 }, g);
  svg('rect', { x: 180, y: 70, width: 22, height: 22, rx: 3, fill: '#C9D3DD', stroke: BLUE, 'stroke-width': 1.2 }, g);
  svg('circle', { cx: 191, cy: 81, r: 6, fill: '#fff', stroke: BLUE, 'stroke-width': 1 }, g);

  const led = svg('rect', { x: 186, y: 112, width: 14, height: 8, rx: 2, fill: ORANGE }, g);
  label(g, 120, 110, 'UNO', {
    'text-anchor': 'middle',
    'font-size': 30,
    'font-weight': 800,
    'letter-spacing': 2,
    fill: BLUE,
  });

  return {
    led,
    analog: [0, 1, 2, 3].map((k) => [x + 11, y + 220 + 16 * k]),
    pin9: [x + 229, y + 224],
    gnd: [x + 122, y + 317],
    v5: [x + 136, y + 317],
  };
}

/* ------------------------------------------------------------------ *
 * The Arduino analyses and decides
 *
 * The four sensor signals come in from the panel's left edge, where the
 * explanation joins them to the LDRs in the 3D view (inputs).
 * ------------------------------------------------------------------ */

function arduinoDiagram(g) {
  const uno = drawUno(g, 170, 40);

  const flows = uno.analog.map(([x, y]) => {
    svg('line', { x1: 0, y1: y, x2: x, y2: y, stroke: '#E6EBF0', 'stroke-width': 5 }, g);
    return svg('line', {
      x1: 0,
      y1: y,
      x2: x,
      y2: y,
      stroke: ORANGE,
      'stroke-width': 2.5,
      'stroke-dasharray': '9 7',
      opacity: 0,
    }, g);
  });
  label(g, 160, uno.analog[0][1] - 14, 'A0–A3', { 'text-anchor': 'end', 'font-size': 13, 'font-weight': 700, fill: BLUE });

  // The decision -- kept short: a step shows at most 25 words.
  const callout = svg('g', { opacity: 0 }, g);
  svg('rect', { x: 432, y: 120, width: 178, height: 124, rx: 10, fill: '#fff', stroke: BLUE, 'stroke-width': 1.5 }, callout);
  svg('path', { d: 'M433,168 L416,182 L433,196', fill: '#fff', stroke: BLUE, 'stroke-width': 1.5 }, callout);
  const lines = [
    label(callout, 446, 158, 'max(A0…A3) = A0', { 'font-family': MONO, 'font-size': 14.5, fill: BLUE }),
    label(callout, 446, 190, '→ upper-left', { 'font-family': MONO, 'font-size': 14.5, fill: BLUE }),
    label(callout, 446, 222, '→ ', { 'font-family': MONO, 'font-size': 14.5, fill: BLUE }),
  ];
  const angle = svg('tspan', { fill: ORANGE, 'font-weight': 700 }, lines[2]);
  angle.textContent = '0°';

  return {
    viewBox: [0, 0, 620, 400],
    inputs: uno.analog.map(([, y]) => [0, y]),
    rest: 3,
    tick(t) {
      flows.forEach((flow, i) => {
        flow.setAttribute('opacity', ease((t - 0.3 - i * 0.12) / 0.35));
        flow.setAttribute('stroke-dashoffset', -t * 40);
      });
      callout.setAttribute('opacity', ease((t - 0.75) / 0.35));
      lines.forEach((line, i) => line.setAttribute('opacity', ease((t - 0.9 - i * 0.3) / 0.3)));
      angle.textContent = `${Math.round(TARGET_ANGLE * ease((t - 1.5) / 0.8))}°`;
      uno.led.setAttribute('opacity', t % 0.5 < 0.25 ? 1 : 0.25);
    },
  };
}

/* ------------------------------------------------------------------ *
 * The servo receives the signal and rotates
 * ------------------------------------------------------------------ */

function servoDiagram(g) {
  const uno = drawUno(g, 180, 106);
  const [px, Y] = uno.pin9;
  const BODY = { x: 860, y: 286, w: 250, h: 96 };
  const SHAFT = [1050, 334];

  // Supply: 5V and GND from the ICSP header, round under the board.
  const wire = (points, color) =>
    svg('path', { d: roundedPath(points, 10), fill: 'none', stroke: color, 'stroke-width': 3, 'stroke-linejoin': 'round' }, g);
  wire([[BODY.x, 342], [700, 342], [700, 490], [uno.v5[0], 490], uno.v5], '#D64541');
  wire([[BODY.x, 350], [716, 350], [716, 506], [uno.gnd[0], 506], uno.gnd], '#7A5230');
  label(g, uno.v5[0] + 7, 470, '5V', { 'font-size': 12, 'font-weight': 700, fill: INK });
  label(g, uno.gnd[0] - 7, 470, 'GND', { 'text-anchor': 'end', 'font-size': 12, 'font-weight': 700, fill: INK });

  // Signal: pin 9 to the servo, carrying the PWM pulse train.
  svg('line', { x1: px, y1: Y, x2: BODY.x, y2: Y, stroke: ORANGE, 'stroke-width': 3 }, g);
  const clip = svg('clipPath', { id: 'pwm-window' }, g);
  svg('rect', { x: px + 12, y: Y - 34, width: BODY.x - px - 24, height: 40 }, clip);
  const windowed = svg('g', { 'clip-path': 'url(#pwm-window)' }, g);
  const PERIOD = 64;
  let d = `M${px - PERIOD},${Y}`;
  for (let x = px - PERIOD; x < BODY.x + PERIOD; x += PERIOD) d += ' h14 v-22 h9 v22 h41';
  const train = svg('path', { d, fill: 'none', stroke: ORANGE, 'stroke-width': 2.5, 'stroke-linejoin': 'round' }, windowed);
  label(g, (px + BODY.x) / 2, Y - 46, 'PWM · pin 9', { 'text-anchor': 'middle', 'font-weight': 700, fill: BLUE });

  // The SG90, from above: mounting ears, body, gear tower, output shaft.
  svg('rect', { x: BODY.x - 30, y: SHAFT[1] - 20, width: BODY.w + 60, height: 40, rx: 6, fill: FILL, stroke: BLUE, 'stroke-width': 1.5 }, g);
  for (const hx of [BODY.x - 14, BODY.x + BODY.w + 14]) {
    svg('circle', { cx: hx, cy: SHAFT[1], r: 6, fill: '#fff', stroke: BLUE, 'stroke-width': 1.2 }, g);
  }
  svg('rect', { ...rectAttrs(BODY), rx: 8, fill: '#C9DAEC', stroke: BLUE, 'stroke-width': 2 }, g);
  label(g, 934, SHAFT[1] + 8, 'SG90', { 'text-anchor': 'middle', 'font-size': 22, 'font-weight': 800, fill: BLUE });
  svg('circle', { cx: SHAFT[0], cy: SHAFT[1], r: 42, fill: FILL, stroke: BLUE, 'stroke-width': 1.5 }, g);

  // The commanded travel.
  const arcR = 118;
  const [ax, ay] = [SHAFT[0] + arcR * Math.sin(TARGET_ANGLE * DEG), SHAFT[1] - arcR * Math.cos(TARGET_ANGLE * DEG)];
  svg('path', {
    d: `M${SHAFT[0]},${SHAFT[1] - arcR} A${arcR},${arcR} 0 0 1 ${ax},${ay}`,
    fill: 'none',
    stroke: ORANGE,
    'stroke-width': 2.5,
    'marker-end': 'url(#arrow-orange)',
  }, g);
  label(g, SHAFT[0], SHAFT[1] - arcR - 10, '0°', { 'text-anchor': 'middle', 'font-weight': 700, fill: GREY });
  label(g, ax + 10, ay - 4, `${TARGET_ANGLE}°`, { 'font-weight': 700, fill: ORANGE });

  // The horn, turning about the shaft.
  const horn = svg('g', {}, g);
  const [hx, hy] = SHAFT;
  svg('path', {
    d: `M${hx - 18},${hy} A18,18 0 1,0 ${hx + 18},${hy} L${hx + 10},${hy - 92} A10,10 0 0,0 ${hx - 10},${hy - 92} Z`,
    fill: '#fff',
    stroke: BLUE,
    'stroke-width': 1.8,
    'stroke-linejoin': 'round',
  }, horn);
  for (const k of [42, 62, 82]) svg('circle', { cx: hx, cy: hy - k, r: 2.4, fill: BLUE }, horn);
  svg('circle', { cx: hx, cy: hy, r: 7, fill: FILL, stroke: BLUE, 'stroke-width': 1.5 }, horn);

  return {
    viewBox: [160, 60, 1000, 480],
    rest: 2,
    tick(t) {
      train.setAttribute('transform', `translate(${(t * 120) % PERIOD} 0)`);
      // Turn to the commanded angle, hold it, and -- for the loop -- come back.
      const c = t % 4;
      const a = c < 0.9 ? TARGET_ANGLE * ease(c / 0.9) : c < 3.4 ? TARGET_ANGLE : TARGET_ANGLE * (1 - ease((c - 3.4) / 0.6));
      horn.setAttribute('transform', `rotate(${a} ${hx} ${hy})`);
      uno.led.setAttribute('opacity', t % 0.5 < 0.25 ? 1 : 0.25);
    },
  };
}

/* ------------------------------------------------------------------ *
 * The hub, its linkage and the six trapezoidal blades, face on
 *
 * The servo turns the hub; the hub's spider arms pull a link each; each
 * link swings a crank on its blade's inner end, turning the blade about its
 * radial axis. Hub arm and crank are the same length, so the blades tilt
 * by the angle the hub turns. A blade at 0 stands edge-on to the facade;
 * as it tilts, more of its face shows.
 * ------------------------------------------------------------------ */

function drawLouvreRing(g, centre, k, { linkage }) {
  const R_ARM = 48 * k;
  const R_IN = 108 * k;
  const R_OUT = 245 * k;
  const W_IN = 20 * k;
  const W_OUT = 58 * k;
  const blades = [0, 1, 2, 3, 4, 5].map((i) => armAngle(i) + 30 * DEG);

  for (let i = 0; i < C.ARM_COUNT; i++) {
    const [x1, y1] = polar(centre, 60 * k, armAngle(i));
    const [x2, y2] = polar(centre, 258 * k, armAngle(i));
    svg('line', { x1, y1, x2, y2, stroke: '#EEF2F6', 'stroke-width': 12 * k, 'stroke-linecap': 'round' }, g);
  }
  const shadows = blades.map(() => svg('polygon', { fill: INK, 'fill-opacity': 0.16 }, g));
  const faces = blades.map(() =>
    svg('polygon', { fill: FILL, stroke: BLUE, 'stroke-width': 1.6, 'stroke-linejoin': 'round' }, g)
  );
  for (const b of blades) {
    const [x1, y1] = polar(centre, R_IN - 6 * k, b);
    const [x2, y2] = polar(centre, R_OUT + 12 * k, b);
    svg('line', { x1, y1, x2, y2, stroke: BLUE, 'stroke-width': 1, 'stroke-dasharray': '5 4', opacity: 0.55 }, g);
  }

  const style = linkage
    ? { link: ORANGE, linkWidth: 4, arm: BLUE }
    : { link: GREY, linkWidth: 2.5, arm: GREY };
  const links = blades.map(() => svg('line', { stroke: style.link, 'stroke-width': style.linkWidth, 'stroke-linecap': 'round' }, g));
  const cranks = blades.map(() => svg('line', { stroke: BLUE, 'stroke-width': 3 * k, 'stroke-linecap': 'round' }, g));
  const pins = blades.map(() => svg('circle', { r: 4.5 * k, fill: '#fff', stroke: BLUE, 'stroke-width': 1.6 }, g));

  const hub = svg('g', {}, g);
  for (const b of blades) {
    const [x2, y2] = polar(centre, R_ARM, b);
    svg('line', { x1: centre[0], y1: centre[1], x2, y2, stroke: style.arm, 'stroke-width': 6 * k, 'stroke-linecap': 'round' }, hub);
    svg('circle', { cx: x2, cy: y2, r: 5 * k, fill: '#fff', stroke: style.arm, 'stroke-width': 1.6 }, hub);
  }
  svg('polygon', {
    points: pts(Array.from({ length: 6 }, (_, i) => polar(centre, 30 * k, armAngle(i)))),
    fill: FILL,
    stroke: BLUE,
    'stroke-width': 2,
  }, hub);
  svg('circle', { cx: centre[0], cy: centre[1], r: 7 * k, fill: '#fff', stroke: BLUE, 'stroke-width': 1.5 }, hub);

  /** Pose everything for a blade tilt of theta degrees; returns the link midpoints. */
  function pose(theta, shadowReach = 0) {
    // Edge-on, a blade still shows as a slim trapezoid -- its thickness, drawn up so it reads.
    const s = Math.max(Math.sin(theta * DEG), 0.12);
    const mids = [];
    blades.forEach((b, i) => {
      const inner = polar(centre, R_IN, b);
      const outer = polar(centre, R_OUT, b);
      const face = [along(inner, W_IN * s, b), along(outer, W_OUT * s, b), along(outer, -W_OUT * s, b), along(inner, -W_IN * s, b)];
      faces[i].setAttribute('points', pts(face));
      shadows[i].setAttribute('points', pts(face.map(([x, y]) => [x + shadowReach * 1.2, y + shadowReach])));

      const arm = polar(centre, R_ARM, b + theta * DEG);
      const crank = along(inner, R_ARM * Math.sin(theta * DEG), b);
      links[i].setAttribute('x1', arm[0]);
      links[i].setAttribute('y1', arm[1]);
      links[i].setAttribute('x2', crank[0]);
      links[i].setAttribute('y2', crank[1]);
      cranks[i].setAttribute('x1', inner[0]);
      cranks[i].setAttribute('y1', inner[1]);
      cranks[i].setAttribute('x2', crank[0]);
      cranks[i].setAttribute('y2', crank[1]);
      pins[i].setAttribute('cx', crank[0]);
      pins[i].setAttribute('cy', crank[1]);
      mids.push([(arm[0] + crank[0]) / 2, (arm[1] + crank[1]) / 2]);
    });
    hub.setAttribute('transform', `rotate(${-theta} ${centre[0]} ${centre[1]})`);
    return mids;
  }

  return { pose, blades };
}

/* ------------------------------------------------------------------ *
 * The linkage distributes the motion
 * ------------------------------------------------------------------ */

function linkageDiagram(g) {
  const O = [750, 290];

  // The servo sits behind the hub, its horn fixed to the hub's centre.
  svg('rect', {
    x: O[0] - 34,
    y: O[1] - 24,
    width: 150,
    height: 48,
    rx: 6,
    fill: 'none',
    stroke: GREY,
    'stroke-width': 1.6,
    'stroke-dasharray': '6 5',
  }, g);

  const ring = drawLouvreRing(g, O, 1, { linkage: true });

  // Motion spreading from the hub to every blade at once.
  const spread = ring.blades.map((b) => {
    const [x1, y1] = along(polar(O, 58, b), -22, b);
    const [x2, y2] = along(polar(O, 96, b), -22, b);
    return svg('line', {
      x1, y1, x2, y2,
      stroke: ORANGE,
      'stroke-width': 5,
      'stroke-linecap': 'round',
      'marker-end': 'url(#arrow-orange)',
    }, g);
  });

  // Which way the hub turns.
  const [tx0, ty0] = polar(O, 80, 200 * DEG);
  const [tx1, ty1] = polar(O, 80, 232 * DEG);
  const turn = svg('path', {
    d: `M${tx0},${ty0} A80,80 0 0 0 ${tx1},${ty1}`,
    fill: 'none',
    stroke: ORANGE,
    'stroke-width': 3,
    'marker-end': 'url(#arrow-orange)',
  }, g);

  // Labels, their leaders running out along the spine corridors between blades.
  const leader = (from, to, text, anchor) => {
    const line = svg('line', { x1: from[0], y1: from[1], x2: to[0], y2: to[1], stroke: BLUE, 'stroke-width': 1.2 }, g);
    label(g, to[0] + (anchor === 'end' ? -6 : anchor === 'start' ? 6 : 0), to[1] + (anchor === 'middle' ? -8 : 5), text, {
      'text-anchor': anchor,
      'font-weight': 700,
      fill: BLUE,
    });
    return line;
  };
  leader(polar(O, 34, 90 * DEG), polar(O, 262, 90 * DEG), 'hub', 'middle');
  const linkLeader = leader([0, 0], polar(O, 280, 210 * DEG), 'link', 'end');
  leader(polar(O, 250, 0), [O[0] + 292, O[1]], 'blade', 'start');
  leader([O[0] + 50, O[1] + 24], polar(O, 285, 330 * DEG), 'servo behind hub', 'start');
  const linkBlade = ring.blades.findIndex((b) => Math.abs(Math.cos(b) + 1) < 1e-6); // the one pointing left

  return {
    viewBox: [440, 10, 700, 540],
    rest: 2,
    tick(t) {
      const [theta, moving] = tiltCycle(t, LINKAGE_CYCLE);
      const mids = ring.pose(theta);
      linkLeader.setAttribute('x1', mids[linkBlade][0]);
      linkLeader.setAttribute('y1', mids[linkBlade][1]);
      const pulse = moving ? 0.55 + 0.45 * Math.sin(t * 10) : 0.35;
      for (const arrow of spread) arrow.setAttribute('opacity', pulse);
      turn.setAttribute('opacity', moving ? 1 : 0.35);
    },
  };
}

/* ------------------------------------------------------------------ *
 * The louvres tilt
 * ------------------------------------------------------------------ */

function louvresDiagram(g) {
  // Face on: the six blades, their shadow on the facade growing as they close.
  const ring = drawLouvreRing(g, [400, 280], 0.9, { linkage: false });
  label(g, 400, 548, 'front view', { 'text-anchor': 'middle', 'font-weight': 700, fill: GREY });

  // In section: one blade on its pivot, the facade behind, the sun's rays.
  const P = [1090, 230];
  const FACADE = 1320;
  const HALF_LEN = 130;
  const d = [Math.cos(30 * DEG), Math.sin(30 * DEG)]; // the sun's rays, down and in
  svg('rect', { x: FACADE, y: 60, width: 12, height: 460, fill: FILL, stroke: BLUE, 'stroke-width': 1.5 }, g);
  label(g, FACADE + 6, 50, 'façade', { 'text-anchor': 'middle', 'font-weight': 700, fill: BLUE });
  label(g, 1090, 548, 'section', { 'text-anchor': 'middle', 'font-weight': 700, fill: GREY });

  const sunAt = [800, 64];
  for (let k = 0; k < 8; k++) {
    const [x1, y1] = polar(sunAt, 24, k * 45 * DEG);
    const [x2, y2] = polar(sunAt, 32, k * 45 * DEG);
    svg('line', { x1, y1, x2, y2, stroke: ORANGE, 'stroke-width': 3, 'stroke-linecap': 'round' }, g);
  }
  svg('circle', { cx: sunAt[0], cy: sunAt[1], r: 18, fill: ORANGE }, g);
  label(g, sunAt[0] + 40, sunAt[1] - 18, 'sun', { 'font-weight': 700, fill: BLUE });

  // Rays, spaced down the facade; each runs back up-sun to where it enters the view.
  const rays = [90, 150, 210, 270, 330, 390, 450, 510].map((yf) => {
    const back = Math.min((FACADE - 770) / d[0], (yf - 50) / d[1]);
    const start = [FACADE - d[0] * back, yf - d[1] * back];
    const line = svg('line', {
      x1: start[0],
      y1: start[1],
      stroke: ORANGE,
      'stroke-width': 2.5,
      'stroke-dasharray': '10 7',
      'stroke-linecap': 'round',
      'marker-end': 'url(#arrow-orange)',
    }, g);
    return { start, line };
  });

  const shadowVolume = svg('polygon', { fill: INK, 'fill-opacity': 0.07 }, g);
  const shadowBand = svg('rect', { x: FACADE, width: 12, fill: INK, 'fill-opacity': 0.45 }, g);
  const shadowText = label(g, FACADE + 22, 0, 'shadow', { 'font-weight': 700, fill: INK });

  // Angle references: 0 (flat, edge-on to the facade) and the 45 limit.
  svg('line', { x1: P[0], y1: P[1], x2: P[0] - 200, y2: P[1], stroke: GREY, 'stroke-width': 1.5, 'stroke-dasharray': '6 5' }, g);
  label(g, P[0] - 208, P[1] + 5, '0°', { 'text-anchor': 'end', 'font-weight': 700, fill: GREY });
  const lim = [P[0] - 170 * Math.cos(45 * DEG), P[1] + 170 * Math.sin(45 * DEG)];
  svg('line', { x1: P[0], y1: P[1], x2: lim[0], y2: lim[1], stroke: GREY, 'stroke-width': 1.5, 'stroke-dasharray': '6 5' }, g);
  label(g, lim[0] - 6, lim[1] + 16, '45°', { 'text-anchor': 'end', 'font-weight': 700, fill: GREY });

  // Which way it turns as it closes.
  const [rx0, ry0] = [P[0] - 150, P[1]];
  const [rx1, ry1] = [P[0] - 150 * Math.cos(45 * DEG), P[1] + 150 * Math.sin(45 * DEG)];
  const turn = svg('path', {
    d: `M${rx0},${ry0} A150,150 0 0 0 ${rx1},${ry1}`,
    fill: 'none',
    stroke: ORANGE,
    'stroke-width': 3,
    'marker-end': 'url(#arrow-orange)',
  }, g);

  const wedge = svg('path', { fill: ORANGE, 'fill-opacity': 0.15, stroke: ORANGE, 'stroke-width': 2 }, g);
  const blade = svg('polygon', { fill: FILL, stroke: BLUE, 'stroke-width': 2, 'stroke-linejoin': 'round' }, g);
  svg('circle', { cx: P[0], cy: P[1], r: 6, fill: '#fff', stroke: BLUE, 'stroke-width': 2 }, g);
  const readout = label(g, 0, 0, '0°', { 'text-anchor': 'end', 'font-size': 22, 'font-weight': 800, fill: ORANGE });

  return {
    viewBox: [130, 20, 1350, 540],
    rest: 2,
    tick(t) {
      const [theta, moving] = tiltCycle(t, LOUVRE_CYCLE);
      const s = Math.sin(theta * DEG);
      ring.pose(theta, 6 + 14 * s);

      // The section blade: its far (sunward) end dips as it closes toward the sun.
      const b = [Math.cos(theta * DEG), -Math.sin(theta * DEG)];
      const n = [-b[1], b[0]];
      const E1 = [P[0] - b[0] * HALF_LEN, P[1] - b[1] * HALF_LEN];
      const E2 = [P[0] + b[0] * HALF_LEN, P[1] + b[1] * HALF_LEN];
      blade.setAttribute('points', pts([
        [E1[0] + n[0] * 6, E1[1] + n[1] * 6],
        [E2[0] + n[0] * 6, E2[1] + n[1] * 6],
        [E2[0] - n[0] * 6, E2[1] - n[1] * 6],
        [E1[0] - n[0] * 6, E1[1] - n[1] * 6],
      ]));

      // Its shadow on the facade: each end cast along the rays.
      const onFacade = (E) => E[1] + ((FACADE - E[0]) * d[1]) / d[0];
      const y1 = onFacade(E1);
      const y2 = onFacade(E2);
      const top = Math.min(y1, y2);
      const bottom = Math.max(y1, y2);
      shadowBand.setAttribute('y', top);
      shadowBand.setAttribute('height', bottom - top);
      shadowVolume.setAttribute('points', pts([E1, E2, [FACADE, y2], [FACADE, y1]]));
      shadowText.setAttribute('y', (top + bottom) / 2 + 5);

      // Rays stop where they meet the blade; the rest reach the facade.
      for (const ray of rays) {
        const [sx, sy] = ray.start;
        let end = [FACADE, sy + ((FACADE - sx) * d[1]) / d[0]];
        // start + d * dist = E1 + (E2 - E1) * u, solved by cross products.
        const ex = E2[0] - E1[0];
        const ey = E2[1] - E1[1];
        const wx = E1[0] - sx;
        const wy = E1[1] - sy;
        const den = d[0] * ey - d[1] * ex;
        if (Math.abs(den) > 1e-9) {
          const dist = (wx * ey - wy * ex) / den;
          const u = (wx * d[1] - wy * d[0]) / den;
          if (u >= 0 && u <= 1 && dist > 0) end = [sx + d[0] * dist, sy + d[1] * dist];
        }
        ray.line.setAttribute('x2', end[0]);
        ray.line.setAttribute('y2', end[1]);
        ray.line.setAttribute('stroke-dashoffset', -t * 30);
      }

      // The angle, and its arc from flat.
      const ar = 90;
      const tip = [P[0] - ar * Math.cos(theta * DEG), P[1] + ar * Math.sin(theta * DEG)];
      wedge.setAttribute('d', `M${P[0]},${P[1]} L${P[0] - ar},${P[1]} A${ar},${ar} 0 0 0 ${tip[0]},${tip[1]} Z`);
      // The number sits outside the turning arrow, clear of it and the blade at any angle.
      const mid = (theta / 2) * DEG;
      readout.setAttribute('x', P[0] - 185 * Math.cos(mid) - 4);
      readout.setAttribute('y', P[1] + 185 * Math.sin(mid) + 28);
      readout.textContent = `${Math.round(theta)}°`;
      turn.setAttribute('opacity', moving ? 1 : 0.4);
    },
  };
}

/* ------------------------------------------------------------------ *
 * Building them
 * ------------------------------------------------------------------ */

/**
 * Builds every diagram into `root` (an <svg>), each in its own group, kept
 * in <defs> until shown.
 * @returns {{ defs: SVGDefsElement, diagrams: Record<string, {g, viewBox, tick, rest, inputs?}> }}
 */
export function buildControlDiagrams(root) {
  const defs = svg('defs', {}, root);
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

  const diagrams = {};
  for (const [name, build] of Object.entries({
    arduino: arduinoDiagram,
    servo: servoDiagram,
    linkage: linkageDiagram,
    louvres: louvresDiagram,
  })) {
    const g = svg('g', {}, defs);
    diagrams[name] = { g, ...build(g) };
    diagrams[name].tick(diagrams[name].rest);
  }
  return { defs, diagrams };
}
