import { PublicKey } from '@solana/web3.js';

export interface DealLinkStage {
  title: string;
  amount: string;
  criteria?: string;
  deadline: string;
  reqFile?: { name: string; sha256: string } | null;
}

export interface DealLinkData {
  contractorWallet: string;
  title: string;
  amount: string;
  criteria?: string;
  deadline: string;
  reqFile?: { name: string; sha256: string } | null;
  dealTitle?: string | null;
  dealDescription?: string | null;
  extraStages?: DealLinkStage[];
}

export interface ParsedDealStage {
  title: string;
  amount: string;
  criteria: string;
  deadline: string;
  deadlineAdjusted: boolean;
  reqFile: { name: string; sha256: string } | null;
}

export interface ParsedDealLink {
  contractorWallet: string;
  title: string;
  amount: string;
  criteria: string;
  deadline: string;
  deadlineAdjusted: boolean;
  reqFile: { name: string; sha256: string } | null;
  dealTitle: string | null;
  dealDescription: string | null;
  extraStages: ParsedDealStage[];
}

function toBase64Url(str: string): string {
  const bytes = new TextEncoder().encode(str);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function fromBase64Url(str: string): string {
  let base64 = str.replace(/-/g, '+').replace(/_/g, '/');
  while (base64.length % 4 !== 0) {
    base64 += '=';
  }
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new TextDecoder().decode(bytes);
}

function checkDeadline(raw: any): { deadline: string; deadlineAdjusted: boolean } {
  if (typeof raw !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    return { deadline: '', deadlineAdjusted: true };
  }
  const parts = raw.split('-').map(Number);
  const parsed = new Date(parts[0], parts[1] - 1, parts[2]);
  if (
    parsed.getFullYear() !== parts[0] ||
    parsed.getMonth() !== parts[1] - 1 ||
    parsed.getDate() !== parts[2]
  ) {
    return { deadline: '', deadlineAdjusted: true };
  }
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const maxAllowed = new Date(today);
  maxAllowed.setDate(maxAllowed.getDate() + 365);
  maxAllowed.setHours(23, 59, 59, 999);
  if (parsed < today || parsed > maxAllowed) {
    return { deadline: '', deadlineAdjusted: true };
  }
  return { deadline: raw, deadlineAdjusted: false };
}

function parseFile(raw: any): { name: string; sha256: string } | null {
  if (!raw || typeof raw !== 'object') return null;
  const name = typeof raw.n === 'string' ? raw.n.slice(0, 120) : '';
  const hash = typeof raw.h === 'string' && /^[0-9a-fA-F]{64}$/.test(raw.h) ? raw.h.toLowerCase() : '';
  if (!name || !hash) return null;
  return { name, sha256: hash };
}

export function buildDealLink(data: DealLinkData): string {
  const compactPayload: any = {
    v: 1,
    c: data.contractorWallet,
    t: data.title.trim().slice(0, 100),
    a: data.amount,
    cr: (data.criteria || '').trim(),
    dl: data.deadline,
    f: data.reqFile ? { n: data.reqFile.name.slice(0, 120), h: data.reqFile.sha256 } : null,
    dt: data.dealTitle ? data.dealTitle.trim().slice(0, 100) : null,
    dd: data.dealDescription ? data.dealDescription.trim().slice(0, 500) : null,
    st: (data.extraStages || []).slice(0, 4).map((s) => ({
      t: s.title.trim().slice(0, 100),
      a: s.amount,
      cr: (s.criteria || '').trim(),
      dl: s.deadline,
      f: s.reqFile ? { n: s.reqFile.name.slice(0, 120), h: s.reqFile.sha256 } : null,
    })),
  };

  const jsonStr = JSON.stringify(compactPayload);
  const payload = toBase64Url(jsonStr);
  const origin = typeof window !== 'undefined' && window.location?.origin ? window.location.origin : 'http://localhost:5173';
  const url = `${origin}/?new=1&role=customer&d=${payload}`;

  if (url.length > 3500) {
    throw new Error('The terms are too long for a link. Shorten the criteria or use fewer stages.');
  }

  return url;
}

export function parseDealLink(search: string): ParsedDealLink | null {
  try {
    let dParam = search;
    if (search.includes('d=')) {
      const qIndex = search.indexOf('?');
      const queryString = qIndex !== -1 ? search.slice(qIndex) : (search.startsWith('?') ? search : `?${search}`);
      const sp = new URLSearchParams(queryString);
      dParam = sp.get('d') || '';
    } else if (search.startsWith('?')) {
      const sp = new URLSearchParams(search);
      dParam = sp.get('d') || '';
    }

    if (!dParam) return null;

    const jsonStr = fromBase64Url(dParam);
    const obj = JSON.parse(jsonStr);

    if (!obj || typeof obj !== 'object' || obj.v !== 1) {
      return null;
    }

    if (typeof obj.c !== 'string') return null;
    try {
      new PublicKey(obj.c);
    } catch {
      return null;
    }

    if (typeof obj.t !== 'string') return null;
    const title = obj.t.trim().slice(0, 100);
    if (!title) return null;

    const parsedAmount = typeof obj.a === 'string' || typeof obj.a === 'number' ? Number(obj.a) : NaN;
    if (!isFinite(parsedAmount) || parsedAmount < 0.01 || parsedAmount > 1000000) {
      return null;
    }
    const amount = String(parsedAmount);

    const criteria = typeof obj.cr === 'string' ? obj.cr.trim().slice(0, 500) : '';

    const dlCheck = checkDeadline(obj.dl);

    const reqFile = parseFile(obj.f);

    const dealTitle = typeof obj.dt === 'string' && obj.dt.trim() ? obj.dt.trim().slice(0, 100) : null;
    const dealDescription = typeof obj.dd === 'string' && obj.dd.trim() ? obj.dd.trim().slice(0, 500) : null;

    const extraStages: ParsedDealStage[] = [];
    if (Array.isArray(obj.st)) {
      for (const st of obj.st.slice(0, 4)) {
        if (!st || typeof st !== 'object') return null;
        if (typeof st.t !== 'string') return null;
        const stTitle = st.t.trim().slice(0, 100);
        if (!stTitle) return null;

        const stAmountNum = typeof st.a === 'string' || typeof st.a === 'number' ? Number(st.a) : NaN;
        if (!isFinite(stAmountNum) || stAmountNum < 0.01 || stAmountNum > 1000000) {
          return null;
        }
        const stAmount = String(stAmountNum);

        const stCriteria = typeof st.cr === 'string' ? st.cr.trim().slice(0, 500) : '';
        const stDlCheck = checkDeadline(st.dl);
        const stFile = parseFile(st.f);

        extraStages.push({
          title: stTitle,
          amount: stAmount,
          criteria: stCriteria,
          deadline: stDlCheck.deadline,
          deadlineAdjusted: stDlCheck.deadlineAdjusted,
          reqFile: stFile,
        });
      }
    }

    return {
      contractorWallet: obj.c,
      title,
      amount,
      criteria,
      deadline: dlCheck.deadline,
      deadlineAdjusted: dlCheck.deadlineAdjusted,
      reqFile,
      dealTitle,
      dealDescription,
      extraStages,
    };
  } catch {
    return null;
  }
}
