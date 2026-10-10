use anchor_lang::prelude::*;

#[account]
#[derive(InitSpace)]
pub struct Deal {
    pub creator: Pubkey,
    pub customer: Pubkey,
    pub contractor: Pubkey,
    pub trust_authority: Pubkey,
    pub mint: Pubkey,
    pub vault: Pubkey,
    pub created_at: i64,
    pub pending_contractor: Option<Pubkey>,
    pub seed: u64,
    pub task_total_count: u8,
    pub task_completed_count: u8,
    pub task_disputed_count: u8,
    pub task_resolved_count: u8,
    pub task_cancelled_count: u8,
    pub task_finished_count: u8,
    pub task_refunded_count: u8,
    pub task_closed_count: u8,
    pub protocol_fee_bps: u16,
    pub arbitration_fee_bps: u16,
    pub bump: u8,
} //task_completed_count + task_cancelled_count + task_disputed_count