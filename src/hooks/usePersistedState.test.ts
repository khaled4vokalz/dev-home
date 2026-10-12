import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { usePersistedState } from "./usePersistedState";

describe("usePersistedState", () => {
  beforeEach(() => localStorage.clear());

  it("restores the value on the next mount", () => {
    const first = renderHook(() => usePersistedState<string[]>("k", []));
    act(() => first.result.current[1](["repo-a"]));
    first.unmount();

    const second = renderHook(() => usePersistedState<string[]>("k", []));
    expect(second.result.current[0]).toEqual(["repo-a"]);
  });

  it("falls back to the initial value on malformed storage", () => {
    localStorage.setItem("k", "{nope");
    const { result } = renderHook(() => usePersistedState("k", "x"));
    expect(result.current[0]).toBe("x");
  });
});
