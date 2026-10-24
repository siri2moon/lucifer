import { useSyncExternalStore } from "react";
import type { Activity, Task } from "../protocol";
import { useOffice } from "../state/office";
import { childrenIndex, latestByTask } from "../state/workflow";

/** One shared one-second clock for every running timer on screen. */
const listeners = new Set<() => void>();
let timer: ReturnType<typeof setInterval> | null = null;
let now = Date.now();

function subscribe(listener: () => void) {
  listeners.add(listener);
  if (!timer) {
    now = Date.now();
    timer = setInterval(() => {
      now = Date.now();
      for (const l of listeners) l();
    }, 1000);
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && timer) {
      clearInterval(timer);
      timer = null;
    }
  };
}

const noop = () => () => {};

/** The current time, updated every second while `active`; frozen otherwise so idle cards don't re-render. */
export function useNow(active = true): number {
  return useSyncExternalStore(active ? subscribe : noop, () => (active ? now : 0));
}

/** Memoize on the identity of the store slice, so every card shares one computation per update. */
function lastValue<I, O>(fn: (input: I) => O): (input: I) => O {
  let lastIn: I | undefined;
  let lastOut: O | undefined;
  return (input) => {
    if (input !== lastIn) {
      lastIn = input;
      lastOut = fn(input);
    }
    return lastOut!;
  };
}

const indexOf = lastValue<Record<string, Task>, Map<string, Task[]>>(childrenIndex);
const latestOf = lastValue<Activity[], Map<string, Activity>>(latestByTask);

export function useChildrenIndex(): Map<string, Task[]> {
  return indexOf(useOffice((s) => s.tasks));
}

export function useLatestByTask(): Map<string, Activity> {
  return latestOf(useOffice((s) => s.activities));
}
