import { useState } from 'react';
import { Card } from './Card';
import { Button } from './Button';
import { X, Link2, Check, Share2, Copy } from 'lucide-react';
import { useRole } from '../RoleContext';
import { useWallet } from '@solana/wallet-adapter-react';
import { useToken } from '../lib/constants';
import { useSolBalance } from '../hooks/useSolBalance';
import { useNetwork } from '../NetworkContext';

export const CreateDealModal = ({ isOpen, onClose }: { isOpen: boolean, onClose: () => void }) => {
  const { symbol } = useToken();
  const { isTestMode } = useNetwork();
  const { solBalance } = useSolBalance();
  const MIN_SOL_REQUIRED = 0.01; // Estimate for rent + network fees
  const hasEnoughSol = solBalance !== null && solBalance >= MIN_SOL_REQUIRED;

  const [step, setStep] = useState<1 | 2>(1);
  const [blinkUrl, setBlinkUrl] = useState('');
  const [rawActionUrl, setRawActionUrl] = useState('');
  const { role } = useRole();
  const { connected } = useWallet();

  if (!isOpen) return null;

  const [amount, setAmount] = useState('');
  const [deadline, setDeadline] = useState('');
  const [error, setError] = useState('');

  const handleGenerate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!connected) {
      setError("Please connect your Solana wallet to create a deal.");
      return;
    }
    
    // Basic validation
    const parsedAmount = parseFloat(amount);
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      setError('Amount must be a valid number greater than 0');
      return;
    }
    
    const selectedDate = new Date(deadline);
    const today = new Date();
    today.setHours(0, 0, 0, 0); // Reset time to start of day for fair comparison
    
    if (selectedDate < today) {
      setError('Deadline cannot be in the past');
      return;
    }
    
    setError('');
    // TODO: replace with real transaction once Anchor program is deployed
    const baseUrl = import.meta.env.VITE_ACTIONS_API_URL || 'http://localhost:3001';
    
    // The Dial.to wrapped link
    setBlinkUrl(`https://dial.to/?action=solana-action:${encodeURIComponent(`${baseUrl}/api/deal/ESC-1006`)}`);
    // The HTML wrapper URL format expected by X/Telegram unfurling bots
    setRawActionUrl(`${baseUrl}/deal/ESC-1006`);
    
    setStep(2);
  };

  const handleCopy = (url: string) => {
    navigator.clipboard.writeText(url);
  };

  const handleShareTelegram = () => {
    const text = encodeURIComponent('Check out this BlinkFlow deal!');
    const url = encodeURIComponent(rawActionUrl);
    const deepLink = `tg://msg_url?url=${url}&text=${text}`;
    const fallbackLink = `https://t.me/share/url?url=${url}&text=${text}`;

    // Attempt to open the native Telegram app
    window.location.href = deepLink;

    // Fallback if the app doesn't take over (document remains visible)
    setTimeout(() => {
      if (!document.hidden) {
        window.open(fallbackLink, '_blank');
      }
    }, 1500);
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-gray-950/80 backdrop-blur-sm animate-in fade-in">
      <Card className="w-full max-w-lg bg-gray-900 border-gray-800 shadow-2xl relative max-h-[90vh] flex flex-col">
        <button onClick={onClose} aria-label="Close" className="absolute right-4 top-4 z-10 text-gray-400 hover:text-white transition-colors bg-gray-900/50 rounded-full p-1">
          <X className="w-5 h-5" />
        </button>

        <div className="p-6 overflow-y-auto max-h-[90vh]">
          {step === 1 ? (
            <form onSubmit={handleGenerate} className="space-y-4">
              <div>
                <h2 className="text-xl font-bold mb-1">Create New Deal</h2>
                <p className="text-sm text-gray-400 mb-6">Set escrow terms and generate a Blink for your partner.</p>
              </div>
              {error && (
                <div className="bg-red-500/10 border border-red-500/20 text-red-400 px-3 py-2 rounded-lg text-sm mb-4">
                  {error}
                </div>
              )}
              <div>
                <label htmlFor="deal-amount" className="block text-sm font-medium text-gray-300 mb-1.5">Amount ({symbol})</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">$</span>
                  <input id="deal-amount" type="number" min="0.01" step="0.01" required placeholder="0.00" value={amount} onChange={(e) => setAmount(e.target.value)} className="w-full bg-gray-950 border border-gray-800 rounded-lg pl-8 pr-4 py-2.5 focus:outline-none focus:border-purple-500/50 focus:ring-1 focus:ring-purple-500/50 transition-all text-white" />
                </div>
              </div>

              <div>
                <label htmlFor="deal-criteria" className="block text-sm font-medium text-gray-300 mb-1.5">Success Criteria</label>
                <textarea id="deal-criteria" required maxLength={1000} rows={4} placeholder="Describe exactly what needs to be delivered to release the funds..." className="w-full bg-gray-950 border border-gray-800 rounded-lg px-4 py-2.5 focus:outline-none focus:border-purple-500/50 focus:ring-1 focus:ring-purple-500/50 transition-all text-white resize-none"></textarea>
                <div className="flex items-center gap-2 mt-2">
                  <button type="button" className="text-xs text-purple-400 hover:text-purple-300 flex items-center gap-1 transition-colors">
                    <Link2 className="w-3 h-3" /> Attach File (Requirements)
                  </button>
                </div>
              </div>

              <div>
                <label htmlFor="deal-deadline" className="block text-sm font-medium text-gray-300 mb-1.5">Deadline</label>
                <input 
                  id="deal-deadline"
                  type="date" 
                  required 
                  value={deadline}
                  onChange={(e) => setDeadline(e.target.value)}
                  onClick={(e) => 'showPicker' in HTMLInputElement.prototype && e.currentTarget.showPicker()}
                  className="w-full bg-gray-950 border border-gray-800 rounded-lg px-4 py-2.5 focus:outline-none focus:border-purple-500/50 focus:ring-1 focus:ring-purple-500/50 transition-all text-white cursor-pointer [&::-webkit-calendar-picker-indicator]:invert [&::-webkit-calendar-picker-indicator]:opacity-70 hover:[&::-webkit-calendar-picker-indicator]:opacity-100" 
                />
              </div>

              <div className="pt-4">
                {!hasEnoughSol && role === 'customer' && (
                  <div className="mb-4 bg-orange-500/10 border border-orange-500/20 rounded-lg p-3 text-sm text-orange-400">
                    You need a small amount of SOL (~0.01) to cover network fees and account rent.
                    {isTestMode && (
                      <a href="https://faucet.solana.com" target="_blank" rel="noopener noreferrer" className="ml-1 text-orange-300 font-medium hover:underline">
                        Get devnet SOL →
                      </a>
                    )}
                  </div>
                )}
                
                <Button 
                  variant="gradient" 
                  className={`w-full py-2.5 text-base ${(!hasEnoughSol && role === 'customer') ? 'opacity-50 cursor-not-allowed' : ''}`} 
                  type="submit"
                  disabled={!hasEnoughSol && role === 'customer'}
                >
                  Generate Blink Link
                </Button>
              </div>
            </form>
          ) : (
            <div className="py-2 flex flex-col items-center text-center space-y-5 animate-in zoom-in-95">
              <div className="flex flex-col items-center gap-3 w-full">
                <div className="flex items-center justify-center gap-3 w-full">
                  <div className="w-8 h-8 bg-green-500 rounded-full flex items-center justify-center shrink-0 shadow-[0_0_15px_rgba(34,197,94,0.4)]">
                    <Check className="w-5 h-5 text-gray-950" strokeWidth={4} />
                  </div>
                  <h3 className="text-2xl font-bold text-white tracking-tight">
                    {role === 'contractor' ? 'Deal Created!' : 'Deal Created & Funded!'}
                  </h3>
                </div>
                <p className="text-sm text-gray-400">
                  {role === 'contractor' 
                    ? 'Send this Blink to the customer so they can fund the escrow.' 
                    : 'Send this Blink to potential contractors.'}
                </p>
              </div>
              
              <div className="w-full mt-6">
                <p className="text-sm font-medium text-gray-400 mb-4 text-center uppercase tracking-wider">Share to</p>
                <div className="flex justify-center gap-4">
                  <Button 
                    variant="gradient" 
                    className="w-16 h-16 rounded-2xl flex items-center justify-center shadow-lg shadow-purple-500/20 p-0 hover:scale-105 transition-transform"
                    onClick={handleShareTelegram}
                    title="Share to Telegram"
                  >
                    <svg className="w-7 h-7" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm4.64 6.8c-.15 1.58-.8 5.42-1.13 7.19-.14.75-.42 1-.68 1.03-.58.05-1.02-.38-1.58-.75-.88-.58-1.38-.94-2.23-1.5-.99-.65-.35-1.01.22-1.59.15-.15 2.71-2.48 2.76-2.69a.2.2 0 00-.05-.18c-.06-.05-.14-.03-.21-.02-.09.02-1.49.95-4.22 2.79-.4.27-.76.41-1.08.4-.36-.01-1.04-.2-1.55-.37-.63-.2-1.12-.31-1.08-.66.02-.18.27-.36.74-.55 2.92-1.27 4.86-2.11 5.83-2.51 2.78-1.16 3.35-1.36 3.73-1.36.08 0 .27.02.39.12.1.08.13.19.14.27-.01.04.01.12 0 .18z"/>
                    </svg>
                  </Button>
                  <Button 
                    variant="gradient" 
                    className="w-16 h-16 rounded-2xl flex items-center justify-center shadow-lg shadow-purple-500/20 p-0 hover:scale-105 transition-transform"
                    onClick={() => window.open(`https://twitter.com/intent/tweet?url=${encodeURIComponent(rawActionUrl)}&text=${encodeURIComponent('Check out this BlinkFlow deal!')}`, '_blank')}
                    title="Share to X / Twitter"
                  >
                    <svg className="w-7 h-7" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 22.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
                    </svg>
                  </Button>
                </div>
              </div>

              {/* Secondary actions */}
              <div className="flex flex-col items-center gap-2 mt-4 w-full">
                <button onClick={() => handleCopy(rawActionUrl)} className="text-sm text-gray-500 hover:text-gray-300 flex items-center gap-1.5 transition-colors underline decoration-gray-700 underline-offset-4">
                  <Copy className="w-3.5 h-3.5" /> Copy link instead
                </button>
              </div>
            </div>
          )}
        </div>
      </Card>
    </div>
  );
};
