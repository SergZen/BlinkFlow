export type DealStatus = 'searching' | 'in_progress' | 'pending_approval' | 'dispute' | 'completed' | 'cancelled';

export interface Deal {
  id: string;
  title: string;
  customer: string;
  contractor: string | null;
  amount: number;
  status: DealStatus;
  deadline: string;
  successCriteria: string;
  history?: { date: string; action: string }[];
}

export const mockDeals: Deal[] = [
  {
    id: 'ESC-1001',
    title: 'Startup Logo Design',
    customer: '7a2BbKdYm1q3f1cWv8xN9aZ',
    contractor: '3b9CjLmNq8d2aWv9xN4aZ',
    amount: 1500,
    status: 'in_progress',
    deadline: '2026-10-15',
    successCriteria: 'Provide at least 3 vector logo variants, a PDF brandbook, and source files (.ai, .svg).',
    history: [
      { date: '2026-09-15', action: 'Deal Created' },
      { date: '2026-09-16', action: 'Contractor Assigned' },
    ]
  },
  {
    id: 'ESC-1002',
    title: 'SEO Article Writing',
    customer: '1c4DxNyZa99aaWv8xN7bY',
    contractor: null,
    amount: 150,
    status: 'searching',
    deadline: '2026-09-25',
    successCriteria: '2000-word article about Solana benefits. 95%+ uniqueness, 2-3% keyword density.',
  },
  {
    id: 'ESC-1003',
    title: 'Landing Page Development',
    customer: '992FyTbNq11bbWv7xM5cY',
    contractor: '3b9CjLmNq8d2aWv9xN4aZ',
    amount: 500,
    status: 'pending_approval',
    deadline: '2026-09-18',
    successCriteria: 'Fully responsive landing page on React/Tailwind, deployed to Vercel or GitHub Pages.',
    history: [
      { date: '2026-09-10', action: 'Deal Created' },
      { date: '2026-09-11', action: 'Contractor Assigned' },
      { date: '2026-09-18', action: 'Work Submitted by Contractor' },
    ]
  },
  {
    id: 'ESC-1004',
    title: 'Documentation Translation',
    customer: '2a1GxMwZa4c4cWv6yL3dX',
    contractor: '3b9CjLmNq8d2aWv9xN4aZ',
    amount: 300,
    status: 'completed',
    deadline: '2026-08-30',
    successCriteria: 'Translation of 10 pages of technical documentation from English to Spanish.',
    history: [
      { date: '2026-08-15', action: 'Deal Created' },
      { date: '2026-08-16', action: 'Contractor Assigned' },
      { date: '2026-08-28', action: 'Work Submitted by Contractor' },
      { date: '2026-08-29', action: 'Funds Released by Customer' },
    ]
  },
  {
    id: 'ESC-1005',
    title: 'Promo Video Editing',
    customer: '7a2BbKdYm1q3f1cWv8xN9aZ',
    contractor: '3b9CjLmNq8d2aWv9xN4aZ',
    amount: 800,
    status: 'dispute',
    deadline: '2026-09-10',
    successCriteria: 'Edit a 30-second TikTok/Reels video with dynamic subtitles and royalty-free music.',
    history: [
      { date: '2026-08-20', action: 'Deal Created' },
      { date: '2026-08-21', action: 'Contractor Assigned' },
      { date: '2026-09-09', action: 'Work Submitted by Contractor' },
      { date: '2026-09-11', action: 'Dispute Raised by Customer' },
    ]
  }
];
