import { useState, useEffect } from 'react';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';

export const useSolBalance = () => {
  const { connection } = useConnection();
  const { publicKey, connected } = useWallet();
  const [solBalance, setSolBalance] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!connected || !publicKey) {
      setSolBalance(null);
      setLoading(false);
      return;
    }

    setLoading(true);

    const fetchBalance = async () => {
      try {
        const sol = await connection.getBalance(publicKey);
        setSolBalance(sol / 1e9);
      } catch (error) {
        console.error("Error fetching SOL balance:", error);
        setSolBalance(0);
      } finally {
        setLoading(false);
      }
    };

    fetchBalance();

    const handleFocusOrTrigger = () => {
      fetchBalance();
    };

    window.addEventListener('focus', handleFocusOrTrigger);
    window.addEventListener('blinkflow:refresh_balance', handleFocusOrTrigger);

    return () => {
      window.removeEventListener('focus', handleFocusOrTrigger);
      window.removeEventListener('blinkflow:refresh_balance', handleFocusOrTrigger);
    };
  }, [connection, publicKey, connected]);

  return { solBalance, loading };
};
