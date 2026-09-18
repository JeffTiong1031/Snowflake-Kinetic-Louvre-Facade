/**
 * Snowflake module geometry, built procedurally.
 *
 * Module-local frame: X = facade right, Y = facade up, Z = outward normal.
 * Everything static (hub, bolts, spines, tips, bisector bars, slat hinge pins,
 * frame ring, brackets) merges into ONE BufferGeometry per material, so the
 * whole field of modules costs two instanced draw calls. The moving parts are
 * separate: the slats (each with a lug on its back), the two links under each
 * chevron, and the carriage sliding behind each gap.
 */

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import * as C from './constants.js';

const DEG = Math.PI / 180;
const ARM_PHASE = C.ARM_PHASE_DEG * DEG;
/** Hub spin that seats a hexagon vertex under each spine. See buildModuleStaticGeometry. */
const HUB_SPIN = ARM_PHASE + Math.PI / 2;

/* ---- Slat layout ----
 * Worked in the frame of a gap's first spine (A): x out along it, y across the
 * gap toward spine B, the bisector halfway between. Half A of the gap holds
 * slats running parallel to spine B, from spine A out to the bisector; half B
 * is half A mirrored across the bisector -- shape, position and motion. Each
 * row of the two makes a pointed chevron, and the rows together a diamond
 * pointing out along the bisector: six of those make the star.
 *
 * Half A is laid out in (p, q): p along the slats, q across them, growing
 * outward. x = p cos S + q sin S, y = p sin S - q cos S, S = the 60deg spread
 * between the spines. */

/** Spine to gap bisector: 30deg. */
const HALF = Math.PI / C.ARM_COUNT;
/** Spine to spine: 60deg. Half A's slats run at this angle to spine A. */
const SPREAD = 2 * HALF;
const ALONG = [Math.cos(SPREAD), Math.sin(SPREAD)];
const ACROSS = [Math.sin(SPREAD), -Math.cos(SPREAD)];
const BISECTOR = new THREE.Vector3(Math.cos(HALF), Math.sin(HALF), 0);
/**
 * Half A's slat frames to half B's: a half-turn about the bisector. Combined
 * with opening the other way round in its own frame, that makes half B the
 * mirror image of half A at every angle.
 */
const TO_HALF_B = new THREE.Quaternion().setFromAxisAngle(BISECTOR, Math.PI);

/** Slat mid-plane, which the hinges lie in: front face flush with the spines. */
const PLATE_Z = C.ARM_DEPTH / 2 - C.SLAT_THICKNESS / 2;

/** How far behind a slat's mid-plane its link pins on: the tip of the lug on its back. */
const GRIP_DEPTH = C.SLAT_THICKNESS / 2 + C.LINK_LUG;

/** Offset of every slat's spine end off spine A's centreline: just clear of its side. */
const SPINE_END = C.ARM_WIDTH / 2 + C.SLAT_SPINE_GAP;

/** The hub's straight edge in the gap faces along the bisector; this adds the clearance. */
const HUB_EDGE = C.HUB_ACROSS_FLATS / 2 + C.SLAT_HUB_GAP;

/** Half A point (p, q) in the gap frame. */
function gapPoint(p, q) {
  return [p * ALONG[0] + q * ACROSS[0], p * ALONG[1] + q * ACROSS[1]];
}

/** p at which the line of constant q sits `offset` off spine A's centreline. */
function pAtSpine(q, offset) {
  return (offset + q * Math.cos(SPREAD)) / Math.sin(SPREAD);
}

/** p of the mitre line -- SLAT_APEX_GAP short of the bisector -- at q. */
function pMitre(q) {
  return (q * Math.cos(HALF) - C.SLAT_APEX_GAP) / Math.sin(HALF);
}

/** p where the line of constant q crosses the bisector. */
function pBisector(q) {
  return (q * Math.cos(HALF)) / Math.sin(HALF);
}

/** p of the hub-clearance line at q. */
function pHub(q) {
  return (HUB_EDGE - q * Math.sin(HALF)) / Math.cos(HALF);
}

