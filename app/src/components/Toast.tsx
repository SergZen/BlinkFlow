import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { AlertCircle, CheckCircle2, Info, X, ExternalLink, Copy, Check } from 'lucide-react';
import { explorerTx } from '../lib/client/chainClient';
import { friendlyError, getActionErrorMessage } from '../lib/errors';

export interface ToastOpts {
  txSig?: string;
  details?: string;
  action?: {
    label: string;
    onClick: () => void;
  };
}

export type ToastOptsArg = ToastOpts | string;

export function normalizeOpts(opts?: ToastOptsArg): ToastOpts | undefined {
  if (!opts) return undefined;
  if (typeof opts === 'string') return { txSig: opts };
  return opts;
}

export type ToastType = 'success' | 'error' | 'info';

export interface ToastItem {
  id: string;
  type: ToastType;
  message: string;
  opts?: ToastOpts;
}

interface ToastContextValue {
  success: (message: string, opts?: ToastOptsArg) => void;
  error: (message: string, opts?: ToastOptsArg) => void;
  info: (message: string, opts?: ToastOptsArg) => void;
  dismiss: (id: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export const useToast = () => {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
};

export function notifyActionError(
  toast: { error: (msg: string, opts?: ToastOptsArg) => void; info: (msg: string, opts?: ToastOptsArg) => void },
  err: unknown,
  onRetry?: () => void
) {
  console.error('[Action error]', err);
  const displayedText = getActionErrorMessage(err);
  const raw = err instanceof Error ? (err.stack || err.message) : String(err);
  const logsArr = (err as any)?.logs ?? (err as any)?.transactionLogs;
  const logs = Array.isArray(logsArr) ? '\n\nLogs:\n' + logsArr.join('\n') : '';
  const details = raw + logs;

  if (displayedText.startsWith('You cancelled the request in Phantom')) {
    toast.info(displayedText);
  } else {
    toast.error(displayedText, {
      details,
      action: onRetry ? { label: 'Try again', onClick: onRetry } : undefined,
    });
  }
}

const ToastElement: React.FC<{ toast: ToastItem; onDismiss: (id: string) => void }> = ({
  toast,
  onDismiss,
}) => {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (toast.type === 'error') return; // Errors stay until closed
    const duration = toast.type === 'success' ? 6000 : 4000;
    const timer = setTimeout(() => {
      onDismiss(toast.id);
    }, duration);
    return () => clearTimeout(timer);
  }, [toast.id, toast.type, onDismiss]);

  const handleCopyDetails = async () => {
    if (!toast.opts?.details) return;
    try {
      await navigator.clipboard.writeText(toast.opts.details);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (e) {
      console.warn('Failed to copy error details to clipboard', e);
    }
  };

  const getStyle = () => {
    switch (toast.type) {
      case 'error':
        return {
          bg: 'bg-gray-900/95 border-red-500/40 text-red-100 shadow-red-950/30',
          icon: <AlertCircle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />,
        };
      case 'success':
        return {
          bg: 'bg-gray-900/95 border-green-500/40 text-green-100 shadow-green-950/30',
          icon: <CheckCircle2 className="w-5 h-5 text-green-400 shrink-0 mt-0.5" />,
        };
      case 'info':
      default:
        return {
          bg: 'bg-gray-900/95 border-gray-700 text-gray-100 shadow-black/40',
          icon: <Info className="w-5 h-5 text-purple-400 shrink-0 mt-0.5" />,
        };
    }
  };

  const style = getStyle();

  return (
    <div
      role={toast.type === 'error' ? 'alert' : 'status'}
      className={`pointer-events-auto w-full p-4 rounded-xl border shadow-2xl backdrop-blur-md transition-all duration-300 animate-in slide-in-from-top-4 flex items-start gap-3 ${style.bg}`}
    >
      {style.icon}
      <div className="flex-1 min-w-0 pt-0.5 text-sm">
        <p className="font-medium text-gray-100 leading-snug break-words">{toast.message}</p>

        {toast.type === 'success' && toast.opts?.txSig && (
          <div className="mt-2">
            <a
              href={explorerTx(toast.opts.txSig)}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs text-green-400 hover:text-green-300 font-medium underline"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              View transaction
            </a>
          </div>
        )}

        {toast.type === 'error' && (
          <div className="mt-2.5 flex flex-wrap items-center gap-2">
            {toast.opts?.action && (
              <button
                type="button"
                onClick={() => {
                  onDismiss(toast.id);
                  toast.opts?.action?.onClick();
                }}
                className="inline-flex items-center text-xs px-3 py-1 rounded bg-red-600 hover:bg-red-500 text-white font-medium transition-colors shadow-sm"
              >
                {toast.opts.action.label}
              </button>
            )}
            {toast.opts?.details && (
              <button
                type="button"
                onClick={handleCopyDetails}
                className="inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded bg-gray-800 hover:bg-gray-700 text-gray-300 border border-gray-700 transition-colors"
              >
                {copied ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-green-400" />
                    Copied!
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    Copy details
                  </>
                )}
              </button>
            )}
          </div>
        )}
      </div>
      <button
        type="button"
        onClick={() => onDismiss(toast.id)}
        aria-label="Close notification"
        className="text-gray-400 hover:text-white p-1 rounded-md transition-colors shrink-0 -mr-1 -mt-1"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
};

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const addToast = useCallback((type: ToastType, message: string, opts?: ToastOptsArg) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const item: ToastItem = { id, type, message, opts: normalizeOpts(opts) };
    setToasts((prev) => [item, ...prev].slice(0, 3));
  }, []);

  const success = useCallback((message: string, opts?: ToastOptsArg) => {
    addToast('success', message, opts);
  }, [addToast]);

  const error = useCallback((message: string, opts?: ToastOptsArg) => {
    addToast('error', message, opts);
  }, [addToast]);

  const info = useCallback((message: string, opts?: ToastOptsArg) => {
    addToast('info', message, opts);
  }, [addToast]);

  return (
    <ToastContext.Provider value={{ success, error, info, dismiss }}>
      {children}
      <div className="fixed top-4 right-4 left-4 sm:left-auto z-[100] flex flex-col gap-2 pointer-events-none max-w-sm sm:w-96">
        {toasts.map((t) => (
          <ToastElement key={t.id} toast={t} onDismiss={dismiss} />
        ))}
      </div>
    </ToastContext.Provider>
  );
};
