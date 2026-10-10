import type { DoneTicket, GitHubPR, OffSprintTicket, ReviewedPR, SprintTicket } from "../types";
import { getDoneSince, getOffSprintTickets, getSprintTickets } from "../api/jira/workday";
import { getMergedPrs, getReviewedSince } from "../api/github";

/** One independently-fetched piece: data and error are both null while loading. */
export interface Part<T> {
  data: T | null;
  error: string | null;
}

/** The Workday page's own data, on top of the shared dashboard sources. */
export interface WorkdayExtras {
  sprint: Part<SprintTicket[]>;
  offSprint: Part<OffSprintTicket[]>;
  doneTickets: Part<DoneTicket[]>;
  merged: Part<GitHubPR[]>;
  reviewed: Part<ReviewedPR[]>;
}

const LOADING = { data: null, error: null };

export const EMPTY_EXTRAS: WorkdayExtras = {
  sprint: LOADING,
  offSprint: LOADING,
  doneTickets: LOADING,
  merged: LOADING,
  reviewed: LOADING,
};

/** Settle one request into a Part so a failure stays local to its section. */
async function part<T>(load: () => Promise<T>): Promise<Part<T>> {
  try {
    return { data: await load(), error: null };
  } catch (err: any) {
    return { data: null, error: err?.message || String(err) };
  }
}

/** Sprint membership and off-sprint tickets; independent of the lookback. */
export async function fetchWorkdayStable(
  signal?: AbortSignal,
): Promise<Pick<WorkdayExtras, "sprint" | "offSprint">> {
  const [sprint, offSprint] = await Promise.all([
    part(async () => (await getSprintTickets(signal)).tickets),
    part(async () => (await getOffSprintTickets(signal)).issues),
  ]);
  return { sprint, offSprint };
}

/** "Done since" pieces; refetched when the lookback changes. */
export async function fetchWorkdaySince(
  since: Date,
  signal?: AbortSignal,
): Promise<Pick<WorkdayExtras, "doneTickets" | "merged" | "reviewed">> {
  const [doneTickets, merged, reviewed] = await Promise.all([
    part(async () => (await getDoneSince(since, signal)).tickets),
    part(async () => (await getMergedPrs({ scope: "user", since })).prs as GitHubPR[]),
    part(async () => (await getReviewedSince(since)).reviews),
  ]);
  return { doneTickets, merged, reviewed };
}