/**
 * The slats of one half-gap, innermost first: each a band of q, cut parallel
 * to the spine side at one end and mitred at the bisector at the other, so
 * closed they fill right up to the spine. Where the hub's straight edge cuts
 * across a slat's inner spine corner, the outline follows that edge instead.
 * Each slat hinges on its outer edge (q = hi), and its link grips its back
 * LINK_REACH in from there, as near the point as the mitre allows.
 * Outlines are in (p, q), mm.
 */
function slatRows() {
  const rows = [];
  let lo = C.SLAT_FIRST_EDGE * Math.sin(SPREAD);
  C.SLAT_WIDTHS.forEach((width, row) => {
    const hi = lo + width;
    const outline = [[pAtSpine(hi, SPINE_END), hi], [pMitre(hi), hi], [pMitre(lo), lo]];
    if (pHub(lo) > pAtSpine(lo, SPINE_END)) {
      // Where the spine end line meets the hub-clearance line.
      const q =
        (HUB_EDGE * Math.sin(SPREAD) - SPINE_END * Math.cos(HALF)) / Math.cos(SPREAD - HALF);
      outline.push([pHub(lo), lo], [pAtSpine(q, SPINE_END), q]);
    } else {
      outline.push([pAtSpine(lo, SPINE_END), lo]);
    }
    rows.push({
      row,
      lo,
      hi,
      width,
      /** Where the hinge leaves the slat's spine end. */
      pSpineEnd: pAtSpine(hi, SPINE_END),
      /** The link's station along the hinge, and the slat's local origin. */
      pLink: pMitre(hi - C.LINK_REACH - C.LINK_TIP_MARGIN),
      outline,
    });
    lo = hi + C.SLAT_SEAM;
  });
  return rows;
}

const ROWS = slatRows();

/** Half B's copy of a half-A point (x, y in the gap frame): mirrored across the bisector. */
function acrossBisector([x, y]) {
  const d = 2 * (x * BISECTOR.x + y * BISECTOR.y);
  return [d * BISECTOR.x - x, d * BISECTOR.y - y];
}

/**
 * Where a row's slider sits along its gap's bisector (mm from the module
 * centre) with the slats turned phi (radians): the point the link of length
 * LINK_LENGTH reaches from the slat's grip to the carriage axis. The slider
 * sits out beyond the chevron's point -- on the outer side of the slat's
 * hinge, where the slat's back face ends up facing as it swings in -- so the
 * link pulls the slat in from that side. The two halves' grips are mirror
 * images, so one slider serves both.
 */
function sliderAlong(row, phi) {
  // The grip in half A's slat frame, (0, LINK_REACH, -GRIP_DEPTH), turned -phi
  // about X (half A swings in the negative sense).
  const y = C.LINK_REACH * Math.cos(phi) - GRIP_DEPTH * Math.sin(phi);
  const z = -C.LINK_REACH * Math.sin(phi) - GRIP_DEPTH * Math.cos(phi);
  const [hx, hy] = gapPoint(row.pLink, row.hi);
  const gx = hx - y * ACROSS[0]; // the frame's Y runs back across the slat
  const gy = hy - y * ACROSS[1];
  const along = gx * BISECTOR.x + gy * BISECTOR.y;
  const off = gy * BISECTOR.x - gx * BISECTOR.y;
  const dz = PLATE_Z + z - C.CARRIAGE_Z;
  return along + Math.sqrt(C.LINK_LENGTH ** 2 - off * off - dz * dz);
}

/**
 * How far the carriage has slid out along the bisector (metres) with the slats
 * turned phi. Every chevron's linkage has the same shape about its point, so
 * this is the same for all of them.
 */
export function sliderShift(phi) {
  return (sliderAlong(ROWS[0], phi) - sliderAlong(ROWS[0], 0)) * C.MM;
}

/**
 * Where each row's slat ends at its spine, in that spine's own frame (mm,
 * innermost row first): `along` out from the module centre, `offset` off the
 * spine centreline. These are the stations at which the blades either side of
 * an arm are picked up. `offset` is SPINE_END for every row; the slats meet
 * the spine at SPREAD, so a strut to one runs at that angle to the arm.
 */
