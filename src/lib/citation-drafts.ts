/** Browser drafts are explicitly opted into on a private device, never issued records. */
export const CITATION_DRAFT_PREFIX = "citation-draft:v1:";
export const CITATION_DRAFT_LIFETIME = 24 * 60 * 60 * 1000;

export interface CitationDraft {
  ownerId: string;
  savedAt: number;
  requestId: string;
  form: Record<string, string>;
  violationCodes: string[];
  photoData?: string | undefined;
}

export function readCitationDraft(
  ownerId: string,
  storage?: Storage,
  now = Date.now(),
): CitationDraft | null {
  const key = CITATION_DRAFT_PREFIX + ownerId;
  try {
    storage ??= localStorage;
    const raw = storage.getItem(key);
    if (!raw) return null;
    const draft = JSON.parse(raw) as CitationDraft;
    if (
      draft.ownerId !== ownerId ||
      !Number.isFinite(draft.savedAt) ||
      draft.savedAt > now ||
      now - draft.savedAt >= CITATION_DRAFT_LIFETIME ||
      typeof draft.requestId !== "string" ||
      !draft.form ||
      typeof draft.form !== "object" ||
      Array.isArray(draft.form) ||
      (draft.photoData !== undefined && typeof draft.photoData !== "string") ||
      !Object.values(draft.form).every((value) => typeof value === "string") ||
      !Array.isArray(draft.violationCodes) ||
      !draft.violationCodes.every((value) => typeof value === "string")
    ) {
      storage.removeItem(key);
      return null;
    }
    return draft;
  } catch {
    try {
      storage?.removeItem(key);
    } catch {
      // Storage can be blocked by the browser. The form remains usable in memory.
    }
    return null;
  }
}

export function saveCitationDraft(
  draft: CitationDraft,
  consent: boolean,
  storage?: Storage,
) {
  if (!consent) return false;
  try {
    storage ??= localStorage;
    storage.setItem(
      CITATION_DRAFT_PREFIX + draft.ownerId,
      JSON.stringify(draft),
    );
    return true;
  } catch {
    return false;
  }
}

export function removeCitationDraft(ownerId: string, storage?: Storage) {
  try {
    storage ??= localStorage;
    storage.removeItem(CITATION_DRAFT_PREFIX + ownerId);
  } catch {
    // No additional persistence is attempted when browser storage is unavailable.
  }
}

/** Call when signing out or switching staff accounts, including forced logout. */
export function clearCitationDrafts(storage?: Storage) {
  if (!storage && typeof window === "undefined") return;
  try {
    const target = storage ?? localStorage;
    for (let index = target.length - 1; index >= 0; index--) {
      const key = target.key(index);
      if (key?.startsWith(CITATION_DRAFT_PREFIX)) target.removeItem(key);
    }
  } catch {
    // A blocked storage API cannot be used to recover drafts either.
  }
}
