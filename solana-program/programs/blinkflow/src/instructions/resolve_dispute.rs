use anchor_lang::prelude::*;
use anchor_spl::{
    associated_token::AssociatedToken,
    token::{transfer_checked, Mint, Token, TokenAccount, TransferChecked},
};
use mpl_core::ID as MPL_CORE_ID;

use crate::{
    DIAL_SEED, Deal, PROTOCOL_SEED, Protocol, SBT_COLLECTION_SEED, SBT_SEED, TASK_SEED, Task, TaskStatus, error::BlinkFlowError, events::DisputeResolved, sbt::{SbtContext, update_sbt},
};

#[derive(Accounts)]
#[instruction(task_index: u8)]
pub struct ResolveDispute<'info> {
    #[account(mut)]
    pub trust_authority: Signer<'info>,

    /// CHECK:
    pub contractor: UncheckedAccount<'info>,

    /// CHECK:
    pub customer: UncheckedAccount<'info>,

    #[account(
        seeds = [PROTOCOL_SEED],
        bump = protocol.bump,
    )]
    pub protocol: Box<Account<'info, Protocol>>,

    #[account(
        mut,
        has_one = customer @ BlinkFlowError::Unauthorized,
        has_one = contractor @ BlinkFlowError::Unauthorized,
        has_one = trust_authority @ BlinkFlowError::Unauthorized,
        has_one = mint @ BlinkFlowError::InvalidMint,
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
        associated_token::authority = trust_authority,
        associated_token::token_program = token_program
    )]
    pub trust_authority_ata: Box<Account<'info, TokenAccount>>,

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
        associated_token::authority = deal,
        associated_token::token_program = token_program
    )]
    pub deal_vault: Box<Account<'info, TokenAccount>>,

    #[account(
        mut,
        associated_token::mint = mint,
        associated_token::authority = deal.customer,
        associated_token::token_program = token_program
    )]
    pub customer_ata: Box<Account<'info, TokenAccount>>,

    #[account(
        mut,
        associated_token::mint = mint,
        associated_token::authority = deal.contractor,
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

impl<'info> SbtContext<'info> for ResolveDispute<'info> {
    fn sbt_collection(&self) -> AccountInfo<'info> { self.sbt_collection.to_account_info() }
    fn mpl_core_program(&self) -> AccountInfo<'info> { self.mpl_core_program.to_account_info() }
    fn system_program(&self) -> AccountInfo<'info> { self.system_program.to_account_info() }
}

impl<'info> ResolveDispute<'info> {
    pub fn resolve_dispute(&mut self, task_index: u8, customer_win: bool, bumps: &ResolveDisputeBumps) -> Result<()> {
        require!(
            self.task.status == TaskStatus::Disputed,
            BlinkFlowError::InvalidTaskStatus
        );

        self.task.status = TaskStatus::Resolved;

        self.deal.task_resolved_count = self
            .deal
            .task_resolved_count
            .checked_add(1)
            .ok_or(BlinkFlowError::Overflow)?;

        self.deal.task_disputed_count = self
            .deal
            .task_disputed_count
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

        let arbitration_fee = customer_amount
            .checked_mul(self.deal.arbitration_fee_bps as u64)
            .ok_or(BlinkFlowError::Overflow)?
            .checked_div(10_000)
            .ok_or(BlinkFlowError::Overflow)?;

        let amount = customer_amount
            .checked_sub(protocol_fee)
            .and_then(|amount| amount.checked_sub(arbitration_fee))
            .ok_or(BlinkFlowError::Overflow)?;

        require!(amount > 0, BlinkFlowError::InvalidAmount);
            
        let payer = &self.trust_authority.to_account_info();

        if customer_win {
            self.transfer_tokens_from_deal_vault(
                self.customer_ata.to_account_info(),
                amount,
                signer_seeds,
            )?;

            update_sbt(
                &*self, 
                &self.sbt_customer.to_account_info(), 
                &self.customer.key(), 
                &payer, 
                bumps.sbt_collection,
                true,
                true,
                true,
                false,
                customer_amount,
                amount,
            )?;

            update_sbt(
                &*self, 
                &self.sbt_contractor.to_account_info(), 
                &self.contractor.key(), 
                &payer,
                bumps.sbt_collection,
                false,
                false,
                true,
                false,
                customer_amount,
                amount,
            )?;
        } else {
            self.transfer_tokens_from_deal_vault(
                self.contractor_ata.to_account_info(),
                amount,
                signer_seeds,
            )?;

            update_sbt(
                &*self, &self.sbt_customer.to_account_info(), &self.customer.key(), &payer, bumps.sbt_collection,
                true,
                false,
                true,
                false,
                customer_amount,
                amount,
            )?;

            update_sbt(
                &*self, &self.sbt_contractor.to_account_info(), &self.contractor.key(), &payer,
                bumps.sbt_collection,
                false,
                true,
                true,
                false,
                customer_amount,
                amount,
            )?;
        }

        self.transfer_tokens_from_deal_vault(
            self.trust_authority_ata.to_account_info(),
            arbitration_fee,
            signer_seeds,
        )?;

        self.transfer_tokens_from_deal_vault(
            self.protocol_vault.to_account_info(),
            protocol_fee,
            signer_seeds,
        )?;

        let current_time = Clock::get()?.unix_timestamp;

        emit!(DisputeResolved {
            deal: self.deal.key(),
            task: self.task.key(),
            trust_authority: self.trust_authority.key(),
            customer: self.deal.customer.key(),
            contractor: self.deal.contractor.key(),
            customer_win,
            resolved_at: current_time,
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