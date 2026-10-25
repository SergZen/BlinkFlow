use anchor_lang::prelude::*;
use anchor_spl::{
    associated_token::AssociatedToken,
    token::{transfer_checked, Mint, Token, TokenAccount, TransferChecked},
};

use crate::{
    DEADLINE_MAX_SECS, DEADLINE_MIN_SECS, DIAL_SEED, MAX_COUNT_TASK_BY_DIAL, PROTOCOL_SEED, Protocol, TASK_SEED, Task, TaskStatus, error::BlinkFlowError, events::TaskCreated, state::Deal,
};

#[derive(Accounts)]
pub struct AddTaskByCustomer<'info> {
    #[account(mut)]
    pub customer: Signer<'info>,

    #[account(
        seeds = [PROTOCOL_SEED],
        bump = protocol.bump,
    )]
    pub protocol: Account<'info, Protocol>,

    #[account(
        mut,
        has_one = mint @ BlinkFlowError::InvalidMint,
        has_one = customer @ BlinkFlowError::Unauthorized,
        seeds = [DIAL_SEED, deal.customer.as_ref(), deal.seed.to_le_bytes().as_ref()],
        bump = deal.bump
    )]
    pub deal: Account<'info, Deal>,

    #[account(
        init,
        payer = customer,
        space = Task::DISCRIMINATOR.len() + Task::INIT_SPACE,
        seeds = [TASK_SEED, deal.key().as_ref(), deal.task_total_count.to_le_bytes().as_ref()],
        bump
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
    pub deal_vault: Box<Account<'info, TokenAccount>>,

    #[account(
        mut,
        associated_token::mint = mint,
        associated_token::authority = customer,
        associated_token::token_program = token_program
    )]
    pub customer_ata: Box<Account<'info, TokenAccount>>,

    pub associated_token_program: Program<'info, AssociatedToken>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

impl<'info> AddTaskByCustomer<'info> {
    pub fn add_task_by_customer(
        &mut self,
        amount: u64,
        task_hash: [u8; 32],
        deadline: i64,
        bumps: &AddTaskByCustomerBumps,
    ) -> Result<()> {
        require!(!self.protocol.paused, BlinkFlowError::ProtocolPaused);
        require!(amount > 0, BlinkFlowError::InvalidAmount);
        require!(deadline >= DEADLINE_MIN_SECS && deadline <= DEADLINE_MAX_SECS, BlinkFlowError::InvalidDeadline);
        require!(task_hash != [0; 32], BlinkFlowError::InvalidTaskHash);
        require!(
            self.deal.task_total_count < MAX_COUNT_TASK_BY_DIAL,
            BlinkFlowError::MaxTasksPerDealExceeded
        );

        self.transfer_tokens_to_deal_vault(amount)?;

        let creator = self.customer.key();

        let current_time = Clock::get()?.unix_timestamp;

        let new_task_index = self.deal.task_total_count;

        self.deal.task_total_count = self
            .deal
            .task_total_count
            .checked_add(1)
            .ok_or(BlinkFlowError::Overflow)?;

        let task_status = TaskStatus::CustomerCreated;

        self.task.init(
            self.deal.key(),
            new_task_index,
            creator,
            amount,
            task_hash,
            deadline,
            task_status,
            true,
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

    fn transfer_tokens_to_deal_vault(&self, amount: u64) -> Result<()> {
        let transfer_accounts = TransferChecked {
            from: self.customer_ata.to_account_info(),
            mint: self.mint.to_account_info(),
            to: self.deal_vault.to_account_info(),
            authority: self.customer.to_account_info(),
        };

        let cpi_ctx = CpiContext::new(self.token_program.to_account_info(), transfer_accounts);

        transfer_checked(cpi_ctx, amount, self.mint.decimals)
    }
}
