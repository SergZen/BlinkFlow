import { Connection, Commitment } from '@solana/web3.js';

const env = (typeof import.meta !== 'undefined' && (import.meta as any)?.env) || {};

const rawEndpoints = [
  env.VITE_CHAIN_RPC || env.VITE_SOLANA_RPC_URL_DEVNET,
  env.VITE_SOLANA_RPC_URL_DEVNET_BACKUP,
  'https://api.devnet.solana.com',
];

export const DEVNET_ENDPOINTS: string[] = Array.from(
  new Set(rawEndpoints.filter((u): u is string => typeof u === 'string' && u.trim().length > 0))
);

let lastWorkingEndpoint: string | null = null;
let lastWorkingTime = 0;
const WORKING_TTL_MS = 5 * 60 * 1000;

export const RPC_UNAVAILABLE = 'RPC_UNAVAILABLE';

export function isRpcUnavailable(err: any): boolean {
  if (!err) return false;
  const msg = typeof err === 'string' ? err : err?.message || String(err);
  return msg.includes(RPC_UNAVAILABLE) || msg.includes('Solana Devnet is not responding');
}

export function resetWorkingEndpointForTest(): void {
  lastWorkingEndpoint = null;
  lastWorkingTime = 0;
}

function getHost(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

export async function failoverFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const endpoints = [...DEVNET_ENDPOINTS];
  const now = Date.now();
  if (lastWorkingEndpoint && now - lastWorkingTime < WORKING_TTL_MS && endpoints.includes(lastWorkingEndpoint)) {
    const idx = endpoints.indexOf(lastWorkingEndpoint);
    endpoints.splice(idx, 1);
    endpoints.unshift(lastWorkingEndpoint);
  }

  let lastReason = '';

  for (let i = 0; i < endpoints.length; i++) {
    const endpoint = endpoints[i];
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);

    const externalSignal = init?.signal;
    const onExternalAbort = () => controller.abort();
    if (externalSignal) {
      if (externalSignal.aborted) {
        controller.abort();
      } else {
        externalSignal.addEventListener('abort', onExternalAbort);
      }
    }

    try {
      const response = await fetch(endpoint, {
        ...init,
        signal: controller.signal,
      });

      if (response.status === 429 || (response.status >= 500 && response.status < 600)) {
        lastReason = `HTTP ${response.status}`;
        if (i < endpoints.length - 1) {
          const nextHost = getHost(endpoints[i + 1]);
          const currentHost = getHost(endpoint);
          console.warn(`[rpc] Failover from ${currentHost} to ${nextHost} (${lastReason})`);
        }
        continue;
      }

      lastWorkingEndpoint = endpoint;
      lastWorkingTime = Date.now();
      return response;
    } catch (err: any) {
      const isAbort = err?.name === 'AbortError' || err?.message?.includes('aborted');
      if (isAbort && externalSignal?.aborted) {
        throw err;
      }
      lastReason = isAbort ? 'timeout 8s' : err?.message || 'network error';
      if (i < endpoints.length - 1) {
        const nextHost = getHost(endpoints[i + 1]);
        const currentHost = getHost(endpoint);
        console.warn(`[rpc] Failover from ${currentHost} to ${nextHost} (${lastReason})`);
      }
    } finally {
      clearTimeout(timer);
      if (externalSignal) {
        externalSignal.removeEventListener('abort', onExternalAbort);
      }
    }
  }

  throw new Error('RPC_UNAVAILABLE: Solana Devnet is not responding right now.');
}

export function createConnection(commitment: Commitment = 'confirmed'): Connection {
  const primary = DEVNET_ENDPOINTS[0] || 'https://api.devnet.solana.com';
  return new Connection(primary, {
    commitment,
    fetch: failoverFetch,
  });
}
