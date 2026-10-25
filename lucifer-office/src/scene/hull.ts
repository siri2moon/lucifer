import * as THREE from "three";

/** Deck heights in the yacht's frame; work zones in layout.ts sit on these. */
export const DECK_Y = 3.2;
export const UPPER_Y = 5.8;
export const SKY_Y = 8.2;

export const STERN_X = -22;
export const BOW_X = 25;
/** Widest half-beam, amidships. */
const BEAM = 6.3;
/** The stem rakes: at the keel the bow ends this far aft of its tip at the sheer. */
const STEM_RAKE = 4.6;
/** Thickness of the bulwark: the deck is this much narrower than the hull at the sheer. */
const BULWARK = 0.16;

const { smoothstep, clamp, lerp } = THREE.MathUtils;

/**
 * The hull section, one side, from the keel (t = 0) to the sheer (t = 1):
 * [fraction of the half-beam, height fraction]. A soft V bottom turning into near-vertical topsides.
 */
const PROFILE: [number, number][] = [
  [0, 0],
  [0.42, 0.03],
  [0.74, 0.08],
  [0.91, 0.15],
  [0.98, 0.25],
  [1, 0.38],
  [1, 0.55],
  [1, 0.72],
  [1, 0.88],
  [1, 1],
];

/** Half-beam of the hull plan at height fraction t. The bow tip moves aft toward the keel (raked stem). */
function stemX(t: number): number {
  return BOW_X - STEM_RAKE * (1 - t) ** 1.3;
}

function planHalfWidth(x: number, t: number): number {
  const tip = stemX(t);
  if (x >= tip) return 0;
  if (x <= 2) return BEAM - 0.7 * ((2 - x) / 24) ** 2;
  const u = (x - 2) / (tip - 2);
  return BEAM * (1 - u ** 1.8) ** 0.75;
}

/** Top of the bulwark: low at the stern, sweeping up toward the bow. */
export function sheerY(x: number): number {
  return DECK_Y + 0.3 + 0.75 * smoothstep(x, -4, BOW_X) ** 1.5;
}

/** The keel: rises at the forefoot and a little toward the transom. */
function keelY(x: number): number {
  return -1.3 + 0.6 * smoothstep(x, 14, 21) + 0.6 * smoothstep(-x, 12, 22);
}

/** Bow flare: the topsides lean out over a finer waterline. */
function flare(x: number): number {
  return 0.28 * smoothstep(x, 2, 20);
}

function hullPoint(x: number, zFrac: number, t: number): [number, number] {
  const keel = keelY(x);
  const y = keel + t * (sheerY(x) - keel);
  const z = planHalfWidth(x, t) * zFrac * (1 - flare(x) * (1 - t) ** 1.5);
  return [y, z];
}

/** Half-width of the hull's outer skin at height y (0 below the keel or past the stem). */
export function hullHalfWidthAt(x: number, y: number): number {
  const keel = keelY(x);
  const t = clamp((y - keel) / (sheerY(x) - keel), 0, 1);
  let zFrac = 1;
  for (let i = 1; i < PROFILE.length; i++) {
    const [z0, t0] = PROFILE[i - 1]!;
    const [z1, t1] = PROFILE[i]!;
    if (t <= t1) {
      zFrac = lerp(z0, z1, (t - t0) / (t1 - t0));
      break;
    }
  }
  return hullPoint(x, zFrac, t)[1];
}

/** Half-width of the main deck, inside the bulwark. */
export function deckHalfWidth(x: number): number {
  // Below the sheer the flared bow is narrower, so measure at deck level too.
  return Math.max(0, Math.min(planHalfWidth(x, 1), hullHalfWidthAt(x, DECK_Y)) - BULWARK);
}

export const HULL_PAINT = new THREE.Color("#112544");
const CAP_RAIL = new THREE.Color("#8a5a32");
const BULWARK_INSIDE = new THREE.Color("#f4f2ec");

/**
 * One side of a section at s (0 = transom, 1 = bow): the outer skin, the varnished cap rail and the
 * white inside of the bulwark. Each row of the profile runs from the transom to its own point on the
 * raked stem, so the stem is a clean edge rather than a staircase.
 */
