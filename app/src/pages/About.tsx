import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Shield, Zap, Handshake, Lock, Scale } from 'lucide-react';

export const About = () => {
  useEffect(() => {
    document.title = "BlinkFlow - Trust layer for deals made in chat";
  }, []);

  const botUrl = import.meta.env.VITE_TELEGRAM_BOT_URL;
  const twitterUrl = import.meta.env.VITE_TWITTER_URL;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 to-slate-950 text-gray-100 font-sans flex flex-col items-center">
      <header className="w-full max-w-5xl px-6 py-4 flex items-center justify-between z-10 border-b border-slate-800/50">
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

      <main className="flex-1 w-full max-w-5xl px-6 py-12 relative">
        <div className="absolute top-0 left-0 w-96 h-96 bg-blue-600/10 rounded-full blur-3xl pointer-events-none -translate-x-1/2 -translate-y-1/2" aria-hidden="true"></div>
        <div className="absolute bottom-0 right-0 w-96 h-96 bg-purple-600/10 rounded-full blur-3xl pointer-events-none translate-x-1/2 translate-y-1/2" aria-hidden="true"></div>
        
        <section className="flex flex-col items-center text-center mb-20 z-10 relative">
          <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold tracking-tight mb-6 leading-tight text-white max-w-4xl">
            Trust layer for deals made in chat
          </h1>
          <p className="text-lg md:text-xl text-slate-400 mb-10 max-w-3xl leading-relaxed">
            Freelancers and clients agree anywhere. BlinkFlow locks the payment in a smart contract on Solana and releases it when both sides confirm.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 w-full sm:w-auto justify-center">
            <Link to="/" className="bg-blue-600 hover:bg-blue-700 text-white px-8 py-3.5 rounded-lg font-semibold text-base transition-all shadow-lg hover:shadow-blue-600/25 w-full sm:w-auto">
              Open app
            </Link>
            {botUrl && (
              <a href={botUrl} target="_blank" rel="noopener noreferrer" className="bg-slate-800 hover:bg-slate-700 text-white px-8 py-3.5 rounded-lg font-semibold text-base transition-all border border-slate-700 w-full sm:w-auto">
                Open Telegram bot
              </a>
            )}
          </div>
        </section>

        <section className="mb-20 z-10 relative">
          <h2 className="text-2xl font-bold text-white mb-8 text-center">How it works</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div className="bg-slate-800/30 p-6 rounded-2xl border border-slate-700/50">
              <div className="bg-blue-900/40 p-3 rounded-full w-12 h-12 flex items-center justify-center mb-4">
                <Handshake className="w-6 h-6 text-blue-400" aria-hidden="true" />
              </div>
              <h3 className="text-lg font-semibold text-white mb-3">Agree the deal</h3>
              <p className="text-slate-400 leading-relaxed text-sm">
                Set the task, the amount and the deadline. Share one link in any chat or social network.
              </p>
            </div>
            
            <div className="bg-slate-800/30 p-6 rounded-2xl border border-slate-700/50">
              <div className="bg-purple-900/40 p-3 rounded-full w-12 h-12 flex items-center justify-center mb-4">
                <Lock className="w-6 h-6 text-purple-400" aria-hidden="true" />
              </div>
              <h3 className="text-lg font-semibold text-white mb-3">Lock the funds</h3>
              <p className="text-slate-400 leading-relaxed text-sm">
                The client deposits USDC into an escrow smart contract. The money stays in the contract, not with us.
              </p>
            </div>
            
            <div className="bg-slate-800/30 p-6 rounded-2xl border border-slate-700/50">
              <div className="bg-blue-900/40 p-3 rounded-full w-12 h-12 flex items-center justify-center mb-4">
                <Scale className="w-6 h-6 text-blue-400" aria-hidden="true" />
              </div>
              <h3 className="text-lg font-semibold text-white mb-3">Confirm and release</h3>
              <p className="text-slate-400 leading-relaxed text-sm">
                When the work is accepted, the funds go to the contractor. If the sides disagree, an arbiter decides.
              </p>
            </div>
          </div>
        </section>

        <section className="mb-20 z-10 relative">
          <h2 className="text-2xl font-bold text-white mb-8 text-center">Why BlinkFlow</h2>
          <ul className="max-w-3xl mx-auto space-y-6">
            <li className="flex gap-4 items-start">
              <div className="w-2 h-2 rounded-full bg-blue-500 mt-2 shrink-0"></div>
              <p className="text-slate-300">
                <strong className="text-white">Works with any channel</strong> - agree in any messenger or social network, pay on the BlinkFlow page
              </p>
            </li>
            <li className="flex gap-4 items-start">
              <div className="w-2 h-2 rounded-full bg-purple-500 mt-2 shrink-0"></div>
              <p className="text-slate-300">
                <strong className="text-white">On-chain reputation</strong> - every finished deal builds a soulbound badge (SBT) for both sides
              </p>
            </li>
            <li className="flex gap-4 items-start">
              <div className="w-2 h-2 rounded-full bg-blue-500 mt-2 shrink-0"></div>
              <p className="text-slate-300">
                <strong className="text-white">Clear disputes</strong> - an arbiter rules yes/no on whether the agreed criteria were met
              </p>
            </li>
          </ul>
        </section>

        <section className="mb-20 max-w-3xl mx-auto z-10 relative">
          <div className="bg-orange-500/10 border border-orange-500/20 rounded-xl p-5 text-center">
            <p className="text-orange-200/80 font-medium">
              Hackathon demo. Runs on Solana Devnet with test tokens - no real funds are moved.
            </p>
          </div>
        </section>
        
        <section className="flex justify-center z-10 relative mb-10">
          <Link to="/" className="bg-blue-600 hover:bg-blue-700 text-white px-10 py-4 rounded-lg font-semibold text-lg transition-all shadow-lg hover:shadow-blue-600/25">
            Open app
          </Link>
        </section>
      </main>

      <footer className="w-full border-t border-slate-800/50 py-8 px-6 mt-auto z-10 bg-slate-950/50">
        <div className="max-w-5xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4 text-sm text-slate-500">
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
            <Link to="/terms" className="hover:text-slate-300 transition-colors">Terms</Link>
            <Link to="/privacy" className="hover:text-slate-300 transition-colors">Privacy</Link>
          </div>
        </div>
      </footer>
    </div>
  );
};
