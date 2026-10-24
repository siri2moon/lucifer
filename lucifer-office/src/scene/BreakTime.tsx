import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import type { Agent } from "../protocol";
import { useOffice } from "../state/office";
import { hash, outfitFor } from "./AgentAvatar";
import { labelTexture, Towel } from "./Beach";
import { agentAnchors, deskAnchors, deskBodies } from "./labels";
import { SHORE_Z, sandHeight } from "./layout";
import { type Pose, Person } from "./Person";

/**
 * Break time: when the engine is paused, the angels leave their desks, fly ashore and each
 * do their own thing. When the company clocks back in, they fly back to their seats.
 *
 * Desks sit on the bobbing yacht, so the angel on break is a separate character in world
 * coordinates; AgentAvatar registers each seat and desk body (deskAnchors, deskBodies).
 */

type Activity = "coffee" | "swim" | "sunbathe" | "stroll" | "chat" | "soar";
/** Rotated so everyone gets an activity, even in a large company. */
const ROTATION: Activity[] = ["coffee", "swim", "sunbathe", "stroll", "chat", "soar", "coffee", "chat", "swim", "sunbathe"];

const BAR = new THREE.Vector3(-20, 0, SHORE_Z + 10);
const CHAT = new THREE.Vector3(-12, 0, SHORE_Z + 5.5);
const SUN = new THREE.Vector3(-9, 0, SHORE_Z + 12.5);
const SOAR = new THREE.Vector3(0, 13, SHORE_Z - 4);

interface Plan {
  activity: Activity;
  pose: Pose;
  /** Position and heading at time t (seconds) while on break. */
  at(t: number, out: THREE.Vector3): number;
  prop?: "cup";
  towel?: string;
}

function onSand(x: number, z: number, out: THREE.Vector3): THREE.Vector3 {
  return out.set(x, sandHeight(x, z), z);
}

/** The break plan for the `slot`-th person sharing an activity. */
function planFor(activity: Activity, slot: number, seed: number): Plan {
  switch (activity) {
    case "coffee": {
      // Stand in a row in front of the bar, facing it.
      const x = BAR.x - 1.6 + slot * 1.1;
      return { activity, pose: "sip", prop: "cup", at: (_, out) => (onSand(x, BAR.z + 2.1, out), Math.PI) };
    }
    case "chat": {
      // Stand in a circle, facing the middle.
      const angle = slot * 2.1 + 0.4;
      const x = CHAT.x + Math.sin(angle) * 1.1;
      const z = CHAT.z + Math.cos(angle) * 1.1;
      return { activity, pose: slot % 3 === 1 ? "wave" : "stand", at: (_, out) => (onSand(x, z, out), angle + Math.PI) };
    }
    case "sunbathe": {
      const x = SUN.x + slot * 1.6;
      return { activity, pose: "lie", towel: slot % 2 ? "#a5d8ff" : "#ffd6a5", at: (_, out) => (onSand(x, SUN.z, out).setY(out.y + 0.02), 0) };
    }
    case "swim": {
      // Swim in circles just off the shore.
      const cx = -6 + slot * 9;
      const cz = SHORE_Z - 5.5;
      const r = 2.2 + (seed % 3) * 0.4;
      return {
        activity,
        pose: "swim",
        at: (t, out) => {
          const a = t * 0.35 + seed;
          out.set(cx + Math.cos(a) * r, 0, cz + Math.sin(a) * r);
          return Math.atan2(-Math.sin(a), Math.cos(a)); // tangent heading
        },
      };
    }
    case "stroll": {
      // Stroll along the waterline and turn back at each end.
      const z = SHORE_Z + 1.4 + slot * 0.9;
      const span = 9;
      const cx = -2 + slot * 6;
      return {
        activity,
        pose: "walk",
        at: (t, out) => {
          const u = ((t * 1.1) / span + seed * 0.1) % 2;
          const forward = u < 1;
          const x = cx - span / 2 + span * (forward ? u : 2 - u);
          onSand(x, z, out);
          return forward ? Math.PI / 2 : -Math.PI / 2;
        },
      };
    }
    case "soar": {
      // Circle in the sky, each at their own height.
      const r = 6 + slot * 2;
      const h = SOAR.y + slot * 1.5;
      return {
        activity,
        pose: "fly",
        at: (t, out) => {
          const a = t * 0.45 + seed;
          out.set(SOAR.x + Math.cos(a) * r, h + Math.sin(t * 0.8) * 0.6, SOAR.z + Math.sin(a) * r);
          return Math.atan2(-Math.sin(a), Math.cos(a));
        },
      };
    }
  }
}

