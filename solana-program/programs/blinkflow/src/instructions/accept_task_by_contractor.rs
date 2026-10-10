use anchor_lang::prelude::*;

use crate::{
    DIAL_SEED, Deal, TASK_SEED, Task, TaskStatus, error::BlinkFlowError, events::TaskAcceptedByContractor,
};

#[derive(Accounts)]
#[instruction(task_index: u8)]
pub struct AcceptTaskByContractor<'info> {
    #[account(mut)]
    pub contractor: Signer<'info>,

    #[account(
        mut,
        has_one = contractor @ BlinkFlowError::Unauthorized,
        seeds = [DIAL_SEED, deal.customer.as_ref(), deal.seed.to_le_bytes().as_ref()],
        bump = deal.bump,
    )]
    pub deal: Account<'info, Deal>,

    #[account(
        mut,
        seeds = [TASK_SEED, deal.key().as_ref(), task_index.to_le_bytes().as_ref()],
        bump = task.bump,
    )]
    pub task: Account<'info, Task>,
}

impl<'info> AcceptTaskByContractor<'info> {
    pub fn accept_task_by_contractor(&mut self, task_index: u8) -> Result<()> {
        require!(
            self.task.status == TaskStatus::CustomerCreated,
            BlinkFlowError::InvalidTaskStatus
        );

        let current_time = Clock::get()?.unix_timestamp;

        self.task.started_at = current_time;
        self.task.status = TaskStatus::Started;

        emit!(TaskAcceptedByContractor {
            deal: self.deal.key(),
            task: self.task.key(),
            contractor: self.contractor.key(),
            accepted_at: current_time,
            task_index,
        });

        Ok(())
    }
}
