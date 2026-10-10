import { describe, it, expect } from "vitest";
import { getShortcutTitle } from "./useKeyboardShortcuts";

describe("getShortcutTitle", () => {
  it("gives Workday no shortcut (Cmd/Ctrl+W closes the window)", () => {
    expect(getShortcutTitle("workday", "Workday")).toBe("Workday");
  });
});
