import { Button } from './Button';
import { Copy } from 'lucide-react';

export const ShareDealPanel = ({ rawActionUrl, dealId, onCopy, customClass = '' }: { rawActionUrl: string, dealId: string, onCopy: (url: string) => void, customClass?: string }) => {
  const text = encodeURIComponent('Check out this BlinkFlow deal!');
  const encodedUrl = encodeURIComponent(rawActionUrl);

  const handleShareTelegram = () => {
    const deepLink = `tg://msg_url?url=${encodedUrl}&text=${text}`;
    const fallbackLink = `https://t.me/share/url?url=${encodedUrl}&text=${text}`;

    window.location.href = deepLink;
    setTimeout(() => {
      if (!document.hidden) {
        window.open(fallbackLink, '_blank');
      }
    }, 1500);
  };

  const copyForInstagram = async () => {
    try {
      const baseUrl = import.meta.env.VITE_ACTIONS_API_URL || 'http://localhost:3001';
      const response = await fetch(`${baseUrl}/api/deal/${dealId}/og-image.png`);
      const blob = await response.blob();
      
      if (navigator.clipboard && window.ClipboardItem) {
        await navigator.clipboard.write([
          new ClipboardItem({
            [blob.type]: blob
          })
        ]);
        alert('Image copied to clipboard! Paste it in Instagram, then copy the link below.');
      } else {
        // Fallback: download the image
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `deal-${dealId}.png`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        alert('Image downloaded! Share it on Instagram, then copy the link below.');
      }
    } catch (e) {
      console.error('Failed to copy image:', e);
      alert('Failed to generate image for Instagram.');
    }
  };

  return (
    <div className={`w-full mt-6 ${customClass}`}>
      <p className="text-sm font-medium text-gray-400 mb-4 text-center uppercase tracking-wider">Share to</p>
      <div className="flex flex-wrap justify-center gap-4">
        <Button 
          variant="gradient" 
          className="w-14 h-14 rounded-2xl flex items-center justify-center shadow-lg shadow-purple-500/20 p-0 hover:scale-105 transition-transform shrink-0"
          onClick={handleShareTelegram}
          title="Share to Telegram"
        >
          <svg className="w-6 h-6" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm4.64 6.8c-.15 1.58-.8 5.42-1.13 7.19-.14.75-.42 1-.68 1.03-.58.05-1.02-.38-1.58-.75-.88-.58-1.38-.94-2.23-1.5-.99-.65-.35-1.01.22-1.59.15-.15 2.71-2.48 2.76-2.69a.2.2 0 00-.05-.18c-.06-.05-.14-.03-.21-.02-.09.02-1.49.95-4.22 2.79-.4.27-.76.41-1.08.4-.36-.01-1.04-.2-1.55-.37-.63-.2-1.12-.31-1.08-.66.02-.18.27-.36.74-.55 2.92-1.27 4.86-2.11 5.83-2.51 2.78-1.16 3.35-1.36 3.73-1.36.08 0 .27.02.39.12.1.08.13.19.14.27-.01.04.01.12 0 .18z"/>
          </svg>
        </Button>
        <Button 
          variant="gradient" 
          className="w-14 h-14 rounded-2xl flex items-center justify-center shadow-lg shadow-purple-500/20 p-0 hover:scale-105 transition-transform shrink-0"
          onClick={() => window.open(`https://twitter.com/intent/tweet?url=${encodedUrl}&text=${text}`, '_blank')}
          title="Share to X / Twitter"
        >
          <svg className="w-6 h-6" viewBox="0 0 24 24" fill="currentColor">
            <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 22.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
          </svg>
        </Button>
        <Button 
          variant="gradient" 
          className="w-14 h-14 rounded-2xl flex items-center justify-center shadow-lg shadow-blue-500/20 p-0 hover:scale-105 transition-transform shrink-0 from-blue-600 to-blue-500"
          onClick={() => window.open(`https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}`, '_blank')}
          title="Share to Facebook"
        >
          <svg className="w-7 h-7" viewBox="0 0 24 24" fill="currentColor">
            <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.469h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.469h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
          </svg>
        </Button>
        <Button 
          variant="gradient" 
          className="w-14 h-14 rounded-2xl flex items-center justify-center shadow-lg shadow-sky-500/20 p-0 hover:scale-105 transition-transform shrink-0 from-sky-600 to-sky-500"
          onClick={() => window.open(`https://www.linkedin.com/sharing/share-offsite/?url=${encodedUrl}`, '_blank')}
          title="Share to LinkedIn"
        >
          <svg className="w-6 h-6" viewBox="0 0 24 24" fill="currentColor">
            <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
          </svg>
        </Button>
      </div>

      <div className="flex flex-col items-center gap-4 mt-8 pt-6 border-t border-gray-800/60 w-full">
        <p className="text-xs text-gray-500 font-medium uppercase tracking-wider">More options</p>
        <div className="flex flex-col gap-3 w-full">
          <Button variant="outline" className="w-full justify-between group border-gray-800 hover:bg-gray-800/50" onClick={copyForInstagram}>
            <span className="text-sm font-medium">1. Copy Image for Instagram</span>
            <Copy className="w-4 h-4 text-gray-500 group-hover:text-white transition-colors" />
          </Button>
          <Button variant="outline" className="w-full justify-between group border-gray-800 hover:bg-gray-800/50" onClick={() => onCopy(rawActionUrl)}>
            <span className="text-sm font-medium">2. Copy Raw Action Link</span>
            <Copy className="w-4 h-4 text-gray-500 group-hover:text-white transition-colors" />
          </Button>
        </div>
      </div>
    </div>
  );
};
