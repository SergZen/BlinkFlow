export type TaskStatus = 'CustomerCreated' | 'ContractorCreated' | 'Started' | 'Finished' | 'Disputed' | 'Resolved' | 'Completed' | 'Cancelled';

export type DealStatus = 'searching' | 'in_progress' | 'pending_approval' | 'dispute' | 'completed' | 'cancelled' | 'awaiting_funding';

export interface TaskMeta {
  title: string;
  successCriteria: string;
}

export interface Task {
  taskIndex: number;
  amount: number; /* whole USDC */
  status: TaskStatus;
  taskHash: string;
  solutionHash: string | null;
  solutionNote: string | null;
  deadline: string; /* ISO date */
  createdAt: string;
  deposited: boolean;
  meta: TaskMeta;
}

export interface Deal {
  id: string;
  creator: string;
  customer: string | null;
  contractor: string | null;
  createdAt: string;
  tasks: Task[];
  history: { date: string; action: string }[];
}
