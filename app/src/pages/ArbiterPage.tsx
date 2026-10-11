import { useState, useEffect, useMemo, useCallback } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import { PublicKey } from '@solana/web3.js';
import { Link } from 'react-router-dom';
import { Layout } from '../components/Layout';
import { Card } from '../components/Card';
import { Button } from '../components/Button';
import { truncateAddress } from '../lib/utils';
import { friendlyError } from '../lib/errors';
import { client } from '../lib/client';
import {
  fetchProtocolConfig,
  fetchDealTrustAuthority,
  setTrustAuthority,
  clearTrustAuthorityCache,
  explorerAddr,
  explorerTx,
  getChainInfo,
  type ProtocolConfig,
} from '../lib/client/chainClient';
import type { Deal } from '../lib/types';
import { dealTotal } from '../lib/dealStatus';
import {
  Shield,
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  RefreshCw,
  Loader2,
  Lock,
  ArrowRight,
  ArrowLeft,
} from 'lucide-react';

export interface ArbiterPageProps {
  view: 'admin' | 'arbiter';
}

export const ArbiterPage = ({ view }: ArbiterPageProps) => {
  const { publicKey, connected } = useWallet();
  const walletAddress = publicKey?.toBase58() || '';

  const [config, setConfig] = useState<ProtocolConfig | null>(null);
  const [configLoading, setConfigLoading] = useState(true);
  const [configError, setConfigError] = useState<string | null>(null);

  const [deals, setDeals] = useState<Deal[]>([]);
  const [dealsLoading, setDealsLoading] = useState(true);
  const [dealTrustAuthorities, setDealTrustAuthorities] = useState<Record<string, string | null>>({});

  // Admin state
  const [newTrustAuthInput, setNewTrustAuthInput] = useState('');
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [isSubmittingAuth, setIsSubmittingAuth] = useState(false);
  const [adminSuccessTx, setAdminSuccessTx] = useState<string | null>(null);
  const [adminError, setAdminError] = useState<string | null>(null);

  // Arbiter resolution state
  const [resolveModal, setResolveModal] = useState<{
    deal: Deal;
    taskIndex: number;
    customerWins: boolean;
  } | null>(null);
  const [isSubmittingResolve, setIsSubmittingResolve] = useState(false);
  const [resolveSuccessTx, setResolveSuccessTx] = useState<{
    dealId: string;
    sig: string;
    action: string;
  } | null>(null);
  const [resolveError, setResolveError] = useState<string | null>(null);

  const loadConfig = useCallback(async () => {
    try {
      setConfigLoading(true);
      setConfigError(null);
      const conf = await fetchProtocolConfig();
      setConfig(conf);
    } catch (err: any) {
      console.error('[ArbiterPage] Failed to fetch protocol config:', err);
      setConfigError(friendlyError(err));
    } finally {
      setConfigLoading(false);
    }
  }, []);

  const loadDeals = useCallback(async () => {
    try {
      setDealsLoading(true);
      const allDeals = await client.listDeals();
      setDeals(allDeals);

      const disputed = allDeals.filter((d) => d.tasks?.some((t) => t.status === 'Disputed'));
      const authMap: Record<string, string | null> = {};
      await Promise.all(
        disputed.map(async (deal) => {
          try {
            const ta = await fetchDealTrustAuthority(deal.id);
            authMap[deal.id] = ta;
          } catch {
            authMap[deal.id] = null;
          }
        })
      );
      setDealTrustAuthorities((prev) => ({ ...prev, ...authMap }));
    } catch (err: any) {
      console.error('[ArbiterPage] Failed to load deals:', err);
    } finally {
      setDealsLoading(false);
    }
  }, []);

  const refreshAll = useCallback(() => {
    loadConfig();
    if (view === 'arbiter') {
      loadDeals();
    }
  }, [loadConfig, loadDeals, view]);

  useEffect(() => {
    loadConfig();
    if (view === 'arbiter') {
      loadDeals();
    }
  }, [loadConfig, loadDeals, view]);

  // Allowed viewers gate: VITE_ARBITER_VIEWERS + Config.admin + Config.trustAuthority + distinct arbiters from disputed deals
  const allowedViewers = useMemo(() => {
    const envStr = (import.meta as any).env?.VITE_ARBITER_VIEWERS || '';
    const viewers = envStr
      .split(',')
      .map((s: string) => s.trim())
      .filter(Boolean);
    if (config?.admin) viewers.push(config.admin);
    if (config?.trustAuthority) viewers.push(config.trustAuthority);
    Object.values(dealTrustAuthorities).forEach((ta) => {
      if (ta) viewers.push(ta);
    });
    return new Set(viewers.map((k: string) => k.toLowerCase()));
  }, [config, dealTrustAuthorities]);

  const isAllowedViewer = useMemo(() => {
    if (!walletAddress) return false;
    return allowedViewers.has(walletAddress.toLowerCase());
  }, [walletAddress, allowedViewers]);

  const isAdmin = useMemo(() => {
    if (!walletAddress || !config) return false;
    return walletAddress.toLowerCase() === config.admin.toLowerCase();
  }, [walletAddress, config]);

  const isAnyArbiter = useMemo(() => {
    if (!walletAddress) return false;
    const wa = walletAddress.toLowerCase();
    if (config?.trustAuthority?.toLowerCase() === wa) return true;
    return Object.values(dealTrustAuthorities).some((ta) => ta?.toLowerCase() === wa);
  }, [walletAddress, config, dealTrustAuthorities]);

  // Disputed deals list for arbiter view
  const disputedDeals = useMemo(() => {
    return deals.filter((d) => d.tasks?.some((t) => t.status === 'Disputed'));
  }, [deals]);

  const pageTitle = view === 'admin' ? 'Protocol Admin' : 'Arbiter Console';
  const pageSubtitle =
    view === 'admin'
      ? 'On-chain configuration management and trust authority settings'
      : 'Dispute resolution authority and escrow settlement';
  const pageBadge = view === 'admin' ? 'Devnet Admin' : 'Devnet Arbiter';

  // 1. Not connected gate
  if (!connected || !walletAddress) {
    return (
      <div className="min-h-screen bg-gray-950 text-gray-100 flex items-center justify-center p-4">
        <Card className="max-w-md w-full p-8 text-center space-y-6 border-gray-800 bg-gray-900 shadow-2xl">
          <div className="w-16 h-16 mx-auto rounded-2xl bg-purple-950/60 border border-purple-800/50 flex items-center justify-center text-purple-400">
            <Shield className="w-8 h-8" />
          </div>
          <div className="space-y-2">
            <h1 className="text-2xl font-bold text-white tracking-tight">{pageTitle}</h1>
            <p className="text-sm text-gray-400">
              {view === 'admin'
                ? 'Please connect your authorized Phantom wallet to access protocol administration.'
                : 'Please connect your authorized Phantom wallet to access dispute resolution tools.'}
            </p>
          </div>
          <div className="flex justify-center pt-2">
            <WalletMultiButton />
          </div>
          <div className="pt-2">
            <Link
              to="/"
              className="inline-flex items-center gap-1.5 text-xs text-gray-400 hover:text-white transition-colors"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              Back to dashboard
            </Link>
          </div>
        </Card>
      </div>
    );
  }

  // 2. Loading config / deals gate
  if (configLoading || (view === 'arbiter' && dealsLoading && deals.length === 0)) {
    return (
      <div className="min-h-screen bg-gray-950 text-gray-100 flex items-center justify-center p-4">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-8 h-8 text-purple-400 animate-spin" />
          <p className="text-sm text-gray-400">
            Loading {view === 'admin' ? 'protocol configuration' : 'disputed deals and arbiters'}...
          </p>
        </div>
      </div>
    );
  }

  // 3. Unauthorized gate (renders the same 404 page as an unknown route, no hints)
  if (!isAllowedViewer) {
    return (
      <Layout>
        <div className="flex-1 flex flex-col items-center justify-center p-8 text-center min-h-[60vh]">
          <h1 className="text-4xl font-bold text-gray-400 mb-2">404</h1>
          <p className="text-gray-500">Page not found</p>
        </div>
      </Layout>
    );
  }

  // Admin form submit handler
  const handleSetTrustAuth = async () => {
    const target = newTrustAuthInput.trim();
    setAdminError(null);
    setAdminSuccessTx(null);
    setIsSubmittingAuth(true);
    try {
      const sig = await setTrustAuthority(target);
      setAdminSuccessTx(sig);
      setNewTrustAuthInput('');
      setAuthModalOpen(false);
      clearTrustAuthorityCache();
      await loadConfig();
    } catch (err: any) {
      console.error('[handleSetTrustAuth]', err);
      setAdminError(friendlyError(err));
    } finally {
      setIsSubmittingAuth(false);
    }
  };

  // Arbiter resolution submit handler
  const handleResolveDispute = async () => {
    if (!resolveModal) return;
    const { deal, taskIndex, customerWins } = resolveModal;
    setResolveError(null);
    setResolveSuccessTx(null);
    setIsSubmittingResolve(true);
    try {
      const updatedDeal = await client.resolveDispute(deal.id, taskIndex, customerWins);
      const chainInfo = getChainInfo(deal.id);
      const lastSig = chainInfo?.sigs?.slice(-1)[0]?.sig || '';
      setResolveSuccessTx({
        dealId: deal.id,
        sig: lastSig,
        action: customerWins ? 'Refund Customer' : 'Pay Contractor',
      });
      setResolveModal(null);
      setDeals((prev) => prev.map((d) => (d.id === updatedDeal.id ? updatedDeal : d)));
      await loadDeals();
    } catch (err: any) {
      console.error('[handleResolveDispute]', err);
      setResolveError(friendlyError(err));
    } finally {
      setIsSubmittingResolve(false);
    }
  };

  const isInputValidPubkey = (() => {
    try {
      const trimmed = newTrustAuthInput.trim();
      if (!trimmed) return false;
      const pk = new PublicKey(trimmed);
      return PublicKey.isOnCurve(pk.toBuffer());
    } catch {
      return false;
    }
  })();

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 p-4 md:p-8 font-sans selection:bg-purple-500/30">
      <div className="max-w-6xl mx-auto space-y-8">
        {/* Top Header */}
        <div className="space-y-4 border-b border-gray-800 pb-6">
          <div>
            <Link
              to="/"
              className="inline-flex items-center gap-1.5 text-xs text-gray-400 hover:text-white transition-colors"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              Back to dashboard
            </Link>
          </div>

          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-3">
              <div className="p-2 bg-gradient-to-br from-purple-600 to-blue-600 rounded-lg shadow-lg shadow-purple-500/20 text-white">
                <Shield className="w-6 h-6" />
              </div>
              <h1 className="text-2xl font-bold tracking-tight text-white">{pageTitle}</h1>
              <span className="text-xs px-2.5 py-0.5 rounded-full bg-purple-950/80 border border-purple-800 text-purple-300 font-medium">
                {pageBadge}
              </span>
            </div>
            <p className="text-sm text-gray-400 mt-1">{pageSubtitle}</p>
          </div>

          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              onClick={refreshAll}
              disabled={configLoading || (view === 'arbiter' && dealsLoading)}
              className="text-xs h-9"
            >
              <RefreshCw
                className={`w-3.5 h-3.5 ${
                  configLoading || (view === 'arbiter' && dealsLoading) ? 'animate-spin' : ''
                }`}
              />
              Refresh
            </Button>

            <div className="flex items-center gap-2 bg-gray-900 border border-gray-800 px-3 py-1.5 rounded-lg text-xs">
              <span className="text-gray-400">Wallet:</span>
              <span className="font-mono text-gray-200">{truncateAddress(walletAddress)}</span>
              {isAdmin && (
                <span className="ml-1 text-[10px] uppercase font-semibold px-1.5 py-0.5 rounded bg-blue-950 border border-blue-800 text-blue-300">
                  Admin
                </span>
              )}
              {!isAdmin && isAnyArbiter && (
                <span className="ml-1 text-[10px] uppercase font-semibold px-1.5 py-0.5 rounded bg-purple-950 border border-purple-800 text-purple-300">
                  Arbiter
                </span>
              )}
              {!isAdmin && !isAnyArbiter && (
                <span className="ml-1 text-[10px] uppercase font-semibold px-1.5 py-0.5 rounded bg-gray-800 text-gray-400">
                  Viewer
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

        {/* Global Error Notice if Config fetch failed */}
        {configError && (
          <div className="p-4 rounded-xl bg-red-950/40 border border-red-800/60 text-red-300 flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold">Failed to load protocol configuration</p>
              <p className="text-xs text-red-400 mt-0.5">{configError}</p>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* BLOCK A: ADMIN (Protocol Configuration & Trust Authority)               */}
        {/* Rendered ONLY on view === 'admin'                                        */}
        {/* ========================================================================= */}
        {view === 'admin' && (
          <section className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-blue-500"></span>
                <h2 className="text-lg font-semibold text-white">Protocol configuration</h2>
              </div>
              {!isAdmin && (
                <span className="text-xs text-gray-500 flex items-center gap-1.5">
                  <Lock className="w-3.5 h-3.5" /> Read-only mode
                </span>
              )}
            </div>

            <Card className="p-6 space-y-6 border-gray-800 bg-gray-900/90">
              {/* Displayed On-chain Config Details */}
              {config && (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  <div className="p-3.5 bg-gray-950/70 border border-gray-800/80 rounded-lg space-y-1">
                    <div className="text-xs text-gray-500 uppercase font-semibold">Admin Wallet</div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono text-sm text-gray-200">
                        {truncateAddress(config.admin, 6)}
                      </span>
                      <a
                        href={explorerAddr(config.admin)}
                        target="_blank"
                        rel="noreferrer"
                        className="text-gray-400 hover:text-white transition-colors"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                    </div>
                  </div>

                  <div className="p-3.5 bg-gray-950/70 border border-gray-800/80 rounded-lg space-y-1">
                    <div className="text-xs text-gray-500 uppercase font-semibold">
                      Trust Authority (Arbiter)
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono text-purple-300">
                        {truncateAddress(config.trustAuthority, 6)}
                      </span>
                      <a
                        href={explorerAddr(config.trustAuthority)}
                        target="_blank"
                        rel="noreferrer"
                        className="text-gray-400 hover:text-white transition-colors"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                    </div>
                  </div>

                  <div className="p-3.5 bg-gray-950/70 border border-gray-800/80 rounded-lg space-y-1">
                    <div className="text-xs text-gray-500 uppercase font-semibold">Fee Recipient</div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono text-sm text-gray-200">
                        {truncateAddress(config.feeRecipient, 6)}
                      </span>
                      <a
                        href={explorerAddr(config.feeRecipient)}
                        target="_blank"
                        rel="noreferrer"
                        className="text-gray-400 hover:text-white transition-colors"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                    </div>
                  </div>

                  <div className="p-3.5 bg-gray-950/70 border border-gray-800/80 rounded-lg space-y-1">
                    <div className="text-xs text-gray-500 uppercase font-semibold">
                      Token Mint (USDC)
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono text-sm text-gray-200">
                        {truncateAddress(config.mint, 6)}
                      </span>
                      <a
                        href={explorerAddr(config.mint)}
                        target="_blank"
                        rel="noreferrer"
                        className="text-gray-400 hover:text-white transition-colors"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                    </div>
                  </div>

                  <div className="p-3.5 bg-gray-950/70 border border-gray-800/80 rounded-lg space-y-1">
                    <div className="text-xs text-gray-500 uppercase font-semibold">
                      Fees (Protocol / Arbitration)
                    </div>
                    <div className="text-sm font-medium text-gray-200">
                      {(config.protocolFeeBps / 100).toFixed(2)}% ({config.protocolFeeBps} bps) /{' '}
                      {(config.arbitrationFeeBps / 100).toFixed(2)}% ({config.arbitrationFeeBps} bps)
                    </div>
                  </div>

                  <div className="p-3.5 bg-gray-950/70 border border-gray-800/80 rounded-lg space-y-1">
                    <div className="text-xs text-gray-500 uppercase font-semibold">
                      Status & Pauser
                    </div>
                    <div className="flex items-center gap-2 text-sm">
                      <span
                        className={`w-2 h-2 rounded-full ${
                          config.paused ? 'bg-red-500' : 'bg-emerald-500'
                        }`}
                      />
                      <span
                        className={
                          config.paused ? 'text-red-400 font-medium' : 'text-emerald-400 font-medium'
                        }
                      >
                        {config.paused ? 'Paused' : 'Active'}
                      </span>
                      <span className="text-xs text-gray-500">(Pauser: Admin)</span>
                    </div>
                  </div>
                </div>
              )}

              {/* Note required by specification */}
              <div className="text-xs text-gray-400 bg-gray-950/40 border border-gray-800/50 p-3 rounded-lg flex items-center gap-2">
                <span className="text-purple-400 font-semibold">&bull;</span>
                Deals created before this change keep their old arbiter.
              </div>

              {/* Success notification */}
              {adminSuccessTx && (
                <div className="p-4 rounded-xl bg-emerald-950/40 border border-emerald-800/60 text-emerald-300 flex items-start gap-3">
                  <CheckCircle2 className="w-5 h-5 shrink-0 mt-0.5 text-emerald-400" />
                  <div className="space-y-1">
                    <p className="text-sm font-semibold">Trust authority updated successfully!</p>
                    <a
                      href={explorerTx(adminSuccessTx)}
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs text-emerald-400 underline hover:text-emerald-300 flex items-center gap-1"
                    >
                      View on Solana Explorer <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>
                </div>
              )}

              {/* Error notification */}
              {adminError && (
                <div className="p-4 rounded-xl bg-red-950/40 border border-red-800/60 text-red-300 flex items-start gap-3">
                  <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5 text-red-400" />
                  <div>
                    <p className="text-sm font-semibold">Action failed</p>
                    <p className="text-xs text-red-400 mt-0.5">{adminError}</p>
                  </div>
                </div>
              )}

              {/* Set Trust Authority Form */}
              <div className="pt-2 border-t border-gray-800/80 space-y-4">
                <h3 className="text-sm font-semibold text-gray-200">Change Trust Authority</h3>

                {!isAdmin && config && (
                  <div className="p-3 bg-amber-950/20 border border-amber-900/40 rounded-lg text-xs text-amber-300 flex items-center gap-2">
                    <Lock className="w-4 h-4 shrink-0" />
                    Only the admin wallet ({truncateAddress(config.admin)}) can sign. Switch Phantom
                    to that account.
                  </div>
                )}

                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                  <div className="flex-1">
                    <input
                      type="text"
                      value={newTrustAuthInput}
                      onChange={(e) => setNewTrustAuthInput(e.target.value)}
                      disabled={!isAdmin || isSubmittingAuth}
                      placeholder="New trust authority base58 public key..."
                      className="w-full px-4 py-2.5 bg-gray-950 border border-gray-800 rounded-lg text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:border-purple-500 disabled:opacity-50 font-mono"
                    />
                  </div>
                  <Button
                    variant="primary"
                    onClick={() => setAuthModalOpen(true)}
                    disabled={!isAdmin || !isInputValidPubkey || isSubmittingAuth}
                    className="shrink-0"
                  >
                    {isSubmittingAuth ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Setting in Phantom...
                      </>
                    ) : (
                      'Set trust authority'
                    )}
                  </Button>
                </div>
              </div>
            </Card>
          </section>
        )}

        {/* ========================================================================= */}
        {/* BLOCK B: ARBITER (Disputed Deals Resolution)                             */}
        {/* Rendered ONLY on view === 'arbiter'                                      */}
        {/* ========================================================================= */}
        {view === 'arbiter' && (
          <section className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-purple-500"></span>
                <h2 className="text-lg font-semibold text-white">Disputed deals</h2>
                <span className="text-xs px-2 py-0.5 rounded-full bg-gray-800 text-gray-300 font-mono">
                  {disputedDeals.length}
                </span>
              </div>
            </div>

            {/* Arbiter success notification */}
            {resolveSuccessTx && (
              <div className="p-4 rounded-xl bg-emerald-950/40 border border-emerald-800/60 text-emerald-300 flex items-start gap-3">
                <CheckCircle2 className="w-5 h-5 shrink-0 mt-0.5 text-emerald-400" />
                <div className="space-y-1">
                  <p className="text-sm font-semibold">
                    Dispute resolved successfully ({resolveSuccessTx.action})!
                  </p>
                  {resolveSuccessTx.sig ? (
                    <a
                      href={explorerTx(resolveSuccessTx.sig)}
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs text-emerald-400 underline hover:text-emerald-300 flex items-center gap-1"
                    >
                      View on Solana Explorer <ExternalLink className="w-3 h-3" />
                    </a>
                  ) : (
                    <p className="text-xs text-emerald-400">Deal updated.</p>
                  )}
                </div>
              </div>
            )}

            {/* Arbiter error notification */}
            {resolveError && (
              <div className="p-4 rounded-xl bg-red-950/40 border border-red-800/60 text-red-300 flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5 text-red-400" />
                <div>
                  <p className="text-sm font-semibold">Resolution failed</p>
                  <p className="text-xs text-red-400 mt-0.5">{resolveError}</p>
                </div>
              </div>
            )}

            {/* Deals list */}
            {dealsLoading && disputedDeals.length === 0 ? (
              <div className="p-12 text-center text-gray-400 flex flex-col items-center gap-3">
                <Loader2 className="w-8 h-8 text-purple-400 animate-spin" />
                <p className="text-sm">Loading disputed deals and arbiters...</p>
              </div>
            ) : disputedDeals.length === 0 ? (
              <Card className="p-12 text-center text-gray-500 border-gray-800/80 bg-gray-900/50">
                <Shield className="w-10 h-10 mx-auto text-gray-600 mb-3" />
                <p className="text-base font-medium text-gray-300">No Disputed Deals</p>
                <p className="text-xs text-gray-500 mt-1 max-w-sm mx-auto">
                  There are currently no active deals with disputed tasks on-chain.
                </p>
              </Card>
            ) : (
              <div className="grid grid-cols-1 gap-6">
                {disputedDeals.map((deal) => {
                  const chainInfo = getChainInfo(deal.id);
                  const disputeSig = chainInfo?.sigs?.find(
                    (s) => s.step === 'dispute' || s.step === 'complete'
                  );
                  const dealArbiter = dealTrustAuthorities[deal.id] || config?.trustAuthority || '';
                  const isDealArbiter = Boolean(
                    walletAddress &&
                      dealArbiter &&
                      walletAddress.toLowerCase() === dealArbiter.toLowerCase()
                  );

                  return (
                    <Card key={deal.id} className="p-6 border-gray-800 bg-gray-900/90 space-y-6">
                      {/* Deal Header */}
                      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-gray-800/80 pb-4">
                        <div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <h3 className="text-lg font-bold text-white">
                              {deal.tasks[0]?.meta?.title || 'Untitled Deal'}
                            </h3>
                            <span className="text-xs px-2.5 py-0.5 rounded bg-red-950/80 border border-red-800 text-red-300 font-semibold">
                              Disputed
                            </span>
                          </div>
                          <div className="flex items-center gap-3 text-xs text-gray-400 mt-1 flex-wrap">
                            <span>
                              Deal ID: <span className="font-mono text-gray-300">{deal.id}</span>
                            </span>
                            <span>&bull;</span>
                            <Link
                              to={`/deal/${deal.id}`}
                              className="text-purple-400 hover:text-purple-300 underline flex items-center gap-1"
                            >
                              Open Deal Page <ExternalLink className="w-3 h-3" />
                            </Link>
                            {disputeSig && (
                              <>
                                <span>&bull;</span>
                                <a
                                  href={explorerTx(disputeSig.sig)}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="text-purple-400 hover:text-purple-300 underline flex items-center gap-1"
                                >
                                  Dispute Tx <ExternalLink className="w-3 h-3" />
                                </a>
                              </>
                            )}
                          </div>
                        </div>

                        <div className="text-right">
                          <div className="text-xs text-gray-500 uppercase font-semibold">
                            Escrow Total
                          </div>
                          <div className="text-xl font-bold text-white font-mono">
                            {dealTotal(deal)} USDC
                          </div>
                        </div>
                      </div>

                      {/* Parties Grid (Customer, Contractor, Deal Arbiter) */}
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
                        <div className="p-3 bg-gray-950/60 border border-gray-800/60 rounded-lg">
                          <span className="text-gray-500 uppercase font-semibold block mb-1">
                            Customer
                          </span>
                          <div className="flex items-center justify-between">
                            <span className="font-mono text-gray-200">
                              {deal.customer ? truncateAddress(deal.customer, 6) : 'None'}
                            </span>
                            {deal.customer && (
                              <a
                                href={explorerAddr(deal.customer)}
                                target="_blank"
                                rel="noreferrer"
                                className="text-gray-400 hover:text-white"
                              >
                                <ExternalLink className="w-3 h-3" />
                              </a>
                            )}
                          </div>
                        </div>

                        <div className="p-3 bg-gray-950/60 border border-gray-800/60 rounded-lg">
                          <span className="text-gray-500 uppercase font-semibold block mb-1">
                            Contractor
                          </span>
                          <div className="flex items-center justify-between">
                            <span className="font-mono text-gray-200">
                              {deal.contractor ? truncateAddress(deal.contractor, 6) : 'None'}
                            </span>
                            {deal.contractor && (
                              <a
                                href={explorerAddr(deal.contractor)}
                                target="_blank"
                                rel="noreferrer"
                                className="text-gray-400 hover:text-white"
                              >
                                <ExternalLink className="w-3 h-3" />
                              </a>
                            )}
                          </div>
                        </div>

                        <div className="p-3 bg-gray-950/60 border border-gray-800/60 rounded-lg">
                          <span className="text-gray-500 uppercase font-semibold block mb-1">
                            Arbiter for this deal
                          </span>
                          <div className="flex items-center justify-between">
                            <span className="font-mono text-purple-300">
                              {dealArbiter ? truncateAddress(dealArbiter, 6) : 'Loading...'}
                            </span>
                            {dealArbiter && (
                              <a
                                href={explorerAddr(dealArbiter)}
                                target="_blank"
                                rel="noreferrer"
                                className="text-gray-400 hover:text-white"
                              >
                                <ExternalLink className="w-3 h-3" />
                              </a>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Disputed Tasks */}
                      <div className="space-y-3">
                        <div className="text-xs text-gray-400 font-semibold uppercase tracking-wider">
                          Disputed Tasks
                        </div>

                        {!isDealArbiter && (
                          <div className="p-3 bg-amber-950/20 border border-amber-900/40 rounded-lg text-xs text-amber-300 flex items-center gap-2">
                            <Lock className="w-3.5 h-3.5 shrink-0" />
                            Only the arbiter of this deal ({truncateAddress(dealArbiter)}) can sign. Switch Phantom to that account.
                          </div>
                        )}

                        {deal.tasks
                          ?.map((task, idx) => ({ task, idx }))
                          .filter(({ task }) => task.status === 'Disputed')
                          .map(({ task, idx }) => (
                            <div
                              key={idx}
                              className="p-4 bg-gray-950/80 border border-red-900/30 rounded-xl flex flex-col md:flex-row md:items-center justify-between gap-4"
                            >
                              <div className="space-y-1">
                                <div className="flex items-center gap-2">
                                  <span className="font-mono text-xs px-2 py-0.5 rounded bg-gray-800 text-gray-300">
                                    Task #{idx}
                                  </span>
                                  <h4 className="font-semibold text-white text-sm">
                                    {task.meta?.title || `Task #${idx}`}
                                  </h4>
                                </div>
                                <p className="text-xs text-gray-400">{task.amount} USDC in escrow</p>
                              </div>

                              <div className="flex items-center gap-3">
                                <Button
                                  variant="outline"
                                  onClick={() =>
                                    setResolveModal({
                                      deal,
                                      taskIndex: idx,
                                      customerWins: true,
                                    })
                                  }
                                  disabled={!isDealArbiter || isSubmittingResolve}
                                  className="text-xs border-amber-600/40 text-amber-300 hover:bg-amber-950/30"
                                >
                                  Refund customer
                                </Button>

                                <Button
                                  variant="primary"
                                  onClick={() =>
                                    setResolveModal({
                                      deal,
                                      taskIndex: idx,
                                      customerWins: false,
                                    })
                                  }
                                  disabled={!isDealArbiter || isSubmittingResolve}
                                  className="text-xs bg-emerald-600 hover:bg-emerald-500 text-white"
                                >
                                  Pay contractor
                                </Button>
                              </div>
                            </div>
                          ))}
                      </div>
                    </Card>
                  );
                })}
              </div>
            )}
          </section>
        )}

        {/* ========================================================================= */}
        {/* CONFIRMATION MODAL: SET TRUST AUTHORITY (Admin view only)               */}
        {/* ========================================================================= */}
        {view === 'admin' && authModalOpen && (
          <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
            <Card className="max-w-md w-full p-6 space-y-6 border-gray-800 bg-gray-900 shadow-2xl">
              <div className="flex items-start gap-3">
                <div className="p-2 rounded-lg bg-amber-950/50 border border-amber-800/60 text-amber-400">
                  <AlertTriangle className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-white">Change Trust Authority</h3>
                  <p className="text-xs text-gray-400 mt-1">
                    Are you sure you want to update the protocol trust authority?
                  </p>
                </div>
              </div>

              <div className="space-y-3 bg-gray-950 p-4 rounded-lg border border-gray-800 text-xs font-mono">
                <div>
                  <span className="text-gray-500 block uppercase">Current:</span>
                  <span className="text-gray-300 break-all">{config?.trustAuthority}</span>
                </div>
                <div className="flex justify-center text-purple-400">
                  <ArrowRight className="w-4 h-4 rotate-90 sm:rotate-0" />
                </div>
                <div>
                  <span className="text-gray-500 block uppercase">New:</span>
                  <span className="text-purple-300 break-all">{newTrustAuthInput.trim()}</span>
                </div>
              </div>

              <div className="text-xs text-amber-300/90 bg-amber-950/20 border border-amber-900/40 p-3 rounded-lg">
                &bull; Deals created before this change keep their old arbiter.
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <Button
                  variant="outline"
                  onClick={() => setAuthModalOpen(false)}
                  disabled={isSubmittingAuth}
                  className="text-xs"
                >
                  Cancel
                </Button>
                <Button
                  variant="primary"
                  onClick={handleSetTrustAuth}
                  disabled={isSubmittingAuth}
                  className="text-xs"
                >
                  {isSubmittingAuth ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      Signing in Phantom...
                    </>
                  ) : (
                    'Confirm & Sign'
                  )}
                </Button>
              </div>
            </Card>
          </div>
        )}

        {/* ========================================================================= */}
        {/* CONFIRMATION MODAL: RESOLVE DISPUTE (Arbiter view only)                 */}
        {/* ========================================================================= */}
        {view === 'arbiter' && resolveModal && (
          <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
            <Card className="max-w-md w-full p-6 space-y-6 border-gray-800 bg-gray-900 shadow-2xl">
              <div className="flex items-start gap-3">
                <div className="p-2 rounded-lg bg-purple-950/50 border border-purple-800/60 text-purple-400">
                  <Shield className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-white">Confirm Dispute Resolution</h3>
                  <p className="text-xs text-gray-400 mt-1">
                    Are you sure? This action is final and moves locked escrow funds on-chain.
                  </p>
                </div>
              </div>

              <div className="space-y-3 bg-gray-950 p-4 rounded-lg border border-gray-800 text-xs">
                <div className="flex justify-between">
                  <span className="text-gray-500">Deal:</span>
                  <span className="font-semibold text-white">
                    {resolveModal.deal.tasks[0]?.meta?.title || resolveModal.deal.id}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Task Index:</span>
                  <span className="font-mono text-gray-200">#{resolveModal.taskIndex}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Decision:</span>
                  <span
                    className={`font-bold ${
                      resolveModal.customerWins ? 'text-amber-400' : 'text-emerald-400'
                    }`}
                  >
                    {resolveModal.customerWins ? 'Refund Customer' : 'Pay Contractor'}
                  </span>
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <Button
                  variant="outline"
                  onClick={() => setResolveModal(null)}
                  disabled={isSubmittingResolve}
                  className="text-xs"
                >
                  Cancel
                </Button>
                <Button
                  variant={resolveModal.customerWins ? 'secondary' : 'primary'}
                  onClick={handleResolveDispute}
                  disabled={isSubmittingResolve}
                  className="text-xs"
                >
                  {isSubmittingResolve ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      Resolving in Phantom...
                    </>
                  ) : (
                    'Confirm & Resolve'
                  )}
                </Button>
              </div>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
};
