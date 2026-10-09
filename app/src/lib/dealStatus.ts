import { Deal, DealStatus, Task } from './types';

export const dealTotal = (deal: Deal): number => {
  return deal.tasks
    .filter(t => t.status !== 'Cancelled')
    .reduce((sum, t) => sum + t.amount, 0);
};

export const dealDoneCount = (deal: Deal): number => {
  return deal.tasks.filter(t => t.status === 'Completed' || t.status === 'Resolved').length;
};

export const dealTaskCount = (deal: Deal): number => {
  return deal.tasks.filter(t => t.status !== 'Cancelled').length;
};

export const dealEscrowTotal = (deal: Deal): number => {
  return deal.tasks
    .filter(t => t.deposited && ['Started', 'Finished', 'Disputed'].includes(t.status))
    .reduce((sum, t) => sum + t.amount, 0);
};

export const getEarliestDeadline = (deal: Deal): string => {
  const activeTasks = deal.tasks.filter(t => t.status !== 'Cancelled' && t.status !== 'Completed' && t.status !== 'Resolved' && t.deadline && t.deadline !== 'TBD');
  if (activeTasks.length === 0) {
    const lastTask = [...deal.tasks].reverse().find(t => t.status !== 'Cancelled');
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
    case 'Cancelled': return 'cancelled';
    case 'CustomerCreated':
    case 'ContractorCreated':
      return task.deposited ? 'in_progress' : 'awaiting_funding';
    default: return 'in_progress';
  }
};

export const deriveDealStatus = (deal: Deal): DealStatus => {
  const tasks = deal.tasks;
  if (tasks.length === 0 || tasks.every(t => t.status === 'Cancelled')) return 'cancelled';
  if (tasks.some(t => t.status === 'Disputed')) return 'dispute';
  if (tasks.some(t => t.status === 'Finished')) return 'pending_approval';
  
  const activeTasks = tasks.filter(t => t.status !== 'Cancelled');
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
