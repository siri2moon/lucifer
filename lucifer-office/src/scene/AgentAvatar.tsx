import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import type { Agent, AgentStatus } from "../protocol";
import { useOffice } from "../state/office";
import { agentAnchors, deskAnchors, deskBodies, STATUS_COLORS } from "./labels";
import type { Seat } from "./layout";
import { type Outfit, Person } from "./Person";

const SKIN_TONES = ["#f6d7bf", "#f1c7a5", "#e0ac83", "#c68b62", "#a8714a", "#7d5236"];
/** Platinum, honey blonde, golden, silver, chestnut, jet black. */
const HAIR_COLORS = ["#f3e6c4", "#d9a94e", "#f0c869", "#d8d8e2", "#6b4423", "#1f1a17"];
const ROBE = "#fbf6ec";

export function hash(text: string): number {
  let h = 0;
  for (const ch of text) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return h;
}

/**
 * Every employee is an angel: an ivory tunic with gold trim, with wings and a stole in the agent's color.
 * The head of the company is a seraph with two pairs of golden wings. Looks are stable per id.
 */
export function outfitFor(agent: Agent): Outfit {
  const h = hash(agent.id);
  return {
    skin: SKIN_TONES[h % SKIN_TONES.length]!,
    hair: HAIR_COLORS[(h >> 3) % HAIR_COLORS.length]!,
    hairStyle: (["short", "long", "bun", "ponytail", "long"] as const)[(h >> 6) % 5]!,
    top: { style: "tunic", color: ROBE },
    bottom: { style: "pants", color: "#f3ead8" },
    goldSandals: true,
    angel: { tint: agent.appearance.color, seraph: agent.managerId === null },
  };
}

const SCREEN = {
  idle: { color: "#1e293b", intensity: 0.2 },
  thinking: { color: "#8b5cf6", intensity: 1.2 },
  working: { color: "#38bdf8", intensity: 1.8 },
  waiting: { color: "#f59e0b", intensity: 0.9 },
  offline: { color: "#0f172a", intensity: 0 },
} satisfies Record<AgentStatus, { color: string; intensity: number }>;

export function AgentAvatar({ agent, seat }: { agent: Agent; seat: Seat }) {
  const anchor = useRef<THREE.Group>(null);
  const screen = useRef<THREE.MeshStandardMaterial>(null);
  const ring = useRef<THREE.Mesh>(null);
  const body = useRef<THREE.Group>(null);
  const selected = useOffice((s) => s.selectedAgentId === agent.id);
  const selectAgent = useOffice((s) => s.selectAgent);
  const outfit = useMemo(() => outfitFor(agent), [agent.id, agent.appearance.color]);
  const [hovered, setHovered] = useState(false);

  useEffect(() => {
    const obj = anchor.current;
    if (!obj) return;
    agentAnchors.set(agent.id, obj);
    deskAnchors.set(agent.id, obj);
    if (body.current) deskBodies.set(agent.id, body.current);
    return () => {
      if (agentAnchors.get(agent.id) === obj) agentAnchors.delete(agent.id);
      deskAnchors.delete(agent.id);
      deskBodies.delete(agent.id);
    };
  }, [agent.id]);

  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    const s = SCREEN[agent.status];
    if (screen.current) {
      screen.current.emissive.set(s.color);
      const flicker = agent.status === "thinking" ? 0.6 + Math.sin(t * 4) * 0.4 : agent.status === "working" ? 0.9 + Math.sin(t * 17) * 0.1 : 1;
      screen.current.emissiveIntensity = s.intensity * flicker;
    }
    if (ring.current) {
      ring.current.rotation.z = t * 0.8;
      (ring.current.material as THREE.MeshBasicMaterial).opacity = selected ? 0.9 : hovered ? 0.5 : 0;
    }
  });

  const energy = agent.status === "working" ? 1 : agent.status === "thinking" ? 0.35 : 0.1;

  return (
    <group
      ref={anchor}
      position={seat.position}
      rotation={[0, seat.rotation, 0]}
      onClick={(e) => {
        e.stopPropagation();
        selectAgent(selected ? null : agent.id);
      }}
      onPointerOver={(e) => {
        e.stopPropagation();
        setHovered(true);
        document.body.style.cursor = "pointer";
      }}
      onPointerOut={() => {
        setHovered(false);
        document.body.style.cursor = "";
      }}
    >
      {/* Selection ring at the feet */}
      <mesh ref={ring} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.1, 0.25]}>
        <ringGeometry args={[0.85, 1.0, 32, 1, 0, Math.PI * 1.7]} />
        <meshBasicMaterial color={agent.appearance.color} transparent opacity={0} />
      </mesh>

      {/* Cloud seat: no backrest, to leave room for the wings */}
      <CloudSeat />

      {/* The employee, seated facing the desk (+z) */}
      {/* Break time: BreakTime hides this group while the angel is away from the desk. */}
      <group ref={body}>
        <Person outfit={outfit} pose={agent.status === "offline" ? "stand" : "sit"} energy={energy} phase={hash(agent.id) % 100} />
      </group>

      {/* Desk */}
      <group position={[0, 0, 0.75]}>
        <mesh position={[0, 0.74, 0]} castShadow receiveShadow>
          <boxGeometry args={[1.5, 0.06, 0.8]} />
          <meshStandardMaterial color="#e9dcc4" roughness={0.6} />
        </mesh>
        {[-0.65, 0.65].map((x) => (
          <mesh key={x} position={[x, 0.37, 0]} castShadow>
            <boxGeometry args={[0.06, 0.74, 0.7]} />
            <meshStandardMaterial color="#c8b48f" />
          </mesh>
        ))}
        {/* Laptop: the screen color follows the status */}
        <mesh position={[0, 0.785, -0.08]} castShadow>
          <boxGeometry args={[0.5, 0.025, 0.34]} />
          <meshStandardMaterial color="#c0c4cc" metalness={0.7} roughness={0.3} />
        </mesh>
        <mesh position={[0, 0.94, 0.09]} rotation={[0.25, 0, 0]} castShadow>
          <boxGeometry args={[0.5, 0.32, 0.02]} />
          <meshStandardMaterial ref={screen} color="#0f172a" emissive="#000000" />
        </mesh>
        {/* Coconut drink */}
        <mesh position={[0.5, 0.86, 0.1]} castShadow>
          <sphereGeometry args={[0.1, 8, 6]} />
          <meshStandardMaterial color="#7a5a2e" flatShading />
        </mesh>
      </group>

      <StatusFx status={agent.status} />

    </group>
  );
}