export function bladeSpineStations() {
  return ROWS.map((row) => {
    const [along, offset] = gapPoint(row.pSpineEnd, row.hi);
    return { along, offset };
  });
}

/** Slats per module: a chevron of two per row per gap. */
export const MODULE_BLADE_COUNT = C.ARM_COUNT * 2 * C.SLAT_WIDTHS.length;

/**
 * Each row's slat outline in its own slat frame, mm (X along the hinge toward
 * the point, Y from the hinge across to the free edge) -- for the louvre
 * control, which traces sun rays past the slats.
 */
export function slatOutlines() {
  return ROWS.map((row) => row.outline.map(([p, q]) => [p - row.pLink, row.hi - q]));
}

/* ------------------------------------------------------------------ *
 * Static hardware
 * ------------------------------------------------------------------ */

/** Extrude a closed 2D outline into a plate centred on z = 0. */
function plate(points, thickness) {
  const shape = new THREE.Shape();
  shape.moveTo(points[0][0], points[0][1]);
  for (let i = 1; i < points.length; i++) shape.lineTo(points[i][0], points[i][1]);
  shape.closePath();

  const geo = new THREE.ExtrudeGeometry(shape, { depth: thickness, bevelEnabled: false });
  geo.translate(0, 0, -thickness / 2);
  return geo;
}

/** Square outline centred on the origin, corners on the axes (diamond-on). */
function diamondSquare(size) {
  const h = size / Math.SQRT2;
  return [[-h, 0], [0, -h], [h, 0], [0, h]];
}

/** A cylinder of radius r from p0 to p1 (both THREE.Vector3). */
function rodBetween(p0, p1, r) {
  const dir = new THREE.Vector3().subVectors(p1, p0);
  const geo = new THREE.CylinderGeometry(r, r, dir.length(), 8);
  geo.applyQuaternion(
    new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize())
  );
  geo.translate((p0.x + p1.x) / 2, (p0.y + p1.y) / 2, (p0.z + p1.z) / 2);
  return geo;
}

/**
 * All non-moving parts of one module, in module-local metres, split by
 * material: the light aluminium structure and the dark photovoltaic faces set
 * into it. Two merged geometries, so the field costs two instanced draws.
 *
 * @param omitTips arms whose tip panel to leave out -- for a module whose
 *   tips are drawn separately (buildTipGeometry).
 * @param omitHub if true, the hub plate, PV face and bolt heads are left out
 *   -- for a module whose hub is drawn separately (buildHubGeometry).
 * @param omitArms arms whose stem -- face plate, web and PV strip -- to leave
 *   out, for a module whose arms are drawn separately (buildArmGeometry).
 */
