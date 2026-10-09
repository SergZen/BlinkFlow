import { useEffect } from 'react';
import { LegalLayout } from '../components/LegalLayout';

export const Privacy = () => {
  useEffect(() => {
    document.title = "Privacy Policy - BlinkFlow";
  }, []);

  return (
    <LegalLayout title="Privacy Policy" updated="October 10, 2026">
      <section>
        <h2 className="text-xl font-bold text-white mb-3">1. Who we are and contact</h2>
        <div className="mt-2">
          Contact us via:
          <ul className="list-disc pl-5 mt-2 space-y-1">
            {import.meta.env.VITE_TWITTER_URL && (
              <li>X: <a href={import.meta.env.VITE_TWITTER_URL} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline">@BlinkFlowApp</a></li>
            )}
            {import.meta.env.VITE_TELEGRAM_BOT_URL && (
              <li>Telegram: <a href={import.meta.env.VITE_TELEGRAM_BOT_URL} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline">BlinkFlow Bot</a></li>
            )}
            {(!import.meta.env.VITE_TWITTER_URL && !import.meta.env.VITE_TELEGRAM_BOT_URL) && (
              <li>No contact methods currently available.</li>
            )}
          </ul>
        </div>
      </section>

      <section>
        <h2 className="text-xl font-bold text-white mb-3">2. What we collect</h2>
        <ul className="list-disc pl-5 space-y-2">
          <li><strong>Wallet public address:</strong> when you connect it (public on-chain data).</li>
          <li><strong>Deal information:</strong> title, amount, deadline, success criteria, and status history that you enter and store with the service.</li>
          <li><strong>Telegram data:</strong> if you use the bot, your chat ID and the messages you send to it.</li>
          <li><strong>Technical logs:</strong> from our hosting provider (IP address, request data).</li>
          <li><strong>Analytics data:</strong> via Google Analytics ONLY if you accept cookies (pages viewed, approximate location, device and browser, referrer; IP anonymization is enabled).</li>
        </ul>
      </section>

      <section>
        <h2 className="text-xl font-bold text-white mb-3">3. Cookies and local storage</h2>
        <p>
          Google Analytics cookies (<code>_ga</code>, <code>_ga_*</code>) are used only after your consent. LocalStorage keys (<code>blinkflow_network</code>, <code>blinkflow_cookie_consent</code>) and a dismissed-tip flag are technical settings, not tracking.
        </p>
        <p className="mt-2">
          How to change your choice: use the "Cookie settings" link in the footer. You can also use the Google Analytics opt-out browser add-on.
        </p>
      </section>

      <section>
        <h2 className="text-xl font-bold text-white mb-3">4. How we use data</h2>
        <p>
          To run the demo, fix problems, and understand usage.
        </p>
      </section>

      <section>
        <h2 className="text-xl font-bold text-white mb-3">5. Service providers</h2>
        <p>
          We use Railway (hosting), a Solana RPC provider and the Solana network (public blockchain, data on-chain is public and cannot be deleted), Google (Analytics, only with consent), and Telegram (bot).
        </p>
      </section>

      <section>
        <h2 className="text-xl font-bold text-white mb-3">6. Retention</h2>
        <p>
          Demo data may be deleted at any time; on-chain data is permanent.
        </p>
      </section>

      <section>
        <h2 className="text-xl font-bold text-white mb-3">7. Your rights</h2>
        <p>
          You may ask us to access or delete data we hold about you (not on-chain data) by contacting us; you can withdraw cookie consent anytime.
        </p>
      </section>

      <section>
        <h2 className="text-xl font-bold text-white mb-3">8. Children</h2>
        <p>
          Not intended for people under 18.
        </p>
      </section>

      <section>
        <h2 className="text-xl font-bold text-white mb-3">9. Changes to this policy</h2>
        <p>
          We may update this policy at any time. Continued use means acceptance.
        </p>
      </section>
    </LegalLayout>
  );
};
