import { useEffect, useState } from 'react';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { PublicKey } from '@solana/web3.js';
import { useToken } from '../lib/constants';

export const BalanceDisplay = () => {
  const { connection } = useConnection();
  const { publicKey } = useWallet();
  const { symbol, mint } = useToken();
  const [solBalance, setSolBalance] = useState<number | null>(null);
  const [tokenBalance, setTokenBalance] = useState<number | null>(null);

  useEffect(() => {
    if (!publicKey) {
      setSolBalance(null);
      setTokenBalance(null);
      return;
    }

    // Reset balances when network/mint changes to show loading skeleton
    setSolBalance(null);
    setTokenBalance(null);

    let isMounted = true;

    const fetchBalances = async () => {
      // Fetch SOL
      try {
        const sol = await connection.getBalance(publicKey);
        if (isMounted) setSolBalance(sol / 1e9);
      } catch (error) {
        console.error("Error fetching SOL balance:", error);
        if (isMounted) setSolBalance(0);
      }

      // Fetch Token
      try {
        if (mint && mint.length > 10) {
          const tokenMint = new PublicKey(mint);
          const response = await connection.getParsedTokenAccountsByOwner(publicKey, {
            mint: tokenMint
          });
          
          if (response.value.length > 0) {
            const amount = response.value[0].account.data.parsed.info.tokenAmount.uiAmount;
            if (isMounted) setTokenBalance(amount);
          } else {
            if (isMounted) setTokenBalance(0);
          }
        } else {
          if (isMounted) setTokenBalance(0);
        }
      } catch (error) {
        console.error("Error fetching Token balance:", error);
        if (isMounted) setTokenBalance(0);
      }
    };

    fetchBalances();
    
    // Refresh only when user returns to the tab (e.g. after using the faucet)
    // or when a custom event is dispatched (e.g. after a smart contract transaction)
    const handleFocusOrTrigger = () => {
      fetchBalances();
    };
    
    window.addEventListener('focus', handleFocusOrTrigger);
    window.addEventListener('blinkflow:refresh_balance', handleFocusOrTrigger);

    return () => {
      isMounted = false;
      window.removeEventListener('focus', handleFocusOrTrigger);
      window.removeEventListener('blinkflow:refresh_balance', handleFocusOrTrigger);
    };
  }, [connection, publicKey, mint]);

  if (!publicKey) return null;

  return (
    <div className="flex items-center gap-2 sm:gap-3 px-2.5 sm:px-4 py-1 sm:py-1.5 bg-gray-950/50 border border-gray-800 rounded-lg sm:rounded-full text-[11px] sm:text-sm font-mono text-gray-300">
      {solBalance !== null ? (
        <span className="whitespace-nowrap">{solBalance.toFixed(2)} SOL</span>
      ) : (
        <span className="w-10 sm:w-12 h-3 sm:h-4 bg-gray-800 animate-pulse rounded"></span>
      )}
      <div className="w-px h-3 sm:h-4 bg-gray-800"></div>
      {tokenBalance !== null ? (
        <span className="text-purple-400 font-medium whitespace-nowrap">{tokenBalance.toLocaleString()} {symbol}</span>
      ) : (
        <span className="w-12 sm:w-16 h-3 sm:h-4 bg-gray-800 animate-pulse rounded"></span>
      )}
    </div>
  );
};
