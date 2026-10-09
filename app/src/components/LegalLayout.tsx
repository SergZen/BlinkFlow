import { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Shield, Zap } from 'lucide-react';
import { openCookieSettings } from '../lib/consent';

interface LegalLayoutProps {
  title: string;
  updated: string;
  children: ReactNode;
}

export const LegalLayout = ({ title, updated, children }: LegalLayoutProps) => {
  const botUrl = import.meta.env.VITE_TELEGRAM_BOT_URL;
  const twitterUrl = import.meta.env.VITE_TWITTER_URL;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 to-slate-950 text-gray-100 font-sans flex flex-col items-center">
      <header className="w-full max-w-3xl px-6 py-4 flex items-center justify-between z-10 border-b border-slate-800/50">
        <Link to="/about" className="flex items-center gap-2">
          <div className="relative bg-gradient-to-br from-purple-600 to-blue-600 rounded-lg flex items-center justify-center w-8 h-8">
            <Shield className="w-5 h-5 text-white absolute" strokeWidth={1.5} />
            <Zap className="w-3 h-3 text-white absolute fill-white" />
          </div>
          <span className="font-bold text-xl tracking-tight text-white">BlinkFlow</span>
        </Link>
        <Link to="/" className="text-sm font-medium text-slate-400 hover:text-white transition-colors">
          Open app
        </Link>
      </header>

      <main className="flex-1 w-full max-w-3xl px-6 py-12 relative">
        <h1 className="text-3xl font-bold text-white mb-2">{title}</h1>
        <p className="text-slate-400 text-sm mb-10">Last updated: {updated}</p>
        
        <div className="space-y-8 text-slate-300 leading-relaxed text-sm md:text-base">
          {children}
        </div>
      </main>

      <footer className="w-full border-t border-slate-800/50 py-8 px-6 mt-auto z-10 bg-slate-950/50">
        <div className="max-w-3xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4 text-sm text-slate-500">
          <p>© 2026 BlinkFlow</p>
          <div className="flex gap-6 items-center flex-wrap justify-center">
            {twitterUrl && (
              <a href={twitterUrl} target="_blank" rel="noopener noreferrer" className="hover:text-slate-300 transition-colors">
                @BlinkFlowApp
              </a>
            )}
            {botUrl && (
              <a href={botUrl} target="_blank" rel="noopener noreferrer" className="hover:text-slate-300 transition-colors">
                Telegram bot
              </a>
            )}
            <Link to="/about" className="hover:text-slate-300 transition-colors">About</Link>
            <Link to="/terms" className="hover:text-slate-300 transition-colors">Terms</Link>
            <Link to="/privacy" className="hover:text-slate-300 transition-colors">Privacy</Link>
            <button onClick={openCookieSettings} className="hover:text-slate-300 transition-colors">Cookie settings</button>
          </div>
        </div>
      </footer>
    </div>
  );
};
