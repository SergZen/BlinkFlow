import { Deal } from '../types';
import { Role } from '../../RoleContext';

export interface BlinkflowClient {
  listDeals(): Promise<Deal[]>;
  getDeal(id: string): Promise<Deal | null>;
  createDeal(input: { role: Role; wallet: string; title: string; successCriteria: string; amount: number; deadline: string; contractorWallet?: string }): Promise<Deal>;
  acceptDeal(dealId: string, wallet: string): Promise<Deal>;
  addTask(dealId: string, input: { role: Role; title: string; successCriteria: string; amount: number; deadline: string }): Promise<Deal>;
  depositTask(dealId: string, taskIndex: number, wallet: string): Promise<Deal>;
  finishTask(dealId: string, taskIndex: number, solutionNote: string): Promise<Deal>;
  completeTask(dealId: string, taskIndex: number, approved: boolean): Promise<Deal>;
  cancelTask(dealId: string, taskIndex: number): Promise<Deal>;
  resolveDispute(dealId: string, taskIndex: number, customerWins: boolean): Promise<Deal>;
}
