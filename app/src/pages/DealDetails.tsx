import { useParams, Link, useLocation } from 'react-router-dom';
import { client } from '../lib/client';
import { dealTotal, deriveDealStatus } from '../lib/dealStatus';
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
import type { Deal } from '../lib/types';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
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
  const [submission, setSubmission] = useState('');
  // TEMP: virtual deals go away in stage B.
  const [virtualStatusLabel, setVirtualStatusLabel] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);
  
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

  const handleSubmitWork = () => {
    if (!submission.trim()) {
      alert("Please provide a link or description of your work.");
      return;
    }
    setActionLoading(true);
    setTimeout(() => {
      setActionLoading(false);
      setSubmission('');
      // In a real app, this would refresh the deal state
      alert("Work submitted successfully!");
    }, 1000);
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <Link to="/" className="inline-flex items-center gap-2 text-sm text-gray-400 hover:text-white transition-colors">
        <ArrowLeft className="w-4 h-4" /> Back to Dashboard
      </Link>

      <div className="flex flex-col md:flex-row justify-between items-start gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-3 mb-2">
            <h2 className="text-xl sm:text-2xl font-bold break-words">{deal.tasks[0]?.meta.title /* TODO stage B */}</h2>
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
            <div className="text-2xl sm:text-3xl font-bold text-white">${dealTotal(deal) /* TODO stage B */.toLocaleString()} <span className="text-base sm:text-lg text-gray-500 font-medium">{symbol}</span></div>
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
                title: deal.tasks[0]?.meta.title /* TODO stage B */,
                amount: dealTotal(deal) /* TODO stage B */.toString(),
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
          <Card className="p-6">
            <h3 className="text-lg font-medium mb-4 flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-purple-400" />
              Success Criteria
            </h3>
            <div className="bg-gray-950 p-4 rounded-lg border border-gray-800 text-gray-300 leading-relaxed">
              {isVirtualDeal && !deal.tasks[0]?.meta.successCriteria ? (
                <span className="text-gray-500 italic">Details available once the counterparty opens this deal.</span>
              ) : (
                deal.tasks[0]?.meta.successCriteria /* TODO stage B */
              )}
            </div>
          </Card>

          {/* Action Panel based on role and status */}
          <Card className="p-6 border-purple-500/20 bg-purple-500/5">
            <h3 className="text-lg font-medium mb-4">Action Panel</h3>
            {isVirtualDeal ? (
              <p className="text-gray-500 italic text-sm">Actions available once the counterparty opens this deal.</p>
            ) : (
              <>
                {role === 'contractor' && deriveDealStatus(deal) === 'in_progress' && (
                  <div className="space-y-4">
                    <p className="text-sm text-gray-400">Submit your work for review. The customer will be notified to release funds.</p>
                    <textarea 
                      rows={3} 
                      maxLength={500}
                      value={submission}
                      onChange={(e) => setSubmission(e.target.value)}
                      placeholder="Link to deliverable (e.g. GitHub PR, Figma link)..." 
                      className="w-full bg-gray-950 border border-gray-800 rounded-lg p-3 text-sm focus:outline-none focus:border-purple-500/50"
                      disabled={actionLoading}
                    ></textarea>
                    {renderSolWarning()}
                    <Button 
                      variant="primary" 
                      onClick={handleSubmitWork} 
                      disabled={actionLoading || !submission.trim() || !hasEnoughSol}
                      className={!hasEnoughSol ? 'opacity-50 cursor-not-allowed' : ''}
                    >
                      {actionLoading ? <Loader2 className="w-4 h-4 animate-spin mr-2 inline" /> : null}
                      Submit Work ({isTestMode ? 'Devnet' : 'Live'})
                    </Button>
                  </div>
                )}
                
                {role === 'customer' && deriveDealStatus(deal) === 'pending_approval' && (
                  <div className="space-y-4">
                    <div className="p-4 bg-gray-900 rounded-lg border border-gray-800">
                      <p className="text-sm font-medium mb-1">Contractor's Submission:</p>
                      <a href="#" className="text-sm text-blue-400 hover:underline">https://github.com/blinkflow/pr-12</a>
                    </div>
                    {renderSolWarning()}
                    <div className="flex flex-col sm:flex-row gap-3">
                      <Button 
                        variant="primary" 
                        className={`bg-green-600 hover:bg-green-500 w-full sm:w-auto ${!hasEnoughSol ? 'opacity-50 cursor-not-allowed' : ''}`}
                        disabled={!hasEnoughSol}
                      >
                        Approve & Release ({isTestMode ? 'Devnet' : 'Live'})
                      </Button>
                      <Button 
                        variant="danger"
                        className={`w-full sm:w-auto ${!hasEnoughSol ? 'opacity-50 cursor-not-allowed' : ''}`}
                        disabled={!hasEnoughSol}
                      >
                        Open Dispute ({isTestMode ? 'Devnet' : 'Live'})
                      </Button>
                    </div>
                  </div>
                )}

                {(deriveDealStatus(deal) === 'completed' || deriveDealStatus(deal) === 'cancelled') && (
                  <p className="text-gray-400 text-sm bg-gray-900/50 p-3 rounded-lg border border-gray-800">This deal is closed. No further actions can be taken.</p>
                )}
                
                {deriveDealStatus(deal) === 'searching' && role === 'customer' && (
                  <p className="text-gray-400 text-sm bg-gray-900/50 p-3 rounded-lg border border-gray-800">Waiting for a contractor to accept the deal.</p>
                )}
                
                {deriveDealStatus(deal) === 'searching' && role === 'contractor' && (
                  <div>
                    {renderSolWarning()}
                    <Button 
                      variant="gradient"
                      className={!hasEnoughSol ? 'opacity-50 cursor-not-allowed' : ''}
                      disabled={!hasEnoughSol}
                    >
                      Accept Deal ({isTestMode ? 'Devnet' : 'Live'})
                    </Button>
                  </div>
                )}
                
                {deriveDealStatus(deal) === 'dispute' && (
                  <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-lg">
                    <p className="text-sm text-red-400 font-medium">This deal is currently under dispute resolution.</p>
                    <p className="text-xs text-red-400/80 mt-1">An arbitrator will review the case and make a decision.</p>
                  </div>
                )}
              </>
            )}
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
