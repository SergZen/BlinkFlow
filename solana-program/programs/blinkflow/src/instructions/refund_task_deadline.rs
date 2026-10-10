use anchor_lang::prelude::*;
use anchor_spl::{
    associated_token::AssociatedToken,
    token::{transfer_checked, Mint, Token, TokenAccount, TransferChecked},
};

use crate::{
    error::BlinkFlowError, events::TaskRefunded, Deal, Task, TaskStatus, DIAL_SEED,
    GHOSTING_TIMER_SECS, TASK_SEED,
};

#[derive(Accounts)]
#[instruction(task_index: u8)]
pub struct RefundTaskDeadline<'info> {
    pub customer: Signer<'info>,

    #[account(
        mut,
        has_one = mint @ BlinkFlowError::InvalidMint,
        has_one = customer @ BlinkFlowError::Unauthorized,
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

    #[account(
        mint::token_program = token_program
    )]
    pub mint: Account<'info, Mint>,

    #[account(
        mut,
        associated_token::mint = mint,
        associated_token::authority = deal,
        associated_token::token_program = token_program
    )]
    pub deal_vault: Account<'info, TokenAccount>,

    #[account(
        mut,
        associated_token::mint = mint,
        associated_token::authority = deal.customer,
        associated_token::token_program = token_program
    )]
    pub customer_ata: Account<'info, TokenAccount>,

    pub associated_token_program: Program<'info, AssociatedToken>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

impl<'info> RefundTaskDeadline<'info> {
    pub fn refund_task_deadline(&mut self, task_index: u8) -> Result<()> {
        require!(
            self.task.status == TaskStatus::Started,
            BlinkFlowError::InvalidTaskStatus
        );
        let refund_time = self
            .task
            .started_at
            .checked_add(self.task.deadline)
            .and_then(|deadline| deadline.checked_add(GHOSTING_TIMER_SECS))
            .ok_or(BlinkFlowError::InvalidDeadline)?;

        let current_time = Clock::get()?.unix_timestamp;

        require!(
            current_time > refund_time,
            BlinkFlowError::RefundTimeNotReached
        );

        self.task.status = TaskStatus::Refunded;
        self.task.refund_at = current_time;

        self.deal.task_refunded_count = self
            .deal
            .task_refunded_count
            .checked_add(1)
            .ok_or(BlinkFlowError::Overflow)?;

        let bump = [self.deal.bump];
        let signer_seeds: &[&[&[u8]]] = &[&[
            DIAL_SEED,
            self.deal.customer.as_ref(),
            &self.deal.seed.to_le_bytes(),
            &bump,
        ]];

        let transfer_accounts = TransferChecked {
            from: self.deal_vault.to_account_info(),
            mint: self.mint.to_account_info(),
            to: self.customer_ata.to_account_info(),
            authority: self.deal.to_account_info(),
        };

        let cpi_ctx = CpiContext::new_with_signer(
            self.token_program.to_account_info(),
            transfer_accounts,
            signer_seeds,
        );

        transfer_checked(cpi_ctx, self.task.amount, self.mint.decimals)?;

        emit!(TaskRefunded {
            deal: self.deal.key(),
            task: self.task.key(),
            customer: self.customer.key(),
            refunded_at: current_time,
            task_index
        });

        Ok(())
    }
}
