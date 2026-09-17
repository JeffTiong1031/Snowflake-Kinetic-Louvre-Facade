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
export const HUB_ACROSS_FLATS = 440;
export const HUB_THICKNESS = 18;
/** Circumradius derived from across-flats: R = (AF / 2) / cos(30deg). */
export const HUB_RADIUS = HUB_ACROSS_FLATS / 2 / Math.cos(Math.PI / 6);

/**
 * Six bolt heads, one at each hexagon CORNER -- so they land over the arm
 * roots, on the aluminium frame ring outside the PV face.
 *
 * The frame ring runs from the PV circumradius out to the hub circumradius;
 * the bolt circle has to sit inside that band or the heads climb onto the PV.
 */
export const BOLT_COUNT = 6;
export const BOLT_CIRCLE_RADIUS = 228;
export const BOLT_HEAD_RADIUS = 15;
export const BOLT_HEAD_HEIGHT = 11;

/**
 * How far the hub plate stands forward of the arm centreline. At ARM_DEPTH / 2
 * the plate's back face meets the arms' front face, so the hexagon laps OVER
 * the arm roots instead of being buried between them.
 */
export const HUB_Z_OFFSET = 21;

/**
 * Six arms at 60 degree spacing. These are flat straps -- wide in the facade
 * plane, shallow in depth -- not square bars. They spring from the hexagon
 * VERTICES; see ARM_PHASE_DEG for which way the star is turned.
 */
export const ARM_COUNT = 6;

/**
 * Rotation of the whole arm star about the hub, in degrees.
 *
 * 0 puts arms due east and west with four diagonals. 30 replaces that
 * horizontal pair with a vertical one: north, south, and the four diagonals.
 * The hub hexagon and the bolt circle follow this, so the arms keep springing
 * from the hexagon vertices and the bolts stay on the flats between them.
 */
export const ARM_PHASE_DEG = 30;
/**
 * Long enough that the arms read well past the star's valleys. With the tip
 * panels this reaches 1204mm, which leaves 42mm to the next module up or down
 * at the 2450mm pitch.
 */
export const ARM_LENGTH = 960;
/** Arm width across the facade, and overall depth into it. */
export const ARM_WIDTH = 124;
export const ARM_DEPTH = 42;

/**
 * The arms are T-sections: a full-width face plate as thick as the slats and
 * level with them, and behind it a narrower web. From the front they read as
 * flat straps; behind, the slat ends that swing in toward an arm as they open
 * pass under the face plate, beside the web -- at web depth they reach up to
 * about 21mm in from the arm's side.
 */
export const ARM_WEB_WIDTH = 64;

/**
 * Each arm ends in a square photovoltaic panel set diamond-on, so the arm runs
 * into one of its corners. Light aluminium frame, dark PV cell face.
 */
export const TIP_PANEL_SIZE = 260;
export const TIP_PANEL_THICKNESS = 22;
export const TIP_FRAME_INSET = 26;
export const TIP_PV_RISE = 5;
/** Distance from the arm end to the panel centre. */
export const TIP_PANEL_OFFSET = 60;

/**
 * Light sensors: an LDR (light-dependent resistor) sealed inside the frame of
 * four of the tip panels -- the four diagonal ones (arms 0, 2, 3 and 5, going
 * anticlockwise from the upper right), not the top and bottom. Out of sight on
 * the built facade; the explanation shows them through a see-through frame.
 * LDR_DEPTH: the disc's centre, forward of the frame's mid-plane.
 */
export const LDR_ARMS = [0, 2, 3, 5];
export const LDR_DIAMETER = 40;
export const LDR_THICKNESS = 3;
export const LDR_DEPTH = 4;
export const LDR_LEAD_LENGTH = 8;

/** PV inlays: the dark cell face set inside each aluminium frame. */
export const ARM_PV_INSET = 16;
export const ARM_PV_RISE = 4;
export const HUB_PV_INSET = 46;
export const HUB_PV_RISE = 5;

/* ---- Louvre slats: with their linkage, the only moving parts ---- */

