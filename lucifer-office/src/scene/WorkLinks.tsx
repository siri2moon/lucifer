import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import type { Activity, Task } from "../protocol";
import { useOffice } from "../state/office";
import { childrenIndex, descendants, rootOf } from "../state/workflow";
import { agentAnchors } from "./labels";

/**
 * The flow of work drawn on the yacht.
 * - A link arcs from a manager to each report holding one of their open subtasks, with light
 *   flowing down it while the report works. Links of the selected mission glow brighter.
 * - A comet flies along the arc when work is handed down (delegated) and back up (completed).
 */

const HEAD_HEIGHT = 1.7;
const FLOW_DOTS = 4;
const PACKET_MS = 1600;
/** Ignore events older than this when they arrive, e.g. replayed after a reconnect. */
const FRESH_MS = 4000;

interface Link {
  key: string;
  from: string;
  to: string;
  color: string;
  /** The report is actively working, so light flows; otherwise the link just glows faintly. */
  flowing: boolean;
  highlighted: boolean;
}

interface Packet {
  id: string;
  from: string;
  to: string;
  color: string;
  start: number;
}

const tmpA = new THREE.Vector3();
const tmpB = new THREE.Vector3();
const tmpMid = new THREE.Vector3();

/** The arc between two agents, from above one head to above the other. */
function arc(from: string, to: string, curve: THREE.QuadraticBezierCurve3): boolean {
  const a = agentAnchors.get(from);
  const b = agentAnchors.get(to);
  if (!a || !b) return false;
  a.getWorldPosition(tmpA).y += HEAD_HEIGHT;
  b.getWorldPosition(tmpB).y += HEAD_HEIGHT;
  const lift = 1.2 + tmpA.distanceTo(tmpB) * 0.3;
  tmpMid.lerpVectors(tmpA, tmpB, 0.5).y += lift;
  curve.v0.copy(tmpA);
  curve.v1.copy(tmpMid);
  curve.v2.copy(tmpB);
  return true;
}

