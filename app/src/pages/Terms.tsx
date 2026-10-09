import { useEffect } from 'react';
import { LegalLayout } from '../components/LegalLayout';

export const Terms = () => {
  useEffect(() => {
    document.title = "Terms of Service - BlinkFlow";
  }, []);

  return (
    <LegalLayout title="Terms of Service" updated="October 10, 2026">
      <section>
        <h2 className="text-xl font-bold text-white mb-3">1. About the service</h2>
        <p>
          BlinkFlow is a hackathon demo of an escrow tool for freelance deals on Solana. Runs on Devnet with test tokens; no real funds are moved. Provided "as is".
        </p>
      </section>
      
      <section>
        <h2 className="text-xl font-bold text-white mb-3">2. Not financial or legal advice</h2>
        <p>
          Not a bank, exchange or custodian. Funds in deals are held by a smart contract, not by BlinkFlow.
        </p>
      </section>

      <section>
        <h2 className="text-xl font-bold text-white mb-3">3. Your wallet and responsibility</h2>
        <p>
          You control your own wallet and keys; we never ask for your seed phrase or private keys; you are responsible for the transactions you sign; blockchain transactions are irreversible.
        </p>
      </section>

      <section>
        <h2 className="text-xl font-bold text-white mb-3">4. Deals and disputes</h2>
        <p>
          Deal terms are agreed between the parties; BlinkFlow is not a party to the deal; in a dispute an arbiter rules yes/no on whether the agreed criteria were met; BlinkFlow does not guarantee any outcome.
        </p>
      </section>

      <section>
        <h2 className="text-xl font-bold text-white mb-3">5. Acceptable use</h2>
        <p>
          No illegal activity, fraud, abuse, attempts to disrupt or attack the service or the smart contract.
        </p>
      </section>

      <section>
        <h2 className="text-xl font-bold text-white mb-3">6. Smart contract and software risk</h2>
        <p>
          Demo software and contracts may contain bugs and have not been audited; availability may change or stop without notice.
        </p>
      </section>

      <section>
        <h2 className="text-xl font-bold text-white mb-3">7. Disclaimer of warranties and limitation of liability</h2>
        <p>
          To the maximum extent permitted by law, BlinkFlow is provided without warranties of any kind. We are not liable for any damages or losses arising from your use of the demo.
        </p>
      </section>

      <section>
        <h2 className="text-xl font-bold text-white mb-3">8. Changes to these terms</h2>
        <p>
          We may update these terms at any time. Continued use means acceptance.
        </p>
      </section>

      <section>
        <h2 className="text-xl font-bold text-white mb-3">9. Contact</h2>
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
    </LegalLayout>
  );
};
