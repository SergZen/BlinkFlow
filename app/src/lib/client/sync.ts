// sync.ts — shares on-chain demo deals between browsers (two Chrome profiles) through the Blink server.
// Only deals that have chain info (created through chainClient) are synced.
//
// Conflict rule (no ping-pong): a deal only ever moves forward. "Progress" = chain signatures * 100 + history
// entries. A browser adopts the server copy only when it is further along than its own, and pushes its own copy
// only when it is further along than what the server is known to hold.
import { HIDDEN_DEAL_IDS } from '../hiddenDeals';

export interface SyncHooks {
  getDeals(): any[];
  replaceDeals(list: any[]): void;
  readChain(): Record<string, any>;
  writeChain(m: Record<string, any>): void;
}

const API = (((import.meta as any).env?.VITE_ACTIONS_API_URL as string) || 'http://localhost:3001').replace(/\/$/, '');
let hooks: SyncHooks | null = null;
const serverProgress = new Map<string, number>(); // id -> progress of the copy the server is known to hold
let pulledOnce = false; // never push before we know what the server holds
let busy = false;

const progress = (deal: any, chain: any) => (chain?.sigs?.length ?? 0) * 100 + (deal?.history?.length ?? 0);

export async function pull(): Promise<void> {
  if (!hooks) return;
  try {
    const res = await fetch(`${API}/api/sync/deals`);
    if (!res.ok) return;
    const entries: { id: string; deal: any; chain: any }[] = await res.json();
    const chain = hooks.readChain();
    let deals = hooks.getDeals().slice();
    let changed = false;
    for (const e of entries) {
      if (HIDDEN_DEAL_IDS.has(e.id)) continue;
      const remoteP = progress(e.deal, e.chain);
      serverProgress.set(e.id, remoteP);
      const idx = deals.findIndex((d) => d.id === e.id);
      const localP = idx >= 0 && chain[e.id] ? progress(deals[idx], chain[e.id]) : -1;
      if (remoteP <= localP) continue; // we are as far or further: keep ours (it is pushed below)
      if (idx >= 0) deals[idx] = e.deal; else deals = [...deals, e.deal];
      chain[e.id] = e.chain;
      changed = true;
    }
    pulledOnce = true;
    if (changed) { hooks.writeChain(chain); hooks.replaceDeals(deals); }
  } catch { /* offline: ignore */ }
}

export async function push(): Promise<void> {
  if (!hooks || busy || !pulledOnce) return;
  busy = true;
  try {
    const chain = hooks.readChain();
    const deals = hooks.getDeals();
    for (const id of Object.keys(chain)) {
      if (HIDDEN_DEAL_IDS.has(id)) continue;
      const deal = deals.find((d) => d.id === id);
      if (!deal) continue;
      const p = progress(deal, chain[id]);
      if (p <= (serverProgress.get(id) ?? -1)) continue; // the server already has this or newer
      const res = await fetch(`${API}/api/sync/deals/${encodeURIComponent(id)}`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ deal, chain: chain[id] }),
      });
      if (res.ok) serverProgress.set(id, p);
    }
  } catch { /* offline: ignore */ } finally { busy = false; }
}

export async function syncNow(): Promise<void> { await pull(); await push(); }

export function initSync(h: SyncHooks) {
  hooks = h;
  pull();
  setInterval(pull, 2500);
  window.addEventListener('focus', () => { pull(); });
  window.addEventListener('blinkflow:deals-changed', () => { push(); });
}
