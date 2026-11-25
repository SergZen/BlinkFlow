import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import crypto from 'crypto';
import nacl from 'tweetnacl';
import bs58 from 'bs58';
import { PublicKey } from '@solana/web3.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = process.env.DATA_DIR || (process.env.RAILWAY_ENVIRONMENT ? '/data' : path.join(__dirname, 'data'));
let persistEnabled = true;
try { fs.mkdirSync(DATA_DIR, { recursive: true }); } catch (err) {
  persistEnabled = false;
  console.warn(`[tg-links] failed to create data dir ${DATA_DIR}, running in memory-only mode:`, err.message);
}

const LINKS_FILE = path.join(DATA_DIR, 'tg-links.json');
const linksStore = new Map(); // wallet -> Array<{ chatId, mode, linkedAt }>
const nonces = new Map();     // nonce -> { wallet, message, issued, expiresAt, used }
const linkCodes = new Map();  // code -> { wallet, expiresAt, used }

function loadLinks() {
  if (!persistEnabled || !fs.existsSync(LINKS_FILE)) return;
  try {
    const data = JSON.parse(fs.readFileSync(LINKS_FILE, 'utf-8'));
    if (data && typeof data === 'object') {
      for (const [wallet, entries] of Object.entries(data)) {
        if (Array.isArray(entries)) linksStore.set(wallet, entries.filter(e => e && typeof e.chatId === 'number'));
      }
    }
  } catch (err) {
    console.warn(`[tg-links] failed to parse ${LINKS_FILE}, starting empty:`, err.message);
  }
}

function saveLinks() {
  if (!persistEnabled) return;
  try {
    const obj = {};
    for (const [w, entries] of linksStore.entries()) {
      if (entries.length > 0) obj[w] = entries;
    }
    const tmp = `${LINKS_FILE}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(obj, null, 2), 'utf-8');
    fs.renameSync(tmp, LINKS_FILE);
  } catch (err) {
    console.error('[tg-links] error saving links data:', err.message);
  }
}

function cleanupExpired() {
  const now = Date.now();
  for (const [k, v] of nonces.entries()) { if (now > v.expiresAt || v.used) nonces.delete(k); }
  for (const [k, v] of linkCodes.entries()) { if (now > v.expiresAt || v.used) linkCodes.delete(k); }
}

const MAX_MEMORY_ENTRIES = 1000;

export function shortWallet(wallet) {
  if (!wallet || typeof wallet !== 'string' || wallet.length < 10) return wallet || '';
  return `${wallet.slice(0, 4)}…${wallet.slice(-4)}`;
}

export function createNonce(wallet) {
  cleanupExpired();
  for (const [k, v] of nonces.entries()) {
    if (v.wallet === wallet) nonces.delete(k);
  }
  while (nonces.size >= MAX_MEMORY_ENTRIES) {
    nonces.delete(nonces.keys().next().value);
  }
  const nonce = crypto.randomBytes(16).toString('hex');
  const issued = new Date().toISOString();
  const message = `BlinkFlow: link this wallet to Telegram\nWallet: ${wallet}\nNonce: ${nonce}\nIssued: ${issued}`;
  nonces.set(nonce, { wallet, message, issued, expiresAt: Date.now() + 600000, used: false });
  return { nonce, message };
}

export function consumeNonce(nonce, wallet) {
  cleanupExpired();
  if (!nonce || typeof nonce !== 'string') return null;
  const entry = nonces.get(nonce);
  if (!entry || entry.used || Date.now() > entry.expiresAt || entry.wallet !== wallet) {
    if (entry) nonces.delete(nonce);
    return null;
  }
  entry.used = true;
  nonces.delete(nonce);
  return entry;
}

export function verifySignature(wallet, message, signatureBase58) {
  try {
    const pubkey = new PublicKey(wallet);
    return nacl.sign.detached.verify(new TextEncoder().encode(message), bs58.decode(signatureBase58), pubkey.toBytes());
  } catch {
    return false;
  }
}

export function createLinkCode(wallet) {
  cleanupExpired();
  while (linkCodes.size >= MAX_MEMORY_ENTRIES) {
    linkCodes.delete(linkCodes.keys().next().value);
  }
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let code = '';
  for (let i = 0; i < 8; i++) code += chars[crypto.randomInt(0, chars.length)];
  linkCodes.set(code, { wallet, expiresAt: Date.now() + 600000, used: false });
  return code;
}

export function consumeLinkCode(code) {
  cleanupExpired();
  if (!code || typeof code !== 'string') return null;
  const key = code.toLowerCase();
  const entry = linkCodes.get(key);
  if (!entry || entry.used || Date.now() > entry.expiresAt) {
    if (entry) linkCodes.delete(key);
    return null;
  }
  entry.used = true;
  linkCodes.delete(key);
  return entry.wallet;
}

export function addLink(wallet, chatId, mode = 'all') {
  const cid = Number(chatId);
  const entries = linksStore.get(wallet) || [];
  const existing = entries.find(e => e.chatId === cid);
  if (existing) {
    existing.linkedAt = new Date().toISOString();
  } else {
    const hasExistingLinks = getWalletsForChat(cid).length > 0;
    const linkMode = hasExistingLinks ? getChatMode(cid) : (mode === 'key' ? 'key' : 'all');
    entries.push({ chatId: cid, mode: linkMode, linkedAt: new Date().toISOString() });
  }
  linksStore.set(wallet, entries);
  saveLinks();
}

export function removeLink(wallet, chatId) {
  const cid = Number(chatId);
  const entries = linksStore.get(wallet);
  if (!entries) return;
  const filtered = entries.filter(e => e.chatId !== cid);
  if (filtered.length > 0) linksStore.set(wallet, filtered);
  else linksStore.delete(wallet);
  saveLinks();
}

export function removeAllLinksForChat(chatId) {
  const cid = Number(chatId);
  for (const [w, entries] of linksStore.entries()) {
    const filtered = entries.filter(e => e.chatId !== cid);
    if (filtered.length > 0) linksStore.set(w, filtered);
    else linksStore.delete(w);
  }
  saveLinks();
}

export function getWalletsForChat(chatId) {
  const cid = Number(chatId);
  const res = [];
  for (const [w, entries] of linksStore.entries()) {
    if (entries.some(e => e.chatId === cid)) res.push(w);
  }
  return res;
}

export function getLinksForWallet(wallet) {
  return linksStore.get(wallet) || [];
}

export function getChatMode(chatId) {
  const cid = Number(chatId);
  for (const entries of linksStore.values()) {
    const found = entries.find(e => e.chatId === cid);
    if (found) return found.mode || 'all';
  }
  return 'all';
}

export function setChatMode(chatId, mode) {
  const cid = Number(chatId);
  const valid = mode === 'key' ? 'key' : 'all';
  let changed = false;
  for (const entries of linksStore.values()) {
    for (const e of entries) {
      if (e.chatId === cid) { e.mode = valid; changed = true; }
    }
  }
  if (changed) saveLinks();
}

loadLinks();
