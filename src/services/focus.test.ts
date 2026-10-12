import { describe, expect, it } from "vitest";
import type { GitHubComment, JiraComment } from "../types";
import { mergeSources, type MergeInput } from "./focus";

const NOW = new Date("2026-10-12T10:00:00Z").getTime();

const gh = (id: number, pr: number, updated: string, login = "abu"): GitHubComment => ({
  id,
  html_url: `https://github.com/o/r/pull/${pr}#issuecomment-${id}`,
  body: `comment ${id}`,
  created_at: updated,
  updated_at: updated,
  user: { login, avatar_url: "" },
  pr_number: pr,
  repo_full_name: "o/r",
  context_title: `PR ${pr}`,
  reason: "mention",
});

const jira = (id: string, key: string, updated: string): JiraComment => ({
  id,
  author: { displayName: "Bea", avatarUrls: { "48x48": "" } },
  body: { text: `jira ${id}` },
  created: updated,
  updated,
  issueKey: key,
  issueSummary: `Summary ${key}`,
});

const input = (o: Partial<MergeInput>): MergeInput => ({
  openPRs: [],
  reviewRequests: [],
  jiraIssues: [],
  jiraComments: [],
  githubMentions: [],
  notes: [],
  jiraBaseUrl: "https://x.atlassian.net",
  ...o,
});

describe("mergeSources mentions", () => {
  it("groups GitHub mentions per PR, newest first, ranked by the newest", () => {
    const items = mergeSources(
      input({
        githubMentions: [
          gh(1, 7, "2026-10-01T10:00:00Z"),
          gh(2, 8, "2026-10-05T10:00:00Z"),
          gh(3, 7, "2026-10-02T10:00:00Z", "cid"),
        ],
      }),
      NOW,
    );
    expect(items.map((i) => [i.id, i.title, i.mentions?.map((m) => m.id)])).toEqual([
      ["mention:gh:o/r#7", "PR 7", ["mention:gh:3", "mention:gh:1"]],
      ["mention:gh:o/r#8", "PR 8", ["mention:gh:2"]],
    ]);
    const [pr7] = items;
    expect(pr7.updatedAt).toBe(new Date("2026-10-02T10:00:00Z").getTime());
    expect(Math.round(pr7.signals.ageDays)).toBe(10);
    expect(pr7.url).toBe("https://github.com/o/r/pull/7");
    expect(pr7.mentions?.[0]).toMatchObject({ who: "cid", snippet: "comment 3" });
  });

  it("links a single mention straight to its comment", () => {
    const [item] = mergeSources(input({ githubMentions: [gh(1, 7, "2026-10-01T10:00:00Z")] }), NOW);
    expect(item.url).toBe("https://github.com/o/r/pull/7#issuecomment-1");
  });

  it("groups Jira mentions per ticket under the ticket summary", () => {
    const items = mergeSources(
      input({
        jiraComments: [
          jira("a", "OCP-1", "2026-10-01T10:00:00Z"),
          jira("b", "OCP-1", "2026-10-03T10:00:00Z"),
        ],
      }),
      NOW,
    );
    expect(items.map((i) => [i.id, i.title, i.url, i.mentions?.map((m) => m.id)])).toEqual([
      [
        "mention:jira:OCP-1",
        "OCP-1: Summary OCP-1",
        "https://x.atlassian.net/browse/OCP-1",
        ["mention:jira:b", "mention:jira:a"],
      ],
    ]);
  });
});
