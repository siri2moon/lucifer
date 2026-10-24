import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

/** The "angel" parts of a character: wings, halo, tunic. */
export interface AngelLook {
  /** Tint of the feather tips and the stole, usually the agent's color. */
  tint: string;
  /** A seraph: two pairs of golden wings and a double halo. */
  seraph?: boolean;
}

export const GOLD = "#e8b84a";

// ---------- Wings ----------

const WHITE = new THREE.Color("#fffdf7");
const featherBase = new THREE.SphereGeometry(1, 12, 8);

/**
 * One feather: a flat ellipsoid rooted at (0,0), growing along `angle` in the XY plane.
 * Its color fades from white at the root to `tint` at the tip.
 */
function feather(root: THREE.Vector2, angle: number, length: number, width: number, z: number, tint: THREE.Color, tintAmount: number) {
  const g = featherBase.clone();
  g.scale(width, length / 2, 0.013);
  g.translate(0, -length / 2, 0);
  const pos = g.attributes.position!;
  const colors = new Float32Array(pos.count * 3);
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const along = THREE.MathUtils.clamp(-pos.getY(i) / length, 0, 1);
    c.copy(WHITE).lerp(tint, tintAmount * along ** 1.6);
    c.toArray(colors, i * 3);
  }
  g.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  g.rotateZ(angle + Math.PI / 2);
  g.translate(root.x, root.y, z);
  return g;
}

/** The wing's leading edge: arcs up, then falls toward the tip. t runs from 0 (shoulder) to 1 (tip). */
function edge(t: number): THREE.Vector2 {
  return new THREE.Vector2(0.8 * t, 0.3 * Math.sin(Math.PI * Math.min(1, t * 1.25)) - 0.08 * t);
}

/** The right wing in the XY plane, rooted at the shoulder, spreading toward +x. The left wing mirrors it. */
function buildWing(tintColor: string, strength: number): THREE.BufferGeometry {
  const tint = new THREE.Color(tintColor);
  const parts: THREE.BufferGeometry[] = [];
  const lerp = THREE.MathUtils.lerp;
  // Primary flight feathers at the tip: the longest, fanning outward.
  for (let i = 0; i < 8; i++) {
    const u = i / 7;
    parts.push(feather(edge(lerp(0.55, 1, u)), lerp(-1.45, -0.42, u), lerp(0.42, 0.62, u) - u * u * 0.12, 0.062, 0, tint, strength));
  }
  // Secondary flight feathers along the wing.
  for (let i = 0; i < 8; i++) {
    const u = i / 7;
    parts.push(feather(edge(lerp(0.06, 0.55, u)), lerp(-1.7, -1.48, u), lerp(0.3, 0.42, u), 0.06, 0.004, tint, strength * 0.8));
  }
  // Greater and lesser coverts, layered on top.
  for (let i = 0; i < 11; i++) {
    const u = i / 10;
    parts.push(feather(edge(lerp(0.04, 0.92, u)), lerp(-1.7, -0.9, u), lerp(0.2, 0.28, u), 0.058, -0.012, tint, strength * 0.35));
  }
  for (let i = 0; i < 12; i++) {
    const u = i / 11;
    parts.push(feather(edge(lerp(0.0, 0.85, u)).add(new THREE.Vector2(0, 0.02)), lerp(-1.75, -1.1, u), lerp(0.11, 0.14, u), 0.05, -0.022, tint, 0));
  }
  const merged = mergeGeometries(parts)!;
  for (const p of parts) p.dispose();
  merged.computeVertexNormals();
  return merged;
}

const featherMat = new THREE.MeshPhysicalMaterial({
  vertexColors: true,
  roughness: 0.55,
  sheen: 1,
  sheenRoughness: 0.5,
  sheenColor: new THREE.Color("#ffffff"),
  emissive: new THREE.Color("#fff6e4"),
  emissiveIntensity: 0.1,
  iridescence: 0.35,
  iridescenceIOR: 1.4,
});

interface WingsProps {
  look: AngelLook;
  pose: string;
  energy: number;
  phase: number;
}

