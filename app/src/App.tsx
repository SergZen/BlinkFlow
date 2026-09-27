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

import '@solana/wallet-adapter-react-ui/styles.css';
import { NetworkProvider, useNetwork } from './NetworkContext';

function InnerApp() {
  const { network } = useNetwork();
  const endpoint = useMemo(() => {
    if (network === 'devnet' && import.meta.env.VITE_SOLANA_RPC_URL) {
      return import.meta.env.VITE_SOLANA_RPC_URL;
    }
    return clusterApiUrl(network);
  }, [network]);
  const wallets = useMemo(() => [], []);

  return (
    <ConnectionProvider endpoint={endpoint}>
      <WalletProvider wallets={wallets} autoConnect>
        <WalletModalProvider>
          <RoleProvider>
            <Router>
              <Layout>
                <Routes>
                  <Route path="/" element={<Dashboard />} />
                  <Route path="/deal/:id" element={<DealDetails />} />
                  <Route path="/profile" element={<Profile />} />
                  <Route path="/log" element={<DisputeLog />} />
                </Routes>
              </Layout>
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
