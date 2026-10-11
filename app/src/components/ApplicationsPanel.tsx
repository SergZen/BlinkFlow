import { useState, useEffect, useCallback } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { useWalletModal } from '@solana/wallet-adapter-react-ui';
import { useSolBalance } from '../hooks/useSolBalance';
import { useNetwork } from '../NetworkContext';
import { Card } from './Card';
import { Button } from './Button';
import { truncateAddress } from '../lib/utils';
import { client } from '../lib/client';
import { listApplications, applyToDeal, withdrawApplication, type Application } from '../lib/client/applications';
import type { Deal } from '../lib/types';
import type { ChainInfo } from '../lib/client/chainClient';
import type { Role } from '../RoleContext';
import { Loader2 } from 'lucide-react';

interface ApplicationsPanelProps {
  deal: Deal;
  chainInfo: ChainInfo;
  role: Role;
}

export const ApplicationsPanel = ({ deal, chainInfo, role }: ApplicationsPanelProps) => {
  const { connected, publicKey } = useWallet();
  const { setVisible } = useWalletModal();
  const { solBalance } = useSolBalance();
  const { isTestMode } = useNetwork();
  const MIN_SOL_REQUIRED = 0.01;
  const hasEnoughSol = solBalance === null || solBalance >= MIN_SOL_REQUIRED;

  const [apps, setApps] = useState<Application[]>([]);
  const [note, setNote] = useState('');
  const [actionLoading, setActionLoading] = useState(false);
  const [actionError, setActionError] = useState('');
  const [assigningWallet, setAssigningWallet] = useState<string | null>(null);
  const [assignError, setAssignError] = useState('');
  const [declinedTick, setDeclinedTick] = useState(0);

  const me = publicKey?.toBase58();

  const load = useCallback(async () => {
    try {
      const list = await listApplications(deal.id);
      setApps(list);
    } catch {
      // ignore failures
    }
  }, [deal.id]);

  useEffect(() => {
    load();
    const timer = setInterval(load, 4000);
    return () => clearInterval(timer);
  }, [load]);

  if (deal.contractor || deal.tasks?.[0]?.status !== 'CustomerCreated') {
    return null;
  }

  const renderSolWarning = () => {
    if (!connected || hasEnoughSol) return null;
    return (
      <div className="bg-orange-500/10 border border-orange-500/20 rounded-lg p-3 text-xs text-orange-400 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 mt-3">
        <span>You need about 0.01 SOL to cover network fees and account rent.</span>
        {isTestMode && (
          <a href="https://faucet.solana.com" target="_blank" rel="noopener noreferrer" className="text-orange-300 font-medium hover:underline shrink-0">
            Get devnet SOL →
          </a>
        )}
      </div>
    );
  };

  const handleApply = async () => {
    if (!me) return;
    setActionError('');
    setActionLoading(true);
    try {
      await applyToDeal(deal.id, me, note.trim());
      setNote('');
      await load();
    } catch (err: any) {
      setActionError(err.message || 'Could not send the application');
    } finally {
      setActionLoading(false);
    }
  };

  const handleWithdraw = async () => {
    if (!me) return;
    setActionError('');
    setActionLoading(true);
    try {
      await withdrawApplication(deal.id, me);
      await load();
    } catch (err: any) {
      setActionError(err.message || 'Failed to withdraw application');
    } finally {
      setActionLoading(false);
    }
  };

  const handleAccept = async () => {
    if (!me) return;
    setActionError('');
    setActionLoading(true);
    try {
      await client.acceptDeal(deal.id, me);
      await load();
    } catch (err: any) {
      setActionError(err.message || 'Failed to accept deal');
    } finally {
      setActionLoading(false);
    }
  };

  const handleDecline = async () => {
    if (!me) return;
    setActionError('');
    setActionLoading(true);
    try {
      const sigsCount = chainInfo.sigs?.length ?? 0;
      try {
        localStorage.setItem(`blinkflow_declined_${deal.id}_${me}`, String(sigsCount));
      } catch {
        // ignore
      }
      setDeclinedTick((t) => t + 1);
      await withdrawApplication(deal.id, me);
      await load();
    } catch (err: any) {
      setActionError(err.message || 'Failed to decline deal');
    } finally {
      setActionLoading(false);
    }
  };

  const handleAssign = async (contractorWallet: string) => {
    setAssignError('');
    setAssigningWallet(contractorWallet);
    try {
      await client.assignContractor(deal.id, contractorWallet);
      await load();
    } catch (err: any) {
      setAssignError(err.message || 'Failed to assign contractor');
    } finally {
      setAssigningWallet(null);
    }
  };

  let storedDeclined: number | null = null;
  if (me) {
    try {
      const raw = localStorage.getItem(`blinkflow_declined_${deal.id}_${me}`);
      if (raw !== null) {
        const parsed = parseInt(raw, 10);
        if (!isNaN(parsed)) storedDeclined = parsed;
      }
    } catch {
      // ignore
    }
  }

  const isDeclined = storedDeclined !== null && (chainInfo.sigs?.length ?? 0) <= storedDeclined;
  const isSelected = !!chainInfo.contractor && me === chainInfo.contractor && !isDeclined;
  const hasApplied = !!me && apps.some((a) => a.wallet === me);

  return (
    <Card className="p-6 border-purple-500/20 bg-purple-500/5">
      {role === 'contractor' && (
        <>
          {!connected || !me ? (
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div>
                <h3 className="text-lg font-medium mb-1">Apply to this deal</h3>
                <p className="text-sm text-gray-400">The customer will pick one contractor from the applicants.</p>
                {chainInfo.contractor ? (
                  <p className="text-xs text-gray-500 mt-1">The customer already picked someone, but may still change their choice.</p>
                ) : null}
              </div>
              <Button onClick={() => setVisible(true)}>Connect Wallet to Apply</Button>
            </div>
          ) : isSelected ? (
            <div>
              <h3 className="text-lg font-medium mb-1">You were selected</h3>
              <p className="text-sm text-gray-400">
                The customer picked you. Accepting starts the work and creates your reputation badge (SBT). You need about 0.01 SOL for fees.
              </p>
              {renderSolWarning()}
              <div className="flex flex-wrap items-center gap-3 mt-4">
                <Button variant="gradient" onClick={handleAccept} disabled={actionLoading || !hasEnoughSol}>
                  {actionLoading ? <Loader2 className="w-4 h-4 mr-2 animate-spin inline" /> : null}
                  Accept & Start
                </Button>
                <div className="flex flex-col items-start">
                  <Button variant="outline" onClick={handleDecline} disabled={actionLoading}>
                    Decline
                  </Button>
                  <p className="text-xs text-gray-500 mt-1">The customer will be able to pick someone else</p>
                </div>
              </div>
              {actionError && <p className="text-red-400 text-xs mt-3">{actionError}</p>}
            </div>
          ) : hasApplied ? (
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div>
                <h3 className="text-lg font-medium mb-1">Application sent</h3>
                <p className="text-sm text-gray-400">Waiting for the customer to choose a contractor.</p>
              </div>
              <div>
                <Button variant="outline" onClick={handleWithdraw} disabled={actionLoading}>
                  {actionLoading ? <Loader2 className="w-4 h-4 mr-2 animate-spin inline" /> : null}
                  Withdraw application
                </Button>
                {actionError && <p className="text-red-400 text-xs mt-2">{actionError}</p>}
              </div>
            </div>
          ) : (
            <div>
              <h3 className="text-lg font-medium mb-1">Apply to this deal</h3>
              <p className="text-sm text-gray-400 mb-2">The customer will pick one contractor from the applicants.</p>
              {isDeclined ? (
                <p className="text-xs text-gray-500 mb-3">You declined. You can apply again.</p>
              ) : chainInfo.contractor ? (
                <p className="text-xs text-gray-500 mb-3">The customer already picked someone, but may still change their choice.</p>
              ) : null}
              <div className="space-y-3">
                <textarea
                  maxLength={140}
                  rows={2}
                  placeholder="Optional: a short message to the customer"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  className="w-full bg-gray-950 border border-gray-800 rounded-lg px-4 py-2.5 focus:outline-none focus:border-purple-500/50 focus:ring-1 focus:ring-purple-500/50 transition-all text-white resize-none text-sm"
                />
                <Button variant="gradient" onClick={handleApply} disabled={actionLoading}>
                  {actionLoading ? <Loader2 className="w-4 h-4 mr-2 animate-spin inline" /> : null}
                  Apply
                </Button>
                {actionError && <p className="text-red-400 text-xs mt-1">{actionError}</p>}
              </div>
            </div>
          )}
        </>
      )}

      {role === 'customer' && (() => {
        const isWrongCustomer = Boolean(connected && me && me !== chainInfo.customer);
        return (
          <div>
            <h3 className="text-lg font-medium mb-1">Applications ({apps.length})</h3>
            {chainInfo.contractor ? (
              apps.some((a) => a.wallet === chainInfo.contractor) ? (
                <p className="text-xs text-gray-400 mb-4">
                  Selected: <span className="font-mono text-gray-300">{truncateAddress(chainInfo.contractor)}</span>. Waiting for them to accept. You can choose another contractor until they accept.
                </p>
              ) : (
                <p className="text-xs text-gray-400 mb-4">
                  Selected: <span className="font-mono text-gray-300">{truncateAddress(chainInfo.contractor)}</span> (not in the applicants list any more). Choose another contractor if they do not respond.
                </p>
              )
            ) : null}

            {isWrongCustomer && (
              <p className="text-sm text-gray-400 mb-3">
                Only the customer wallet ({truncateAddress(chainInfo.customer)}) can do this. Switch Phantom to that account.
              </p>
            )}

            {apps.length === 0 ? (
              <p className="text-sm text-gray-500 italic mt-3">No applications yet. Share the deal link with contractors.</p>
            ) : (
              <div className="space-y-2 mt-3">
                {apps.map((a) => {
                  const isItemChosen = a.wallet === chainInfo.contractor;
                  return (
                    <div key={a.wallet} className="bg-gray-950 border border-gray-800 rounded-lg p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-mono text-sm text-gray-200">{truncateAddress(a.wallet)}</span>
                          <span className="text-xs text-gray-500">{new Date(a.createdAt).toLocaleString()}</span>
                        </div>
                        {a.note && <p className="text-sm text-gray-400 mt-1 break-words">{a.note}</p>}
                      </div>
                      <div className="shrink-0">
                        {isItemChosen ? (
                          <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-green-500/10 text-green-400 border border-green-500/20">
                            Selected
                          </span>
                        ) : !connected ? (
                          <Button variant="outline" onClick={() => setVisible(true)}>
                            Connect Wallet to Choose
                          </Button>
                        ) : isWrongCustomer ? null : (
                          <Button
                            variant="outline"
                            onClick={() => handleAssign(a.wallet)}
                            disabled={assigningWallet === a.wallet || !hasEnoughSol}
                          >
                            {assigningWallet === a.wallet ? <Loader2 className="w-4 h-4 mr-2 animate-spin inline" /> : null}
                            {chainInfo.contractor ? 'Choose instead' : 'Choose'}
                          </Button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
            {!isWrongCustomer && renderSolWarning()}
            {assignError && <p className="text-red-400 text-xs mt-3">{assignError}</p>}
          </div>
        );
      })()}
    </Card>
  );
};
