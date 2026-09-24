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

function App() {
  const network = 'devnet';
  const endpoint = useMemo(() => clusterApiUrl(network), [network]);
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

export default App;
