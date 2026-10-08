import { Deal, DealStatus } from './types';

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
  const activeTasks = deal.tasks.filter(t => t.status !== 'Cancelled' && t.deadline && t.deadline !== 'TBD');
  if (activeTasks.length === 0) {
    const tbdTask = deal.tasks.find(t => t.status !== 'Cancelled');
    return tbdTask?.deadline || 'TBD';
  }
  const sorted = [...activeTasks].sort((a, b) => new Date(a.deadline).getTime() - new Date(b.deadline).getTime());
  return sorted[0].deadline;
};

export const deriveDealStatus = (deal: Deal): DealStatus => {
  const tasks = deal.tasks;
  if (tasks.length === 0 || tasks.every(t => t.status === 'Cancelled')) return 'cancelled';
  if (tasks.some(t => t.status === 'Disputed')) return 'dispute';
  if (tasks.some(t => t.status === 'Finished')) return 'pending_approval';
  
  const activeTasks = tasks.filter(t => t.status !== 'Cancelled');
  if (activeTasks.length > 0 && activeTasks.every(t => t.status === 'Completed' || t.status === 'Resolved')) {
    return 'completed';
  }
  
  if (!deal.contractor) return 'searching';
  if (!activeTasks.some(t => t.deposited)) return 'awaiting_funding';
  
  return 'in_progress';
};
