/**
 * Procedural surface textures, drawn on canvases at runtime -- no image files.
 * Each returns one repeating tile; callers scale their UVs to size it.
 */

import * as THREE from 'three';

/** Small deterministic PRNG, so a texture is the same on every reload. */
function mulberry32(seed) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function makeCanvas(width, height = width) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return [canvas, canvas.getContext('2d')];
}

function toTexture(canvas) {
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
}

/** A CSS colour: `base` with its brightness scaled by k. */
function shade(base, k) {
  return new THREE.Color(base).multiplyScalar(k).getStyle();
}

/**
 * Stone paving: slabs x slabs square slabs with fine joints, each a slightly
 * different tone, flecked with the stone's grain.
 */
export function pavingTexture({
  base = '#cfcac1',
  joint = '#9f998f',
  slabs = 4,
  size = 512,
  variation = 0.07,
  seed = 7,
} = {}) {
  const [canvas, g] = makeCanvas(size);
  const rand = mulberry32(seed);
  const cell = size / slabs;

  for (let y = 0; y < slabs; y++) {
    for (let x = 0; x < slabs; x++) {
      g.fillStyle = shade(base, 1 + (rand() - 0.5) * 2 * variation);
      g.fillRect(x * cell, y * cell, cell, cell);
    }
  }

  for (let i = 0; i < size * size * 0.02; i++) {
    g.fillStyle = rand() < 0.5 ? 'rgba(0, 0, 0, 0.06)' : 'rgba(255, 255, 255, 0.07)';
    g.fillRect(rand() * size, rand() * size, 1 + rand() * 1.5, 1 + rand() * 1.5);
  }

  g.fillStyle = joint;
  const j = Math.max(1, size / 256);
  for (let k = 0; k < slabs; k++) {
    g.fillRect(k * cell, 0, j, size);
    g.fillRect(0, k * cell, size, j);
  }
  return toTexture(canvas);
}

/** Draws fill(x, y) at (x, y) and at every wrapped copy that reaches into the tile, so it tiles seamlessly. */
function wrapped(size, x, y, r, fill) {
  for (const dx of [-size, 0, size]) {
    for (const dy of [-size, 0, size]) {
      const cx = x + dx;
      const cy = y + dy;
      if (cx + r < 0 || cx - r > size || cy + r < 0 || cy - r > size) continue;
      fill(cx, cy);
    }
  }
}

/**
 * Grass: soft patches of greener and drier growth and a fine speckle of
 * blades, around white, to tint the ground colour. Tiles seamlessly.
 */
export function grassTexture({ size = 512, seed = 3 } = {}) {
  const [canvas, g] = makeCanvas(size);
  const rand = mulberry32(seed);
  g.fillStyle = '#e4e8dc';
  g.fillRect(0, 0, size, size);

  const tints = [
    [150, 175, 120],
    [255, 250, 215],
    [120, 150, 95],
    [205, 200, 150],
  ];
  for (let i = 0; i < 900; i++) {
    const x = rand() * size;
    const y = rand() * size;
    const r = 6 + rand() * rand() * 70;
    const [cr, cg, cb] = tints[Math.floor(rand() * tints.length)];
    const alpha = 0.05 + rand() * 0.12;
    wrapped(size, x, y, r, (cx, cy) => {
      const gradient = g.createRadialGradient(cx, cy, 0, cx, cy, r);
      gradient.addColorStop(0, `rgba(${cr}, ${cg}, ${cb}, ${alpha})`);
      gradient.addColorStop(1, `rgba(${cr}, ${cg}, ${cb}, 0)`);
      g.fillStyle = gradient;
      g.fillRect(cx - r, cy - r, 2 * r, 2 * r);
    });
  }

  for (let i = 0; i < size * size * 0.08; i++) {
    g.fillStyle = rand() < 0.5 ? 'rgba(40, 70, 20, 0.1)' : 'rgba(255, 255, 230, 0.1)';
    g.fillRect(rand() * size, rand() * size, 1, 1 + rand() * 2);
  }
  return toTexture(canvas);
}

/**
 * Facade tiles for the neighbouring blocks -- windows x windows window cells
 * -- and a matching glow map, black but for the lit windows. By day every
 * window reads as glass; which are lit shows only at night.
 *   glass     vision glass over dark spandrels, with fine mullions
 *   stone     punched windows set deep in warm stone, with sills
 *   concrete  ribbon windows in pale concrete
 */