/**
 * Each 60deg gap between two spines holds pointed chevrons nesting outward from
 * the hub. A chevron is two separate slats, one in each half of the gap, each
 * running parallel to the FAR spine, from its own spine out to the gap
 * bisector, where the pair meet in a sharp mitre. So each gap fills as a
 * diamond pointing out along its bisector, and the six diamonds make a
 * six-pointed star with its valleys on the spines; the spines run on past the
 * valleys as the snowflake's arms.
 *
 * Each slat is hinged along its OUTER edge -- on a pin in its spine and a pin
 * in the bisector bar -- and swings in about it, toward the glass. The two
 * halves of a chevron swing as mirror images, and their points lie on their
 * hinges, so the points stay exactly where they are, meeting across the bar,
 * however far the chevron opens. Every chevron in the snowflake turns together.
 *
 * Widths, innermost first: true slat widths, square across the slat.
 */
export const SLAT_WIDTHS = [85, 95, 105, 115];

/**
 * Where the innermost slat's inner edge, run on, would cross the spine
 * centreline, measured out along the spine. Between the hub's straight edges
 * and the first chevron the snowflake is left open.
 */
export const SLAT_FIRST_EDGE = 160;

/**
 * Joint between neighbouring slats. They swing about parallel hinges, each on
 * its own outer edge, so a slat's free inner edge only ever swings away from
 * the slat inside it; the joint has room for the hinge edge's thickness and
 * the hinge pin standing proud of it.
 */
export const SLAT_SEAM = 1.5;
export const SLAT_THICKNESS = 6;

/**
 * Clearance to the hub. Where the hub's straight edge cuts across the innermost
 * slats' spine corners, their outline follows it.
 */
export const SLAT_HUB_GAP = 2;

/**
 * Slat ends at the spine: cut parallel to the spine side, SLAT_SPINE_GAP off
 * it, so closed they leave no opening beside the spine. As a slat swings in,
 * that end swings in under the spine: it drops behind the spine's face plate
 * before it gets there and passes beside the web (see ARM_WEB_WIDTH) -- all
 * but the slat's own thickness at the hinge, which reaches up to 3mm toward
 * the spine at face-plate depth as the slat stands square. This gap covers
 * that.
 */
export const SLAT_SPINE_GAP = 3.5;

/**
 * The mitre. Each slat stops SLAT_APEX_GAP short of the bisector. Swinging
 * about its outer edge, a slat only ever moves away from the bisector -- apart
 * from its thickness at the hinge, which comes t/2 * cos30 closer at the point.
 */
export const SLAT_APEX_GAP = 6;

/** Flat bar along each gap bisector, level with the slats, carrying the hinge pins at the points. */
export const APEX_BAR_WIDTH = 5.6;
export const APEX_BAR_THICKNESS = 3;

/**
 * Hinge pins, on each slat's outer edge: one from the spine centreline into the
 * slat end, one from the bisector bar into the point. Thin enough that the half
 * standing proud of the edge stays inside the joint to the next slat.
 */
export const PIN_RADIUS = 1.25;
export const PIN_INSET = 15;

/**
 * Drive. Behind each gap a carriage -- a bar along the bisector with a slider
 * block just beyond each chevron's point -- slides out along the bisector as
 * the slats open. Two links run from each slider to the backs of its chevron's
 * two slats: one to each half, mirror images, so one pull swings both halves
 * in together. Every chevron's linkage has the same shape
 * about its point, so one carriage moves all the chevrons in a gap in step.
 *
 * LINK_REACH: how far in from the hinge the link grips the slat's back.
 * LINK_TIP_MARGIN: room between that grip and the mitre; it sets how near the
 *   point the grip sits.
 * CARRIAGE_Z: depth of the carriage bar's axis, module-local (the slats'
 *   mid-plane is at 18).
 */
export const LINK_REACH = 30;
export const LINK_TIP_MARGIN = 10;
export const LINK_LENGTH = 120;
export const LINK_RADIUS = 2.5;
/**
 * Each link pins to a lug standing LINK_LUG off its slat's back face, so it
 * stays clear of the face when, with the slat swung right in, it runs nearly
 * parallel to it.
 */
export const LINK_LUG = 10;
export const LUG_SECTION = 8;
export const CARRIAGE_Z = -30;
export const CARRIAGE_BAR_SECTION = 8;
export const SLIDER_LENGTH = 20;
export const SLIDER_WIDTH = 12;
export const SLIDER_HEIGHT = 12;

