import { useRole } from '../RoleContext';
import { Card } from '../components/Card';
import { Badge, getStatusLabel } from '../components/Badge';
import { Button } from '../components/Button';
import { client, isChainMode } from '../lib/client';
import {
  dealTotal,
  deriveDealStatus,
  dealEscrowTotal,
  getEarliestDeadline,
  dealTaskSummary,
  formatDealTaskSummary,
  isDealActive,
  isResolvedStatus,
  dealsNeedingMyAction,
  dealsReadyToClose,
  canDealBeClosed,
} from '../lib/dealStatus';
import { dealTitle } from '../lib/dealTitle';
import { Plus, ArrowRight, DollarSign, Briefcase, Clock, Search, Loader2, Inbox, Wallet } from 'lucide-react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useState, useEffect, useRef } from 'react';
import { CreateDealModal, type CreateDealInitialValues } from '../components/CreateDealModal';
import { parseDealLink } from '../lib/dealLink';
import { listCreateDrafts, clearDraft, type CreateDraftItem } from '../lib/draft';
import { truncateAddress } from '../lib/utils';
import type { Deal } from '../lib/types';
import { useToken } from '../lib/constants';
import { useNetwork } from '../NetworkContext';
import { useWallet } from '@solana/wallet-adapter-react';
import { useSolBalance } from '../hooks/useSolBalance';
import { useToast, notifyActionError } from '../components/Toast';
import { getLastTxSig, getChainInfo } from '../lib/client/chainClient';

const closedStateCache = new Map<string, { state: 'open' | 'closed' | 'unknown'; timestamp: number }>();
const CACHE_TTL_MS = 3 * 60 * 1000;

