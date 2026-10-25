import { Card } from '../components/Card';
import { ShieldCheck, Calendar, Loader2 } from 'lucide-react';
import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useWallet } from '@solana/wallet-adapter-react';
import { PublicKey } from '@solana/web3.js';
import { truncateAddress } from '../lib/utils';
import { fetchReputation, Reputation, RoleReputation } from '../lib/client/sbt';
import { Button } from '../components/Button';
import { isRpcUnavailable } from '../lib/rpc';

export const Profile = () => {
  const [searchParams] = useSearchParams();
  const { publicKey } = useWallet();

  const walletParam = searchParams.get('wallet')?.trim() || '';
  let queryWallet: string | null = null;
  if (walletParam) {
    try {
      new PublicKey(walletParam);
      queryWallet = walletParam;
    } catch {
      queryWallet = null;
    }
  }

  const targetWallet = queryWallet || (publicKey ? publicKey.toBase58() : null);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isUnavailable, setIsUnavailable] = useState(false);
  const [reputation, setReputation] = useState<Reputation | null>(null);
  const [retryCount, setRetryCount] = useState(0);

  useEffect(() => {
    if (!targetWallet) {
      setReputation(null);
      setLoading(false);
      setError(null);
      setIsUnavailable(false);
      return;
    }

    let active = true;
    setLoading(true);
    setError(null);

    fetchReputation(targetWallet)
      .then((rep) => {
        if (!active) return;
        setReputation(rep);
        setError(null);
        setIsUnavailable(false);
      })
      .catch((err) => {
        if (!active) return;
        console.error('Failed to load reputation:', err);
        if (isRpcUnavailable(err)) {
          setIsUnavailable(true);
          setError('Solana Devnet is not responding right now. Retrying…');
        } else {
          setIsUnavailable(false);
          setError('Failed to load profile data');
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [targetWallet, retryCount]);

  useEffect(() => {
    if (!isUnavailable || !targetWallet) return;

    const timer = setInterval(() => {
      if (!document.hidden) {
        setRetryCount((c) => c + 1);
      }
    }, 15000);

    return () => {
      clearInterval(timer);
    };
  }, [isUnavailable, targetWallet]);

  if (loading && !isUnavailable) {
    return <div className="flex justify-center items-center py-20"><Loader2 className="w-8 h-8 animate-spin text-purple-500" /></div>;
  }
  
  if (error) {
    return (
      <div className="p-12 text-center space-y-4">
        <p className="text-red-400 font-medium">{error}</p>
        {isUnavailable && (
          <Button variant="outline" onClick={() => setRetryCount((c) => c + 1)} disabled={loading} className="mx-auto text-xs px-3 py-1.5">
            {loading ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin inline" /> : null}
            Retry now
          </Button>
        )}
      </div>
    );
  }

  const mapStats = (roleRep?: RoleReputation) => {
    if (!roleRep) {
      return { won: 0, arbitratedWon: 0, lost: 0, volume: 0 };
    }
    const arbitratedWon = Math.max(roleRep.disputes - roleRep.lost, 0);
    const won = Math.max(roleRep.success - arbitratedWon, 0);
    const lost = roleRep.lost;
    const volume = roleRep.volumeUsdc;
    return { won, arbitratedWon, lost, volume };
  };

  const contractorStats = mapStats(reputation?.contractor);
  const customerStats = mapStats(reputation?.customer);

  const formatDate = (date: Date | null | undefined): string => {
    if (!date) return '—';
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const month = months[date.getUTCMonth()];
    const day = String(date.getUTCDate()).padStart(2, '0');
    const year = date.getUTCFullYear();
    return `${month} ${day}, ${year}`;
  };

  const renderRoleStats = (
    title: string,
    stats: { won: number, arbitratedWon: number, lost: number, volume: number },
    extra?: { label: string; value: number; tooltip: string }
  ) => {
    const { won, arbitratedWon, lost, volume } = stats;
    const total = won + arbitratedWon + lost;
    const rate = total > 0 ? Math.round(((won + arbitratedWon) / total) * 100) : 0;
    const avgDeal = total > 0 ? Math.round(volume / total) : 0;

    const wSuccess = total > 0 ? (won / total) * 100 : 0;
    const wArbitrated = total > 0 ? (arbitratedWon / total) * 100 : 0;
    const wLost = total > 0 ? (lost / total) * 100 : 0;

    return (
      <div>
        <div className="flex justify-between items-end mb-3">
          <div>
            <div className="text-sm text-gray-400">{title}</div>
            <div className="text-xl font-bold text-gray-200">{total} Deals</div>
          </div>
          <div className="flex flex-col items-end">
            <div className="text-green-400 font-medium text-sm bg-green-500/10 px-2 py-1 rounded">{total > 0 ? `${rate}% Success` : 'New'}</div>
            <div className="text-[11px] text-gray-500 whitespace-nowrap mt-1">avg {avgDeal} USDC</div>
          </div>
        </div>
        
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 mt-3 mb-3 text-sm">
          <div className="flex items-center gap-1.5" title="Total Volume">
            <span className="text-xs font-medium text-gray-500 uppercase tracking-wider">Vol:</span>
            <span className="font-bold text-blue-400">{volume.toLocaleString()} USDC</span>
          </div>
          <div className="w-px h-3 bg-gray-800 hidden sm:block"></div>
          <div className="flex items-center gap-2" title="Won">
            <div className="w-2 h-2 rounded-full bg-green-500/80 shadow-[0_0_8px_rgba(34,197,94,0.4)]"></div>
            <span className="font-semibold text-green-400">{won}</span>
          </div>
          <div className="w-px h-3 bg-gray-800 hidden sm:block"></div>
          <div className="flex items-center gap-2" title="Won (Arbitrated)">
            <div className="w-2 h-2 rounded-full bg-yellow-500/80 shadow-[0_0_8px_rgba(234,179,8,0.4)]"></div>
            <span className="font-semibold text-yellow-500">{arbitratedWon}</span>
          </div>
          <div className="w-px h-3 bg-gray-800 hidden sm:block"></div>
          <div className="flex items-center gap-2" title="Lost (Arbitrated)">
            <div className="w-2 h-2 rounded-full bg-red-500/80 shadow-[0_0_8px_rgba(239,68,68,0.4)]"></div>
            <span className="font-semibold text-red-400">{lost}</span>
          </div>
          {extra && (
            <>
              <div className="w-px h-3 bg-gray-800 hidden sm:block"></div>
              <div className="flex items-center gap-1.5 cursor-help" title={extra.tooltip}>
                <span className="text-xs font-medium text-gray-500">{extra.label}:</span>
                <span className="font-semibold text-gray-300">{extra.value}</span>
              </div>
            </>
          )}
        </div>

        <div className="h-4 w-full flex rounded-full overflow-hidden bg-gray-950 border border-gray-800 shadow-inner">
          <div className="bg-green-500/80 hover:bg-green-500 transition-colors" style={{ width: `${wSuccess}%` }}></div>
          <div className="bg-yellow-500/80 hover:bg-yellow-500 transition-colors" style={{ width: `${wArbitrated}%` }}></div>
          <div className="bg-red-500/80 hover:bg-red-500 transition-colors" style={{ width: `${wLost}%` }}></div>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Reputation Profile (SBT)</h2>
        <p className="text-gray-400 text-sm mt-1">On-chain soulbound reputation badge</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="md:col-span-1 space-y-6">
          <Card className="p-6 flex flex-col items-center text-center bg-gray-900/60 border-purple-500/20 relative overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-b from-purple-500/10 to-transparent pointer-events-none"></div>
            <div className="w-24 h-24 rounded-full bg-gradient-to-br from-purple-600 to-blue-600 flex items-center justify-center shadow-[0_0_30px_rgba(139,92,246,0.3)] mb-4 relative z-10">
              <ShieldCheck className="w-12 h-12 text-white" />
            </div>
            <h3 className="font-mono text-lg font-bold text-gray-200">
              {targetWallet ? truncateAddress(targetWallet, 6) : 'Not Connected'}
            </h3>
            <p className="text-sm text-purple-400 font-medium mt-1">
              {targetWallet
                ? (reputation ? 'Reputation badge on Solana Devnet' : 'No reputation badge yet')
                : 'Connect your wallet to see your reputation'}
            </p>
            
            <div className="flex flex-col gap-2 w-full text-sm text-gray-400 mt-4 bg-gray-950/50 p-3 rounded-lg border border-gray-800">
              <div className="flex flex-wrap items-center gap-x-2">
                <span className="flex items-center gap-1.5"><Calendar className="w-4 h-4 shrink-0" />First seen:</span>
                <span className="whitespace-nowrap">{formatDate(reputation?.firstSeen)}</span>
              </div>
              <div className="flex flex-wrap items-center gap-x-2">
                <span className="flex items-center gap-1.5"><Calendar className="w-4 h-4 shrink-0" />Last seen:</span>
                <span className="whitespace-nowrap">{formatDate(reputation?.lastSeen)}</span>
              </div>
            </div>

            <p className="text-xs text-gray-500 mt-6 leading-relaxed text-left w-full">
              Reputation badge is created automatically on your first deal (a one-time ~0.002 SOL network fee). Every completed deal and every lost dispute is recorded permanently.
            </p>
          </Card>
        </div>

        <div className="md:col-span-2 space-y-6">
          <Card className="p-6 bg-gray-900/40 backdrop-blur-sm border-gray-800/60">
            <h3 className="text-lg font-medium mb-6">
              Historical Track Record
            </h3>
            
            <div className="space-y-8">
              {renderRoleStats(
                "As Contractor",
                contractorStats,
                {
                  label: "Paid automatically",
                  value: reputation?.contractor?.autoReleased ?? 0,
                  tooltip: "Payments claimed after the customer did not review the work in 14 days",
                }
              )}
              {renderRoleStats(
                "As Customer",
                customerStats,
                {
                  label: "Missed reviews",
                  value: reputation?.customer?.unresponsive ?? 0,
                  tooltip: "Times the contractor was paid automatically because the work was not reviewed in 14 days",
                }
              )}
            </div>

            {/* Shared Legend */}
            <div className="flex flex-wrap gap-4 md:gap-6 mt-8 pt-6 border-t border-gray-800/60 text-xs sm:text-sm text-gray-400 justify-center">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-green-500/80 shadow-[0_0_8px_rgba(34,197,94,0.4)]"></div> 
                <span>Won</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-yellow-500/80 shadow-[0_0_8px_rgba(234,179,8,0.4)]"></div> 
                <span>Won (Arbitrated)</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-red-500/80 shadow-[0_0_8px_rgba(239,68,68,0.4)]"></div> 
                <span>Lost (Arbitrated)</span>
              </div>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
};