export function buildModuleStaticGeometry({ omitTips = [], omitHub = false, omitArms = [] } = {}) {
  const alu = [];
  const pv = [];

  // --- Central hexagonal hub plate, with a PV face set into its frame. ---
  if (!omitHub) {
    const { hubAlu, hubPvParts } = hubParts();
    alu.push(...hubAlu);
    pv.push(...hubPvParts);
  }

  // --- Six spines, each a PV strip in an aluminium frame, ending in a square PV
  //     panel set diamond-on. A spine is a T-section: a full-width face plate
  //     level with the slats and as thick, and a narrower web behind it. From
  //     the front it reads as a flat strap; behind, the slat ends that swing in
  //     toward it as they open pass under the face plate, beside the web.
  for (let i = 0; i < C.ARM_COUNT; i++) {
    if (!omitArms.includes(i)) {
      const { aluminium, pv: strip } = armStem(i);
      alu.push(...aluminium);
      pv.push(strip);
    }

    if (!omitTips.includes(i)) {
      const { frame, cell } = tipPanel(i);
      alu.push(frame);
      pv.push(cell);
    }
  }

  // --- Per gap: a flat bar along the bisector, level with the slats, from
  //     inside the hub out to the last chevron's point; and per slat, two hinge
  //     pins on its outer edge -- one from the spine centreline into the spine
  //     end, one from the bar into the point. The slats turn about their pins,
  //     so the pins can stay static.
  const hubFlat = C.HUB_ACROSS_FLATS / 2;
  const last = ROWS[ROWS.length - 1];
  const barStart = hubFlat - 20;
  const [xEnd, yEnd] = gapPoint(pMitre(last.hi), last.hi);
  const barEnd = xEnd * BISECTOR.x + yEnd * BISECTOR.y;

  for (let i = 0; i < C.ARM_COUNT; i++) {
    const theta = (i / C.ARM_COUNT) * Math.PI * 2 + ARM_PHASE;
    const c = Math.cos(theta);
    const s = Math.sin(theta);
    const place = ([x, y]) =>
      new THREE.Vector3((x * c - y * s) * C.MM, (x * s + y * c) * C.MM, PLATE_Z * C.MM);

    const bar = new THREE.BoxGeometry(
      (barEnd - barStart) * C.MM, C.APEX_BAR_WIDTH * C.MM, C.APEX_BAR_THICKNESS * C.MM
    );
    bar.translate(((barStart + barEnd) / 2) * C.MM, 0, PLATE_Z * C.MM);
    bar.rotateZ(theta + HALF);
    alu.push(bar);

    for (const row of ROWS) {
      const pins = [
        [gapPoint(pAtSpine(row.hi, 0), row.hi), gapPoint(row.pSpineEnd + C.PIN_INSET, row.hi)],
        [gapPoint(pBisector(row.hi), row.hi), gapPoint(pMitre(row.hi) - C.PIN_INSET, row.hi)],
      ];
      for (const mirror of [(xy) => xy, acrossBisector]) {
        for (const [p0, p1] of pins) {
          alu.push(rodBetween(place(mirror(p0)), place(mirror(p1)), C.PIN_RADIUS * C.MM));
        }
      }
    }
  }

  // --- Frame ring and mounting brackets, behind the hub. ---
  const ring = new THREE.TorusGeometry(
    C.MODULE_FRAME_RADIUS * C.MM, C.MODULE_FRAME_TUBE * C.MM, 8, 24
  );
  ring.translate(0, 0, -(C.MODULE_FRAME_TUBE + C.HUB_THICKNESS) * C.MM);
  alu.push(ring);

  const bracketZ =
    -(C.MODULE_STANDOFF - C.SECONDARY_FRAME_OFFSET - C.SECONDARY_FRAME_DEPTH / 2) * C.MM;
  for (const sign of [1, -1]) {
    const bracket = new THREE.BoxGeometry(
      C.BRACKET_WIDTH * C.MM, C.BRACKET_THICKNESS * C.MM, C.BRACKET_LENGTH * C.MM
    );
    bracket.translate(
      0, ((sign * C.BRACKET_SPACING) / 2) * C.MM, bracketZ + (C.BRACKET_LENGTH / 2) * C.MM
    );
    alu.push(bracket);
  }

  return { aluminium: mergeParts(alu), pv: mergeParts(pv) };
}

/** Centre of arm i's tip panel, module-local metres, on the frame's mid-plane. */
export function tipPanelCentre(i) {
  const r = (C.ARM_LENGTH + C.TIP_PANEL_OFFSET) * C.MM;
  const theta = (i / C.ARM_COUNT) * Math.PI * 2 + ARM_PHASE;
  return new THREE.Vector3(Math.cos(theta) * r, Math.sin(theta) * r, 0);
}

/**
 * One arm's stem, module-local metres: the T-section that runs from the hub
 * out to the tip panel -- a full-width face plate level with the slats and as
 * thick, a narrower web behind it, and the PV strip set into the face. From
 * the front it reads as a flat strap; behind, the slat ends that swing in
 * toward it as they open pass under the face plate, beside the web.
 */
