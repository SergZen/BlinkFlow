import { Card } from '../components/Card';
import { ShieldAlert, Loader2, Inbox } from 'lucide-react';
import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { client } from '../lib/client';
import type { Deal, Task } from '../lib/types';

export interface Dispute {
  id: string;
  dealId: string;
  date: string;
  amount: string;
  ruling: string;
}

interface ResolvedEntry extends Dispute {
  timestamp: number;
}

export const DisputeLog = () => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [logs, setLogs] = useState<Dispute[]>([]);

  useEffect(() => {
    let mounted = true;

    const loadDeals = async () => {
      try {
        const deals: Deal[] = await client.listDeals();
        if (!mounted) return;

        const resolvedList: ResolvedEntry[] = [];

        for (const deal of deals) {
          if (!deal || !Array.isArray(deal.tasks)) continue;

          const resolvedHistory = (deal.history || []).filter(
            (h) => h && typeof h.action === 'string' && h.action.startsWith('Dispute Resolved')
          );
          const lastEntry = resolvedHistory.length > 0 ? resolvedHistory[resolvedHistory.length - 1] : null;
          const date = lastEntry?.date || '—';

          const dateForSort = date !== '—' ? date : (deal.createdAt || '');
          const sortTime = dateForSort ? new Date(dateForSort).getTime() : 0;
          const timestamp = isNaN(sortTime) ? 0 : sortTime;

          deal.tasks.forEach((task: Task) => {
            if (task && task.status === 'Resolved') {
              let ruling = '—';
              if (task.disputeResult === 'contractor') {
                ruling = 'Contractor paid';
              } else if (task.disputeResult === 'customer') {
                ruling = 'Customer refunded';
              }

              resolvedList.push({
                id: `${deal.id}-${task.taskIndex}`,
                dealId: deal.id,
                date,
                amount: `${task.amount} USDC`,
                ruling,
                timestamp,
              });
            }
          });
        }

        resolvedList.sort((a, b) => b.timestamp - a.timestamp);

        setLogs(resolvedList);
        setError(null);
      } catch (err: any) {
        if (!mounted) return;
        setError("Failed to fetch logs");
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    };

    loadDeals();

    const handleDealsChanged = () => {
      loadDeals();
    };
    window.addEventListener('blinkflow:deals-changed', handleDealsChanged);

    return () => {
      mounted = false;
      window.removeEventListener('blinkflow:deals-changed', handleDealsChanged);
    };
  }, []);

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Public Dispute Log</h2>
        <p className="text-gray-400 text-sm mt-1">Transparent history of all arbitrated cases.</p>
      </div>

      <Card className="overflow-hidden border-gray-800/60 shadow-lg">
        <div className="p-4 border-b border-gray-800/60 bg-gray-900/60 flex items-center gap-2">
          <ShieldAlert className="w-5 h-5 text-purple-400" />
          <h3 className="font-medium text-lg">Resolved Cases</h3>
        </div>
        <div className="overflow-x-auto">
          {loading ? (
            <div className="flex justify-center items-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-purple-500" />
            </div>
          ) : error ? (
            <div className="p-12 text-center text-red-400 font-medium">{error}</div>
          ) : logs.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <div className="w-16 h-16 bg-gray-900/80 rounded-full flex items-center justify-center mb-4 border border-gray-800">
                <Inbox className="w-8 h-8 text-gray-500" />
              </div>
              <h3 className="text-lg font-medium text-gray-200">No disputes found</h3>
              <p className="text-sm text-gray-400 mt-1 max-w-sm">There is no history of arbitrated cases yet.</p>
            </div>
          ) : (
            <>
            {/* Mobile/Tablet Card Layout */}
            <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-4 p-4 xl:hidden">
              {logs.map((d) => (
                <div key={d.id} className="bg-gray-900/40 border border-gray-800/60 rounded-lg p-4 space-y-3">
                  <div className="flex justify-between items-start">
                    <Link to={`/deal/${d.dealId}`} className="font-mono text-purple-400 hover:text-purple-300 hover:underline font-medium truncate">
                      {d.dealId}
                    </Link>
                    <div className="text-xs text-gray-500 shrink-0 ml-2">{d.date}</div>
                  </div>
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-gray-500 shrink-0">Amount:</span>
                    <span className="font-medium text-gray-300 truncate ml-2">{d.amount}</span>
                  </div>
                  <div className="flex justify-between items-center text-sm border-t border-gray-800/50 pt-2">
                    <span className="text-gray-500 shrink-0">Ruling:</span>
                    <div className="font-medium text-purple-400 truncate ml-2">{d.ruling}</div>
                  </div>
                </div>
              ))}
            </div>

            {/* Desktop Table Layout */}
            <table className="w-full text-sm text-left whitespace-nowrap hidden xl:table">
              <thead className="text-[11px] text-gray-500 uppercase tracking-wider bg-gray-950/40">
                <tr>
                  <th className="px-5 py-3 font-semibold">Deal</th>
                  <th className="px-5 py-3 font-semibold">Date</th>
                  <th className="px-5 py-3 font-semibold">Amount</th>
                  <th className="px-5 py-3 font-semibold">Ruling</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800/60 bg-gray-900/20">
                {logs.map((d) => (
                  <tr key={d.id} className="hover:bg-gray-800/40 transition-colors group">
                    <td className="px-5 py-4">
                      <Link to={`/deal/${d.dealId}`} className="font-mono text-purple-400 hover:text-purple-300 hover:underline">
                        {d.dealId}
                      </Link>
                    </td>
                    <td className="px-5 py-4 text-gray-400">{d.date}</td>
                    <td className="px-5 py-4 font-medium text-gray-300">{d.amount}</td>
                    <td className="px-5 py-4">
                      <div className="font-medium text-purple-400">{d.ruling}</div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            </>
          )}
        </div>
      </Card>
    </div>
  );
};
