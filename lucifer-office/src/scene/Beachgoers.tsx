import { useFrame } from "@react-three/fiber";
import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { SHORE_Z, sandHeight } from "./layout";
import { type Outfit, type Pose, Person } from "./Person";
import { Towel } from "./Beach";

/** How long each shift lasts before someone else takes the spot. */
const SHIFT_MS = 40_000;
/** Spots change people at staggered times so they don't all swap at once. */
const STAGGER_MS = 2_500;

const BIKINI = ["#ff4d6d", "#ffb703", "#3a86ff", "#ff70a6", "#06d6a0", "#8338ec", "#ffffff", "#fb5607", "#00b4d8", "#e63946"];

/** Beachgoers who take turns appearing. */
const POOL: Outfit[] = [
  { skin: "#f1c7a5", hair: "#d9b36c", hairStyle: "long", top: { style: "bikini", color: BIKINI[0]! }, bottom: { style: "bikini", color: BIKINI[0]! }, sunglasses: true },
  { skin: "#c68b62", hair: "#1f1a17", hairStyle: "ponytail", top: { style: "bikini", color: BIKINI[1]! }, bottom: { style: "bikini", color: BIKINI[1]! } },
  { skin: "#e0ac83", hair: "#6b4423", hairStyle: "bun", top: { style: "bikini", color: BIKINI[2]! }, bottom: { style: "bikini", color: BIKINI[2]! }, hat: "#f4e1b5" },
  { skin: "#7d5236", hair: "#1f1a17", hairStyle: "long", top: { style: "bikini", color: BIKINI[3]! }, bottom: { style: "bikini", color: BIKINI[3]! }, sunglasses: true },
  { skin: "#f5d6bd", hair: "#b5803a", hairStyle: "ponytail", top: { style: "bikini", color: BIKINI[4]! }, bottom: { style: "bikini", color: BIKINI[4]! } },
  { skin: "#a8714a", hair: "#3b2a1f", hairStyle: "long", top: { style: "bikini", color: BIKINI[5]! }, bottom: { style: "bikini", color: BIKINI[5]! }, hat: "#ffffff" },
  { skin: "#f1c7a5", hair: "#2c2c34", hairStyle: "bun", top: { style: "bikini", color: BIKINI[6]! }, bottom: { style: "bikini", color: BIKINI[6]! }, sunglasses: true },
  { skin: "#e0ac83", hair: "#d9c08c", hairStyle: "long", top: { style: "bikini", color: BIKINI[7]! }, bottom: { style: "bikini", color: BIKINI[7]! } },
  { skin: "#c68b62", hair: "#6b4423", hairStyle: "ponytail", top: { style: "bikini", color: BIKINI[8]! }, bottom: { style: "bikini", color: BIKINI[8]! }, hat: "#f4e1b5" },
  { skin: "#f5d6bd", hair: "#1f1a17", hairStyle: "long", top: { style: "bikini", color: BIKINI[9]! }, bottom: { style: "bikini", color: BIKINI[9]! }, sunglasses: true },
];

type Activity =
  | { kind: "walk"; z: number; from: number; to: number; speed: number }
  | { kind: "swim"; z: number; from: number; to: number; speed: number }
  | { kind: "lie"; x: number; z: number; towel: string; rotation: number }
  | { kind: "wave"; x: number; z: number };

const SLOTS: Activity[] = [
  { kind: "walk", z: SHORE_Z + 2.2, from: -42, to: 42, speed: 1.3 },
  { kind: "walk", z: SHORE_Z + 3.4, from: 40, to: -40, speed: 1.1 },
  { kind: "swim", z: SHORE_Z - 7, from: -30, to: 30, speed: 0.9 },
  { kind: "swim", z: SHORE_Z - 10, from: 25, to: -25, speed: 0.75 },
  { kind: "lie", x: -1, z: SHORE_Z + 9.5, towel: "#ff8fab", rotation: 0.1 },
  { kind: "lie", x: 5, z: SHORE_Z + 9.8, towel: "#80ed99", rotation: -0.15 },
  { kind: "wave", x: -12, z: SHORE_Z + 0.6 },
];

export function Beachgoers() {
  const [shift, setShift] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setShift((s) => s + 1), SHIFT_MS);
    return () => clearInterval(timer);
  }, []);
  return (
    <group>
      {SLOTS.map((slot, i) => (
        <Slot key={i} activity={slot} personIndex={(i * 3 + shift * 4) % POOL.length} delayMs={i * STAGGER_MS} />
      ))}
    </group>
  );
}

/** One spot on the beach; on a swap the old person shrinks away and the new one grows in. */
function Slot({ activity, personIndex, delayMs }: { activity: Activity; personIndex: number; delayMs: number }) {
  const [shown, setShown] = useState(personIndex);
  const leaving = useRef(false);
  const group = useRef<THREE.Group>(null);
  const scale = useRef(0);
  const progress = useRef(Math.random());

  useEffect(() => {
    if (personIndex === shown) return;
    const timer = setTimeout(() => {
      leaving.current = true;
    }, delayMs);
    return () => clearTimeout(timer);
  }, [personIndex, shown, delayMs]);

  useFrame((_, dt) => {
    const g = group.current;
    if (!g) return;
    const target = leaving.current ? 0 : 1;
    scale.current = THREE.MathUtils.damp(scale.current, target, 4, dt);
    if (leaving.current && scale.current < 0.02) {
      leaving.current = false;
      progress.current = Math.random();
      setShown(personIndex);
    }
    g.scale.setScalar(scale.current);

    if (activity.kind === "walk" || activity.kind === "swim") {
      const span = Math.abs(activity.to - activity.from);
      progress.current = (progress.current + (activity.speed * dt) / span) % 1;
      const x = THREE.MathUtils.lerp(activity.from, activity.to, progress.current);
      const y = activity.kind === "walk" ? sandHeight(x, activity.z) : 0;
      g.position.set(x, y, activity.kind === "swim" ? activity.z + Math.sin(x * 0.2) * 1.5 : activity.z);
      g.rotation.y = activity.to > activity.from ? Math.PI / 2 : -Math.PI / 2;
    }
  });

  const outfit = POOL[shown]!;
  const pose: Pose = activity.kind;

  if (activity.kind === "lie") {
    const y = sandHeight(activity.x, activity.z);
    return (
      <group>
        <Towel position={[activity.x, y, activity.z - 0.85]} rotation={activity.rotation} color={activity.towel} />
        <group ref={group} position={[activity.x, y + 0.02, activity.z]} rotation={[0, activity.rotation, 0]}>
          <Person outfit={outfit} pose={pose} phase={personIndex} />
        </group>
      </group>
    );
  }
  if (activity.kind === "wave") {
    // Standing at the waterline, facing the yacht.
    return (
      <group ref={group} position={[activity.x, sandHeight(activity.x, activity.z), activity.z]} rotation={[0, Math.PI, 0]}>
        <Person outfit={outfit} pose={pose} phase={personIndex} />
      </group>
    );
  }
  return (
    <group ref={group}>
      <Person outfit={outfit} pose={pose} phase={personIndex} />
    </group>
  );
}
