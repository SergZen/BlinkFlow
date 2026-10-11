import { ReactNode, useState, useEffect } from 'react';
import { useRole } from '../RoleContext';
import { NavLink, Link } from 'react-router-dom';
import { Zap, Home, ScrollText, ShieldCheck, Shield, Menu, X, Send, Sliders, Scale } from 'lucide-react';
import { WalletMultiButton, useWalletModal } from '@solana/wallet-adapter-react-ui';
import { useWallet } from '@solana/wallet-adapter-react';
import { NetworkControls } from './NetworkControls';
import { BalanceDisplay } from './BalanceDisplay';
import { FaucetButton } from './FaucetButton';
import { useNetwork } from '../NetworkContext';
import { useOpsAccess } from '../hooks/useOpsAccess';

export const Layout = ({ children }: { children: ReactNode }) => {
  const { role, setRole } = useRole();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const { connected } = useWallet();
  const { isTestMode } = useNetwork();
  const [showToast, setShowToast] = useState(false);
  const { canSeeOps } = useOpsAccess();

  useEffect(() => {
    if (connected) {
      setShowToast(true);
      const timer = setTimeout(() => setShowToast(false), 3000);
      return () => clearTimeout(timer);
    }
  }, [connected]);

  return (
    <div className="h-screen bg-gray-950 text-gray-100 flex flex-col md:flex-row font-sans selection:bg-purple-500/30 overflow-hidden relative">
      
      {showToast && (
        <div className="fixed bottom-4 right-4 z-[100] animate-in slide-in-from-bottom-5">
          <div className="bg-gray-800 text-white px-4 py-3 rounded-lg shadow-xl border border-gray-700 flex items-center gap-2">
            <Zap className={`w-4 h-4 ${isTestMode ? 'text-gray-400' : 'text-orange-400'}`} />
            <span className="font-medium">Connected &middot; Devnet</span>
          </div>
        </div>
      )}
      
      {/* Mobile Topbar */}
      <div className="md:hidden flex items-center justify-between p-4 bg-gray-900 border-b border-gray-800 shrink-0 z-40 relative">
        <Link to="/" className="flex items-center gap-2">
          <div className="relative bg-gradient-to-br from-purple-600 to-blue-600 rounded-lg shadow-lg shadow-purple-500/20 flex items-center justify-center w-8 h-8">
            <Shield className="w-5 h-5 text-white absolute" strokeWidth={1.5} />
            <Zap className="w-3 h-3 text-white absolute fill-white" />
          </div>
          <span className="font-bold text-xl tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-white to-gray-400">BlinkFlow</span>
        </Link>
        <button onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)} className="text-gray-400 hover:text-white p-1 z-50 relative">
          {isMobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
        </button>
      </div>

      {/* Mobile Menu Overlay */}
      {isMobileMenuOpen && (
        <div 
          className="fixed inset-0 bg-black/50 z-40 md:hidden" 
          onClick={() => setIsMobileMenuOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside className={`fixed inset-y-0 left-0 transform ${isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full'} md:relative md:translate-x-0 transition duration-200 ease-in-out w-64 shrink-0 bg-gray-900 border-r border-gray-800 p-4 flex flex-col z-50 md:z-10 md:overflow-y-auto`}>
        <Link to="/" className="flex items-center gap-2 mb-8 px-2 mt-2 hover:opacity-80 transition-opacity">
          <div className="relative bg-gradient-to-br from-purple-600 to-blue-600 rounded-lg shadow-lg shadow-purple-500/20 flex items-center justify-center w-9 h-9">
            <Shield className="w-6 h-6 text-white absolute" strokeWidth={1.5} />
            <Zap className="w-3.5 h-3.5 text-white absolute fill-white" />
          </div>
          <span className="font-bold text-xl tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-white to-gray-400">BlinkFlow</span>
        </Link>

        <nav className="flex-1 space-y-1.5">
          <NavLink to="/" onClick={() => setIsMobileMenuOpen(false)} className={({isActive}) => `flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all font-medium text-sm ${isActive ? 'bg-gray-800 text-white shadow-sm' : 'text-gray-400 hover:text-white hover:bg-gray-800/50'}`}>
            <Home className="w-4 h-4" />
            Dashboard
          </NavLink>
          <NavLink to="/profile" onClick={() => setIsMobileMenuOpen(false)} className={({isActive}) => `flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all font-medium text-sm ${isActive ? 'bg-gray-800 text-white shadow-sm' : 'text-gray-400 hover:text-white hover:bg-gray-800/50'}`}>
            <ShieldCheck className="w-4 h-4" />
            Reputation Profile
          </NavLink>
          <NavLink to="/log" onClick={() => setIsMobileMenuOpen(false)} className={({isActive}) => `flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all font-medium text-sm ${isActive ? 'bg-gray-800 text-white shadow-sm' : 'text-gray-400 hover:text-white hover:bg-gray-800/50'}`}>
            <ScrollText className="w-4 h-4" />
            Public Dispute Log
          </NavLink>
          {canSeeOps && (
            <>
              <NavLink to="/ops-k7r2x9" onClick={() => setIsMobileMenuOpen(false)} className={({isActive}) => `flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all font-medium text-sm ${isActive ? 'bg-gray-800 text-white shadow-sm' : 'text-gray-400 hover:text-white hover:bg-gray-800/50'}`}>
                <Sliders className="w-4 h-4" />
                Admin
              </NavLink>
              <NavLink to="/arb-m4q8w3" onClick={() => setIsMobileMenuOpen(false)} className={({isActive}) => `flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all font-medium text-sm ${isActive ? 'bg-gray-800 text-white shadow-sm' : 'text-gray-400 hover:text-white hover:bg-gray-800/50'}`}>
                <Scale className="w-4 h-4" />
                Arbiter
              </NavLink>
            </>
          )}
        </nav>

        {(import.meta.env.VITE_TELEGRAM_BOT_URL || import.meta.env.VITE_TWITTER_URL) && (
          <div className="mt-4 pt-4 border-t border-gray-800 space-y-2">
            {import.meta.env.VITE_TELEGRAM_BOT_URL && (
              <a 
                href={import.meta.env.VITE_TELEGRAM_BOT_URL}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => setIsMobileMenuOpen(false)}
                className="flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg text-sm font-medium text-white bg-gradient-to-r from-purple-600 to-blue-600 hover:opacity-90 transition-opacity w-full"
              >
                <Send className="w-4 h-4" />
                Telegram Bot
              </a>
            )}
            {import.meta.env.VITE_TWITTER_URL && (
              <a
                href={import.meta.env.VITE_TWITTER_URL}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => setIsMobileMenuOpen(false)}
                className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-gray-400 hover:text-white hover:bg-gray-800/50 transition-colors w-full"
              >
                <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                </svg>
                @BlinkFlowApp
              </a>
            )}
          </div>
        )}

        <div className="mt-auto pt-6 pb-2 flex flex-wrap items-center justify-center gap-2 text-xs text-slate-500">
          <Link to="/about" onClick={() => setIsMobileMenuOpen(false)} className="hover:text-slate-300 transition-colors">About</Link>
          <span>&middot;</span>
          <Link to="/terms" onClick={() => setIsMobileMenuOpen(false)} className="hover:text-slate-300 transition-colors">Terms</Link>
          <span>&middot;</span>
          <Link to="/privacy" onClick={() => setIsMobileMenuOpen(false)} className="hover:text-slate-300 transition-colors">Privacy</Link>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-h-0 relative overflow-y-auto">
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-purple-600/5 rounded-full blur-3xl pointer-events-none"></div>
        <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-blue-600/5 rounded-full blur-3xl pointer-events-none"></div>

        {/* Topbar */}
        <header className="min-h-[64px] py-4 md:py-3 border-b border-gray-800/60 bg-gray-900/50 backdrop-blur-md flex flex-col-reverse md:flex-row flex-wrap items-center justify-center md:justify-between px-4 md:px-6 shrink-0 md:sticky md:top-0 z-40 gap-4 md:gap-4">
          <div className="flex w-full md:w-64 bg-gray-950 p-1 rounded-lg border border-gray-800 shadow-inner mb-2 md:mb-0">
            <button
              onClick={() => setRole('contractor')}
              className={`flex-1 text-xs py-1.5 rounded-md transition-all font-medium ${role === 'contractor' ? 'bg-gray-800 text-white shadow-sm' : 'text-gray-500 hover:text-gray-300'}`}
            >
              Contractor
            </button>
            <button
              onClick={() => setRole('customer')}
              className={`flex-1 text-xs py-1.5 rounded-md transition-all font-medium ${role === 'customer' ? 'bg-gray-800 text-white shadow-sm' : 'text-gray-500 hover:text-gray-300'}`}
            >
              Customer
            </button>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-2 md:gap-4 w-full md:w-auto">
            <style>
              {`
                .wallet-adapter-button-trigger {
                  background-color: rgb(3 7 18 / 0.5) !important; /* bg-gray-950/50 */
                  border: 1px solid rgb(31 41 55) !important; /* border-gray-800 */
                  border-radius: 9999px !important;
                  height: 36px !important;
                  padding: 0 12px !important;
                  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace !important;
                  font-size: 0.875rem !important;
                  font-weight: 500 !important;
                  color: rgb(209 213 219) !important; /* text-gray-300 */
                  transition: all 0.2s !important;
                }
                .wallet-adapter-button-trigger:hover {
                  border-color: rgb(55 65 81) !important; /* hover:border-gray-700 */
                }
                .wallet-adapter-button-trigger .wallet-adapter-button-start-icon {
                  margin-right: 8px;
                }
              `}
            </style>
            <FaucetButton />
            <BalanceDisplay />
            <NetworkControls />
            <WalletMultiButton />
          </div>
        </header>

        {/* Page Content */}
        <div className="flex-1 p-4 sm:p-6">
          <div className="max-w-5xl mx-auto pb-12">
            {children}
          </div>
        </div>
      </main>
    </div>
  );
};
