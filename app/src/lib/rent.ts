import React, { useState, useEffect } from 'react';
import { LAMPORTS_PER_SOL } from '@solana/web3.js';
import { createConnection } from './rpc';
import { fetchReputation } from './client/sbt';

export const DEAL_ACCOUNT_BYTES = 262;
export const TASK_ACCOUNT_BYTES = 204;
export const DEAL_VAULT_BYTES = 165;

const conn = createConnection('confirmed');
const rentCache = new Map<number, number>();

export async function rentLamports(bytes: number): Promise<number> {
  const cached = rentCache.get(bytes);
  if (cached !== undefined) return cached;
  const lamports = await conn.getMinimumBalanceForRentExemption(bytes);
  rentCache.set(bytes, lamports);
  return lamports;
}

export async function newDealDeposit(): Promise<number> {
  const [deal, task, vault] = await Promise.all([
    rentLamports(DEAL_ACCOUNT_BYTES),
    rentLamports(TASK_ACCOUNT_BYTES),
    rentLamports(DEAL_VAULT_BYTES),
  ]);
  return (deal + task + vault) / LAMPORTS_PER_SOL;
}

export async function newTaskDeposit(): Promise<number> {
  const task = await rentLamports(TASK_ACCOUNT_BYTES);
  return task / LAMPORTS_PER_SOL;
}

interface NetworkDepositInfoProps {
  type: 'deal' | 'task';
  wallet?: string | null;
}

export const NetworkDepositInfo: React.FC<NetworkDepositInfoProps> = ({ type, wallet }) => {
  const [deposit, setDeposit] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [hasSbt, setHasSbt] = useState(true);
  const [showExplainer, setShowExplainer] = useState(false);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(false);

    const fn = type === 'deal' ? newDealDeposit : newTaskDeposit;
    fn()
      .then((val) => {
        if (!active) return;
        setDeposit(val);
        setLoading(false);
      })
      .catch((err) => {
        if (!active) return;
        console.warn('[rent] failed to fetch rent deposit info:', err?.message || err);
        setError(true);
        setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [type]);

  useEffect(() => {
    if (type !== 'deal' || !wallet) {
      setHasSbt(true);
      return;
    }
    let active = true;
    fetchReputation(wallet)
      .then((rep) => {
        if (!active) return;
        setHasSbt(rep !== null);
      })
      .catch(() => {
        if (!active) return;
        setHasSbt(true);
      });
    return () => {
      active = false;
    };
  }, [type, wallet]);

  if (error) return null;

  if (loading || deposit === null) {
    return React.createElement('p', { className: 'text-xs text-gray-500' }, 'Network deposit: calculating…');
  }

  return React.createElement(
    'div',
    { className: 'text-xs text-gray-400 space-y-1' },
    React.createElement(
      'div',
      null,
      'Network deposit: ',
      React.createElement('strong', { className: 'text-gray-200 font-semibold' }, `${deposit.toFixed(4)} SOL`),
      `. Returned to your wallet when the ${type === 'deal' ? 'deal and its tasks are' : 'task is'} closed. `,
      React.createElement(
        'button',
        {
          type: 'button',
          onClick: () => setShowExplainer((prev) => !prev),
          className: 'text-purple-400 hover:text-purple-300 underline inline focus:outline-none',
        },
        '[What is this?]'
      ),
      type === 'deal' && !hasSbt
        ? React.createElement(
            'span',
            { className: 'block text-gray-400 mt-0.5' },
            '+ one-time reputation card for your wallet.'
          )
        : null
    ),
    showExplainer
      ? React.createElement(
          'div',
          { className: 'text-[11px] text-gray-400 bg-gray-950 p-2.5 rounded border border-gray-800 leading-relaxed' },
          'Solana keeps a small refundable deposit for every account that stores data on-chain. BlinkFlow does not receive it. You get it back when the account is closed.'
        )
      : null
  );
};