/** Wings on the back (torso group coordinates). Slow beats when idle, quick flutters while working. */
export function Wings({ look, pose, energy, phase }: WingsProps) {
  const geometry = useMemo(() => buildWing(look.seraph ? "#ffc85a" : look.tint, look.seraph ? 0.7 : 0.42), [look.tint, look.seraph]);
  useEffect(() => () => geometry.dispose(), [geometry]);

  const right = useRef<THREE.Group>(null);
  const left = useRef<THREE.Group>(null);
  const lowerRight = useRef<THREE.Group>(null);
  const lowerLeft = useRef<THREE.Group>(null);

  useFrame(({ clock }) => {
    const t = clock.elapsedTime + phase;
    // Fold the wings back when sitting, swimming or lying; spread them wide and beat hard when flying.
    const folded = pose === "sit" || pose === "swim" || pose === "lie";
    const flying = pose === "fly";
    const sweep = flying ? 0.15 : folded ? 1.05 : 0.55;
    const beat = flying ? Math.sin(t * 7) * 0.55 : Math.sin(t * (1.4 + energy * 5)) * (0.06 + energy * 0.1);
    const lift = (flying ? 0.25 : folded ? 0.3 : 0.42) + beat;
    for (const w of [right.current, left.current]) w?.rotation.set(0.12, sweep - beat * 0.5, lift);
    for (const w of [lowerRight.current, lowerLeft.current]) w?.rotation.set(0.1, sweep + 0.35 - beat * 0.3, -0.22 + beat * 0.6);
  });

  return (
    <group position={[0, 0.43, -0.1]}>
      {([1, -1] as const).map((side) => (
        <group key={side} scale={[side, 1, 1]}>
          <group ref={side === 1 ? right : left} position={[0.06, 0, 0]} scale={look.seraph ? 1.2 : 1}>
            <mesh geometry={geometry} material={featherMat} castShadow />
          </group>
          {look.seraph && (
            <group ref={side === 1 ? lowerRight : lowerLeft} position={[0.05, -0.14, -0.04]} scale={0.6}>
              <mesh geometry={geometry} material={featherMat} castShadow />
            </group>
          )}
        </group>
      ))}
    </group>
  );
}

// ---------- Halo ----------

const haloMat = new THREE.MeshStandardMaterial({
  color: "#ffe39a",
  emissive: "#ffcf5c",
  emissiveIntensity: 2.2,
  metalness: 0.6,
  roughness: 0.25,
  toneMapped: false,
});
const haloGeo = new THREE.TorusGeometry(0.135, 0.014, 16, 64);

let glowTexture: THREE.Texture | null = null;
function getGlowTexture(): THREE.Texture {
  if (glowTexture) return glowTexture;
  const size = 128;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, "rgba(255,236,170,0.9)");
  g.addColorStop(0.35, "rgba(255,214,120,0.35)");
  g.addColorStop(1, "rgba(255,214,120,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  glowTexture = new THREE.CanvasTexture(canvas);
  glowTexture.colorSpace = THREE.SRGBColorSpace;
  return glowTexture;
}

/** The halo floating above the head (head group coordinates), glowing brighter while working. */
export function Halo({ seraph, energy, phase }: { seraph?: boolean; energy: number; phase: number }) {
  const group = useRef<THREE.Group>(null);
  const glow = useRef<THREE.SpriteMaterial>(null);
  const texture = useMemo(getGlowTexture, []);

  useFrame(({ clock }) => {
    const t = clock.elapsedTime + phase;
    if (group.current) {
      group.current.position.y = 0.27 + Math.sin(t * 1.6) * 0.012;
      group.current.rotation.y = t * 0.6;
    }
    if (glow.current) glow.current.opacity = 0.3 + energy * 0.35 + Math.sin(t * 2.4) * 0.08;
  });

  return (
    <group ref={group} position={[0, 0.27, -0.02]}>
      <group rotation={[Math.PI / 2 - 0.25, 0, 0]}>
        <mesh geometry={haloGeo} material={haloMat} />
        {seraph && <mesh geometry={haloGeo} material={haloMat} scale={1.32} />}
      </group>
      <sprite scale={seraph ? 0.6 : 0.42}>
        <spriteMaterial ref={glow} map={texture} transparent depthWrite={false} blending={THREE.AdditiveBlending} />
      </sprite>
    </group>
  );
}

// ---------- Áo tunic ----------

const SKIRT: [number, number][] = [
  [0.163, 0.04],
  [0.188, -0.08],
  [0.22, -0.22],
  [0.24, -0.38],
  [0.252, -0.43],
];

/** The tunic skirt, hanging from hip to knee with a gold hem. Lives in the hips group. */
function skirtGeometry(): THREE.LatheGeometry {
  // Lathe profiles must run bottom to top so the normals face outward.
  const pts = [...SKIRT].reverse().map(([x, y]) => new THREE.Vector2(x, y));
  const g = new THREE.LatheGeometry(new THREE.SplineCurve(pts).getPoints(24), 40);
  g.computeVertexNormals();
  return g;
}
const skirtGeo = skirtGeometry();
const hemGeo = new THREE.TorusGeometry(0.25, 0.013, 8, 56);
const beltGeo = new THREE.TorusGeometry(0.158, 0.019, 10, 40);
export const goldMat = new THREE.MeshPhysicalMaterial({ color: GOLD, metalness: 0.85, roughness: 0.28, clearcoat: 0.5 });

const skirtMats = new Map<THREE.Material, THREE.Material>();
/** The skirt is an open surface, so both sides are drawn. */
function doubleSided(m: THREE.Material): THREE.Material {
  let d = skirtMats.get(m);
  if (!d) {
    d = m.clone();
    d.side = THREE.DoubleSide;
    skirtMats.set(m, d);
  }
  return d;
}

