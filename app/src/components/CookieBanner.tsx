import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { getConsent, setConsent, loadAnalytics } from '../lib/consent';

export const CookieBanner = () => {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const consent = getConsent();
    if (consent === null) {
      setIsVisible(true);
    } else if (consent === 'granted') {
      loadAnalytics();
    }

    const handleOpen = () => setIsVisible(true);
    window.addEventListener('blinkflow-cookie-settings', handleOpen);
    return () => window.removeEventListener('blinkflow-cookie-settings', handleOpen);
  }, []);

  if (!isVisible) return null;

  const handleAccept = () => {
    setConsent('granted');
    loadAnalytics();
    setIsVisible(false);
  };

  const handleDecline = () => {
    setConsent('denied');
    setIsVisible(false);
  };

  return (
    <div className="fixed bottom-4 left-4 right-4 md:left-1/2 md:-translate-x-1/2 md:max-w-3xl z-50">
      <div className="bg-slate-900 border border-slate-700 p-4 md:p-6 rounded-xl shadow-2xl flex flex-col md:flex-row items-center gap-4 justify-between">
        <p className="text-slate-300 text-sm leading-relaxed text-center md:text-left flex-1">
          We use Google Analytics cookies to understand how the demo is used. They are only set if you accept. <Link to="/privacy" className="text-blue-400 hover:underline whitespace-nowrap">Privacy Policy</Link>.
        </p>
        <div className="flex gap-3 w-full md:w-auto shrink-0">
          <button 
            onClick={handleDecline}
            className="flex-1 md:flex-none px-6 py-2 rounded-lg font-medium text-sm text-slate-300 bg-slate-800 hover:bg-slate-700 transition-colors border border-slate-700"
          >
            Decline
          </button>
          <button 
            onClick={handleAccept}
            className="flex-1 md:flex-none px-6 py-2 rounded-lg font-medium text-sm text-white bg-blue-600 hover:bg-blue-700 transition-colors border border-blue-600"
          >
            Accept
          </button>
        </div>
      </div>
    </div>
  );
};
