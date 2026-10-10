// chainClient.ts — BlinkflowClient that executes the real BlinkFlow Anchor instructions on Devnet
// (signed by the connected Phantom account) and then updates the same UI state as mockClient.
//
// Scope for the demo: task 0 of a customer-created deal.
//   createDeal (customer)  -> init_deal_by_customer + add_contractor_to_deal   (one tx, customer signs)
//   acceptDeal (contractor)-> accept_deal_by_contractor
//   depositTask(0)         -> deposit_task_by_customer
//   finishTask(0)          -> finish_task_by_contractor
//   completeTask(0, true)  -> complete_task_by_customer
// Anything else (extra tasks, cancel, disputes, rejecting) falls through to mockClient only.
import {
  Connection, PublicKey, Transaction, TransactionInstruction, SystemProgram, ComputeBudgetProgram,
} from '@solana/web3.js';
import { BlinkflowClient } from './types';
import { mockClient } from './mockClient';
import { syncNow } from './sync';

export const PROGRAM_ID = new PublicKey('3vJWWymQCHkntbWTgPfL2ujrquLrYHLneqzebr7bnkik');
export const MINT = new PublicKey('Gh9ZwEmdLJ8DscKNTkTqPbNwLNNBjuSzaG9Vp2KGtKJr');
const MPL_CORE = new PublicKey('CoREENxT6tW1HoK8ypY1SxRMZTcVPm7R94rH4PZNhX7d');
const ATA_PROGRAM = new PublicKey('ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL');
const TOKEN_PROGRAM = new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');
const DECIMALS = 6;
const RPC = (import.meta as any).env?.VITE_CHAIN_RPC || 'https://api.devnet.solana.com';
// Demo-only: the contractor wallet used when the create form has no contractor field.
const DEMO_CONTRACTOR = (import.meta as any).env?.VITE_DEMO_CONTRACTOR || 'HHEA9zcdBXdy9pTxzrG7UUKCfsjtKNwTJYU8inWsN9b7';

const DISC = {
  initDealByCustomer: [2, 51, 89, 167, 112, 219, 175, 236],
  addContractorToDeal: [35, 214, 50, 125, 152, 202, 35, 227],
  acceptDealByContractor: [207, 198, 203, 167, 223, 81, 158, 196],
  depositTaskByCustomer: [177, 242, 167, 14, 160, 252, 193, 176],
  finishTaskByContractor: [196, 235, 52, 233, 27, 16, 254, 233],
  completeTaskByCustomer: [166, 182, 255, 19, 234, 8, 253, 49],
};

const conn = new Connection(RPC, 'confirmed');
const enc = new TextEncoder();
const pda = (seeds: Uint8Array[]) => PublicKey.findProgramAddressSync(seeds, PROGRAM_ID)[0];
const ata = (owner: PublicKey) =>
  PublicKey.findProgramAddressSync([owner.toBuffer(), TOKEN_PROGRAM.toBuffer(), MINT.toBuffer()], ATA_PROGRAM)[0];
const u64 = (n: bigint) => { const b = new Uint8Array(8); new DataView(b.buffer).setBigUint64(0, n, true); return b; };
const i64 = (n: bigint) => { const b = new Uint8Array(8); new DataView(b.buffer).setBigInt64(0, n, true); return b; };
const cat = (...a: Uint8Array[]) => { const o = new Uint8Array(a.reduce((s, x) => s + x.length, 0)); let p = 0; for (const x of a) { o.set(x, p); p += x.length; } return o; };
const meta = (pubkey: PublicKey, isSigner = false, isWritable = false) => ({ pubkey, isSigner, isWritable });
const sha256 = async (t: string) => new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(t)));

// ---- stored chain info per UI deal ----------------------------------------------------------------
export interface ChainInfo {
  seed: string;            // u64 as decimal string
  customer: string;
  contractor: string;
  deal: string;            // deal PDA
  sigs: { step: string; sig: string; at: string }[];
}
const KEY = 'blinkflow_chain_v1';
export const readChainStore = (): Record<string, ChainInfo> => { try { return JSON.parse(localStorage.getItem(KEY) || '{}'); } catch { return {}; } };
export const writeChainStore = (m: Record<string, ChainInfo>) => { try { localStorage.setItem(KEY, JSON.stringify(m)); window.dispatchEvent(new Event('blinkflow:deals-changed')); } catch { /* ignore */ } };
export const getChainInfo = (dealId: string): ChainInfo | null => readChainStore()[dealId] ?? null;
export const explorerTx = (sig: string) => `https://explorer.solana.com/tx/${sig}?cluster=devnet`;
export const explorerAddr = (a: string) => `https://explorer.solana.com/address/${a}?cluster=devnet`;

