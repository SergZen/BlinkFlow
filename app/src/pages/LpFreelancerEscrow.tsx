import { Link } from 'react-router-dom';
import { Shield, Zap, CheckCircle2, Lock, ShieldAlert } from 'lucide-react';

export const LpFreelancerEscrow = () => {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-slate-900 to-slate-950 text-gray-100 font-sans p-6 overflow-x-hidden md:overflow-hidden relative">
      {/* Background accents */}
      <div className="absolute top-0 left-1/4 w-96 h-96 bg-blue-600/10 rounded-full blur-3xl pointer-events-none"></div>
      <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-purple-600/10 rounded-full blur-3xl pointer-events-none"></div>

      <div className="w-full max-w-4xl flex flex-col items-center text-center z-10">
        
        {/* Logo */}
        <div className="flex items-center gap-3 mb-10">
          <div className="relative bg-gradient-to-br from-purple-600 to-blue-600 rounded-lg shadow-lg flex items-center justify-center w-12 h-12">
            <Shield className="w-8 h-8 text-white absolute" strokeWidth={1.5} />
            <Zap className="w-4 h-4 text-white absolute fill-white" />
          </div>
          <span className="font-bold text-2xl tracking-tight text-white">BlinkFlow</span>
        </div>

        {/* Hero Section */}
        <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold tracking-tight mb-6 leading-tight text-white max-w-3xl">
          You agreed directly — lock the payment in a smart contract
        </h1>
        <p className="text-lg md:text-xl text-slate-400 mb-12 max-w-2xl leading-relaxed">
          For freelancers and clients working without a marketplace. 0.5% fee instead of 10-20% — funds release the moment both sides confirm.
        </p>

        {/* Three Pillars */}
        <div className="flex flex-col md:flex-row gap-6 md:gap-8 mb-14 w-full justify-center text-left md:text-center">
          <div className="flex md:flex-col items-center gap-4 flex-1">
            <div className="bg-slate-800/50 p-3 rounded-full shrink-0">
              <CheckCircle2 className="w-6 h-6 text-blue-400" />
            </div>
            <p className="text-slate-300 font-medium">Both sides sign</p>
          </div>
          
          <div className="flex md:flex-col items-center gap-4 flex-1">
            <div className="bg-slate-800/50 p-3 rounded-full shrink-0">
              <Lock className="w-6 h-6 text-blue-400" />
            </div>
            <p className="text-slate-300 font-medium">Funds live in the contract, not with us</p>
          </div>
          
          <div className="flex md:flex-col items-center gap-4 flex-1">
            <div className="bg-slate-800/50 p-3 rounded-full shrink-0">
              <ShieldAlert className="w-6 h-6 text-blue-400" />
            </div>
            <p className="text-slate-300 font-medium">Disputes go to our team — 5% fee</p>
          </div>
        </div>

        {/* CTA */}
        <div className="flex flex-col items-center">
          <p className="text-sm text-slate-500 mb-4 font-medium uppercase tracking-wider">
            Try it now — on devnet funds, no risk
          </p>
          <Link 
            to="/" 
            className="bg-blue-600 hover:bg-blue-700 text-white px-8 py-4 rounded-lg font-semibold text-lg transition-all shadow-lg hover:shadow-blue-600/25 flex items-center gap-2"
          >
            Create your first deal
          </Link>
        </div>

      </div>
    </div>
  );
};
