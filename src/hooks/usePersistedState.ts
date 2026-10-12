import { useEffect, useState } from "react";

function read<T>(key: string, initial: T): T {
  try {
    const saved = localStorage.getItem(key);
    return saved === null ? initial : (JSON.parse(saved) as T);
  } catch {
    return initial;
  }
}

/**
 * useState mirrored to localStorage under `key` as JSON, so the value
 * survives switching views and reloads (e.g. PR filters). Same one-owner-per-key
 * caveat as usePersistedSet.
 */
export function usePersistedState<T>(key: string, initial: T) {
  const [value, setValue] = useState<T>(() => read(key, initial));

  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      /* quota exceeded */
    }
  }, [key, value]);

  return [value, setValue] as const;
}
