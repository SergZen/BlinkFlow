import { useParams, Link, useLocation } from 'react-router-dom';
import { client, isChainMode } from '../lib/client';
import { getChainInfo, explorerAddr, explorerTx, type ChainInfo } from '../lib/client/chainClient';
import { dealTotal, deriveDealStatus, getEarliestDeadline, taskStatusLabel, taskStatusKind } from '../lib/dealStatus';
import { Card } from '../components/Card';
import { Badge, getStatusLabel } from '../components/Badge';
import { Button } from '../components/Button';
import { useRole } from '../RoleContext';
import { ArrowLeft, CheckCircle2, History, Loader2, Plus, Share2, X } from 'lucide-react';
import { useState, useEffect, useRef } from 'react';
import { MAX_REQ_FILE_BYTES, sha256HexOfFile } from '../lib/fileHash';
import { ShareDealPanel } from '../components/ShareDealPanel';
import { ApplicationsPanel } from '../components/ApplicationsPanel';
import { useToken } from '../lib/constants';
import { truncateAddress } from '../lib/utils';
import { useSolBalance } from '../hooks/useSolBalance';
import { useNetwork } from '../NetworkContext';
import type { Deal, Task } from '../lib/types';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { useWalletModal } from '@solana/wallet-adapter-react-ui';
import { Transaction } from '@solana/web3.js';
import { useToast, notifyActionError } from '../components/Toast';
import { NetworkDepositInfo } from '../lib/rent';
import { getLastTxSig } from '../lib/client/chainClient';

const TaskRequirementsFile = ({ requirementsFile }: { requirementsFile: { name: string; sha256: string } }) => {
  const [verifyStatus, setVerifyStatus] = useState<'match' | 'mismatch' | 'too_large' | null>(null);
  const [isVerifying, setIsVerifying] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleVerify = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > MAX_REQ_FILE_BYTES) {
      setVerifyStatus('too_large');
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    try {
      setIsVerifying(true);
      setVerifyStatus(null);
      const hash = await sha256HexOfFile(file);
      if (hash.toLowerCase() === requirementsFile.sha256.toLowerCase()) {
        setVerifyStatus('match');
      } else {
        setVerifyStatus('mismatch');
      }
    } catch (err) {
      console.error('Failed to verify file hash', err);
      setVerifyStatus('mismatch');
    } finally {
      setIsVerifying(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  return (
    <div className="mt-4 pt-4 border-t border-gray-800/50 space-y-2">
      <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Requirements File</h4>
      <div className="bg-gray-900 border border-gray-800 rounded-lg p-3 space-y-2">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <span className="text-sm font-medium text-white break-all">{requirementsFile.name}</span>
          <button
            type="button"
            disabled={isVerifying}
            onClick={() => fileInputRef.current?.click()}
            className="text-xs px-2.5 py-1 rounded bg-gray-800 hover:bg-gray-700 text-gray-200 border border-gray-700 transition-colors w-fit shrink-0 disabled:opacity-50"
          >
            {isVerifying ? 'Verifying…' : 'Verify file'}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            onChange={handleVerify}
          />
        </div>
        <div className="font-mono text-xs text-gray-400 break-all bg-gray-950 px-2.5 py-1.5 rounded border border-gray-800/60 select-all">
          {requirementsFile.sha256}
        </div>
        {verifyStatus === 'match' && (
          <p className="text-xs text-green-400 font-medium">✓ Match: this file is the one attached to the deal</p>
        )}
        {verifyStatus === 'mismatch' && (
          <p className="text-xs text-red-400 font-medium">✗ Does not match the attached requirements</p>
        )}
        {verifyStatus === 'too_large' && (
          <p className="text-xs text-red-400 font-medium">✗ File is too large (max 20 MB)</p>
        )}
      </div>
      <p className="text-xs text-gray-500">
        BlinkFlow does not store the file. The fingerprint is part of the deal's on-chain task hash.
      </p>
    </div>
  );
};

const EscrowActionCard = ({ deal, escrowState }: { deal: Deal, escrowState: string }) => {
  const { isTestMode } = useNetwork();
  const [imgLoaded, setImgLoaded] = useState(false);
  const [imgError, setImgError] = useState(false);
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);

  let rawBaseUrl = import.meta.env.VITE_ACTIONS_API_URL || 'http://localhost:3001';
  if (rawBaseUrl.endsWith('/')) {
    rawBaseUrl = rawBaseUrl.slice(0, -1);
  }
  const BLINK_SERVER_URL = rawBaseUrl;

  const currentStatus = getStatusLabel(deriveDealStatus(deal));

  const params = new URLSearchParams({
    title: deal.tasks[0]?.meta?.title || 'Escrow Deal',
    amount: dealTotal(deal).toString(),
    token: 'USDC',
    status: currentStatus,
  });
  if (deal.customer) params.append('customerWallet', deal.customer);
  if (deal.contractor) params.append('contractorWallet', deal.contractor);

  const ogImageUrl = `${BLINK_SERVER_URL}/api/deal/${deal.id}/og-image.png?${params.toString()}`;

  const getButtonText = () => {
    switch(escrowState) {
      case 'Not funded': return 'Deposit USDC';
      case 'Funded': return 'Awaiting work';
      case 'Released': return 'Released';
      case 'Refunded': return 'Refunded';
      case 'Released to contractor': return 'Released to contractor';
      default: return 'Action';
    }
  };

  return (
    <div className="space-y-4">
      <div className="w-full overflow-hidden rounded-xl bg-gray-900 border border-gray-800 flex flex-col">
        <div className="w-full aspect-[1.91/1] bg-[#030712] border-b border-gray-800 flex items-center justify-center relative overflow-hidden">
          {!imgLoaded && !imgError && (
            <div className="absolute inset-0 flex items-center justify-center bg-gray-950">
              <Loader2 className="w-6 h-6 animate-spin text-gray-500" />
            </div>
          )}
          <img 
            src={imgError ? `${BLINK_SERVER_URL}/blinkFlow.jpg` : ogImageUrl} 
            alt="Deal Preview" 
            className={`w-full h-full object-contain transition-opacity duration-300 ${imgLoaded || imgError ? 'opacity-100' : 'opacity-0'}`}
            onLoad={() => setImgLoaded(true)}
            onError={() => setImgError(true)}
          />
        </div>
        <div className="p-4 space-y-4">
          <p className="text-sm text-gray-400 leading-relaxed line-clamp-2">
            {escrowState === 'Not funded' && "Waiting for the customer to fund the escrow."}
            {escrowState === 'Funded' && "Funds are held in escrow until the work is approved."}
            {escrowState === 'Released' && "Funds were released to the contractor."}
            {escrowState === 'Refunded' && "Funds were refunded to the customer."}
            {escrowState === 'Released to contractor' && "Dispute resolved: funds released to the contractor."}
          </p>
          <Button variant="primary" className="w-full pointer-events-none opacity-80" disabled>
            {getButtonText()}
          </Button>
        </div>
      </div>
      
      <Button variant="outline" className="w-full py-2.5" onClick={() => setIsShareModalOpen(true)}>
        <Share2 className="w-4 h-4 mr-2" /> Share Deal
      </Button>

      {isShareModalOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-gray-950/80 backdrop-blur-sm animate-in fade-in">
          <Card className="w-full max-w-lg bg-gray-900 border-gray-800 shadow-2xl relative p-6">
            <button onClick={() => setIsShareModalOpen(false)} aria-label="Close" className="absolute right-4 top-4 z-10 text-gray-400 hover:text-white transition-colors bg-gray-900/50 rounded-full p-1">
              <X className="w-5 h-5" />
            </button>
            <h2 className="text-xl font-bold mb-1">Share Deal</h2>
            <p className="text-sm text-gray-400 mb-2">Send this link to your partner.</p>
            <ShareDealPanel 
              rawActionUrl={`${import.meta.env.VITE_ACTIONS_API_URL || 'http://localhost:3001'}/deal/${deal.id}?${new URLSearchParams({
                title: deal.tasks[0]?.meta.title,
                amount: dealTotal(deal).toString(),
                token: 'USDC',
                status: currentStatus,
                ...(deal.customer && { customerWallet: deal.customer }),
                ...(deal.contractor && { contractorWallet: deal.contractor })
              }).toString()}`}
              dealId={deal.id}
              customClass="mt-2"
            />
          </Card>
        </div>
      )}
    </div>
  );
};

