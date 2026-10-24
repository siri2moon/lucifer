import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";
import { SHORE_Z, sandHeight } from "./layout";

const SAND_DRY = new THREE.Color("#f2d38b");
const SAND_LIGHT = new THREE.Color("#f7e2a8");
const SAND_WET = new THREE.Color("#b8955a");

function Sand() {
  const geometry = useMemo(() => {
    const g = new THREE.PlaneGeometry(260, 90, 200, 80);
    g.rotateX(-Math.PI / 2);
    const pos = g.attributes.position as THREE.BufferAttribute;
    const colors = new Float32Array(pos.count * 3);
    const c = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i) + SHORE_Z + 33;
      const ripple = Math.sin(x * 1.7 + z * 0.9) * 0.015;
      pos.setY(i, sandHeight(x, z) + ripple);
      pos.setZ(i, z);
      const wet = THREE.MathUtils.smoothstep(z, SHORE_Z + 4, SHORE_Z - 0.5);
      const speckle = (Math.sin(x * 12.9898 + z * 78.233) * 43758.5453) % 1;
      c.copy(SAND_DRY).lerp(SAND_LIGHT, Math.abs(speckle) * 0.5).lerp(SAND_WET, wet);
      colors.set([c.r, c.g, c.b], i * 3);
    }
    g.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    g.computeVertexNormals();
    return g;
  }, []);

  return (
    <mesh geometry={geometry} receiveShadow>
      <meshStandardMaterial vertexColors roughness={0.95} />
    </mesh>
  );
}

function Hills() {
  const hills = useMemo(
    () =>
      Array.from({ length: 14 }, (_, i) => {
        const x = -130 + i * 20 + Math.sin(i * 3.1) * 6;
        const r = 14 + ((i * 7) % 5) * 3;
        return { x, z: SHORE_Z + 62 + Math.cos(i * 2.3) * 5, r, h: r * (0.5 + ((i * 3) % 4) * 0.12) };
      }),
    [],
  );
  return (
    <group>
      {hills.map((h, i) => (
        <mesh key={i} position={[h.x, h.h * 0.15, h.z]} scale={[h.r, h.h, h.r * 0.8]} receiveShadow>
          <icosahedronGeometry args={[1, 1]} />
          <meshStandardMaterial color={i % 2 ? "#3f8f4f" : "#4fa35a"} flatShading roughness={1} />
        </mesh>
      ))}
    </group>
  );
}

export function PalmTree({ position, lean = 0.25, height = 7, rotation = 0 }: { position: [number, number, number]; lean?: number; height?: number; rotation?: number }) {
  const crown = useRef<THREE.Group>(null);
  const segments = 7;
  const trunk = useMemo(() => {
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i <= segments; i++) {
      const t = i / segments;
      pts.push(new THREE.Vector3(Math.pow(t, 1.6) * lean * height, t * height, 0));
    }
    return pts;
  }, [lean, height]);
  const top = trunk[trunk.length - 1]!;
  const phase = position[0] * 0.37;

  useFrame(({ clock }) => {
    if (crown.current) {
      const t = clock.elapsedTime + phase;
      crown.current.rotation.z = Math.sin(t * 0.9) * 0.05;
      crown.current.rotation.x = Math.cos(t * 0.7) * 0.04;
    }
  });

  return (
    <group position={position} rotation={[0, rotation, 0]}>
      {trunk.slice(0, -1).map((p, i) => {
        const next = trunk[i + 1]!;
        const mid = p.clone().add(next).multiplyScalar(0.5);
        const dir = next.clone().sub(p);
        const angle = Math.atan2(dir.x, dir.y);
        return (
          <mesh key={i} position={mid} rotation={[0, 0, -angle]} castShadow>
            <cylinderGeometry args={[0.16 - i * 0.008, 0.2 - i * 0.008, dir.length() * 1.05, 7]} />
            <meshStandardMaterial color={i % 2 ? "#8a6a43" : "#a07b4f"} flatShading roughness={1} />
          </mesh>
        );
      })}
      <group ref={crown} position={top}>
        {Array.from({ length: 8 }, (_, i) => (
          <group key={i} rotation={[0, (i / 8) * Math.PI * 2, 0]}>
            <mesh position={[1.35, -0.35, 0]} rotation={[0, 0, -0.45]} castShadow>
              <coneGeometry args={[0.45, 3, 4, 1]} />
              <meshStandardMaterial color={i % 2 ? "#2f9e44" : "#40b350"} flatShading side={THREE.DoubleSide} />
            </mesh>
          </group>
        ))}
        {[0, 1, 2].map((i) => (
          <mesh key={i} position={[Math.cos(i * 2.1) * 0.22, -0.25, Math.sin(i * 2.1) * 0.22]} castShadow>
            <sphereGeometry args={[0.16, 7, 6]} />
            <meshStandardMaterial color="#6b4a2a" flatShading />
          </mesh>
        ))}
      </group>
    </group>
  );
}

