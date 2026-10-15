use anchor_lang::prelude::*;

use crate::{
    error::BlinkFlowError, events::TaskClosed, Deal, Task, TaskStatus, DIAL_SEED, TASK_SEED,
};

#[derive(Accounts)]
#[instruction(task_index: u8)]
pub struct CloseTaskAccount<'info> {
    #[account(mut)]
    pub creator: Signer<'info>,

    #[account(
        mut,
        has_one = creator @ BlinkFlowError::Unauthorized,
        seeds = [DIAL_SEED, deal.customer.as_ref(), deal.seed.to_le_bytes().as_ref()],
        bump = deal.bump,
    )]
    pub deal: Account<'info, Deal>,

    #[account(
        mut,
        close = creator,
        has_one = creator @ BlinkFlowError::Unauthorized,
        seeds = [TASK_SEED, deal.key().as_ref(), task_index.to_le_bytes().as_ref()],
        bump = task.bump,
    )]
    pub task: Account<'info, Task>,

    pub system_program: Program<'info, System>,
}

impl<'info> CloseTaskAccount<'info> {
    pub fn close_task_account(&mut self, task_index: u8) -> Result<()> {
        require!(
            self.task.status == TaskStatus::Completed || self.task.status == TaskStatus::Cancelled ||
            self.task.status == TaskStatus::Resolved || self.task.status == TaskStatus::Refunded,
            BlinkFlowError::InvalidTaskStatus
        );

        self.deal.task_closed_count = self
            .deal
            .task_closed_count
            .checked_add(1)
            .ok_or(BlinkFlowError::Overflow)?;

        let current_time = Clock::get()?.unix_timestamp;

        emit!(TaskClosed {
            deal: self.deal.key(),
            task: self.task.key(),
            creator: self.creator.key(),
            closed_at: current_time,
            task_index,
        });

        Ok(())
    }
}