function armStem(i) {
  const theta = (i / C.ARM_COUNT) * Math.PI * 2 + ARM_PHASE;
  const armStart = C.HUB_RADIUS * 0.5 * C.MM;
  const armLen = C.ARM_LENGTH * C.MM - armStart;

  const face = new THREE.BoxGeometry(armLen, C.ARM_WIDTH * C.MM, C.SLAT_THICKNESS * C.MM);
  face.translate(armStart + armLen / 2, 0, PLATE_Z * C.MM);
  face.rotateZ(theta);

  const webDepth = C.ARM_DEPTH - C.SLAT_THICKNESS;
  const web = new THREE.BoxGeometry(armLen, C.ARM_WEB_WIDTH * C.MM, webDepth * C.MM);
  web.translate(armStart + armLen / 2, 0, (webDepth / 2 - C.ARM_DEPTH / 2) * C.MM);
  web.rotateZ(theta);

  const strip = new THREE.BoxGeometry(
    armLen - C.ARM_PV_INSET * 2 * C.MM,
    (C.ARM_WIDTH - C.ARM_PV_INSET * 2) * C.MM,
    C.ARM_PV_RISE * C.MM
  );
  strip.translate(armStart + armLen / 2, 0, (C.ARM_DEPTH / 2 + C.ARM_PV_RISE / 2) * C.MM);
  strip.rotateZ(theta);

  return { aluminium: [face, web], pv: strip };
}

/** Just the given arms' stems, split by material like buildModuleStaticGeometry. */
export function buildArmGeometry(arms) {
  const parts = arms.map(armStem);
  return {
    aluminium: mergeParts(parts.flatMap((p) => p.aluminium)),
    pv: mergeParts(parts.map((p) => p.pv)),
  };
}

/** Arm i's tip panel: a square aluminium frame set diamond-on, and the PV cell in it. */
function tipPanel(i) {
  const theta = (i / C.ARM_COUNT) * Math.PI * 2 + ARM_PHASE;
  const centre = (C.ARM_LENGTH + C.TIP_PANEL_OFFSET) * C.MM;

  const frame = plate(diamondSquare(C.TIP_PANEL_SIZE * C.MM), C.TIP_PANEL_THICKNESS * C.MM);
  frame.translate(centre, 0, 0);
  frame.rotateZ(theta);

  const cell = plate(
    diamondSquare((C.TIP_PANEL_SIZE - C.TIP_FRAME_INSET * 2) * C.MM),
    C.TIP_PV_RISE * C.MM
  );
  cell.translate(centre, 0, (C.TIP_PANEL_THICKNESS / 2 + C.TIP_PV_RISE / 2) * C.MM);
  cell.rotateZ(theta);

  return { frame, cell };
}

/** Just the tip panels of the given arms, split by material like buildModuleStaticGeometry. */
export function buildTipGeometry(arms) {
  const parts = arms.map(tipPanel);
  return {
    aluminium: mergeParts(parts.map((p) => p.frame)),
    pv: mergeParts(parts.map((p) => p.cell)),
  };
}

/** The hub plate, PV face and bolt heads, split by material. */
function hubParts() {
  // CylinderGeometry puts its first vertex on +Z, and rotateX(90deg) maps that
  // to -Y -- so the hexagon lands 90deg behind where the raw angles suggest.
  // HUB_SPIN takes that out, seating a hub VERTEX under every spine.
  const hub = new THREE.CylinderGeometry(
    C.HUB_RADIUS * C.MM, C.HUB_RADIUS * C.MM, C.HUB_THICKNESS * C.MM, 6
  );
  hub.rotateX(Math.PI / 2);
  hub.rotateZ(HUB_SPIN);
  hub.translate(0, 0, C.HUB_Z_OFFSET * C.MM);

  const hubPv = new THREE.CylinderGeometry(
    (C.HUB_RADIUS - C.HUB_PV_INSET) * C.MM,
    (C.HUB_RADIUS - C.HUB_PV_INSET) * C.MM,
    C.HUB_PV_RISE * C.MM,
    6
  );
  hubPv.rotateX(Math.PI / 2);
  hubPv.rotateZ(HUB_SPIN);
  hubPv.translate(0, 0, (C.HUB_Z_OFFSET + C.HUB_THICKNESS / 2 + C.HUB_PV_RISE / 2) * C.MM);

  const hubAlu = [hub];
  const hubPvParts = [hubPv];

  // Six bolt heads, one per hexagon corner, riding on the hub face.
  for (let i = 0; i < C.BOLT_COUNT; i++) {
    const a = (i / C.BOLT_COUNT) * Math.PI * 2 + ARM_PHASE;
    const bolt = new THREE.CylinderGeometry(
      C.BOLT_HEAD_RADIUS * C.MM, C.BOLT_HEAD_RADIUS * C.MM, C.BOLT_HEAD_HEIGHT * C.MM, 6
    );
    bolt.rotateX(Math.PI / 2);
    bolt.translate(
      Math.cos(a) * C.BOLT_CIRCLE_RADIUS * C.MM,
      Math.sin(a) * C.BOLT_CIRCLE_RADIUS * C.MM,
      (C.HUB_Z_OFFSET + C.HUB_THICKNESS / 2 + C.BOLT_HEAD_HEIGHT / 2) * C.MM
    );
    hubAlu.push(bolt);
  }

  return { hubAlu, hubPvParts };
}