function sectionColumns(s: number): { x: number; y: number; z: number; color: THREE.Color }[] {
  const outer = PROFILE.map(([zf, t]) => {
    const x = lerp(STERN_X, stemX(t), s);
    const [y, z] = hullPoint(x, zf, t);
    return { x, y, z, color: HULL_PAINT };
  });
  const top = outer[outer.length - 1]!;
  const inner = Math.max(0, top.z - BULWARK);
  const deck = Math.min(inner, deckHalfWidth(top.x));
  return [
    ...outer,
    { ...top, color: CAP_RAIL },
    { ...top, z: inner, color: CAP_RAIL },
    { ...top, z: inner, color: BULWARK_INSIDE },
    { ...top, y: DECK_Y, z: deck, color: BULWARK_INSIDE },
  ];
}

/** The hull skin, lofted from sections stern to bow. Uses vertex colors; parts meet at duplicated vertices for crisp edges. */
export function buildHull(sections = 160): THREE.BufferGeometry {
  const positions: number[] = [];
  const colors: number[] = [];
  const index: number[] = [];
  let cols = 0;
  for (const side of [1, -1]) {
    const base = positions.length / 3;
    for (let i = 0; i <= sections; i++) {
      // Denser toward the bow, where the hull curves most.
      const column = sectionColumns(1 - (1 - i / sections) ** 1.35);
      cols = column.length;
      for (const p of column) {
        positions.push(p.x, p.y, p.z * side);
        colors.push(p.color.r, p.color.g, p.color.b);
      }
    }
    for (let i = 0; i < sections; i++) {
      for (let j = 0; j < cols - 1; j++) {
        const a = base + i * cols + j;
        const b = a + cols;
        const c = b + 1;
        const d = a + 1;
        if (side > 0) index.push(a, d, b, b, d, c);
        else index.push(a, b, d, b, c, d);
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  g.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  g.setIndex(index);
  g.computeVertexNormals();
  return g;
}

/** The flat transom closing the hull at the stern. */
export function buildTransom(): THREE.BufferGeometry {
  const side = sectionColumns(0).filter((_, i, all) => i < PROFILE.length || i === all.length - 1 || i === all.length - 3);
  const shape = new THREE.Shape();
  side.forEach((p, i) => (i === 0 ? shape.moveTo(p.z, p.y) : shape.lineTo(p.z, p.y)));
  [...side].reverse().forEach((p) => shape.lineTo(-p.z, p.y));
  const g = new THREE.ShapeGeometry(shape);
  g.rotateY(Math.PI / 2);
  g.translate(STERN_X, 0, 0);
  return g;
}

/** The main deck outline, inside the bulwark (shape x = yacht x, shape y = yacht z). */
export function mainDeckShape(): THREE.Shape {
  const xs = Array.from({ length: 121 }, (_, i) => lerp(STERN_X, BOW_X, i / 120));
  const shape = new THREE.Shape();
  xs.forEach((x, i) => (i === 0 ? shape.moveTo(x, deckHalfWidth(x)) : shape.lineTo(x, deckHalfWidth(x))));
  [...xs].reverse().forEach((x) => shape.lineTo(x, -deckHalfWidth(x)));
  return shape;
}

/** A line along the hull at a fixed height, for trim (stripes, rails); stops where the hull runs out. */
export function hullLine(y: number, side: 1 | -1, offset = 0, from = STERN_X, to = BOW_X): THREE.Vector3[] {
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i <= 160; i++) {
    const x = lerp(from, to, i / 160);
    const z = hullHalfWidthAt(x, y);
    if (z < 0.05) break;
    pts.push(new THREE.Vector3(x, y, (z + offset) * side));
  }
  return pts;
}

/** The sheer line (top outer edge of the bulwark), for the gold cap stripe and the rail. */
export function sheerLine(side: 1 | -1, inset = 0, from = STERN_X): THREE.Vector3[] {
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i <= 160; i++) {
    const x = lerp(from, BOW_X, i / 160);
    const z = planHalfWidth(x, 1) - inset;
    if (z <= 0.02) {
      pts.push(new THREE.Vector3(x, sheerY(x), 0));
      break;
    }
    pts.push(new THREE.Vector3(x, sheerY(x), z * side));
  }
  return pts;
}

/** Position and yaw of something laid flat on the hull's outer skin at (x, y), facing outward. */
export function onHull(x: number, y: number, side: 1 | -1, lift = 0.02): { position: [number, number, number]; rotationY: number } {
  const z = hullHalfWidthAt(x, y);
  const slope = (hullHalfWidthAt(x + 0.2, y) - hullHalfWidthAt(x - 0.2, y)) / 0.4;
  const yaw = Math.atan(slope);
  // A plane faces +z by default; on the port side (-z) turn it around.
  return { position: [x, y, (z + lift) * side], rotationY: side > 0 ? -yaw : Math.PI + yaw };
}

// ---------- Superstructure ----------

/** A deck plan seen from above: a rounded aft end, straight sides, a long tapered nose. */
export interface Plan {
  aft: number;
  fwd: number;
  half: number;
  nose: number;
}

export function planShape({ aft, fwd, half, nose }: Plan): THREE.Shape {
  const r = Math.min(0.7, half * 0.2);
  const s = new THREE.Shape();
  s.moveTo(aft + r, -half);
  s.lineTo(fwd - nose, -half);
  s.bezierCurveTo(fwd - nose * 0.35, -half, fwd, -half * 0.55, fwd, 0);
  s.bezierCurveTo(fwd, half * 0.55, fwd - nose * 0.35, half, fwd - nose, half);
  s.lineTo(aft + r, half);
  s.quadraticCurveTo(aft, half, aft, half - r);
  s.lineTo(aft, -half + r);
  s.quadraticCurveTo(aft, -half, aft + r, -half);
  return s;
}

export function insetPlan(p: Plan, by: number): Plan {
  return { aft: p.aft + by, fwd: p.fwd - by, half: p.half - by, nose: Math.max(0.5, p.nose - by) };
}

/** Raked front: the nose leans aft as it rises, by `amount` at `height` above the base. */
export interface Rake {
  pivot: number;
  fwd: number;
  amount: number;
  height: number;
}

/**
 * A plan extruded upward from y = 0. `y0` is where this piece starts above the base the rake is
 * measured from, so a window band raked with its house keeps the same slope.
 */
export function extrudePlan(p: Plan, height: number, { bevel = 0.06, rake, y0 = 0 }: { bevel?: number; rake?: Rake; y0?: number } = {}): THREE.BufferGeometry {
  const g = new THREE.ExtrudeGeometry(planShape(p), {
    depth: height,
    bevelEnabled: bevel > 0,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: 2,
    curveSegments: 18,
  });
  g.rotateX(-Math.PI / 2);
  if (rake) {
    const pos = g.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const s = clamp((x - rake.pivot) / (rake.fwd - rake.pivot), 0, 1);
      pos.setX(i, x - rake.amount * ((pos.getY(i) + y0) / rake.height) * s);
    }
    g.computeVertexNormals();
  }
  return g;
}