export const Dashboard = () => {
  const { role, setRole } = useRole();
  const { isTestMode } = useNetwork();
  const toast = useToast();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalInitialValues, setModalInitialValues] = useState<CreateDealInitialValues | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deals, setDeals] = useState<Deal[]>([]);
  
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { publicKey, connected } = useWallet();
  const { solBalance } = useSolBalance();
  const MIN_SOL_REQUIRED = 0.01;
  const hasEnoughSol = solBalance === null || solBalance >= MIN_SOL_REQUIRED;

  const [walletFilter, setWalletFilter] = useState<'all' | 'mine'>('all');
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const [filter, setFilter] = useState<string>(() => (connected ? 'active' : 'all'));
  const [hasUserSelectedFilter, setHasUserSelectedFilter] = useState(false);
  const [closedStates, setClosedStates] = useState<Record<string, 'open' | 'closed' | 'unknown'>>({});
  const [isCheckingNetwork, setIsCheckingNetwork] = useState(false);
  const [showAllUrgent, setShowAllUrgent] = useState(false);
  const [showReadyToClose, setShowReadyToClose] = useState(false);
  const [unfinishedDrafts, setUnfinishedDrafts] = useState<CreateDraftItem[]>([]);
  const [confirmDeleteScope, setConfirmDeleteScope] = useState<string | null>(null);
  const checkSeqRef = useRef(0);

  useEffect(() => {
    if (isModalOpen) {
      window.dispatchEvent(new Event('blinkflow:refresh_balance'));
    }
  }, [isModalOpen]);

  useEffect(() => {
    const refreshDrafts = () => {
      try { setUnfinishedDrafts(listCreateDrafts()); } catch { setUnfinishedDrafts([]); }
    };
    refreshDrafts();
    window.addEventListener('blinkflow:drafts-changed', refreshDrafts);
    window.addEventListener('storage', refreshDrafts);
    return () => {
      window.removeEventListener('blinkflow:drafts-changed', refreshDrafts);
      window.removeEventListener('storage', refreshDrafts);
    };
  }, []);

  useEffect(() => {
    if (!hasUserSelectedFilter) {
      setFilter(connected ? 'active' : 'all');
    }
  }, [connected, hasUserSelectedFilter]);

  const fetchClosedStates = async (targetDeals: Deal[], force = false) => {
    const pk = publicKey?.toBase58();
    if (!connected || !pk || targetDeals.length === 0) return;

    const now = Date.now();
    const dealsToCheck: Deal[] = [];
    const initialFromCache: Record<string, 'open' | 'closed' | 'unknown'> = {};

    for (const deal of targetDeals) {
      if (deal.closed) {
        initialFromCache[deal.id] = 'closed';
        continue;
      }
      const hasChain = Boolean(getChainInfo(deal.id));
      if (!canDealBeClosed(deal, pk, isChainMode, hasChain)) {
        continue;
      }
      const cached = closedStateCache.get(deal.id);
      if (!force && cached && now - cached.timestamp < CACHE_TTL_MS) {
        initialFromCache[deal.id] = cached.state;
      } else {
        dealsToCheck.push(deal);
      }
    }

    if (Object.keys(initialFromCache).length > 0) {
      setClosedStates(prev => ({ ...prev, ...initialFromCache }));
    }

    if (dealsToCheck.length === 0) return;

    const seq = ++checkSeqRef.current;
    setIsCheckingNetwork(true);
    try {
      const res = await client.getDealsClosedState(dealsToCheck, pk);
      if (checkSeqRef.current !== seq) return;

      const updatedTime = Date.now();
      const nextStates: Record<string, 'open' | 'closed' | 'unknown'> = {};
      for (const d of dealsToCheck) {
        const state = res[d.id] ?? 'unknown';
        nextStates[d.id] = state;
        closedStateCache.set(d.id, { state, timestamp: updatedTime });
      }
      setClosedStates(prev => ({ ...prev, ...nextStates }));
    } catch (err) {
      if (checkSeqRef.current !== seq) return;
      console.warn('[Dashboard] getDealsClosedState error', err);
      const fallback: Record<string, 'unknown'> = {};
      const fallbackTime = Date.now();
      for (const d of dealsToCheck) {
        fallback[d.id] = 'unknown';
        closedStateCache.set(d.id, { state: 'unknown', timestamp: fallbackTime });
      }
      setClosedStates(prev => ({ ...prev, ...fallback }));
    } finally {
      if (checkSeqRef.current === seq) {
        setIsCheckingNetwork(false);
      }
    }
  };

  useEffect(() => {
    if (!loading && connected && deals.length > 0) {
      fetchClosedStates(deals);
    }
  }, [loading, connected, deals]);

  useEffect(() => {
    const loadDeals = async () => {
      try {
        const list = await client.listDeals();
        const mapped = list.map((deal, index) => ({ deal, index }));
        mapped.sort((a, b) => {
          const tA = new Date(a.deal.createdAt).getTime();
          const tB = new Date(b.deal.createdAt).getTime();
          if (tB !== tA) return tB - tA;
          return b.index - a.index;
        });
        setDeals(mapped.map(m => m.deal));
      } catch (err: any) {
        setError("Failed to fetch deals");
      } finally {
        setLoading(false);
      }
    };
    loadDeals();
    const handleDealsChanged = () => {
      loadDeals();
    };
    window.addEventListener('blinkflow:deals-changed', handleDealsChanged);
    
    return () => {
      window.removeEventListener('blinkflow:deals-changed', handleDealsChanged);
    };
  }, []);

  useEffect(() => {
    if (searchParams.get('new') === '1') {
      if (searchParams.has('d')) {
        const parsed = parseDealLink(searchParams.toString());
        if (parsed) {
          setRole('customer');
          setModalInitialValues({
            fromLink: parsed,
          });
          setIsModalOpen(true);
        } else {
          toast.error('This deal link is not valid.');
        }
        const nextParams = new URLSearchParams(searchParams);
        nextParams.delete('new');
        nextParams.delete('role');
        nextParams.delete('d');
        setSearchParams(nextParams, { replace: true });
        return;
      }

      const roleParam = searchParams.get('role');
      if (roleParam === 'contractor') {
        setRole('contractor');
      } else {
        setRole('customer');
      }
      const rawTitle = (searchParams.get('title') || '').trim().slice(0, 100);

      const parsedAmount = parseFloat(searchParams.get('amount') || '');
      const validAmount = !isNaN(parsedAmount) && parsedAmount >= 0.01 ? String(parsedAmount) : '';

      const parsedDays = parseInt(searchParams.get('days') || '', 10);
      let deadlineStr = '';
      if (!isNaN(parsedDays) && parsedDays > 0 && parsedDays <= 365) {
        const d = new Date();
        d.setDate(d.getDate() + parsedDays);
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        deadlineStr = `${y}-${m}-${day}`;
      } else {
        const rawDeadline = searchParams.get('deadline');
        if (rawDeadline && /^\d{4}-\d{2}-\d{2}$/.test(rawDeadline)) {
          const parsedDate = new Date(rawDeadline);
          const today = new Date();
          today.setHours(0, 0, 0, 0);
          if (!isNaN(parsedDate.getTime()) && parsedDate >= today) {
            deadlineStr = rawDeadline;
          }
        }
      }

      setModalInitialValues({
        title: rawTitle,
        amount: validAmount,
        deadline: deadlineStr,
      });
      setIsModalOpen(true);

      const nextParams = new URLSearchParams(searchParams);
      nextParams.delete('new');
      nextParams.delete('role');
      nextParams.delete('title');
      nextParams.delete('amount');
      nextParams.delete('days');
      nextParams.delete('deadline');
      setSearchParams(nextParams, { replace: true });
    }
  }, [searchParams, setSearchParams, setRole]);

  const handleOpenCreateModal = () => {
    setModalInitialValues(undefined);
    setIsModalOpen(true);
  };

  const handleCloseCreateModal = () => {
    setIsModalOpen(false);
    setModalInitialValues(undefined);
  };

  const handleContinueDraft = (scope: 'create:customer' | 'create:contractor') => {
    setRole(scope === 'create:customer' ? 'customer' : 'contractor');
    setModalInitialValues(undefined);
    setIsModalOpen(true);
  };

  const handleDeleteDraft = (scope: string) => {
    clearDraft(scope);
    setConfirmDeleteScope(null);
    try { setUnfinishedDrafts(listCreateDrafts()); } catch { setUnfinishedDrafts([]); }
  };

  const formatRelativeTime = (savedAt: number): string => {
    const diffSec = Math.max(0, Math.floor((Date.now() - savedAt) / 1000));
    if (diffSec < 60) return 'Saved just now';
    const diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) return `Saved ${diffMin}m ago`;
    const diffHours = Math.floor(diffMin / 60);
    if (diffHours < 24) return `Saved ${diffHours}h ago`;
    return `Saved ${Math.floor(diffHours / 24)}d ago`;
  };

  const myWallet = publicKey?.toBase58() ?? null;
  const myDeals = deals.filter(d => {
    return myWallet && (d.customer === myWallet || d.contractor === myWallet || d.creator === myWallet);
  });
  const baseDeals = walletFilter === 'mine' 
    ? myDeals
    : deals;

  const activeDeals = myDeals.filter(d => isDealActive(d));
  
  const pendingActions = dealsNeedingMyAction(deals, myWallet, closedStates);
  const readyToCloseDeals = dealsReadyToClose(deals, myWallet, closedStates);

  const getEffectiveClosedState = (deal: Deal): 'open' | 'closed' | 'unknown' | undefined => {
    if (deal.closed) return 'closed';
    return closedStates[deal.id];
  };

  const filteredDeals = baseDeals.filter(deal => {
    if (filter === 'all') return true;
    if (filter === 'active') return isDealActive(deal);
    if (filter === 'attention' || filter === 'needs_action') return pendingActions.some(p => p.id === deal.id);
    if (filter === 'not_closed') {
      const st = getEffectiveClosedState(deal);
      return st === 'open';
    }
    if (filter === 'ready_to_close') {
      return readyToCloseDeals.some(r => r.id === deal.id);
    }
    if (filter === 'closed') {
      const st = getEffectiveClosedState(deal);
      return st === 'closed';
    }
    const status = deriveDealStatus(deal);
    if (filter === 'completed') return status === 'completed' || isResolvedStatus(status);
    return status === filter;
  });

  const renderClosedStateChip = (deal: Deal) => {
    const pk = publicKey?.toBase58() ?? null;
    const hasChain = Boolean(getChainInfo(deal.id));
    const eligible = canDealBeClosed(deal, pk, isChainMode, hasChain);
    if (!eligible && !deal.closed) {
      return null;
    }

    const state = getEffectiveClosedState(deal);

    if (!state) {
      return (
        <span
          className="px-2 py-0.5 rounded-full text-xs font-medium border bg-gray-800/60 text-gray-400 border-gray-700/60 shrink-0 inline-flex items-center"
          title="Checking network status..."
        >
          …
        </span>
      );
    }

    if (state === 'closed') {
      return (
        <span
          className="px-2 py-0.5 rounded-full text-xs font-medium border bg-green-500/10 text-green-400 border-green-500/20 shrink-0 inline-flex items-center"
          title="Deal account closed on the network"
        >
          Closed
        </span>
      );
    }

    if (state === 'open') {
      return (
        <span
          className="px-2 py-0.5 rounded-full text-xs font-medium border bg-amber-500/10 text-amber-400 border-amber-500/20 shrink-0 inline-flex items-center"
          title="The network deposit has not been returned yet"
        >
          Not closed
        </span>
      );
    }

    if (state === 'unknown') {
      return (
        <span
          className="px-2 py-0.5 rounded-full text-xs font-medium border bg-gray-800/80 text-gray-400 border-gray-700 shrink-0 inline-flex items-center gap-1.5"
        >
          Couldn't check
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              fetchClosedStates([deal], true);
            }}
            className="text-purple-400 hover:text-purple-300 underline font-normal cursor-pointer ml-0.5"
          >
            Retry
          </button>
        </span>
      );
    }

    return null;
  };

  const handlePendingAction = async (e: React.MouseEvent, deal: Deal, action: 'release' | 'dispute' | 'assign') => {
    e.stopPropagation();
    if (action === 'assign') {
      navigate(`/deal/${deal.id}`);
      return;
    }
    
    const submittedTasks = deal.tasks.map((t, i) => ({t, i})).filter(x => x.t.status === 'Finished');
    if (submittedTasks.length !== 1) {
      navigate(`/deal/${deal.id}`);
      return;
    }
    const taskIndex = submittedTasks[0].i;

    setActionLoading(deal.id);
    try {
      if (action === 'release') {
        await client.completeTask(deal.id, taskIndex, true);
        toast.success('Payment released', getLastTxSig() || undefined);
      } else if (action === 'dispute') {
        await client.completeTask(deal.id, taskIndex, false);
        toast.success('Dispute opened', getLastTxSig() || undefined);
      }
      window.dispatchEvent(new Event('blinkflow:deals-changed'));
    } catch (err: any) {
      console.error(err);
      notifyActionError(toast, err, () => handlePendingAction(e, deal, action));
    } finally {
      setActionLoading(null);
    }
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            Overview
          </h2>
          <p className="text-gray-400 text-sm mt-1">Manage your escrow agreements and release payments securely.</p>
        </div>
        <Button variant="gradient" onClick={handleOpenCreateModal} className="px-5">
          <Plus className="w-4 h-4" />
          Create Deal
        </Button>
      </div>

      {/* Stats */}
      <div className="flex flex-col md:flex-row gap-3 md:gap-5">
        {/* Money Group */}
        <div className="w-full md:w-1/3">
          <Card className="h-full p-5 bg-gray-900/40 backdrop-blur-sm border-gray-800/60 hover:bg-gray-900/60 transition-colors">
            <div className="flex items-center gap-3 text-gray-400 mb-3">
              <div className="p-2 bg-purple-500/10 rounded-lg">
                <DollarSign className="w-4 h-4 text-purple-400" />
              </div>
              <span className="text-sm font-medium">Funds in Escrow</span>
            </div>
            <div className="text-3xl font-bold tracking-tight">
              ${activeDeals.reduce((acc, deal) => acc + dealEscrowTotal(deal), 0).toLocaleString()}
            </div>
          </Card>
        </div>
        
        {/* Deals Group */}
        <div className="w-full md:w-2/3 grid grid-cols-2 gap-3 md:gap-5">
          <Card className="p-5 bg-gray-900/40 backdrop-blur-sm border-gray-800/60 hover:bg-gray-900/60 transition-colors">
            <div className="flex items-center gap-3 text-gray-400 mb-3">
              <div className="p-2 bg-blue-500/10 rounded-lg">
                <Briefcase className="w-4 h-4 text-blue-400" />
              </div>
              <span className="text-sm font-medium">Active Deals</span>
            </div>
            <div className="text-2xl sm:text-3xl font-bold tracking-tight">{activeDeals.length}</div>
          </Card>
          <Card 
            className={`p-5 backdrop-blur-sm transition-all cursor-pointer relative ${filter === 'attention' ? 'bg-gray-800/60 border-orange-500/50 shadow-[0_0_15px_rgba(249,115,22,0.1)]' : 'bg-gray-900/40 border-gray-800/60 hover:bg-gray-900/60'}`}
            onClick={() => {
              setHasUserSelectedFilter(true);
              setFilter(filter === 'attention' ? 'all' : 'attention');
            }}
            title="Show deals that need your attention"
          >
            <div className="flex items-center gap-3 text-gray-400 mb-3">
              <div className="p-2 bg-orange-500/10 rounded-lg">
                <Clock className="w-4 h-4 text-orange-400" />
              </div>
              <span className="text-sm font-medium">Needs Attention</span>
            </div>
            <div className="text-2xl sm:text-3xl font-bold tracking-tight">{pendingActions.length}</div>
            <div className="absolute bottom-4 right-5 text-xs font-medium text-orange-500/80">
              {filter === 'attention' ? '✓ Filtered · click to clear' : 'View →'}
            </div>
          </Card>
        </div>
      </div>

      {/* Pending / Ready to Close Actions */}
      {connected && (pendingActions.length > 0 || readyToCloseDeals.length > 0) && (
        <div className="space-y-4">
          {pendingActions.length > 0 && (
            <>
              <h3 className="text-lg font-medium flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-orange-500 animate-pulse shadow-[0_0_8px_rgba(249,115,22,0.6)]"></div>
                Awaiting Your Action
              </h3>
              <div className="grid grid-cols-1 gap-3">
                {(showAllUrgent ? pendingActions : pendingActions.slice(0, 3)).map(deal => {
                  const isCustomer = deal.customer === myWallet;
                  const isContractor = deal.contractor === myWallet;
                  const hasFinishedTask = deal.tasks.some(t => t.status === 'Finished');
                  const needsAssign = !deal.contractor && deriveDealStatus(deal) !== 'cancelled';
                  const hasFundedTask = deal.tasks.some(t => (t.status === 'CustomerCreated' || t.status === 'ContractorCreated') && t.deposited);
                  const hasStartedTask = deal.tasks.some(t => t.status === 'Started');

                  let actionDesc = 'Action required on this deal.';
                  if (isCustomer && hasFinishedTask) {
                    actionDesc = 'Contractor submitted work for review.';
                  } else if (isCustomer && needsAssign) {
                    actionDesc = 'Waiting to assign a contractor.';
                  } else if (isCustomer && deal.tasks.some(t => t.status === 'ContractorCreated' && !t.deposited)) {
                    actionDesc = 'Contractor proposed a task. Waiting for customer funding.';
                  } else if (isContractor && hasFundedTask) {
                    actionDesc = 'Task funded. Ready to start.';
                  } else if (isContractor && hasStartedTask) {
                    actionDesc = 'Task in progress. Submit work when ready.';
                  }

                  const showCustomerReviewButtons = isCustomer && hasFinishedTask;
                  const showCustomerAssignButton = isCustomer && needsAssign;

                  return (
                    <Card 
                      key={deal.id} 
                      className="p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between border-orange-500/20 bg-orange-500/5 gap-4 cursor-pointer hover:bg-orange-500/10 focus:outline-none focus:ring-2 focus:ring-orange-500/50 transition-colors"
                      tabIndex={0}
                      role="link"
                      onClick={() => navigate(`/deal/${deal.id}`)}
                      onKeyDown={(e) => e.key === 'Enter' && e.target === e.currentTarget && navigate(`/deal/${deal.id}`)}
                    >
                      <div>
                        <div className="font-semibold text-gray-200">
                          {dealTitle(deal)}
                          {deal.tasks.length > 1 && ` +${deal.tasks.length - 1}`}
                        </div>
                        <div className="text-sm text-gray-400 mt-1">
                          {actionDesc}
                        </div>
                        {!hasEnoughSol && isCustomer && hasFinishedTask && (
                          <div className="mt-1 text-xs text-orange-400 font-medium">
                            You need ~0.01 SOL to cover network fees.
                          </div>
                        )}
                      </div>
                      <div className="flex flex-col sm:flex-row flex-wrap gap-2 w-full md:w-auto md:justify-end">
                        {showCustomerReviewButtons ? (
                          <>
                            <Button variant="danger" className="w-full sm:flex-none" onClick={(e) => handlePendingAction(e, deal, 'dispute')} disabled={actionLoading === deal.id || !hasEnoughSol}>Open Dispute</Button>
                            <Button variant="primary" className="w-full sm:flex-none bg-orange-500 hover:bg-orange-600 text-white" onClick={(e) => handlePendingAction(e, deal, 'release')} disabled={actionLoading === deal.id || !hasEnoughSol}>
                               {actionLoading === deal.id ? <Loader2 className="w-4 h-4 mr-2 animate-spin inline" /> : null}
                               Release Payment ${dealTotal(deal)}
                            </Button>
                          </>
                        ) : showCustomerAssignButton ? (
                          <Button variant="outline" className="w-full sm:w-auto border-orange-500/30 text-orange-400 hover:bg-orange-500/10" onClick={(e) => handlePendingAction(e, deal, 'assign')}>Assign Contractor</Button>
                        ) : (
                          <Button variant="outline" className="w-full sm:w-auto border-orange-500/30 text-orange-400 hover:bg-orange-500/10" onClick={() => navigate(`/deal/${deal.id}`)}>View Deal</Button>
                        )}
                      </div>
                    </Card>
                  );
                })}
              </div>
              {pendingActions.length > 3 && (
                <div className="flex justify-center pt-1">
                  <Button
                    variant="outline"
                    onClick={() => setShowAllUrgent(prev => !prev)}
                    className="text-xs px-3 py-1.5 text-gray-400 hover:text-gray-200 border-gray-800 hover:bg-gray-800/40"
                  >
                    {showAllUrgent ? 'Show less' : `Show all (${pendingActions.length})`}
                  </Button>
                </div>
              )}
            </>
          )}

          {readyToCloseDeals.length > 0 && (
            <Card className="p-3 sm:p-4 bg-gray-900/40 border-gray-800/80 backdrop-blur-sm">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2.5">
                <div className="text-xs sm:text-sm text-gray-300 flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-400/80 shrink-0"></span>
                  <span>
                    {readyToCloseDeals.length} finished {readyToCloseDeals.length === 1 ? 'deal is' : 'deals are'} ready to close and will return their network deposit.
                  </span>
                </div>
                <Button
                  variant="outline"
                  onClick={() => setShowReadyToClose(prev => !prev)}
                  className="text-xs h-7 px-3 py-1 border-gray-700 text-gray-300 hover:text-white shrink-0 self-end sm:self-auto"
                >
                  {showReadyToClose ? 'Hide' : 'Review'}
                </Button>
              </div>

              {showReadyToClose && (
                <div className="mt-3 pt-3 border-t border-gray-800/80 max-h-[320px] overflow-y-auto space-y-1 pr-1">
                  {readyToCloseDeals.map(deal => (
                    <div
                      key={deal.id}
                      className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 sm:gap-4 p-2 rounded hover:bg-gray-800/40 transition-colors text-xs"
                    >
                      <div className="min-w-0 flex items-center gap-2">
                        <span className="font-medium text-gray-200 truncate">{dealTitle(deal)}</span>
                        <span className="font-mono text-gray-500 text-[11px] shrink-0">{deal.id}</span>
                      </div>
                      <Link
                        to={`/deal/${deal.id}`}
                        className="text-purple-400 hover:text-purple-300 underline font-medium shrink-0 self-start sm:self-auto"
                      >
                        Open deal
                      </Link>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          )}
        </div>
      )}

      {/* Unfinished deals */}
      {unfinishedDrafts.length > 0 && (
        <Card className="p-3 sm:p-4 bg-gray-900/40 border-gray-800/80 backdrop-blur-sm space-y-2">
          <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-purple-400/80 shrink-0" />
            Unfinished deals
          </div>
          <div className="space-y-1.5">
            {unfinishedDrafts.map((d) => (
              <div
                key={d.scope}
                className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-2.5 rounded-lg bg-gray-950/40 border border-gray-800/60 text-xs"
              >
                <div className="min-w-0 space-y-0.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium text-gray-200 truncate">{d.title}</span>
                    {d.amount && (
                      <span className="font-semibold text-purple-300">
                        ${!isNaN(parseFloat(d.amount)) ? parseFloat(d.amount).toLocaleString() : d.amount} USDC
                      </span>
                    )}
                    <span className="px-1.5 py-0.5 rounded bg-gray-800/80 text-[11px] text-gray-400">
                      {d.scope === 'create:customer' ? 'as customer' : 'as contractor'}
                    </span>
                    <span className="text-gray-500 text-[11px]">
                      {formatRelativeTime(d.savedAt)}
                    </span>
                  </div>
                  <p className="text-[11px] text-gray-500">
                    Not on the network yet. Nothing is locked.
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0 self-end sm:self-auto">
                  {confirmDeleteScope === d.scope ? (
                    <div className="flex items-center gap-2">
                      <span className="text-gray-400 text-xs">Delete draft?</span>
                      <Button
                        variant="outline"
                        onClick={() => handleDeleteDraft(d.scope)}
                        className="text-xs h-7 px-2.5 py-1 border-red-500/50 bg-red-500/10 text-red-400 hover:bg-red-500/20"
                      >
                        Sure?
                      </Button>
                      <button
                        type="button"
                        onClick={() => setConfirmDeleteScope(null)}
                        className="text-gray-400 hover:text-gray-200 text-xs px-1 cursor-pointer"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <>
                      <Button
                        variant="outline"
                        onClick={() => handleContinueDraft(d.scope)}
                        className="text-xs h-7 px-3 py-1 border-purple-500/40 text-purple-300 hover:text-white hover:bg-purple-500/10"
                      >
                        Continue
                      </Button>
                      <Button
                        variant="outline"
                        onClick={() => setConfirmDeleteScope(d.scope)}
                        className="text-xs h-7 px-2.5 py-1 border-gray-700 text-gray-400 hover:text-red-400 hover:border-red-500/40"
                      >
                        Delete
                      </Button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Deal List */}
      <Card className="overflow-hidden border-gray-800/60 shadow-lg">
        <div className="p-4 border-b border-gray-800/60 flex flex-col sm:flex-row items-start sm:items-center justify-between bg-gray-900/60 gap-4">
          <h3 className="font-medium text-lg flex items-center gap-2">
            All Deals
          </h3>
          <div className="flex items-center gap-3 w-full sm:w-auto">
            <div className="flex bg-gray-950 border border-gray-800 rounded-lg p-0.5 shrink-0">
              <button 
                onClick={() => setWalletFilter('all')}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${walletFilter === 'all' ? 'bg-gray-800 text-white' : 'text-gray-400 hover:text-gray-200'}`}
              >
                All
              </button>
              <button 
                onClick={() => setWalletFilter('mine')}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${walletFilter === 'mine' ? 'bg-gray-800 text-white' : 'text-gray-400 hover:text-gray-200'}`}
              >
                Mine
              </button>
            </div>
            <div className="relative w-full sm:w-64 shrink-0">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
            <input 
              type="text" 
              placeholder="Search deals..." 
              className="w-full bg-gray-950 border border-gray-800 rounded-lg pl-9 pr-4 py-2 text-sm focus:outline-none focus:border-purple-500/50 focus:ring-1 focus:ring-purple-500/50 transition-all text-gray-200 placeholder:text-gray-600"
            />
          </div>
          </div>
        </div>
        <div className="relative border-b border-gray-800/60 bg-gray-900/40">
          <div className="px-4 py-3 flex gap-2 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {[
              { id: 'active', label: 'Active' },
              { id: 'all', label: 'All' },
              { id: 'in_progress', label: 'In progress' },
              { id: 'pending_approval', label: 'Pending approval' },
              { id: 'dispute', label: 'Dispute' },
              { id: 'completed', label: 'Completed' },
              { id: 'attention', label: 'Needs my action' },
              { id: 'not_closed', label: 'Not closed' },
              { id: 'ready_to_close', label: 'Ready to close' },
              { id: 'closed', label: 'Closed' },
            ].map((chip) => (
              <button
                key={chip.id}
                onClick={() => {
                  setHasUserSelectedFilter(true);
                  setFilter(chip.id);
                  if (chip.id === 'not_closed' || chip.id === 'closed' || chip.id === 'ready_to_close') {
                    fetchClosedStates(deals);
                  }
                }}
                className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors ${
                  filter === chip.id 
                    ? 'bg-gray-700 text-white' 
                    : 'bg-gray-800/30 text-gray-400 hover:text-gray-200 hover:bg-gray-800'
                }`}
              >
                {chip.label}
              </button>
            ))}
          </div>
          <div className="pointer-events-none absolute right-0 top-0 bottom-0 w-8 sm:w-12 bg-gradient-to-l from-gray-900/90 to-transparent" />
        </div>
        {isCheckingNetwork && (filter === 'not_closed' || filter === 'closed' || filter === 'ready_to_close') && (
          <div className="px-4 py-2 bg-gray-950/40 border-b border-gray-800/60 text-xs text-gray-400 flex items-center gap-2">
            <Loader2 className="w-3.5 h-3.5 animate-spin text-purple-400" />
            Checking the network…
          </div>
        )}
        <div className="overflow-x-auto">
          {loading ? (
            <div className="flex justify-center items-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-purple-500" />
            </div>
          ) : error ? (
            <div className="p-12 text-center text-red-400 font-medium">{error}</div>
          ) : walletFilter === 'mine' && !connected ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <div className="w-16 h-16 bg-gray-900/80 rounded-full flex items-center justify-center mb-4 border border-gray-800">
                <Wallet className="w-8 h-8 text-gray-500" />
              </div>
              <h3 className="text-lg font-medium text-gray-200">Connect your wallet</h3>
              <p className="text-sm text-gray-400 mt-1 max-w-sm">Please connect your wallet to see your deals.</p>
            </div>
          ) : filteredDeals.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <div className="w-16 h-16 bg-gray-900/80 rounded-full flex items-center justify-center mb-4 border border-gray-800">
                <Inbox className="w-8 h-8 text-gray-500" />
              </div>
              {filter === 'active' && baseDeals.length > 0 ? (
                <>
                  <h3 className="text-lg font-medium text-gray-200">No active deals</h3>
                  <p className="text-sm text-gray-400 mt-1 max-w-sm">
                    No active deals.{' '}
                    <button
                      type="button"
                      onClick={() => {
                        setHasUserSelectedFilter(true);
                        setFilter('all');
                      }}
                      className="text-purple-400 hover:text-purple-300 underline font-medium cursor-pointer"
                    >
                      Show all deals
                    </button>
                  </p>
                </>
              ) : (
                <>
                  <h3 className="text-lg font-medium text-gray-200">No deals found</h3>
                  <p className="text-sm text-gray-400 mt-1 max-w-sm">You haven't created or participated in any deals yet. Create a new deal to get started.</p>
                  <Button variant="outline" onClick={handleOpenCreateModal} className="mt-4">
                    <Plus className="w-4 h-4 mr-2" />
                    Create First Deal
                  </Button>
                </>
              )}
            </div>
          ) : (
            <>
            {/* Mobile/Tablet Card Layout */}
            <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-4 p-4 xl:hidden">
              {filteredDeals.map(deal => (
                <div 
                  key={deal.id} 
                  className="bg-gray-900/40 border border-gray-800/60 rounded-lg p-4 space-y-3 cursor-pointer hover:bg-gray-800/40 focus:outline-none focus:ring-2 focus:ring-purple-500/50 transition-colors"
                  tabIndex={0}
                  role="link"
                  onClick={() => navigate(`/deal/${deal.id}`)}
                  onKeyDown={(e) => e.key === 'Enter' && e.target === e.currentTarget && navigate(`/deal/${deal.id}`)}
                >
                  <div className="flex justify-between items-start gap-2">
                    <div className="min-w-0">
                      <div className="font-medium text-gray-200 truncate">
                        {dealTitle(deal)}
                        {deal.tasks.length > 1 && ` +${deal.tasks.length - 1}`}
                      </div>
                      <div className="text-[11px] text-gray-500 mt-0.5">
                        {formatDealTaskSummary(deal)}
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {renderClosedStateChip(deal)}
                      <Badge status={deriveDealStatus(deal)} className="shrink-0">{getStatusLabel(deriveDealStatus(deal))}</Badge>
                    </div>
                  </div>
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-gray-500 shrink-0">{role === 'contractor' ? 'Customer' : 'Contractor'}:</span>
                    <span className="font-mono text-gray-400 text-xs truncate ml-2">
                      {role === 'contractor' ? (deal.customer ? truncateAddress(deal.customer) : <span className="italic">Unassigned</span>) : (deal.contractor ? truncateAddress(deal.contractor) : <span className="italic">Unassigned</span>)}
                    </span>
                  </div>
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-gray-500">Amount:</span>
                    <span className="font-semibold text-gray-200">${dealTotal(deal).toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-gray-500">Deadline:</span>
                    <span className="text-gray-400 text-xs">{getEarliestDeadline(deal)}</span>
                  </div>

                </div>
              ))}
            </div>
            
            {/* Desktop Table Layout */}
            <table className="w-full text-sm text-left whitespace-nowrap hidden xl:table">
              <thead className="text-[11px] text-gray-500 uppercase tracking-wider bg-gray-950/40">
                <tr>
                  <th className="px-5 py-3 font-semibold">Deal</th>
                  <th className="px-5 py-3 font-semibold">{role === 'contractor' ? 'Customer' : 'Contractor'}</th>
                  <th className="px-5 py-3 font-semibold">Amount</th>
                  <th className="px-5 py-3 font-semibold">Status</th>
                  <th className="px-5 py-3 font-semibold">Deadline</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800/60 bg-gray-900/20">
                {filteredDeals.map((deal) => (
                  <tr 
                    key={deal.id} 
                    className="hover:bg-gray-800/40 transition-colors group cursor-pointer focus:outline-none focus:ring-2 focus:ring-purple-500/50"
                    tabIndex={0}
                    role="link"
                    onClick={() => navigate(`/deal/${deal.id}`)}
                    onKeyDown={(e) => e.key === 'Enter' && e.target === e.currentTarget && navigate(`/deal/${deal.id}`)}
                  >
                    <td className="px-5 py-4">
                      <div className="font-medium text-gray-200 group-hover:text-purple-400 transition-colors">
                        {dealTitle(deal)}
                        {deal.tasks.length > 1 && ` +${deal.tasks.length - 1}`}
                      </div>
                      <div className="text-[11px] text-gray-500 mt-0.5">
                        {formatDealTaskSummary(deal)}
                      </div>
                    </td>
                    <td className="px-5 py-4 font-mono text-xs text-gray-400">
                      {role === 'contractor' ? (deal.customer ? truncateAddress(deal.customer) : <span className="text-gray-600 italic">Unassigned</span>) : (deal.contractor ? truncateAddress(deal.contractor) : <span className="text-gray-600 italic">Unassigned</span>)}
                    </td>
                    <td className="px-5 py-4 font-semibold text-gray-200">${dealTotal(deal).toLocaleString()}</td>
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-2">
                        <Badge status={deriveDealStatus(deal)}>{getStatusLabel(deriveDealStatus(deal))}</Badge>
                        {renderClosedStateChip(deal)}
                      </div>
                    </td>
                    <td className="px-5 py-4 text-gray-400 text-xs">{getEarliestDeadline(deal)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            </>
          )}
        </div>
      </Card>

      {isModalOpen && (
        <CreateDealModal
          isOpen={isModalOpen}
          initialValues={modalInitialValues}
          onClose={handleCloseCreateModal}
        />
      )}
    </div>
  );
};
