import { Deal, TaskStatus, Task } from './lib/types';

// Helper to map old status to new task status
const mapStatus = (old: string): TaskStatus => {
  switch (old) {
    case 'searching': return 'CustomerCreated';
    case 'in_progress': return 'Started';
    case 'pending_approval': return 'Finished';
    case 'dispute': return 'Disputed';
    case 'completed': return 'Completed';
    case 'cancelled': return 'Cancelled';
    default: return 'CustomerCreated';
  }
};

const createMockTask = (title: string, amount: number, oldStatus: string, deadline: string, successCriteria: string): Task => ({
  taskIndex: 0,
  amount,
  status: mapStatus(oldStatus),
  taskHash: 'mock-hash',
  solutionHash: null,
  solutionNote: null,
  deadline,
  createdAt: '2026-08-01',
  deposited: oldStatus !== 'searching',
  meta: { title, successCriteria }
});

export const seedDeals: Deal[] = [
  {
    id: 'ESC-1001',
    creator: '7a2BbKdYm1q3f1cWv8xN9aZ',
    customer: '7a2BbKdYm1q3f1cWv8xN9aZ',
    contractor: '3b9CjLmNq8d2aWv9xN4aZ',
    createdAt: '2026-09-15',
    tasks: [createMockTask('Startup Logo Design', 1500, 'in_progress', '2026-10-15', 'Provide at least 3 vector logo variants, a PDF brandbook, and source files (.ai, .svg).')],
    history: [
      { date: '2026-09-15', action: 'Deal Created' },
      { date: '2026-09-16', action: 'Contractor Assigned' },
    ]
  },
  {
    id: 'ESC-1002',
    creator: '1c4DxNyZa99aaWv8xN7bY',
    customer: '1c4DxNyZa99aaWv8xN7bY',
    contractor: null,
    createdAt: '2026-09-20',
    tasks: [createMockTask('SEO Article Writing', 150, 'searching', '2026-09-25', '2000-word article about Solana benefits. 95%+ uniqueness, 2-3% keyword density.')],
    history: []
  },
  {
    id: 'ESC-1003',
    creator: '992FyTbNq11bbWv7xM5cY',
    customer: '992FyTbNq11bbWv7xM5cY',
    contractor: '3b9CjLmNq8d2aWv9xN4aZ',
    createdAt: '2026-09-10',
    tasks: [createMockTask('Landing Page Development', 500, 'pending_approval', '2026-09-18', 'Fully responsive landing page on React/Tailwind, deployed to Vercel or GitHub Pages.')],
    history: [
      { date: '2026-09-10', action: 'Deal Created' },
      { date: '2026-09-11', action: 'Contractor Assigned' },
      { date: '2026-09-18', action: 'Work Submitted by Contractor' },
    ]
  },
  {
    id: 'ESC-1004',
    creator: '2a1GxMwZa4c4cWv6yL3dX',
    customer: '2a1GxMwZa4c4cWv6yL3dX',
    contractor: '3b9CjLmNq8d2aWv9xN4aZ',
    createdAt: '2026-08-15',
    tasks: [createMockTask('Documentation Translation', 300, 'completed', '2026-08-30', 'Translation of 10 pages of technical documentation from English to Spanish.')],
    history: [
      { date: '2026-08-15', action: 'Deal Created' },
      { date: '2026-08-16', action: 'Contractor Assigned' },
      { date: '2026-08-28', action: 'Work Submitted by Contractor' },
      { date: '2026-08-29', action: 'Funds Released by Customer' },
    ]
  },
  {
    id: 'ESC-1005',
    creator: '7a2BbKdYm1q3f1cWv8xN9aZ',
    customer: '7a2BbKdYm1q3f1cWv8xN9aZ',
    contractor: '3b9CjLmNq8d2aWv9xN4aZ',
    createdAt: '2026-08-20',
    tasks: [createMockTask('Promo Video Editing', 800, 'dispute', '2026-09-10', 'Edit a 30-second TikTok/Reels video with dynamic subtitles and royalty-free music.')],
    history: [
      { date: '2026-08-20', action: 'Deal Created' },
      { date: '2026-08-21', action: 'Contractor Assigned' },
      { date: '2026-09-09', action: 'Work Submitted by Contractor' },
      { date: '2026-09-11', action: 'Dispute Raised by Customer' },
    ]
  }
];
