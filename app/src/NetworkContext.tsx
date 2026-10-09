import { createContext, useContext, useState, ReactNode, useEffect } from 'react';

export type NetworkType = 'mainnet-beta' | 'devnet';

interface NetworkContextType {
  network: NetworkType;
  setNetwork: (network: NetworkType) => void;
  isTestMode: boolean;
}

const NetworkContext = createContext<NetworkContextType | undefined>(undefined);

export const NetworkProvider = ({ children }: { children: ReactNode }) => {
  const network = 'devnet';

  useEffect(() => {
    localStorage.removeItem('blinkflow_network');
  }, []);

  return (
    <NetworkContext.Provider value={{ 
      network, 
      setNetwork: () => {}, 
      isTestMode: true 
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