/**
 * Slat travel, measured from the facade plane.
 *
 *   state 1 (no sun)   -> BLADE_OPEN_ANGLE_DEG, slats swung in square to the
 *                         facade, daylight through
 *   state 0 (full sun) -> BLADE_CLOSED_ANGLE_DEG, slats flat, glass shaded
 *
 * Closed is 0: the slats lie flat, flush with the spines, and with the bisector
 * bars form one solid surface. Open swings every slat in 90deg, toward the glass.
 */
export const BLADE_OPEN_ANGLE_DEG = 90;
export const BLADE_CLOSED_ANGLE_DEG = 0;

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
/** The tower's invisible shadow caster sits this far inside the glass line. */
export const SHADOW_PROXY_INSET = 500;
/** Service core: lifts and risers only, so the office floor stays visible. */
export const CORE_WIDTH_X = 14000;
export const CORE_DEPTH_Z = 9000;

/**
 * Glazing changes character with distance, the way real curtain wall does.
 * Close up it is clear enough to read the fit-out behind it; from across the
 * street it turns reflective and the interior stops being legible.
 */
export const GLASS_OPACITY_NEAR = 0.17;
export const GLASS_OPACITY_FAR = 0.52;
export const GLASS_ENV_NEAR = 1.0;
export const GLASS_ENV_FAR = 2.0;
/** Panes differ a touch in tint, as float glass does from batch to batch: up to this share darker. */
export const GLASS_TINT_VARIATION = 0.06;

/**
 * Spandrels: an opaque glass band at every floor line, hiding the slab edge
 * and the ceiling void -- from SPANDREL_BELOW under the floor line to
 * SPANDREL_ABOVE over it. Vision glass fills the rest of each storey.
 */
export const SPANDREL_BELOW = 400;
export const SPANDREL_ABOVE = 150;

/**
 * Vertical fins on the three plain faces, at every FIN_EVERY-th mullion. They
 * cast the fine vertical shadows that give a glass tower its depth. The
 * module face carries the snowflakes instead.
 */
export const FIN_EVERY = 2;
export const FIN_DEPTH = 450;
export const FIN_WIDTH = 60;

/**
 * Double-height entrance lobby: the ground and first floors open to each
 * other, glazed on a line set back behind a colonnade, so the tower seems to
 * float over its base. The office floors start above it.
 */
export const LOBBY_FLOORS = 2;
export const LOBBY_SETBACK = 3000;
export const LOBBY_MULLION_WIDTH = 50;
export const LOBBY_MULLION_DEPTH = 120;
/** Low-iron lobby glass: clearer than the tower's. */
export const LOBBY_GLASS_COLOR = 0xdce8e6;
export const LOBBY_GLASS_OPACITY = 0.14;
/**
 * Colonnade: square columns on the face line, about COLUMN_SPACING apart. The
 * entrance face keeps an odd number of bays, so its doors sit mid-bay.
 */
export const COLUMN_SPACING = 6000;
export const COLUMN_SIZE = 700;
/** Downlights in the soffit over the colonnade and lobby, on this grid. */
export const DOWNLIGHT_PITCH = 3000;
/** Entrance canopy on the module face: a thin blade from the lobby glass out past the columns. */
export const CANOPY_WIDTH = 12000;
export const CANOPY_DEPTH = 7500;
export const CANOPY_THICKNESS = 250;
export const CANOPY_HEIGHT = 4200;
/** Revolving door in the middle of the entrance. */
export const DOOR_DRUM_DIAMETER = 3000;
export const DOOR_DRUM_HEIGHT = 2700;

/** The stone platform the tower stands on: this far past the face line, and its step. */
export const PLINTH_MARGIN = 5000;
export const PLINTH_HEIGHT = 150;
/** Stone paving: one texture tile (4 x 4 slabs) covers this much. */
export const PAVING_TILE = 4800;

/**
 * Crown: the curtain wall runs on CROWN_HEIGHT past the roof as a screen of
 * fritted glass that hides the rooftop plant, under a coping. It is washed
 * with light at night.
 */
