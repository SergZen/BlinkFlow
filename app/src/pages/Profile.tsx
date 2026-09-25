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
        <p className="text-gray-400 text-sm mt-1">Your on-chain verified track record.</p>
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
            <p className="text-sm text-purple-400 font-medium mt-1">Verified User</p>
            
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
          <Card className="p-6">
            <h3 className="text-lg font-medium mb-4">As Contractor</h3>
            <div className="grid grid-cols-3 gap-4">
              <div className="p-4 bg-gray-950 rounded-lg border border-gray-800">
                <div className="flex items-center gap-2 text-green-400 mb-2">
                  <Trophy className="w-4 h-4" />
                  <span className="text-sm font-medium">Success</span>
                </div>
                <div className="text-3xl font-bold">12</div>
              </div>
              <div className="p-4 bg-gray-950 rounded-lg border border-gray-800">
                <div className="flex items-center gap-2 text-orange-400 mb-2">
                  <AlertTriangle className="w-4 h-4" />
                  <span className="text-sm font-medium">Arbitrated</span>
                </div>
                <div className="text-3xl font-bold">1</div>
              </div>
              <div className="p-4 bg-gray-950 rounded-lg border border-gray-800">
                <div className="flex items-center gap-2 text-red-400 mb-2">
                  <XCircle className="w-4 h-4" />
                  <span className="text-sm font-medium">Lost</span>
                </div>
                <div className="text-3xl font-bold">0</div>
              </div>
            </div>
          </Card>

          <Card className="p-6">
            <h3 className="text-lg font-medium mb-4">As Customer</h3>
            <div className="grid grid-cols-3 gap-4">
              <div className="p-4 bg-gray-950 rounded-lg border border-gray-800">
                <div className="flex items-center gap-2 text-green-400 mb-2">
                  <Trophy className="w-4 h-4" />
                  <span className="text-sm font-medium">Success</span>
                </div>
                <div className="text-3xl font-bold">5</div>
              </div>
              <div className="p-4 bg-gray-950 rounded-lg border border-gray-800">
                <div className="flex items-center gap-2 text-orange-400 mb-2">
                  <AlertTriangle className="w-4 h-4" />
                  <span className="text-sm font-medium">Arbitrated</span>
                </div>
                <div className="text-3xl font-bold">0</div>
              </div>
              <div className="p-4 bg-gray-950 rounded-lg border border-gray-800">
                <div className="flex items-center gap-2 text-red-400 mb-2">
                  <XCircle className="w-4 h-4" />
                  <span className="text-sm font-medium">Lost</span>
                </div>
                <div className="text-3xl font-bold">0</div>
              </div>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
};
