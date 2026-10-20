// chainClient.ts — BlinkflowClient that executes the real BlinkFlow Anchor instructions on Devnet
// (signed by the connected Phantom account) and then updates the same UI state as mockClient.
//
// All deal and milestone actions execute on-chain for any task index (0..255).
// Actions never fall back to mock in chain mode; if a deal has no chain info, an error is thrown.
//   createDeal (customer)           -> init_deal_by_customer (+ add_contractor_to_deal only if contractor given)
//   assignContractor (customer)     -> add_contractor_to_deal (picks pending contractor before acceptance)
//   acceptDeal (contractor)         -> accept_deal_by_contractor
//   addTask(input)                  -> add_task_by_customer (customer) / add_task_by_contractor (contractor)
//   acceptTask(N)                   -> accept_task_by_contractor (for N > 0) / acceptDeal (for N = 0)
//   depositTask(N)                  -> deposit_task_by_customer (ContractorCreated) / UI state only (CustomerCreated)
//   finishTask(N)                   -> finish_task_by_contractor
//   completeTask(N, true)           -> complete_task_by_customer(approved=true)
//   completeTask(N, false)          -> complete_task_by_customer(approved=false), moves task to Disputed
//   cancelTask(N)                   -> cancel_task_by_customer (CustomerCreated) / cancel_task_by_contractor (Started)
//   resolveDispute(N, customerWins) -> resolve_dispute
import {
  PublicKey, Transaction, TransactionInstruction, SystemProgram, ComputeBudgetProgram,
} from '@solana/web3.js';
import { BlinkflowClient } from './types';
import { mockClient, getDeals, replaceDeals } from './mockClient';
import { syncNow, push } from './sync';
import { taskHashInput } from '../fileHash';
import { friendlyError } from '../errors';
import { createConnection } from '../rpc';

export const PROGRAM_ID = new PublicKey('3vJWWymQCHkntbWTgPfL2ujrquLrYHLneqzebr7bnkik');
export const MINT = new PublicKey('Gh9ZwEmdLJ8DscKNTkTqPbNwLNNBjuSzaG9Vp2KGtKJr');
const MPL_CORE = new PublicKey('CoREENxT6tW1HoK8ypY1SxRMZTcVPm7R94rH4PZNhX7d');
const ATA_PROGRAM = new PublicKey('ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL');
const TOKEN_PROGRAM = new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');
const DECIMALS = 6;

const DISC = {
  initDealByCustomer: [2, 51, 89, 167, 112, 219, 175, 236],
  initDealByContractor: [99, 68, 242, 203, 3, 58, 176, 238],
  addContractorToDeal: [35, 214, 50, 125, 152, 202, 35, 227],
  acceptDealByContractor: [207, 198, 203, 167, 223, 81, 158, 196],
  addTaskByCustomer: [29, 228, 69, 54, 127, 227, 60, 113],
  addTaskByContractor: [223, 35, 171, 89, 137, 239, 196, 40],
  acceptTaskByContractor: [169, 149, 164, 233, 78, 231, 98, 150],
  depositTaskByCustomer: [177, 242, 167, 14, 160, 252, 193, 176],
  finishTaskByContractor: [196, 235, 52, 233, 27, 16, 254, 233],
  completeTaskByCustomer: [166, 182, 255, 19, 234, 8, 253, 49],
  cancelTaskByCustomer: [139, 65, 95, 224, 49, 230, 23, 83],
  cancelTaskByContractor: [155, 183, 94, 233, 91, 29, 155, 211],
  setTrustAuthority: [130, 95, 184, 81, 201, 79, 106, 112],
  resolveDispute: [231, 6, 202, 6, 96, 103, 12, 230],
};

const conn = createConnection('confirmed');
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

async function withRetry<T>(fn: () => Promise<T>, tries = 4): Promise<T> {
  let lastError: any;
  for (let attempt = 0; attempt < tries; attempt++) {
    try {
      return await fn();
    } catch (e: any) {
      lastError = e;
      const text = (e?.message || String(e)).toLowerCase();
      const isRateLimit = text.includes('429') || text.includes('rate limit') || text.includes('too many requests');
      if (!isRateLimit || attempt === tries - 1) {
        throw e;
      }
      const delay = 700 * Math.pow(2, attempt);
      await new Promise((res) => setTimeout(res, delay));
    }
  }
  throw lastError;
}

let lastTxSig: string | null = null;
export function getLastTxSig(): string | null {
  return lastTxSig;
}

