import { useState, useEffect } from 'react';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { getSolBalanceCached } from '../lib/balanceCache';

export const useSolBalance = () => {
  const { connection } = useConnection();
  const { publicKey, connected } = useWallet();
  const [solBalance, setSolBalance] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!connected || !publicKey) {
      setSolBalance(null);
      setLoading(false);
      setError(false);
      return;
    }

    let cancelled = false;
    let fetchId = 0;

    const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

    const isRetryable = (err: unknown) => {
      const msg = String((err as any)?.message || err || '').toLowerCase();
      return (
        msg.includes('429') ||
        msg.includes('rate limit') ||
        msg.includes('too many requests') ||
        msg.includes('fetch failed')
      );
    };

    let retryTimer: any = null;

    const fetchBalance = async (force = false, isRetry = false) => {
      if (retryTimer) {
        clearTimeout(retryTimer);
        retryTimer = null;
      }
      const currentId = ++fetchId;
      setLoading(true);
      setError(false);
      let lastErr: unknown = null;
      const delays = [600, 1200];

      for (let attempt = 1; attempt <= 3; attempt++) {
        if (cancelled || currentId !== fetchId) return;
        try {
          const lamports = await getSolBalanceCached(connection, publicKey, { force });
          if (!cancelled && currentId === fetchId) {
            setSolBalance(lamports / 1e9);
            setError(false);
            setLoading(false);
          }
          return;
        } catch (err) {
          lastErr = err;
          if (attempt < 3 && isRetryable(err)) {
            await sleep(delays[attempt - 1]);
          } else {
            break;
          }
        }
      }

      if (!cancelled && currentId === fetchId) {
        console.error("Error fetching SOL balance:", lastErr);
        // Keep the last known balance (or null = unknown). Do not report 0.
        setSolBalance((prev) => prev);
        setError(true);
        setLoading(false);

        if (!isRetry) {
          retryTimer = setTimeout(() => {
            if (!cancelled && !document.hidden) {
              fetchBalance(false, true);
            }
          }, 10000);
        }
      }
    };

    fetchBalance();

    const handleFocus = () => {
      fetchBalance();
    };

    const handleRefresh = () => {
      fetchBalance(true);
    };

    const handleVisibilityChange = () => {
      if (!document.hidden) {
        fetchBalance();
      }
    };

    window.addEventListener('focus', handleFocus);
    window.addEventListener('blinkflow:refresh_balance', handleRefresh);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      cancelled = true;
      if (retryTimer) clearTimeout(retryTimer);
      window.removeEventListener('focus', handleFocus);
      window.removeEventListener('blinkflow:refresh_balance', handleRefresh);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [connection, publicKey, connected]);

  return { solBalance, loading, error };
};
