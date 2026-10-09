import { useRole } from '../RoleContext';
import { Card } from '../components/Card';
import { Badge, getStatusLabel } from '../components/Badge';
import { Button } from '../components/Button';
import { client } from '../lib/client';
import { dealTotal, deriveDealStatus, dealEscrowTotal, getEarliestDeadline } from '../lib/dealStatus';
import { Plus, ArrowRight, DollarSign, Briefcase, Clock, Search, Loader2, Inbox, Wallet } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { CreateDealModal } from '../components/CreateDealModal';
import { truncateAddress } from '../lib/utils';
import type { Deal } from '../lib/types';
import { useToken } from '../lib/constants';
import { useNetwork } from '../NetworkContext';
import { useWallet } from '@solana/wallet-adapter-react';
import { useSolBalance } from '../hooks/useSolBalance';

export const Dashboard = () => {
  const { role } = useRole();
  const { isTestMode } = useNetwork();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deals, setDeals] = useState<Deal[]>([]);
  const [filter, setFilter] = useState<string>('all');
  
  const navigate = useNavigate();
  const { publicKey, connected } = useWallet();
  const { solBalance } = useSolBalance();
  const MIN_SOL_REQUIRED = 0.01;
  const hasEnoughSol = solBalance !== null && solBalance >= MIN_SOL_REQUIRED;

  const [walletFilter, setWalletFilter] = useState<'all' | 'mine'>('all');
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [actionError, setActionError] = useState<Record<string, string>>({});

  useEffect(() => {
    const loadDeals = async () => {
      try {
        setDeals(await client.listDeals());
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

  const isResolved = (status: string) => status === 'resolved' || status === 'resolved_refunded' || status === 'resolved_paid_out';
  const baseDeals = walletFilter === 'mine' 
    ? deals.filter(d => {
        const pk = publicKey?.toBase58();
        return pk && (d.customer === pk || d.contractor === pk || d.creator === pk);
      })
    : deals;

  const activeDeals = baseDeals.filter(d => {
    const status = deriveDealStatus(d);
    return status !== 'completed' && status !== 'cancelled' && !isResolved(status);
  });
  
  const pendingActions = role === 'customer' 
    ? activeDeals.filter(d => deriveDealStatus(d) === 'pending_approval' || deriveDealStatus(d) === 'searching')
    : activeDeals.filter(d => deriveDealStatus(d) === 'in_progress');

  const filteredDeals = baseDeals.filter(deal => {
    if (filter === 'all') return true;
    if (filter === 'attention') return pendingActions.some(p => p.id === deal.id);
    const status = deriveDealStatus(deal);
    if (filter === 'completed') return status === 'completed' || isResolved(status);
    return status === filter;

  });

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
    setActionError(prev => {
      const next = { ...prev };
      delete next[deal.id];
      return next;
    });
    try {
      if (action === 'release') {
        await client.completeTask(deal.id, taskIndex, true);
      } else if (action === 'dispute') {
        await client.completeTask(deal.id, taskIndex, false);
      }
      window.dispatchEvent(new Event('blinkflow:deals-changed'));
    } catch (err: any) {
      console.error(err);
      setActionError(prev => ({ ...prev, [deal.id]: err.message || 'Action failed' }));
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
            <span className="text-xs font-normal bg-orange-500/10 text-orange-400 px-2 py-1 rounded border border-orange-500/20">Demo data</span>
          </h2>
          <p className="text-gray-400 text-sm mt-1">Manage your escrow agreements and release payments securely.</p>
        </div>
        <Button variant="gradient" onClick={() => setIsModalOpen(true)} className="px-5">
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
            onClick={() => setFilter(filter === 'attention' ? 'all' : 'attention')}
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

      {/* Pending Actions */}
      {role === 'customer' && pendingActions.length > 0 && (
        <div className="space-y-4">
          <h3 className="text-lg font-medium flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-orange-500 animate-pulse shadow-[0_0_8px_rgba(249,115,22,0.6)]"></div>
            Awaiting Your Action
            <span className="text-xs font-normal bg-orange-500/10 text-orange-400 px-2 py-1 rounded border border-orange-500/20 ml-2">Demo data</span>
          </h3>
          <div className="grid grid-cols-1 gap-3">
            {pendingActions.map(deal => (
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
                    {deal.tasks[0]?.meta.title}
                    {deal.tasks.length > 1 && ` +${deal.tasks.length - 1}`}
                  </div>
                  <div className="text-sm text-gray-400 mt-1">
                    {deriveDealStatus(deal) === 'pending_approval' ? 'Contractor submitted work for review.' : 'Waiting to assign a contractor.'}
                  </div>
                  {!hasEnoughSol && role === 'customer' && deriveDealStatus(deal) === 'pending_approval' && (
                    <div className="mt-1 text-xs text-orange-400 font-medium">
                      You need ~0.01 SOL to cover network fees.
                    </div>
                  )}
                  {actionError[deal.id] && (
                    <div className="mt-1 text-xs text-red-400 font-medium">
                      {actionError[deal.id]}
                    </div>
                  )}
                </div>
                <div className="flex flex-col sm:flex-row flex-wrap gap-2 w-full md:w-auto md:justify-end">
                  {deriveDealStatus(deal) === 'pending_approval' ? (
                    <>
                      <Button variant="danger" className="w-full sm:flex-none" onClick={(e) => handlePendingAction(e, deal, 'dispute')} disabled={actionLoading === deal.id || !hasEnoughSol}>Open Dispute</Button>
                      <Button variant="primary" className="w-full sm:flex-none bg-orange-500 hover:bg-orange-600 text-white" onClick={(e) => handlePendingAction(e, deal, 'release')} disabled={actionLoading === deal.id || !hasEnoughSol}>
                         {actionLoading === deal.id ? <Loader2 className="w-4 h-4 mr-2 animate-spin inline" /> : null}
                         Release Payment ${dealTotal(deal)}
                      </Button>
                    </>
                  ) : (
                    <Button variant="outline" className="w-full sm:w-auto border-orange-500/30 text-orange-400 hover:bg-orange-500/10" onClick={(e) => handlePendingAction(e, deal, 'assign')}>Assign Contractor</Button>
                  )}
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Deal List */}
      <Card className="overflow-hidden border-gray-800/60 shadow-lg">
        <div className="p-4 border-b border-gray-800/60 flex flex-col sm:flex-row items-start sm:items-center justify-between bg-gray-900/60 gap-4">
          <h3 className="font-medium text-lg flex items-center gap-2">
            All Deals
            <span className="text-xs font-normal bg-orange-500/10 text-orange-400 px-2 py-1 rounded border border-orange-500/20">Demo data</span>
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
        <div className="px-4 py-3 bg-gray-900/40 border-b border-gray-800/60 flex gap-2 overflow-x-auto hide-scrollbar">
            {['all', 'in_progress', 'pending_approval', 'dispute', 'completed'].map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors ${
                  filter === f 
                    ? 'bg-gray-700 text-white' 
                    : 'bg-gray-800/30 text-gray-400 hover:text-gray-200 hover:bg-gray-800'
                }`}
              >
                {f === 'all' ? 'All' : f === 'in_progress' ? 'In progress' : f === 'pending_approval' ? 'Pending approval' : f === 'dispute' ? 'Dispute' : 'Completed'}
              </button>
            ))}
        </div>
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
              <h3 className="text-lg font-medium text-gray-200">No deals found</h3>
              <p className="text-sm text-gray-400 mt-1 max-w-sm">You haven't created or participated in any deals yet. Create a new deal to get started.</p>
              <Button variant="outline" onClick={() => setIsModalOpen(true)} className="mt-4">
                <Plus className="w-4 h-4 mr-2" />
                Create First Deal
              </Button>
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
                        {deal.tasks[0]?.meta.title}
                        {deal.tasks.length > 1 && ` +${deal.tasks.length - 1}`}
                      </div>
                      <div className="text-[11px] text-gray-500 mt-0.5">
                        {deal.id} &middot; {deal.tasks.length} task{deal.tasks.length !== 1 ? 's' : ''} &middot; {deal.tasks.filter(t => t.status === 'Completed' || t.status === 'Resolved').length} done
                      </div>
                    </div>
                    <Badge status={deriveDealStatus(deal)} className="shrink-0">{getStatusLabel(deriveDealStatus(deal))}</Badge>
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
                        {deal.tasks[0]?.meta.title}
                        {deal.tasks.length > 1 && ` +${deal.tasks.length - 1}`}
                      </div>
                      <div className="text-[11px] text-gray-500 mt-0.5">
                        {deal.id} &middot; {deal.tasks.length} task{deal.tasks.length !== 1 ? 's' : ''} &middot; {deal.tasks.filter(t => t.status === 'Completed' || t.status === 'Resolved').length} done
                      </div>
                    </td>
                    <td className="px-5 py-4 font-mono text-xs text-gray-400">
                      {role === 'contractor' ? (deal.customer ? truncateAddress(deal.customer) : <span className="text-gray-600 italic">Unassigned</span>) : (deal.contractor ? truncateAddress(deal.contractor) : <span className="text-gray-600 italic">Unassigned</span>)}
                    </td>
                    <td className="px-5 py-4 font-semibold text-gray-200">${dealTotal(deal).toLocaleString()}</td>
                    <td className="px-5 py-4">
                      <Badge status={deriveDealStatus(deal)}>{getStatusLabel(deriveDealStatus(deal))}</Badge>
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

      {isModalOpen && <CreateDealModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} />}
    </div>
  );
};
