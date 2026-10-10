use anchor_lang::prelude::*;
use anchor_spl::{
    associated_token::AssociatedToken,
    token::{transfer_checked, Mint, Token, TokenAccount, TransferChecked},
};
use mpl_core::ID as MPL_CORE_ID;

use crate::{
    DIAL_SEED, FIRST_TASK_INDEX, PROTOCOL_SEED, Protocol, SBT_COLLECTION_SEED, SBT_SEED, TASK_SEED, Task, TaskStatus, error::BlinkFlowError, events::{DealCreated, SbtCreated, TaskCreated}, sbt::{SbtContext, ensure_sbt_asset}, state::Deal,
};

#[derive(Accounts)]
#[instruction(seed: u64)]
pub struct InitDealByCustomer<'info> {
    #[account(mut)]
    pub customer: Signer<'info>,

    /// CHECK: platform trust_authority wallet
    pub trust_authority: UncheckedAccount<'info>,

    #[account(
        seeds = [PROTOCOL_SEED],
        bump = protocol.bump,
    )]
    pub protocol: Account<'info, Protocol>,

    #[account(
        init,
        payer = customer,
        space = Deal::DISCRIMINATOR.len() + Deal::INIT_SPACE,
        seeds = [DIAL_SEED, customer.key().as_ref(), &seed.to_le_bytes()],
        bump
    )]
    pub deal: Account<'info, Deal>,

    #[account(
        init,
        payer = customer,
        space = Task::DISCRIMINATOR.len() + Task::INIT_SPACE,
        seeds = [TASK_SEED, deal.key().as_ref(), FIRST_TASK_INDEX],
        bump
    )]
    pub task: Account<'info, Task>,

    #[account(
        mint::token_program = token_program
    )]
    pub mint: Account<'info, Mint>,

    #[account(
        init,
        payer = customer,
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

    /// CHECK: sbt collection
    #[account(
        mut,
        seeds = [SBT_COLLECTION_SEED],
        bump
    )]
    pub sbt_collection: UncheckedAccount<'info>,

    /// CHECK: sbt 
    #[account(
        mut,
        seeds = [
            SBT_SEED, 
            customer.key().as_ref(), 
        ],
        bump
    )]
    pub sbt_asset: UncheckedAccount<'info>,

    /// CHECK: This is the ID of the Metaplex Core program
    #[account(address = MPL_CORE_ID)]
    pub mpl_core_program: UncheckedAccount<'info>,

    pub associated_token_program: Program<'info, AssociatedToken>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

impl<'info> SbtContext<'info> for InitDealByCustomer<'info> {
    fn sbt_collection(&self) -> AccountInfo<'info> { self.sbt_collection.to_account_info() }
    fn mpl_core_program(&self) -> AccountInfo<'info> { self.mpl_core_program.to_account_info() }
    fn system_program(&self) -> AccountInfo<'info> { self.system_program.to_account_info() }
}

impl<'info> InitDealByCustomer<'info> {
    pub fn init_deal_by_customer(
        &mut self,
        seed: u64,
        amount: u64,
        task_hash: [u8; 32],
        deadline: i64,
        bumps: &InitDealByCustomerBumps,
    ) -> Result<()> {
        require!(!self.protocol.paused, BlinkFlowError::ProtocolPaused);
        require!(amount > 0, BlinkFlowError::InvalidAmount);
        require!(deadline > 0, BlinkFlowError::InvalidDeadline);
        require!(task_hash != [0; 32], BlinkFlowError::InvalidTaskHash);
        require_keys_neq!(
            self.trust_authority.key(),
            self.customer.key(),
            BlinkFlowError::TrustAuthorityRoleMismatch
        );
        require_keys_eq!(
            self.trust_authority.key(),
            self.protocol.trust_authority,
            BlinkFlowError::InvalidTrustAuthority
        );

        self.transfer_tokens_to_deal_vault(amount)?;

        let creator = self.customer.key();

        let current_time = Clock::get()?.unix_timestamp;

        self.deal.set_inner(Deal {
            trust_authority: self.trust_authority.key(),
            mint: self.mint.key(),
            vault: self.deal_vault.key(),
            creator,
            customer: self.customer.key(),
            contractor: Pubkey::default(),
            pending_contractor: None,
            task_total_count: 1,
            task_completed_count: 0,
            task_disputed_count: 0,
            task_resolved_count: 0,
            task_cancelled_count: 0,
            task_finished_count: 0,
            task_refunded_count: 0,
            task_closed_count: 0,
            created_at: current_time,
            protocol_fee_bps: self.protocol.protocol_fee_bps,
            arbitration_fee_bps: self.protocol.arbitration_fee_bps,
            seed,
            bump: bumps.deal,
        });

        emit!(DealCreated {
            deal: self.deal.key(),
            customer: self.customer.key(),
            contractor: None,
            creator,
            trust_authority: self.trust_authority.key(),
            protocol_fee_bps: self.protocol.protocol_fee_bps,
            arbitration_fee_bps: self.protocol.arbitration_fee_bps,
            created_at: current_time,
            seed
        });

        let task_status = TaskStatus::CustomerCreated;

        self.task.init(
            self.deal.key(),
            0,
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
            task_index: 0,
        });

        let created = ensure_sbt_asset(
            &*self, 
            &self.sbt_asset.to_account_info(),
            &self.customer.to_account_info(), 
            &self.customer.to_account_info(),
            bumps.sbt_asset, 
            bumps.sbt_collection, 
        )?;
        
        if created { 
            emit!(SbtCreated { 
                creator: self.customer.key(), 
                created_at: Clock::get()?.unix_timestamp, 
            });
        }

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
