import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import bs58 from 'bs58';
import { Connection, PublicKey, clusterApiUrl } from '@solana/web3.js';
import { getLinksForWallet, shortWallet } from './tgLinks.js';

export const PROGRAM_ID = '3vJWWymQCHkntbWTgPfL2ujrquLrYHLneqzebr7bnkik';
const COMPLETE_TASK_DISC = Buffer.from([166, 182, 255, 19, 234, 8, 253, 49]);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = process.env.DATA_DIR || (process.env.RAILWAY_ENVIRONMENT ? '/data' : path.join(__dirname, 'data'));
const HELIUS_SEEN_FILE = path.join(DATA_DIR, 'helius-seen.json');

let persistEnabled = true;
try {
  fs.mkdirSync(DATA_DIR, { recursive: true });
} catch (err) {
  persistEnabled = false;
  console.warn(`[events] failed to create data dir ${DATA_DIR}, running in memory-only mode:`, err.message);
}

const seenSignatures = [];
const seenSet = new Set();
const MAX_SEEN = 500;

function loadSeen() {
  if (!persistEnabled || !fs.existsSync(HELIUS_SEEN_FILE)) return;
  try {
    const data = JSON.parse(fs.readFileSync(HELIUS_SEEN_FILE, 'utf-8'));
    if (Array.isArray(data)) {
      for (const sig of data) {
        if (typeof sig === 'string' && !seenSet.has(sig)) {
          seenSignatures.push(sig);
          seenSet.add(sig);
        }
      }
    }
  } catch (err) {
    console.warn(`[events] failed to parse ${HELIUS_SEEN_FILE}, starting empty:`, err.message);
  }
}

