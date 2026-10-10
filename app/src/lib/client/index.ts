import { mockClient, getDeals, replaceDeals } from './mockClient';
import { BlinkflowClient } from './types';
import { chainClient, readChainStore, writeChainStore } from './chainClient';
import { initSync } from './sync';

export let isChainMode = false;

try {
  const params = new URLSearchParams(window.location.search);
  const chainParam = params.get('chain');
  if (chainParam === '1') {
    window.localStorage.setItem('blinkflow_chain_mode', '1');
  } else if (chainParam === '0') {
    window.localStorage.removeItem('blinkflow_chain_mode');
  }
  isChainMode = import.meta.env.VITE_CHAIN_MODE === 'devnet' || window.localStorage.getItem('blinkflow_chain_mode') === '1';
} catch (e) {
  isChainMode = import.meta.env.VITE_CHAIN_MODE === 'devnet';
}

let activeClient: BlinkflowClient = mockClient;

if (isChainMode) {
  activeClient = chainClient;
  initSync({ getDeals, replaceDeals, readChain: readChainStore, writeChain: writeChainStore });
}

export const client: BlinkflowClient = activeClient;
