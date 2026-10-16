import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { useMemo } from 'react';
import { ConnectionProvider, WalletProvider } from '@solana/wallet-adapter-react';
import { WalletModalProvider } from '@solana/wallet-adapter-react-ui';
import { clusterApiUrl } from '@solana/web3.js';
import { RoleProvider } from './RoleContext';
import { Layout } from './components/Layout';
import { Dashboard } from './pages/Dashboard';
import { DealDetails } from './pages/DealDetails';
import { Profile } from './pages/Profile';
import { DisputeLog } from './pages/DisputeLog';
import { LpFreelancerEscrow } from './pages/LpFreelancerEscrow';
import { About } from './pages/About';

import { Terms } from './pages/Terms';
import { Privacy } from './pages/Privacy';
import { ArbiterPage } from './pages/ArbiterPage';
import { CookieBanner } from './components/CookieBanner';

import '@solana/wallet-adapter-react-ui/styles.css';
import { NetworkProvider, useNetwork } from './NetworkContext';
import { DEVNET_ENDPOINTS, failoverFetch } from './lib/rpc';

function InnerApp() {
  const { network } = useNetwork();
  const endpoint = useMemo(() => {
    if (network === 'devnet') {
      return DEVNET_ENDPOINTS[0] || import.meta.env.VITE_SOLANA_RPC_URL_DEVNET || clusterApiUrl('devnet');
    } else {
      return import.meta.env.VITE_SOLANA_RPC_URL_MAINNET || clusterApiUrl('mainnet-beta');
    }
  }, [network]);
  const connectionConfig = useMemo(() => {
    if (network === 'devnet') {
      return { commitment: 'confirmed' as const, fetch: failoverFetch };
    }
    return undefined;
  }, [network]);
  const wallets = useMemo(() => [], []);

  return (
    <ConnectionProvider endpoint={endpoint} config={connectionConfig}>
      <WalletProvider wallets={wallets} autoConnect>
        <WalletModalProvider>
          <RoleProvider>
            <Router>
              <CookieBanner />
              <Routes>
                <Route path="/lp/freelancer-escrow" element={<LpFreelancerEscrow />} />
                <Route path="/about" element={<About />} />
                <Route path="/terms" element={<Terms />} />
                <Route path="/ops-k7r2x9" element={<ArbiterPage view="admin" />} />
                <Route path="/arb-m4q8w3" element={<ArbiterPage view="arbiter" />} />
                <Route path="/*" element={
                  <Layout>
                    <Routes>
                      <Route path="/" element={<Dashboard />} />
                      <Route path="/deal/:id" element={<DealDetails />} />
                      <Route path="/profile" element={<Profile />} />
                      <Route path="/log" element={<DisputeLog />} />
                    </Routes>
                  </Layout>
                } />
              </Routes>

            </Router>
          </RoleProvider>
        </WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
}

function App() {
  return (
    <NetworkProvider>
      <InnerApp />
    </NetworkProvider>
  );
}

export default App;
