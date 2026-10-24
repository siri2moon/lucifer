import type { Agent, Department } from "../protocol";

/** The waterline: sand rises above the sea from this z toward the shore (+z). */
export const SHORE_Z = 22;
/** Where the yacht is anchored (hull center, at sea level). */
export const YACHT_POS: [number, number, number] = [0, 0, -4];

export function sandHeight(x: number, z: number): number {
  const slope = (z - SHORE_Z) * 0.09;
  const dunes = z > SHORE_Z + 6 ? Math.sin(x * 0.11) * Math.cos(z * 0.13) * 0.35 * Math.min(1, (z - SHORE_Z - 6) / 8) : 0;
  return slope + dunes;
}

export interface Zone {
  id: string;
  label: string;
  /** Coordinates in the yacht's frame (`onYacht`) or the world's (beach). */
  center: [number, number, number];
  size: [number, number];
  capacity: number;
  onYacht: boolean;
}

/** Work zones in priority order. The first is reserved for the executive team. */
export const ZONES: Zone[] = [
  { id: "sky", label: "Sky deck", center: [3, 8.25, 0], size: [5, 5], capacity: 2, onYacht: true },
  { id: "upper", label: "Upper deck", center: [-6.5, 5.85, 0], size: [9, 7], capacity: 6, onYacht: true },
  { id: "aft", label: "Aft deck", center: [-17.5, 3.25, 0], size: [6.5, 8], capacity: 4, onYacht: true },
  { id: "bow", label: "Bow deck", center: [13.5, 3.25, 0], size: [6, 5.5], capacity: 3, onYacht: true },
  { id: "cabana", label: "Beach cabana", center: [17, 0, SHORE_Z + 7], size: [6, 5], capacity: 4, onYacht: false },
  { id: "bar", label: "Beach bar", center: [-17, 0, SHORE_Z + 9], size: [8, 6], capacity: 6, onYacht: false },
];

export interface Seat {
  agentId: string;
  zone: Zone;
  /** Seat position in the zone's frame (center already added). */
  position: [number, number, number];
  /** Facing, around the y axis. */
  rotation: number;
}

export interface OfficeLayout {
  seats: Record<string, Seat>;
  zoneByDepartment: Record<string, Zone>;
}

/**
 * Assign departments to zones: the head's department goes to the sky deck, the rest
 * go, largest first, into the next free zone with enough capacity.
 */
export function computeLayout(departments: Department[], agents: Agent[]): OfficeLayout {
  const members = new Map<string, Agent[]>();
  for (const d of departments) members.set(d.id, []);
  for (const a of agents) {
    const list = members.get(a.departmentId) ?? [];
    list.push(a);
    members.set(a.departmentId, list);
  }

  const headDept = agents.find((a) => a.managerId === null)?.departmentId;
  const order = [...members.keys()].sort((a, b) => {
    if (a === headDept) return -1;
    if (b === headDept) return 1;
    return (members.get(b)?.length ?? 0) - (members.get(a)?.length ?? 0);
  });

  const free = [...ZONES];
  const zoneByDepartment: Record<string, Zone> = {};
  const seats: Record<string, Seat> = {};

  for (const deptId of order) {
    const people = members.get(deptId) ?? [];
    if (people.length === 0) continue;
    const idx = free.findIndex((z) => z.capacity >= people.length);
    const zone = idx >= 0 ? free.splice(idx, 1)[0]! : free.shift() ?? ZONES[ZONES.length - 1]!;
    zoneByDepartment[deptId] = zone;
    // People with reports in the department sit first (front desk).
    const sorted = [...people].sort((a, b) => Number(isManagerOf(b, people)) - Number(isManagerOf(a, people)));
    sorted.forEach((agent, i) => {
      seats[agent.id] = { agentId: agent.id, zone, ...deskSpot(zone, i, sorted.length) };
    });
  }
  return { seats, zoneByDepartment };
}

function isManagerOf(agent: Agent, people: Agent[]): boolean {
  return people.some((p) => p.managerId === agent.id);
}

function deskSpot(zone: Zone, index: number, count: number): { position: [number, number, number]; rotation: number } {
  const [w, d] = zone.size;
  // Prefer a single row (desks >= 2.2 apart) so name tags don't overlap from an angle.
  const cols = Math.min(count, Math.max(1, Math.floor((w - 1) / 2.2) + 1));
  const rows = Math.ceil(count / cols);
  const col = index % cols;
  const row = Math.floor(index / cols);
  const dx = cols > 1 ? Math.min(2.8, (w - 2) / (cols - 1)) : 0;
  const dz = rows > 1 ? Math.min(2.8, (d - 2) / (rows - 1)) : 0;
  const x = zone.center[0] + (col - (cols - 1) / 2) * dx;
  const z = zone.center[2] + (row - (rows - 1) / 2) * dz;
  const y = zone.onYacht ? zone.center[1] : sandHeight(x, z);
  // Face the beach (+z) so the camera sees faces.
  return { position: [x, y, z], rotation: 0 };
}
