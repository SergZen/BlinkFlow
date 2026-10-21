import { PublicKey } from '@solana/web3.js';
import { PROGRAM_ID } from './chainClient';
import { createConnection } from '../rpc';

export interface RoleReputation {
  success: number;
  lost: number;
  disputes: number;
  volumeUsdc: number;
  autoReleased?: number;
  unresponsive?: number;
}

export interface Reputation {
  contractor: RoleReputation;
  customer: RoleReputation;
  firstSeen: Date | null;
  lastSeen: Date | null;
}

const conn = createConnection('confirmed');

const KEYS = [
  'contractor_success',
  'contractor_lost',
  'contractor_disputes',
  'contractor_volume',
  'contractor_auto_released',
  'customer_success',
  'customer_lost',
  'customer_disputes',
  'customer_volume',
  'customer_unresponsive',
  'first_seen',
  'last_seen',
] as const;

function findSubarray(haystack: Uint8Array, needle: Uint8Array, start = 0): number {
  outer: for (let i = start; i <= haystack.length - needle.length; i++) {
    for (let j = 0; j < needle.length; j++) {
      if (haystack[i + j] !== needle[j]) continue outer;
    }
    return i;
  }
  return -1;
}

function parseAttributes(data: Uint8Array): Record<string, string> {
  const result: Record<string, string> = {};
  const encoder = new TextEncoder();
  const decoder = new TextDecoder('utf-8');

  for (const key of KEYS) {
    const keyBytes = encoder.encode(key);
    const needle = new Uint8Array(4 + keyBytes.length);
    needle[0] = keyBytes.length & 0xff;
    needle[1] = (keyBytes.length >> 8) & 0xff;
    needle[2] = (keyBytes.length >> 16) & 0xff;
    needle[3] = (keyBytes.length >> 24) & 0xff;
    needle.set(keyBytes, 4);

    const pos = findSubarray(data, needle, 70);
    if (pos === -1) {
      result[key] = '0';
      continue;
    }

    const valLenOffset = pos + needle.length;
    if (valLenOffset + 4 > data.length) {
      result[key] = '0';
      continue;
    }

    const valLen =
      data[valLenOffset] |
      (data[valLenOffset + 1] << 8) |
      (data[valLenOffset + 2] << 16) |
      ((data[valLenOffset + 3] << 24) >>> 0);

    const valStart = valLenOffset + 4;
    if (valStart + valLen > data.length) {
      result[key] = '0';
      continue;
    }

    result[key] = decoder.decode(data.subarray(valStart, valStart + valLen));
  }

  return result;
}

export async function fetchReputation(owner: string): Promise<Reputation | null> {
  let pubkey: PublicKey;
  try {
    pubkey = new PublicKey(owner);
  } catch {
    return null;
  }

  const pda = PublicKey.findProgramAddressSync(
    [new TextEncoder().encode('sbt'), pubkey.toBuffer()],
    PROGRAM_ID
  )[0];

  const info = await conn.getAccountInfo(pda, 'confirmed');
  if (!info || !info.data || info.data.length === 0) {
    return null;
  }

  const raw = parseAttributes(info.data);

  const parseNum = (v: string | undefined): number => {
    const n = Number(v);
    return isNaN(n) ? 0 : n;
  };

  const parseDate = (v: string | undefined): Date | null => {
    const sec = parseNum(v);
    if (!sec || sec <= 0) return null;
    return new Date(sec * 1000);
  };

  return {
    contractor: {
      success: parseNum(raw['contractor_success']),
      lost: parseNum(raw['contractor_lost']),
      disputes: parseNum(raw['contractor_disputes']),
      volumeUsdc: parseNum(raw['contractor_volume']) / 1_000_000,
      autoReleased: parseNum(raw['contractor_auto_released']),
    },
    customer: {
      success: parseNum(raw['customer_success']),
      lost: parseNum(raw['customer_lost']),
      disputes: parseNum(raw['customer_disputes']),
      volumeUsdc: parseNum(raw['customer_volume']) / 1_000_000,
      unresponsive: parseNum(raw['customer_unresponsive']),
    },
    firstSeen: parseDate(raw['first_seen']),
    lastSeen: parseDate(raw['last_seen']),
  };
}