function saveSeen() {
  if (!persistEnabled) return;
  try {
    const tmp = `${HELIUS_SEEN_FILE}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(seenSignatures), 'utf-8');
    fs.renameSync(tmp, HELIUS_SEEN_FILE);
  } catch (err) {
    console.error('[events] error saving seen signatures:', err.message);
  }
}

export function isSeen(sig) {
  return seenSet.has(sig);
}

export function markSeen(sig) {
  if (!sig || typeof sig !== 'string' || seenSet.has(sig)) return;
  seenSet.add(sig);
  seenSignatures.push(sig);
  while (seenSignatures.length > MAX_SEEN) {
    const oldest = seenSignatures.shift();
    seenSet.delete(oldest);
  }
  saveSeen();
}

loadSeen();

const TARGET_EVENTS = [
  'ContractorAddedToDeal',
  'DealAcceptedByContractor',
  'TaskCreated',
  'TaskDeposited',
  'TaskAcceptedByContractor',
  'TaskFinished',
  'TaskCompleted',
  'TaskReleasedAfterReview',
  'TaskRefunded',
  'TaskCanceled',
  'DisputeResolved',
  'DealClosed'
];

export const EVENT_DISCRIMINATORS = new Map();
for (const name of TARGET_EVENTS) {
  const hash = crypto.createHash('sha256').update(`event:${name}`).digest().subarray(0, 8);
  EVENT_DISCRIMINATORS.set(hash.toString('hex'), name);
}

export function getComputedDiscriminators() {
  const res = {};
  for (const name of TARGET_EVENTS) {
    const hash = crypto.createHash('sha256').update(`event:${name}`).digest().subarray(0, 8);
    res[name] = Array.from(hash);
  }
  return res;
}

class Reader {
  constructor(buf, offset = 8) {
    this.buf = buf;
    this.o = offset;
  }
  pubkey() {
    const k = new PublicKey(this.buf.subarray(this.o, this.o + 32)).toBase58();
    this.o += 32;
    return k;
  }
  i64() {
    const v = Number(this.buf.readBigInt64LE(this.o));
    this.o += 8;
    return v;
  }
  u8() {
    const v = this.buf.readUInt8(this.o);
    this.o += 1;
    return v;
  }
  bool() {
    const v = Boolean(this.buf.readUInt8(this.o));
    this.o += 1;
    return v;
  }
}

function decodeEventData(name, buf) {
  const r = new Reader(buf, 8);
  switch (name) {
    case 'ContractorAddedToDeal':
      return { deal: r.pubkey(), customer: r.pubkey(), contractor: r.pubkey(), addedAt: r.i64() };
    case 'DealAcceptedByContractor':
      return { deal: r.pubkey(), contractor: r.pubkey(), acceptedAt: r.i64() };
    case 'TaskCreated':
      return { deal: r.pubkey(), creator: r.pubkey(), status: r.u8(), createdAt: r.i64(), taskIndex: r.u8() };
    case 'TaskDeposited':
      return { deal: r.pubkey(), task: r.pubkey(), customer: r.pubkey(), depositedAt: r.i64(), taskIndex: r.u8() };
    case 'TaskAcceptedByContractor':
      return { deal: r.pubkey(), task: r.pubkey(), contractor: r.pubkey(), acceptedAt: r.i64(), taskIndex: r.u8() };
    case 'TaskFinished':
      return { deal: r.pubkey(), task: r.pubkey(), contractor: r.pubkey(), finishedAt: r.i64(), taskIndex: r.u8() };
    case 'TaskCompleted':
      return { deal: r.pubkey(), task: r.pubkey(), customer: r.pubkey(), completedAt: r.i64(), taskIndex: r.u8() };
    case 'TaskReleasedAfterReview':
      return { deal: r.pubkey(), task: r.pubkey(), contractor: r.pubkey(), releasedAt: r.i64(), taskIndex: r.u8() };
    case 'TaskRefunded':
      return { deal: r.pubkey(), task: r.pubkey(), customer: r.pubkey(), refundedAt: r.i64(), taskIndex: r.u8() };
    case 'TaskCanceled':
      return { deal: r.pubkey(), task: r.pubkey(), user: r.pubkey(), closedAt: r.i64(), taskIndex: r.u8() };
    case 'DisputeResolved':
      return { deal: r.pubkey(), task: r.pubkey(), trustAuthority: r.pubkey(), customer: r.pubkey(), contractor: r.pubkey(), customerWin: r.bool(), resolvedAt: r.i64(), taskIndex: r.u8() };
    case 'DealClosed':
      return { deal: r.pubkey(), creator: r.pubkey(), closedAt: r.i64() };
    default:
      return null;
  }
}

function getAccountKey(message, meta, index) {
  if (index === undefined || index === null) return null;
  const accountKeys = message?.accountKeys || [];
  if (index < accountKeys.length) {
    const k = accountKeys[index];
    return typeof k === 'string' ? k : k?.pubkey || k?.toString();
  }
  const loadedWritable = meta?.loadedAddresses?.writable || [];
  const loadedReadonly = meta?.loadedAddresses?.readonly || [];
  const offset = index - accountKeys.length;
  if (offset < loadedWritable.length) return loadedWritable[offset];
  const roOffset = offset - loadedWritable.length;
  if (roOffset < loadedReadonly.length) return loadedReadonly[roOffset];
  return null;
}

const dealCache = new Map();
const defaultConnection = new Connection(process.env.SOLANA_RPC_URL_DEVNET || clusterApiUrl('devnet'), 'confirmed');
let defaultSyncStore = null;

export function setSyncStore(store) {
  defaultSyncStore = store;
}

function getActiveSyncStore(provided) {
  if (provided) return provided;
  if (defaultSyncStore) return defaultSyncStore;
  const syncFile = path.join(DATA_DIR, 'sync-store.json');
  if (fs.existsSync(syncFile)) {
    try {
      const items = JSON.parse(fs.readFileSync(syncFile, 'utf-8'));
      const map = new Map();
      if (Array.isArray(items)) {
        for (const item of items) {
          if (item && item.id) map.set(item.id, item);
        }
      }
      return map;
    } catch {}
  }
  return null;
}

async function resolvePartiesAndAmount(rawEvent, conn, syncStore, forceAmount) {
  const { deal, task, taskIndex } = rawEvent;
  let customer = rawEvent.customer || null;
  let contractor = rawEvent.contractor || null;
  let dealId = null;
  let title = null;

  if (syncStore && deal) {
    for (const item of syncStore.values()) {
      const chainDeal = item?.chain?.deal || item?.deal?.chain?.deal;
      if (chainDeal === deal) {
        dealId = item.id || null;
        title = item.deal?.title || null;
        customer = customer || item.chain?.customer || item.deal?.customer || null;
        contractor = contractor || item.chain?.contractor || item.deal?.contractor || null;
        break;
      }
    }
  }

  if ((!customer || !contractor) && deal) {
    const now = Date.now();
    const cached = dealCache.get(deal);
    if (cached && cached.expiresAt > now) {
      customer = customer || cached.customer;
      contractor = contractor || cached.contractor;
    } else {
      try {
        const info = await conn.getAccountInfo(new PublicKey(deal));
        if (info && info.data && info.data.length >= 104) {
          const cust = new PublicKey(info.data.subarray(40, 72)).toBase58();
          const contKey = new PublicKey(info.data.subarray(72, 104));
          const cont = contKey.equals(PublicKey.default) ? null : contKey.toBase58();
          dealCache.set(deal, { customer: cust, contractor: cont, expiresAt: now + 600000 });
          customer = customer || cust;
          contractor = contractor || cont;
        }
      } catch (err) {
        console.warn(`[events] failed to read deal ${shortWallet(deal)}:`, err.message);
      }
    }
  }

  const isTaskEvent = taskIndex !== undefined && taskIndex !== null;
  let amount = null;

  if (isTaskEvent) {
    const custSub = customer ? getLinksForWallet(customer).length > 0 : false;
    const contSub = contractor ? getLinksForWallet(contractor).length > 0 : false;
    const shouldReadAmount = forceAmount || custSub || contSub;

    if (shouldReadAmount && (task || deal)) {
      try {
        let taskKey = task ? new PublicKey(task) : null;
        if (!taskKey && deal && taskIndex !== undefined) {
          taskKey = PublicKey.findProgramAddressSync(
            [Buffer.from('task'), new PublicKey(deal).toBuffer(), Buffer.from([taskIndex])],
            new PublicKey(PROGRAM_ID)
          )[0];
        }
        if (taskKey) {
          const taskInfo = await conn.getAccountInfo(taskKey);
          if (taskInfo && taskInfo.data && taskInfo.data.length >= 81) {
            const rawAmount = taskInfo.data.readBigUInt64LE(73);
            amount = Number(rawAmount) / 1_000_000;
          }
        }
      } catch (err) {
        console.warn(`[events] failed to read task amount:`, err.message);
      }
    }
  }

  return { dealId, title, customer, contractor, amount };
}

export function onDealEvent({ type, deal, dealId, title, taskIndex, amount, customer, contractor, customerWin, signature }) {
  console.log(
    `[deal-event] ${type} deal:${shortWallet(deal)} customer:${shortWallet(customer)} contractor:${shortWallet(contractor)}${taskIndex !== undefined && taskIndex !== null ? ` task:#${taskIndex}` : ''}${amount !== undefined && amount !== null ? ` amount:${amount}` : ''}`
  );
}

export async function processTransaction(tx, options = {}) {
  if (!tx || typeof tx !== 'object') return [];
  if (tx.meta?.err) return [];

  const signature = tx.signature || tx.transaction?.signatures?.[0] || 'unknown';
  const conn = options.connection || defaultConnection;
  const syncStore = getActiveSyncStore(options.syncStore);
  const forceAmount = Boolean(options.forceAmount);

  const events = [];
  let isDisputeOpened = false;

  const instructions = tx.transaction?.message?.instructions || [];
  for (const ix of instructions) {
    if (!ix || typeof ix.data !== 'string') continue;
    const programId = getAccountKey(tx.transaction.message, tx.meta, ix.programIdIndex);
    if (programId !== PROGRAM_ID) continue;

    let ixData;
    try {
      ixData = Buffer.from(bs58.decode(ix.data));
    } catch {
      continue;
    }

    if (ixData.length >= 10 && ixData.subarray(0, 8).equals(COMPLETE_TASK_DISC)) {
      const taskIndex = ixData[8];
      const approved = ixData[9];
      if (approved === 0) {
        isDisputeOpened = true;
        const customer = getAccountKey(tx.transaction.message, tx.meta, ix.accounts?.[0]);
        const contractor = getAccountKey(tx.transaction.message, tx.meta, ix.accounts?.[1]);
        const deal = getAccountKey(tx.transaction.message, tx.meta, ix.accounts?.[3]);
        const task = getAccountKey(tx.transaction.message, tx.meta, ix.accounts?.[4]);
        events.push({
          type: 'DisputeOpened',
          deal,
          task,
          taskIndex,
          customer,
          contractor
        });
      }
    }
  }

  const logMessages = tx.meta?.logMessages || [];
  const programStack = [];

  for (const log of logMessages) {
    if (log.includes('Log truncated')) {
      console.warn(`[events] Log truncated in tx ${shortWallet(signature) || signature}`);
    }

    const invokeMatch = log.match(/^Program ([1-9A-HJ-NP-Za-km-z]{32,44}) invoke \[(\d+)\]/);
    if (invokeMatch) {
      programStack.push(invokeMatch[1]);
      continue;
    }

    const finishMatch = log.match(/^Program ([1-9A-HJ-NP-Za-km-z]{32,44}) (success|failed)/);
    if (finishMatch) {
      programStack.pop();
      continue;
    }

    if (log.startsWith('Program data: ')) {
      const currentProgram = programStack[programStack.length - 1];
      if (currentProgram !== PROGRAM_ID) continue;

      const base64 = log.slice('Program data: '.length).trim();
      let buf;
      try {
        buf = Buffer.from(base64, 'base64');
      } catch {
        continue;
      }

      if (buf.length < 8) continue;
      const discHex = buf.subarray(0, 8).toString('hex');
      const eventName = EVENT_DISCRIMINATORS.get(discHex);
      if (!eventName) continue;

      if (isDisputeOpened && eventName === 'TaskCompleted') {
        continue;
      }

      try {
        const decoded = decodeEventData(eventName, buf);
        if (decoded) {
          events.push({ type: eventName, ...decoded });
        }
      } catch (err) {
        console.warn(`[events] error decoding ${eventName}:`, err.message);
      }
    }
  }

  const results = [];
  for (const ev of events) {
    const resolved = await resolvePartiesAndAmount(ev, conn, syncStore, forceAmount);
    const finalEvent = {
      type: ev.type,
      deal: ev.deal,
      dealId: resolved.dealId,
      title: resolved.title,
      taskIndex: ev.taskIndex,
      amount: resolved.amount,
      customer: resolved.customer,
      contractor: resolved.contractor,
      customerWin: ev.customerWin,
      signature
    };
    onDealEvent(finalEvent);
    results.push(finalEvent);
  }

  return results;
}

export async function processWebhookBatch(transactions, options = {}) {
  if (!Array.isArray(transactions)) return;
  for (const tx of transactions) {
    if (!tx || typeof tx !== 'object') continue;
    if (tx.meta?.err) continue;
    const signature = tx.signature || tx.transaction?.signatures?.[0];
    if (!signature) continue;
    if (isSeen(signature)) continue;

    try {
      await processTransaction(tx, options);
      markSeen(signature);
    } catch (err) {
      console.error(`[events] error processing tx ${shortWallet(signature)}:`, err.message);
    }
  }
}
