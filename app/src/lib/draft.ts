export interface DraftEnvelope<T = any> {
  savedAt: number;
  data: T;
}

const PREFIX = 'blinkflow:draft:v1:';
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export function loadDraft<T = any>(scope: string): T | null {
  try {
    const raw = localStorage.getItem(PREFIX + scope);
    if (!raw) return null;
    const env: DraftEnvelope<T> = JSON.parse(raw);
    if (!env || typeof env.savedAt !== 'number' || !env.data) return null;
    if (Date.now() - env.savedAt > MAX_AGE_MS) {
      clearDraft(scope);
      return null;
    }
    return env.data;
  } catch {
    return null;
  }
}

export function saveDraft<T = any>(scope: string, data: T): void {
  try {
    const env: DraftEnvelope<T> = { savedAt: Date.now(), data };
    localStorage.setItem(PREFIX + scope, JSON.stringify(env));
  } catch {
    // storage full or blocked: silently fail
  }
}

export function clearDraft(scope: string): void {
  try {
    localStorage.removeItem(PREFIX + scope);
  } catch {
    // ignore
  }
}
