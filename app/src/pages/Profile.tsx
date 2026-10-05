import { Card } from '../components/Card';
import { Button } from '../components/Button';
import { ShieldCheck, Calendar, Trophy, AlertTriangle, XCircle, RefreshCw, Loader2 } from 'lucide-react';
import { useState, useEffect } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { truncateAddress } from '../lib/utils';

export const Profile = () => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { publicKey } = useWallet();

  useEffect(() => {
    const timer = setTimeout(() => {
      try {
        // Mock fetch
      } catch (err: any) {
        setError("Failed to load profile data");
      } finally {
        setLoading(false);
      }
    }, 800);
    return () => clearTimeout(timer);
  }, []);

  if (loading) {
    return <div className="flex justify-center items-center py-20"><Loader2 className="w-8 h-8 animate-spin text-purple-500" /></div>;
  }
  
  if (error) {
    return <div className="p-12 text-center text-red-400 font-medium">{error}</div>;
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Reputation Profile (SBT)</h2>
        <p className="text-gray-400 text-sm mt-1">Reputation badge (demo data)</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="md:col-span-1 space-y-6">
          <Card className="p-6 flex flex-col items-center text-center bg-gray-900/60 border-purple-500/20 relative overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-b from-purple-500/10 to-transparent pointer-events-none"></div>
            <div className="w-24 h-24 rounded-full bg-gradient-to-br from-purple-600 to-blue-600 flex items-center justify-center shadow-[0_0_30px_rgba(139,92,246,0.3)] mb-4 relative z-10">
              <ShieldCheck className="w-12 h-12 text-white" />
            </div>
            <h3 className="font-mono text-lg font-bold text-gray-200">
              {publicKey ? truncateAddress(publicKey.toString(), 6) : 'Not Connected'}
            </h3>
            <p className="text-sm text-purple-400 font-medium mt-1">
              {publicKey ? 'No reputation badge yet' : 'Connect your wallet to see your reputation'}
            </p>
            
            <div className="flex items-center gap-2 text-sm text-gray-400 mt-4 bg-gray-950/50 px-3 py-1.5 rounded-lg border border-gray-800">
              <Calendar className="w-4 h-4" />
              <span>Joined: Aug 12, 2026</span>
            </div>

            <Button variant="outline" className="w-full mt-6 flex items-center justify-center gap-2">
              <RefreshCw className="w-4 h-4" />
              Update Badge
            </Button>
          </Card>
        </div>

        <div className="md:col-span-2 space-y-6">
          <Card className="p-6 bg-gray-900/40 backdrop-blur-sm border-gray-800/60">
            <h3 className="text-lg font-medium mb-6">
              Historical Track Record
              <span className="text-xs font-normal bg-orange-500/10 text-orange-400 px-2 py-1 rounded ml-2 border border-orange-500/20">Demo data</span>
            </h3>
            
            <div className="space-y-8">
              {/* As Contractor */}
              <div>
                <div className="flex justify-between items-end mb-3">
                  <div>
                    <div className="text-sm text-gray-400">As Contractor</div>
                    <div className="text-xl font-bold text-gray-200">13 Deals</div>
                  </div>
                  <div className="text-green-400 font-medium text-sm bg-green-500/10 px-2 py-1 rounded">92% Success</div>
                </div>
                {/* Stacked bar */}
                <div className="h-4 w-full flex rounded-full overflow-hidden bg-gray-950 border border-gray-800 shadow-inner">
                  <div className="bg-green-500/80 hover:bg-green-500 transition-colors cursor-pointer" style={{ width: '92%' }} title="12 Success"></div>
                  <div className="bg-yellow-500/80 hover:bg-yellow-500 transition-colors cursor-pointer" style={{ width: '8%' }} title="1 Arbitrated"></div>
                  <div className="bg-red-500/80 hover:bg-red-500 transition-colors cursor-pointer" style={{ width: '0%' }} title="0 Lost"></div>
                </div>
              </div>

              {/* As Customer */}
              <div>
                <div className="flex justify-between items-end mb-3">
                  <div>
                    <div className="text-sm text-gray-400">As Customer</div>
                    <div className="text-xl font-bold text-gray-200">5 Deals</div>
                  </div>
                  <div className="text-green-400 font-medium text-sm bg-green-500/10 px-2 py-1 rounded">100% Success</div>
                </div>
                {/* Stacked bar */}
                <div className="h-4 w-full flex rounded-full overflow-hidden bg-gray-950 border border-gray-800 shadow-inner">
                  <div className="bg-green-500/80 hover:bg-green-500 transition-colors cursor-pointer" style={{ width: '100%' }} title="5 Success"></div>
                  <div className="bg-yellow-500/80 hover:bg-yellow-500 transition-colors cursor-pointer" style={{ width: '0%' }} title="0 Arbitrated"></div>
                  <div className="bg-red-500/80 hover:bg-red-500 transition-colors cursor-pointer" style={{ width: '0%' }} title="0 Lost"></div>
                </div>
              </div>
            </div>

            {/* Shared Legend */}
            <div className="flex flex-wrap gap-4 md:gap-6 mt-8 pt-6 border-t border-gray-800/60 text-xs sm:text-sm text-gray-400 justify-center">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-green-500/80 shadow-[0_0_8px_rgba(34,197,94,0.4)]"></div> 
                <span>Completed</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-yellow-500/80 shadow-[0_0_8px_rgba(234,179,8,0.4)]"></div> 
                <span>Settled (Arbitration)</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-red-500/80 shadow-[0_0_8px_rgba(239,68,68,0.4)]"></div> 
                <span>Lost (Disputed)</span>
              </div>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
};
