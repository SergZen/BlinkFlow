use anchor_lang::prelude::*;

use crate::{
    error::BlinkFlowError, events::TaskFinished, Deal, Task, TaskStatus, DIAL_SEED, TASK_SEED,
};

#[derive(Accounts)]
#[instruction(task_index: u8)]
pub struct FinishTaskByContractor<'info> {
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

impl<'info> FinishTaskByContractor<'info> {
    pub fn finish_task_by_contractor(
        &mut self,
        task_index: u8,
        solution_hash: [u8; 32],
    ) -> Result<()> {
        require!(
            self.task.status == TaskStatus::Started,
            BlinkFlowError::InvalidTaskStatus
        );
        let deadline_time = self
            .task
            .started_at
            .checked_add(self.task.deadline)
            .ok_or(BlinkFlowError::InvalidDeadline)?;

        let current_time = Clock::get()?.unix_timestamp;

        require!(
            current_time <= deadline_time,
            BlinkFlowError::DeadlineExpired
        );
        require!(
            solution_hash != [0; 32],
            BlinkFlowError::InvalidSolutionHash
        );

        self.task.status = TaskStatus::Finished;
        self.task.solution_hash = solution_hash;
        self.task.finished_at = current_time;

        self.deal.task_finished_count = self
            .deal
            .task_finished_count
            .checked_add(1)
            .ok_or(BlinkFlowError::Overflow)?;

        emit!(TaskFinished {
            deal: self.deal.key(),
            task: self.task.key(),
            contractor: self.contractor.key(),
            finished_at: current_time,
            task_index
        });

        Ok(())
    }
}