function addSig(dealId: string, step: string, sig: string) {
  const all = readChainStore();
  if (all[dealId]) { all[dealId].sigs.push({ step, sig, at: new Date().toISOString() }); writeChainStore(all); }
}

// ---- wallet ---------------------------------------------------------------------------------------
function provider(): any {
  const p = (window as any).phantom?.solana ?? (window as any).solana;
  if (!p?.publicKey) throw new Error('Connect Phantom first.');
  return p;
}

async function sendTx(ixs: TransactionInstruction[]): Promise<string> {
  const p = provider();
  const tx = new Transaction().add(ComputeBudgetProgram.setComputeUnitLimit({ units: 600000 }), ...ixs);
  tx.feePayer = new PublicKey(p.publicKey.toString());
  const { blockhash, lastValidBlockHeight } = await conn.getLatestBlockhash('confirmed');
  tx.recentBlockhash = blockhash;
  const signed = await p.signTransaction(tx);
  let sig: string;
  try {
    sig = await conn.sendRawTransaction(signed.serialize(), { skipPreflight: false });
  } catch (e: any) {
    const logs: string[] | undefined = e.logs ?? e.transactionLogs;
    const hint = logs?.slice(-4).join(' | ');
    throw new Error(`On-chain error: ${e.message}${hint ? ' — ' + hint : ''}`);
  }
  const res = await conn.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, 'confirmed');
  if (res.value.err) throw new Error('Transaction failed: ' + JSON.stringify(res.value.err));
  return sig;
}

// ---- addresses ------------------------------------------------------------------------------------
function addrs(customer: PublicKey, contractor: PublicKey, seed: bigint) {
  const protocol = pda([enc.encode('protocol')]);
  const deal = pda([enc.encode('dial'), customer.toBuffer(), u64(seed)]);
  return {
    protocol, deal,
    task0: pda([enc.encode('task'), deal.toBuffer(), Uint8Array.of(0)]),
    dealVault: ata(deal), protocolVault: ata(protocol),
    sbtCollection: pda([enc.encode('sbt_collection')]),
    sbtCustomer: pda([enc.encode('sbt'), customer.toBuffer()]),
    sbtContractor: pda([enc.encode('sbt'), contractor.toBuffer()]),
    customerAta: ata(customer), contractorAta: ata(contractor),
  };
}

async function trustAuthority(): Promise<PublicKey> {
  const info = await conn.getAccountInfo(pda([enc.encode('protocol')]));
  if (!info) throw new Error('Protocol is not initialised on this cluster.');
  return new PublicKey(info.data.slice(8 + 32, 8 + 64));
}

const ix = (data: Uint8Array, keys: ReturnType<typeof meta>[]) => new TransactionInstruction({ programId: PROGRAM_ID, data: data as any, keys });

async function ctx(dealId: string) {
  await syncNow(); // pick up the other browser's latest state first
  const info = getChainInfo(dealId);
  if (!info) return null; // deal was not created on-chain (seed/mock deal): mock only
  const customer = new PublicKey(info.customer), contractor = new PublicKey(info.contractor);
  return { info, customer, contractor, a: addrs(customer, contractor, BigInt(info.seed)) };
}

function requireWallet(expected: string, role: string) {
  const me = provider().publicKey.toString();
  if (me !== expected) throw new Error(`Switch Phantom to the ${role} account (${expected.slice(0, 4)}…${expected.slice(-4)}).`);
}