export function Umbrella({ position, color }: { position: [number, number, number]; color: string }) {
  return (
    <group position={position}>
      <mesh position={[0, 1.3, 0]} castShadow>
        <cylinderGeometry args={[0.04, 0.04, 2.6, 6]} />
        <meshStandardMaterial color="#eeeeee" />
      </mesh>
      <mesh position={[0, 2.5, 0]} castShadow>
        <coneGeometry args={[1.6, 0.6, 8, 1, true]} />
        <meshStandardMaterial color={color} flatShading side={THREE.DoubleSide} />
      </mesh>
    </group>
  );
}

export function Lounger({ position, rotation = 0, color = "#ffffff" }: { position: [number, number, number]; rotation?: number; color?: string }) {
  return (
    <group position={position} rotation={[0, rotation, 0]}>
      <mesh position={[0, 0.3, 0]} castShadow receiveShadow>
        <boxGeometry args={[0.7, 0.08, 1.5]} />
        <meshStandardMaterial color={color} />
      </mesh>
      <mesh position={[0, 0.55, -0.85]} rotation={[0.6, 0, 0]} castShadow>
        <boxGeometry args={[0.7, 0.08, 0.7]} />
        <meshStandardMaterial color={color} />
      </mesh>
      {[-0.3, 0.3].map((x) =>
        [-0.6, 0.6].map((z) => (
          <mesh key={`${x}${z}`} position={[x, 0.13, z]}>
            <boxGeometry args={[0.05, 0.26, 0.05]} />
            <meshStandardMaterial color="#c9a36b" />
          </mesh>
        )),
      )}
    </group>
  );
}

export function Towel({ position, rotation = 0, color }: { position: [number, number, number]; rotation?: number; color: string }) {
  return (
    <mesh position={[position[0], position[1] + 0.02, position[2]]} rotation={[-Math.PI / 2, 0, rotation]} receiveShadow>
      <planeGeometry args={[0.9, 2]} />
      <meshStandardMaterial color={color} roughness={1} />
    </mesh>
  );
}

/** An open pergola for the beach work zone: people stay visible from above. */
export function Pergola({ position, size = [6, 5], label }: { position: [number, number, number]; size?: [number, number]; label?: string }) {
  const [w, d] = size;
  const slats = Math.round(w / 0.7);
  return (
    <group position={position}>
      {[-1, 1].map((sx) =>
        [-1, 1].map((sz) => (
          <mesh key={`${sx}${sz}`} position={[(sx * w) / 2, 1.5, (sz * d) / 2]} castShadow>
            <boxGeometry args={[0.2, 3, 0.2]} />
            <meshStandardMaterial color="#f4ecdc" />
          </mesh>
        )),
      )}
      {[-1, 1].map((sz) => (
        <mesh key={sz} position={[0, 3.05, (sz * d) / 2]} castShadow>
          <boxGeometry args={[w + 0.6, 0.18, 0.18]} />
          <meshStandardMaterial color="#f4ecdc" />
        </mesh>
      ))}
      {Array.from({ length: slats + 1 }, (_, i) => (
        <mesh key={i} position={[-w / 2 + (i * w) / slats, 3.2, 0]} castShadow>
          <boxGeometry args={[0.1, 0.12, d + 0.6]} />
          <meshStandardMaterial color="#c9a36b" />
        </mesh>
      ))}
      {/* Bougainvillea on the frame */}
      {Array.from({ length: 9 }, (_, i) => (
        <mesh key={`f${i}`} position={[-w / 2 + ((i * 37) % 10) * (w / 10), 3.3, -d / 2 + ((i * 53) % 10) * (d / 10)]} castShadow>
          <icosahedronGeometry args={[0.35 + (i % 3) * 0.1, 0]} />
          <meshStandardMaterial color={i % 3 ? "#e85a9b" : "#3fa34d"} flatShading />
        </mesh>
      ))}
      {/* String lights */}
      {Array.from({ length: 8 }, (_, i) => (
        <mesh key={`l${i}`} position={[-w / 2 + (i + 0.5) * (w / 8), 2.85 - Math.sin(((i + 0.5) / 8) * Math.PI) * 0.25, d / 2]}>
          <sphereGeometry args={[0.07, 6, 6]} />
          <meshStandardMaterial color="#fff3c4" emissive="#ffd36b" emissiveIntensity={1.5} />
        </mesh>
      ))}
      {label && (
        <mesh position={[0, 2.65, d / 2 + 0.12]}>
          <planeGeometry args={[2.4, 0.5]} />
          <meshBasicMaterial map={labelTexture(label)} transparent />
        </mesh>
      )}
    </group>
  );
}

