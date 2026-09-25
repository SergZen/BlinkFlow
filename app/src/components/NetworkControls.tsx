import { useState, useEffect } from 'react';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { X, Info, ArrowRightLeft } from 'lucide-react';
import { useNetwork } from '../NetworkContext';

export const NetworkControls = () => {
  const { connection } = useConnection();
  const { publicKey, connected, wallet } = useWallet();
  const { network, setNetwork, isTestMode } = useNetwork();
  const isDevnet = isTestMode; // since they map 1:1
  
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

  return (
    <div className="flex items-center gap-3 relative">
      {/* Network Switcher Toggle */}
      <button
        onClick={() => setNetwork(isTestMode ? 'mainnet-beta' : 'devnet')}
        title={isTestMode ? "Switch to Mainnet (Live)" : "Switch to Test Mode (Devnet)"}
        className={`group flex items-center justify-center gap-2 w-[120px] px-3 py-1.5 rounded-full border font-mono text-[10px] font-bold tracking-wider cursor-pointer transition-all ${
          isTestMode
            ? 'bg-amber-500/10 text-amber-400 border-amber-500/50 shadow-[0_0_12px_rgba(245,158,11,0.5)] hover:bg-amber-500/20'
            : 'bg-green-500/10 text-green-400 border-green-500/20 hover:bg-green-500/20'
        }`}
      >
        <div className={`w-2 h-2 rounded-full ${isTestMode ? 'bg-amber-400 animate-pulse' : 'bg-green-400'}`}></div>
        <span>{isTestMode ? 'TEST MODE' : 'LIVE'}</span>
        <ArrowRightLeft className="w-3 h-3 opacity-40 group-hover:opacity-100 transition-opacity ml-0.5" />
      </button>

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
    </div>
  );
};
