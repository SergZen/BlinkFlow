const API = (((import.meta as any).env?.VITE_ACTIONS_API_URL as string) || 'http://localhost:3001').replace(/\/$/, '');

export interface Application {
  wallet: string;
  note: string;
  createdAt: number;
}

export async function listApplications(dealId: string): Promise<Application[]> {
  try {
    const res = await fetch(`${API}/api/sync/deals/${encodeURIComponent(dealId)}/applications`);
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

export async function applyToDeal(dealId: string, wallet: string, note = ''): Promise<void> {
  const res = await fetch(`${API}/api/sync/deals/${encodeURIComponent(dealId)}/applications`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ wallet, note }),
  });
  if (!res.ok) {
    let msg = 'Could not send the application';
    try {
      const data = await res.json();
      if (data?.error && typeof data.error === 'string') msg = data.error;
    } catch {
      // ignore
    }
    throw new Error(msg);
  }
}

export async function withdrawApplication(dealId: string, wallet: string): Promise<void> {
  try {
    await fetch(`${API}/api/sync/deals/${encodeURIComponent(dealId)}/applications/withdraw`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ wallet }),
    });
  } catch {
    // ignore failures silently
  }
}
