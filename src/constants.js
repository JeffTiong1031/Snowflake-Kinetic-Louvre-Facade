/**
 * Every dimension in this project lives here.
 *
 * Linear sizes are written in MILLIMETRES, the way the proposal drawings state
 * them, and converted to scene units (metres) by multiplying with MM. Retune
 * proportions in this file only -- no other module hard-codes a size.
 */

export const MM = 0.001;

/* ------------------------------------------------------------------ *
 * Snowflake module
 * ------------------------------------------------------------------ */

/** Flat hexagonal centre plate. "Across flats" is the mm figure on the drawing. */
export const HUB_ACROSS_FLATS = 400;
export const HUB_THICKNESS = 18;
/** Circumradius derived from across-flats: R = (AF / 2) / cos(30deg). */
export const HUB_RADIUS = HUB_ACROSS_FLATS / 2 / Math.cos(Math.PI / 6);

/** Six bolt heads sitting just inside the hub perimeter. */
export const BOLT_COUNT = 6;
export const BOLT_CIRCLE_RADIUS = 150;
export const BOLT_HEAD_RADIUS = 15;
export const BOLT_HEAD_HEIGHT = 11;

/** Six square-section arms radiating from the hub at 60 degree spacing. */
export const ARM_COUNT = 6;
export const ARM_LENGTH = 900;
export const ARM_SECTION = 60;

/** Flat diamond / arrowhead terminating each arm, lying in the facade plane. */
export const TIP_LENGTH = 210;
export const TIP_WIDTH = 140;
export const TIP_THICKNESS = 14;

/* ---- Blades: the only moving parts ---- */

/** Blades per side of each arm. 6 arms x 2 sides x this = blades per module. */
export const BLADES_PER_SIDE = 5;

/**
 * Angle between a blade's hinge axis and the OUTWARD arm direction.
 *
 * 135deg sweeps each blade back toward the hub, so a mirrored pair across the
 * arm reads as a chevron whose apex points outward (spec requirement). The
 * complementary 45deg value sweeps them forward and flips the chevrons inward.
 * Either way the hinge meets the arm line at 45deg.
 */
export const BLADE_HINGE_ANGLE_DEG = 135;

/**
 * Distance from hub centre to the first and last blade hinge on an arm.
 * FIRST_T is bounded below by neighbour-arm clearance: the hinge sits on the
 * arm's side face, so the innermost blade's outer corner swings closest to the
 * 30deg wedge boundary. 340 leaves ~2.7deg of margin; 300 overruns it.
 */
export const BLADE_FIRST_T = 340;
export const BLADE_LAST_T = 900;

/**
 * Blade length measured along the hinge axis. Blades grow outward: near the hub
 * the 60deg wedge between neighbouring arms is narrow, and a blade long enough
 * for the tip would foul the adjacent arm there. Clearance check in
 * docs/geometry-notes.md.
 */
export const BLADE_LENGTH_INNER = 100;
export const BLADE_LENGTH_OUTER = 340;

/** Blade width, measured perpendicular to the hinge axis. */
export const BLADE_WIDTH_INNER = 150;
export const BLADE_WIDTH_OUTER = 210;

/** Plate thickness, and how far the blade layer stands proud of the arm face. */
export const BLADE_THICKNESS = 10;
export const BLADE_Z_OFFSET = 40;

/**
 * Fraction of its root width a blade retains at its free end -- the trapezoidal
 * taper described in the proposal. 1.0 gives plain rectangles.
 */
export const BLADE_TIP_TAPER = 0.74;

/**
 * Blade travel. state 0 = blades flat in the facade plane (closed, maximum
 * shading); state 1 = blades rotated to this angle, edge-on to the facade
 * (open, glass visible). The proposal's prototype tops out at 45deg; the
 * visualisation brief calls for a full 90deg swing.
 */
export const BLADE_OPEN_ANGLE_DEG = 90;

/* ------------------------------------------------------------------ *
 * Tower and curtain wall
 * ------------------------------------------------------------------ */

export const FLOOR_COUNT = 30;
export const FLOOR_HEIGHT = 3500;

/** Plan dimensions. The 36m faces look along +/-Z, the 24m faces along +/-X. */
export const TOWER_WIDTH_X = 36000;
export const TOWER_DEPTH_Z = 24000;

