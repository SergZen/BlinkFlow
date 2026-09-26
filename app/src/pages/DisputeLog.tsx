import { Card } from '../components/Card';
import { ShieldAlert, Loader2, Inbox } from 'lucide-react';
import { useState, useEffect } from 'react';

export interface Dispute {
  id: string;
  amount: string;
  ratio: string;
  category: string;
  date: string;
}

export const DisputeLog = () => {
  const disputes: Dispute[] = [
    { id: 'DSP-8821', amount: '$500 - $1,000', ratio: '100/0 (Contractor/Customer)', category: 'Unreasonable Rejection', date: '2026-09-12' },
    { id: 'DSP-8822', amount: '< $500', ratio: '0/100 (Contractor/Customer)', category: 'Non-Delivery', date: '2026-09-10' },
    { id: 'DSP-8823', amount: '$1,000 - $5,000', ratio: '30/70 (Contractor/Customer)', category: 'Poor Quality', date: '2026-09-05' },
    { id: 'DSP-8824', amount: '< $500', ratio: '50/50 (Contractor/Customer)', category: 'Scope Creep', date: '2026-09-01' },
    { id: 'DSP-8825', amount: '$1,000 - $5,000', ratio: '50/50 (Contractor/Customer)', category: 'Force Majeure', date: '2026-08-28' },
    { id: 'DSP-8826', amount: '< $500', ratio: '60/40 (Contractor/Customer)', category: 'Mutual Agreement', date: '2026-08-20' },
  ];

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [logs, setLogs] = useState<Dispute[]>([]);

  useEffect(() => {
    const timer = setTimeout(() => {
      try {
        setLogs(disputes);
      } catch (err: any) {
        setError("Failed to fetch logs");
      } finally {
        setLoading(false);
      }
    }, 800);
    return () => clearTimeout(timer);
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
            {/* Mobile Card Layout */}
            <div className="flex flex-col gap-3 p-4 sm:hidden">
              {logs.map((d) => (
                <div key={d.id} className="bg-gray-900/40 border border-gray-800/60 rounded-lg p-4 space-y-3">
                  <div className="flex justify-between items-start">
                    <div className="font-mono text-gray-300 font-medium">{d.id}</div>
                    <div className="text-xs text-gray-500">{d.date}</div>
                  </div>
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-gray-500">Amount:</span>
                    <span className="font-medium text-gray-300">{d.amount}</span>
                  </div>
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-gray-500">Category:</span>
                    <span className="px-2.5 py-1 rounded-md bg-gray-800 text-xs text-gray-300">{d.category}</span>
                  </div>
                  <div className="flex flex-col text-sm mt-1 border-t border-gray-800/50 pt-2">
                    <span className="text-gray-500 mb-1">Resolution Split:</span>
                    <div className="font-medium text-purple-400">{d.ratio}</div>
                  </div>
                </div>
              ))}
            </div>

            {/* Desktop Table Layout */}
            <table className="w-full text-sm text-left whitespace-nowrap hidden sm:table">
              <thead className="text-[11px] text-gray-500 uppercase tracking-wider bg-gray-950/40">
                <tr>
                  <th className="px-5 py-3 font-semibold">Dispute ID</th>
                  <th className="px-5 py-3 font-semibold">Date</th>
                  <th className="px-5 py-3 font-semibold">Amount Range</th>
                  <th className="px-5 py-3 font-semibold">Category</th>
                  <th className="px-5 py-3 font-semibold">Resolution Split</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800/60 bg-gray-900/20">
                {logs.map((d) => (
                  <tr key={d.id} className="hover:bg-gray-800/40 transition-colors group">
                    <td className="px-5 py-4">
                      <div className="font-mono text-gray-300">{d.id}</div>
                    </td>
                    <td className="px-5 py-4 text-gray-400">{d.date}</td>
                    <td className="px-5 py-4 font-medium text-gray-300">{d.amount}</td>
                    <td className="px-5 py-4">
                      <span className="px-2.5 py-1 rounded-md bg-gray-800 text-xs text-gray-300">{d.category}</span>
                    </td>
                    <td className="px-5 py-4">
                      <div className="font-medium text-purple-400">{d.ratio}</div>
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
