import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Cookie } from 'lucide-react';
import { getConsent, setConsent, loadAnalytics } from '../lib/consent';

export const CookieBanner = () => {
  const [isVisible, setIsVisible] = useState(false);
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    const consent = getConsent();
    if (consent === null) {
      setIsVisible(true);
      setTimeout(() => setIsMounted(true), 50);
    } else if (consent === 'granted') {
      loadAnalytics();
    }

    const handleOpen = () => {
      setIsVisible(true);
      setTimeout(() => setIsMounted(true), 50);
    };
    window.addEventListener('blinkflow-cookie-settings', handleOpen);
    return () => window.removeEventListener('blinkflow-cookie-settings', handleOpen);
  }, []);

  if (!isVisible) return null;

  const handleClose = (action: () => void) => {
    setIsMounted(false);
    setTimeout(() => {
      action();
      setIsVisible(false);
    }, 300);
  };

  const handleAccept = () => {
    handleClose(() => {
      setConsent('granted');
      loadAnalytics();
    });
  };

  const handleDecline = () => {
    handleClose(() => {
      setConsent('denied');
    });
  };

  return (
    <div 
      className={`fixed bottom-4 left-4 right-4 md:left-1/2 md:-translate-x-1/2 md:max-w-3xl z-50 transition-all duration-300 ease-out transform ${
        isMounted ? 'translate-y-0 opacity-100' : 'translate-y-4 opacity-0'
      }`}
    >
      <div className="bg-slate-800 border border-blue-500/40 p-4 md:p-6 rounded-xl shadow-[0_0_30px_rgba(59,130,246,0.25)] flex flex-col md:flex-row items-start md:items-center gap-4 justify-between">
        <div className="flex gap-4 flex-1 items-start md:items-center">
          <div className="bg-blue-500/15 p-2 rounded-full shrink-0">
            <Cookie className="w-5 h-5 text-blue-300" aria-hidden="true" />
          </div>
          <div>
            <h3 className="font-semibold text-white text-sm mb-1">Cookies & analytics</h3>
            <p className="text-slate-300 text-sm leading-relaxed text-left">
              We use Google Analytics cookies to understand how the demo is used. They are only set if you accept. <Link to="/privacy" className="text-blue-400 hover:underline whitespace-nowrap">Privacy Policy</Link>.
            </p>
          </div>
        </div>
        <div className="flex gap-3 w-full md:w-auto shrink-0 mt-2 md:mt-0">
          <button 
            onClick={handleDecline}
            className="flex-1 md:flex-none px-6 py-2 rounded-lg font-medium text-sm text-white bg-transparent hover:bg-slate-700 transition-colors border border-slate-500"
          >
            Decline
          </button>
          <button 
            onClick={handleAccept}
            className="flex-1 md:flex-none px-6 py-2 rounded-lg font-medium text-sm text-white bg-blue-600 hover:bg-blue-500 transition-colors"
          >
            Accept
          </button>
        </div>
      </div>
    </div>
  );
};
