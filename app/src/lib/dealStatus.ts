import { Deal, DealStatus, Task, TaskStatus } from './types';

export const dealTotal = (deal: Deal): number => {
  return deal.tasks
    .filter(t => t.status !== 'Cancelled' && t.status !== 'Refunded')
    .reduce((sum, t) => sum + t.amount, 0);
};

export const dealDoneCount = (deal: Deal): number => {
  return deal.tasks.filter(t => t.status === 'Completed' || t.status === 'Resolved').length;
};

export const dealTaskCount = (deal: Deal): number => {
  return deal.tasks.filter(t => t.status !== 'Cancelled' && t.status !== 'Refunded').length;
};

export const dealEscrowTotal = (deal: Deal): number => {
  return deal.tasks
    .filter(t => t.deposited && ['CustomerCreated', 'ContractorCreated', 'Started', 'Finished', 'Disputed'].includes(t.status))
    .reduce((sum, t) => sum + t.amount, 0);
};

export const getEarliestDeadline = (deal: Deal): string => {
  const activeTasks = deal.tasks.filter(t => t.status !== 'Cancelled' && t.status !== 'Refunded' && t.status !== 'Completed' && t.status !== 'Resolved' && t.deadline && t.deadline !== 'TBD');
  if (activeTasks.length === 0) {
    const lastTask = [...deal.tasks].reverse().find(t => t.status !== 'Cancelled' && t.status !== 'Refunded');
    return lastTask?.deadline || 'TBD';
  }
  const sorted = [...activeTasks].sort((a, b) => new Date(a.deadline).getTime() - new Date(b.deadline).getTime());
  return sorted[0].deadline;
};

export const taskStatusLabel = (task: Task): string => {
  switch (task.status) {
    case 'Disputed': return 'Disputed';
    case 'Finished': return 'Submitted';
    case 'Started': return 'In Progress';
    case 'Completed': return 'Completed';
    case 'Resolved':
      if (task.disputeResult === 'customer') return 'Resolved · Refunded';
      if (task.disputeResult === 'contractor') return 'Resolved · Paid out';
      return 'Resolved';
    case 'Cancelled': return 'Cancelled';
    case 'Refunded': return 'Refunded';
    case 'CustomerCreated':
    case 'ContractorCreated':
      return task.deposited ? 'Funded' : 'Awaiting Funding';
    default: return task.status;
  }
};

export const taskStatusKind = (task: Task): DealStatus => {
  switch (task.status) {
    case 'Disputed': return 'dispute';
    case 'Finished': return 'pending_approval';
    case 'Started': return 'in_progress';
    case 'Completed': return 'completed';
    case 'Resolved':
      if (task.disputeResult === 'customer') return 'resolved_refunded';
      if (task.disputeResult === 'contractor') return 'resolved_paid_out';
      return 'resolved';
    case 'Cancelled':
    case 'Refunded':
      return 'cancelled';
    case 'CustomerCreated':
    case 'ContractorCreated':
      return task.deposited ? 'in_progress' : 'awaiting_funding';
    default: return 'in_progress';
  }
};

export const deriveDealStatus = (deal: Deal): DealStatus => {
  const tasks = deal.tasks;
  if (tasks.length === 0 || tasks.every(t => t.status === 'Cancelled' || t.status === 'Refunded')) return 'cancelled';
  if (tasks.some(t => t.status === 'Disputed')) return 'dispute';
  if (tasks.some(t => t.status === 'Finished')) return 'pending_approval';
  
  const activeTasks = tasks.filter(t => t.status !== 'Cancelled' && t.status !== 'Refunded');
  if (activeTasks.length > 0 && activeTasks.every(t => t.status === 'Completed' || t.status === 'Resolved')) {
    if (activeTasks.some(t => t.status === 'Resolved')) {
      const resolvedTasks = activeTasks.filter(t => t.status === 'Resolved');
      if (resolvedTasks.every(t => t.disputeResult === 'customer')) return 'resolved_refunded';
      if (resolvedTasks.every(t => t.disputeResult === 'contractor')) return 'resolved_paid_out';
      return 'resolved';
    }
    return 'completed';
  }
  
  if (!deal.contractor) return 'searching';
  if (!activeTasks.some(t => t.deposited)) return 'awaiting_funding';
  
  return 'in_progress';
};

