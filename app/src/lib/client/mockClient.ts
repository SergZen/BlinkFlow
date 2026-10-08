import { BlinkflowClient } from './types';
import { Deal, Task, TaskStatus } from '../types';
import { seedDeals } from '../../mockData';

// In-memory store
let deals: Deal[] = [...seedDeals];

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

const createHash = async (text: string) => {
  const encoder = new TextEncoder();
  const data = encoder.encode(text);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
};

const getNow = () => new Date().toISOString().split('T')[0];

// ASSUMPTION: verify against the real program
export const mockClient: BlinkflowClient = {
  async listDeals() {
    await delay(300);
    return JSON.parse(JSON.stringify(deals));
  },
  
  async getDeal(id: string) {
    await delay(300);
    const deal = deals.find(d => d.id === id);
    return deal ? JSON.parse(JSON.stringify(deal)) : null;
  },

  async createDeal(input) {
    await delay(300);
    const id = `ESC-${Math.floor(1000 + Math.random() * 9000)}`;
    const taskHash = await createHash(JSON.stringify({ title: input.title, successCriteria: input.successCriteria }));
    const now = getNow();
    
    const task: Task = {
      taskIndex: 0,
      amount: input.amount,
      status: input.role === 'customer' ? 'CustomerCreated' : 'ContractorCreated',
      taskHash,
      solutionHash: null,
      solutionNote: null,
      deadline: input.deadline,
      createdAt: now,
      deposited: false,
      meta: { title: input.title, successCriteria: input.successCriteria }
    };

    const newDeal: Deal = {
      id,
      creator: input.wallet,
      customer: input.role === 'customer' ? input.wallet : null,
      contractor: input.role === 'contractor' ? input.wallet : null,
      createdAt: now,
      tasks: [task],
      history: [{ date: now, action: 'Deal Created' }]
    };
    
    deals.push(newDeal);
    return JSON.parse(JSON.stringify(newDeal));
  },

  async acceptDeal(dealId, wallet) {
    await delay(300);
    const deal = deals.find(d => d.id === dealId);
    if (!deal) throw new Error("Deal not found");
    
    if (!deal.contractor && deal.customer !== wallet) {
      deal.contractor = wallet;
      deal.history.push({ date: getNow(), action: 'Contractor Assigned' });
    } else if (!deal.customer && deal.contractor !== wallet) {
      deal.customer = wallet;
      deal.history.push({ date: getNow(), action: 'Customer Assigned' });
    }
    return JSON.parse(JSON.stringify(deal));
  },

  async addTask(dealId, input) {
    await delay(300);
    const deal = deals.find(d => d.id === dealId);
    if (!deal) throw new Error("Deal not found");

    const taskHash = await createHash(JSON.stringify({ title: input.title, successCriteria: input.successCriteria }));
    const task: Task = {
      taskIndex: deal.tasks.length,
      amount: input.amount,
      status: input.role === 'customer' ? 'CustomerCreated' : 'ContractorCreated',
      taskHash,
      solutionHash: null,
      solutionNote: null,
      deadline: input.deadline,
      createdAt: getNow(),
      deposited: false,
      meta: { title: input.title, successCriteria: input.successCriteria }
    };
    deal.tasks.push(task);
    deal.history.push({ date: getNow(), action: 'Task Added' });
    return JSON.parse(JSON.stringify(deal));
  },

  async depositTask(dealId, taskIndex, wallet) {
    await delay(300);
    const deal = deals.find(d => d.id === dealId);
    if (!deal) throw new Error("Deal not found");
    const task = deal.tasks[taskIndex];
    if (!task) throw new Error("Task not found");

    if (!deal.customer) {
      deal.customer = wallet;
    }
    task.deposited = true;
    task.status = 'Started';
    deal.history.push({ date: getNow(), action: 'Task Deposited' });
    return JSON.parse(JSON.stringify(deal));
  },

  async finishTask(dealId, taskIndex, solutionNote) {
    await delay(300);
    const deal = deals.find(d => d.id === dealId);
    if (!deal) throw new Error("Deal not found");
    const task = deal.tasks[taskIndex];
    if (!task) throw new Error("Task not found");

    task.status = 'Finished';
    task.solutionNote = solutionNote;
    task.solutionHash = await createHash(solutionNote);
    deal.history.push({ date: getNow(), action: 'Work Submitted by Contractor' });
    return JSON.parse(JSON.stringify(deal));
  },

  async completeTask(dealId, taskIndex, approved) {
    await delay(300);
    const deal = deals.find(d => d.id === dealId);
    if (!deal) throw new Error("Deal not found");
    const task = deal.tasks[taskIndex];
    if (!task) throw new Error("Task not found");

    if (approved) {
      task.status = 'Completed';
      deal.history.push({ date: getNow(), action: 'Funds Released by Customer' });
    } else {
      task.status = 'Disputed';
      deal.history.push({ date: getNow(), action: 'Dispute Raised by Customer' });
    }
    return JSON.parse(JSON.stringify(deal));
  },

  async cancelTask(dealId, taskIndex) {
    await delay(300);
    const deal = deals.find(d => d.id === dealId);
    if (!deal) throw new Error("Deal not found");
    const task = deal.tasks[taskIndex];
    if (!task) throw new Error("Task not found");

    task.status = 'Cancelled';
    deal.history.push({ date: getNow(), action: 'Task Cancelled' });
    return JSON.parse(JSON.stringify(deal));
  },

  async resolveDispute(dealId, taskIndex, customerWins) {
    await delay(300);
    const deal = deals.find(d => d.id === dealId);
    if (!deal) throw new Error("Deal not found");
    const task = deal.tasks[taskIndex];
    if (!task) throw new Error("Task not found");

    task.status = 'Resolved';
    deal.history.push({ date: getNow(), action: `Dispute Resolved (${customerWins ? 'Customer' : 'Contractor'} won)` });
    return JSON.parse(JSON.stringify(deal));
  }
};