export const CROWN_HEIGHT = 4200;
export const COPING_HEIGHT = 300;
export const COPING_DEPTH = 500;
/** Rooftop plant enclosure, set back from the crown, and the lift overrun above the core. */
export const PLANT_SETBACK = 5000;
export const PLANT_HEIGHT = 3200;
export const OVERRUN_HEIGHT = 3800;

/* ------------------------------------------------------------------ *
 * Module mounting -- the layers between glass and snowflake
 * ------------------------------------------------------------------ */

/**
 * Standoff from the outer glass face to the snowflake module plane. Far enough
 * out that the widest slats, swung in square, stay 20mm clear of the mullions.
 */
export const MODULE_STANDOFF = 280;

/**
 * Secondary support frame: vertical members running the height of the field.
 * OFFSET is the member's centre distance out from the glass face; the layers
 * stack glass -> mullion (0..160) -> secondary frame (60..150) -> bracket
 * (150..250) -> aluminium frame ring -> hub plate at MODULE_STANDOFF.
 */
export const SECONDARY_FRAME_WIDTH = 120;
export const SECONDARY_FRAME_DEPTH = 90;
export const SECONDARY_FRAME_OFFSET = 105;

/** Mounting bracket tying the secondary frame to the aluminium module frame. */
export const BRACKET_LENGTH = 100;
export const BRACKET_WIDTH = 90;
export const BRACKET_THICKNESS = 12;
export const BRACKET_SPACING = 280;

/**
 * Aluminium frame ring behind the hub, tied back by the brackets. Kept small
 * enough that the innermost slats, swinging in beside the hub, pass outside it.
 */
export const MODULE_FRAME_RADIUS = 140;
export const MODULE_FRAME_TUBE = 20;

/* ------------------------------------------------------------------ *
 * Module grid -- exactly one face carries modules
 * ------------------------------------------------------------------ */

export const GRID_COLS = 8;
export const GRID_ROWS = 20;
export const MODULE_COUNT = GRID_COLS * GRID_ROWS;

export const MODULE_PITCH_X = 2450;
export const MODULE_PITCH_Y = 2450;

/**
 * Height of the lowest module row above ground.
 *
 * The field is (GRID_ROWS - 1) * MODULE_PITCH_Y tall, so this plus that plus a
 * module radius has to stay under the roof. Camera presets, the secondary frame
 * and the shadow camera all derive from the field centre, so they follow.
 */
export const GRID_BASE_HEIGHT = 52000;

/* ------------------------------------------------------------------ *
 * Sun response
 * ------------------------------------------------------------------ */

/**
 * The louvres move with the sun based on sunlight intensity. All six carriages
 * of each module are driven together by its motor: closing slightly in early morning,
 * down to a small gap opening at peak noon intensity, and gradually opening back up
 * into evening.
 */
export const SUN_LEAK_BUDGET = 0.05;

/** Smallest gap opening fraction (0..1) at peak solar noon (leaving a small slit opening). */
export const LOUVRE_MIN_GAP_OPENING = 0.10;

/** Seconds for a gap to close most of the way to its new angle (damping). */
export const BLADE_RESPONSE_TAU = 0.55;

/** Below this solar elevation the sun is treated as down and modules open. */
export const HORIZON_FADE_DEG = 4;

/* ------------------------------------------------------------------ *
 * Sunlight -- the light rig and the sun in the sky
 * ------------------------------------------------------------------ */

/**
 * Direct sun at full strength, sun high. The fill (sky, ambient, environment
 * reflections) is kept deliberately weak beside it, so sunlit faces read
 * clearly against faces in shade.
 */
export const SUN_INTENSITY = 6.0;
export const FILL_HEMI_DAY = 0.45;
export const FILL_HEMI_DUSK = 0.2;
export const FILL_AMBIENT = 0.12;
export const FILL_ENV_DAY = 0.6;
export const FILL_ENV_DUSK = 0.35;

/**
 * Normal day: a soft, hazy sun -- daylight without the glare -- fixed in the
 * sky, with a bright even fill. The louvres stay fully open.
 */
export const DAY_SUN_AZIMUTH = 320;
export const DAY_SUN_ELEVATION = 55;
/** Share of SUN_INTENSITY the hazy sun gets. */
export const DAY_SUN_SHARE = 0.3;
export const DAY_FILL_HEMI = 0.95;
export const DAY_FILL_AMBIENT = 0.3;
export const DAY_FILL_ENV = 0.9;

