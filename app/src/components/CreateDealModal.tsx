import { useState, useRef } from 'react';
import { Card } from './Card';
import { Button } from './Button';
import { X, Link2, Check, Loader2 } from 'lucide-react';
import { ShareDealPanel } from './ShareDealPanel';
import { useRole } from '../RoleContext';
import { useWallet } from '@solana/wallet-adapter-react';
import { useWalletModal } from '@solana/wallet-adapter-react-ui';
import { useToken } from '../lib/constants';
import { useSolBalance } from '../hooks/useSolBalance';
import { useNetwork } from '../NetworkContext';
import { client, isChainMode } from '../lib/client';
import { MAX_REQ_FILE_BYTES, sha256HexOfFile } from '../lib/fileHash';
import { PublicKey } from '@solana/web3.js';
import { useToast, notifyActionError } from './Toast';
import { NetworkDepositInfo } from '../lib/rent';
import { getLastTxSig } from '../lib/client/chainClient';

export interface CreateDealInitialValues {
  title?: string;
  amount?: string;
  deadline?: string;
}

export const CreateDealModal = ({
  isOpen,
  onClose,
  initialValues,
}: {
  isOpen: boolean;
  onClose: () => void;
  initialValues?: CreateDealInitialValues;
}) => {
  const { symbol } = useToken();
  const { network, setNetwork, isTestMode } = useNetwork();
  const { solBalance } = useSolBalance();
  const MIN_SOL_REQUIRED = 0.01; // Estimate for rent + network fees
  const balanceKnown = solBalance !== null;
  const lowSol = balanceKnown && solBalance < MIN_SOL_REQUIRED;

  const [step, setStep] = useState<1 | 2>(1);
  const [rawActionUrl, setRawActionUrl] = useState('');
  const [createdDealId, setCreatedDealId] = useState('');
  const { role } = useRole();
  const { connected, publicKey } = useWallet();
  const { setVisible } = useWalletModal();

  const [title, setTitle] = useState(initialValues?.title || '');
  const [amount, setAmount] = useState(initialValues?.amount || '');
  const [criteria, setCriteria] = useState('');
  const [deadline, setDeadline] = useState(initialValues?.deadline || '');
  const [contractorWalletInput, setContractorWalletInput] = useState('');
  const [customerWalletInput, setCustomerWalletInput] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [fileError, setFileError] = useState('');
  const toast = useToast();
  const [reqFile, setReqFile] = useState<{ name: string; sha256: string } | null>(null);
  const [isHashing, setIsHashing] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > MAX_REQ_FILE_BYTES) {
      setFileError('File is too large (max 20 MB)');
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    try {
      setIsHashing(true);
      setFileError('');
      const sha256 = await sha256HexOfFile(file);
      setReqFile({ name: file.name, sha256 });
    } catch (err) {
      console.error('Failed to hash file', err);
      setFileError('Failed to compute file hash');
    } finally {
      setIsHashing(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleRemoveFile = () => {
    setReqFile(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;
    if (!connected) {
      setVisible(true);
      return;
    }

    const errors: Record<string, string> = {};
    let firstInvalidId: string | null = null;
    const setFieldError = (id: string, field: string, msg: string) => {
      errors[field] = msg;
      if (!firstInvalidId) firstInvalidId = id;
    };

    if (!title.trim()) {
      setFieldError('deal-title', 'title', 'Deal Title is required');
    }

    if (role === 'contractor') {
      const trimmedCustomer = customerWalletInput.trim();
      if (!trimmedCustomer) {
        setFieldError('deal-customer', 'customerWallet', 'Customer wallet is required');
      } else {
        try {
          new PublicKey(trimmedCustomer);
          if (publicKey && trimmedCustomer === publicKey.toBase58()) {
            setFieldError('deal-customer', 'customerWallet', 'The customer cannot be the contractor.');
          }
        } catch {
          setFieldError('deal-customer', 'customerWallet', 'Invalid customer wallet: must be a valid Solana public key');
        }
      }
    }

    const parsedAmount = parseFloat(amount);
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      setFieldError('deal-amount', 'amount', 'Amount must be a valid number greater than 0');
    }

    if (!criteria.trim()) {
      setFieldError('deal-criteria', 'criteria', 'Success Criteria is required');
    }

    if (!deadline) {
      setFieldError('deal-deadline', 'deadline', 'Deadline is required');
    } else {
      const selectedDate = new Date(deadline);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      if (selectedDate < today) {
        setFieldError('deal-deadline', 'deadline', 'Deadline cannot be in the past');
      }
    }

    if (firstInvalidId) {
      setFieldErrors(errors);
      const el = document.getElementById(firstInvalidId);
      if (el) {
        el.scrollIntoView({ block: 'center', behavior: 'smooth' });
        el.focus();
      }
      return;
    }
    setFieldErrors({});

    const baseUrl = import.meta.env.VITE_ACTIONS_API_URL || 'http://localhost:3001';
    let dealId = `ESC-${Math.floor(1000 + Math.random() * 9000)}`;
    const walletAddr = connected && publicKey ? publicKey.toBase58() : '';

    setIsSubmitting(true);
    try {
      const deal = await client.createDeal({
        role,
        wallet: walletAddr,
        title: title.trim(),
        successCriteria: criteria.trim(),
        amount: parseFloat(amount),
        deadline,
        ...(role === 'customer' && contractorWalletInput.trim() ? { contractorWallet: contractorWalletInput.trim() } : {}),
        ...(role === 'contractor' && customerWalletInput.trim() ? { customerWallet: customerWalletInput.trim() } : {}),
        ...(reqFile ? { requirementsFile: reqFile } : {}),
      });
      dealId = deal.id;
      const txSig = getLastTxSig();
      toast.success('Deal created', { txSig: txSig || undefined });
    } catch (err: any) {
      notifyActionError(toast, err, () => handleGenerate(e));
      return;
    } finally {
      setIsSubmitting(false);
    }
    
    const customerWallet = role === 'customer' ? walletAddr : customerWalletInput.trim();
    const finalContractorWallet = role === 'contractor' ? walletAddr : (role === 'customer' ? contractorWalletInput.trim() : '');
    
    const truncatedCriteria = criteria.trim().substring(0, 500);
    const queryParams = new URLSearchParams({
      title: title.trim(),
      amount: amount,
      token: 'USDC',
      status: 'Awaiting Funding',
      criteria: truncatedCriteria,
      deadline: deadline,
      ...(customerWallet && { customerWallet }),
      ...(finalContractorWallet && { contractorWallet: finalContractorWallet })
    });
    const queryString = `?${queryParams.toString()}`;
    
    // The HTML wrapper URL format expected by X/Telegram unfurling bots
    setRawActionUrl(`${baseUrl}/deal/${dealId}${queryString}`);
    setCreatedDealId(dealId);
    
    setStep(2);
  };



  const handleClose = () => {
    setStep(1);
    setTitle('');
    setAmount('');
    setCriteria('');
    setDeadline('');
    setContractorWalletInput('');
    setCustomerWalletInput('');
    setFieldErrors({});
    setReqFile(null);
    setCreatedDealId('');
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-gray-950/80 backdrop-blur-sm animate-in fade-in">
      <Card className="w-full max-w-lg bg-gray-900 border-gray-800 shadow-2xl relative max-h-[90vh] flex flex-col">
        <button onClick={handleClose} aria-label="Close" className="absolute right-4 top-4 z-10 text-gray-400 hover:text-white transition-colors bg-gray-900/50 rounded-full p-1">
          <X className="w-5 h-5" />
        </button>

        <div className="p-6 overflow-y-auto max-h-[90vh]">
          {step === 1 ? (
            <form noValidate onSubmit={handleGenerate} className="space-y-4">
              <div>
                <h2 className="text-xl font-bold mb-1">Create New Deal</h2>
                <p className="text-sm text-gray-400 mb-6">Set escrow terms and generate a link for your partner.</p>
              </div>
              <div>
                <label htmlFor="deal-title" className="block text-sm font-medium text-gray-300 mb-1.5">Deal Title</label>
                <input id="deal-title" type="text" maxLength={100} placeholder="e.g. Website Redesign" value={title} onChange={(e) => { setTitle(e.target.value); setFieldErrors(prev => ({ ...prev, title: '' })); }} className="w-full bg-gray-950 border border-gray-800 rounded-lg px-4 py-2.5 focus:outline-none focus:border-purple-500/50 focus:ring-1 focus:ring-purple-500/50 transition-all text-white" />
                {fieldErrors.title && <p className="text-red-400 text-xs mt-1">{fieldErrors.title}</p>}
              </div>

              {role === 'customer' && isChainMode && (
                <div>
                  <label htmlFor="deal-contractor" className="block text-sm font-medium text-gray-300 mb-1.5">Contractor Wallet (Optional)</label>
                  <input id="deal-contractor" type="text" placeholder="Leave empty: contractors will apply and you choose one" value={contractorWalletInput} onChange={(e) => setContractorWalletInput(e.target.value)} className="w-full bg-gray-950 border border-gray-800 rounded-lg px-4 py-2.5 focus:outline-none focus:border-purple-500/50 focus:ring-1 focus:ring-purple-500/50 transition-all text-white font-mono text-sm" />
                  <p className="text-xs text-gray-500 mt-1">You can also invite a specific contractor by pasting their wallet.</p>
                </div>
              )}

              {role === 'contractor' && (
                <div>
                  <label htmlFor="deal-customer" className="block text-sm font-medium text-gray-300 mb-1.5">Customer Wallet</label>
                  <input id="deal-customer" type="text" placeholder="Paste customer's Solana wallet address" value={customerWalletInput} onChange={(e) => { setCustomerWalletInput(e.target.value); setFieldErrors(prev => ({ ...prev, customerWallet: '' })); }} className="w-full bg-gray-950 border border-gray-800 rounded-lg px-4 py-2.5 focus:outline-none focus:border-purple-500/50 focus:ring-1 focus:ring-purple-500/50 transition-all text-white font-mono text-sm" />
                  <p className="text-xs text-gray-500 mt-1">The customer pays into escrow after opening the link.</p>
                  {fieldErrors.customerWallet && <p className="text-red-400 text-xs mt-1">{fieldErrors.customerWallet}</p>}
                </div>
              )}

              <div>
                <label htmlFor="deal-amount" className="block text-sm font-medium text-gray-300 mb-1.5">Amount ({symbol})</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">$</span>
                  <input id="deal-amount" type="number" min="0.01" step="0.01" autoComplete="off" onWheel={(e) => e.currentTarget.blur()} placeholder="0.00" value={amount} onChange={(e) => { setAmount(e.target.value); setFieldErrors(prev => ({ ...prev, amount: '' })); }} className="w-full bg-gray-950 border border-gray-800 rounded-lg pl-8 pr-4 py-2.5 focus:outline-none focus:border-purple-500/50 focus:ring-1 focus:ring-purple-500/50 transition-all text-white" />
                </div>
                {fieldErrors.amount && <p className="text-red-400 text-xs mt-1">{fieldErrors.amount}</p>}
              </div>

              <div>
                <label htmlFor="deal-criteria" className="block text-sm font-medium text-gray-300 mb-1.5">Success Criteria</label>
                <textarea id="deal-criteria" maxLength={1000} rows={4} value={criteria} onChange={(e) => { setCriteria(e.target.value); setFieldErrors(prev => ({ ...prev, criteria: '' })); }} placeholder="Describe exactly what needs to be delivered to release the funds..." className="w-full bg-gray-950 border border-gray-800 rounded-lg px-4 py-2.5 focus:outline-none focus:border-purple-500/50 focus:ring-1 focus:ring-purple-500/50 transition-all text-white resize-none"></textarea>
                {fieldErrors.criteria && <p className="text-red-400 text-xs mt-1">{fieldErrors.criteria}</p>}
                <div className="flex flex-col gap-1.5 mt-2">
                  <input
                    ref={fileInputRef}
                    type="file"
                    className="hidden"
                    onChange={handleFileSelect}
                  />
                  <button
                    type="button"
                    disabled={isHashing}
                    onClick={() => fileInputRef.current?.click()}
                    className="text-xs text-purple-400 hover:text-purple-300 flex items-center gap-1 transition-colors w-fit disabled:opacity-50"
                  >
                    <Link2 className="w-3 h-3" />
                    {isHashing ? 'Hashing file…' : 'Attach File (Requirements)'}
                  </button>
                  {fileError && <p className="text-red-400 text-xs mt-1">{fileError}</p>}
                  {reqFile && (
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 text-xs text-gray-300">
                        <span className="font-medium text-white truncate max-w-[200px]" title={reqFile.name}>{reqFile.name}</span>
                        <span className="font-mono text-gray-400">({reqFile.sha256.slice(0, 10)}…)</span>
                        <button
                          type="button"
                          onClick={handleRemoveFile}
                          className="text-gray-400 hover:text-white p-0.5 rounded transition-colors"
                          aria-label="Remove attached file"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                      <p className="text-[11px] text-gray-500 leading-tight">
                        The file is not uploaded. Only its SHA-256 fingerprint is stored in the deal. Send the file to your contractor separately.
                      </p>
                    </div>
                  )}
                </div>
              </div>

              <div>
                <label htmlFor="deal-deadline" className="block text-sm font-medium text-gray-300 mb-1.5">Deadline</label>
                <input 
                  id="deal-deadline"
                  type="date" 
                  value={deadline}
                  onChange={(e) => { setDeadline(e.target.value); setFieldErrors(prev => ({ ...prev, deadline: '' })); }}
                  onClick={(e) => 'showPicker' in HTMLInputElement.prototype && e.currentTarget.showPicker()}
                  className="w-full bg-gray-950 border border-gray-800 rounded-lg px-4 py-2.5 focus:outline-none focus:border-purple-500/50 focus:ring-1 focus:ring-purple-500/50 transition-all text-white cursor-pointer [&::-webkit-calendar-picker-indicator]:invert [&::-webkit-calendar-picker-indicator]:opacity-70 hover:[&::-webkit-calendar-picker-indicator]:opacity-100" 
                />
                {fieldErrors.deadline && <p className="text-red-400 text-xs mt-1">{fieldErrors.deadline}</p>}
              </div>
              <div className="pt-4 space-y-4">
                <NetworkDepositInfo type="deal" wallet={publicKey?.toBase58()} />
                {lowSol && (role === 'customer' || role === 'contractor') && (
                  <div className="mb-4 bg-orange-500/10 border border-orange-500/20 rounded-lg p-3 text-sm text-orange-400">
                    You need a small amount of SOL (~0.01) to cover network fees and account rent.
                    {balanceKnown && ` Your SOL balance: ${solBalance.toFixed(3)} SOL.`}
                    {isTestMode && (
                      <a href="https://faucet.solana.com" target="_blank" rel="noopener noreferrer" className="ml-1 text-orange-300 font-medium hover:underline">
                        Get devnet SOL →
                      </a>
                    )}
                  </div>
                )}
                {!connected ? (
                  <Button 
                    variant="gradient" 
                    className="w-full py-2.5 text-base" 
                    type="button"
                    onClick={() => setVisible(true)}
                  >
                    Connect Wallet
                  </Button>
                ) : (
                  <Button 
                    variant="gradient" 
                    className={`w-full py-2.5 text-base ${(lowSol && (role === 'customer' || role === 'contractor')) || isSubmitting ? 'opacity-50 cursor-not-allowed' : ''}`} 
                    type="submit"
                    disabled={(lowSol && (role === 'customer' || role === 'contractor')) || isSubmitting}
                    title={lowSol && (role === 'customer' || role === 'contractor') ? "Not enough SOL for network fees" : undefined}
                  >
                    {isSubmitting ? (
                      <span className="inline-flex items-center justify-center gap-2">
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Creating... confirm in Phantom
                      </span>
                    ) : (
                      'Create Deal Link'
                    )}
                  </Button>
                )}
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
                    ? 'Send this link to the customer so they can fund the escrow.' 
                    : 'Send this link to potential contractors.'}
                </p>
              </div>
              
              <ShareDealPanel 
                rawActionUrl={rawActionUrl} 
                dealId={createdDealId} 
              />

              <Button
                variant="gradient"
                className="w-full py-2.5 text-base"
                onClick={handleClose}
              >
                OK
              </Button>
            </div>
          )}
        </div>
      </Card>
    </div>
  );
};