export function BreakTime({ agents }: { agents: Agent[] }) {
  const engine = useOffice((s) => s.engine);
  const onBreak = engine !== null && !engine.running;
  const plans = useMemo(() => {
    const counts = new Map<Activity, number>();
    return agents.map((agent, i) => {
      const activity = ROTATION[i % ROTATION.length]!;
      const slot = counts.get(activity) ?? 0;
      counts.set(activity, slot + 1);
      return { agent, plan: planFor(activity, slot, hash(agent.id) % 7) };
    });
  }, [agents]);

  return (
    <group>
      <CoffeeBar />
      {plans.map(({ agent, plan }) => (
        <BreakAngel key={agent.id} agent={agent} plan={plan} onBreak={onBreak} />
      ))}
    </group>
  );
}

type Phase = "desk" | "out" | "break" | "back";
const FLY_SPEED = 9;

function BreakAngel({ agent, plan, onBreak }: { agent: Agent; plan: Plan; onBreak: boolean }) {
  const group = useRef<THREE.Group>(null);
  const outfit = useMemo(() => outfitFor(agent), [agent]);
  const [pose, setPose] = useState<Pose | null>(null);
  const state = useRef({ phase: "desk" as Phase, progress: 0, delay: 0, breakT: 0, initialized: false, duration: 1 });
  const from = useMemo(() => new THREE.Vector3(), []);
  const to = useMemo(() => new THREE.Vector3(), []);
  const pos = useMemo(() => new THREE.Vector3(), []);
  const prev = useMemo(() => new THREE.Vector3(), []);
  const seed = hash(agent.id);

  useEffect(() => {
    // On unmount (layout change, disconnect): put the character back at the desk.
    return () => {
      const desk = deskAnchors.get(agent.id);
      const body = deskBodies.get(agent.id);
      if (body) body.visible = true;
      if (desk) agentAnchors.set(agent.id, desk);
    };
  }, [agent.id]);

  useFrame((_, dt) => {
    const g = group.current;
    const desk = deskAnchors.get(agent.id);
    const body = deskBodies.get(agent.id);
    if (!g || !desk || !body) return;
    const s = state.current;
    const step = Math.min(dt, 0.1);

    const leave = () => {
      body.visible = false;
      g.visible = true;
      agentAnchors.set(agent.id, g);
    };
    const arriveAtDesk = () => {
      body.visible = true;
      g.visible = false;
      agentAnchors.set(agent.id, desk);
      s.phase = "desk";
      setPose(null);
    };
    const startFlight = (phase: "out" | "back") => {
      // Leaving the desk starts from the seat; mid-flight or on break starts from the current position.
      if (s.phase === "desk") desk.getWorldPosition(from);
      else from.copy(g.position);
      g.position.copy(from);
      if (phase === "out") plan.at(0, to);
      else desk.getWorldPosition(to);
      s.phase = phase;
      s.progress = 0;
      s.duration = Math.max(1.6, from.distanceTo(to) / FLY_SPEED);
      setPose("fly");
    };

    // Page opened during a break: place everyone at their spot directly, without flying.
    if (!s.initialized) {
      s.initialized = true;
      if (onBreak) {
        leave();
        s.phase = "break";
        s.breakT = seed % 10;
        setPose(plan.pose);
      } else {
        g.visible = false;
      }
    }

    switch (s.phase) {
      case "desk":
        if (onBreak) {
          // Stagger departures a little.
          s.delay += step;
          if (s.delay > (seed % 25) / 10) {
            s.delay = 0;
            leave();
            startFlight("out");
          }
        } else {
          s.delay = 0;
        }
        return;
      case "out":
      case "back": {
        if (s.phase === "back") desk.getWorldPosition(to); // the desk keeps bobbing with the yacht
        if (s.phase === "out" && !onBreak) return startFlight("back");
        if (s.phase === "back" && onBreak) return startFlight("out");
        s.progress = Math.min(1, s.progress + step / s.duration);
        const p = s.progress;
        const ease = p * p * (3 - 2 * p);
        prev.copy(g.position);
        pos.lerpVectors(from, to, ease);
        // Fly in an arc: highest halfway.
        pos.y += Math.sin(Math.PI * p) * (3 + from.distanceTo(to) * 0.12);
        g.position.copy(pos);
        const dx = to.x - from.x;
        const dz = to.z - from.z;
        if (dx * dx + dz * dz > 0.01) g.rotation.set(0, Math.atan2(dx, dz), 0);
        if (p >= 1) {
          if (s.phase === "out") {
            s.phase = "break";
            s.breakT = 0;
            setPose(plan.pose);
          } else {
            arriveAtDesk();
          }
        }
        return;
      }
      case "break": {
        if (!onBreak) return startFlight("back");
        s.breakT += step;
        const heading = plan.at(s.breakT, pos);
        g.position.copy(pos);
        g.rotation.set(0, heading, 0);
        return;
      }
    }
  });

  return (
    <group ref={group} visible={false}>
      {pose && <Person outfit={outfit} pose={pose} energy={0.2} phase={seed % 100} prop={pose === "sip" ? plan.prop : undefined} />}
      {pose === "lie" && plan.towel && <Towel position={[0, -0.02, -0.85]} color={plan.towel} />}
    </group>
  );
}

