import { useState, useRef, useEffect } from 'react';
import { Card } from './Card';
import { Button } from './Button';
import { X, Link2, Check, Loader2, Plus } from 'lucide-react';
import { ShareDealPanel } from './ShareDealPanel';
import { useRole } from '../RoleContext';
import { useWallet } from '@solana/wallet-adapter-react';
import { useWalletModal } from '@solana/wallet-adapter-react-ui';
import { useToken } from '../lib/constants';
import { useSolBalance } from '../hooks/useSolBalance';
import { useUsdcBalance } from '../hooks/useUsdcBalance';
import { useNetwork } from '../NetworkContext';
import { client, isChainMode } from '../lib/client';
import { MAX_REQ_FILE_BYTES, sha256HexOfFile } from '../lib/fileHash';
import { PublicKey } from '@solana/web3.js';
import { useToast, notifyActionError } from './Toast';
import { NetworkDepositInfo } from '../lib/rent';
import { getLastTxSig } from '../lib/client/chainClient';
import { loadDraft, saveDraft, clearDraft } from '../lib/draft';
import { useTxBarVisible } from './TxStatusBar';
import { buildDealLink, type ParsedDealLink } from '../lib/dealLink';
import { addSentLink } from '../lib/sentLinks';

export interface CreateDealInitialValues {
  title?: string;
  amount?: string;
  deadline?: string;
  fromLink?: ParsedDealLink;
}

interface ExtraStage {
  id: string;
  title: string;
  amount: string;
  criteria: string;
  deadline: string;
  deadlineAdjusted?: boolean;
  reqFile: { name: string; sha256: string } | null;
  fileError?: string;
  isHashing?: boolean;
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
  const { isTestMode } = useNetwork();
  const { solBalance } = useSolBalance();
  const { balance: usdcBalance } = useUsdcBalance();
  const MIN_SOL_REQUIRED = 0.01; // Estimate for rent + network fees
  const balanceKnown = solBalance !== null;
  const lowSol = balanceKnown && solBalance < MIN_SOL_REQUIRED;

  const [step, setStep] = useState<1 | 2>(1);
  const [rawActionUrl, setRawActionUrl] = useState('');
  const [createdDealId, setCreatedDealId] = useState('');
  const [createdViaLink, setCreatedViaLink] = useState(false);
  const { role } = useRole();
  const { connected, publicKey } = useWallet();
  const { setVisible } = useWalletModal();

  const isFromLink = Boolean(initialValues?.fromLink);
  const fromLink = initialValues?.fromLink;

  // Deal-level fields (for several stages)
  const [severalStages, setSeveralStages] = useState(false);
  const [dealTitleInput, setDealTitleInput] = useState('');
  const [dealDescriptionInput, setDealDescriptionInput] = useState('');

