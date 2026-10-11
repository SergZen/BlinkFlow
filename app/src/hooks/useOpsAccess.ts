import { useState, useEffect } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { fetchProtocolConfig, type ProtocolConfig } from '../lib/client/chainClient';

let configPromise: Promise<ProtocolConfig | null> | null = null;
let cachedConfig: ProtocolConfig | null = null;

function fetchConfigOnce(): Promise<ProtocolConfig | null> {
  if (!configPromise) {
    configPromise = fetchProtocolConfig()
      .then((cfg) => {
        cachedConfig = cfg;
        return cfg;
      })
      .catch(() => {
        cachedConfig = null;
        return null;
      });
  }
  return configPromise;
}

function getEnvViewers(): string[] {
  const envStr = ((import.meta as any).env?.VITE_ARBITER_VIEWERS as string) || '';
  return envStr
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

function isAllowed(wallet: string, cfg: ProtocolConfig | null): boolean {
  if (!wallet) return false;
  const w = wallet.toLowerCase();
  if (getEnvViewers().includes(w)) return true;
  if (!cfg) return false;
  const admin = (cfg.admin || '').toLowerCase();
  const trustAuth = (cfg.trustAuthority || (cfg as any).trust_authority || '').toLowerCase();
  return w === admin || w === trustAuth;
}

export function useOpsAccess(): { canSeeOps: boolean } {
  const { publicKey, connected } = useWallet();
  const wallet = connected && publicKey ? publicKey.toBase58() : '';

  const [canSeeOps, setCanSeeOps] = useState<boolean>(() => {
    return isAllowed(wallet, cachedConfig);
  });

  useEffect(() => {
    if (!wallet) {
      setCanSeeOps(false);
      return;
    }

    if (isAllowed(wallet, cachedConfig)) {
      setCanSeeOps(true);
      return;
    }

    let active = true;
    fetchConfigOnce().then((cfg) => {
      if (!active) return;
      setCanSeeOps(isAllowed(wallet, cfg));
    });

    return () => {
      active = false;
    };
  }, [wallet]);

  return { canSeeOps };
}
