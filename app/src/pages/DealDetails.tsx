import { useParams, Link, useLocation } from 'react-router-dom';
import { client } from '../lib/client';
import { dealTotal, deriveDealStatus, getEarliestDeadline, taskStatusLabel, taskStatusKind } from '../lib/dealStatus';
import { Card } from '../components/Card';
import { Badge, getStatusLabel } from '../components/Badge';
import { Button } from '../components/Button';
import { useRole } from '../RoleContext';
import { ArrowLeft, CheckCircle2, History, Loader2, Share2, X } from 'lucide-react';
import { useState, useEffect } from 'react';
import { ShareDealPanel } from '../components/ShareDealPanel';
import { useToken } from '../lib/constants';
import { truncateAddress } from '../lib/utils';
import { useSolBalance } from '../hooks/useSolBalance';
import { useNetwork } from '../NetworkContext';
import type { Deal, Task } from '../lib/types';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { useWalletModal } from '@solana/wallet-adapter-react-ui';
import { Transaction } from '@solana/web3.js';

const EscrowActionCard = ({ id }: { id: string }) => {
  const { connection } = useConnection();
  const { publicKey, sendTransaction } = useWallet();
  const { isTestMode } = useNetwork();
  const [data, setData] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isExecuting, setIsExecuting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const BLINK_SERVER_URL = import.meta.env.VITE_ACTIONS_API_URL || 'http://localhost:3001';

  useEffect(() => {
    fetch(`${BLINK_SERVER_URL}/api/deal/${id}`)
      .then(res => {
        if (!res.ok) throw new Error("Failed to fetch action");
        return res.json();
      })
      .then(json => {
        setData(json);
        setIsLoading(false);
      })
      .catch(err => {
        console.error(err);
        setError("Failed to load action preview");
        setIsLoading(false);
      });
  }, [id, BLINK_SERVER_URL]);

  const handleAction = async (href: string) => {
    if (!publicKey) {
      setError("Please connect your wallet first");
      return;
    }
    
    setIsExecuting(true);
    setError(null);
    setSuccess(null);

    try {
      const res = await fetch(`${BLINK_SERVER_URL}${href}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ account: publicKey.toBase58() })
      });
      
      if (!res.ok) {
         const errData = await res.json().catch(() => ({}));
         throw new Error(errData.error || "Failed to fetch transaction");
      }
      const { transaction, message } = await res.json();

      const binaryString = atob(transaction);
      const txBuf = Uint8Array.from(binaryString, c => c.charCodeAt(0));
      const tx = Transaction.from(txBuf);

      const signature = await sendTransaction(tx, connection);

      const latestBlockhash = await connection.getLatestBlockhash('finalized');
      await connection.confirmTransaction({
        signature,
        blockhash: latestBlockhash.blockhash,
        lastValidBlockHeight: latestBlockhash.lastValidBlockHeight
      }, 'finalized');

      setSuccess(message || "Transaction successful!");
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Transaction failed");
    } finally {
      setIsExecuting(false);
    }
  };

  if (isLoading) return <div className="text-gray-400 text-sm p-4 text-center border border-gray-800 rounded-xl flex items-center justify-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Loading action preview...</div>;
  if (!data || (error && !data)) return <div className="text-red-400 text-sm p-4 text-center border border-red-500/20 bg-red-500/10 rounded-xl">{error || "Failed to load action preview"}</div>;

  return (
    <div className="w-full overflow-hidden rounded-xl bg-gray-900 border border-gray-800 flex flex-col">
      {data.icon && <img src={data.icon} alt={data.title} className="w-full h-48 object-cover border-b border-gray-800" />}
      <div className="p-5 space-y-4">
        <div>
          <h4 className="font-bold text-lg text-white mb-1">{data.title}</h4>
          <p className="text-sm text-gray-400 leading-relaxed">{data.description}</p>
        </div>
        
        {error && <div className="text-red-400 text-xs p-3 bg-red-500/10 border border-red-500/20 rounded-lg break-words">{error}</div>}
        {success && <div className="text-green-400 text-xs p-3 bg-green-500/10 border border-green-500/20 rounded-lg break-words">{success}</div>}

        <div className="flex flex-col gap-2 pt-2">
          {data.links?.actions?.map((action: any, i: number) => (
            <Button 
              key={i} 
              variant="primary" 
              className="w-full py-2.5" 
              onClick={() => handleAction(action.href)}
              disabled={isExecuting}
            >
              {isExecuting ? <Loader2 className="w-4 h-4 animate-spin mr-2 inline" /> : null}
              {action.label} ({isTestMode ? 'Devnet' : 'Live'})
            </Button>
          ))}
          {(!data.links || !data.links.actions || data.links.actions.length === 0) && (
            <Button 
              variant="primary" 
              className="w-full py-2.5" 
              disabled={true}
            >
              {data.label}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
};

export const DealDetails = () => {
  const { id } = useParams();
  const { role } = useRole();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deal, setDeal] = useState<Deal | null>(null);
  const [taskSubmissions, setTaskSubmissions] = useState<Record<number, string>>({});
  const [taskActionLoading, setTaskActionLoading] = useState<Record<number, boolean>>({});
  const [taskErrors, setTaskErrors] = useState<Record<number, string>>({});
  const [globalError, setGlobalError] = useState<string | null>(null);
  const [globalLoading, setGlobalLoading] = useState(false);
  // TEMP: virtual deals go away in stage B.
  const [virtualStatusLabel, setVirtualStatusLabel] = useState<string | null>(null);
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);
  const [expandedTasks, setExpandedTasks] = useState<number[]>([]);

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
  const { setVisible } = useWalletModal();
  const { isTestMode } = useNetwork();
  const { solBalance } = useSolBalance();
  const { symbol } = useToken();
  const MIN_SOL_REQUIRED = 0.01;
  const hasEnoughSol = solBalance !== null && solBalance >= MIN_SOL_REQUIRED;

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

  useEffect(() => {
    const loadDeal = async () => {
      try {
        const foundDeal = await client.getDeal(id || '');
        if (foundDeal) {
          setDeal(foundDeal);
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

  if (loading) return <div className="p-12 flex justify-center"><Loader2 className="w-8 h-8 animate-spin text-purple-500" /></div>;
  if (error) return <div className="p-8 text-center text-red-400">{error}</div>;
  if (!deal) return <div className="p-8 text-center text-gray-400">Deal not found</div>;

  // deleted handleSubmitWork

  const handleTaskAction = async (taskIndex: number, action: () => Promise<any>) => {
    setTaskErrors(prev => ({...prev, [taskIndex]: ''}));
    setTaskActionLoading(prev => ({...prev, [taskIndex]: true}));
    try {
      await action();
    } catch (err: any) {
      setTaskErrors(prev => ({...prev, [taskIndex]: err.message || 'Action failed'}));
    } finally {
      setTaskActionLoading(prev => ({...prev, [taskIndex]: false}));
    }
  };

  const handleGlobalAction = async (action: () => Promise<any>) => {
    setGlobalError(null);
    setGlobalLoading(true);
    try {
      await action();
    } catch (err: any) {
      setGlobalError(err.message || 'Action failed');
    } finally {
      setGlobalLoading(false);
    }
  };

  const renderTaskActions = (task: Task, index: number) => {
    if (isVirtualDeal) return null;

    if ((role === 'contractor' && !deal.contractor) || (role === 'customer' && !deal.customer)) {
      return <p className="text-gray-500 text-sm italic mt-4 pt-4 border-t border-gray-800/50">Accept the deal to continue</p>;
    }
    
    const loading = taskActionLoading[index];
    const err = taskErrors[index];
    const submissionText = taskSubmissions[index] || '';
    
    if (task.status === 'Completed' || task.status === 'Resolved' || task.status === 'Cancelled') {
      return <p className="text-gray-500 text-sm italic mt-4 pt-4 border-t border-gray-800/50">Task is closed.</p>;
    }
    
    if (task.status === 'Disputed') {
      return (
        <div className="mt-4 pt-4 border-t border-gray-800/50 space-y-3">
          <p className="text-yellow-500/80 text-sm">Awaiting arbiter decision.</p>
          {isTestMode && (
             <div className="p-3 bg-yellow-500/10 border border-yellow-500/20 rounded-lg">
               <p className="text-xs text-yellow-500 mb-2 font-medium">Demo: arbiter decision {/* TEMP: real arbiter UI is a separate page */}</p>
               <div className="flex flex-col sm:flex-row gap-2">
                 <Button variant="outline" onClick={() => handleTaskAction(index, () => client.resolveDispute(deal.id, index, true))} disabled={loading}>Customer wins</Button>
                 <Button variant="outline" onClick={() => handleTaskAction(index, () => client.resolveDispute(deal.id, index, false))} disabled={loading}>Contractor wins</Button>
               </div>
             </div>
          )}
          {err && <p className="text-red-400 text-xs">{err}</p>}
        </div>
      );
    }

    if (role === 'customer') {
      if (!deal.contractor) {
        return <p className="text-gray-500 text-sm italic mt-4 pt-4 border-t border-gray-800/50">Waiting for a contractor to accept this deal</p>;
      }
      
      if (!task.deposited && (task.status === 'CustomerCreated' || task.status === 'ContractorCreated')) {
        return (
          <div className="mt-4 pt-4 border-t border-gray-800/50 space-y-3">
            <p className="text-sm text-gray-400">Fund this task in escrow to allow the contractor to start.</p>
            {renderSolWarning()}
            {!connected ? (
              <Button onClick={() => setVisible(true)}>Connect Wallet to Deposit</Button>
            ) : (
              <Button onClick={() => handleTaskAction(index, () => client.depositTask(deal.id, index, publicKey!.toBase58()))} disabled={loading || !hasEnoughSol} className={!hasEnoughSol ? 'opacity-50' : ''}>
                {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin inline" /> : null}
                Deposit ({isTestMode ? 'Devnet' : 'Live'})
              </Button>
            )}
            {err && <p className="text-red-400 text-xs">{err}</p>}
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
            {renderSolWarning()}
            <div className="flex flex-col sm:flex-row gap-2 items-center">
               {!connected ? (
                 <Button onClick={() => setVisible(true)}>Connect Wallet to Act</Button>
               ) : (
                 <>
                   <Button variant="primary" className="bg-green-600 hover:bg-green-500" onClick={() => handleTaskAction(index, () => client.completeTask(deal.id, index, true))} disabled={loading || !hasEnoughSol} >
                      {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin inline" /> : null}
                      Approve & Release ({isTestMode ? 'Devnet' : 'Live'})
                   </Button>
                   <Button variant="danger" onClick={() => handleTaskAction(index, () => client.completeTask(deal.id, index, false))} disabled={loading || !hasEnoughSol} >
                      Open Dispute ({isTestMode ? 'Devnet' : 'Live'})
                   </Button>
                   {/* ASSUMPTION: confirm with the contract author */}
                 </>
               )}
            </div>
            {err && <p className="text-red-400 text-xs">{err}</p>}
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
            {renderSolWarning()}
            <div className="flex">
              {!connected ? (
                 <Button variant="outline" onClick={() => setVisible(true)}>Connect Wallet to Cancel</Button>
              ) : (
                <Button variant="outline" onClick={() => handleTaskAction(index, () => client.cancelTask(deal.id, index))} disabled={loading || !hasEnoughSol}>
                  Cancel Task ({isTestMode ? 'Devnet' : 'Live'})
                </Button>
              )}
            </div>
            {err && <p className="text-red-400 text-xs">{err}</p>}
          </div>
        );
      }
      
      if (task.status === 'Started') {
         return (
          <div className="mt-4 pt-4 border-t border-gray-800/50 space-y-3">
            <textarea 
              rows={2} 
              value={submissionText}
              onChange={(e) => setTaskSubmissions(prev => ({...prev, [index]: e.target.value}))}
              placeholder="Link to deliverable (e.g. GitHub PR, Figma link)..." 
              className="w-full bg-gray-950 border border-gray-800 rounded-lg p-3 text-sm focus:outline-none focus:border-purple-500/50"
              disabled={loading}
            />
            {renderSolWarning()}
            <div className="flex flex-col sm:flex-row gap-2">
              {!connected ? (
                 <Button onClick={() => setVisible(true)}>Connect Wallet to Submit</Button>
              ) : (
                <Button variant="primary" onClick={() => handleTaskAction(index, () => client.finishTask(deal.id, index, submissionText))} disabled={loading || !submissionText.trim() || !hasEnoughSol}>
                  {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin inline" /> : null}
                  Submit Work ({isTestMode ? 'Devnet' : 'Live'})
                </Button>
              )}
              {!connected ? null : (
                <Button variant="outline" onClick={() => handleTaskAction(index, () => client.cancelTask(deal.id, index))} disabled={loading || !hasEnoughSol}>
                  Cancel Task ({isTestMode ? 'Devnet' : 'Live'})
                </Button>
              )}
            </div>
            {err && <p className="text-red-400 text-xs">{err}</p>}
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
              <Badge status={deriveDealStatus(deal)}>{getStatusLabel(deriveDealStatus(deal))}</Badge>
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
          <Button variant="outline" className="border-gray-800 hover:bg-gray-800/50 flex items-center justify-center text-sm py-1.5" onClick={() => setIsShareModalOpen(true)}>
            <Share2 className="w-4 h-4 mr-2" /> Share Deal
          </Button>
        </div>
      </div>

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
                // TEMP: virtual deals go away in stage B.
                status: isVirtualDeal && virtualStatusLabel ? virtualStatusLabel : getStatusLabel(deriveDealStatus(deal)),
                ...(deal.customer && { customerWallet: deal.customer }),
                ...(deal.contractor && { contractorWallet: deal.contractor })
              }).toString()}`}
              dealId={deal.id}
              onCopy={(url) => { 
                navigator.clipboard.writeText(url); 
                // Using alert just like in CreateDealModal for simplicity, though a toast would be better.
                // It works for the Instagram fallback too.
              }}
              customClass="mt-2"
            />
          </Card>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          {!isVirtualDeal && ((role === 'contractor' && !deal.contractor) || (role === 'customer' && !deal.customer)) && (
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
                    <Button variant="gradient" onClick={() => handleGlobalAction(() => client.acceptDeal(deal.id, publicKey!.toBase58()))} disabled={globalLoading}>
                      {globalLoading ? <Loader2 className="w-4 h-4 mr-2 animate-spin inline" /> : null}
                      Accept Deal ({isTestMode ? 'Devnet' : 'Live'})
                    </Button>
                  )}
                </div>
              </div>
              {globalError && <p className="text-red-400 text-xs mt-2">{globalError}</p>}
            </Card>
          )}
          <Card className="p-6">
            <h3 className="text-lg font-medium mb-4 flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-purple-400" />
              Tasks
            </h3>
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
                          <Badge status={taskStatusKind(task)}>{taskStatusLabel(task)}</Badge>
                          <span className="text-gray-500 text-xs w-24 text-right truncate" title={task.deadline}>{task.deadline === 'TBD' ? 'TBD' : task.deadline}</span>
                        </div>
                      </button>
                      {isExpanded && (
                        <div className="p-4 pt-0 border-t border-gray-800/50 mt-2 text-gray-300 leading-relaxed text-sm bg-gray-950/50">
                          <div className="mt-4">
                            <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Success Criteria</h4>
                            <p className="whitespace-pre-wrap">{task.meta.successCriteria}</p>
                          </div>
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


        </div>

        <div className="space-y-6">
          <Card className="p-6 border-purple-500/20 bg-purple-500/5">
            <h3 className="font-medium mb-4 text-purple-400 flex items-center gap-2">
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path></svg>
              Live Deal Preview
            </h3>
            <EscrowActionCard id={deal.id} />
          </Card>

          <Card className="p-6">
            <h3 className="font-medium mb-4 flex items-center gap-2">
              Deal Details
              <span className="text-xs font-normal bg-orange-500/10 text-orange-400 px-2 py-1 rounded border border-orange-500/20">Demo data</span>
            </h3>
            <div className="space-y-4 text-sm">
              <div>
                <div className="text-gray-500 mb-1">Customer</div>
                <div className="font-mono text-gray-300">{deal.customer ? truncateAddress(deal.customer) : 'Not assigned yet'}</div>
              </div>
              <div>
                <div className="text-gray-500 mb-1">Contractor</div>
                <div className="font-mono text-gray-300">{deal.contractor ? truncateAddress(deal.contractor) : 'Not assigned yet'}</div>
              </div>
              <div>
                <div className="text-gray-500 mb-1">Deadline</div>
                <div className="text-gray-300">{deal.tasks[0]?.deadline /* TODO stage B */}</div>
              </div>
            </div>
          </Card>

          {!isVirtualDeal && deal.history && deal.history.length > 0 && (
            <Card className="p-6">
              <h3 className="font-medium mb-4 flex items-center gap-2">
                <History className="w-4 h-4 text-gray-400" />
                History Log
                <span className="text-xs font-normal bg-orange-500/10 text-orange-400 px-2 py-1 rounded border border-orange-500/20 ml-2">Demo data</span>
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
      </div>
    </div>
  );
};
