import { useParams, Link } from 'react-router-dom';
import { mockDeals } from '../mockData';
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
import type { Deal } from '../mockData';
import { Blink, useBlink } from '@dialectlabs/blinks';
import { useBlinkSolanaWalletAdapter } from '@dialectlabs/blinks/hooks/solana';
import '@dialectlabs/blinks/index.css';
import { useConnection } from '@solana/wallet-adapter-react';

const BlinkPreview = ({ id }: { id: string }) => {
  const { connection } = useConnection();
  const { adapter } = useBlinkSolanaWalletAdapter(connection);
  
  const BLINK_SERVER_URL = import.meta.env.VITE_ACTIONS_API_URL || 'http://localhost:3001';
  // Use solana-action: prefix to force direct API resolution without interstitial fallback
  const actionUrl = `solana-action:${BLINK_SERVER_URL}/api/deal/${id}`;
  
  const { blink, isLoading } = useBlink({ url: actionUrl });

  if (isLoading) return <div className="text-gray-400 text-sm p-4 text-center border border-gray-800 rounded-xl">Loading Blink preview...</div>;
  if (!blink) return <div className="text-red-400 text-sm p-4 text-center border border-red-500/20 bg-red-500/10 rounded-xl">Failed to load Blink preview</div>;

  return (
    <div className="w-full overflow-hidden rounded-xl">
      <Blink blink={blink} adapter={adapter} securityLevel="all" />
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
    const timer = setTimeout(() => {
      try {
        const foundDeal = mockDeals.find(d => d.id === id);
        if (!foundDeal) throw new Error("Deal not found");
        setDeal(foundDeal);
      } catch (err: any) {
        setError(err.message || "Failed to load deal");
      } finally {
        setLoading(false);
      }
    }, 800);
    return () => clearTimeout(timer);
  }, [id]);

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
            <h2 className="text-xl sm:text-2xl font-bold break-words">{deal.title}</h2>
            <Badge status={deal.status}>{getStatusLabel(deal.status)}</Badge>
          </div>
          <p className="text-gray-400 text-sm font-mono">{deal.id}</p>
        </div>
        <div className="text-left md:text-right mt-2 md:mt-0 flex flex-col items-start md:items-end gap-3">
          <div className="text-2xl sm:text-3xl font-bold text-white">${deal.amount.toLocaleString()} <span className="text-base sm:text-lg text-gray-500 font-medium">{symbol}</span></div>
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
              rawActionUrl={`${import.meta.env.VITE_ACTIONS_API_URL || 'http://localhost:3001'}/deal/${deal.id}`}
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
              {deal.successCriteria}
            </div>
          </Card>

          {/* Action Panel based on role and status */}
          <Card className="p-6 border-purple-500/20 bg-purple-500/5">
            <h3 className="text-lg font-medium mb-4">Action Panel</h3>
            {role === 'contractor' && deal.status === 'in_progress' && (
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
                  Submit Work
                </Button>
              </div>
            )}
            
            {role === 'customer' && deal.status === 'pending_approval' && (
              <div className="space-y-4">
                <div className="p-4 bg-gray-900 rounded-lg border border-gray-800">
                  <p className="text-sm font-medium mb-1">Contractor's Submission:</p>
                  <a href="#" className="text-sm text-blue-400 hover:underline">https://github.com/blinkflow/pr-12</a>
                </div>
                {renderSolWarning()}
                <div className="flex gap-3">
                  <Button 
                    variant="primary" 
                    className={`bg-green-600 hover:bg-green-500 ${!hasEnoughSol ? 'opacity-50 cursor-not-allowed' : ''}`}
                    disabled={!hasEnoughSol}
                  >
                    Approve & Release Payment
                  </Button>
                  <Button 
                    variant="danger"
                    className={!hasEnoughSol ? 'opacity-50 cursor-not-allowed' : ''}
                    disabled={!hasEnoughSol}
                  >
                    Open Dispute
                  </Button>
                </div>
              </div>
            )}

            {(deal.status === 'completed' || deal.status === 'cancelled') && (
              <p className="text-gray-400 text-sm bg-gray-900/50 p-3 rounded-lg border border-gray-800">This deal is closed. No further actions can be taken.</p>
            )}
            
            {deal.status === 'searching' && role === 'customer' && (
              <p className="text-gray-400 text-sm bg-gray-900/50 p-3 rounded-lg border border-gray-800">Waiting for a contractor to accept the Blink.</p>
            )}
            
            {deal.status === 'searching' && role === 'contractor' && (
              <div>
                {renderSolWarning()}
                <Button 
                  variant="gradient"
                  className={!hasEnoughSol ? 'opacity-50 cursor-not-allowed' : ''}
                  disabled={!hasEnoughSol}
                >
                  Accept Deal
                </Button>
              </div>
            )}
            
            {deal.status === 'dispute' && (
              <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-lg">
                <p className="text-sm text-red-400 font-medium">This deal is currently under dispute resolution.</p>
                <p className="text-xs text-red-400/80 mt-1">An arbitrator will review the case and make a decision.</p>
              </div>
            )}
          </Card>
        </div>

        <div className="space-y-6">
          <Card className="p-6 border-purple-500/20 bg-purple-500/5">
            <h3 className="font-medium mb-4 text-purple-400 flex items-center gap-2">
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path></svg>
              Live Blink Preview
            </h3>
            <p className="text-xs text-purple-300/70 mb-4 leading-relaxed">This is exactly how your deal appears on X (Twitter) or Telegram using Dialect's rendering SDK.</p>
            <BlinkPreview id={deal.id} />
          </Card>

          <Card className="p-6">
            <h3 className="font-medium mb-4">Deal Details</h3>
            <div className="space-y-4 text-sm">
              <div>
                <div className="text-gray-500 mb-1">Customer</div>
                <div className="font-mono text-gray-300">{truncateAddress(deal.customer)}</div>
              </div>
              <div>
                <div className="text-gray-500 mb-1">Contractor</div>
                <div className="font-mono text-gray-300">{deal.contractor ? truncateAddress(deal.contractor) : 'Not assigned yet'}</div>
              </div>
              <div>
                <div className="text-gray-500 mb-1">Deadline</div>
                <div className="text-gray-300">{deal.deadline}</div>
              </div>
            </div>
          </Card>

          {deal.history && (
            <Card className="p-6">
              <h3 className="font-medium mb-4 flex items-center gap-2">
                <History className="w-4 h-4 text-gray-400" />
                History Log
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