/** Night: a faint cool moon over the north face, and little else. Louvres fully open. */
export const MOON_AZIMUTH = 30;
export const MOON_ELEVATION = 45;
export const MOON_INTENSITY = 0.35;
export const NIGHT_FILL_HEMI = 0.12;
export const NIGHT_FILL_AMBIENT = 0.05;
export const NIGHT_FILL_ENV = 0.1;

/* ------------------------------------------------------------------ *
 * Night lighting -- street lamps, the tower's lit floors, lit windows
 * ------------------------------------------------------------------ */

/** Seconds for the night lighting to come fully on, or go fully off. */
export const NIGHT_FADE_SECONDS = 0.8;

/**
 * Street lamps, metres: one every LAMP_SPACING along each side of every road
 * (the two sides staggered), the pole LAMP_SETBACK outside the carriageway,
 * its arm reaching back over the road. None within LAMP_CROSSING_CLEAR of a
 * crossing road's edge.
 */
export const LAMP_SPACING = 32;
export const LAMP_HEIGHT = 8;
export const LAMP_ARM = 1.8;
export const LAMP_SETBACK = 1.2;
export const LAMP_CROSSING_CLEAR = 4;
/** Warm, sodium-ish. */
export const LAMP_COLOR = 0xffc36e;
/** Lit heads' emissive intensity, their halo's size (m) and the pool of light below (m). */
export const LAMP_GLOW = 6;
export const LAMP_HALO_SIZE = 5;
export const LAMP_POOL_DIAMETER = 18;
export const LAMP_POOL_STRENGTH = 0.55;

/**
 * The tower's floors at night: warm light on every floor plate, in zones, a
 * few of them dim or dark. GLOW scales the lit ceilings (above 1 reads as a
 * light source); the floors under them get FLOOR_SHARE of it.
 */
export const INTERIOR_GLOW_COLOR = 0xffc46a;
export const INTERIOR_GLOW = 1.6;
export const INTERIOR_FLOOR_SHARE = 0.4;
export const INTERIOR_ZONES_X = 4;
export const INTERIOR_ZONES_Z = 3;

/** Neighbouring blocks' lit windows glow this strongly at night. */
export const CITY_WINDOW_GLOW = 1.3;

/** The crown's fritted glass, washed with light at night; the soffit's downlights. */
export const CROWN_GLOW_COLOR = 0xfff0d8;
export const CROWN_GLOW = 0.6;
export const DOWNLIGHT_GLOW = 3;

/** The visible sun: a disc in a soft glow, drawn this far from the eye (inside CAMERA_FAR). */
export const SUN_DISC_DISTANCE = 1000;
/** Angular size of the sprite, glow included; the bright disc is a small part of it. */
export const SUN_DISC_ANGLE_DEG = 14;

/* ------------------------------------------------------------------ *
 * Sky -- an analytic daylight sky by day, a graded dome at night and in
 * the storm (sky.js)
 * ------------------------------------------------------------------ */

/** The sky box. Drawn at the far plane wherever it is, so it only has to enclose the eye. */
export const SKY_DOME_SIZE = 100;
/** Scales the analytic sky's brightness to sit with the scene's lighting. */
export const SKY_GAIN = 0.6;
/** How high up the sky (as the sine of elevation) its foot fades into the fog. */
export const SKY_HORIZON_BLEND = 0.09;
/**
 * Haze in the air. The hot afternoon is clear, turning hazier and redder as
 * the sun drops; the normal day is milky.
 */
export const HOT_SKY_TURBIDITY = 3.2;
export const DUSK_SKY_TURBIDITY = 6.5;
export const HOT_SKY_RAYLEIGH = 1.3;
export const DUSK_SKY_RAYLEIGH = 2.6;
export const DAY_SKY_TURBIDITY = 10;
export const DAY_SKY_RAYLEIGH = 1.1;
export const SKY_MIE = 0.005;
export const DAY_SKY_MIE = 0.012;
export const SKY_MIE_G = 0.8;
/** Cloud cover (0..1), and how solid the clouds are. */
export const SKY_CLOUDS = 0.32;
export const DAY_SKY_CLOUDS = 0.5;
export const SKY_CLOUD_DENSITY = 0.55;
/** The ground the environment map reflects: this share of the horizon colour. */
export const ENV_GROUND_SHARE = 0.3;
/**
 * The environment map's sky is less saturated than the sky itself: at full
 * colour its blue tints everything it lights, turning the grass teal.
 */