/** Effects above the head: rising thoughts while thinking, an hourglass while waiting. */
function StatusFx({ status }: { status: AgentStatus }) {
  const group = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    const g = group.current;
    if (!g) return;
    const t = clock.elapsedTime;
    g.children.forEach((child, i) => {
      const k = (t * 0.6 + i / 3) % 1;
      child.position.set(0.25 + i * 0.12, 1.85 + k * 0.6, 0);
      child.scale.setScalar(0.5 + k * 0.7);
      ((child as THREE.Mesh).material as THREE.MeshStandardMaterial).opacity = 1 - k;
    });
    g.rotation.y = status === "waiting" ? t * 2 : 0;
  });
  if (status !== "thinking" && status !== "waiting") return null;
  const color = STATUS_COLORS[status];
  return (
    <group ref={group}>
      {[0, 1, 2].map((i) => (
        <mesh key={i}>
          {status === "thinking" ? <sphereGeometry args={[0.07, 8, 6]} /> : <octahedronGeometry args={[0.08, 0]} />}
          <meshStandardMaterial color={color} emissive={color} emissiveIntensity={1.4} transparent />
        </mesh>
      ))}
    </group>
  );
}

const CLOUD_PUFFS: [number, number, number, number][] = [
  [0, 0.3, -0.05, 0.2],
  [-0.2, 0.26, -0.02, 0.15],
  [0.2, 0.26, -0.03, 0.15],
  [0.02, 0.24, -0.25, 0.15],
  [-0.1, 0.18, 0.15, 0.13],
  [0.12, 0.17, 0.14, 0.12],
  [0, 0.1, -0.05, 0.16],
];
const cloudGeo = new THREE.SphereGeometry(1, 24, 16);
const cloudMat = new THREE.MeshPhysicalMaterial({ color: "#ffffff", roughness: 0.95, sheen: 1, sheenColor: new THREE.Color("#dbeafe"), emissive: "#eaf4ff", emissiveIntensity: 0.12 });

function CloudSeat() {
  const group = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    if (group.current) group.current.position.y = Math.sin(clock.elapsedTime * 1.2) * 0.012;
  });
  return (
    <group ref={group}>
      {CLOUD_PUFFS.map(([x, y, z, r], i) => (
        <mesh key={i} geometry={cloudGeo} material={cloudMat} position={[x, y, z]} scale={[r * 1.25, r * 0.85, r]} castShadow receiveShadow />
      ))}
    </group>
  );
}
