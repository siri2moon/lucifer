import { RoundedBox } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { type ReactNode, useMemo, useRef } from "react";
import * as THREE from "three";
import { labelTexture } from "./Beach";

/** The hull outline seen from above: (x, half-width). Stern at -x, bow at +x. */
const OUTLINE: [number, number][] = [
  [-22, 5.6],
  [-18, 6.1],
  [-8, 6.3],
  [4, 6.0],
  [12, 5.0],
  [18, 3.4],
  [22, 1.6],
  [25, 0],
];

function hullShape(scale = 1, inset = 0): THREE.Shape {
  const s = new THREE.Shape();
  const pts = [...OUTLINE.map(([x, w]) => [x, w]), ...[...OUTLINE].reverse().map(([x, w]) => [x, -w])] as [number, number][];
  pts.forEach(([x, w], i) => {
    const px = x * scale + (x < 0 ? inset : -inset);
    const pw = Math.sign(w) * Math.max(0, Math.abs(w) * scale - inset);
    if (i === 0) s.moveTo(px, pw);
    else s.lineTo(px, pw);
  });
  s.closePath();
  return s;
}

function extrude(shape: THREE.Shape, depth: number, bevel = 0.25): THREE.ExtrudeGeometry {
  const g = new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: bevel > 0,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: 3,
    curveSegments: 4,
  });
  g.rotateX(-Math.PI / 2); // extrude vertically
  return g;
}

function nameTexture(): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 1024;
  canvas.height = 128;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#c9a227";
  ctx.font = "italic bold 92px Georgia, serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("LUCIFER  ✦✦✦✦✦✦", 512, 68);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

const DECK_Y = 3.2;
const UPPER_Y = 5.8;
const SKY_Y = 8.2;

