// sync.ts — shares on-chain demo deals between browsers (two Chrome profiles) through the Blink server.
// Only deals that have chain info (created through chainClient) are synced.
export interface SyncHooks {
  getDeals(): any[];
  replaceDeals(list: any[]): void;
  readChain(): Record<string, any>;
  writeChain(m: Record<string, any>): void;
}

const API = (((import.meta as any).env?.VITE_ACTIONS_API_URL as string) || 'http://localhost:3001').replace(/\/$/, '');
let hooks: SyncHooks | null = null;
const pushed = new Map<string, string>(); // id -> signature of the last state known to be on the server
let busy = false;

const sigOf = (deal: any, chain: any) => JSON.stringify({ deal, chain });

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
      const remoteSig = sigOf(e.deal, e.chain);
      if (pushed.get(e.id) === remoteSig) continue;                  // already in sync
      const idx = deals.findIndex((d) => d.id === e.id);
      const localSig = idx >= 0 && chain[e.id] ? sigOf(deals[idx], chain[e.id]) : null;
      // An unpushed local change wins, but only when we know what we last pushed in this page session.
      // After a page reload `pushed` is empty: the server is the source of truth then (otherwise a stale local
      // copy would block every update and even overwrite the server with old state).
      const localDirty = localSig !== null && pushed.has(e.id) && localSig !== pushed.get(e.id);
      if (localDirty) continue;
      if (idx >= 0) deals[idx] = e.deal; else deals = [...deals, e.deal];
      chain[e.id] = e.chain;
      pushed.set(e.id, remoteSig);
      changed = true;
    }
    if (changed) { hooks.writeChain(chain); hooks.replaceDeals(deals); }
  } catch { /* offline: ignore */ }
}

export async function push(): Promise<void> {
  if (!hooks || busy) return;
  busy = true;
  try {
    const chain = hooks.readChain();
    const deals = hooks.getDeals();
    for (const id of Object.keys(chain)) {
      const deal = deals.find((d) => d.id === id);
      if (!deal) continue;
      const sig = sigOf(deal, chain[id]);
      if (pushed.get(id) === sig) continue;
      const res = await fetch(`${API}/api/sync/deals/${encodeURIComponent(id)}`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ deal, chain: chain[id] }),
      });
      if (res.ok) pushed.set(id, sig);
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
