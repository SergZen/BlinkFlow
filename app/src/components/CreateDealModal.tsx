import { useState } from 'react';
import { Card } from './Card';
import { Button } from './Button';
import { X, Link2, Check, Share2, Copy } from 'lucide-react';
import { useRole } from '../RoleContext';
import { useWallet } from '@solana/wallet-adapter-react';
import { TOKEN_SYMBOL } from '../lib/constants';

export const CreateDealModal = ({ isOpen, onClose }: { isOpen: boolean, onClose: () => void }) => {
  const [step, setStep] = useState<1 | 2>(1);
  const [blinkUrl, setBlinkUrl] = useState('');
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
    setBlinkUrl(`https://dial.to/?action=solana-action:${baseUrl}/api/deal/ESC-1006`);
    setStep(2);
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(blinkUrl);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-950/80 backdrop-blur-sm animate-in fade-in">
      <Card className="w-full max-w-lg bg-gray-900 border-gray-800 shadow-2xl relative overflow-visible">
        <button onClick={onClose} aria-label="Close" className="absolute right-4 top-4 text-gray-400 hover:text-white transition-colors">
          <X className="w-5 h-5" />
        </button>

        <div className="p-6">
          <h2 className="text-xl font-bold mb-1">Create New Deal</h2>
          <p className="text-sm text-gray-400 mb-6">Set escrow terms and generate a Blink for your partner.</p>

          {step === 1 ? (
            <form onSubmit={handleGenerate} className="space-y-4">
              {error && (
                <div className="bg-red-500/10 border border-red-500/20 text-red-400 px-3 py-2 rounded-lg text-sm mb-4">
                  {error}
                </div>
              )}
              <div>
                <label htmlFor="deal-amount" className="block text-sm font-medium text-gray-300 mb-1.5">Amount ({TOKEN_SYMBOL})</label>
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
                <Button variant="gradient" className="w-full py-2.5 text-base" type="submit">
                  Generate Blink Link
                </Button>
              </div>
            </form>
          ) : (
            <div className="py-6 flex flex-col items-center text-center space-y-4 animate-in zoom-in-95">
              <div className="w-16 h-16 bg-green-500/10 rounded-full flex items-center justify-center mb-2">
                <Check className="w-8 h-8 text-green-500" />
              </div>
              <div>
                <h3 className="text-lg font-bold">
                  {role === 'freelancer' ? 'Deal Created!' : 'Deal Created & Funded!'}
                </h3>
                <p className="text-sm text-gray-400 mt-1">
                  {role === 'freelancer' 
                    ? 'Send this Blink to the client so they can fund the escrow.' 
                    : 'Send this Blink to potential freelancers.'}
                </p>
              </div>
              
              <div className="w-full p-1 bg-gray-950 rounded-lg border border-gray-800 flex items-center gap-2 mt-4">
                <div className="flex-1 overflow-hidden">
                  <input type="text" readOnly value={blinkUrl} className="w-full bg-transparent text-sm text-gray-400 px-3 outline-none" />
                </div>
                <Button variant="secondary" onClick={handleCopy} className="shrink-0">
                  <Copy className="w-4 h-4" /> Copy
                </Button>
              </div>

              <div className="flex w-full gap-3 mt-4">
                <Button variant="outline" className="flex-1 border-blue-500/30 text-blue-400 hover:bg-blue-500/10">
                  <Share2 className="w-4 h-4 mr-2" /> Telegram
                </Button>
                <Button variant="outline" className="flex-1 border-sky-500/30 text-sky-400 hover:bg-sky-500/10">
                  <Share2 className="w-4 h-4 mr-2" /> Twitter
                </Button>
              </div>
            </div>
          )}
        </div>
      </Card>
    </div>
  );
};