  // Stage 1 fields
  const [title, setTitle] = useState(initialValues?.title || '');
  const [amount, setAmount] = useState(initialValues?.amount || '');
  const [criteria, setCriteria] = useState('');
  const [deadline, setDeadline] = useState(initialValues?.deadline || '');
  const [reqFile, setReqFile] = useState<{ name: string; sha256: string } | null>(null);
  const [isHashing, setIsHashing] = useState(false);
  const [fileError, setFileError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Extra stages (up to 4 more, max 5 total)
  const [extraStages, setExtraStages] = useState<ExtraStage[]>([]);

  // Wallets
  const [contractorWalletInput, setContractorWalletInput] = useState('');
  const [customerWalletInput, setCustomerWalletInput] = useState('');
  const [contractorMode, setContractorMode] = useState<'link' | 'wallet'>('link');

  // Draft state
  const [isDraftRestored, setIsDraftRestored] = useState(false);
  const [isFileRestoredFromDraft, setIsFileRestoredFromDraft] = useState(false);

  const txBarVisible = useTxBarVisible();
  const draftScope = role === 'customer' ? 'create:customer' : 'create:contractor';
  const isContractorLinkMode = role === 'contractor' && contractorMode === 'link';

  useEffect(() => {
    if (!isOpen) { setIsDraftRestored(false); setIsFileRestoredFromDraft(false); return; }

    if (isFromLink && fromLink) {
      setIsDraftRestored(false);
      setIsFileRestoredFromDraft(false);
      setContractorWalletInput(fromLink.contractorWallet);
      setTitle(fromLink.title);
      setAmount(fromLink.amount);
      setCriteria(fromLink.criteria);
      setDeadline(fromLink.deadline);
      setReqFile(fromLink.reqFile);
      setSeveralStages(fromLink.extraStages.length > 0);
      setDealTitleInput(fromLink.dealTitle || '');
      setDealDescriptionInput(fromLink.dealDescription || '');
      if (fromLink.extraStages.length > 0) {
        setExtraStages(
          fromLink.extraStages.map((s, idx) => ({
            id: `stage-${idx + 1}-${Date.now()}`,
            title: s.title,
            amount: s.amount,
            criteria: s.criteria,
            deadline: s.deadline,
            deadlineAdjusted: s.deadlineAdjusted,
            reqFile: s.reqFile,
          }))
        );
      } else {
        setExtraStages([]);
      }
      return;
    }

    const d = loadDraft<any>(draftScope);
    if (d) {
      setIsDraftRestored(true);
      if (d.contractorMode === 'wallet' || d.contractorMode === 'link') {
        setContractorMode(d.contractorMode);
      } else {
        setContractorMode('link');
      }
      setTitle(initialValues?.title ?? d.title ?? '');
      setAmount(initialValues?.amount ?? d.amount ?? '');
      setDeadline(initialValues?.deadline ?? d.deadline ?? '');
      if (d.criteria) setCriteria(d.criteria);
      if (d.contractorWalletInput) setContractorWalletInput(d.contractorWalletInput);
      if (d.customerWalletInput) setCustomerWalletInput(d.customerWalletInput);
      if (d.severalStages) setSeveralStages(Boolean(d.severalStages));
      if (d.dealTitleInput) setDealTitleInput(d.dealTitleInput);
      if (d.dealDescriptionInput) setDealDescriptionInput(d.dealDescriptionInput);
      if (d.reqFile?.name && d.reqFile?.sha256) {
        setReqFile({ name: d.reqFile.name, sha256: d.reqFile.sha256 });
        setIsFileRestoredFromDraft(true);
      }
      if (Array.isArray(d.extraStages)) {
        setExtraStages(d.extraStages.map((s: any, idx: number) => ({
          id: s.id || `stage-${idx + 1}-${Date.now()}`,
          title: s.title || '', amount: s.amount || '', criteria: s.criteria || '', deadline: s.deadline || '',
          reqFile: s.reqFile ? { name: s.reqFile.name, sha256: s.reqFile.sha256 } : null,
        })));
      }
    } else {
      setContractorMode('link');
      if (initialValues?.title) setTitle(initialValues.title);
      if (initialValues?.amount) setAmount(initialValues.amount);
      if (initialValues?.deadline) setDeadline(initialValues.deadline);
    }
  }, [isOpen, role, isFromLink, fromLink]);

  useEffect(() => {
    if (!isOpen || step !== 1 || isFromLink) return;
    const timer = setTimeout(() => {
      const hasContent = Boolean(title.trim() || amount || criteria.trim() || deadline || contractorWalletInput.trim() || customerWalletInput.trim() || dealTitleInput.trim() || dealDescriptionInput.trim() || reqFile || (extraStages && extraStages.length > 0));
      if (!hasContent) return;
      saveDraft(draftScope, {
        contractorMode,
        title, amount, criteria, deadline, contractorWalletInput, customerWalletInput, severalStages, dealTitleInput, dealDescriptionInput,
        reqFile: reqFile ? { name: reqFile.name, sha256: reqFile.sha256 } : null,
        extraStages: extraStages.map(s => ({ id: s.id, title: s.title, amount: s.amount, criteria: s.criteria, deadline: s.deadline, reqFile: s.reqFile ? { name: s.reqFile.name, sha256: s.reqFile.sha256 } : null })),
      });
    }, 500);
    return () => clearTimeout(timer);
  }, [isOpen, step, isFromLink, draftScope, contractorMode, title, amount, criteria, deadline, contractorWalletInput, customerWalletInput, severalStages, dealTitleInput, dealDescriptionInput, reqFile, extraStages]);

  const handleClearDraft = () => {
    clearDraft(draftScope);
    setIsDraftRestored(false);
    setIsFileRestoredFromDraft(false);
    setContractorMode('link');
    setTitle(initialValues?.title || ''); setAmount(initialValues?.amount || ''); setDeadline(initialValues?.deadline || '');
    setCriteria(''); setReqFile(null); setSeveralStages(false); setDealTitleInput(''); setDealDescriptionInput('');
    setExtraStages([]); setContractorWalletInput(''); setCustomerWalletInput(''); setFieldErrors({});
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const minDeadlineStr = new Date().toISOString().slice(0, 10);
  const maxDeadlineDate = new Date();
  maxDeadlineDate.setDate(maxDeadlineDate.getDate() + 365);
  const maxDeadlineStr = maxDeadlineDate.toISOString().slice(0, 10);

  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const toast = useToast();

  const stage1Amount = parseFloat(amount) || 0;
  const extraTotal = severalStages
    ? extraStages.reduce((sum, s) => sum + (parseFloat(s.amount) || 0), 0)
    : 0;
  const totalAmount = stage1Amount + extraTotal;
  const totalStages = 1 + (severalStages ? extraStages.length : 0);
  const isInsufficientUsdc =
    role === 'customer' &&
    usdcBalance !== null &&
    totalAmount > 0 &&
    usdcBalance < totalAmount;

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
      setIsFileRestoredFromDraft(false);
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
    setIsFileRestoredFromDraft(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleExtraStageFileSelect = async (idx: number, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > MAX_REQ_FILE_BYTES) {
      setExtraStages(prev => prev.map((s, i) => i === idx ? { ...s, fileError: 'File is too large (max 20 MB)' } : s));
      e.target.value = '';
      return;
    }

    try {
      setExtraStages(prev => prev.map((s, i) => i === idx ? { ...s, isHashing: true, fileError: '' } : s));
      const sha256 = await sha256HexOfFile(file);
      setExtraStages(prev => prev.map((s, i) => i === idx ? { ...s, reqFile: { name: file.name, sha256 }, isHashing: false } : s));
    } catch (err) {
      console.error('Failed to hash file', err);
      setExtraStages(prev => prev.map((s, i) => i === idx ? { ...s, fileError: 'Failed to compute file hash', isHashing: false } : s));
    } finally {
      e.target.value = '';
    }
  };

  const handleRemoveExtraStageFile = (idx: number) => {
    setExtraStages(prev => prev.map((s, i) => i === idx ? { ...s, reqFile: null } : s));
  };

  const handleAddStage = () => {
    if (extraStages.length >= 4) return;
    setExtraStages(prev => [
      ...prev,
      {
        id: Math.random().toString(36).substring(2, 9),
        title: '',
        amount: '',
        criteria: '',
        deadline: '',
        reqFile: null,
      },
    ]);
  };

  const handleRemoveStage = (idx: number) => {
    setExtraStages(prev => prev.filter((_, i) => i !== idx));
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

    if (severalStages) {
      if (!dealTitleInput.trim()) {
        setFieldError('deal-title', 'dealTitle', 'Deal Title is required');
      }
    }

    if (role === 'contractor' && contractorMode === 'wallet') {
      const trimmedCustomer = customerWalletInput.trim();
      if (!trimmedCustomer) {
        setFieldError('deal-customer', 'customerWallet', 'Customer wallet is required');
      } else {
        try {
          new PublicKey(trimmedCustomer);
          if (publicKey && trimmedCustomer === publicKey.toBase58()) {
            setFieldError('deal-customer', 'customerWallet', 'You cannot use your own wallet for both roles.');
          }
        } catch {
          setFieldError('deal-customer', 'customerWallet', 'Invalid customer wallet: must be a valid Solana public key');
        }
      }
    }

    if (role === 'customer') {
      const trimmedContractor = contractorWalletInput.trim();
      if (trimmedContractor) {
        try {
          new PublicKey(trimmedContractor);
          if (publicKey && trimmedContractor === publicKey.toBase58()) {
            setFieldError('deal-contractor', 'contractorWallet', 'You cannot use your own wallet for both roles.');
          }
        } catch {
          setFieldError('deal-contractor', 'contractorWallet', 'Invalid contractor wallet: must be a valid Solana public key');
        }
      }
    }

    // Stage 1 validation
    const stage1TitleId = severalStages ? 'stage-0-title' : 'deal-title';
    const stage1TitleKey = severalStages ? 'stage_0_title' : 'title';
    if (!title.trim()) {
      setFieldError(stage1TitleId, stage1TitleKey, severalStages ? 'Stage 1 Title is required' : 'Deal Title is required');
    }

    const stage1AmountId = severalStages ? 'stage-0-amount' : 'deal-amount';
    const stage1AmountKey = severalStages ? 'stage_0_amount' : 'amount';
    const parsedStage1Amount = parseFloat(amount);
    if (isNaN(parsedStage1Amount) || parsedStage1Amount <= 0) {
      setFieldError(stage1AmountId, stage1AmountKey, 'Amount must be a valid number greater than 0');
    }

    const stage1CriteriaId = severalStages ? 'stage-0-criteria' : 'deal-criteria';
    const stage1CriteriaKey = severalStages ? 'stage_0_criteria' : 'criteria';
    if (!criteria.trim()) {
      setFieldError(stage1CriteriaId, stage1CriteriaKey, 'Success Criteria is required');
    }

    const stage1DeadlineId = severalStages ? 'stage-0-deadline' : 'deal-deadline';
    const stage1DeadlineKey = severalStages ? 'stage_0_deadline' : 'deadline';
    if (!deadline) {
      setFieldError(stage1DeadlineId, stage1DeadlineKey, 'Deadline is required');
    } else {
      const selectedDate = new Date(deadline);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const maxAllowed = new Date();
      maxAllowed.setDate(maxAllowed.getDate() + 365);
      maxAllowed.setHours(23, 59, 59, 999);
      if (selectedDate < today) {
        setFieldError(stage1DeadlineId, stage1DeadlineKey, 'Deadline cannot be in the past');
      } else if (selectedDate > maxAllowed) {
        setFieldError(stage1DeadlineId, stage1DeadlineKey, 'The deadline cannot be more than 365 days from now.');
      }
    }

    // Extra stages validation
    if (severalStages) {
      extraStages.forEach((stage, idx) => {
        const stageNum = idx + 2;
        const stageIdx = idx + 1;
        if (!stage.title.trim()) {
          setFieldError(`stage-${stageIdx}-title`, `stage_${stageIdx}_title`, `Stage ${stageNum} Title is required`);
        }
        const parsed = parseFloat(stage.amount);
        if (isNaN(parsed) || parsed <= 0) {
          setFieldError(`stage-${stageIdx}-amount`, `stage_${stageIdx}_amount`, 'Amount must be a valid number greater than 0');
        }
        if (!stage.criteria.trim()) {
          setFieldError(`stage-${stageIdx}-criteria`, `stage_${stageIdx}_criteria`, 'Success Criteria is required');
        }
        if (!stage.deadline) {
          setFieldError(`stage-${stageIdx}-deadline`, `stage_${stageIdx}_deadline`, 'Deadline is required');
        } else {
          const selectedDate = new Date(stage.deadline);
          const today = new Date();
          today.setHours(0, 0, 0, 0);
          const maxAllowed = new Date();
          maxAllowed.setDate(maxAllowed.getDate() + 365);
          maxAllowed.setHours(23, 59, 59, 999);
          if (selectedDate < today) {
            setFieldError(`stage-${stageIdx}-deadline`, `stage_${stageIdx}_deadline`, 'Deadline cannot be in the past');
          } else if (selectedDate > maxAllowed) {
            setFieldError(`stage-${stageIdx}-deadline`, `stage_${stageIdx}_deadline`, 'The deadline cannot be more than 365 days from now.');
          }
        }
      });
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

    if (isContractorLinkMode) {
      try {
        const link = buildDealLink({
          contractorWallet: walletAddr,
          title: title.trim(),
          amount: String(parsedStage1Amount),
          criteria: criteria.trim(),
          deadline,
          reqFile: reqFile ? { name: reqFile.name, sha256: reqFile.sha256 } : null,
          dealTitle: severalStages && dealTitleInput.trim() ? dealTitleInput.trim() : null,
          dealDescription: severalStages && dealDescriptionInput.trim() ? dealDescriptionInput.trim() : null,
          extraStages: severalStages ? extraStages.map(s => ({
            title: s.title.trim(),
            amount: String(parseFloat(s.amount)),
            criteria: s.criteria.trim(),
            deadline: s.deadline,
            reqFile: s.reqFile ? { name: s.reqFile.name, sha256: s.reqFile.sha256 } : null,
          })) : [],
        });
        addSentLink({
          contractor: walletAddr,
          title: severalStages && dealTitleInput.trim() ? dealTitleInput.trim() : title.trim(),
          total: totalAmount,
          stages: severalStages ? 1 + extraStages.length : 1,
          deadlines: [deadline, ...(severalStages ? extraStages.map(s => s.deadline) : [])],
          url: link,
        });
        clearDraft('create:contractor');
        setIsDraftRestored(false);
        setIsFileRestoredFromDraft(false);
        setRawActionUrl(link);
        setCreatedDealId('draft');
        setCreatedViaLink(true);
        toast.success('Link created');
        setStep(2);
        return;
      } catch (err: any) {
        toast.error(err?.message || 'Failed to create link');
        return;
      }
    }

    setCreatedViaLink(false);
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
        ...(severalStages && dealTitleInput.trim() ? { dealTitle: dealTitleInput.trim() } : {}),
        ...(severalStages && dealDescriptionInput.trim() ? { dealDescription: dealDescriptionInput.trim() } : {}),
        ...(severalStages && extraStages.length > 0 ? {
          extraTasks: extraStages.map(s => ({
            title: s.title.trim(),
            amount: parseFloat(s.amount),
            successCriteria: s.criteria.trim(),
            deadline: s.deadline,
            ...(s.reqFile ? { requirementsFile: s.reqFile } : {}),
          }))
        } : {}),
      });
      dealId = deal.id;
      if (!isFromLink) {
        clearDraft(draftScope);
        setIsDraftRestored(false);
        setIsFileRestoredFromDraft(false);
      }
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
    const displayTitle = (severalStages && dealTitleInput.trim()) ? dealTitleInput.trim() : title.trim();
    const queryParams = new URLSearchParams({
      title: displayTitle,
      amount: totalAmount.toString(),
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
    setContractorMode('link');
    setSeveralStages(false);
    setDealTitleInput('');
    setDealDescriptionInput('');
    setExtraStages([]);
    setFieldErrors({});
    setReqFile(null);
    setCreatedDealId('');
    setCreatedViaLink(false);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-gray-950/80 backdrop-blur-sm animate-in fade-in">
      <Card className="w-full max-w-lg bg-gray-900 border-gray-800 shadow-2xl relative max-h-[90vh] flex flex-col">
        <button onClick={handleClose} aria-label="Close" className="absolute right-4 top-4 z-10 text-gray-400 hover:text-white transition-colors bg-gray-900/50 rounded-full p-1">
          <X className="w-5 h-5" />
        </button>

        <div className={`p-6 overflow-y-auto max-h-[90vh] ${txBarVisible ? 'pb-28' : ''}`}>
          {step === 1 ? (
            <form noValidate onSubmit={handleGenerate} className="space-y-4">
              <div>
                <h2 className="text-xl font-bold mb-1">
                  {isFromLink ? "Review and fund this deal" : "Create New Deal"}
                </h2>
                <p className="text-sm text-gray-400 mb-6">
                  {isFromLink
                    ? "Your contractor prepared these terms. Nothing is locked until you confirm and sign. Escrow means your payment is locked in a smart contract and released only when you approve the work."
                    : role === 'contractor'
                    ? "Fill in the terms. Send a link to your customer or propose directly to their wallet."
                    : "Set escrow terms and generate a link for your partner."}
                </p>

                {role === 'contractor' && (
                  <div className="space-y-2 mb-6">
                    <div className="grid grid-cols-2 gap-2 bg-gray-950/60 p-1 rounded-lg border border-gray-800">
                      <button
                        type="button"
                        onClick={() => {
                          setContractorMode('link');
                          setFieldErrors(prev => ({ ...prev, customerWallet: '' }));
                        }}
                        className={`py-2 px-3 text-xs sm:text-sm font-medium rounded-md transition-all ${
                          contractorMode === 'link'
                            ? 'bg-purple-600 text-white shadow-sm'
                            : 'text-gray-400 hover:text-white hover:bg-gray-800/50'
                        }`}
                      >
                        Send a link to my customer
                      </button>
                      <button
                        type="button"
                        onClick={() => setContractorMode('wallet')}
                        className={`py-2 px-3 text-xs sm:text-sm font-medium rounded-md transition-all ${
                          contractorMode === 'wallet'
                            ? 'bg-purple-600 text-white shadow-sm'
                            : 'text-gray-400 hover:text-white hover:bg-gray-800/50'
                        }`}
                      >
                        Propose to a specific wallet
                      </button>
                    </div>
                    <p className="text-xs text-gray-400">
                      {contractorMode === 'link'
                        ? 'Send a link to your customer. They review the terms and fund the escrow. No network deposit or transaction needed from you.'
                        : "Send an on-chain proposal directly to the customer's wallet. The customer will see it in their dashboard."}
                    </p>
                  </div>
                )}

                {isFromLink && fromLink && (
                  <div className="mb-4 p-3 rounded-lg bg-purple-500/10 border border-purple-500/30 text-xs text-purple-200 space-y-1">
                    <div className="font-semibold text-purple-300">Prepared by the contractor</div>
                    <p className="text-gray-300">
                      Check the wallet address and every term before you fund. If the address is not the one your contractor gave you, do not continue.
                    </p>
                    <div className="font-mono text-[11px] text-purple-300 break-all bg-purple-950/40 p-1.5 rounded border border-purple-800/40">
                      {fromLink.contractorWallet}
                    </div>
                  </div>
                )}
                {!isFromLink && isDraftRestored && (
                  <div className="mb-4 px-3 py-2 rounded-lg bg-purple-500/10 border border-purple-500/20 text-xs text-purple-300 flex items-center justify-between">
                    <span>Draft restored</span>
                    <button
                      type="button"
                      onClick={handleClearDraft}
                      className="underline hover:text-white cursor-pointer ml-2"
                    >
                      Clear draft
                    </button>
                  </div>
                )}
              </div>

              {/* Deal Title (and description when severalStages is ON) */}
              {severalStages ? (
                <>
                  <div>
                    <label htmlFor="deal-title" className="block text-sm font-medium text-gray-300 mb-1.5">Deal Title</label>
                    <input
                      id="deal-title"
                      type="text"
                      maxLength={100}
                      placeholder="e.g. Website Redesign"
                      value={dealTitleInput}
                      onChange={(e) => {
                        setDealTitleInput(e.target.value);
                        setFieldErrors(prev => ({ ...prev, dealTitle: '' }));
                      }}
                      className="w-full bg-gray-950 border border-gray-800 rounded-lg px-4 py-2.5 focus:outline-none focus:border-purple-500/50 focus:ring-1 focus:ring-purple-500/50 transition-all text-white"
                    />
                    {fieldErrors.dealTitle && <p className="text-red-400 text-xs mt-1">{fieldErrors.dealTitle}</p>}
                  </div>

                  <div>
                    <label htmlFor="deal-description" className="block text-sm font-medium text-gray-300 mb-1.5">
                      Deal Description <span className="text-gray-500 text-xs font-normal">(Optional)</span>
                    </label>
                    <textarea
                      id="deal-description"
                      maxLength={1000}
                      rows={3}
                      placeholder="Describe the overall project..."
                      value={dealDescriptionInput}
                      onChange={(e) => setDealDescriptionInput(e.target.value)}
                      className="w-full bg-gray-950 border border-gray-800 rounded-lg px-4 py-2.5 focus:outline-none focus:border-purple-500/50 focus:ring-1 focus:ring-purple-500/50 transition-all text-white resize-none"
                    />
                  </div>
                </>
              ) : (
                <div>
                  <label htmlFor="deal-title" className="block text-sm font-medium text-gray-300 mb-1.5">Deal Title</label>
                  <input
                    id="deal-title"
                    type="text"
                    maxLength={100}
                    placeholder="e.g. Website Redesign"
                    value={title}
                    onChange={(e) => {
                      setTitle(e.target.value);
                      setFieldErrors(prev => ({ ...prev, title: '' }));
                    }}
                    className="w-full bg-gray-950 border border-gray-800 rounded-lg px-4 py-2.5 focus:outline-none focus:border-purple-500/50 focus:ring-1 focus:ring-purple-500/50 transition-all text-white"
                  />
                  {fieldErrors.title && <p className="text-red-400 text-xs mt-1">{fieldErrors.title}</p>}
                </div>
              )}

              {/* Wallet Fields */}
              {role === 'customer' && isChainMode && (
                <div>
                  <label htmlFor="deal-contractor" className="block text-sm font-medium text-gray-300 mb-1.5">
                    {isFromLink ? 'Contractor Wallet (Locked)' : 'Contractor Wallet (Optional)'}
                  </label>
                  <input
                    id="deal-contractor"
                    type="text"
                    readOnly={isFromLink}
                    disabled={isFromLink}
                    placeholder={isFromLink ? '' : "Leave empty: contractors will apply and you choose one"}
                    value={contractorWalletInput}
                    onChange={(e) => {
                      if (isFromLink) return;
                      const val = e.target.value;
                      setContractorWalletInput(val);
                      setFieldErrors(prev => ({ ...prev, contractorWallet: '' }));
                      if (!val.trim() && severalStages) {
                        setSeveralStages(false);
                        setExtraStages([]);
                      }
                    }}
                    className={`w-full border rounded-lg px-4 py-2.5 transition-all font-mono text-sm ${
                      isFromLink 
                        ? 'bg-gray-900/90 border-gray-700 text-purple-300 cursor-not-allowed select-all' 
                        : 'bg-gray-950 border-gray-800 focus:outline-none focus:border-purple-500/50 focus:ring-1 focus:ring-purple-500/50 text-white'
                    }`}
                  />
                  {fieldErrors.contractorWallet && <p className="text-red-400 text-xs mt-1">{fieldErrors.contractorWallet}</p>}
                  {!isFromLink && (
                    <p className="text-xs text-gray-500 mt-1">You can also invite a specific contractor by pasting their wallet.</p>
                  )}
                </div>
              )}

              {role === 'contractor' && contractorMode === 'wallet' && (
                <div>
                  <label htmlFor="deal-customer" className="block text-sm font-medium text-gray-300 mb-1.5">
                    Customer wallet
                  </label>
                  <input
                    id="deal-customer"
                    type="text"
                    placeholder="Paste customer's Solana wallet address"
                    value={customerWalletInput}
                    onChange={(e) => {
                      setCustomerWalletInput(e.target.value);
                      setFieldErrors(prev => ({ ...prev, customerWallet: '' }));
                    }}
                    className="w-full bg-gray-950 border border-gray-800 rounded-lg px-4 py-2.5 focus:outline-none focus:border-purple-500/50 focus:ring-1 focus:ring-purple-500/50 transition-all text-white font-mono text-sm"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    The proposal will be sent directly to this customer wallet on-chain.
                  </p>
                  {fieldErrors.customerWallet && <p className="text-red-400 text-xs mt-1">{fieldErrors.customerWallet}</p>}
                </div>
              )}

              {/* Checkbox "Several stages" */}
              <div className="pt-1">
                <label className={`flex items-center gap-2 cursor-pointer select-none ${role === 'customer' && !contractorWalletInput.trim() ? 'opacity-50 cursor-not-allowed' : ''}`}>
                  <input
                    type="checkbox"
                    id="deal-several-stages"
                    checked={severalStages}
                    disabled={role === 'customer' && !contractorWalletInput.trim()}
                    onChange={(e) => {
                      const checked = e.target.checked;
                      setSeveralStages(checked);
                      if (checked && !dealTitleInput && title) {
                        setDealTitleInput(title);
                      }
                      if (!checked) {
                        setExtraStages([]);
                      }
                    }}
                    className="w-4 h-4 rounded border-gray-700 bg-gray-950 text-purple-600 focus:ring-purple-500/50"
                  />
                  <span className="text-sm font-medium text-gray-200">Several stages</span>
                </label>
                <p className="text-xs text-gray-500 mt-1">
                  {role === 'customer' && !contractorWalletInput.trim()
                    ? "To split the deal into stages, enter the contractor's wallet. You can also add stages later with Add task, after you pick a contractor."
                    : "Split the job into stages with their own amount and deadline."}
                </p>
              </div>

              {/* Stages section */}
              {severalStages ? (
                <div className="space-y-4 pt-2">
                  {/* Stage 1 */}
                  <div className="bg-gray-950/40 border border-gray-800/80 rounded-lg p-4 space-y-4">
                    <div className="border-b border-gray-800/80 pb-2">
                      <h3 className="font-semibold text-white text-sm">Stage 1</h3>
                    </div>
                    <div>
                      <label htmlFor="stage-0-title" className="block text-sm font-medium text-gray-300 mb-1.5">Title</label>
                      <input
                        id="stage-0-title"
                        type="text"
                        maxLength={100}
                        placeholder="e.g. Design & Wireframes"
                        value={title}
                        onChange={(e) => {
                          setTitle(e.target.value);
                          setFieldErrors(prev => ({ ...prev, stage_0_title: '' }));
                        }}
                        className="w-full bg-gray-950 border border-gray-800 rounded-lg px-4 py-2.5 focus:outline-none focus:border-purple-500/50 focus:ring-1 focus:ring-purple-500/50 transition-all text-white"
                      />
                      {fieldErrors.stage_0_title && <p className="text-red-400 text-xs mt-1">{fieldErrors.stage_0_title}</p>}
                    </div>

                    <div>
                      <label htmlFor="stage-0-amount" className="block text-sm font-medium text-gray-300 mb-1.5">Amount ({symbol})</label>
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">$</span>
                        <input
                          id="stage-0-amount"
                          type="number"
                          min="0.01"
                          step="0.01"
                          autoComplete="off"
                          onWheel={(e) => e.currentTarget.blur()}
                          placeholder="0.00"
                          value={amount}
                          onChange={(e) => {
                            setAmount(e.target.value);
                            setFieldErrors(prev => ({ ...prev, stage_0_amount: '' }));
                          }}
                          className="w-full bg-gray-950 border border-gray-800 rounded-lg pl-8 pr-4 py-2.5 focus:outline-none focus:border-purple-500/50 focus:ring-1 focus:ring-purple-500/50 transition-all text-white"
                        />
                      </div>
                      {fieldErrors.stage_0_amount && <p className="text-red-400 text-xs mt-1">{fieldErrors.stage_0_amount}</p>}
                    </div>

                    <div>
                      <label htmlFor="stage-0-criteria" className="block text-sm font-medium text-gray-300 mb-1.5">Success Criteria</label>
                      <textarea
                        id="stage-0-criteria"
                        maxLength={1000}
                        rows={3}
                        value={criteria}
                        onChange={(e) => {
                          setCriteria(e.target.value);
                          setFieldErrors(prev => ({ ...prev, stage_0_criteria: '' }));
                        }}
                        placeholder="Describe exactly what needs to be delivered for this stage..."
                        className="w-full bg-gray-950 border border-gray-800 rounded-lg px-4 py-2.5 focus:outline-none focus:border-purple-500/50 focus:ring-1 focus:ring-purple-500/50 transition-all text-white resize-none"
                      />
                      {fieldErrors.stage_0_criteria && <p className="text-red-400 text-xs mt-1">{fieldErrors.stage_0_criteria}</p>}
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
                                className="text-gray-400 hover:text-white p-0.5 rounded transition-colors text-xs flex items-center gap-0.5"
                                aria-label="Remove attached file"
                                title="Remove attached file"
                              >
                                <X className="w-3 h-3" />
                                <span>Remove</span>
                              </button>
                            </div>
                            {isFromLink && fromLink?.reqFile?.sha256 === reqFile.sha256 ? (
                              <p className="text-[11px] text-purple-300 leading-tight">
                                File fingerprint from the contractor's link. Ask them to send you the file.{' '}
                                <button
                                  type="button"
                                  onClick={handleRemoveFile}
                                  className="text-purple-400 hover:text-purple-200 underline font-medium cursor-pointer ml-1 inline-block"
                                >
                                  Remove
                                </button>
                              </p>
                            ) : (
                              <p className="text-[11px] text-gray-500 leading-tight">
                                The file is not uploaded. Only its SHA-256 fingerprint is stored in the deal. Send the file to {role === 'contractor' ? 'the customer' : 'your contractor'} separately.
                              </p>
                            )}
                            {!isFromLink && isFileRestoredFromDraft && (
                              <p className="text-[11px] text-purple-400 mt-1">
                                File restored from the draft. Attach it again if you want to replace it.
                              </p>
                            )}
                          </div>
                        )}
                      </div>
                    </div>

                    <div>
                      <label htmlFor="stage-0-deadline" className="block text-sm font-medium text-gray-300 mb-1.5">Deadline</label>
                      <input 
                        id="stage-0-deadline"
                        type="date" 
                        min={minDeadlineStr}
                        max={maxDeadlineStr}
                        value={deadline}
                        onChange={(e) => {
                          setDeadline(e.target.value);
                          setFieldErrors(prev => ({ ...prev, stage_0_deadline: '' }));
                        }}
                        onClick={(e) => 'showPicker' in HTMLInputElement.prototype && e.currentTarget.showPicker()}
                        className="w-full bg-gray-950 border border-gray-800 rounded-lg px-4 py-2.5 focus:outline-none focus:border-purple-500/50 focus:ring-1 focus:ring-purple-500/50 transition-all text-white cursor-pointer [&::-webkit-calendar-picker-indicator]:invert [&::-webkit-calendar-picker-indicator]:opacity-70 hover:[&::-webkit-calendar-picker-indicator]:opacity-100" 
                      />
                      {fieldErrors.stage_0_deadline && <p className="text-red-400 text-xs mt-1">{fieldErrors.stage_0_deadline}</p>}
                      {isFromLink && fromLink?.deadlineAdjusted && !deadline && (
                        <p className="text-amber-400 text-xs mt-1">The deadline from the link is no longer valid. Pick a new date.</p>
                      )}
                    </div>
                  </div>

                  {/* Extra Stages */}
                  {extraStages.map((stage, idx) => {
                    const stageNum = idx + 2;
                    const stageIdx = idx + 1;
                    return (
                      <div key={stage.id} className="bg-gray-950/40 border border-gray-800/80 rounded-lg p-4 space-y-4 relative">
                        <div className="flex items-center justify-between border-b border-gray-800/80 pb-2">
                          <h3 className="font-semibold text-white text-sm">Stage {stageNum}</h3>
                          <button
                            type="button"
                            onClick={() => handleRemoveStage(idx)}
                            className="text-gray-400 hover:text-white p-1 rounded transition-colors"
                            aria-label={`Remove Stage ${stageNum}`}
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>

                        <div>
                          <label htmlFor={`stage-${stageIdx}-title`} className="block text-sm font-medium text-gray-300 mb-1.5">Title</label>
                          <input
                            id={`stage-${stageIdx}-title`}
                            type="text"
                            maxLength={100}
                            placeholder={`e.g. Stage ${stageNum} deliverable`}
                            value={stage.title}
                            onChange={(e) => {
                              const val = e.target.value;
                              setExtraStages(prev => prev.map((s, i) => i === idx ? { ...s, title: val } : s));
                              setFieldErrors(prev => ({ ...prev, [`stage_${stageIdx}_title`]: '' }));
                            }}
                            className="w-full bg-gray-950 border border-gray-800 rounded-lg px-4 py-2.5 focus:outline-none focus:border-purple-500/50 focus:ring-1 focus:ring-purple-500/50 transition-all text-white"
                          />
                          {fieldErrors[`stage_${stageIdx}_title`] && <p className="text-red-400 text-xs mt-1">{fieldErrors[`stage_${stageIdx}_title`]}</p>}
                        </div>

                        <div>
                          <label htmlFor={`stage-${stageIdx}-amount`} className="block text-sm font-medium text-gray-300 mb-1.5">Amount ({symbol})</label>
                          <div className="relative">
                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">$</span>
                            <input
                              id={`stage-${stageIdx}-amount`}
                              type="number"
                              min="0.01"
                              step="0.01"
                              autoComplete="off"
                              onWheel={(e) => e.currentTarget.blur()}
                              placeholder="0.00"
                              value={stage.amount}
                              onChange={(e) => {
                                const val = e.target.value;
                                setExtraStages(prev => prev.map((s, i) => i === idx ? { ...s, amount: val } : s));
                                setFieldErrors(prev => ({ ...prev, [`stage_${stageIdx}_amount`]: '' }));
                              }}
                              className="w-full bg-gray-950 border border-gray-800 rounded-lg pl-8 pr-4 py-2.5 focus:outline-none focus:border-purple-500/50 focus:ring-1 focus:ring-purple-500/50 transition-all text-white"
                            />
                          </div>
                          {fieldErrors[`stage_${stageIdx}_amount`] && <p className="text-red-400 text-xs mt-1">{fieldErrors[`stage_${stageIdx}_amount`]}</p>}
                        </div>

                        <div>
                          <label htmlFor={`stage-${stageIdx}-criteria`} className="block text-sm font-medium text-gray-300 mb-1.5">Success Criteria</label>
                          <textarea
                            id={`stage-${stageIdx}-criteria`}
                            maxLength={1000}
                            rows={3}
                            value={stage.criteria}
                            onChange={(e) => {
                              const val = e.target.value;
                              setExtraStages(prev => prev.map((s, i) => i === idx ? { ...s, criteria: val } : s));
                              setFieldErrors(prev => ({ ...prev, [`stage_${stageIdx}_criteria`]: '' }));
                            }}
                            placeholder={`Describe exactly what needs to be delivered for stage ${stageNum}...`}
                            className="w-full bg-gray-950 border border-gray-800 rounded-lg px-4 py-2.5 focus:outline-none focus:border-purple-500/50 focus:ring-1 focus:ring-purple-500/50 transition-all text-white resize-none"
                          />
                          {fieldErrors[`stage_${stageIdx}_criteria`] && <p className="text-red-400 text-xs mt-1">{fieldErrors[`stage_${stageIdx}_criteria`]}</p>}
                          <div className="flex flex-col gap-1.5 mt-2">
                            <input
                              id={`extra-file-${idx}`}
                              type="file"
                              className="hidden"
                              onChange={(e) => handleExtraStageFileSelect(idx, e)}
                            />
                            <button
                              type="button"
                              disabled={stage.isHashing}
                              onClick={() => document.getElementById(`extra-file-${idx}`)?.click()}
                              className="text-xs text-purple-400 hover:text-purple-300 flex items-center gap-1 transition-colors w-fit disabled:opacity-50"
                            >
                              <Link2 className="w-3 h-3" />
                              {stage.isHashing ? 'Hashing file…' : 'Attach File (Requirements)'}
                            </button>
                            {stage.fileError && <p className="text-red-400 text-xs mt-1">{stage.fileError}</p>}
                            {stage.reqFile && (
                              <div className="space-y-1">
                                <div className="flex items-center gap-2 text-xs text-gray-300">
                                  <span className="font-medium text-white truncate max-w-[200px]" title={stage.reqFile.name}>{stage.reqFile.name}</span>
                                  <span className="font-mono text-gray-400">({stage.reqFile.sha256.slice(0, 10)}…)</span>
                                  <button
                                    type="button"
                                    onClick={() => handleRemoveExtraStageFile(idx)}
                                    className="text-gray-400 hover:text-white p-0.5 rounded transition-colors text-xs flex items-center gap-0.5"
                                    aria-label="Remove attached file"
                                    title="Remove attached file"
                                  >
                                    <X className="w-3 h-3" />
                                    <span>Remove</span>
                                  </button>
                                </div>
                                {isFromLink && fromLink?.extraStages?.[idx]?.reqFile?.sha256 === stage.reqFile.sha256 ? (
                                  <p className="text-[11px] text-purple-300 leading-tight">
                                    File fingerprint from the contractor's link. Ask them to send you the file.{' '}
                                    <button
                                      type="button"
                                      onClick={() => handleRemoveExtraStageFile(idx)}
                                      className="text-purple-400 hover:text-purple-200 underline font-medium cursor-pointer ml-1 inline-block"
                                    >
                                      Remove
                                    </button>
                                  </p>
                                ) : (
                                  <p className="text-[11px] text-gray-500 leading-tight">
                                    The file is not uploaded. Only its SHA-256 fingerprint is stored in the deal. Send the file to {role === 'contractor' ? 'the customer' : 'your contractor'} separately.
                                  </p>
                                )}
                              </div>
                            )}
                          </div>
                        </div>

                        <div>
                          <label htmlFor={`stage-${stageIdx}-deadline`} className="block text-sm font-medium text-gray-300 mb-1.5">Deadline</label>
                          <input 
                            id={`stage-${stageIdx}-deadline`}
                            type="date" 
                            min={minDeadlineStr}
                            max={maxDeadlineStr}
                            value={stage.deadline}
                            onChange={(e) => {
                              const val = e.target.value;
                              setExtraStages(prev => prev.map((s, i) => i === idx ? { ...s, deadline: val } : s));
                              setFieldErrors(prev => ({ ...prev, [`stage_${stageIdx}_deadline`]: '' }));
                            }}
                            onClick={(e) => 'showPicker' in HTMLInputElement.prototype && e.currentTarget.showPicker()}
                            className="w-full bg-gray-950 border border-gray-800 rounded-lg px-4 py-2.5 focus:outline-none focus:border-purple-500/50 focus:ring-1 focus:ring-purple-500/50 transition-all text-white cursor-pointer [&::-webkit-calendar-picker-indicator]:invert [&::-webkit-calendar-picker-indicator]:opacity-70 hover:[&::-webkit-calendar-picker-indicator]:opacity-100" 
                          />
                          {fieldErrors[`stage_${stageIdx}_deadline`] && <p className="text-red-400 text-xs mt-1">{fieldErrors[`stage_${stageIdx}_deadline`]}</p>}
                          {isFromLink && stage.deadlineAdjusted && !stage.deadline && (
                            <p className="text-amber-400 text-xs mt-1">The deadline from the link is no longer valid. Pick a new date.</p>
                          )}
                        </div>
                      </div>
                    );
                  })}

                  {/* + Add stage button */}
                  <div className="flex items-center justify-between pt-1">
                    <button
                      type="button"
                      disabled={extraStages.length >= 4}
                      onClick={handleAddStage}
                      className="text-sm text-purple-400 hover:text-purple-300 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1.5 font-medium transition-colors"
                    >
                      <Plus className="w-4 h-4" />
                      + Add stage
                    </button>
                    {extraStages.length >= 4 && (
                      <span className="text-xs text-gray-500">Maximum 5 stages reached</span>
                    )}
                  </div>

                  {/* Total line */}
                  <div className="bg-gray-950/60 border border-gray-800 rounded-lg p-3 flex justify-between items-center text-sm font-medium">
                    <span className="text-gray-400">Total:</span>
                    <span className="text-white font-semibold">
                      {totalAmount.toFixed(2)} {symbol} in {totalStages} stage{totalStages !== 1 ? 's' : ''}
                    </span>
                  </div>
                </div>
              ) : (
                <>
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
                              className="text-gray-400 hover:text-white p-0.5 rounded transition-colors text-xs flex items-center gap-0.5"
                              aria-label="Remove attached file"
                              title="Remove attached file"
                            >
                              <X className="w-3 h-3" />
                              <span>Remove</span>
                            </button>
                          </div>
                          {isFromLink && fromLink?.reqFile?.sha256 === reqFile.sha256 ? (
                            <p className="text-[11px] text-purple-300 leading-tight">
                              File fingerprint from the contractor's link. Ask them to send you the file.{' '}
                              <button
                                type="button"
                                onClick={handleRemoveFile}
                                className="text-purple-400 hover:text-purple-200 underline font-medium cursor-pointer ml-1 inline-block"
                              >
                                Remove
                              </button>
                            </p>
                          ) : (
                            <p className="text-[11px] text-gray-500 leading-tight">
                              The file is not uploaded. Only its SHA-256 fingerprint is stored in the deal. Send the file to {role === 'contractor' ? 'the customer' : 'your contractor'} separately.
                            </p>
                          )}
                          {!isFromLink && isFileRestoredFromDraft && (
                            <p className="text-[11px] text-purple-400 mt-1">
                              File restored from the draft. Attach it again if you want to replace it.
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  <div>
                    <label htmlFor="deal-deadline" className="block text-sm font-medium text-gray-300 mb-1.5">Deadline</label>
                    <input 
                      id="deal-deadline"
                      type="date" 
                      min={minDeadlineStr}
                      max={maxDeadlineStr}
                      value={deadline}
                      onChange={(e) => { setDeadline(e.target.value); setFieldErrors(prev => ({ ...prev, deadline: '' })); }}
                      onClick={(e) => 'showPicker' in HTMLInputElement.prototype && e.currentTarget.showPicker()}
                      className="w-full bg-gray-950 border border-gray-800 rounded-lg px-4 py-2.5 focus:outline-none focus:border-purple-500/50 focus:ring-1 focus:ring-purple-500/50 transition-all text-white cursor-pointer [&::-webkit-calendar-picker-indicator]:invert [&::-webkit-calendar-picker-indicator]:opacity-70 hover:[&::-webkit-calendar-picker-indicator]:opacity-100" 
                    />
                    {fieldErrors.deadline && <p className="text-red-400 text-xs mt-1">{fieldErrors.deadline}</p>}
                    {isFromLink && fromLink?.deadlineAdjusted && !deadline && (
                      <p className="text-amber-400 text-xs mt-1">The deadline from the link is no longer valid. Pick a new date.</p>
                    )}
                  </div>
                </>
              )}

              <div className="pt-4 space-y-4">
                {!isContractorLinkMode && (
                  <NetworkDepositInfo
                    type="deal"
                    extraTasks={severalStages ? extraStages.length : 0}
                    wallet={publicKey?.toBase58()}
                  />
                )}
                {isInsufficientUsdc && (
                  <div className="mb-4 bg-orange-500/10 border border-orange-500/20 rounded-lg p-3 text-sm text-orange-400">
                    You have {usdcBalance.toFixed(2)} {symbol}, this deal needs {totalAmount.toFixed(2)}. Use "Get USDC/SOL" in the header.
                  </div>
                )}
                {!isContractorLinkMode && lowSol && (role === 'customer' || role === 'contractor') && (
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
                {(isFromLink || severalStages) && (
                  <p className="text-xs text-gray-400 text-center">
                    {role === 'customer'
                      ? `You will lock ${totalAmount.toFixed(2)} ${symbol} in escrow now${severalStages ? `: ${totalStages} stages.` : '.'}`
                      : 'The customer funds each stage separately.'}
                  </p>
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
                    className={`w-full py-2.5 text-base ${(!isContractorLinkMode && lowSol && (role === 'customer' || role === 'contractor')) || isInsufficientUsdc || isSubmitting ? 'opacity-50 cursor-not-allowed' : ''}`} 
                    type="submit"
                    disabled={(!isContractorLinkMode && lowSol && (role === 'customer' || role === 'contractor')) || isInsufficientUsdc || isSubmitting}
                    title={!isContractorLinkMode && lowSol && (role === 'customer' || role === 'contractor') ? "Not enough SOL for network fees" : isInsufficientUsdc ? `Not enough ${symbol} to fund deal` : undefined}
                  >
                    {isSubmitting ? (
                      <span className="inline-flex items-center justify-center gap-2">
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Creating... confirm in your wallet
                      </span>
                    ) : isContractorLinkMode ? (
                      'Create link for customer'
                    ) : isFromLink ? (
                      'Fund and create deal'
                    ) : (
                      'Create Deal Link'
                    )}
                  </Button>
                )}
                {isContractorLinkMode && (
                  <p className="text-xs text-gray-400 text-center">
                    Anyone with the link can read these terms. Do not put secrets in them.
                  </p>
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
                    {createdViaLink ? 'Link Created!' : (role === 'contractor' ? 'Deal Created!' : 'Deal Created & Funded!')}
                  </h3>
                </div>
                <p className="text-sm text-gray-400">
                  {createdViaLink
                    ? 'Nothing is on the network yet. Your customer opens this link, checks the terms and funds the escrow. You will see the deal on your dashboard after that.'
                    : (role === 'contractor' 
                        ? 'Send this link to the customer so they can fund the escrow.' 
                        : 'Send this link to potential contractors.')}
                </p>
              </div>
              
              <ShareDealPanel 
                rawActionUrl={rawActionUrl} 
                dealId={createdDealId} 
              />

              {createdViaLink && (
                <div className="w-full text-left bg-gray-950/60 border border-gray-800 rounded-lg p-3.5 text-xs text-gray-300 space-y-2">
                  <div className="flex items-start gap-2">
                    <span className="flex items-center justify-center w-4 h-4 rounded-full bg-purple-500/20 text-purple-300 font-bold text-[10px] shrink-0 mt-0.5">1</span>
                    <span>Send this link to your customer in any chat or messenger.</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="flex items-center justify-center w-4 h-4 rounded-full bg-purple-500/20 text-purple-300 font-bold text-[10px] shrink-0 mt-0.5">2</span>
                    <span>Your customer reviews the terms and locks USDC in escrow.</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="flex items-center justify-center w-4 h-4 rounded-full bg-purple-500/20 text-purple-300 font-bold text-[10px] shrink-0 mt-0.5">3</span>
                    <span>You will see the deal on your dashboard once funded.</span>
                  </div>
                </div>
              )}

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
