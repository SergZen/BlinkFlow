import React, { useState, useEffect } from 'react';
import { Loader2, ExternalLink, X } from 'lucide-react';
import { subscribeTxProgress, getTxProgress, cancelPendingTx, explorerTx, type TxProgress, type TxStage } from '../lib/client/chainClient';

export function useTxBarVisible(): boolean {
  const [visible, setVisible] = useState(() => getTxProgress().stage !== 'idle');
  useEffect(() => subscribeTxProgress((p) => setVisible(p.stage !== 'idle')), []);
  return visible;
}

const STEPS: { stage: TxStage; label: string }[] = [
  { stage: 'preparing', label: 'Checking accounts' },
  { stage: 'waiting_signature', label: 'Waiting for signature in your wallet' },
  { stage: 'sending', label: 'Sending' },
  { stage: 'confirming', label: 'Waiting for network confirmation' },
];

const STAGE_ORDER: Record<TxStage, number> = { idle: -1, preparing: 0, waiting_signature: 1, sending: 2, confirming: 3 };

export const TxStatusBar: React.FC = () => {
  const [progress, setProgress] = useState<TxProgress>({ stage: 'idle', startedAt: 0 });
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => subscribeTxProgress((p) => {
    setProgress(p);
    if (p.stage !== 'idle') setElapsed(Math.max(0, Math.floor((Date.now() - p.startedAt) / 1000)));
  }), []);

  useEffect(() => {
    if (progress.stage !== 'waiting_signature') return;
    const timer = setInterval(() => setElapsed(Math.max(0, Math.floor((Date.now() - progress.startedAt) / 1000))), 1000);
    return () => clearInterval(timer);
  }, [progress.stage, progress.startedAt]);

  if (progress.stage === 'idle') return null;
  const currentIndex = STAGE_ORDER[progress.stage];

  return (
    <div role="status" aria-live="polite" className="fixed bottom-0 inset-x-0 z-[70] p-3 sm:p-4 bg-gray-900/95 border-t border-purple-500/30 backdrop-blur-md shadow-2xl text-xs sm:text-sm animate-in slide-in-from-bottom duration-200">
      <div className="max-w-4xl mx-auto flex flex-col gap-2.5">
        <div className="flex flex-wrap items-center justify-between gap-1 sm:gap-2 text-xs">
          {STEPS.map((step, idx) => {
            const isCurrent = idx === currentIndex;
            const isDone = idx < currentIndex;
            return (
              <React.Fragment key={step.stage}>
                <div className={`flex items-center gap-1.5 transition-colors ${isCurrent ? 'text-purple-300 font-semibold' : isDone ? 'text-gray-400' : 'text-gray-600'}`}>
                  <span className={`w-2 h-2 rounded-full shrink-0 ${isCurrent ? 'bg-purple-400 animate-pulse ring-2 ring-purple-400/30' : isDone ? 'bg-green-500/80' : 'bg-gray-700'}`} />
                  <span>{step.label}</span>
                </div>
                {idx < STEPS.length - 1 && <span className="hidden sm:inline text-gray-700">→</span>}
              </React.Fragment>
            );
          })}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-gray-800/60 text-xs">
          <div className="flex items-center gap-2 text-gray-300 min-w-0">
            <Loader2 className="w-3.5 h-3.5 animate-spin text-purple-400 shrink-0" />
            {progress.stage === 'waiting_signature' && (
              <span className="truncate">
                Waiting for signature ({elapsed}s). <span className="text-gray-400 hidden sm:inline">The wallet window may be hidden behind another window.</span>
              </span>
            )}
            {progress.stage === 'confirming' && (
              <span>
                Transaction submitted.{' '}
                {progress.sig && (
                  <a href={explorerTx(progress.sig)} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-purple-400 hover:text-purple-300 underline font-medium ml-1">
                    View on Solana Explorer <ExternalLink className="w-3 h-3" />
                  </a>
                )}
              </span>
            )}
            {progress.stage === 'preparing' && <span>Preparing transaction and recent blockhash…</span>}
            {progress.stage === 'sending' && <span>Broadcasting to Solana cluster…</span>}
          </div>

          {progress.stage === 'waiting_signature' && (
            <button type="button" onClick={cancelPendingTx} className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-gray-800 hover:bg-gray-700 text-gray-200 border border-gray-700 font-medium transition-colors shrink-0 ml-auto cursor-pointer">
              <X className="w-3 h-3" />
              Cancel
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