// ---- the client -----------------------------------------------------------------------------------
export const chainClient: BlinkflowClient = {
  ...mockClient,

  async createDeal(input) {
    if (input.role !== 'customer') return mockClient.createDeal(input);
    requireWallet(input.wallet, 'customer');
    const customer = new PublicKey(input.wallet);
    const contractor = new PublicKey((input as any).contractorWallet || DEMO_CONTRACTOR);
    const seed = BigInt(Date.now());
    const a = addrs(customer, contractor, seed);
    const seconds = Math.max(86400, Math.floor((new Date(input.deadline).getTime() - Date.now()) / 1000) || 604800);
    const taskHash = await sha256(JSON.stringify({ title: input.title, successCriteria: input.successCriteria }));
    const trust = await trustAuthority();
    const sig = await sendTx([
      ix(cat(Uint8Array.from(DISC.initDealByCustomer), u64(seed), u64(BigInt(Math.round(input.amount * 10 ** DECIMALS))), taskHash, i64(BigInt(seconds))), [
        meta(customer, true, true), meta(trust), meta(a.protocol), meta(a.deal, false, true), meta(a.task0, false, true), meta(MINT),
        meta(a.dealVault, false, true), meta(a.customerAta, false, true), meta(a.sbtCollection, false, true), meta(a.sbtCustomer, false, true),
        meta(MPL_CORE), meta(ATA_PROGRAM), meta(TOKEN_PROGRAM), meta(SystemProgram.programId)]),
      ix(Uint8Array.from(DISC.addContractorToDeal), [meta(customer, true), meta(contractor), meta(a.deal, false, true), meta(a.task0, false, true)]),
    ]);
    const deal = await mockClient.createDeal(input);
    // the mock deal records the contractor too, so the contractor-side UI matches the chain
    const all = readChainStore();
    all[deal.id] = { seed: seed.toString(), customer: customer.toBase58(), contractor: contractor.toBase58(), deal: a.deal.toBase58(), sigs: [{ step: 'create', sig, at: new Date().toISOString() }] };
    writeChainStore(all);
    return deal;
  },

  async acceptDeal(dealId, wallet) {
    const c = await ctx(dealId);
    if (!c) return mockClient.acceptDeal(dealId, wallet);
    requireWallet(c.info.contractor, 'contractor');
    const a = c.a;
    const sig = await sendTx([ix(Uint8Array.from(DISC.acceptDealByContractor), [
      meta(c.contractor, true, true), meta(a.deal, false, true), meta(a.task0, false, true), meta(a.sbtCollection, false, true),
      meta(a.sbtContractor, false, true), meta(MPL_CORE), meta(SystemProgram.programId)])]);
    addSig(dealId, 'accept', sig);
    return mockClient.acceptDeal(dealId, wallet);
  },

  async depositTask(dealId, taskIndex, wallet) {
    const c = await ctx(dealId);
    if (!c || taskIndex !== 0) return mockClient.depositTask(dealId, taskIndex, wallet);
    requireWallet(c.info.customer, 'customer');
    const a = c.a;
    const sig = await sendTx([ix(cat(Uint8Array.from(DISC.depositTaskByCustomer), Uint8Array.of(0)), [
      meta(c.customer, true, true), meta(a.protocol), meta(a.deal, false, true), meta(a.task0, false, true), meta(MINT), meta(a.dealVault, false, true),
      meta(a.customerAta, false, true), meta(a.sbtCollection, false, true), meta(a.sbtCustomer, false, true),
      meta(MPL_CORE), meta(ATA_PROGRAM), meta(TOKEN_PROGRAM), meta(SystemProgram.programId)])]);
    addSig(dealId, 'deposit', sig);
    return mockClient.depositTask(dealId, taskIndex, wallet);
  },

  async finishTask(dealId, taskIndex, solutionNote) {
    const c = await ctx(dealId);
    if (!c || taskIndex !== 0) return mockClient.finishTask(dealId, taskIndex, solutionNote);
    requireWallet(c.info.contractor, 'contractor');
    const a = c.a;
    const sig = await sendTx([ix(cat(Uint8Array.from(DISC.finishTaskByContractor), Uint8Array.of(0), await sha256(solutionNote)), [
      meta(c.contractor, true), meta(a.deal, false, true), meta(a.task0, false, true)])]);
    addSig(dealId, 'finish', sig);
    return mockClient.finishTask(dealId, taskIndex, solutionNote);
  },

  async completeTask(dealId, taskIndex, approved) {
    const c = await ctx(dealId);
    if (!c || taskIndex !== 0 || !approved) return mockClient.completeTask(dealId, taskIndex, approved);
    requireWallet(c.info.customer, 'customer');
    const a = c.a;
    const sig = await sendTx([ix(cat(Uint8Array.from(DISC.completeTaskByCustomer), Uint8Array.of(0), Uint8Array.of(1)), [
      meta(c.customer, true, true), meta(c.contractor), meta(a.protocol), meta(a.deal, false, true), meta(a.task0, false, true), meta(MINT),
      meta(a.dealVault, false, true), meta(a.protocolVault, false, true), meta(a.contractorAta, false, true), meta(a.sbtCollection, false, true),
      meta(a.sbtCustomer, false, true), meta(a.sbtContractor, false, true), meta(MPL_CORE), meta(ATA_PROGRAM), meta(TOKEN_PROGRAM), meta(SystemProgram.programId)])]);
    addSig(dealId, 'complete', sig);
    return mockClient.completeTask(dealId, taskIndex, approved);
  },
};
