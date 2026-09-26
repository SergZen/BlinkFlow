import { ReactNode } from 'react';
import { useRole } from '../RoleContext';
import { NavLink, Link } from 'react-router-dom';
import { Zap, Wallet, Home, ScrollText, ShieldCheck, Shield } from 'lucide-react';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import { NetworkControls } from './NetworkControls';
import { BalanceDisplay } from './BalanceDisplay';
import { FaucetButton } from './FaucetButton';

export const Layout = ({ children }: { children: ReactNode }) => {
  const { role, setRole } = useRole();

  return (
    <div className="h-screen bg-gray-950 text-gray-100 flex flex-col md:flex-row font-sans selection:bg-purple-500/30 overflow-hidden">
      {/* Sidebar */}
      <aside className="w-full md:w-64 shrink-0 bg-gray-900 border-b md:border-b-0 md:border-r border-gray-800 p-4 flex flex-col z-10 md:overflow-y-auto">
        <Link to="/" className="flex items-center gap-2 mb-8 px-2 mt-2 hover:opacity-80 transition-opacity">
          <div className="relative bg-gradient-to-br from-purple-600 to-blue-600 rounded-lg shadow-lg shadow-purple-500/20 flex items-center justify-center w-9 h-9">
            <Shield className="w-6 h-6 text-white absolute" strokeWidth={1.5} />
            <Zap className="w-3.5 h-3.5 text-white absolute fill-white" />
          </div>
          <span className="font-bold text-xl tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-white to-gray-400">BlinkFlow</span>
        </Link>

        <nav className="flex-1 space-y-1.5 hidden md:block">
          <NavLink to="/" className={({isActive}) => `flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all font-medium text-sm ${isActive ? 'bg-gray-800 text-white shadow-sm' : 'text-gray-400 hover:text-white hover:bg-gray-800/50'}`}>
            <Home className="w-4 h-4" />
            Dashboard
          </NavLink>
          <NavLink to="/profile" className={({isActive}) => `flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all font-medium text-sm ${isActive ? 'bg-gray-800 text-white shadow-sm' : 'text-gray-400 hover:text-white hover:bg-gray-800/50'}`}>
            <ShieldCheck className="w-4 h-4" />
            Reputation Profile
          </NavLink>
          <NavLink to="/log" className={({isActive}) => `flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all font-medium text-sm ${isActive ? 'bg-gray-800 text-white shadow-sm' : 'text-gray-400 hover:text-white hover:bg-gray-800/50'}`}>
            <ScrollText className="w-4 h-4" />
            Public Dispute Log
          </NavLink>
        </nav>

        {/* Mobile Navigation */}
        <nav className="flex items-center justify-between mt-2 md:hidden">
          <NavLink to="/" className={({isActive}) => `flex flex-col items-center gap-1 px-3 py-2 rounded-lg transition-all font-medium text-[10px] ${isActive ? 'text-white' : 'text-gray-500 hover:text-gray-300'}`}>
            <Home className="w-5 h-5" />
            Dash
          </NavLink>
          <NavLink to="/profile" className={({isActive}) => `flex flex-col items-center gap-1 px-3 py-2 rounded-lg transition-all font-medium text-[10px] ${isActive ? 'text-white' : 'text-gray-500 hover:text-gray-300'}`}>
            <ShieldCheck className="w-5 h-5" />
            Profile
          </NavLink>
          <NavLink to="/log" className={({isActive}) => `flex flex-col items-center gap-1 px-3 py-2 rounded-lg transition-all font-medium text-[10px] ${isActive ? 'text-white' : 'text-gray-500 hover:text-gray-300'}`}>
            <ScrollText className="w-5 h-5" />
            Log
          </NavLink>
        </nav>

        {/* Demo Switcher */}
        <div className="mt-4 md:mt-auto pt-4 md:pt-6 border-t border-gray-800">
          <div className="text-[10px] text-gray-500 mb-2 px-2 uppercase font-bold tracking-widest hidden md:block">Demo Role Switcher</div>
          <div className="flex bg-gray-950 p-1 rounded-lg border border-gray-800 shadow-inner">
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
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-h-0 relative z-0">
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-purple-600/5 rounded-full blur-3xl pointer-events-none"></div>
        <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-blue-600/5 rounded-full blur-3xl pointer-events-none"></div>

        {/* Topbar */}
        <header className="min-h-[64px] py-4 md:py-0 md:h-16 border-b border-gray-800/60 bg-gray-900/50 backdrop-blur-md flex flex-col md:flex-row items-center justify-center md:justify-between px-4 md:px-6 shrink-0 md:sticky md:top-0 z-10 gap-3 md:gap-0">
          <h1 className="text-lg font-semibold tracking-tight text-gray-100 text-center md:text-left">
            {role === 'contractor' ? 'Contractor Dashboard' : 'Customer Dashboard'}
          </h1>
          <div className="flex flex-wrap items-center justify-center gap-2 md:gap-4">
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
        <div className="flex-1 overflow-y-auto p-6 z-0">
          <div className="max-w-5xl mx-auto pb-12">
            {children}
          </div>
        </div>
      </main>
    </div>
  );
};