export const DealDetails = () => {
  const { id } = useParams();
  const { role } = useRole();
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deal, setDeal] = useState<Deal | null>(null);
  const [taskSubmissions, setTaskSubmissions] = useState<Record<number, string>>({});
  const [taskActionLoading, setTaskActionLoading] = useState<Record<number, boolean>>({});
  const [globalLoading, setGlobalLoading] = useState(false);
  // TEMP: virtual deals go away in stage B.
  const [virtualStatusLabel, setVirtualStatusLabel] = useState<string | null>(null);
  const [expandedTasks, setExpandedTasks] = useState<number[]>([]);
  const [chainInfo, setChainInfo] = useState<ChainInfo | null>(null);

  const [initializedDealId, setInitializedDealId] = useState<string | null>(null);

  useEffect(() => {
    if (deal?.id && deal.id !== initializedDealId) {
      setExpandedTasks(deal.tasks.length === 1 ? [0] : []);
      setInitializedDealId(deal.id);
    }
  }, [deal?.id]);

  const toggleTask = (index: number) => {
    setExpandedTasks(prev => 
      prev.includes(index) ? prev.filter(i => i !== index) : [...prev, index]
    );
  };
  
  const { connected, publicKey } = useWallet();
  const myWallet = publicKey?.toBase58();
  const { setVisible } = useWalletModal();
  const { isTestMode } = useNetwork();
  const { solBalance } = useSolBalance();
  const { symbol } = useToken();
  const MIN_SOL_REQUIRED = 0.01;
  const hasEnoughSol = solBalance === null || solBalance >= MIN_SOL_REQUIRED;

  const renderSolWarning = () => {
    if (hasEnoughSol) return null;
    return (
      <div className="mb-4 bg-orange-500/10 border border-orange-500/20 rounded-lg p-3 text-sm text-orange-400">
        You need a small amount of SOL (~0.01) to cover network fees.
        {isTestMode && (
          <a href="https://faucet.solana.com" target="_blank" rel="noopener noreferrer" className="ml-1 text-orange-300 font-medium hover:underline">
            Get devnet SOL →
          </a>
        )}
      </div>
    );
  };

  const [showAddTaskForm, setShowAddTaskForm] = useState(false);
  const [taskTitle, setTaskTitle] = useState('');
  const [taskCriteria, setTaskCriteria] = useState('');
  const [taskAmount, setTaskAmount] = useState('');
  const [taskDeadline, setTaskDeadline] = useState('');
  const [addTaskLoading, setAddTaskLoading] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<{
    title?: string;
    amount?: string;
    deadline?: string;
    criteria?: string;
  }>({});
  const taskTitleRef = useRef<HTMLInputElement>(null);
  const taskAmountRef = useRef<HTMLInputElement>(null);
  const taskDeadlineRef = useRef<HTMLInputElement>(null);
  const taskCriteriaRef = useRef<HTMLTextAreaElement>(null);

  const isWrongCustomer = Boolean(chainInfo && connected && myWallet && myWallet !== chainInfo.customer);
  const contractorAddr = (chainInfo ? (chainInfo.contractor || deal?.contractor) : deal?.contractor) || '';
  const isWrongContractor = Boolean(chainInfo && connected && myWallet && contractorAddr && myWallet !== contractorAddr);
  const isWrongUserForAddTask = role === 'customer' ? isWrongCustomer : isWrongContractor;
  const canAddTask = Boolean(deal) && deal?.creator !== 'VIRTUAL' && Boolean(chainInfo) && Boolean(deal?.contractor) && (role === 'customer' || role === 'contractor');

  const handleAddTaskSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (addTaskLoading || !deal) return;
    if (!connected) {
      toast.error('Please connect your Solana wallet first.');
      return;
    }
    if (isWrongUserForAddTask) {
      toast.error(`Switch Phantom to the ${role} account to add a task.`);
      return;
    }

    const errors: typeof fieldErrors = {};
    if (!taskTitle.trim()) {
      errors.title = 'Title is required';
    }
    const parsedAmount = parseFloat(taskAmount);
    if (isNaN(parsedAmount) || parsedAmount < 0.01) {
      errors.amount = 'Amount must be at least 0.01 USDC';
    }
    if (!taskDeadline) {
      errors.deadline = 'Deadline is required';
    } else {
      const selectedDate = new Date(taskDeadline);
      const todayDate = new Date();
      todayDate.setHours(0, 0, 0, 0);
      if (selectedDate < todayDate) {
        errors.deadline = 'Deadline cannot be in the past';
      }
    }
    if (!taskCriteria.trim()) {
      errors.criteria = 'Success criteria cannot be empty';
    }

    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      const firstErrorKey = Object.keys(errors)[0];
      const refMap: Record<string, React.RefObject<HTMLElement | null>> = {
        title: taskTitleRef,
        amount: taskAmountRef,
        deadline: taskDeadlineRef,
        criteria: taskCriteriaRef,
      };
      const target = refMap[firstErrorKey]?.current;
      if (target) {
        target.scrollIntoView({ behavior: 'smooth', block: 'center' });
        target.focus();
      }
      return;
    }
    setFieldErrors({});

    const doAddTask = async () => {
      setAddTaskLoading(true);
      try {
        const updatedDeal = await client.addTask(deal.id, {
          role,
          title: taskTitle.trim(),
          successCriteria: taskCriteria.trim(),
          amount: parsedAmount,
          deadline: taskDeadline,
        });
        if (updatedDeal) {
          setDeal(updatedDeal);
          setChainInfo(getChainInfo(updatedDeal.id));
        }
        setTaskTitle('');
        setTaskCriteria('');
        setTaskAmount('');
        setTaskDeadline('');
        setShowAddTaskForm(false);
        toast.success('Task added', getLastTxSig() || undefined);
      } catch (err: any) {
        notifyActionError(toast, err, doAddTask);
      } finally {
        setAddTaskLoading(false);
      }
    };

    await doAddTask();
  };

  useEffect(() => {
    const loadDeal = async () => {
      try {
        const foundDeal = await client.getDeal(id || '');
        if (foundDeal) {
          setDeal(foundDeal);
          setChainInfo(getChainInfo(foundDeal.id));
        } else {
          // Fallback: try to construct deal from query parameters
          const params = new URLSearchParams(location.search);
          const title = params.get('title');
          const amount = params.get('amount');
          const criteria = params.get('criteria');
          const urlDeadline = params.get('deadline');
          
          if (title && amount) {
            setDeal({
              id: id || 'VIRTUAL', creator: 'VIRTUAL', createdAt: new Date().toISOString(),
              
              
              
              customer: params.get('customerWallet') || 'Customer (Pending)',
              contractor: params.get('contractorWallet') || '',
              
              tasks: [{ taskIndex: 0, amount: parseFloat(amount), status: (params.get('status') as any) === 'searching' ? 'CustomerCreated' : 'Started', taskHash: 'virtual', solutionHash: null, solutionNote: null, deadline: urlDeadline || 'TBD', createdAt: new Date().toISOString(), deposited: false, meta: { title: title || 'VIRTUAL', successCriteria: criteria || '' } }],
              history: []
            });
            // TEMP: virtual deals go away in stage B.
            setVirtualStatusLabel(params.get('status') || 'Seeking Contractor');
          } else {
            throw new Error("Deal not found");
          }
        }
      } catch (err: any) {
        setError(err.message || "Failed to load deal");
      } finally {
        setLoading(false);
      }
    };
    loadDeal();
    const handleDealsChanged = () => {
      loadDeal();
    };
    window.addEventListener('blinkflow:deals-changed', handleDealsChanged);
    
    return () => {
      window.removeEventListener('blinkflow:deals-changed', handleDealsChanged);
    };
  }, [id, location.search]);

  const isVirtualDeal = !!deal && deal.creator === 'VIRTUAL';

  const getEscrowState = () => {
    if (!deal || !deal.tasks) return 'Not funded';
    const activeTasks = deal.tasks.filter(t => t.status !== 'Cancelled');
    if (activeTasks.length === 0) return 'Not funded';
    
    const allDone = activeTasks.every(t => t.status === 'Completed' || t.status === 'Resolved');
    if (allDone) {
      if (activeTasks.every(t => t.status === 'Completed')) return 'Released';
      if (activeTasks.some(t => t.disputeResult === 'customer')) return 'Refunded';
      if (activeTasks.some(t => t.disputeResult === 'contractor')) return 'Released to contractor';
      return 'Released';
    }
    
    const anyDeposited = activeTasks.some(t => t.deposited);
    if (anyDeposited) return 'Funded';
    return 'Not funded';
  };
  const escrowState = getEscrowState();

  if (loading) return <div className="p-12 flex justify-center"><Loader2 className="w-8 h-8 animate-spin text-purple-500" /></div>;
  if (error) return <div className="p-8 text-center text-red-400">{error}</div>;
  if (!deal) return <div className="p-8 text-center text-gray-400">Deal not found</div>;

  const getTaskStatusLabel = (task: Task) => {
    if (task.status === 'ContractorCreated' && !task.deposited) {
      const customerAddr = chainInfo?.customer || deal?.customer;
      const contractorAddr = (chainInfo ? (chainInfo.contractor || deal?.contractor) : deal?.contractor) || '';

      if (connected && myWallet && customerAddr && contractorAddr && myWallet !== customerAddr && myWallet !== contractorAddr) {
        return 'Awaiting funding';
      }
      if (role === 'customer') return 'Awaiting your funding';
      if (role === 'contractor') return 'Awaiting customer funding';
      return 'Awaiting funding';
    }
    return taskStatusLabel(task);
  };

  const getDealStatusLabel = (deal: Deal) => {
    const status = deriveDealStatus(deal);
    if (status === 'awaiting_funding') {
      const firstActive = deal.tasks.find(t => t.status !== 'Cancelled');
      if (firstActive?.status === 'ContractorCreated') {
        const customerAddr = chainInfo?.customer || deal.customer;
        const contractorAddr = (chainInfo ? (chainInfo.contractor || deal.contractor) : deal.contractor) || '';
        if (connected && myWallet && customerAddr && contractorAddr && myWallet !== customerAddr && myWallet !== contractorAddr) {
          return 'Awaiting funding';
        }
        if (role === 'customer') return 'Awaiting your funding';
        if (role === 'contractor') return 'Awaiting customer funding';
        return 'Awaiting funding';
      }
    }
    return getStatusLabel(status);
  };

  // deleted handleSubmitWork

  const handleTaskAction = async (taskIndex: number, action: () => Promise<any>, successMsg: string) => {
    setTaskActionLoading(prev => ({...prev, [taskIndex]: true}));
    try {
      await action();
      toast.success(successMsg, getLastTxSig() || undefined);
    } catch (err: any) {
      notifyActionError(toast, err, () => handleTaskAction(taskIndex, action, successMsg));
    } finally {
      setTaskActionLoading(prev => ({...prev, [taskIndex]: false}));
    }
  };

  const handleGlobalAction = async (action: () => Promise<any>, successMsg: string) => {
    setGlobalLoading(true);
    try {
      await action();
      toast.success(successMsg, getLastTxSig() || undefined);
    } catch (err: any) {
      notifyActionError(toast, err, () => handleGlobalAction(action, successMsg));
    } finally {
      setGlobalLoading(false);
    }
  };

  const renderTaskActions = (task: Task, index: number) => {
    if (isVirtualDeal) return null;

    if ((role === 'contractor' && !deal.contractor) || (role === 'customer' && !deal.customer)) {
      return (
        <p className="text-gray-500 text-sm italic mt-4 pt-4 border-t border-gray-800/50">
          {isChainMode && chainInfo ? 'Apply or accept in the panel above to continue' : 'Accept the deal to continue'}
        </p>
      );
    }
    
    const loading = taskActionLoading[index];
    const submissionText = taskSubmissions[index] || '';
    
    if (task.status === 'Resolved') {
      let text = 'Resolved';
      if (task.disputeResult === 'customer') text += ' — Customer won (refund)';
      else if (task.disputeResult === 'contractor') text += ' — Contractor won (payout)';
      return <p className="text-gray-300 text-sm mt-4 pt-4 border-t border-gray-800/50">{text}</p>;
    }

    if (task.status === 'Completed' || task.status === 'Cancelled') {
      return <p className="text-gray-500 text-sm italic mt-4 pt-4 border-t border-gray-800/50">Task is closed.</p>;
    }
    
    if (task.status === 'Disputed') {
      return (
        <div className="mt-4 pt-4 border-t border-gray-800/50 space-y-2">
          <p className="text-yellow-500/80 text-sm">Awaiting arbiter decision.</p>
          <p className="text-xs text-gray-500">
            The arbiter review step is the next milestone. The funds stay locked in escrow until then.
          </p>
        </div>
      );
    }

    if (role === 'customer') {
      const isWrongCustomer = Boolean(chainInfo && connected && myWallet && myWallet !== chainInfo.customer);

      if (task.deposited && task.status === 'CustomerCreated') {
        return (
          <div className="mt-4 pt-4 border-t border-gray-800/50 space-y-3">
            <p className="text-sm text-gray-400">Waiting for the contractor to accept. Until then you can cancel and get your USDC back.</p>
            {!isWrongCustomer && renderSolWarning()}
            {!connected ? (
              <Button variant="outline" onClick={() => setVisible(true)}>Connect Wallet to Cancel</Button>
            ) : isWrongCustomer ? (
              <p className="text-sm text-gray-400">
                Only the customer wallet ({truncateAddress(chainInfo!.customer)}) can do this. Switch Phantom to that account.
              </p>
            ) : (
              <Button variant="outline" onClick={() => handleTaskAction(index, () => client.cancelTask(deal.id, index), 'Task cancelled')} disabled={loading || !hasEnoughSol}>
                {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin inline" /> : null}
                Cancel & Refund
              </Button>
            )}
          </div>
        );
      }

      if (!deal.contractor) {
        return <p className="text-gray-500 text-sm italic mt-4 pt-4 border-t border-gray-800/50">Waiting for a contractor to accept this deal</p>;
      }
      
      if (!task.deposited && (task.status === 'CustomerCreated' || task.status === 'ContractorCreated')) {
        return (
          <div className="mt-4 pt-4 border-t border-gray-800/50 space-y-3">
            <p className="text-sm text-gray-400">Fund this task in escrow to allow the contractor to start.</p>
            {!isWrongCustomer && renderSolWarning()}
            {!connected ? (
              <Button onClick={() => setVisible(true)}>Connect Wallet to Fund Task</Button>
            ) : isWrongCustomer ? (
              <p className="text-sm text-gray-400">
                Only the customer wallet ({truncateAddress(chainInfo!.customer)}) can do this. Switch Phantom to that account.
              </p>
            ) : (
              <Button onClick={() => handleTaskAction(index, () => client.depositTask(deal.id, index, publicKey!.toBase58()), 'Task funded')} disabled={loading || !hasEnoughSol} className={!hasEnoughSol ? 'opacity-50' : ''}>
                {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin inline" /> : null}
                Fund task
              </Button>
            )}
          </div>
        );
      }
      
      if (task.status === 'Started') {
        return <p className="text-gray-500 text-sm italic mt-4 pt-4 border-t border-gray-800/50">Waiting for the contractor to submit work</p>;
      }
      
      if (task.status === 'Finished') {
        return (
          <div className="mt-4 pt-4 border-t border-gray-800/50 space-y-3">
            <p className="text-sm text-gray-400">Review the contractor's submission above.</p>
            {!isWrongCustomer && renderSolWarning()}
            <div className="flex flex-col sm:flex-row gap-2 items-center">
               {!connected ? (
                 <Button onClick={() => setVisible(true)}>Connect Wallet to Act</Button>
               ) : isWrongCustomer ? (
                 <p className="text-sm text-gray-400">
                   Only the customer wallet ({truncateAddress(chainInfo!.customer)}) can do this. Switch Phantom to that account.
                 </p>
               ) : (
                 <>
                   <Button variant="primary" className="bg-green-600 hover:bg-green-500" onClick={() => handleTaskAction(index, () => client.completeTask(deal.id, index, true), 'Task approved')} disabled={loading || !hasEnoughSol} >
                      {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin inline" /> : null}
                      Approve & Release
                   </Button>
                   <Button variant="danger" onClick={() => handleTaskAction(index, () => client.completeTask(deal.id, index, false), 'Dispute opened')} disabled={loading || !hasEnoughSol} >
                      Open Dispute
                   </Button>
                 </>
               )}
            </div>
          </div>
        );
      }
    }
    
    if (role === 'contractor') {
      const isPendingDeposit = task.status === 'CustomerCreated' || task.status === 'ContractorCreated';

      if (!task.deposited && isPendingDeposit) {
        return (
          <div className="mt-4 pt-4 border-t border-gray-800/50 space-y-3">
            <p className="text-gray-500 text-sm italic">Waiting for the customer to fund this task</p>
            {!isChainMode && (
              <>
                {renderSolWarning()}
                <div className="flex">
                  {!connected ? (
                     <Button variant="outline" onClick={() => setVisible(true)}>Connect Wallet to Cancel</Button>
                  ) : (
                    <Button variant="outline" onClick={() => handleTaskAction(index, () => client.cancelTask(deal.id, index), 'Task cancelled')} disabled={loading || !hasEnoughSol}>
                      Cancel Task
                    </Button>
                  )}
                </div>
              </>
            )}
          </div>
        );
      }

      if (task.status === 'CustomerCreated' && index > 0) {
        return (
          <div className="mt-4 pt-4 border-t border-gray-800/50 space-y-3">
            <p className="text-sm text-gray-400">The customer funded this task. Start the task when you are ready to begin work.</p>
            {!isWrongContractor && renderSolWarning()}
            {!connected ? (
              <Button onClick={() => setVisible(true)}>Connect Wallet to Start Task</Button>
            ) : isWrongContractor ? (
              <p className="text-sm text-gray-400">
                Only the selected contractor wallet ({truncateAddress(contractorAddr)}) can do this. Switch Phantom to that account.
              </p>
            ) : (
              <Button
                variant="primary"
                onClick={() => handleTaskAction(index, () => client.acceptTask(deal.id, index, publicKey!.toBase58()), 'Task started')}
                disabled={loading || !hasEnoughSol}
              >
                {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin inline" /> : null}
                Start task
              </Button>
            )}
          </div>
        );
      }
      
      if (task.status === 'Started') {
        const contractorAddr = (chainInfo ? (chainInfo.contractor || deal.contractor) : deal.contractor) || '';
        const isWrongContractor = Boolean(chainInfo && connected && myWallet && contractorAddr && myWallet !== contractorAddr);
        return (
          <div className="mt-4 pt-4 border-t border-gray-800/50 space-y-3">
            {!isWrongContractor && (
              <textarea 
                rows={2} 
                value={submissionText}
                onChange={(e) => setTaskSubmissions(prev => ({...prev, [index]: e.target.value}))}
                placeholder="Link to deliverable (e.g. GitHub PR, Figma link)..." 
                className="w-full bg-gray-950 border border-gray-800 rounded-lg p-3 text-sm focus:outline-none focus:border-purple-500/50"
                disabled={loading}
              />
            )}
            {!isWrongContractor && renderSolWarning()}
            <div className="flex flex-col sm:flex-row gap-2">
              {!connected ? (
                 <Button onClick={() => setVisible(true)}>Connect Wallet to Submit</Button>
              ) : isWrongContractor ? (
                <p className="text-sm text-gray-400">
                  Only the selected contractor wallet ({truncateAddress(contractorAddr)}) can do this. Switch Phantom to that account.
                </p>
              ) : (
                <>
                  <Button variant="primary" onClick={() => handleTaskAction(index, () => client.finishTask(deal.id, index, submissionText), 'Work submitted')} disabled={loading || !submissionText.trim() || !hasEnoughSol}>
                    {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin inline" /> : null}
                    Submit Work
                  </Button>
                  <Button variant="outline" onClick={() => handleTaskAction(index, () => client.cancelTask(deal.id, index), 'Task cancelled')} disabled={loading || !hasEnoughSol}>
                    Cancel & Return Funds
                  </Button>
                </>
              )}
            </div>
            {!isWrongContractor && (
              <p className="text-xs text-gray-500">If you cannot complete this task, cancelling returns the full amount to the customer.</p>
            )}
          </div>
        );
      }
      
      if (task.status === 'Finished') {
        return <p className="text-gray-500 text-sm italic mt-4 pt-4 border-t border-gray-800/50">Waiting for the customer's review</p>;
      }
    }
    
    return null;
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <Link to="/" className="inline-flex items-center gap-2 text-sm text-gray-400 hover:text-white transition-colors">
        <ArrowLeft className="w-4 h-4" /> Back to Dashboard
      </Link>

      <div className="flex flex-col md:flex-row justify-between items-start gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-3 mb-2">
            <h2 className="text-xl sm:text-2xl font-bold break-words">
              {deal.tasks[0]?.meta.title}
              {deal.tasks.length > 1 && ` +${deal.tasks.length - 1}`}
            </h2>
            {/* TEMP: virtual deals go away in stage B. */}
            {isVirtualDeal && virtualStatusLabel ? (
              <Badge>{virtualStatusLabel}</Badge>
            ) : (
              <Badge status={deriveDealStatus(deal)}>{getDealStatusLabel(deal)}</Badge>
            )}
          </div>
          <p className="text-gray-400 text-sm font-mono">{deal.id}</p>
        </div>
        <div className="text-left md:text-right mt-2 md:mt-0 flex flex-col items-start md:items-end gap-3">
          <div className="flex flex-col md:items-end gap-1">
            <div className="text-2xl sm:text-3xl font-bold text-white">${dealTotal(deal).toLocaleString()} <span className="text-base sm:text-lg text-gray-500 font-medium">{symbol}</span></div>
            <div className={`text-xs px-2 py-1 rounded-md border font-medium ${isTestMode ? 'bg-gray-800 text-gray-300 border-gray-700' : 'bg-orange-500/10 text-orange-400 border-orange-500/20'}`}>
              {isTestMode ? 'TEST MODE — devnet funds, no real money' : '⚠ LIVE — real funds'}
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <Card className="p-4 sm:p-5">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <div className="text-gray-500 text-xs uppercase tracking-wider font-semibold mb-1">Escrow</div>
                <div className="text-gray-300 font-medium">{escrowState}</div>
              </div>
              <div>
                <div className="text-gray-500 text-xs uppercase tracking-wider font-semibold mb-1">Customer</div>
                <div className="text-gray-300 font-mono">{deal?.customer ? truncateAddress(deal.customer) : 'Waiting'}</div>
              </div>
              <div>
                <div className="text-gray-500 text-xs uppercase tracking-wider font-semibold mb-1">Contractor</div>
                <div className="text-gray-300 font-mono">
                  {deal?.contractor
                    ? truncateAddress(deal.contractor)
                    : chainInfo?.contractor
                    ? `${truncateAddress(chainInfo.contractor)} (pending)`
                    : 'Waiting'}
                </div>
              </div>
            </div>
            {isTestMode && (
              <div className="mt-4 pt-4 border-t border-gray-800/50 text-xs text-gray-500">
                {isChainMode ? "Payments settle on-chain on Solana Devnet." : "Demo: payments are simulated until the smart contract is deployed"}
              </div>
            )}
          </Card>

          {!isVirtualDeal && !(isChainMode && chainInfo) && ((role === 'contractor' && !deal.contractor) || (role === 'customer' && !deal.customer)) && (
            <Card className="p-6 border-purple-500/20 bg-purple-500/5">
              <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
                <div>
                  <h3 className="text-lg font-medium mb-1">Accept Deal</h3>
                  <p className="text-sm text-gray-400">
                    {/* DEMO: role toggle decides who acts; real client checks wallet */}
                    Join this deal as a {role} to proceed.
                  </p>
                </div>
                <div>
                  {!connected ? (
                    <Button onClick={() => setVisible(true)}>Connect Wallet to Accept</Button>
                  ) : (
                    <Button variant="gradient" onClick={() => handleGlobalAction(() => client.acceptDeal(deal.id, publicKey!.toBase58()), 'Deal accepted')} disabled={globalLoading}>
                      {globalLoading ? <Loader2 className="w-4 h-4 mr-2 animate-spin inline" /> : null}
                      Accept Deal
                    </Button>
                  )}
                </div>
              </div>
            </Card>
          )}

          {!isVirtualDeal && isChainMode && chainInfo && !deal.contractor && <ApplicationsPanel deal={deal} chainInfo={chainInfo} role={role} />}
          <Card className="p-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
              <h3 className="text-lg font-medium flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-purple-400" />
                Tasks
              </h3>
              {canAddTask && (
                <Button
                  variant="outline"
                  onClick={() => {
                    setShowAddTaskForm((prev) => !prev);
                    setFieldErrors({});
                  }}
                  className="w-fit text-xs px-3 py-1.5"
                >
                  <Plus className="w-4 h-4 mr-1.5" />
                  {showAddTaskForm ? 'Cancel' : 'Add task'}
                </Button>
              )}
            </div>

            {showAddTaskForm && (
              <form noValidate onSubmit={handleAddTaskSubmit} className="mb-5 p-4 rounded-lg bg-gray-900 border border-gray-800 space-y-4">
                <div className="flex items-center justify-between border-b border-gray-800 pb-2">
                  <span className="text-sm font-semibold text-gray-200">
                    Add new task / milestone ({role === 'customer' ? 'Customer' : 'Contractor'})
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setShowAddTaskForm(false);
                      setFieldErrors({});
                    }}
                    className="text-gray-400 hover:text-white transition-colors"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <div>
                  <label htmlFor="new-task-title" className="block text-xs font-medium text-gray-300 mb-1">
                    Title
                  </label>
                  <input
                    ref={taskTitleRef}
                    id="new-task-title"
                    type="text"
                    required
                    maxLength={100}
                    placeholder="e.g. Milestone 2: Backend API"
                    value={taskTitle}
                    onChange={(e) => {
                      setTaskTitle(e.target.value);
                      setFieldErrors((prev) => ({ ...prev, title: '' }));
                    }}
                    className="w-full bg-gray-950 border border-gray-800 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-purple-500/50"
                  />
                  {fieldErrors.title && <p className="text-xs text-red-400 mt-1">{fieldErrors.title}</p>}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label htmlFor="new-task-amount" className="block text-xs font-medium text-gray-300 mb-1">
                      Amount ({symbol}) (min 0.01)
                    </label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-sm">$</span>
                      <input
                        ref={taskAmountRef}
                        id="new-task-amount"
                        type="number"
                        min="0.01"
                        step="0.01"
                        autoComplete="off"
                        onWheel={(e) => e.currentTarget.blur()}
                        required
                        placeholder="0.01"
                        value={taskAmount}
                        onChange={(e) => {
                          setTaskAmount(e.target.value);
                          setFieldErrors((prev) => ({ ...prev, amount: '' }));
                        }}
                        className="w-full bg-gray-950 border border-gray-800 rounded-lg pl-7 pr-3 py-2 text-sm text-white focus:outline-none focus:border-purple-500/50"
                      />
                    </div>
                    {fieldErrors.amount && <p className="text-xs text-red-400 mt-1">{fieldErrors.amount}</p>}
                  </div>

                  <div>
                    <label htmlFor="new-task-deadline" className="block text-xs font-medium text-gray-300 mb-1">
                      Deadline
                    </label>
                    <input
                      ref={taskDeadlineRef}
                      id="new-task-deadline"
                      type="date"
                      required
                      value={taskDeadline}
                      onChange={(e) => {
                        setTaskDeadline(e.target.value);
                        setFieldErrors((prev) => ({ ...prev, deadline: '' }));
                      }}
                      onClick={(e) => 'showPicker' in HTMLInputElement.prototype && e.currentTarget.showPicker()}
                      className="w-full bg-gray-950 border border-gray-800 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-purple-500/50 cursor-pointer [&::-webkit-calendar-picker-indicator]:invert [&::-webkit-calendar-picker-indicator]:opacity-70 hover:[&::-webkit-calendar-picker-indicator]:opacity-100"
                    />
                    {fieldErrors.deadline && <p className="text-xs text-red-400 mt-1">{fieldErrors.deadline}</p>}
                  </div>
                </div>

                <div>
                  <label htmlFor="new-task-criteria" className="block text-xs font-medium text-gray-300 mb-1">
                    Success Criteria
                  </label>
                  <textarea
                    ref={taskCriteriaRef}
                    id="new-task-criteria"
                    required
                    maxLength={1000}
                    rows={3}
                    placeholder="Describe deliverables and acceptance criteria for this milestone..."
                    value={taskCriteria}
                    onChange={(e) => {
                      setTaskCriteria(e.target.value);
                      setFieldErrors((prev) => ({ ...prev, criteria: '' }));
                    }}
                    className="w-full bg-gray-950 border border-gray-800 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-purple-500/50 resize-none"
                  />
                  {fieldErrors.criteria && <p className="text-xs text-red-400 mt-1">{fieldErrors.criteria}</p>}
                </div>

                {role === 'customer' && (
                  <p className="text-xs text-gray-400">
                    Adding this task deposits {taskAmount || '0'} {symbol} directly into escrow on-chain.
                  </p>
                )}
                {role === 'contractor' && (
                  <p className="text-xs text-gray-400">
                    This task will be created on-chain and wait for the customer to fund it in escrow.
                  </p>
                )}

                <NetworkDepositInfo type="task" wallet={publicKey?.toBase58()} />

                {renderSolWarning()}

                {isWrongUserForAddTask ? (
                  <p className="text-sm text-gray-400">
                    Only the {role} wallet ({truncateAddress(role === 'customer' ? chainInfo!.customer : contractorAddr)}) can do this. Switch Phantom to that account.
                  </p>
                ) : !connected ? (
                  <Button type="button" onClick={() => setVisible(true)}>Connect Wallet to Add Task</Button>
                ) : (
                  <div className="flex items-center gap-2 pt-1">
                    <Button
                      type="submit"
                      variant="primary"
                      disabled={addTaskLoading || !hasEnoughSol}
                    >
                      {addTaskLoading ? <Loader2 className="w-4 h-4 mr-2 animate-spin inline" /> : null}
                      {role === 'customer' ? 'Add & Fund Task' : 'Add Task'}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setShowAddTaskForm(false)}
                      disabled={addTaskLoading}
                    >
                      Cancel
                    </Button>
                  </div>
                )}
              </form>
            )}
            <div className="space-y-3">
              {isVirtualDeal && !deal.tasks[0]?.meta.successCriteria ? (
                <div className="bg-gray-950 p-4 rounded-lg border border-gray-800 text-gray-300 leading-relaxed">
                  <span className="text-gray-500 italic">Details available once the counterparty opens this deal.</span>
                </div>
              ) : (
                deal.tasks.map((task, i) => {
                  const isExpanded = expandedTasks.includes(i);
                  return (
                    <div key={i} className="bg-gray-950 border border-gray-800 rounded-lg overflow-hidden">
                      <button 
                        onClick={() => toggleTask(i)}
                        aria-expanded={isExpanded}
                        className="w-full flex flex-col sm:flex-row sm:items-center justify-between p-4 text-left hover:bg-gray-900/50 transition-colors gap-3"
                      >
                        <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 min-w-0">
                          <span className="text-gray-500 font-mono text-sm shrink-0">#{i + 1}</span>
                          <span className="font-medium text-gray-200 truncate">{task.meta.title}</span>
                        </div>
                        <div className="flex flex-wrap sm:flex-nowrap items-center gap-3 shrink-0">
                          <span className="font-semibold text-gray-200">${task.amount.toLocaleString()}</span>
                          <Badge status={taskStatusKind(task)}>{getTaskStatusLabel(task)}</Badge>
                          <span className="text-gray-500 text-xs w-24 text-right truncate" title={task.deadline}>{task.deadline === 'TBD' ? 'TBD' : task.deadline}</span>
                        </div>
                      </button>
                      {isExpanded && (
                        <div className="p-4 pt-0 border-t border-gray-800/50 mt-2 text-gray-300 leading-relaxed text-sm bg-gray-950/50">
                          <div className="mt-4">
                            <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Success Criteria</h4>
                            <p className="whitespace-pre-wrap">{task.meta.successCriteria}</p>
                          </div>
                          {task.meta.requirementsFile && (
                            <TaskRequirementsFile requirementsFile={task.meta.requirementsFile} />
                          )}
                          {task.solutionNote && (
                            <div className="mt-4 pt-4 border-t border-gray-800/50">
                              <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Solution Note</h4>
                              <p className="whitespace-pre-wrap">{task.solutionNote}</p>
                            </div>
                          )}
                          {renderTaskActions(task, i)}
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </Card>

          {!isVirtualDeal && deal.history && deal.history.length > 0 && (
            <Card className="p-6">
              <h3 className="font-medium mb-4 flex items-center gap-2">
                <History className="w-4 h-4 text-gray-400" />
                History Log
                {!isChainMode && (
                  <span className="text-xs font-normal bg-orange-500/10 text-orange-400 px-2 py-1 rounded border border-orange-500/20 ml-2">Demo data</span>
                )}
              </h3>
              <div className="space-y-4">
                {deal.history.map((h, i) => (
                  <div key={`${h.date}-${h.action}-${i}`} className="flex gap-3">
                    <div className="mt-1 flex flex-col items-center">
                      <div className="w-2 h-2 rounded-full bg-purple-500"></div>
                      {i !== deal.history!.length - 1 && <div className="w-0.5 h-full bg-gray-800 mt-1"></div>}
                    </div>
                    <div className="pb-4">
                      <div className="text-sm text-gray-300">{h.action}</div>
                      <div className="text-xs text-gray-500 mt-0.5">{h.date}</div>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </div>

        <div className="space-y-6">
          <div>
            <h3 className="font-medium mb-4 text-purple-400 flex items-center gap-2 px-1">
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path></svg>
              Live Deal Preview
            </h3>
            <EscrowActionCard deal={deal} escrowState={escrowState} />
          </div>

          {chainInfo && (
            <div>
              <h3 className="font-medium mb-4 text-gray-400 flex items-center gap-2 px-1">
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="2" y1="12" x2="22" y2="12"></line><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path></svg>
                On-chain (Devnet)
              </h3>
              <Card className="p-5">
                <div className="space-y-4 text-sm">
                  <div>
                    <div className="text-gray-500 mb-1">Deal PDA</div>
                    <a href={explorerAddr(chainInfo.deal)} target="_blank" rel="noreferrer" className="text-blue-400 hover:underline font-mono truncate block" title={chainInfo.deal}>
                      {truncateAddress(chainInfo.deal)}
                    </a>
                  </div>
                  {chainInfo.sigs.length > 0 && (
                    <div>
                      <div className="text-gray-500 mb-2">Transactions</div>
                      <div className="space-y-2">
                        {chainInfo.sigs.map((s, i) => (
                          <div key={i} className="flex justify-between items-center bg-gray-950 p-2 rounded border border-gray-800">
                            <span className="text-gray-300 capitalize">{s.step}</span>
                            <a href={explorerTx(s.sig)} target="_blank" rel="noreferrer" className="text-blue-400 hover:underline text-xs">View →</a>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </Card>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
