import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import type { AgentStatus } from "../protocol";
import { useActivityText, useLocalize, useT } from "../i18n";
import { BUBBLE_MS, useOffice } from "../state/office";

/**
 * Agent name tags and speech bubbles are plain DOM, below the panels.
 * Every frame `LabelProjector` (inside the Canvas) projects each agent's 3D position to the
 * screen and writes it straight into the element's style, without a React render.
 */

/** Each agent's 3D anchor (set by AgentAvatar). */
export const agentAnchors = new Map<string, THREE.Object3D>();
/** Each agent's seat and desk body (set by AgentAvatar, used for break time). */
export const deskAnchors = new Map<string, THREE.Object3D>();
export const deskBodies = new Map<string, THREE.Object3D>();
const labelElements = new Map<string, HTMLDivElement>();
const LABEL_HEIGHT = 2.35;

export const STATUS_COLORS: Record<AgentStatus, string> = {
  idle: "#94a3b8",
  thinking: "#a78bfa",
  working: "#38bdf8",
  waiting: "#fbbf24",
  offline: "#475569",
};

export function LabelProjector() {
  const { camera, size } = useThree();
  const v = useMemo(() => new THREE.Vector3(), []);
  useFrame(() => {
    for (const [id, el] of labelElements) {
      const anchor = agentAnchors.get(id);
      if (!anchor) {
        el.style.display = "none";
        continue;
      }
      anchor.getWorldPosition(v);
      v.y += LABEL_HEIGHT;
      const dist = camera.position.distanceTo(v);
      v.project(camera);
      if (v.z > 1) {
        el.style.display = "none";
        continue;
      }
      const x = ((v.x + 1) / 2) * size.width;
      const y = ((1 - v.y) / 2) * size.height;
      // Shrink a little with distance, but never grow when close to the camera.
      const scale = THREE.MathUtils.clamp(48 / dist, 0.7, 1.1);
      el.style.display = "";
      el.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0) translate(-50%, -100%) scale(${scale.toFixed(3)})`;
      el.style.zIndex = String(Math.round(1000 - dist));
    }
  });
  return null;
}

export function AgentLabels() {
  const order = useOffice((s) => s.agentOrder);
  return (
    <div className="labels">
      {order.map((id) => (
        <AgentLabel key={id} agentId={id} />
      ))}
    </div>
  );
}

function AgentLabel({ agentId }: { agentId: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const agent = useOffice((s) => s.agents[agentId]);
  const bubble = useOffice((s) => s.bubbles[agentId]);
  const selected = useOffice((s) => s.selectedAgentId === agentId);
  const currentTask = useOffice((s) => (agent?.currentTaskId ? s.tasks[agent.currentTaskId] : undefined));
  const selectAgent = useOffice((s) => s.selectAgent);
  const showBubble = useBubbleVisible(bubble?.at);
  const t = useT();
  const localize = useLocalize();
  const describe = useActivityText();

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    labelElements.set(agentId, el);
    return () => {
      labelElements.delete(agentId);
    };
  }, [agentId]);

  if (!agent) return null;
  const color = STATUS_COLORS[agent.status];
  return (
    <div ref={ref} className="label" style={{ display: "none" }}>
      {showBubble && bubble ? (
        <div className={`bubble bubble--${bubble.activity.kind}`}>{truncate(describe(bubble.activity), 140)}</div>
      ) : (
        selected && currentTask && <div className="bubble bubble--task">📌 {truncate(currentTask.title, 80)}</div>
      )}
      <button
        className={`agent-tag${selected ? " is-selected" : ""}`}
        style={{ borderColor: agent.appearance.color }}
        onClick={() => selectAgent(selected ? null : agentId)}
        title={`${localize(agent, "title")} · ${t.agentStatus[agent.status]}`}
      >
        <span className="agent-tag__emoji">{agent.appearance.emoji}</span>
        <span className="agent-tag__name">{agent.name}</span>
        <span className="agent-tag__dot" style={{ background: color, boxShadow: `0 0 8px ${color}` }} />
      </button>
    </div>
  );
}

function useBubbleVisible(at: number | undefined): boolean {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    if (!at) return;
    const remaining = at + BUBBLE_MS - Date.now();
    if (remaining <= 0) return;
    setVisible(true);
    const timer = setTimeout(() => setVisible(false), remaining);
    return () => clearTimeout(timer);
  }, [at]);
  return visible;
}

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max)}…` : text;
}