/** Points around a plan's outline at a height, for rails. */
export function planOutline(p: Plan, y: number): THREE.Vector3[] {
  return planShape(p)
    .getPoints(10)
    .map((v) => new THREE.Vector3(v.x, y, v.y));
}

/** A vertical strip between two polylines of equal length (glass rail panels). */
export function ribbon(bottom: THREE.Vector3[], top: THREE.Vector3[]): THREE.BufferGeometry {
  const positions: number[] = [];
  const index: number[] = [];
  bottom.forEach((b, i) => {
    const t = top[i]!;
    positions.push(b.x, b.y, b.z, t.x, t.y, t.z);
    if (i > 0) {
      const a = (i - 1) * 2;
      index.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
    }
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  g.setIndex(index);
  g.computeVertexNormals();
  return g;
}

/** Whether (x, z) lies inside a plan's outline (for checks that zones fit on deck). */
export function planContains(p: Plan, x: number, z: number): boolean {
  const pts = planShape(p).getPoints(24);
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const a = pts[i]!;
    const b = pts[j]!;
    if (a.y > z !== b.y > z && x < ((b.x - a.x) * (z - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

/** The superstructure. Heights line up with DECK_Y, UPPER_Y and SKY_Y. */
export const MAIN_HOUSE: Plan = { aft: -12, fwd: 6.6, half: 4.35, nose: 5.5 };
export const UPPER_DECK: Plan = { aft: -12.9, fwd: 6.2, half: 4.75, nose: 5.2 };
export const BRIDGE: Plan = { aft: -0.6, fwd: 5.6, half: 3.25, nose: 3.6 };
export const SKY_DECK: Plan = { aft: -1.0, fwd: 6.8, half: 3.5, nose: 3.4 };
export const HARDTOP: Plan = { aft: -0.4, fwd: 5.6, half: 3.15, nose: 2.8 };