export const ENV_SATURATION = 0.45;

/* ------------------------------------------------------------------ *
 * Post-processing (postfx.js)
 * ------------------------------------------------------------------ */

export const POST_MSAA_SAMPLES = 4;
/**
 * Ambient occlusion: how strongly it darkens the creases, and how far it
 * reaches (m) -- this much per metre of orbit distance, within these bounds.
 */
export const AO_INTENSITY = 0.9;
export const AO_RADIUS_PER_DISTANCE = 0.012;
export const AO_RADIUS_MIN = 0.1;
export const AO_RADIUS_MAX = 3.5;
/**
 * Bloom. By day only what is far brighter than a sunlit wall glows -- the
 * sun, glints off glass; once the lamps and lit windows come on, they do.
 * Thresholds are linear brightness, before tone mapping.
 */
export const BLOOM_RADIUS = 0.45;
export const BLOOM_DAY_STRENGTH = 0.22;
export const BLOOM_DAY_THRESHOLD = 8;
export const BLOOM_NIGHT_STRENGTH = 0.65;
export const BLOOM_NIGHT_THRESHOLD = 0.9;

/**
 * The sun's shadow box follows the view: this much radius per metre of orbit
 * distance, within these bounds. Close up, the louvre shadows stay sharp;
 * pulled back, the box takes in the tower and its shadow on the ground.
 */
export const SHADOW_FIT_PER_DISTANCE = 0.8;
export const SHADOW_RADIUS_MIN = 8;
export const SHADOW_RADIUS_MAX = 140;

/* ------------------------------------------------------------------ *
 * Storm -- strong wind and heavy rain; the louvres open fully, edge-on to the wind
 * ------------------------------------------------------------------ */

/** Seconds for the rain and wind to come on, or die away, as the Storm scene is picked or left. */
export const STORM_FADE_SECONDS = 1.5;

/** Overcast: no direct sun, only a dull grey sky. */
export const STORM_FILL_HEMI = 0.75;
export const STORM_FILL_AMBIENT = 0.16;
export const STORM_FILL_ENV = 0.4;

/** Fog, metres. On a clear day it only softens the far city; in the storm the rain closes it in. */
export const FOG_NEAR = 300;
export const FOG_FAR = 900;
export const STORM_FOG_NEAR = 30;
export const STORM_FOG_FAR = 380;

/** Compass bearing the wind blows TOWARD (0 = north, 90 = east). */
export const WIND_TOWARD_DEG = 300;
/**
 * How far the trees lean in the gale: metres of lean per metre of height,
 * squared, so trunks bend from the ground up. 0.007 takes a 15 m crown about
 * 1.6 m downwind, and gusts rock it about that.
 */
export const TREE_SWAY = 0.007;

/**
 * Rain: RAIN_DROPS streaks in a box that rides just ahead of the camera, sized
 * to the orbit distance (RAIN_BOX_PER_DISTANCE, clamped), so the rain reads
 * the same close up and from across the city. Speeds and streak length are
 * in box lengths, so they scale with it.
 */
export const RAIN_DROPS = 24000;
export const RAIN_BOX_PER_DISTANCE = 0.8;
export const RAIN_BOX_MIN = 10;
export const RAIN_BOX_MAX = 200;
/** Box lengths per second: down, and downwind at the wind's mean strength. */
export const RAIN_FALL = 0.7;
export const RAIN_DRIFT = 0.35;
/** Streak length, box lengths. */
export const RAIN_STREAK = 0.035;
export const RAIN_COLOR = 0xc4ceda;
export const RAIN_OPACITY = 0.4;

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

/**
 * White powder-coated aluminium, so the snowflakes read white against the grey
 * curtain wall. Low metalness: a painted finish takes its colour from the paint,
 * not from reflecting the grey sky.
 */