// ---------- Beach coffee bar ----------

function CoffeeBar() {
  const y = sandHeight(BAR.x, BAR.z);
  const sign = useMemo(() => labelTexture("☕ Heaven's Brew", "#ffffff", "rgba(120, 72, 40, 0.95)"), []);
  return (
    <group position={[BAR.x, y, BAR.z]}>
      {/* Counter */}
      <mesh position={[0, 0.55, 0.35]} castShadow receiveShadow>
        <boxGeometry args={[4.4, 1.1, 0.8]} />
        <meshStandardMaterial color="#c08552" roughness={0.8} />
      </mesh>
      <mesh position={[0, 1.13, 0.4]} castShadow>
        <boxGeometry args={[4.7, 0.08, 1.05]} />
        <meshStandardMaterial color="#f3e9dc" roughness={0.4} />
      </mesh>
      {/* Coffee machine and cups */}
      <mesh position={[-1.3, 1.45, 0.25]} castShadow>
        <boxGeometry args={[0.6, 0.55, 0.45]} />
        <meshStandardMaterial color="#d1d5db" metalness={0.8} roughness={0.25} />
      </mesh>
      {[-0.2, 0.3, 0.8, 1.3].map((x) => (
        <mesh key={x} position={[x, 1.24, 0.6]} castShadow>
          <cylinderGeometry args={[0.07, 0.06, 0.14, 16]} />
          <meshStandardMaterial color="#fffaf0" roughness={0.3} />
        </mesh>
      ))}
      {/* Thatched roof on four posts */}
      {[-2, 2].flatMap((x) =>
        [-0.5, 1.2].map((z) => (
          <mesh key={`${x}${z}`} position={[x, 1.6, z]} castShadow>
            <cylinderGeometry args={[0.08, 0.1, 3.2, 8]} />
            <meshStandardMaterial color="#8b6239" />
          </mesh>
        )),
      )}
      <mesh position={[0, 3.55, 0.35]} castShadow>
        <coneGeometry args={[3.6, 1.3, 8]} />
        <meshStandardMaterial color="#d9b26a" roughness={1} flatShading />
      </mesh>
      <mesh position={[0, 2.75, 1.3]}>
        <planeGeometry args={[2.6, 0.65]} />
        <meshBasicMaterial map={sign} transparent />
      </mesh>
      {/* Stools */}
      {[-1.6, -0.5, 0.6, 1.7].map((x) => (
        <mesh key={x} position={[x, 0.35, 1.25]} castShadow>
          <cylinderGeometry args={[0.22, 0.18, 0.7, 12]} />
          <meshStandardMaterial color="#f3e9dc" />
        </mesh>
      ))}
    </group>
  );
}
