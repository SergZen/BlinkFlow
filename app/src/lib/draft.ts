export interface DraftEnvelope<T = any> {
  savedAt: number;
  data: T;
}

const PREFIX = 'blinkflow:draft:v1:';
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export function loadDraftEnvelope<T = any>(scope: string): DraftEnvelope<T> | null {
  try {
    const raw = localStorage.getItem(PREFIX + scope);
    if (!raw) return null;
    const env: DraftEnvelope<T> = JSON.parse(raw);
    if (!env || typeof env.savedAt !== 'number' || !env.data) return null;
    if (Date.now() - env.savedAt > MAX_AGE_MS) {
      clearDraft(scope);
      return null;
    }
    return env;
  } catch {
    return null;
  }
}

export function loadDraft<T = any>(scope: string): T | null {
  return loadDraftEnvelope<T>(scope)?.data ?? null;
}

export function saveDraft<T = any>(scope: string, data: T): void {
  try {
    const env: DraftEnvelope<T> = { savedAt: Date.now(), data };
    localStorage.setItem(PREFIX + scope, JSON.stringify(env));
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new Event('blinkflow:drafts-changed'));
    }
  } catch {
    // storage full or blocked: silently fail
  }
}

export function clearDraft(scope: string): void {
  try {
    localStorage.removeItem(PREFIX + scope);
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new Event('blinkflow:drafts-changed'));
    }
  } catch {
    // ignore
  }
}

export interface CreateDraftItem {
  scope: 'create:customer' | 'create:contractor';
  savedAt: number;
  title: string;
  amount: string;
  hasFile: boolean;
}

export function listCreateDrafts(): CreateDraftItem[] {
  try {
    const scopes: ('create:customer' | 'create:contractor')[] = ['create:customer', 'create:contractor'];
    const results: CreateDraftItem[] = [];

    for (const scope of scopes) {
      const env = loadDraftEnvelope<any>(scope);
      if (!env) continue;
      const d = env.data;
      if (!d || typeof d !== 'object') continue;

      const titlePart = (d.severalStages && typeof d.dealTitleInput === 'string' && d.dealTitleInput.trim()) ||
        (typeof d.title === 'string' && d.title.trim()) ||
        (typeof d.dealTitleInput === 'string' && d.dealTitleInput.trim()) ||
        '';

      let amountPart = (typeof d.amount === 'string' && d.amount.trim()) ||
        (typeof d.amount === 'number' && !isNaN(d.amount) && d.amount > 0 ? String(d.amount) : '');

      if (!amountPart && Array.isArray(d.extraStages)) {
        const sum = d.extraStages.reduce((acc: number, s: any) => {
          const v = parseFloat(s?.amount);
          return acc + (isNaN(v) || v <= 0 ? 0 : v);
        }, 0);
        if (sum > 0) amountPart = String(sum);
      }

      if (!titlePart && !amountPart) continue;

      const title = titlePart || 'Untitled deal';
      const hasFile = Boolean(
        d.reqFile?.name ||
        (Array.isArray(d.extraStages) && d.extraStages.some((s: any) => s?.reqFile?.name))
      );

      results.push({
        scope,
        savedAt: env.savedAt,
        title,
        amount: amountPart,
        hasFile,
      });
    }

    return results;
  } catch {
    return [];
  }
}
