use anchor_lang::prelude::*;

use crate::{
    DEADLINE_MAX_SECS, DEADLINE_MIN_SECS, DIAL_SEED, MAX_COUNT_TASK_BY_DIAL, PROTOCOL_SEED, Protocol, TASK_SEED, Task, TaskStatus, error::BlinkFlowError, events::TaskCreated, state::Deal,
};

#[derive(Accounts)]
pub struct AddTaskByContractor<'info> {
    #[account(mut)]
    pub contractor: Signer<'info>,

    #[account(
        seeds = [PROTOCOL_SEED],
        bump = protocol.bump,
    )]
    pub protocol: Account<'info, Protocol>,

    #[account(
        mut,
        has_one = contractor @ BlinkFlowError::Unauthorized,
        seeds = [DIAL_SEED, deal.customer.as_ref(), deal.seed.to_le_bytes().as_ref()],
        bump = deal.bump
    )]
    pub deal: Account<'info, Deal>,

    #[account(
        init,
        payer = contractor,
        space = Task::DISCRIMINATOR.len() + Task::INIT_SPACE,
        seeds = [TASK_SEED, deal.key().as_ref(), deal.task_total_count.to_le_bytes().as_ref()],
        bump
    )]
    pub task: Account<'info, Task>,

    pub system_program: Program<'info, System>,
}

impl<'info> AddTaskByContractor<'info> {
    pub fn add_task_by_contractor(
        &mut self,
        amount: u64,
        task_hash: [u8; 32],
        deadline: i64,
        bumps: &AddTaskByContractorBumps,
    ) -> Result<()> {
        require!(!self.protocol.paused, BlinkFlowError::ProtocolPaused);
        require!(amount > 0, BlinkFlowError::InvalidAmount);
        require!(deadline >= DEADLINE_MIN_SECS && deadline <= DEADLINE_MAX_SECS, BlinkFlowError::InvalidDeadline);
        require!(task_hash != [0; 32], BlinkFlowError::InvalidTaskHash);
        require!(
            self.deal.task_total_count < MAX_COUNT_TASK_BY_DIAL,
            BlinkFlowError::MaxTasksPerDealExceeded
        );

        let creator = self.contractor.key();

        let current_time = Clock::get()?.unix_timestamp;

        let new_task_index = self.deal.task_total_count;

        self.deal.task_total_count = self
            .deal
            .task_total_count
            .checked_add(1)
            .ok_or(BlinkFlowError::Overflow)?;

        let task_status = TaskStatus::ContractorCreated;

        self.task.init(
            self.deal.key(),
            new_task_index,
            creator,
            amount,
            task_hash,
            deadline,
            task_status,
            false,
            bumps.task,
            current_time,
        );

        emit!(TaskCreated {
            deal: self.deal.key(),
            creator,
            status: task_status,
            created_at: current_time,
            task_index: new_task_index,
        });

        Ok(())
    }
}
