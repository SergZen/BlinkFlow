use anchor_lang::{prelude::*};

#[account]
#[derive(InitSpace)]
pub struct Task {
    pub dial: Pubkey,
    pub task_index: u8,
    pub creator: Pubkey,
    pub amount: u64,
    pub status: TaskStatus,
    pub task_hash: [u8; 32],
    pub solution_hash: [u8; 32],
    pub deadline: i64,
    pub created_at: i64,
    pub deposited: bool,
    pub deposited_at: i64,
    pub started_at: i64,
    pub refund_at: i64,
    pub finished_at: i64,
    pub completed_at: i64,
    pub bump: u8,
}

impl Task {
    pub fn init(
        &mut self,
        dial: Pubkey,
        task_index: u8,
        creator: Pubkey,
        amount: u64,
        task_hash: [u8; 32],
        deadline: i64,
        status: TaskStatus,
        deposited: bool,
        bump: u8,
        now: i64,
    ) {
        self.dial = dial;
        self.task_index = task_index;
        self.creator = creator;
        self.amount = amount;
        self.status = status;
        self.task_hash = task_hash;
        self.solution_hash = [0u8; 32];
        self.deadline = deadline;
        self.created_at = now;
        self.deposited = deposited;
        self.bump = bump;

        if deposited {
          self.deposited_at = now;  
        }   
    }
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, Debug, InitSpace)]
pub enum TaskStatus {
    CustomerCreated,
    ContractorCreated,
    Started,
    Finished,
    Disputed,
    Resolved,
    Completed,
    Cancelled,
    Refunded,
}
