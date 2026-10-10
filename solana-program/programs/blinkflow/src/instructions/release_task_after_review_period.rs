use anchor_lang::prelude::*;
use anchor_spl::{
    associated_token::AssociatedToken,
    token::{transfer_checked, Mint, Token, TokenAccount, TransferChecked},
};

use mpl_core::ID as MPL_CORE_ID;

use crate::{
    DIAL_SEED, Deal, PROTOCOL_SEED, Protocol, REVIEW_PERIOD_SECS, SBT_COLLECTION_SEED, SBT_SEED, TASK_SEED, Task, TaskStatus, error::BlinkFlowError, events::TaskCompleted, sbt::{SbtContext, update_sbt},
};

#[derive(Accounts)]
#[instruction(task_index: u8)]
pub struct ReleaseTaskAfterReviewPeriod<'info> {
    #[account(mut)]
    pub customer: Signer<'info>,

    /// CHECK:
    pub contractor: UncheckedAccount<'info>,

    #[account(
        seeds = [PROTOCOL_SEED],
        bump = protocol.bump,
    )]
    pub protocol: Account<'info, Protocol>,

    #[account(
        mut,
        has_one = mint @ BlinkFlowError::InvalidMint,
        has_one = contractor @ BlinkFlowError::Unauthorized,
        has_one = customer @ BlinkFlowError::Unauthorized,
        seeds = [DIAL_SEED, deal.customer.as_ref(), deal.seed.to_le_bytes().as_ref()],
        bump = deal.bump,
    )]
    pub deal: Box<Account<'info, Deal>>,

    #[account(
        mut,
        seeds = [TASK_SEED, deal.key().as_ref(), task_index.to_le_bytes().as_ref()],
        bump = task.bump,
    )]
    pub task: Box<Account<'info, Task>>,

    #[account(
        mint::token_program = token_program
    )]
    pub mint: Box<Account<'info, Mint>>,

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
        associated_token::authority = protocol,
        associated_token::token_program = token_program
    )]
    pub protocol_vault: Box<Account<'info, TokenAccount>>,

    #[account(
        mut,
        associated_token::mint = mint,
        associated_token::authority = contractor,
        associated_token::token_program = token_program
    )]
    pub contractor_ata: Box<Account<'info, TokenAccount>>,

    /// CHECK: sbt_collection
    #[account(
        mut,
        seeds = [SBT_COLLECTION_SEED],
        bump
    )]
    pub sbt_collection: UncheckedAccount<'info>,

    /// CHECK: sbt customer
    #[account(
        mut,
        seeds = [
            SBT_SEED, 
            deal.customer.as_ref(), 
        ],
        bump
    )]
    pub sbt_customer: UncheckedAccount<'info>,

    /// CHECK: sbt contractor
    #[account(
        mut,
        seeds = [
            SBT_SEED, 
            deal.contractor.key().as_ref(), 
        ],
        bump
    )]
    pub sbt_contractor: UncheckedAccount<'info>,

    /// CHECK: This is the ID of the Metaplex Core program
    #[account(address = MPL_CORE_ID)]
    pub mpl_core_program: UncheckedAccount<'info>,

    pub associated_token_program: Program<'info, AssociatedToken>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

impl<'info> SbtContext<'info> for ReleaseTaskAfterReviewPeriod<'info> {
    fn sbt_collection(&self) -> AccountInfo<'info> { self.sbt_collection.to_account_info() }
    fn mpl_core_program(&self) -> AccountInfo<'info> { self.mpl_core_program.to_account_info() }
    fn system_program(&self) -> AccountInfo<'info> { self.system_program.to_account_info() }
}

impl<'info> ReleaseTaskAfterReviewPeriod<'info> {
    pub fn release_task_after_review_period(
        &mut self, task_index: u8, 
        bumps: & ReleaseTaskAfterReviewPeriodBumps
    ) -> Result<()> {
        require!(
            self.task.status == TaskStatus::Finished,
            BlinkFlowError::InvalidTaskStatus
        );

        let review_time = self
            .task
            .finished_at
            .checked_add(REVIEW_PERIOD_SECS)
            .ok_or(BlinkFlowError::InvalidReviewTime)?;

        let current_time = Clock::get()?.unix_timestamp;

        require!(
            current_time >= review_time,
            BlinkFlowError::ReviewPeriodNotReached
        );

        self.task.status = TaskStatus::Completed;
        self.task.completed_at = current_time;

        self.deal.task_completed_count = self
            .deal
            .task_completed_count
            .checked_add(1)
            .ok_or(BlinkFlowError::Overflow)?;

        let bump = [self.deal.bump];
        let signer_seeds: &[&[&[u8]]] = &[&[
            DIAL_SEED,
            self.deal.customer.as_ref(),
            &self.deal.seed.to_le_bytes(),
            &bump,
        ]];

        let customer_amount = self.task.amount;

        let protocol_fee = customer_amount
            .checked_mul(self.deal.protocol_fee_bps as u64)
            .ok_or(BlinkFlowError::Overflow)?
            .checked_div(10_000)
            .ok_or(BlinkFlowError::Overflow)?;
        
        let contractor_amount = customer_amount
            .checked_sub(protocol_fee)
            .ok_or(BlinkFlowError::Overflow)?;

        self.transfer_tokens_from_deal_vault(
            self.protocol_vault.to_account_info(),
            protocol_fee,
            signer_seeds,
        )?;
        self.transfer_tokens_from_deal_vault(
            self.contractor_ata.to_account_info(),
            contractor_amount,
            signer_seeds,
        )?;

        let payer = &self.customer.to_account_info();

        update_sbt(
            &*self,
            &self.sbt_customer.to_account_info(),
            &self.customer.key(), 
            &payer,
            bumps.sbt_collection,
            true,
            false,
            false,
            true,
            customer_amount,
            contractor_amount,
        )?;

        update_sbt(
            &*self, 
            &self.sbt_contractor.to_account_info(), 
            &self.contractor.key(), 
            &payer,
            bumps.sbt_collection, 
            false,
            false,
            false,
            true,
            customer_amount,
            contractor_amount,
        )?;

        emit!(TaskCompleted {
            deal: self.deal.key(),
            task: self.task.key(),
            customer: self.customer.key(),
            completed_at: current_time,
            task_index
        });

        Ok(())
    }

    fn transfer_tokens_from_deal_vault(
        &self,
        to: AccountInfo<'info>,
        amount: u64,
        signer_seeds: &[&[&[u8]]],
    ) -> Result<()> {
        let transfer_accounts = TransferChecked {
            from: self.deal_vault.to_account_info(),
            mint: self.mint.to_account_info(),
            to,
            authority: self.deal.to_account_info(),
        };

        let cpi_ctx = CpiContext::new_with_signer(
            self.token_program.to_account_info(),
            transfer_accounts,
            signer_seeds,
        );

        transfer_checked(cpi_ctx, amount, self.mint.decimals)
    }
}
