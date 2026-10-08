import { useRole } from '../RoleContext';
import { Card } from '../components/Card';
import { Badge, getStatusLabel } from '../components/Badge';
import { Button } from '../components/Button';
import { client } from '../lib/client';
import { dealTotal, deriveDealStatus } from '../lib/dealStatus';
import { Plus, ArrowRight, DollarSign, Briefcase, Clock, Search, Loader2, Inbox } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { CreateDealModal } from '../components/CreateDealModal';
import { truncateAddress } from '../lib/utils';
import type { Deal } from '../lib/types';
import { useToken } from '../lib/constants';
import { useNetwork } from '../NetworkContext';

export const Dashboard = () => {
  const { role } = useRole();
  const { isTestMode } = useNetwork();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deals, setDeals] = useState<Deal[]>([]);
  const [filter, setFilter] = useState<string>('all');

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
  }, []);

  const activeDeals = deals.filter(d => deriveDealStatus(d) !== 'completed' && deriveDealStatus(d) !== 'cancelled');
  
  const pendingActions = role === 'customer' 
    ? activeDeals.filter(d => deriveDealStatus(d) === 'pending_approval' || deriveDealStatus(d) === 'searching')
    : activeDeals.filter(d => deriveDealStatus(d) === 'in_progress');

  const filteredDeals = deals.filter(deal => {
    if (filter === 'all') return true;
    if (filter === 'attention') return pendingActions.some(p => p.id === deal.id);
    return deriveDealStatus(deal) === filter;
  });

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
              ${activeDeals.reduce((acc, deal) => acc + dealTotal(deal), 0).toLocaleString()}
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
              <Card key={deal.id} className="p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between border-orange-500/20 bg-orange-500/5 gap-4">
                <div>
                  <div className="font-semibold text-gray-200">{deal.tasks[0]?.meta.title /* TODO stage B */}</div>
                  <div className="text-sm text-gray-400 mt-1">
                    {deriveDealStatus(deal) === 'pending_approval' ? 'Contractor submitted work for review.' : 'Waiting to assign a contractor.'}
                  </div>
                </div>
                <div className="flex flex-col sm:flex-row flex-wrap gap-2 w-full md:w-auto md:justify-end">
                  {deriveDealStatus(deal) === 'pending_approval' ? (
                    <>
                      <Button variant="danger" className="w-full sm:flex-none">Open Dispute ({isTestMode ? 'Devnet' : 'Live'})</Button>
                      <Button variant="primary" className="w-full sm:flex-none bg-orange-500 hover:bg-orange-600 text-white">Release Payment ${dealTotal(deal) /* TODO stage B */} ({isTestMode ? 'Devnet' : 'Live'})</Button>
                    </>
                  ) : (
                    <Button variant="outline" className="w-full sm:w-auto border-orange-500/30 text-orange-400 hover:bg-orange-500/10">Assign Contractor</Button>
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
          <div className="relative w-full sm:w-auto">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
            <input 
              type="text" 
              placeholder="Search deals..." 
              className="w-full sm:w-64 bg-gray-950 border border-gray-800 rounded-lg pl-9 pr-4 py-2 text-sm focus:outline-none focus:border-purple-500/50 focus:ring-1 focus:ring-purple-500/50 transition-all text-gray-200 placeholder:text-gray-600"
            />
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
                <div key={deal.id} className="bg-gray-900/40 border border-gray-800/60 rounded-lg p-4 space-y-3">
                  <div className="flex justify-between items-start gap-2">
                    <div className="min-w-0">
                      <div className="font-medium text-gray-200 truncate">{deal.tasks[0]?.meta.title /* TODO stage B */}</div>
                      <div className="text-[11px] text-gray-500 mt-0.5">{deal.id}</div>
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
                    <span className="font-semibold text-gray-200">${dealTotal(deal) /* TODO stage B */.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-gray-500">Deadline:</span>
                    <span className="text-gray-400 text-xs">{deal.tasks[0]?.deadline /* TODO stage B */}</span>
                  </div>
                  <div className="pt-2">
                    <Link to={`/deal/${deal.id}`} className="flex items-center justify-center w-full gap-1.5 text-gray-300 hover:text-white font-medium transition-colors bg-gray-800/50 hover:bg-gray-700 px-3 py-2 rounded-md text-sm">
                      View Deal <ArrowRight className="w-4 h-4" />
                    </Link>
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
                  <th className="px-5 py-3 text-right font-semibold">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800/60 bg-gray-900/20">
                {filteredDeals.map((deal) => (
                  <tr key={deal.id} className="hover:bg-gray-800/40 transition-colors group">
                    <td className="px-5 py-4">
                      <div className="font-medium text-gray-200 group-hover:text-purple-400 transition-colors">{deal.tasks[0]?.meta.title /* TODO stage B */}</div>
                      <div className="text-[11px] text-gray-500 mt-0.5">{deal.id}</div>
                    </td>
                    <td className="px-5 py-4 font-mono text-xs text-gray-400">
                      {role === 'contractor' ? (deal.customer ? truncateAddress(deal.customer) : <span className="text-gray-600 italic">Unassigned</span>) : (deal.contractor ? truncateAddress(deal.contractor) : <span className="text-gray-600 italic">Unassigned</span>)}
                    </td>
                    <td className="px-5 py-4 font-semibold text-gray-200">${dealTotal(deal).toLocaleString() /* TODO stage B */}</td>
                    <td className="px-5 py-4">
                      <Badge status={deriveDealStatus(deal)}>{getStatusLabel(deriveDealStatus(deal))}</Badge>
                    </td>
                    <td className="px-5 py-4 text-gray-400 text-xs">{deal.tasks[0]?.deadline /* TODO stage B */}</td>
                    <td className="px-5 py-4 text-right">
                      <Link to={`/deal/${deal.id}`} className="inline-flex items-center gap-1.5 text-gray-400 hover:text-white font-medium transition-colors bg-gray-800/50 hover:bg-gray-700 px-3 py-1.5 rounded-md text-xs">
                        View <ArrowRight className="w-3.5 h-3.5" />
                      </Link>
                    </td>
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