function GlassRail({ points, y, height = 0.9 }: { points: [number, number][]; y: number; height?: number }) {
  const segments = useMemo(
    () =>
      points.slice(0, -1).map(([x1, z1], i) => {
        const [x2, z2] = points[i + 1]!;
        return { x: (x1 + x2) / 2, z: (z1 + z2) / 2, len: Math.hypot(x2 - x1, z2 - z1), angle: -Math.atan2(z2 - z1, x2 - x1) };
      }),
    [points],
  );
  return (
    <group position={[0, y, 0]}>
      {segments.map((s, i) => (
        <group key={i} position={[s.x, height / 2, s.z]} rotation={[0, s.angle, 0]}>
          <mesh>
            <boxGeometry args={[s.len, height, 0.04]} />
            <meshPhysicalMaterial color="#bfe9ff" transparent opacity={0.28} roughness={0.05} metalness={0.1} />
          </mesh>
          <mesh position={[0, height / 2, 0]}>
            <boxGeometry args={[s.len, 0.06, 0.08]} />
            <meshStandardMaterial color="#d8d8d8" metalness={0.9} roughness={0.25} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

function rectPoints(x1: number, x2: number, halfW: number): [number, number][] {
  return [
    [x1, -halfW],
    [x2, -halfW],
    [x2, halfW],
    [x1, halfW],
    [x1, -halfW],
  ];
}

/** The yacht bobbing on the waves; `children` (employees, desks) move with the hull. */
export function Yacht({ position, children }: { position: [number, number, number]; children?: ReactNode }) {
  const group = useRef<THREE.Group>(null);
  const geo = useMemo(
    () => ({
      lower: extrude(hullShape(0.985), 1.9, 0.3),
      // 1.2 + 1.7 + 0.3 bevel = DECK_Y: the gunwale is flush with the deck.
      upper: extrude(hullShape(1), 1.7, 0.3),
      stripe: extrude(hullShape(1.004), 0.12, 0.3),
      deck: extrude(hullShape(0.97, 0.35), 0.06, 0),
    }),
    [],
  );
  const name = useMemo(nameTexture, []);
  const sideRail = useMemo(() => {
    const pts = OUTLINE.map(([x, w]) => [x * 0.97, w * 0.93] as [number, number]);
    return [...pts, ...[...pts].reverse().map(([x, w]) => [x, -w] as [number, number]), pts[0]!];
  }, []);

  useFrame(({ clock }) => {
    const g = group.current;
    if (!g) return;
    const t = clock.elapsedTime;
    g.position.y = position[1] + Math.sin(t * 0.8) * 0.12;
    g.rotation.z = Math.sin(t * 0.55) * 0.012;
    g.rotation.x = Math.sin(t * 0.7 + 1) * 0.01;
  });

  return (
    <group ref={group} position={position}>
      {/* Hull: navy bottom, white sides, gold stripe */}
      <mesh geometry={geo.lower} position={[0, -0.9, 0]} castShadow receiveShadow>
        <meshStandardMaterial color="#13294b" roughness={0.35} metalness={0.2} />
      </mesh>
      <mesh geometry={geo.upper} position={[0, 1.2, 0]} castShadow receiveShadow>
        <meshStandardMaterial color="#fbfbf8" roughness={0.25} metalness={0.05} />
      </mesh>
      <mesh geometry={geo.stripe} position={[0, 1.05, 0]}>
        <meshStandardMaterial color="#c9a227" metalness={0.8} roughness={0.25} />
      </mesh>
      {[1, -1].map((side) => (
        <mesh key={side} position={[-6, 2.25, side * 6.62]} rotation={[0, side > 0 ? 0 : Math.PI, 0]}>
          <planeGeometry args={[14, 1.75]} />
          <meshBasicMaterial map={name} transparent />
        </mesh>
      ))}

      {/* Teak main deck */}
      <mesh geometry={geo.deck} position={[0, DECK_Y, 0]} receiveShadow>
        <meshStandardMaterial color="#b07a46" roughness={0.8} />
      </mesh>
      <GlassRail points={sideRail} y={DECK_Y} />

      {/* Swim platform at the stern */}
      <mesh position={[-23.2, 0.55, 0]} castShadow receiveShadow>
        <boxGeometry args={[2.6, 0.25, 9.5]} />
        <meshStandardMaterial color="#b07a46" />
      </mesh>

      {/* Level 1: tinted-glass cabin; its roof is the upper deck */}
      <RoundedBox args={[18, 2.6, 9]} radius={0.5} smoothness={3} position={[-3, DECK_Y + 1.3, 0]} castShadow receiveShadow>
        <meshStandardMaterial color="#fbfbf8" roughness={0.25} />
      </RoundedBox>
      <RoundedBox args={[17.4, 1.05, 9.08]} radius={0.35} smoothness={3} position={[-2.6, DECK_Y + 1.35, 0]}>
        <meshPhysicalMaterial color="#1c2f45" roughness={0.05} metalness={0.6} clearcoat={1} />
      </RoundedBox>
      <mesh position={[-3, UPPER_Y + 0.03, 0]} receiveShadow>
        <boxGeometry args={[17.4, 0.06, 8.4]} />
        <meshStandardMaterial color="#b07a46" roughness={0.8} />
      </mesh>
      <GlassRail points={rectPoints(-11.9, 5.9, 4.2)} y={UPPER_Y} />

      {/* Level 2: bridge; its roof is the sky deck */}
      <RoundedBox args={[6.6, 2.4, 6.6]} radius={0.45} smoothness={3} position={[3, UPPER_Y + 1.2, 0]} castShadow receiveShadow>
        <meshStandardMaterial color="#fbfbf8" roughness={0.25} />
      </RoundedBox>
      <RoundedBox args={[6.2, 0.95, 6.68]} radius={0.3} smoothness={3} position={[3.3, UPPER_Y + 1.25, 0]}>
        <meshPhysicalMaterial color="#1c2f45" roughness={0.05} metalness={0.6} clearcoat={1} />
      </RoundedBox>
      <mesh position={[3, SKY_Y + 0.03, 0]} receiveShadow>
        <boxGeometry args={[6.2, 0.06, 6.2]} />
        <meshStandardMaterial color="#b07a46" roughness={0.8} />
      </mesh>
      <GlassRail points={rectPoints(-0.1, 6.1, 3.1)} y={SKY_Y} height={0.8} />

      {/* Sky deck canopy and radar mast */}
      {[-1, 1].map((sx) =>
        [-1, 1].map((sz) => (
          <mesh key={`${sx}${sz}`} position={[3 + sx * 2.7, SKY_Y + 1.4, sz * 2.7]}>
            <cylinderGeometry args={[0.05, 0.05, 2.8, 6]} />
            <meshStandardMaterial color="#e0e0e0" metalness={0.9} roughness={0.2} />
          </mesh>
        )),
      )}
      <mesh position={[3, SKY_Y + 2.85, 0]} castShadow>
        <boxGeometry args={[5.8, 0.1, 5.8]} />
        <meshStandardMaterial color="#f4efe3" roughness={0.9} />
      </mesh>
      <mesh position={[-0.6, SKY_Y + 1.9, 0]} castShadow>
        <cylinderGeometry args={[0.06, 0.08, 3.8, 6]} />
        <meshStandardMaterial color="#e0e0e0" metalness={0.9} roughness={0.2} />
      </mesh>
      <RadarDish position={[-0.6, SKY_Y + 3.9, 0]} />

      {/* Jacuzzi at the bow */}
      <group position={[19.5, DECK_Y + 0.25, 0]}>
        <mesh>
          <cylinderGeometry args={[1.3, 1.3, 0.5, 20]} />
          <meshStandardMaterial color="#f4f4f4" />
        </mesh>
        <mesh position={[0, 0.26, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <circleGeometry args={[1.1, 20]} />
          <meshStandardMaterial color="#47d6e8" emissive="#1aa7c0" emissiveIntensity={0.3} roughness={0.1} />
        </mesh>
      </group>

      {children}
    </group>
  );
}

function RadarDish({ position }: { position: [number, number, number] }) {
  const ref = useRef<THREE.Group>(null);
  useFrame((_, dt) => {
    if (ref.current) ref.current.rotation.y += dt * 1.2;
  });
  return (
    <group ref={ref} position={position}>
      <mesh>
        <boxGeometry args={[1.6, 0.12, 0.2]} />
        <meshStandardMaterial color="#f4f4f4" />
      </mesh>
    </group>
  );
}

/** A work zone's mat and department sign. */
export function ZoneMat({ center, size, color, label }: { center: [number, number, number]; size: [number, number]; color: string; label: string }) {
  const tex = useMemo(() => labelTexture(label, "#ffffff", hexToRgba(color, 0.92)), [label, color]);
  return (
    <group position={center}>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.08, 0]} receiveShadow>
        <planeGeometry args={size} />
        <meshStandardMaterial color={color} transparent opacity={0.22} roughness={1} />
      </mesh>
      <mesh position={[0, 0.09, size[1] / 2 - 0.05]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[size[0], 0.1]} />
        <meshBasicMaterial color={color} />
      </mesh>
      <mesh position={[-size[0] / 2 + 1.3, 0.09, size[1] / 2 + 0.01]} rotation={[-Math.PI / 2.6, 0, 0]}>
        <planeGeometry args={[2.4, 0.5]} />
        <meshBasicMaterial map={tex} transparent />
      </mesh>
    </group>
  );
}

function hexToRgba(hex: string, alpha: number): string {
  const c = new THREE.Color(hex);
  return `rgba(${Math.round(c.r * 255)},${Math.round(c.g * 255)},${Math.round(c.b * 255)},${alpha})`;
}
