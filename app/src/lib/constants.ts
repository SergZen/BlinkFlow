import { useNetwork } from '../NetworkContext';

export const MAINNET_USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
export const DEVNET_USDC_MINT = import.meta.env.VITE_TEST_TOKEN_MINT || '';

export const useToken = () => {
  const { isTestMode } = useNetwork();
  return {
    symbol: isTestMode ? 'USDC-Dev' : 'USDC',
    mint: isTestMode ? DEVNET_USDC_MINT : MAINNET_USDC_MINT
  };
};
