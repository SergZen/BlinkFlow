import { useState, useEffect, useCallback } from 'react';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { PublicKey } from '@solana/web3.js';
import { useToken } from '../lib/constants';

export const useUsdcBalance = () => {
  const { connection } = useConnection();
  const { publicKey, connected } = useWallet();
  const { mint } = useToken();
  const [balance, setBalance] = useState<number | null>(null);

  const fetchBalance = useCallback(async () => {
    if (!connected || !publicKey) {
      setBalance(null);
      return;
    }

    try {
      if (mint && mint.length > 10) {
        const tokenMint = new PublicKey(mint);
        const response = await connection.getParsedTokenAccountsByOwner(publicKey, {
          mint: tokenMint,
        });

        if (response.value.length > 0) {
          const amount = response.value[0].account.data.parsed.info.tokenAmount.uiAmount;
          setBalance(amount ?? 0);
        } else {
          setBalance(0);
        }
      } else {
        setBalance(0);
      }
    } catch (error) {
      console.error('Error fetching USDC balance:', error);
      setBalance(null);
    }
  }, [connection, publicKey, connected, mint]);

  useEffect(() => {
    fetchBalance();

    const handleRefresh = () => {
      fetchBalance();
    };

    window.addEventListener('blinkflow:deals-changed', handleRefresh);
    window.addEventListener('blinkflow:refresh_balance', handleRefresh);
    window.addEventListener('focus', handleRefresh);

    return () => {
      window.removeEventListener('blinkflow:deals-changed', handleRefresh);
      window.removeEventListener('blinkflow:refresh_balance', handleRefresh);
      window.removeEventListener('focus', handleRefresh);
    };
  }, [fetchBalance]);

  return { balance };
};