/** Curtain wall grid. Panel height is one floor. */
export const PANEL_WIDTH = 1500;

export const MULLION_WIDTH = 70;
export const MULLION_DEPTH = 160;
export const TRANSOM_HEIGHT = 90;
export const TRANSOM_DEPTH = 120;

export const GLASS_THICKNESS = 28;
/** Floor slabs, visible through the glass, and the opaque service core. */
export const SLAB_THICKNESS = 300;
export const SLAB_INSET = 400;
export const CORE_INSET = 5000;

/* ------------------------------------------------------------------ *
 * Module mounting -- the layers between glass and snowflake
 * ------------------------------------------------------------------ */

/** Standoff from the outer glass face to the snowflake module plane. */
export const MODULE_STANDOFF = 250;

/**
 * Secondary support frame: vertical members running the height of the field.
 * OFFSET is the member's centre distance out from the glass face; the layers
 * stack glass -> mullion (0..160) -> secondary frame (60..150) -> bracket
 * (150..215) -> aluminium frame ring -> hub plate at MODULE_STANDOFF.
 */
export const SECONDARY_FRAME_WIDTH = 120;
export const SECONDARY_FRAME_DEPTH = 90;
export const SECONDARY_FRAME_OFFSET = 105;

/** Mounting bracket tying the secondary frame to the aluminium module frame. */
export const BRACKET_LENGTH = 70;
export const BRACKET_WIDTH = 90;
export const BRACKET_THICKNESS = 12;
export const BRACKET_SPACING = 180;

/** Aluminium frame ring the module hub bolts onto. */
export const MODULE_FRAME_RADIUS = 260;
export const MODULE_FRAME_TUBE = 20;

/* ------------------------------------------------------------------ *
 * Module grid -- exactly one face carries modules
 * ------------------------------------------------------------------ */

export const GRID_COLS = 8;
export const GRID_ROWS = 20;
export const MODULE_COUNT = GRID_COLS * GRID_ROWS;

export const MODULE_PITCH_X = 2300;
export const MODULE_PITCH_Y = 2300;

/** Height of the lowest module row above ground. */
export const GRID_BASE_HEIGHT = 8000;

/* ------------------------------------------------------------------ *
 * Sun response
 * ------------------------------------------------------------------ */

/**
 * Mutual shading gain. At grazing incidence each module shades the one downwind
 * of it along the facade, so exposure falls off away from the windward edge.
 * This is what makes the grid show a gradient instead of moving as one block.
 */
export const SHADE_GAIN_HORIZONTAL = 0.85;
export const SHADE_GAIN_VERTICAL = 0.35;

/** Deterministic per-module noise so the gradient is not perfectly smooth. */
export const MODULE_JITTER = 0.12;

/** Seconds for a module to close most of the way to its target (damping). */
export const BLADE_RESPONSE_TAU = 0.55;

/** Below this solar elevation the sun is treated as down and modules open. */
export const HORIZON_FADE_DEG = 4;

/* ------------------------------------------------------------------ *
 * Camera
 * ------------------------------------------------------------------ */

export const CAMERA_FOV = 42;
export const CAMERA_NEAR = 0.1;
export const CAMERA_FAR = 1200;
export const ORBIT_MIN_DISTANCE = 1.4;
export const ORBIT_MAX_DISTANCE = 520;
export const PRESET_TWEEN_SECONDS = 1.6;

/* ------------------------------------------------------------------ *
 * Materials
 * ------------------------------------------------------------------ */

export const ALUMINIUM_COLOR = 0xc8ccd0;
export const ALUMINIUM_METALNESS = 0.8;
export const ALUMINIUM_ROUGHNESS = 0.35;

export const MULLION_COLOR = 0x8d9296;
export const GLASS_COLOR = 0x9fc4c0;
export const SLAB_COLOR = 0x4a4a4c;
export const CORE_COLOR = 0x2b2b2e;
export const GROUND_COLOR = 0x3a3d40;
export const NEIGHBOUR_COLOR = 0x55585c;

/* ------------------------------------------------------------------ *
 * Shadows -- quality steps, chosen at runtime from measured framerate
 * ------------------------------------------------------------------ */

export const SHADOW_MAP_SIZES = [2048, 1024, 512];
export const SHADOW_DEGRADE_FPS = 45;
export const SHADOW_DEGRADE_SECONDS = 3;