async function sendTx(ixs: TransactionInstruction[]): Promise<string> {
  lastTxSig = null;
  const p = provider();
  const tx = new Transaction().add(
    ComputeBudgetProgram.setComputeUnitLimit({ units: 600000 }),
    ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 50_000 }),
    ...ixs
  );
  tx.feePayer = new PublicKey(p.publicKey.toString());
  const { blockhash, lastValidBlockHeight } = await withRetry(() => conn.getLatestBlockhash('confirmed'));
  tx.recentBlockhash = blockhash;
  const estimatedTxSize = tx.serializeMessage().length + 1 + 64;
  if (estimatedTxSize > 1232) {
    throw new Error('Too many stages for one transaction. Remove a stage now and add it later with Add task.');
  }
  let signed: Transaction;
  try {
    signed = await p.signTransaction(tx);
  } catch (e: any) {
    throw new Error(friendlyError(e));
  }
  const raw = signed.serialize();
  let sig!: string;
  for (let attempt = 1; attempt <= 6; attempt++) {
    try {
      sig = await conn.sendRawTransaction(raw, {
        skipPreflight: false,
        preflightCommitment: 'processed',
      });
      break;
    } catch (e: any) {
      const errMsg = (e?.message || String(e)).toLowerCase();
      if (errMsg.includes('blockhash not found')) {
        if (attempt < 6) {
          await new Promise((res) => setTimeout(res, 1000));
          continue;
        }
      } else {
        console.error('[sendTx]', e);
        throw new Error(friendlyError(e));
      }
    }
  }
  if (!sig) {
    try {
      sig = await conn.sendRawTransaction(raw, { skipPreflight: true, maxRetries: 3 });
    } catch (e: any) {
      console.error('[sendTx]', e);
      throw new Error(friendlyError(e));
    }
  }
  let done = false;
  const rebroadcastStart = Date.now();
  const rebroadcastIntervalMs = 2_000;
  const rebroadcastMaxMs = 60_000;

  const rebroadcastLoop = async () => {
    while (!done && Date.now() - rebroadcastStart < rebroadcastMaxMs) {
      await new Promise((resolve) => setTimeout(resolve, rebroadcastIntervalMs));
      if (done) break;
      try {
        await conn.sendRawTransaction(raw, { skipPreflight: true, maxRetries: 0 });
      } catch {
        // ignore rebroadcast errors
      }
    }
  };

  rebroadcastLoop().catch(() => {});

  let res: any;
  try {
    try {
      res = await conn.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, 'confirmed');
    } finally {
      done = true;
    }
  } catch (confirmErr: any) {
    const confirmMsg = (confirmErr?.message || String(confirmErr)).toLowerCase();
    const isTimeout =
      confirmMsg.includes('not confirmed in') ||
      confirmMsg.includes('timeout') ||
      confirmMsg.includes('timed out') ||
      confirmMsg.includes('block height exceeded') ||
      confirmMsg.includes('expired');

    if (!isTimeout) {
      console.error('[sendTx confirm error]', confirmErr);
      throw new Error(friendlyError(confirmErr));
    }

    console.warn('[sendTx] confirmTransaction timed out, polling signature status for sig:', sig);

    const maxPollTimeMs = 40_000;
    const intervalMs = 2_000;
    const startTime = Date.now();

    while (Date.now() - startTime < maxPollTimeMs) {
      await new Promise((resolve) => setTimeout(resolve, intervalMs));
      try {
        await conn.sendRawTransaction(raw, { skipPreflight: true, maxRetries: 0 });
      } catch {
        // ignore rebroadcast errors in polling fallback
      }
      let statusRes: any = null;
      try {
        statusRes = await withRetry(() =>
          conn.getSignatureStatuses([sig], { searchTransactionHistory: true })
        );
      } catch (pollErr: any) {
        console.warn('[sendTx] signature status poll error:', pollErr?.message || pollErr);
        continue;
      }
      const status = statusRes?.value?.[0];
      if (status) {
        if (status.err) {
          console.error('[sendTx confirm error]', status.err);
          throw new Error(friendlyError(JSON.stringify(status.err)));
        }
        if (
          status.confirmationStatus === 'confirmed' ||
          status.confirmationStatus === 'finalized'
        ) {
          lastTxSig = sig;
          return sig;
        }
      }
    }

    throw new Error(
      'The transaction was sent but is not confirmed yet. Wait 30 seconds, refresh the page and check the deal status before trying again.'
    );
  } finally {
    done = true;
  }

  if (res.value.err) {
    console.error('[sendTx confirm error]', res.value.err);
    const logsStr = (res.value as any)?.logs ? (res.value as any).logs.join(' ') : '';
    throw new Error(friendlyError(JSON.stringify(res.value.err) + (logsStr ? ' ' + logsStr : '')));
  }
  lastTxSig = sig;
  return sig;
}

// ---- addresses ------------------------------------------------------------------------------------
const taskPda = (deal: PublicKey, index: number) =>
  pda([enc.encode('task'), deal.toBuffer(), Uint8Array.of(index)]);

async function readTaskTotalCount(deal: PublicKey): Promise<number> {
  const account = await withRetry(() => conn.getAccountInfo(deal));
  if (!account || !account.data) {
    throw new Error('Could not find on-chain deal account.');
  }
  const data = account.data;
  const tagOffset = 8 + 192 + 8;
  if (data.length <= tagOffset) {
    throw new Error('Deal account data is truncated.');
  }
  const tag = data[tagOffset];
  const countOffset = tagOffset + (tag !== 0 ? 33 : 1) + 8;
  if (data.length <= countOffset) {
    throw new Error('Deal account data is too short for task_total_count.');
  }
  return data[countOffset];
}

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

let cachedTrustAuthority: { key: PublicKey; expiresAt: number } | null = null;
const TRUST_AUTH_CACHE_TTL = 10 * 60 * 1000;

export function clearTrustAuthorityCache() {
  cachedTrustAuthority = null;
}

export interface ProtocolConfig {
  admin: string;
  trustAuthority: string;
  feeRecipient: string;
  mint: string;
  protocolFeeBps: number;
  arbitrationFeeBps: number;
  paused: boolean;
}

export async function fetchProtocolConfig(): Promise<ProtocolConfig> {
  const info = await withRetry(() => conn.getAccountInfo(pda([enc.encode('protocol')])));
  if (!info) throw new Error('Protocol is not initialised on this cluster.');
  const admin = new PublicKey(info.data.subarray(8, 40)).toBase58();
  const trustAuthority = new PublicKey(info.data.subarray(40, 72)).toBase58();
  const feeRecipient = new PublicKey(info.data.subarray(72, 104)).toBase58();
  const mint = new PublicKey(info.data.subarray(104, 136)).toBase58();
  const protocolFeeBps = new DataView(info.data.buffer, info.data.byteOffset + 136, 2).getUint16(0, true);
  const arbitrationFeeBps = new DataView(info.data.buffer, info.data.byteOffset + 138, 2).getUint16(0, true);
  const paused = Boolean(info.data[140]);
  return {
    admin,
    trustAuthority,
    feeRecipient,
    mint,
    protocolFeeBps,
    arbitrationFeeBps,
    paused,
  };
}