/** A cabana-style thatched roof. */
export function Hut({ position, size = [6, 5], label }: { position: [number, number, number]; size?: [number, number]; label?: string }) {
  const [w, d] = size;
  return (
    <group position={position}>
      {[-1, 1].map((sx) =>
        [-1, 1].map((sz) => (
          <mesh key={`${sx}${sz}`} position={[(sx * w) / 2, 1.5, (sz * d) / 2]} castShadow>
            <cylinderGeometry args={[0.1, 0.12, 3, 6]} />
            <meshStandardMaterial color="#8b6239" flatShading />
          </mesh>
        )),
      )}
      <mesh position={[0, 3.45, 0]} rotation={[0, Math.PI / 4, 0]} castShadow>
        <coneGeometry args={[Math.hypot(w, d) * 0.62, 1.6, 4, 1]} />
        <meshStandardMaterial color="#d9b26a" flatShading roughness={1} />
      </mesh>
      {label && (
        <mesh position={[0, 2.85, d / 2 + 0.05]}>
          <planeGeometry args={[2.4, 0.5]} />
          <meshBasicMaterial map={labelTexture(label)} transparent />
        </mesh>
      )}
    </group>
  );
}

const labelCache = new Map<string, THREE.CanvasTexture>();
export function labelTexture(text: string, color = "#3b2a14", bg = "rgba(255,244,214,0.92)"): THREE.CanvasTexture {
  const key = `${text}|${color}|${bg}`;
  const cached = labelCache.get(key);
  if (cached) return cached;
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 108;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = bg;
  ctx.beginPath();
  ctx.roundRect(4, 4, 504, 100, 30);
  ctx.fill();
  ctx.fillStyle = color;
  ctx.font = "bold 52px 'Trebuchet MS', sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, 256, 58);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  labelCache.set(key, tex);
  return tex;
}

const UMBRELLA_COLORS = ["#ff6b6b", "#ffd93d", "#4d96ff", "#ff8fd8", "#6bcb77"];

export function Beach() {
  const palms = useMemo(
    () => [
      { position: [-34, 0, SHORE_Z + 9] as [number, number, number], lean: 0.35, height: 8, rotation: 2.4 },
      { position: [-27, 0, SHORE_Z + 15] as [number, number, number], lean: 0.2, height: 9, rotation: 1.2 },
      { position: [-6, 0, SHORE_Z + 18] as [number, number, number], lean: 0.3, height: 7.5, rotation: 2.0 },
      { position: [4, 0, SHORE_Z + 21] as [number, number, number], lean: 0.15, height: 9.5, rotation: 0.5 },
      { position: [27, 0, SHORE_Z + 10] as [number, number, number], lean: 0.4, height: 8, rotation: -0.6 },
      { position: [35, 0, SHORE_Z + 16] as [number, number, number], lean: 0.25, height: 9, rotation: 0.3 },
      { position: [-48, 0, SHORE_Z + 13] as [number, number, number], lean: 0.3, height: 8.5, rotation: 2.8 },
      { position: [48, 0, SHORE_Z + 12] as [number, number, number], lean: 0.32, height: 8, rotation: -1.0 },
    ],
    [],
  );

  return (
    <group>
      <Sand />
      <Hills />
      {palms.map((p, i) => (
        <PalmTree key={i} {...p} position={[p.position[0], sandHeight(p.position[0], p.position[2]) - 0.1, p.position[2]]} />
      ))}
      {[-4, 2, 8].map((x, i) => {
        const z = SHORE_Z + 7;
        const y = sandHeight(x, z);
        return (
          <group key={x}>
            <Umbrella position={[x, y, z]} color={UMBRELLA_COLORS[i % UMBRELLA_COLORS.length]!} />
            <Lounger position={[x - 0.8, y, z + 0.4]} rotation={Math.PI} />
            <Lounger position={[x + 0.8, y, z + 0.4]} rotation={Math.PI} color="#ffe7a8" />
          </group>
        );
      })}
      {[-30, 30].map((x) => {
        const z = SHORE_Z + 5;
        return (
          <mesh key={x} position={[x, sandHeight(x, z) + 0.2, z]} castShadow>
            <dodecahedronGeometry args={[1.1, 0]} />
            <meshStandardMaterial color="#8d8a85" flatShading />
          </mesh>
        );
      })}
    </group>
  );
}