export const ALUMINIUM_COLOR = 0xf4f4f1;
export const ALUMINIUM_METALNESS = 0.15;
export const ALUMINIUM_ROUGHNESS = 0.45;

/**
 * PV cell faces on the spines, hub and tip panels. A mid slate grey: dark
 * enough that the strips read crisply inside the white frames around them,
 * without going black. Lower metalness keeps the panels reading as matte cells
 * against the frames.
 */
export const PV_COLOR = 0x646c77;
export const PV_METALNESS = 0.20;
export const PV_ROUGHNESS = 0.45;

export const MULLION_COLOR = 0x8d9296;
export const GLASS_COLOR = 0x9fc4c0;
export const SLAB_COLOR = 0x4a4a4c;
export const CORE_COLOR = 0x2b2b2e;
export const GROUND_COLOR = 0x5b6b43;
export const PLAZA_COLOR = 0x9a978f;
export const SPANDREL_COLOR = 0x2b3137;
export const COLUMN_COLOR = 0xd9d5cd;
export const STONE_COLOR = 0xcfcac1;
export const SOFFIT_COLOR = 0xe7e5e0;
export const CANOPY_COLOR = 0xecebe8;
export const FRIT_COLOR = 0xdde3e6;
export const FRIT_OPACITY = 0.8;
export const PLANT_COLOR = 0xb8bcc0;
export const LOBBY_LEAF_COLOR = 0x4f7a3c;

/* ------------------------------------------------------------------ *
 * Landscape -- procedural trees surrounding the tower
 * ------------------------------------------------------------------ */

export const TREE_COUNT = 420;

/** Trees are scattered in a band around the tower, clear of the plaza. */
export const TREE_RING_INNER = 34;
export const TREE_RING_OUTER = 250;

/** Paved plaza radius at the tower base, kept free of planting but for its planters. */
export const PLAZA_RADIUS = 30;
/** Paths from the plaza out to the pavements of the roads north and south (m wide). */
export const PATH_WIDTH = 10;
export const GRANITE_COLOR = 0x6f6c68;
/** The grass texture repeats every this many metres. */
export const GRASS_TILE = 40;

export const TREE_HEIGHT_MIN = 6.5;
export const TREE_HEIGHT_MAX = 15.0;

export const TRUNK_COLOR = 0x5a4632;
/** Canopies are tinted between these two greens per instance. */
export const CANOPY_COLOR_A = 0x3f6b34;
export const CANOPY_COLOR_B = 0x6e8f45;

/* ------------------------------------------------------------------ *
 * Adaptive quality, chosen at runtime from measured framerate: while it
 * stays under SHADOW_DEGRADE_FPS for SHADOW_DEGRADE_SECONDS, the next step
 * down is taken -- ambient occlusion off, then smaller shadow maps and no
 * bloom (main.js)
 * ------------------------------------------------------------------ */

export const SHADOW_MAP_SIZES = [2048, 1024, 512];
export const SHADOW_DEGRADE_FPS = 45;
export const SHADOW_DEGRADE_SECONDS = 3;

/* ------------------------------------------------------------------ *
 * City context -- roads, neighbouring blocks, traffic
 * ------------------------------------------------------------------ */

/** How far the built-up area extends from the tower in each direction. */
export const CITY_EXTENT = 280;

/** Road centrelines. X entries run along Z; Z entries run along X. */
export const ROAD_LINES_X = [-55, 55, -155, 155, -255, 255];
export const ROAD_LINES_Z = [-45, 45, -145, 145, -245, 245];
export const ROAD_HALF_WIDTH = 8;

/** Carriageway is lifted off the grass a touch; the two run-directions are
 *  separated again so crossings do not z-fight where they overlap. */
export const ROAD_Y_ALONG_X = 0.03;
export const ROAD_Y_ALONG_Z = 0.034;

export const ROAD_COLOR = 0x33363b;
export const ROOF_COLOR = 0x6b6f74;

/**
 * Pavements along both sides of every road (m), raised a kerb's height, with
 * zebra crossings at the junctions. One pavement texture tile (6 x 6 slabs)
 * covers PAVEMENT_TILE.
 */