/** Just the hub plate + PV face + bolt heads, split by material like buildModuleStaticGeometry. */
export function buildHubGeometry() {
  const { hubAlu, hubPvParts } = hubParts();
  return {
    aluminium: mergeParts(hubAlu),
    pv: mergeParts(hubPvParts),
  };
}

/** Merge a set of parts, flattening indexed/non-indexed mismatches first. */
function mergeParts(parts) {
  // Box/Cylinder/Torus come back indexed, ExtrudeGeometry does not, and
  // mergeGeometries refuses a mixed set.
  const flattened = parts.map((p) => (p.index ? p.toNonIndexed() : p));
  const merged = mergeGeometries(flattened, false);
  if (!merged) throw new Error('buildModuleStaticGeometry: geometry merge failed');

  parts.forEach((p) => p.dispose());
  flattened.forEach((p, i) => {
    if (p !== parts[i]) p.dispose();
  });

  merged.computeBoundingSphere();
  return merged;
}

/* ------------------------------------------------------------------ *
 * Moving parts
 * ------------------------------------------------------------------ */

/**
 * Slat frame: origin on the hinge (the outer edge, mid-thickness) at the link
 * station, X along the hinge toward the point, Z the face normal, Y = Z x X
 * (inward, across the slat). From (p, q) that is X = p - pLink, Y = hi - q.
 */
function toSlatFrame(row, [p, q]) {
  return [(p - row.pLink) * C.MM, (row.hi - q) * C.MM];
}

/**
 * One geometry per row, in the slat frame, metres: the rows differ in shape,
 * not just size (the end angles are fixed while the lengths and widths vary),
 * so they cannot share one scaled geometry. Both halves share each row's.
 */
export function buildSlatGeometries() {
  return ROWS.map((row) =>
    plate(row.outline.map((p) => toSlatFrame(row, p)), C.SLAT_THICKNESS * C.MM)
  );
}

/** A link: unit length along X, scaled per instance to run slider to grip. */
export function buildLinkGeometry() {
  const geo = new THREE.CylinderGeometry(C.LINK_RADIUS * C.MM, C.LINK_RADIUS * C.MM, 1, 8);
  geo.rotateZ(-Math.PI / 2); // cylinder axis Y -> X
  return geo;
}

/**
 * A lug: a short square post on a slat's back at its grip station, LINK_LUG
 * tall, that the link pins to. With the slat swung right in the link runs
 * nearly parallel to the slat; the lug holds it clear of the face.
 */
export function buildLugGeometry() {
  return new THREE.BoxGeometry(C.LUG_SECTION * C.MM, C.LUG_SECTION * C.MM, C.LINK_LUG * C.MM);
}

/**
 * One gap's carriage, closed, in that gap's bisector frame (metres: X out
 * along the bisector from the module centre, Z the facade normal): a bar with
 * a slider block under each chevron. Per instance it is turned onto its
 * bisector and slid out by sliderShift.
 */