export interface DealTaskSummary {
  total: number;
  done: number;
  open: number;
  cancelled: number;
}

export const dealTaskSummary = (deal: Deal): DealTaskSummary => {
  const total = deal.tasks?.length ?? 0;
  let done = 0;
  let cancelled = 0;
  let open = 0;
  for (const t of deal.tasks ?? []) {
    if (t.status === 'Completed' || t.status === 'Resolved') {
      done++;
    } else if (t.status === 'Cancelled' || t.status === 'Refunded') {
      cancelled++;
    } else {
      open++;
    }
  }
  return { total, done, open, cancelled };
};

export const formatDealTaskSummary = (deal: Deal): string => {
  const { total, done, open, cancelled } = dealTaskSummary(deal);
  const taskWord = total === 1 ? '1 task' : `${total} tasks`;
  let text = `${deal.id} · ${taskWord} · ${done} done · ${open} open`;
  if (cancelled > 0) {
    text += ` · ${cancelled} cancelled`;
  }
  return text;
};

export const isResolvedStatus = (status: DealStatus): boolean => {
  return status === 'resolved' || status === 'resolved_refunded' || status === 'resolved_paid_out';
};

export const isDealActive = (deal: Deal): boolean => {
  const status = deriveDealStatus(deal);
  return status !== 'completed' && status !== 'cancelled' && !isResolvedStatus(status);
};

export const FINAL_TASK_STATUSES = new Set<TaskStatus>(['Completed', 'Resolved', 'Cancelled', 'Refunded']);

export const isDealFinalized = (deal: Deal): boolean => {
  return (deal.tasks?.length ?? 0) > 0 && deal.tasks.every(t => FINAL_TASK_STATUSES.has(t.status));
};

export const canDealBeClosed = (
  deal: Deal,
  wallet: string | null,
  isChain: boolean = true,
  hasChainInfo: boolean = true
): boolean => {
  if (!wallet) return false;
  if (!isChain || !hasChainInfo) return false;
  const isParticipant = deal.customer === wallet || deal.contractor === wallet || deal.creator === wallet;
  if (!isParticipant) return false;
  return isDealFinalized(deal);
};

export const dealNeedsMyAction = (
  deal: Deal,
  wallet: string | null,
  closedState?: 'open' | 'closed' | 'unknown'
): boolean => {
  if (!wallet) return false;

  const isCustomer = deal.customer === wallet;
  const isContractor = deal.contractor === wallet;

  if (isCustomer) {
    // - a task is Finished (work submitted): approve or dispute;
    if (deal.tasks.some(t => t.status === 'Finished')) return true;
    // - a task is ContractorCreated and not deposited (proposal from the contractor): fund it;
    if (deal.tasks.some(t => t.status === 'ContractorCreated' && !t.deposited)) return true;
    // - the deal has no contractor yet and is not cancelled: assign a contractor.
    if (!deal.contractor && deriveDealStatus(deal) !== 'cancelled') return true;
  }

  if (isContractor) {
    // - a task is CustomerCreated or ContractorCreated, deposited, not started: start it
    if (deal.tasks.some(t => (t.status === 'CustomerCreated' || t.status === 'ContractorCreated') && t.deposited)) {
      return true;
    }
    // - a task is Started: submit work.
    if (deal.tasks.some(t => t.status === 'Started')) return true;
  }

  // Either wallet, only after the closed state is known: all tasks are in a final status and the deal state is 'open'
  // AND the wallet is the deal creator: close the deal. (Skip this rule while the state is unknown or not loaded.)
  const effectiveClosedState = deal.closed ? 'closed' : closedState;
  if (effectiveClosedState === 'open' && deal.creator === wallet) {
    if (isDealFinalized(deal)) {
      return true;
    }
  }

  return false;
};

export const dealsNeedingMyAction = (
  deals: Deal[],
  wallet: string | null,
  closedStates?: Record<string, 'open' | 'closed' | 'unknown'>
): Deal[] => {
  if (!wallet) return [];
  return deals.filter(deal => dealNeedsMyAction(deal, wallet, closedStates?.[deal.id]));
};