export const PAVEMENT_WIDTH = 3.5;
export const KERB_HEIGHT = 0.12;
export const PAVEMENT_TILE = 3;

/**
 * Each neighbouring block stands on a glazed shopfront storey this tall (m),
 * under a canopy; blocks at least CITY_SETBACK_MIN_HEIGHT tall may step back
 * CITY_SETBACK higher up. One shopfront texture tile (three bays) spans
 * SHOPFRONT_TILE. Cornices, canopies and rooftop plant share the trim colour.
 */
export const CITY_BASE_HEIGHT = 4.8;
export const CITY_SETBACK = 3;
export const CITY_SETBACK_MIN_HEIGHT = 30;
export const SHOPFRONT_TILE = 7.5;
export const CITY_TRIM_COLOR = 0xc7c3bb;

/** Neighbours are plain offices -- all shorter than the 105m subject tower. */
export const BUILDING_COUNT = 34;
export const BUILDING_MIN_HEIGHT = 12;
export const BUILDING_MAX_HEIGHT = 58;
export const BUILDING_MIN_SIZE = 16;
export const BUILDING_MAX_SIZE = 38;

/** Window cell size in metres, used to scale the facade texture per building. */
export const WINDOW_CELL_W = 3.4;
export const WINDOW_CELL_H = 3.6;

export const CAR_COUNT = 44;
export const CAR_SPEED_MIN = 7;
export const CAR_SPEED_MAX = 16;
/** Offset of a travel lane either side of the road centreline. */
export const CAR_LANE_OFFSET = 4;

/* ------------------------------------------------------------------ *
 * Office fit-out seen through the glass
 * ------------------------------------------------------------------ */

/** Planning grid for workstations, in metres. */
export const DESK_PITCH_X = 3.2;
export const DESK_PITCH_Z = 3.0;
/** Clear zone kept between the glazing line and the first desk. */
export const FITOUT_MARGIN = 1.3;
/** Clear zone around the service core. */
export const CORE_CLEARANCE = 1.6;

/** Fraction of grid cells that get a workstation, and of those, a person. */
export const DESK_FILL = 0.62;
export const SEATED_FILL = 0.46;
export const STANDING_FILL = 0.05;

/** Ceiling light strips: one per this many grid cells in each direction. */
export const LIGHT_STRIDE_X = 2;
export const LIGHT_STRIDE_Z = 2;
export const CEILING_DROP = 0.45;

export const DESK_COLOR = 0xbfb3a0;
export const CHAIR_COLOR = 0x33383e;
export const MONITOR_COLOR = 0x1c2026;
export const CORE_WALL_COLOR = 0x55585d;
export const CEILING_LIGHT_COLOR = 0xfff0d0;

/** Clothing tints for the figures. */
export const PERSON_COLORS = [0x3d4a5c, 0x7d4a44, 0x45604f, 0x5c5470, 0x8a7a5e, 0x2f3a44];
export const SKIN_COLORS = [0xd8a882, 0xb07d55, 0x8a5a3a, 0xe8c4a0, 0x6b4530];

/* ------------------------------------------------------------------ *
 * Distance-driven detail
 * ------------------------------------------------------------------ */

/**
 * Camera distance (metres, measured to the tower envelope) over which the
 * office fit-out fades. Inside NEAR it is fully drawn; beyond FAR it is not
 * drawn at all, which is also where most of its cost disappears.
 */
export const INTERIOR_FADE_NEAR = 42;
export const INTERIOR_FADE_FAR = 95;

/**
 * Ceiling lighting persists much further than furniture. Lit floors read as a
 * glow from a long way off in real life, and it is only ~420 instances.
 */
export const LIGHT_FADE_NEAR = 150;
export const LIGHT_FADE_FAR = 320;

/* ------------------------------------------------------------------ *
 * Demo animation
 * ------------------------------------------------------------------ */

/** Seconds for one full closed -> open -> closed cycle, holds included. */
export const ANIMATE_PERIOD_SECONDS = 8;

/**
 * Fraction of the cycle spent HELD at each end -- fully closed, then fully
 * open -- the way a pneumatic actuator bottoms out and dwells before reversing.
 * The strokes between use a sine ease-in/ease-out.
 */
export const ANIMATE_DWELL_FRACTION = 0.15;
