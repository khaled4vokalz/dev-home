import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { usePersistedSet } from "./usePersistedSet";

describe("usePersistedSet", () => {
  beforeEach(() => localStorage.clear());

  it("toggles items and restores them on the next mount", () => {
    const first = renderHook(() => usePersistedSet("k"));
    act(() => first.result.current[2]("a"));
    act(() => first.result.current[2]("b"));
    act(() => first.result.current[2]("a"));
    expect([...first.result.current[0]]).toEqual(["b"]);
    first.unmount();

    const second = renderHook(() => usePersistedSet("k"));
    expect([...second.result.current[0]]).toEqual(["b"]);
  });

  it("ignores malformed storage", () => {
    localStorage.setItem("k", "{not json");
    const { result } = renderHook(() => usePersistedSet("k"));
    expect(result.current[0].size).toBe(0);
  });

  it("keeps a null key in memory only", () => {
    const { result } = renderHook(() => usePersistedSet(null));
    act(() => result.current[2]("a"));
    expect(result.current[0].has("a")).toBe(true);
    expect(localStorage.length).toBe(0);
  });
});
