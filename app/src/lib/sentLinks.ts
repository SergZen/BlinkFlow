export interface SentLink {
  id: string;            // random id, e.g. Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
  createdAt: number;     // ms
  contractor: string;    // contractor wallet (base58)
  title: string;         // the title the deal will show: deal title in "Several stages" mode, otherwise the task title
  total: number;         // sum of all stage amounts (USDC, plain number)
  stages: number;        // 1..5
  deadlines: string[];   // YYYY-MM-DD of every stage
  url: string;           // the full link from buildDealLink
  fundedDealId?: string; // set when a matching deal is found (Part 3)
  fundedAt?: number;     // ms, when it was first matched
}

const KEY = 'blinkflow:links:v1';
const MAX_AGE = 30 * 24 * 60 * 60 * 1000;
const FUNDED_MAX_AGE = 7 * 24 * 60 * 60 * 1000;

function load(): SentLink[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const p = JSON.parse(raw);
    return Array.isArray(p) ? p.filter((r: any): r is SentLink => (
      r && typeof r === 'object' && typeof r.id === 'string' && typeof r.createdAt === 'number' &&
      typeof r.contractor === 'string' && typeof r.title === 'string' && typeof r.total === 'number' &&
      !isNaN(r.total) && typeof r.stages === 'number' && Array.isArray(r.deadlines) && typeof r.url === 'string'
    )) : [];
  } catch {
    return [];
  }
}

function save(items: SentLink[], notify = true): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(items));
    if (notify && typeof window !== 'undefined') window.dispatchEvent(new Event('blinkflow:links-changed'));
  } catch { /* blocked */ }
}

export function addSentLink(rec: Omit<SentLink, 'id' | 'createdAt'>): void {
  const item: SentLink = { ...rec, id: Date.now().toString(36) + Math.random().toString(36).slice(2, 8), createdAt: Date.now() };
  save([item, ...load()].slice(0, 10));
}

export function listSentLinks(wallet: string): SentLink[] {
  if (!wallet) return [];
  const all = load();
  const now = Date.now();
  let pruned = false;
  const kept = all.filter(r => {
    if (now - r.createdAt > MAX_AGE || (r.fundedAt && now - r.fundedAt > FUNDED_MAX_AGE)) {
      pruned = true;
      return false;
    }
    return true;
  });
  if (pruned) save(kept, false);
  return kept.filter(r => r.contractor === wallet).sort((a, b) => b.createdAt - a.createdAt);
}

export function removeSentLink(id: string): void {
  save(load().filter(r => r.id !== id));
}

export function markSentLinkFunded(id: string, dealId: string): void {
  const all = load();
  const target = all.find(r => r.id === id);
  if (target && !target.fundedDealId) {
    target.fundedDealId = dealId;
    if (!target.fundedAt) target.fundedAt = Date.now();
    save(all);
  }
}
