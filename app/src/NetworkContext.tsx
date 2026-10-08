import { createContext, useContext, useState, ReactNode, useEffect } from 'react';

export type NetworkType = 'mainnet-beta' | 'devnet';

interface NetworkContextType {
  network: NetworkType;
  setNetwork: (network: NetworkType) => void;
  isTestMode: boolean;
}

const NetworkContext = createContext<NetworkContextType | undefined>(undefined);

export const NetworkProvider = ({ children }: { children: ReactNode }) => {
  const [network, setNetwork] = useState<NetworkType>(() => {
    const saved = localStorage.getItem('blinkflow_network');
    return (saved as NetworkType) || 'devnet';
  });

  useEffect(() => {
    localStorage.setItem('blinkflow_network', network);
  }, [network]);

  return (
    <NetworkContext.Provider value={{ 
      network, 
      setNetwork, 
      isTestMode: network === 'devnet' 
    }}>
      {children}
    </NetworkContext.Provider>
  );
};

export const useNetwork = () => {
  const context = useContext(NetworkContext);
  if (context === undefined) {
    throw new Error('useNetwork must be used within a NetworkProvider');
  }
  return context;
};
