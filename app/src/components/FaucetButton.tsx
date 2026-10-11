import { useState } from 'react';
import { Droplets, X, ExternalLink } from 'lucide-react';
import { Button } from './Button';
import { useToken } from '../lib/constants';
import { useNetwork } from '../NetworkContext';

export const FaucetButton = () => {
  const { isTestMode } = useNetwork();
  const { symbol } = useToken();
  const [showUsdcModal, setShowUsdcModal] = useState(false);

  if (!isTestMode) return null;

  const handleFaucetClick = () => {
    window.open('https://spl-token-faucet.com/?token-name=USDC-Dev', '_blank', 'noopener,noreferrer');
  };

  const handleSolFaucetClick = () => {
    window.open('https://faucet.solana.com', '_blank', 'noopener,noreferrer');
  };

  return (
    <div className="relative">
      <Button 
        variant="outline" 
        onClick={() => setShowUsdcModal(true)}
        className="h-9 px-3 border-blue-500/30 text-blue-400 hover:bg-blue-500/10 text-xs flex"
      >
        <Droplets className="w-3.5 h-3.5 mr-1.5" /> Get {symbol}
      </Button>

      {showUsdcModal && (
        <div className="fixed inset-x-4 top-1/4 sm:absolute sm:inset-auto sm:top-full sm:left-0 sm:right-auto mt-3 sm:w-[340px] max-w-[calc(100vw-2rem)] bg-gray-900 border border-gray-800 shadow-2xl rounded-xl p-5 z-[60] animate-in fade-in slide-in-from-top-2">
          <button onClick={() => setShowUsdcModal(false)} className="absolute right-3 top-3 text-gray-400 hover:text-white transition-colors">
            <X className="w-4 h-4" />
          </button>
          
          <div className="flex items-center gap-3 mb-4 pr-6">
            <div className="w-10 h-10 bg-blue-500/10 rounded-full flex items-center justify-center shrink-0">
              <Droplets className="w-5 h-5 text-blue-500" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white">Get {symbol} / SOL</h2>
              <p className="text-xs text-gray-400 leading-tight mt-0.5">
                Free devnet tokens for testing: {symbol} and SOL.
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

            <div className="pt-4 border-t border-gray-800 space-y-3">
              <p className="text-xs text-gray-400">
                Also need devnet SOL? You need ~0.01 SOL for network fees and ~0.005 SOL for the reputation badge.
              </p>
              <Button
                variant="gradient"
                onClick={handleSolFaucetClick}
                className="w-full h-9 from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-sm"
              >
                Get devnet SOL <ExternalLink className="w-3.5 h-3.5 ml-1.5" />
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
