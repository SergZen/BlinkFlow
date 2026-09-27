import { useState } from 'react';
import { Card } from './Card';
import { Button } from './Button';
import { X, Link2, Check } from 'lucide-react';
import { ShareDealPanel } from './ShareDealPanel';
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
  const { connected, publicKey } = useWallet();

  if (!isOpen) return null;

  const [title, setTitle] = useState('');
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
    if (!title.trim()) {
      setError('Deal Title is required');
      return;
    }
    
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
    
    const dealId = `ESC-${Math.floor(1000 + Math.random() * 9000)}`;
    const walletAddr = connected && publicKey ? publicKey.toBase58() : '';
    const customerWallet = role === 'customer' ? walletAddr : '';
    const contractorWallet = role === 'contractor' ? walletAddr : '';
    
    const queryParams = new URLSearchParams({
      title: title.trim(),
      amount: amount,
      token: 'USDC',
      status: 'Awaiting Funding',
      ...(customerWallet && { customerWallet }),
      ...(contractorWallet && { contractorWallet })
    });
    const queryString = `?${queryParams.toString()}`;
    
    // The Dial.to wrapped link
    setBlinkUrl(`https://dial.to/?action=solana-action:${encodeURIComponent(`${baseUrl}/api/deal/${dealId}`)}`);
    // The HTML wrapper URL format expected by X/Telegram unfurling bots
    setRawActionUrl(`${baseUrl}/deal/${dealId}${queryString}`);
    
    setStep(2);
  };

  const handleCopy = (url: string) => {
    navigator.clipboard.writeText(url);
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
                <label htmlFor="deal-title" className="block text-sm font-medium text-gray-300 mb-1.5">Deal Title</label>
                <input id="deal-title" type="text" required maxLength={100} placeholder="e.g. Website Redesign" value={title} onChange={(e) => setTitle(e.target.value)} className="w-full bg-gray-950 border border-gray-800 rounded-lg px-4 py-2.5 focus:outline-none focus:border-purple-500/50 focus:ring-1 focus:ring-purple-500/50 transition-all text-white" />
              </div>

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
              
              <ShareDealPanel 
                rawActionUrl={rawActionUrl} 
                dealId="ESC-1006" 
                onCopy={handleCopy} 
              />
            </div>
          )}
        </div>
      </Card>
    </div>
  );
};
