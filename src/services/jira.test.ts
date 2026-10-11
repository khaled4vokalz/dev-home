import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { postIssuesBulk } from "../api/jira";
import { fetchIssueDetail } from "./jira";
import { SETTINGS_EVENT } from "./config";

vi.mock("../api/jira", () => ({
  getIssues: vi.fn(),
  getJiraMentions: vi.fn(),
  postIssuesBulk: vi.fn(),
}));

const issue = (key: string, summary = "s") => ({ key, summary }) as never;

describe("fetchIssueDetail", () => {
  beforeEach(() => {
    window.dispatchEvent(new Event(SETTINGS_EVENT));
    vi.mocked(postIssuesBulk).mockReset();
    vi.mocked(postIssuesBulk).mockResolvedValue({ issues: [issue("A-1")] });
  });
  afterEach(() => vi.useRealTimers());

  it("serves repeat opens from cache within an hour", async () => {
    vi.useFakeTimers();
    await fetchIssueDetail("A-1");
    vi.advanceTimersByTime(59 * 60 * 1000);
    await fetchIssueDetail("A-1");
    expect(postIssuesBulk).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(2 * 60 * 1000);
    await fetchIssueDetail("A-1");
    expect(postIssuesBulk).toHaveBeenCalledTimes(2);
  });

  it("refetches when forced and caches the fresh result", async () => {
    await fetchIssueDetail("A-1");
    vi.mocked(postIssuesBulk).mockResolvedValue({ issues: [issue("A-1", "new")] });
    expect(await fetchIssueDetail("A-1", { force: true })).toMatchObject({ summary: "new" });
    expect(await fetchIssueDetail("A-1")).toMatchObject({ summary: "new" });
    expect(postIssuesBulk).toHaveBeenCalledTimes(2);
  });

  it("does not cache failures or missing issues", async () => {
    vi.mocked(postIssuesBulk).mockRejectedValueOnce(new Error("boom"));
    await expect(fetchIssueDetail("A-1")).rejects.toThrow("boom");
    vi.mocked(postIssuesBulk).mockResolvedValueOnce({ issues: [] });
    expect(await fetchIssueDetail("A-1")).toBeNull();
    expect(await fetchIssueDetail("A-1")).toMatchObject({ key: "A-1" });
    expect(postIssuesBulk).toHaveBeenCalledTimes(3);
  });

  it("clears on settings change", async () => {
    await fetchIssueDetail("A-1");
    window.dispatchEvent(new Event(SETTINGS_EVENT));
    await fetchIssueDetail("A-1");
    expect(postIssuesBulk).toHaveBeenCalledTimes(2);
  });
});