export function facadeTextures(style, { windows = 8, cell = 32, litShare = 0.2, seed = 4711 } = {}) {
  const size = windows * cell;
  const [canvas, g] = makeCanvas(size);
  const [glowCanvas, glow] = makeCanvas(size);
  glow.fillStyle = '#000000';
  glow.fillRect(0, 0, size, size);
  const rand = mulberry32(seed);

  /** Glass: a vertical gradient, a touch different pane to pane. */
  const pane = (x, y, w, h, top, bottom) => {
    const k = 0.9 + rand() * 0.2;
    const gradient = g.createLinearGradient(0, y, 0, y + h);
    gradient.addColorStop(0, shade(top, k));
    gradient.addColorStop(1, shade(bottom, k));
    g.fillStyle = gradient;
    g.fillRect(x, y, w, h);
  };
  const light = (x, y, w, h) => {
    if (rand() >= litShare) return;
    glow.fillStyle = rand() < 0.3 ? '#fff1d6' : '#ffd58a';
    glow.fillRect(x, y, w, h);
  };
  const grain = (dark, bright) => {
    for (let i = 0; i < size * size * 0.03; i++) {
      g.fillStyle = rand() < 0.5 ? dark : bright;
      g.fillRect(rand() * size, rand() * size, 1 + rand(), 1 + rand());
    }
  };

  if (style === 'glass') {
    g.fillStyle = '#2d3842'; // spandrel
    g.fillRect(0, 0, size, size);
    const vision = Math.round(cell * 0.7);
    for (let y = 0; y < windows; y++) {
      for (let x = 0; x < windows; x++) {
        pane(x * cell, y * cell + 2, cell, vision, '#8ea6b9', '#5f778b');
        light(x * cell + 1, y * cell + 2, cell - 2, vision);
      }
    }
    g.fillStyle = '#a7b1b9'; // mullions and transoms
    for (let k = 0; k < windows; k++) {
      g.fillRect(k * cell, 0, 1, size);
      g.fillRect(0, k * cell + 2 + vision, size, 1);
    }
  } else if (style === 'stone') {
    g.fillStyle = '#cbbda4';
    g.fillRect(0, 0, size, size);
    grain('rgba(90, 70, 40, 0.07)', 'rgba(255, 250, 235, 0.08)');
    for (let y = 0; y < windows; y++) {
      g.fillStyle = '#baac93'; // string course
      g.fillRect(0, y * cell + cell - 3, size, 2);
      for (let x = 0; x < windows; x++) {
        const wx = x * cell + 7;
        const wy = y * cell + 5;
        const ww = cell - 14;
        const wh = cell - 12;
        g.fillStyle = '#7d715e'; // the reveal, in shadow
        g.fillRect(wx - 1, wy - 1, ww + 2, wh + 2);
        pane(wx + 1, wy + 1, ww - 1, wh - 1, '#5a6a79', '#3c4955');
        g.fillStyle = '#e2d8c4'; // sill
        g.fillRect(wx - 2, wy + wh + 1, ww + 4, 2);
        light(wx + 1, wy + 1, ww - 1, wh - 1);
      }
    }
  } else {
    g.fillStyle = '#bcbfbf';
    g.fillRect(0, 0, size, size);
    grain('rgba(60, 60, 60, 0.07)', 'rgba(255, 255, 255, 0.08)');
    const band = Math.round(cell * 0.52);
    for (let y = 0; y < windows; y++) {
      const by = y * cell + 7;
      pane(0, by, size, band, '#6f8494', '#4a5a68');
      g.fillStyle = '#8e979d';
      for (let x = 0; x < windows * 2; x++) g.fillRect((x * cell) / 2, by, 1, band);
      for (let x = 0; x < windows; x++) light(x * cell, by, cell, band);
    }
  }

  return [canvas, glowCanvas].map(toTexture);
}

/**
 * A shopfront storey: one tile of three tall glazed bays under a fascia with
 * a sign, and its glow map -- the shops and the sign lit at night.
 */
export function shopfrontTextures({ width = 192, height = 160, seed = 99 } = {}) {
  const [canvas, g] = makeCanvas(width, height);
  const [glowCanvas, glow] = makeCanvas(width, height);
  const rand = mulberry32(seed);
  g.fillStyle = '#2a2e33'; // frame
  g.fillRect(0, 0, width, height);
  glow.fillStyle = '#000000';
  glow.fillRect(0, 0, width, height);

  const fascia = Math.round(height * 0.2);
  g.fillStyle = '#3b4148';
  g.fillRect(0, 0, width, fascia);

  const bay = width / 3;
  for (let i = 0; i < 3; i++) {
    const x = i * bay + 4;
    const y = fascia + 4;
    const w = bay - 8;
    const h = height - fascia - 8;
    const gradient = g.createLinearGradient(0, y, 0, y + h);
    gradient.addColorStop(0, '#7890a2');
    gradient.addColorStop(1, '#3f4f5c');
    g.fillStyle = gradient;
    g.fillRect(x, y, w, h);
    glow.fillStyle = shade('#ffd9a0', 0.6 + rand() * 0.4);
    glow.fillRect(x, y, w, h);
  }

  const signX = 16 + rand() * (width - 96);
  g.fillStyle = '#d9dde0';
  g.fillRect(signX, fascia * 0.3, 64, fascia * 0.4);
  glow.fillStyle = '#ffffff';
  glow.fillRect(signX, fascia * 0.3, 64, fascia * 0.4);

  return [canvas, glowCanvas].map(toTexture);
}

/** Horizontal louvre blades, `blades` to a tile: lit upper faces over shadowed gaps. */
export function louvreTexture({ blades = 8, size = 128 } = {}) {
  const [canvas, g] = makeCanvas(size);
  const pitch = size / blades;
  for (let i = 0; i < blades; i++) {
    const y = i * pitch;
    const gradient = g.createLinearGradient(0, y, 0, y + pitch);
    gradient.addColorStop(0, '#e2e5e8');
    gradient.addColorStop(0.55, '#a4aab0');
    gradient.addColorStop(0.7, '#33373b');
    gradient.addColorStop(1, '#4c5156');
    g.fillStyle = gradient;
    g.fillRect(0, y, size, pitch);
  }
  return toTexture(canvas);
}
