import { useState, useEffect, useCallback } from 'react';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { PublicKey } from '@solana/web3.js';
import { useToken } from '../lib/constants';
import { getTokenBalanceCached } from '../lib/balanceCache';

export const useUsdcBalance = () => {
  const { connection } = useConnection();
  const { publicKey, connected } = useWallet();
  const { mint } = useToken();
  const [balance, setBalance] = useState<number | null>(null);

  const fetchBalance = useCallback(async (force = false) => {
    if (!connected || !publicKey) {
      setBalance(null);
      return;
    }

    try {
      if (mint && mint.length > 10) {
        const tokenMint = new PublicKey(mint);
        const amount = await getTokenBalanceCached(connection, publicKey, tokenMint, { force });
        setBalance(amount);
      } else {
        setBalance(0);
      }
    } catch (error) {
      console.error('Error fetching USDC balance:', error);
      setBalance((prev) => prev);
      throw error;
    }
  }, [connection, publicKey, connected, mint]);

  useEffect(() => {
    let retryTimer: any = null;

    const runFetch = async (force = false, isRetry = false) => {
      if (retryTimer) {
        clearTimeout(retryTimer);
        retryTimer = null;
      }
      try {
        await fetchBalance(force);
      } catch {
        // fetchBalance already keeps last value on catch, but if it throws or fails:
        if (!isRetry) {
          retryTimer = setTimeout(() => {
            if (!document.hidden) {
              runFetch(false, true);
            }
          }, 10000);
        }
      }
    };

    runFetch();

    const handleNormal = () => {
      runFetch(false);
    };

    const handleForced = () => {
      runFetch(true);
    };

    const handleVisibilityChange = () => {
      if (!document.hidden) {
        runFetch(false);
      }
    };

    window.addEventListener('blinkflow:deals-changed', handleNormal);
    window.addEventListener('blinkflow:refresh_balance', handleForced);
    window.addEventListener('focus', handleNormal);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      if (retryTimer) clearTimeout(retryTimer);
      window.removeEventListener('blinkflow:deals-changed', handleNormal);
      window.removeEventListener('blinkflow:refresh_balance', handleForced);
      window.removeEventListener('focus', handleNormal);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [fetchBalance]);

  return { balance };
};