export function TunicSkirt({ cloth, sitting, depth }: { cloth: THREE.Material; sitting: boolean; depth: number }) {
  // When sitting, the skirt shrinks to a short band so it doesn't clip through the thighs.
  return (
    <group scale={[1, sitting ? 0.4 : 1, depth * 1.08]}>
      <mesh geometry={skirtGeo} material={doubleSided(cloth)} castShadow />
      <mesh geometry={hemGeo} material={goldMat} position={[0, -0.428, 0]} rotation={[Math.PI / 2, 0, 0]} />
    </group>
  );
}

export function TunicBelt({ depth }: { depth: number }) {
  return <mesh geometry={beltGeo} material={goldMat} position={[0, 0.04, 0]} rotation={[Math.PI / 2, 0, 0]} scale={[1, depth * 1.04, 1]} />;
}

/** A flat ribbon along a curve, facing outward along `outward`. */
function ribbon(path: THREE.Vector3[], width: number, outward: (p: THREE.Vector3) => THREE.Vector3): THREE.BufferGeometry {
  const curve = new THREE.CatmullRomCurve3(path);
  const pts = curve.getPoints(40);
  const pos: number[] = [];
  const idx: number[] = [];
  const side = new THREE.Vector3();
  pts.forEach((p, i) => {
    const tangent = curve.getTangent(i / (pts.length - 1));
    side.crossVectors(tangent, outward(p)).normalize().multiplyScalar(width / 2);
    pos.push(p.x - side.x, p.y - side.y, p.z - side.z, p.x + side.x, p.y + side.y, p.z + side.z);
    if (i > 0) {
      const a = (i - 1) * 2;
      idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** Body radius at height y, read from the lathe profile. */
function radiusAt(profile: THREE.Vector2[], y: number): number {
  let best = profile[0]!;
  for (const p of profile) if (Math.abs(p.y - y) < Math.abs(best.y - y)) best = p;
  return best.x;
}

const stoleCache = new Map<string, THREE.BufferGeometry>();
/**
 * The stole drapes over both shoulders, down the chest to the belt and over the skirt.
 * It follows the body profile so it doesn't float. Hips group coordinates.
 */
function stoleGeometry(torso: [number, number][], depth: number, sitting: boolean): THREE.BufferGeometry {
  const key = `${torso.length}:${depth}:${sitting}`;
  let g = stoleCache.get(key);
  if (g) return g;
  const torsoPts = new THREE.SplineCurve(torso.map(([x, y]) => new THREE.Vector2(x, y))).getPoints(80);
  const skirtPts = new THREE.SplineCurve(SKIRT.map(([x, y]) => new THREE.Vector2(x, y))).getPoints(40);
  const parts: THREE.BufferGeometry[] = [];
  for (const sx of [-1, 1]) {
    const x = sx * 0.072;
    const path: THREE.Vector3[] = [];
    // From behind the shoulder, over its top and down the chest.
    path.push(new THREE.Vector3(x * 1.2, 0.5, -0.1), new THREE.Vector3(x * 1.1, 0.565, -0.02));
    for (let y = 0.54; y >= 0.06; y -= 0.06) {
      const r = radiusAt(torsoPts, y);
      path.push(new THREE.Vector3(x, y, Math.sqrt(Math.max(r * r - x * x, 0.0004)) * depth + 0.012));
    }
    // The tail hangs over the skirt (shorter when sitting).
    const tail = sitting ? -0.1 : -0.36;
    for (let y = 0.0; y >= tail; y -= 0.07) {
      const r = y > -0.33 ? radiusAt(skirtPts, sitting ? y / 0.4 : y) : 0.23;
      path.push(new THREE.Vector3(x * (1 - y * 0.25), y, Math.sqrt(Math.max(r * r - x * x, 0.0004)) * depth * 1.08 + 0.014));
    }
    parts.push(ribbon(path, 0.07, (p) => new THREE.Vector3(p.x * 0.3, 0, Math.sign(p.z || 1))));
  }
  g = mergeGeometries(parts)!;
  stoleCache.set(key, g);
  return g;
}

const stoleMats = new Map<string, THREE.Material>();
export function Stole({ color, torso, depth, sitting }: { color: string; torso: [number, number][]; depth: number; sitting: boolean }) {
  let m = stoleMats.get(color);
  if (!m) {
    const c = new THREE.Color(color);
    m = new THREE.MeshPhysicalMaterial({
      color: c,
      roughness: 0.45,
      sheen: 1,
      sheenColor: c.clone().lerp(new THREE.Color("#ffffff"), 0.6),
      side: THREE.DoubleSide,
    });
    stoleMats.set(color, m);
  }
  return <mesh geometry={stoleGeometry(torso, depth, sitting)} material={m} castShadow />;
}
