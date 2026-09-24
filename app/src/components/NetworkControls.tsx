import { useState, useEffect } from 'react';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { X, Copy, ExternalLink, Droplets, Info } from 'lucide-react';
import { Card } from './Card';
import { Button } from './Button';
import { TOKEN_SYMBOL } from '../lib/constants';

export const NetworkControls = () => {
  const { connection } = useConnection();
  const { publicKey, connected, wallet } = useWallet();
  const isDevnet = connection.rpcEndpoint.includes('devnet');
  
  const [showUsdcModal, setShowUsdcModal] = useState(false);
  const [showPhantomTip, setShowPhantomTip] = useState(false);
  const [tipDismissed, setTipDismissed] = useState(() => {
    return sessionStorage.getItem('blinkflow_testnet_tip_dismissed') === 'true';
  });

  // Show Phantom tip when connected to Phantom on devnet, unless dismissed
  useEffect(() => {
    if (connected && isDevnet && !tipDismissed && wallet?.adapter.name === 'Phantom') {
      setShowPhantomTip(true);
    } else {
      setShowPhantomTip(false);
    }
  }, [connected, isDevnet, tipDismissed, wallet]);



  const handleFaucetClick = () => {
    window.open('https://spl-token-faucet.com/?token-name=USDC-Dev', '_blank', 'noopener,noreferrer');
  };

  return (
    <div className="flex items-center gap-3 relative">
      {isDevnet && (
        <Button 
          variant="outline" 
          onClick={() => setShowUsdcModal(true)}
          className="h-9 px-3 border-blue-500/30 text-blue-400 hover:bg-blue-500/10 text-xs hidden sm:flex"
        >
          <Droplets className="w-3.5 h-3.5 mr-1.5" /> Get {TOKEN_SYMBOL}
        </Button>
      )}

      {isDevnet ? (
        <div className="flex items-center px-2.5 py-1 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/50 shadow-[0_0_12px_rgba(245,158,11,0.5)] font-mono text-[10px] font-bold tracking-wider cursor-default">
          🧪 DEVNET
        </div>
      ) : (
        <div className="flex items-center px-2.5 py-1 rounded-full bg-green-500/10 text-green-400 border border-green-500/20 font-mono text-[10px] font-bold tracking-wider cursor-default">
          ● LIVE
        </div>
      )}

      {/* Phantom Testnet Tip Tooltip */}
      {showPhantomTip && (
        <div className="absolute top-full right-0 mt-3 w-64 bg-gray-900 border border-gray-800 shadow-xl rounded-lg p-3 z-50 animate-in fade-in slide-in-from-top-2">
          <button 
            onClick={() => {
              setTipDismissed(true);
              sessionStorage.setItem('blinkflow_testnet_tip_dismissed', 'true');
            }} 
            className="absolute top-2 right-2 text-gray-500 hover:text-white transition-colors"
          >
            <X className="w-3.5 h-3.5" />
          </button>
          <div className="flex gap-2 items-start">
            <Info className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
            <div className="text-xs text-gray-300 pr-4">
              <span className="font-semibold text-white">Using Phantom?</span><br />
              Enable <strong>Testnet Mode</strong> in Developer Settings to avoid false 'transaction may fail' warnings on devnet.
            </div>
          </div>
        </div>
      )}

      {/* USDC Faucet Dropdown */}
      {showUsdcModal && isDevnet && (
        <div className="absolute top-full right-0 mt-3 w-[340px] bg-gray-900 border border-gray-800 shadow-2xl rounded-xl p-5 z-[60] animate-in fade-in slide-in-from-top-2">
          <button onClick={() => setShowUsdcModal(false)} className="absolute right-3 top-3 text-gray-400 hover:text-white transition-colors">
            <X className="w-4 h-4" />
          </button>
          
          <div className="flex items-center gap-3 mb-4 pr-6">
            <div className="w-10 h-10 bg-blue-500/10 rounded-full flex items-center justify-center shrink-0">
              <Droplets className="w-5 h-5 text-blue-500" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white">Get {TOKEN_SYMBOL}</h2>
              <p className="text-xs text-gray-400 leading-tight mt-0.5">
                Mint Devnet {TOKEN_SYMBOL} using the community SPL Faucet.
              </p>
            </div>
          </div>
          
          <div className="space-y-4">
            <p className="text-xs text-gray-300">
              The SPL Token Faucet requires you to connect your wallet directly on their site to mint tokens.
            </p>
            
            <Button variant="gradient" onClick={handleFaucetClick} className="w-full h-9 from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-sm">
              Open SPL Token Faucet <ExternalLink className="w-3.5 h-3.5 ml-1.5" />
            </Button>
            <p className="text-[10px] text-gray-500 mt-2 text-center">
              Opens spl-token-faucet.com in a new tab.
            </p>
          </div>
        </div>
      )}
    </div>
  );
};
