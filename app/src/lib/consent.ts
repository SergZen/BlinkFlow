const GA_ID = import.meta.env.VITE_GA_ID || 'G-FQ0CSY5WVF';
const CONSENT_KEY = 'blinkflow_cookie_consent';

export function getConsent(): 'granted' | 'denied' | null {
  try {
    const val = localStorage.getItem(CONSENT_KEY);
    if (val === 'granted' || val === 'denied') return val;
  } catch (e) {
    // ignore
  }
  return null;
}

export function setConsent(value: 'granted' | 'denied') {
  try {
    localStorage.setItem(CONSENT_KEY, value);
  } catch (e) {
    // ignore
  }

  if (value === 'denied') {
    (window as any)['ga-disable-' + GA_ID] = true;
    try {
      const domain = window.location.hostname;
      document.cookie.split(";").forEach((c) => {
        const name = c.trim().split("=")[0];
        if (name.startsWith('_ga')) {
          document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/; domain=${domain}`;
          document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/`;
        }
      });
    } catch(e) {
      // ignore
    }
  }
}

export function loadAnalytics() {
  if ((window as any)._gaLoaded) return;
  (window as any)._gaLoaded = true;

  const script = document.createElement('script');
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${GA_ID}`;
  document.head.appendChild(script);

  (window as any).dataLayer = (window as any).dataLayer || [];
  function gtag(...args: any[]) {
    // eslint-disable-next-line prefer-rest-params
    (window as any).dataLayer.push(arguments);
  }
  (window as any).gtag = gtag;

  gtag('js', new Date());
  gtag('config', GA_ID, { anonymize_ip: true });
}

export function openCookieSettings() {
  window.dispatchEvent(new Event('blinkflow-cookie-settings'));
}