export function WorkLinks() {
  const tasks = useOffice((s) => s.tasks);
  const agents = useOffice((s) => s.agents);
  const selectedTaskId = useOffice((s) => s.selectedTaskId);
  const activities = useOffice((s) => s.activities);
  // On break time the angels leave their desks and no work moves, so nothing is drawn.
  const running = useOffice((s) => s.engine?.running ?? false);

  const links = useMemo(() => {
    const index = childrenIndex(tasks);
    const selectedRoot = selectedTaskId ? rootOf(selectedTaskId, tasks) : undefined;
    const highlighted = new Set(selectedRoot ? descendants(selectedRoot.id, tasks, index).map((t) => t.id) : []);
    const byPair = new Map<string, Link>();
    for (const task of Object.values(tasks)) {
      if (!task.parentId || !["todo", "in_progress", "waiting"].includes(task.status)) continue;
      const parent = tasks[task.parentId];
      if (!parent || parent.assigneeId === task.assigneeId) continue;
      const key = `${parent.assigneeId}>${task.assigneeId}`;
      const prev = byPair.get(key);
      byPair.set(key, {
        key,
        from: parent.assigneeId,
        to: task.assigneeId,
        color: agents[task.assigneeId]?.appearance.color ?? "#38bdf8",
        flowing: (prev?.flowing ?? false) || task.status === "in_progress",
        highlighted: (prev?.highlighted ?? false) || highlighted.has(task.id),
      });
    }
    return [...byPair.values()];
  }, [tasks, agents, selectedTaskId]);

  // Comets for hand-offs: delegated goes down to the report, completed goes back up to the manager.
  const [packets, setPackets] = useState<Packet[]>([]);
  const lastSeen = useRef<string | null>(null);
  const timers = useRef(new Set<ReturnType<typeof setTimeout>>());
  useEffect(() => {
    const pending = timers.current;
    return () => pending.forEach(clearTimeout);
  }, []);
  useEffect(() => {
    const fresh: Packet[] = [];
    // Walk back from the newest activity until the last one already handled.
    for (let i = activities.length - 1; i >= 0; i--) {
      const a = activities[i]!;
      if (a.id === lastSeen.current) break;
      const packet = toPacket(a, tasks);
      if (packet) fresh.push(packet);
    }
    lastSeen.current = activities.at(-1)?.id ?? null;
    if (fresh.length === 0) return;
    setPackets((list) => [...list, ...fresh]);
    // Not cleared on the next activity: each batch of comets removes itself once it has landed.
    const timer = setTimeout(() => {
      timers.current.delete(timer);
      setPackets((list) => list.filter((p) => !fresh.includes(p)));
    }, PACKET_MS + 200);
    timers.current.add(timer);
    // Tasks are read only to find the manager of a completed subtask.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activities]);

  if (!running) return null;
  return (
    <group>
      {links.map((link) => (
        <WorkLink key={link.key} link={link} />
      ))}
      {packets.map((p) => (
        <Comet key={p.id} packet={p} />
      ))}
    </group>
  );
}

function toPacket(a: Activity, tasks: Record<string, Task>): Packet | null {
  if (Date.now() - Date.parse(a.at) > FRESH_MS || !a.agentId) return null;
  if (a.kind === "task_delegated" && a.targetAgentId && a.targetAgentId !== a.agentId) {
    return { id: a.id, from: a.agentId, to: a.targetAgentId, color: "#fde68a", start: performance.now() };
  }
  if (a.kind === "task_completed" && a.taskId) {
    const task = tasks[a.taskId];
    const parent = task?.parentId ? tasks[task.parentId] : undefined;
    if (parent && parent.assigneeId !== a.agentId) {
      return { id: a.id, from: a.agentId, to: parent.assigneeId, color: "#6ee7b7", start: performance.now() };
    }
  }
  return null;
}

/** White dashes on a transparent strip; scrolled along each link to show the direction of work. */
let stripes: THREE.CanvasTexture | null = null;
function stripeTexture(): THREE.CanvasTexture {
  if (stripes) return stripes;
  const canvas = document.createElement("canvas");
  canvas.width = 64;
  canvas.height = 4;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "rgba(255,255,255,0.35)";
  ctx.fillRect(0, 0, 64, 4);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, 36, 4);
  stripes = new THREE.CanvasTexture(canvas);
  stripes.wrapS = THREE.RepeatWrapping;
  return stripes;
}

function WorkLink({ link }: { link: Link }) {
  const curve = useMemo(() => new THREE.QuadraticBezierCurve3(new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()), []);
  const group = useRef<THREE.Group>(null);
  const dots = useRef<THREE.Group>(null);
  const core = useRef<THREE.MeshBasicMaterial>(null);
  const glow = useRef<THREE.MeshBasicMaterial>(null);
  const last = useRef("");
  const [shape, setShape] = useState<{ curve: THREE.QuadraticBezierCurve3; length: number } | null>(null);
  const texture = useMemo(() => stripeTexture().clone(), []);
  const tubes = useMemo(() => {
    if (!shape) return null;
    return {
      core: new THREE.TubeGeometry(shape.curve, 48, 0.07, 6, false),
      glow: new THREE.TubeGeometry(shape.curve, 48, 0.2, 8, false),
    };
  }, [shape]);
  useEffect(
    () => () => {
      tubes?.core.dispose();
      tubes?.glow.dispose();
    },
    [tubes],
  );
  useEffect(() => () => texture.dispose(), [texture]);

  useFrame(({ clock }, dt) => {
    const visible = arc(link.from, link.to, curve);
    if (group.current) group.current.visible = visible;
    if (!visible) return;
    // Rebuild the tube only when an end moved (agents fly off on break time).
    const key = [curve.v0, curve.v2].map((v) => `${v.x.toFixed(1)},${v.y.toFixed(1)},${v.z.toFixed(1)}`).join("|");
    if (key !== last.current) {
      last.current = key;
      const copy = new THREE.QuadraticBezierCurve3(curve.v0.clone(), curve.v1.clone(), curve.v2.clone());
      setShape({ curve: copy, length: copy.getLength() });
    }
    const t = clock.elapsedTime;
    const strength = link.highlighted ? 1 : 0.65;
    if (core.current) core.current.opacity = (link.flowing ? 0.95 : 0.5) * strength;
    if (glow.current) glow.current.opacity = (link.flowing ? 0.22 + Math.sin(t * 3) * 0.06 : 0.1) * strength;
    // Dashes march from the manager to the report while the report works.
    if (link.flowing) texture.offset.x -= dt * 1.2;
    if (dots.current) {
      dots.current.visible = link.flowing;
      dots.current.children.forEach((dot, i) => {
        const k = (t * 0.3 + i / FLOW_DOTS) % 1;
        curve.getPoint(k, dot.position);
        // Fade in at the manager, fade out at the report.
        dot.scale.setScalar((link.highlighted ? 1.3 : 1) * Math.sin(k * Math.PI));
      });
    }
  });

  if (shape) texture.repeat.x = Math.max(1, shape.length / 1.2);
  return (
    <group ref={group}>
      {tubes && (
        <>
          <mesh geometry={tubes.core} renderOrder={2}>
            <meshBasicMaterial ref={core} color={link.color} map={texture} transparent depthWrite={false} toneMapped={false} />
          </mesh>
          <mesh geometry={tubes.glow} renderOrder={1}>
            <meshBasicMaterial ref={glow} color={link.color} transparent depthWrite={false} toneMapped={false} />
          </mesh>
        </>
      )}
      <group ref={dots}>
        {new Array(FLOW_DOTS).fill(0).map((_, i) => (
          <mesh key={i}>
            <sphereGeometry args={[0.2, 12, 10]} />
            <meshBasicMaterial color="#ffffff" toneMapped={false} />
          </mesh>
        ))}
      </group>
    </group>
  );
}

/** A bright comet with a short tail, flying once along the arc. */
function Comet({ packet }: { packet: Packet }) {
  const curve = useMemo(() => new THREE.QuadraticBezierCurve3(new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()), []);
  const group = useRef<THREE.Group>(null);
  useFrame(() => {
    const g = group.current;
    if (!g) return;
    const k = (performance.now() - packet.start) / PACKET_MS;
    if (k >= 1 || !arc(packet.from, packet.to, curve)) {
      g.visible = false;
      return;
    }
    g.visible = true;
    const eased = k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2;
    g.children.forEach((child, i) => {
      curve.getPoint(Math.max(0, eased - i * 0.03), child.position);
      child.scale.setScalar(1 - i * 0.18);
    });
  });
  return (
    <group ref={group} visible={false}>
      {[0, 1, 2, 3, 4].map((i) => (
        <mesh key={i}>
          <sphereGeometry args={[i === 0 ? 0.26 : 0.18, 12, 10]} />
          <meshBasicMaterial color={packet.color} toneMapped={false} transparent opacity={i === 0 ? 1 : 0.6 - i * 0.1} />
        </mesh>
      ))}
    </group>
  );
}
