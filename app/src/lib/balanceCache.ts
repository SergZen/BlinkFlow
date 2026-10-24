import type { Connection, PublicKey } from '@solana/web3.js';

interface CacheEntry<T> {
  value: T;
  timestamp: number;
  reqSeq: number;
}

const cache = new Map<string, CacheEntry<number>>();
const inFlight = new Map<string, Promise<number>>();
const inFlightSeq = new Map<string, number>();

const TTL_MS = 10_000;
let requestSeq = 0;

export async function getSolBalanceCached(
  connection: Connection,
  publicKey: PublicKey,
  opts?: { force?: boolean }
): Promise<number> {
  const key = `${publicKey.toBase58()}:sol`;
  const now = Date.now();

  if (!opts?.force) {
    const cached = cache.get(key);
    if (cached && now - cached.timestamp < TTL_MS) {
      return cached.value;
    }

    const existing = inFlight.get(key);
    if (existing) {
      return existing;
    }
  }

  const reqSeq = ++requestSeq;
  const promise = (async () => {
    try {
      const lamports = await connection.getBalance(publicKey);
      const current = cache.get(key);
      if (!current || reqSeq >= current.reqSeq) {
        cache.set(key, { value: lamports, timestamp: Date.now(), reqSeq });
      }
      return lamports;
    } finally {
      if (inFlightSeq.get(key) === reqSeq) {
        inFlight.delete(key);
        inFlightSeq.delete(key);
      }
    }
  })();

  inFlight.set(key, promise);
  inFlightSeq.set(key, reqSeq);
  return promise;
}

export async function getTokenBalanceCached(
  connection: Connection,
  publicKey: PublicKey,
  mint: PublicKey,
  opts?: { force?: boolean }
): Promise<number> {
  const key = `${publicKey.toBase58()}:token:${mint.toBase58()}`;
  const now = Date.now();

  if (!opts?.force) {
    const cached = cache.get(key);
    if (cached && now - cached.timestamp < TTL_MS) {
      return cached.value;
    }

    const existing = inFlight.get(key);
    if (existing) {
      return existing;
    }
  }

  const reqSeq = ++requestSeq;
  const promise = (async () => {
    try {
      const response = await connection.getParsedTokenAccountsByOwner(publicKey, {
        mint,
      });
      let amount = 0;
      if (response.value.length > 0) {
        amount = response.value[0].account.data.parsed.info.tokenAmount.uiAmount ?? 0;
      }
      const current = cache.get(key);
      if (!current || reqSeq >= current.reqSeq) {
        cache.set(key, { value: amount, timestamp: Date.now(), reqSeq });
      }
      return amount;
    } finally {
      if (inFlightSeq.get(key) === reqSeq) {
        inFlight.delete(key);
        inFlightSeq.delete(key);
      }
    }
  })();

  inFlight.set(key, promise);
  inFlightSeq.set(key, reqSeq);
  return promise;
}
