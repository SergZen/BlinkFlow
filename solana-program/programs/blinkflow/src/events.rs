use anchor_lang::prelude::*;

use crate::{TaskStatus};

#[event]
pub struct DealCreated {
    pub deal: Pubkey,
    pub customer: Pubkey,
    pub contractor: Option<Pubkey>,
    pub creator: Pubkey,
    pub trust_authority: Pubkey,
    pub protocol_fee_bps: u16,
    pub arbitration_fee_bps: u16,
    pub created_at: i64,
    pub seed: u64,
}

#[event]
pub struct TaskCreated {
    pub deal: Pubkey,
    pub creator: Pubkey,
    pub status: TaskStatus,
    pub created_at: i64,
    pub task_index: u8,
}

#[event]
pub struct DealClosed {
    pub deal: Pubkey,
    pub creator: Pubkey,
    pub closed_at: i64,
}

#[event]
pub struct TaskClosed {
    pub deal: Pubkey,
    pub task: Pubkey,
    pub creator: Pubkey,
    pub closed_at: i64,
    pub task_index: u8,
}

#[event]
pub struct DealAcceptedByContractor {
    pub deal: Pubkey,
    pub contractor: Pubkey,
    pub accepted_at: i64,
}

#[event]
pub struct ContractorAddedToDeal {
    pub deal: Pubkey,
    pub customer: Pubkey,
    pub contractor: Pubkey,
    pub added_at: i64,
}


#[event]
pub struct TaskAcceptedByContractor {
    pub deal: Pubkey,
    pub task: Pubkey,
    pub contractor: Pubkey,
    pub accepted_at: i64,
    pub task_index: u8,
}

#[event]
pub struct TaskCanceled {
    pub deal: Pubkey,
    pub task: Pubkey,
    pub user: Pubkey,
    pub closed_at: i64,
    pub task_index: u8,
}

#[event]
pub struct TaskCompleted {
    pub deal: Pubkey,
    pub task: Pubkey,
    pub customer: Pubkey,
    pub completed_at: i64,
    pub task_index: u8,    
}

#[event]
pub struct TaskReleasedAfterReview {
    pub deal: Pubkey,
    pub task: Pubkey,
    pub contractor: Pubkey,
    pub released_at: i64,
    pub task_index: u8,
}

#[event]
pub struct TaskDeposited {
    pub deal: Pubkey,
    pub task: Pubkey,
    pub customer: Pubkey,
    pub deposited_at: i64,
    pub task_index: u8,      
}

#[event]
pub struct TaskFinished {
    pub deal: Pubkey,
    pub task: Pubkey,
    pub contractor: Pubkey,
    pub finished_at: i64,
    pub task_index: u8,    
}

#[event]
pub struct TaskRefunded {
    pub deal: Pubkey,
    pub task: Pubkey,
    pub customer: Pubkey,
    pub refunded_at: i64,
    pub task_index: u8,    
}

#[event]
pub struct DisputeResolved {
    pub deal: Pubkey,
    pub task: Pubkey,
    pub trust_authority: Pubkey,
    pub customer: Pubkey,
    pub contractor: Pubkey,
    pub customer_win: bool,
    pub resolved_at: i64,
    pub task_index: u8,     
}

#[event]
pub struct ProtocolFeeWithdrawn {
    pub fee_recipient: Pubkey,
    pub amount: u64, 
    pub withdrawn_at: i64,
}

#[event]
pub struct ProtocolSettingsChanged {
    pub admin: Pubkey,
    pub settings: String,
    pub changed_at: i64,
}

#[event]
pub struct SbtCreated {
    pub creator: Pubkey,
    pub created_at: i64,
}