export async function setTrustAuthority(newTrustAuthorityStr: string): Promise<string> {
  const newTrustPubkey = new PublicKey(newTrustAuthorityStr.trim());
  const protocolPda = pda([enc.encode('protocol')]);
  const config = await fetchProtocolConfig();
  requireWallet(config.admin, 'admin');

  const adminKey = new PublicKey(config.admin);
  const data = cat(Uint8Array.from(DISC.setTrustAuthority), newTrustPubkey.toBuffer());
  const keys = [
    meta(adminKey, true, false),
    meta(protocolPda, false, true),
  ];

  const sig = await sendTx([ix(data, keys)]);
  clearTrustAuthorityCache();
  return sig;
}

async function trustAuthority(): Promise<PublicKey> {
  const now = Date.now();
  if (cachedTrustAuthority && cachedTrustAuthority.expiresAt > now) {
    return cachedTrustAuthority.key;
  }
  const config = await fetchProtocolConfig();
  const key = new PublicKey(config.trustAuthority);
  cachedTrustAuthority = { key, expiresAt: now + TRUST_AUTH_CACHE_TTL };
  return key;
}

const ix = (data: Uint8Array, keys: ReturnType<typeof meta>[]) => new TransactionInstruction({ programId: PROGRAM_ID, data: data as any, keys });

async function ctx(dealId: string) {
  await syncNow(); // pick up the other browser's latest state first
  const info = getChainInfo(dealId);
  if (!info) return null; // deal was not created on-chain (seed/mock deal): mock only
  const customer = new PublicKey(info.customer);
  const contractor = info.contractor ? new PublicKey(info.contractor) : customer; // placeholder: contractor-derived addresses are unused until a contractor is picked
  return { info, customer, contractor, a: addrs(customer, contractor, BigInt(info.seed)) };
}

export async function fetchDealTrustAuthority(dealId: string): Promise<string | null> {
  const c = await ctx(dealId);
  if (!c) return null;
  try {
    const dealAccount = await withRetry(() => conn.getAccountInfo(c.a.deal));
    if (dealAccount && dealAccount.data.length >= 136) {
      return new PublicKey(dealAccount.data.subarray(104, 136)).toBase58();
    }
  } catch (e) {
    console.warn('[fetchDealTrustAuthority]', e);
  }
  return null;
}

function requireWallet(expected: string, role: string) {
  const me = provider().publicKey.toString();
  if (me !== expected) throw new Error(`Switch Phantom to the ${role} account (${expected.slice(0, 4)}…${expected.slice(-4)}).`);
}

// After every action: let the mock state settle, then push the FINAL state to the shared server so the other
// browser sees the same status (otherwise only the intermediate state with the new signature is shared).
async function afterStep<T>(p: Promise<T>): Promise<T> {
  const r = await p;
  // push() is skipped while another push is still in flight, so retry a few times in the background
  // (it is idempotent: nothing is sent when the server already has this exact state).
  void (async () => { for (let i = 0; i < 4; i++) { await push(); await new Promise((res) => setTimeout(res, 700)); } })();
  return r;
}

// The contract funds the escrow inside init_deal_by_customer and starts the task inside accept_deal_by_contractor,
// so the UI state must follow the chain: funded right after creation, started right after the contractor accepts.
function patchDeal(dealId: string, fn: (d: any) => void) {
  const list = getDeals().slice();
  const d: any = list.find((x: any) => x.id === dealId);
  if (!d) return null;
  fn(d);
  replaceDeals(list as any);
  return JSON.parse(JSON.stringify(d));
}
const today = () => new Date().toISOString().slice(0, 10);

