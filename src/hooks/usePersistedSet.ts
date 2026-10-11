import { useCallback, useEffect, useState } from "react";

function readSet<T extends string>(key: string | null): Set<T> {
  if (!key) return new Set();
  try {
    const saved = JSON.parse(localStorage.getItem(key) ?? "[]");
    return Array.isArray(saved) ? new Set(saved) : new Set();
  } catch {
    return new Set();
  }
}

/**
 * A Set of string ids mirrored to localStorage under `key` (e.g. collapsed
 * sections or ticket groups). Pass `null` to keep the state in memory only.
 * One owner per key: two live instances on the same key would overwrite each
 * other, so lift the state up and pass `has`/`toggle` down instead.
 */
export function usePersistedSet<T extends string = string>(key: string | null) {
  const [items, setItems] = useState<Set<T>>(() => readSet<T>(key));

  useEffect(() => {
    if (!key) return;
    try {
      localStorage.setItem(key, JSON.stringify([...items]));
    } catch {
      /* quota exceeded */
    }
  }, [items, key]);

  const toggle = useCallback((item: T) => {
    setItems((prev) => {
      const next = new Set(prev);
      if (next.has(item)) {
        next.delete(item);
      } else {
        next.add(item);
      }
      return next;
    });
  }, []);

  return [items, setItems, toggle] as const;
}