export function buildCarriageGeometry() {
  const sliders = ROWS.map((row) => sliderAlong(row, 0));
  const start = sliders[0] - C.SLIDER_LENGTH;
  const end = sliders[sliders.length - 1] + C.SLIDER_LENGTH;

  const parts = [];
  const bar = new THREE.BoxGeometry(
    (end - start) * C.MM, C.CARRIAGE_BAR_SECTION * C.MM, C.CARRIAGE_BAR_SECTION * C.MM
  );
  bar.translate(((start + end) / 2) * C.MM, 0, C.CARRIAGE_Z * C.MM);
  parts.push(bar);
  for (const s of sliders) {
    const block = new THREE.BoxGeometry(
      C.SLIDER_LENGTH * C.MM, C.SLIDER_WIDTH * C.MM, C.SLIDER_HEIGHT * C.MM
    );
    block.translate(s * C.MM, 0, C.CARRIAGE_Z * C.MM);
    parts.push(block);
  }
  return mergeParts(parts);
}

/**
 * Where every slat of one module sits, in module-local space: entries
 * { gap, half (0 = A, 1 = B), row, origin, quat, hingeSign, grip, slider,
 *   bisector }.
 *
 * A slat opens by turning hingeSign * phi about its own X -- its hinge -- so
 * its inner edge swings in toward the glass. Half B's frames are half A's
 * turned half a turn about the bisector, which flips them face-down, so half B
 * opens the other way round in its own frame (hingeSign +1 against half A's
 * -1): it is then half A's mirror image at every angle.
 *
 * grip: where the link takes hold -- the tip of the lug on the slat's back --
 *   in the slat's own frame (metres). Half B's frames are face-down, so its
 *   back is at +Z.
 * lug: the centre of that lug, likewise.
 * slider: the row's slider on its gap's carriage, closed (module-local metres).
 * bisector: the gap's bisector, which the carriage slides along (unit).
 */
export function buildBladeLayout() {
  const layout = [];

  // Half A slat frame in the gap frame: X along the slats, Y back across them, Z = +z.
  const quatA = new THREE.Quaternion().setFromRotationMatrix(
    new THREE.Matrix4().makeBasis(
      new THREE.Vector3(ALONG[0], ALONG[1], 0),
      new THREE.Vector3(-ACROSS[0], -ACROSS[1], 0),
      new THREE.Vector3(0, 0, 1)
    )
  );
  const quatB = TO_HALF_B.clone().multiply(quatA);
  const spin = new THREE.Quaternion();
  const zAxis = new THREE.Vector3(0, 0, 1);

  for (let gap = 0; gap < C.ARM_COUNT; gap++) {
    const theta = (gap / C.ARM_COUNT) * Math.PI * 2 + ARM_PHASE;
    const c = Math.cos(theta);
    const s = Math.sin(theta);
    spin.setFromAxisAngle(zAxis, theta);
    const bisector = BISECTOR.clone().applyQuaternion(spin);

    for (const half of [0, 1]) {
      for (const row of ROWS) {
        const pA = gapPoint(row.pLink, row.hi);
        const [x, y] = half === 0 ? pA : acrossBisector(pA);
        layout.push({
          gap,
          half,
          row: row.row,
          origin: new THREE.Vector3((x * c - y * s) * C.MM, (x * s + y * c) * C.MM, PLATE_Z * C.MM),
          quat: spin.clone().multiply(half === 0 ? quatA : quatB),
          hingeSign: half === 0 ? -1 : 1,
          grip: new THREE.Vector3(0, C.LINK_REACH * C.MM, (half === 0 ? -1 : 1) * GRIP_DEPTH * C.MM),
          lug: new THREE.Vector3(
            0,
            C.LINK_REACH * C.MM,
            (half === 0 ? -1 : 1) * (C.SLAT_THICKNESS / 2 + C.LINK_LUG / 2) * C.MM
          ),
          slider: bisector
            .clone()
            .multiplyScalar(sliderAlong(row, 0) * C.MM)
            .setZ(C.CARRIAGE_Z * C.MM),
          bisector,
        });
      }
    }
  }

  return layout;
}