// ---- the client -----------------------------------------------------------------------------------
export const chainClient: BlinkflowClient = {
  ...mockClient,

  async createDeal(input) {
    if (input.role !== 'customer' && input.role !== 'contractor') {
      throw new Error('Deal creation requires the Customer or Contractor role.');
    }

    if (input.role === 'contractor') {
      requireWallet(input.wallet, 'contractor');
      const contractor = new PublicKey(input.wallet);
      const customerStr = (input.customerWallet || '').trim();
      let customer: PublicKey;
      try {
        customer = new PublicKey(customerStr);
      } catch {
        throw new Error('Invalid customer wallet.');
      }
      if (customer.equals(contractor)) {
        throw new Error('The customer and the contractor must be different wallets.');
      }

      let trust: PublicKey;
      try {
        trust = await trustAuthority();
      } catch (e: any) {
        throw new Error(friendlyError(e));
      }
      if (trust.equals(customer) || trust.equals(contractor)) {
        throw new Error('The trust authority cannot be the customer or the contractor.');
      }

      const seed = BigInt(Date.now());
      const a = addrs(customer, contractor, seed);
      const custAtaAccount = await withRetry(() => conn.getAccountInfo(a.customerAta));
      if (!custAtaAccount) {
        throw new Error('The customer has no USDC account yet, so the deal cannot be created now. Ask them to get USDC first.');
      }

      const seconds = Math.max(86400, Math.floor((new Date(input.deadline).getTime() - Date.now()) / 1000) || 604800);
      if (seconds > 365 * 86400) {
        throw new Error('The deadline cannot be more than 365 days from now.');
      }
      const taskHash = await sha256(taskHashInput(input.title, input.successCriteria, input.requirementsFile?.sha256));

      const data = cat(
        Uint8Array.from(DISC.initDealByContractor),
        u64(seed),
        u64(BigInt(Math.round(input.amount * 10 ** DECIMALS))),
        taskHash,
        i64(BigInt(seconds))
      );

      const keys = [
        meta(contractor, true, true),
        meta(customer, false, false),
        meta(trust, false, false),
        meta(a.protocol, false, false),
        meta(a.deal, false, true),
        meta(a.task0, false, true),
        meta(MINT, false, false),
        meta(a.dealVault, false, true),
        meta(a.customerAta, false, false),
        meta(a.sbtCollection, false, true),
        meta(a.sbtContractor, false, true),
        meta(MPL_CORE, false, false),
        meta(ATA_PROGRAM, false, false),
        meta(TOKEN_PROGRAM, false, false),
        meta(SystemProgram.programId, false, false),
      ];

      const ixs = [ix(data, keys)];
      if (input.extraTasks && input.extraTasks.length > 0) {
        for (let i = 0; i < input.extraTasks.length; i++) {
          const extra = input.extraTasks[i];
          const extraTaskIndex = i + 1;
          const extraSeconds = Math.max(86400, Math.floor((new Date(extra.deadline).getTime() - Date.now()) / 1000) || 604800);
          if (extraSeconds > 365 * 86400) {
            throw new Error('The deadline cannot be more than 365 days from now.');
          }
          const extraTaskHash = await sha256(taskHashInput(extra.title, extra.successCriteria, extra.requirementsFile?.sha256));
          const extraAmountU64 = u64(BigInt(Math.round(extra.amount * 10 ** DECIMALS)));
          const newTask = taskPda(a.deal, extraTaskIndex);
          const extraData = cat(
            Uint8Array.from(DISC.addTaskByContractor),
            extraAmountU64,
            extraTaskHash,
            i64(BigInt(extraSeconds))
          );
          const extraKeys = [
            meta(contractor, true, true),
            meta(a.protocol, false, false),
            meta(a.deal, false, true),
            meta(newTask, false, true),
            meta(SystemProgram.programId, false, false),
          ];
          ixs.push(ix(extraData, extraKeys));
        }
      }

      const sig = await sendTx(ixs);
      const deal = await mockClient.createDeal(input);
      const all = readChainStore();
      all[deal.id] = {
        seed: seed.toString(),
        customer: customer.toBase58(),
        contractor: contractor.toBase58(),
        deal: a.deal.toBase58(),
        sigs: [{ step: 'create', sig, at: new Date().toISOString() }],
      };
      writeChainStore(all);
      patchDeal(deal.id, (d) => {
        d.tasks.forEach((t: any) => {
          t.status = 'ContractorCreated';
          t.deposited = false;
        });
        d.customer = customer.toBase58();
        d.contractor = contractor.toBase58();
        const stageCount = d.tasks.length;
        d.history.push({
          date: today(),
          action: stageCount > 1
            ? `Deal created on-chain with ${stageCount} stages`
            : 'Deal proposed on-chain by contractor, awaiting customer funding',
        });
      });
      void (async () => {
        for (let i = 0; i < 4; i++) {
          await push();
          await new Promise((res) => setTimeout(res, 700));
        }
      })();
      return deal;
    }

    requireWallet(input.wallet, 'customer');
    const customer = new PublicKey(input.wallet);
    const contractorStr: string = ((input as any).contractorWallet || '').trim();
    const contractor = contractorStr ? new PublicKey(contractorStr) : null;
    if (contractor && customer.equals(contractor)) {
      throw new Error('The customer and the contractor must be different wallets.');
    }
    const seed = BigInt(Date.now());
    const a = addrs(customer, contractor ?? customer, seed);
    const totalAmount = input.amount + (input.extraTasks?.reduce((acc, t) => acc + t.amount, 0) || 0);
    try {
      const balRes = await withRetry(() => conn.getTokenAccountBalance(a.customerAta));
      const have = balRes?.value?.uiAmount ?? (Number(balRes?.value?.amount || 0) / 10 ** DECIMALS);
      if (have < totalAmount) {
        throw new Error(`Not enough USDC-Dev: you have ${have}, the deal needs ${totalAmount}. Use "Get USDC-Dev" in the header.`);
      }
    } catch (err: any) {
      if (err.message && err.message.startsWith('Not enough USDC-Dev:')) {
        throw err;
      }
      const errMsg = (err?.message || String(err)).toLowerCase();
      if (
        errMsg.includes('could not find account') ||
        errMsg.includes('not found') ||
        errMsg.includes('account not initialized') ||
        errMsg.includes('accountnotinitialized') ||
        errMsg.includes('does not exist') ||
        errMsg.includes('invalid param')
      ) {
        throw new Error(friendlyError('could not find account'));
      }
      console.warn('[createDeal] balance pre-check skipped due to RPC error:', err?.message || err);
    }
    const seconds = Math.max(86400, Math.floor((new Date(input.deadline).getTime() - Date.now()) / 1000) || 604800);
    if (seconds > 365 * 86400) {
      throw new Error('The deadline cannot be more than 365 days from now.');
    }
    const taskHash = await sha256(taskHashInput(input.title, input.successCriteria, input.requirementsFile?.sha256));
    let trust: PublicKey;
    try {
      trust = await trustAuthority();
    } catch (e: any) {
      throw new Error(friendlyError(e));
    }
    const ixs = [
      ix(cat(Uint8Array.from(DISC.initDealByCustomer), u64(seed), u64(BigInt(Math.round(input.amount * 10 ** DECIMALS))), taskHash, i64(BigInt(seconds))), [
        meta(customer, true, true), meta(trust), meta(a.protocol), meta(a.deal, false, true), meta(a.task0, false, true), meta(MINT),
        meta(a.dealVault, false, true), meta(a.customerAta, false, true), meta(a.sbtCollection, false, true), meta(a.sbtCustomer, false, true),
        meta(MPL_CORE), meta(ATA_PROGRAM), meta(TOKEN_PROGRAM), meta(SystemProgram.programId)]),
    ];
    if (contractor) {
      ixs.push(ix(Uint8Array.from(DISC.addContractorToDeal), [meta(customer, true), meta(contractor), meta(a.deal, false, true), meta(a.task0, false, true)]));
    }
    if (input.extraTasks && input.extraTasks.length > 0) {
      for (let i = 0; i < input.extraTasks.length; i++) {
        const extra = input.extraTasks[i];
        const extraTaskIndex = i + 1;
        const extraSeconds = Math.max(86400, Math.floor((new Date(extra.deadline).getTime() - Date.now()) / 1000) || 604800);
        if (extraSeconds > 365 * 86400) {
          throw new Error('The deadline cannot be more than 365 days from now.');
        }
        const extraTaskHash = await sha256(taskHashInput(extra.title, extra.successCriteria, extra.requirementsFile?.sha256));
        const extraAmountU64 = u64(BigInt(Math.round(extra.amount * 10 ** DECIMALS)));
        const newTask = taskPda(a.deal, extraTaskIndex);
        const extraData = cat(
          Uint8Array.from(DISC.addTaskByCustomer),
          extraAmountU64,
          extraTaskHash,
          i64(BigInt(extraSeconds))
        );
        const extraKeys = [
          meta(customer, true, true),
          meta(a.protocol, false, false),
          meta(a.deal, false, true),
          meta(newTask, false, true),
          meta(MINT, false, false),
          meta(a.dealVault, false, true),
          meta(a.customerAta, false, true),
          meta(ATA_PROGRAM, false, false),
          meta(TOKEN_PROGRAM, false, false),
          meta(SystemProgram.programId, false, false),
        ];
        ixs.push(ix(extraData, extraKeys));
      }
    }
    const sig = await sendTx(ixs);
    const deal = await mockClient.createDeal(input);
    // the mock deal records the contractor too, so the contractor-side UI matches the chain
    const all = readChainStore();
    all[deal.id] = { seed: seed.toString(), customer: customer.toBase58(), contractor: contractorStr, deal: a.deal.toBase58(), sigs: [{ step: 'create', sig, at: new Date().toISOString() }] };
    writeChainStore(all);
    patchDeal(deal.id, (d) => {
      d.tasks.forEach((t: any) => {
        t.status = 'CustomerCreated';
        t.deposited = true;
      });
      const stageCount = d.tasks.length;
      d.history.push({
        date: today(),
        action: stageCount > 1
          ? `Deal created on-chain with ${stageCount} stages`
          : 'Escrow Funded On-chain'
      });
    });
    void (async () => { for (let i = 0; i < 4; i++) { await push(); await new Promise((res) => setTimeout(res, 700)); } })();
    return deal;
  },

  async assignContractor(dealId, contractorWallet) {
    const c = await ctx(dealId); if (!c) throw new Error('This deal is not on-chain, so this action cannot be performed.');
    requireWallet(c.info.customer, 'customer');
    let picked: PublicKey; try { picked = new PublicKey(contractorWallet); } catch { throw new Error('Invalid contractor wallet.'); }
    if (picked.toBase58() === c.info.customer) throw new Error('The customer and the contractor must be different wallets.');
    const d = getDeals().find((x) => x.id === dealId);
    if (!d || d.contractor || d.tasks?.[0]?.status !== 'CustomerCreated') throw new Error('The contractor already accepted this deal. It can no longer be changed.');
    const a = c.a;
    const sig = await sendTx([ix(Uint8Array.from(DISC.addContractorToDeal), [meta(c.customer, true), meta(picked), meta(a.deal, false, true), meta(a.task0, false, true)])]);
    const all = readChainStore(); all[dealId].contractor = picked.toBase58(); all[dealId].sigs.push({ step: 'assign', sig, at: new Date().toISOString() }); writeChainStore(all);
    return afterStep(Promise.resolve(patchDeal(dealId, (x) => { x.history.push({ date: today(), action: `Contractor selected: ${picked.toBase58().slice(0, 4)}…${picked.toBase58().slice(-4)}` }); })) as Promise<any>);
  },

  async acceptDeal(dealId, wallet) {
    const c = await ctx(dealId);
    if (!c) throw new Error('This deal is not on-chain, so this action cannot be performed.');
    if (!c.info.contractor) throw new Error('The customer has not picked a contractor yet.');
    requireWallet(c.info.contractor, 'contractor');
    const a = c.a;
    const sig = await sendTx([ix(Uint8Array.from(DISC.acceptDealByContractor), [
      meta(c.contractor, true, true), meta(a.deal, false, true), meta(a.task0, false, true), meta(a.sbtCollection, false, true),
      meta(a.sbtContractor, false, true), meta(MPL_CORE), meta(SystemProgram.programId)])]);
    addSig(dealId, 'accept', sig);
    return afterStep(mockClient.acceptDeal(dealId, wallet).then((r) =>
      patchDeal(dealId, (d) => { d.tasks[0].status = 'Started'; d.history.push({ date: today(), action: 'Task Started' }); }) ?? r));
  },

  async addTask(dealId, input) {
    const c = await ctx(dealId);
    if (!c) throw new Error('This deal is not on-chain, so this action cannot be performed.');

    const currentDeal = getDeals().find((d) => d.id === dealId);
    if (!currentDeal?.contractor) {
      throw new Error('A contractor must be assigned to the deal before adding new tasks.');
    }

    if (input.role !== 'customer' && input.role !== 'contractor') {
      throw new Error('Adding a task requires customer or contractor role.');
    }

    if (!input.title || !input.title.trim()) {
      throw new Error('Task title cannot be empty.');
    }

    if (!input.successCriteria || !input.successCriteria.trim()) {
      throw new Error('Success criteria cannot be empty.');
    }

    if (!input.amount || input.amount <= 0) {
      throw new Error('Amount must be a valid number greater than 0');
    }

    const config = await fetchProtocolConfig();
    if (config.paused) {
      throw new Error('Protocol is currently paused.');
    }

    const nextIndex = await readTaskTotalCount(c.a.deal);
    if (nextIndex >= 255) {
      throw new Error('Maximum tasks per deal reached (255).');
    }

    const seconds = Math.max(86400, Math.floor((new Date(input.deadline).getTime() - Date.now()) / 1000) || 604800);
    if (seconds <= 0) {
      throw new Error('Deadline must be in the future.');
    }
    if (seconds > 365 * 86400) {
      throw new Error('The deadline cannot be more than 365 days from now.');
    }

    const taskHash = await sha256(taskHashInput(input.title.trim(), input.successCriteria.trim(), input.requirementsFile?.sha256));
    const amountU64 = u64(BigInt(Math.round(input.amount * 10 ** DECIMALS)));
    const newTask = taskPda(c.a.deal, nextIndex);

    let sig: string;
    if (input.role === 'customer') {
      requireWallet(c.info.customer, 'customer');

      try {
        const balRes = await withRetry(() => conn.getTokenAccountBalance(c.a.customerAta));
        const have = balRes?.value?.uiAmount ?? (Number(balRes?.value?.amount || 0) / 10 ** DECIMALS);
        if (have < input.amount) {
          throw new Error(`Not enough USDC-Dev: you have ${have}, the task needs ${input.amount}. Use "Get USDC-Dev" in the header.`);
        }
      } catch (err: any) {
        if (err.message && err.message.startsWith('Not enough USDC-Dev:')) {
          throw err;
        }
        const errMsg = (err?.message || String(err)).toLowerCase();
        if (
          errMsg.includes('could not find account') ||
          errMsg.includes('not found') ||
          errMsg.includes('account not initialized') ||
          errMsg.includes('accountnotinitialized') ||
          errMsg.includes('does not exist') ||
          errMsg.includes('invalid param')
        ) {
          throw new Error(friendlyError('could not find account'));
        }
        console.warn('[addTask] balance pre-check skipped due to RPC error:', err?.message || err);
      }

      const data = cat(
        Uint8Array.from(DISC.addTaskByCustomer),
        amountU64,
        taskHash,
        i64(BigInt(seconds))
      );

      const keys = [
        meta(c.customer, true, true),
        meta(c.a.protocol, false, false),
        meta(c.a.deal, false, true),
        meta(newTask, false, true),
        meta(MINT, false, false),
        meta(c.a.dealVault, false, true),
        meta(c.a.customerAta, false, true),
        meta(ATA_PROGRAM, false, false),
        meta(TOKEN_PROGRAM, false, false),
        meta(SystemProgram.programId, false, false),
      ];

      sig = await sendTx([ix(data, keys)]);
    } else {
      if (!c.info.contractor) {
        throw new Error('A contractor must be assigned to the deal before adding new tasks.');
      }
      requireWallet(c.info.contractor, 'contractor');

      const data = cat(
        Uint8Array.from(DISC.addTaskByContractor),
        amountU64,
        taskHash,
        i64(BigInt(seconds))
      );

      const keys = [
        meta(c.contractor, true, true),
        meta(c.a.protocol, false, false),
        meta(c.a.deal, false, true),
        meta(newTask, false, true),
        meta(SystemProgram.programId, false, false),
      ];

      sig = await sendTx([ix(data, keys)]);
    }

    addSig(dealId, 'add_task', sig);

    const addedRole = input.role;
    return afterStep(
      mockClient.addTask(dealId, input).then((r) =>
        patchDeal(dealId, (d) => {
          const newTaskItem = d.tasks[d.tasks.length - 1];
          if (newTaskItem) {
            newTaskItem.taskIndex = nextIndex;
            if (addedRole === 'customer') {
              newTaskItem.status = 'CustomerCreated';
              newTaskItem.deposited = true;
            } else {
              newTaskItem.status = 'ContractorCreated';
              newTaskItem.deposited = false;
            }
          }
          if (d.history.length > 0 && d.history[d.history.length - 1]?.action === 'Task Added') {
            d.history.pop();
          }
          d.history.push({
            date: today(),
            action: `Task #${nextIndex} added on-chain by ${addedRole}`,
          });
        }) ?? r
      )
    );
  },

  async acceptTask(dealId, taskIndex, wallet) {
    if (taskIndex === 0) {
      return chainClient.acceptDeal(dealId, wallet);
    }
    const c = await ctx(dealId);
    if (!c) throw new Error('This deal is not on-chain, so this action cannot be performed.');
    if (!c.info.contractor) throw new Error('The customer has not picked a contractor yet.');
    requireWallet(c.info.contractor, 'contractor');
    const a = c.a;
    const task = taskPda(a.deal, taskIndex);
    const sig = await sendTx([
      ix(cat(Uint8Array.from(DISC.acceptTaskByContractor), Uint8Array.of(taskIndex)), [
        meta(c.contractor, true, true),
        meta(a.deal, false, true),
        meta(task, false, true),
      ]),
    ]);
    addSig(dealId, 'accept_task', sig);
    return afterStep(
      mockClient.acceptTask(dealId, taskIndex, wallet).then((r) =>
        patchDeal(dealId, (d) => {
          if (d.tasks?.[taskIndex]) {
            d.tasks[taskIndex].status = 'Started';
          }
        }) ?? r
      )
    );
  },

  async depositTask(dealId, taskIndex, wallet) {
    const c = await ctx(dealId);
    if (!c) throw new Error('This deal is not on-chain, so this action cannot be performed.');
    requireWallet(c.info.customer, 'customer');

    const currentDeal = getDeals().find((d) => d.id === dealId);
    const currentTask = currentDeal?.tasks?.[taskIndex];
    if (!currentTask) throw new Error('Task not found.');

    if (currentTask.status === 'CustomerCreated') {
      // Customer-created deals are already funded on-chain: init_deal_by_customer moved the USDC into the
      // deal vault. So this step is a UI-state update only (no transaction, no second deposit).
      return afterStep(mockClient.depositTask(dealId, taskIndex, wallet));
    }

    if (currentTask.status === 'ContractorCreated') {
      const a = c.a;
      try {
        const balRes = await withRetry(() => conn.getTokenAccountBalance(a.customerAta));
        const have = balRes?.value?.uiAmount ?? (Number(balRes?.value?.amount || 0) / 10 ** DECIMALS);
        if (have < currentTask.amount) {
          throw new Error(`Not enough USDC-Dev: you have ${have}, the task needs ${currentTask.amount}. Use "Get USDC-Dev" in the header.`);
        }
      } catch (err: any) {
        if (err.message && err.message.startsWith('Not enough USDC-Dev:')) {
          throw err;
        }
        const errMsg = (err?.message || String(err)).toLowerCase();
        if (
          errMsg.includes('could not find account') ||
          errMsg.includes('not found') ||
          errMsg.includes('account not initialized') ||
          errMsg.includes('accountnotinitialized') ||
          errMsg.includes('does not exist') ||
          errMsg.includes('invalid param')
        ) {
          throw new Error(friendlyError('could not find account'));
        }
        console.warn('[depositTask] balance pre-check skipped due to RPC error:', err?.message || err);
      }

      const task = taskPda(a.deal, taskIndex);
      const data = cat(Uint8Array.from(DISC.depositTaskByCustomer), Uint8Array.of(taskIndex));
      const keys = [
        meta(c.customer, true, true),
        meta(a.protocol, false, false),
        meta(a.deal, false, true),
        meta(task, false, true),
        meta(MINT, false, false),
        meta(a.dealVault, false, true),
        meta(a.customerAta, false, true),
        meta(a.sbtCollection, false, true),
        meta(a.sbtCustomer, false, true),
        meta(MPL_CORE, false, false),
        meta(ATA_PROGRAM, false, false),
        meta(TOKEN_PROGRAM, false, false),
        meta(SystemProgram.programId, false, false),
      ];

      const sig = await sendTx([ix(data, keys)]);
      addSig(dealId, 'deposit', sig);

      return afterStep(
        mockClient.depositTask(dealId, taskIndex, wallet).then((r) =>
          patchDeal(dealId, (d) => {
            if (d.tasks?.[taskIndex]) {
              d.tasks[taskIndex].status = 'Started';
              d.tasks[taskIndex].deposited = true;
            }
            d.history.push({
              date: today(),
              action: `Escrow Funded On-chain (task #${taskIndex})`,
            });
          }) ?? r
        )
      );
    }

    throw new Error('This task cannot be funded in its current status.');
  },

  async finishTask(dealId, taskIndex, solutionNote) {
    const c = await ctx(dealId);
    if (!c) throw new Error('This deal is not on-chain, so this action cannot be performed.');
    requireWallet(c.info.contractor, 'contractor');
    const a = c.a;
    const task = taskPda(a.deal, taskIndex);
    const sig = await sendTx([ix(cat(Uint8Array.from(DISC.finishTaskByContractor), Uint8Array.of(taskIndex), await sha256(solutionNote)), [
      meta(c.contractor, true), meta(a.deal, false, true), meta(task, false, true)])]);
    addSig(dealId, 'finish', sig);
    return afterStep(mockClient.finishTask(dealId, taskIndex, solutionNote));
  },

  async completeTask(dealId, taskIndex, approved) {
    const c = await ctx(dealId);
    if (!c) throw new Error('This deal is not on-chain, so this action cannot be performed.');
    requireWallet(c.info.customer, 'customer');
    const a = c.a;
    const task = taskPda(a.deal, taskIndex);
    if (approved) {
      const contractorAtaAccount = await withRetry(() => conn.getAccountInfo(a.contractorAta));
      if (!contractorAtaAccount) {
        throw new Error('The contractor has no USDC account yet, so the payment cannot be made. Ask them to get USDC first.');
      }
    }
    const sig = await sendTx([ix(cat(Uint8Array.from(DISC.completeTaskByCustomer), Uint8Array.of(taskIndex), Uint8Array.of(approved ? 1 : 0)), [
      meta(c.customer, true, true), meta(c.contractor), meta(a.protocol), meta(a.deal, false, true), meta(task, false, true), meta(MINT),
      meta(a.dealVault, false, true), meta(a.protocolVault, false, true), meta(a.contractorAta, false, true), meta(a.sbtCollection, false, true),
      meta(a.sbtCustomer, false, true), meta(a.sbtContractor, false, true), meta(MPL_CORE), meta(ATA_PROGRAM), meta(TOKEN_PROGRAM), meta(SystemProgram.programId)])]);
    addSig(dealId, approved ? 'complete' : 'dispute', sig);
    if (approved) {
      return afterStep(
        mockClient.completeTask(dealId, taskIndex, approved).then((r) =>
          patchDeal(dealId, (d) => {
            if (d.tasks?.[taskIndex]) {
              d.tasks[taskIndex].status = 'Completed';
            }
          }) ?? r
        )
      );
    }
    return afterStep(
      mockClient.completeTask(dealId, taskIndex, approved).then((r) =>
        patchDeal(dealId, (d) => {
          if (d.tasks?.[taskIndex]) {
            d.tasks[taskIndex].status = 'Disputed';
          }
          d.history.push({ date: today(), action: 'Dispute Opened On-chain (funds stay locked in escrow)' });
        }) ?? r
      )
    );
  },

  async cancelTask(dealId, taskIndex) {
    const c = await ctx(dealId);
    if (!c) throw new Error('This deal is not on-chain, so this action cannot be performed.');
    const me = provider().publicKey.toString();
    let side: 'customer' | 'contractor';
    if (me === c.info.customer) {
      side = 'customer';
    } else if (me === c.info.contractor) {
      side = 'contractor';
    } else {
      throw new Error('Switch Phantom to the customer or contractor account of this deal.');
    }
    const currentDeal = getDeals().find((d) => d.id === dealId);
    const currentStatus = currentDeal?.tasks?.[taskIndex]?.status;
    if (side === 'customer') {
      if (currentStatus !== 'CustomerCreated') {
        throw new Error('The contractor already accepted this deal. The customer can no longer cancel it.');
      }
    } else {
      if (currentStatus !== 'Started') {
        throw new Error('The contractor can cancel only after accepting the task.');
      }
    }
    const a = c.a;
    const task = taskPda(a.deal, taskIndex);
    const disc = side === 'customer' ? DISC.cancelTaskByCustomer : DISC.cancelTaskByContractor;
    const signerKey = side === 'customer' ? c.customer : c.contractor;
    const sig = await sendTx([ix(cat(Uint8Array.from(disc), Uint8Array.of(taskIndex)), [
      meta(signerKey, true),
      meta(a.deal, false, true),
      meta(task, false, true),
      meta(MINT),
      meta(a.dealVault, false, true),
      meta(a.customerAta, false, true),
      meta(ATA_PROGRAM),
      meta(TOKEN_PROGRAM),
      meta(SystemProgram.programId),
    ])]);
    addSig(dealId, 'cancel', sig);
    return afterStep(mockClient.cancelTask(dealId, taskIndex).then((r) =>
      patchDeal(dealId, (d) => {
        if (d.tasks?.[taskIndex]) {
          d.tasks[taskIndex].status = 'Cancelled';
        }
        d.history.push({ date: today(), action: side === 'customer' ? 'Cancelled by Customer, Escrow Refunded On-chain' : 'Cancelled by Contractor, Escrow Refunded to Customer On-chain' });
      }) ?? r));
  },

  async resolveDispute(dealId, taskIndex, customerWins) {
    const c = await ctx(dealId);
    if (!c) throw new Error('This deal is not on-chain, so this action cannot be performed.');

    const onChainTrustAuth = await fetchDealTrustAuthority(dealId);
    const dealTrustAuth: PublicKey = onChainTrustAuth
      ? new PublicKey(onChainTrustAuth)
      : await trustAuthority();

    requireWallet(dealTrustAuth.toBase58(), 'arbiter / trust authority');

    const a = c.a;
    const task = taskPda(a.deal, taskIndex);
    const trustAuthAta = ata(dealTrustAuth);

    const ixs: TransactionInstruction[] = [];

    // Ensure ATAs exist for accounts receiving tokens if not yet created
    for (const owner of [dealTrustAuth, c.contractor, c.customer]) {
      const existing = await withRetry(() => conn.getAccountInfo(ata(owner)));
      if (!existing) {
        ixs.push(new TransactionInstruction({
          programId: ATA_PROGRAM,
          keys: [
            meta(dealTrustAuth, true, true),
            meta(ata(owner), false, true),
            meta(owner, false, false),
            meta(MINT, false, false),
            meta(SystemProgram.programId, false, false),
            meta(TOKEN_PROGRAM, false, false),
          ],
          data: Uint8Array.of(1) as any, // createIdempotent
        }));
      }
    }

    const data = cat(
      Uint8Array.from(DISC.resolveDispute),
      Uint8Array.of(taskIndex),
      Uint8Array.of(customerWins ? 1 : 0)
    );

    const keys = [
      meta(dealTrustAuth, true, true),
      meta(c.contractor, false, false),
      meta(c.customer, false, false),
      meta(a.protocol, false, false),
      meta(a.deal, false, true),
      meta(task, false, true),
      meta(MINT, false, false),
      meta(trustAuthAta, false, true),
      meta(a.protocolVault, false, true),
      meta(a.dealVault, false, true),
      meta(a.customerAta, false, true),
      meta(a.contractorAta, false, true),
      meta(a.sbtCollection, false, true),
      meta(a.sbtCustomer, false, true),
      meta(a.sbtContractor, false, true),
      meta(MPL_CORE, false, false),
      meta(ATA_PROGRAM, false, false),
      meta(TOKEN_PROGRAM, false, false),
      meta(SystemProgram.programId, false, false),
    ];

    ixs.push(ix(data, keys));

    const sig = await sendTx(ixs);
    addSig(dealId, 'resolve_dispute', sig);

    return afterStep(
      mockClient.resolveDispute(dealId, taskIndex, customerWins).then((r) =>
        patchDeal(dealId, (d) => {
          if (d.tasks?.[taskIndex]) {
            d.tasks[taskIndex].status = 'Resolved';
            d.tasks[taskIndex].disputeResult = customerWins ? 'customer' : 'contractor';
          }
          d.history.push({
            date: today(),
            action: `Dispute Resolved On-chain (${customerWins ? 'Customer Refunded' : 'Contractor Paid'})`,
          });
        }) ?? r
      )
    );
  },
};
