import { useCallback, useMemo } from "react";
import type { GitHubPR } from "../types";
import { useOptionalNotes } from "../context/NotesContext";
import { normalizeNoteRef, prNoteKey } from "../utils/prNotes";

/** Unresolved note count per PR, for the note badge on PR rows. */
export function usePRNoteCounts(): (pr: GitHubPR) => number {
  const notesCtx = useOptionalNotes();
  const notes = notesCtx?.notes;

  const countByKey = useMemo(() => {
    const m = new Map<string, number>();
    for (const n of notes ?? []) {
      if (n.resolved !== 0) continue;
      const key = normalizeNoteRef(n.reference_id);
      if (!key) continue;
      m.set(key, (m.get(key) ?? 0) + 1);
    }
    return m;
  }, [notes]);

  return useCallback((pr: GitHubPR) => countByKey.get(prNoteKey(pr)) ?? 0, [countByKey]);
}
