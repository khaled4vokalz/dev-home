import { describe, it, expect, beforeEach, vi } from "vitest";
import { httpMock, useFetchAdapter } from "../../test/fetchAdapter";
import { saveSettings } from "../../services/config";
import { resetMyselfCache } from "./issues";
import { getSprintTickets, getOffSprintTickets, getDoneSince } from "./workday";

useFetchAdapter();

const body = (req: any) => JSON.parse(req.data);

beforeEach(() => {
  localStorage.clear();
  resetMyselfCache();
  saveSettings({
    jiraBaseUrl: "https://example.atlassian.net",
    jiraEmail: "me@example.com",
    jiraApiToken: "t",
    githubToken: "gh",
    githubUsername: "me",
    githubOrg: "org",
    hiddenTabs: [],
  });
});

describe("getSprintTickets", () => {
  it("queries open sprints and maps sprint, points and flagged", async () => {
    const adapter = vi.fn(async () => ({
      data: {
        issues: [
          {
            key: "CCP-1",
            fields: {
              summary: "One",
              status: { name: "In Progress", statusCategory: { key: "indeterminate" } },
              customfield_10020: [
                { id: 1, name: "Sprint 41", state: "closed" },
                { id: 2, name: "Sprint 42", state: "active" },
              ],
              customfield_10127: 3,
              customfield_10021: [{ value: "Impediment" }],
            },
          },
          {
            key: "CCP-2",
            fields: { summary: "Two", status: { name: "To Do", statusCategory: { key: "new" } } },
          },
        ],
      },
    }));
    httpMock.adapter = adapter;

    const { tickets } = await getSprintTickets();
    const calls = (adapter as any).mock.calls;
    const req = calls[0][0];
    expect(req.url).toBe("/search/jql");
    expect(body(req).jql).toBe(
      "assignee = currentUser() AND sprint in openSprints() AND statusCategory != Done",
    );
    expect(body(req).fields).toEqual(
      expect.arrayContaining([
        "summary",
        "status",
        "customfield_10020",
        "customfield_10127",
        "customfield_10021",
      ]),
    );
    expect(tickets).toEqual([
      {
        key: "CCP-1",
        summary: "One",
        status: { name: "In Progress", categoryKey: "indeterminate" },
        sprintName: "Sprint 42",
        points: 3,
        flagged: true,
      },
      {
        key: "CCP-2",
        summary: "Two",
        status: { name: "To Do", categoryKey: "new" },
        sprintName: null,
        points: null,
        flagged: false,
      },
    ]);
  });
});

describe("getOffSprintTickets", () => {
  it("paginates with nextPageToken and stops at 200", async () => {
    let page = 0;
    const adapter = vi.fn(async () => {
      page += 1;
      const issues = Array.from({ length: 100 }, (_, i) => ({
        key: `X-${page * 1000 + i}`,
        fields: {
          summary: "s",
          status: { name: "To Do", statusCategory: { key: "new" } },
          project: {},
        },
      }));
      return { data: { issues, nextPageToken: `p${page}` } };
    });
    httpMock.adapter = adapter;

    const { issues } = await getOffSprintTickets();
    expect(adapter).toHaveBeenCalledTimes(2);
    expect(issues).toHaveLength(200);
    expect(issues[0].flagged).toBe(false);
    const calls = (adapter as any).mock.calls;
    const first = body(calls[0][0]);
    expect(first.jql).toBe(
      "assignee = currentUser() AND resolution = Unresolved AND (sprint is EMPTY OR sprint not in openSprints()) AND updated >= -60d ORDER BY updated DESC",
    );
    expect(first.fields).toContain("customfield_10021");
    expect(body(calls[1][0]).nextPageToken).toBe("p1");
  });
});

describe("getDoneSince", () => {
  it("keeps my latest status change after `since`", async () => {
    const adapter = vi.fn(async (req: any) => {
      if (req.url === "/user/search") {
        return { data: [{ accountId: "me-1", displayName: "Me", emailAddress: "me@example.com" }] };
      }
      return {
        data: {
          issues: [
            {
              key: "WMU-402",
              fields: { summary: "Delete data" },
              changelog: {
                histories: [
                  {
                    author: { accountId: "me-1" },
                    created: "2026-10-07T10:00:00.000+0000",
                    items: [{ field: "status", toString: "In Progress" }],
                  },
                  {
                    author: { accountId: "me-1" },
                    created: "2026-10-08T09:00:00.000+0000",
                    items: [{ field: "status", toString: "Code Review" }],
                  },
                  {
                    author: { accountId: "other" },
                    created: "2026-10-08T11:00:00.000+0000",
                    items: [{ field: "status", toString: "Done" }],
                  },
                ],
              },
            },
            {
              key: "OLD-1",
              fields: { summary: "Old" },
              changelog: {
                histories: [
                  {
                    author: { accountId: "me-1" },
                    created: "2026-10-01T09:00:00.000+0000",
                    items: [{ field: "status", toString: "Done" }],
                  },
                ],
              },
            },
          ],
        },
      };
    });
    httpMock.adapter = adapter;

    const since = new Date("2026-10-08T00:00:00Z");
    const { tickets } = await getDoneSince(since);
    const calls = (adapter as any).mock.calls;
    const search = calls.map((c: any) => c[0]).find((r: any) => r.url === "/search/jql");
    expect(body(search).jql).toMatch(
      /^status CHANGED BY currentUser\(\) AFTER "\d{4}-\d{2}-\d{2} \d{2}:\d{2}" ORDER BY updated DESC$/,
    );
    expect(body(search).expand).toBe("changelog");
    expect(body(search).maxResults).toBe(50);
    expect(tickets).toEqual([
      {
        key: "WMU-402",
        summary: "Delete data",
        toStatus: "Code Review",
        changedAt: "2026-10-08T09:00:00.000+0000",
      },
    ]);
  });
});
