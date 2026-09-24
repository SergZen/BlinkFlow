import { useParams, Link } from 'react-router-dom';
import { mockDeals } from '../mockData';
import { Card } from '../components/Card';
import { Badge, getStatusLabel } from '../components/Badge';
import { Button } from '../components/Button';
import { useRole } from '../RoleContext';
import { ArrowLeft, CheckCircle2, History, Loader2 } from 'lucide-react';
import { useState, useEffect } from 'react';
import { TOKEN_SYMBOL } from '../lib/constants';
import { truncateAddress } from '../lib/utils';
import { Deal } from '../mockData';

export const DealDetails = () => {
  const { id } = useParams();
  const { role } = useRole();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deal, setDeal] = useState<Deal | null>(null);
  const [submission, setSubmission] = useState('');
  const [actionLoading, setActionLoading] = useState(false);

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
          <div className="flex items-center gap-3 mb-2">
            <h2 className="text-2xl font-bold">{deal.title}</h2>
            <Badge status={deal.status}>{getStatusLabel(deal.status)}</Badge>
          </div>
          <p className="text-gray-400 text-sm font-mono">{deal.id}</p>
        </div>
        <div className="text-right">
          <div className="text-3xl font-bold text-white">${deal.amount.toLocaleString()} <span className="text-lg text-gray-500 font-medium">{TOKEN_SYMBOL}</span></div>
        </div>
      </div>

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
            {role === 'freelancer' && deal.status === 'in_progress' && (
              <div className="space-y-4">
                <p className="text-sm text-gray-400">Submit your work for review. The client will be notified to release funds.</p>
                <textarea 
                  rows={3} 
                  maxLength={500}
                  value={submission}
                  onChange={(e) => setSubmission(e.target.value)}
                  placeholder="Link to deliverable (e.g. GitHub PR, Figma link)..." 
                  className="w-full bg-gray-950 border border-gray-800 rounded-lg p-3 text-sm focus:outline-none focus:border-purple-500/50"
                  disabled={actionLoading}
                ></textarea>
                <Button variant="primary" onClick={handleSubmitWork} disabled={actionLoading || !submission.trim()}>
                  {actionLoading ? <Loader2 className="w-4 h-4 animate-spin mr-2 inline" /> : null}
                  Submit Work
                </Button>
              </div>
            )}
            
            {role === 'client' && deal.status === 'pending_approval' && (
              <div className="space-y-4">
                <div className="p-4 bg-gray-900 rounded-lg border border-gray-800">
                  <p className="text-sm font-medium mb-1">Freelancer's Submission:</p>
                  <a href="#" className="text-sm text-blue-400 hover:underline">https://github.com/blinkflow/pr-12</a>
                </div>
                <div className="flex gap-3">
                  <Button variant="primary" className="bg-green-600 hover:bg-green-500">Approve & Release Payment</Button>
                  <Button variant="danger">Open Dispute</Button>
                </div>
              </div>
            )}

            {(deal.status === 'completed' || deal.status === 'cancelled') && (
              <p className="text-gray-400 text-sm bg-gray-900/50 p-3 rounded-lg border border-gray-800">This deal is closed. No further actions can be taken.</p>
            )}
            
            {deal.status === 'searching' && role === 'client' && (
              <p className="text-gray-400 text-sm bg-gray-900/50 p-3 rounded-lg border border-gray-800">Waiting for a freelancer to accept the Blink.</p>
            )}
            
            {deal.status === 'searching' && role === 'freelancer' && (
              <Button variant="gradient">Accept Deal</Button>
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
          <Card className="p-6">
            <h3 className="font-medium mb-4">Deal Details</h3>
            <div className="space-y-4 text-sm">
              <div>
                <div className="text-gray-500 mb-1">Client</div>
                <div className="font-mono text-gray-300">{truncateAddress(deal.client)}</div>
              </div>
              <div>
                <div className="text-gray-500 mb-1">Freelancer</div>
                <div className="font-mono text-gray-300">{deal.freelancer ? truncateAddress(deal.freelancer) : 'Not assigned yet'}</div>
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
