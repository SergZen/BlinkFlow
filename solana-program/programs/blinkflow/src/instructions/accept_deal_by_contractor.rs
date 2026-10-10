use anchor_lang::prelude::*;
use mpl_core::ID as MPL_CORE_ID;

use crate::{
    DIAL_SEED, Deal, FIRST_TASK_INDEX, SBT_COLLECTION_SEED, SBT_SEED, TASK_SEED, Task, TaskStatus, error::BlinkFlowError, events::{DealAcceptedByContractor, SbtCreated}, sbt::{SbtContext, ensure_sbt_asset},
};

#[derive(Accounts)]
pub struct AcceptDealByContractor<'info> {
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
        seeds = [TASK_SEED, deal.key().as_ref(), FIRST_TASK_INDEX],
        bump = task.bump,
    )]
    pub task: Account<'info, Task>,

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
            contractor.key().as_ref(), 
        ],
        bump
    )]
    pub sbt_asset: UncheckedAccount<'info>,

    /// CHECK: This is the ID of the Metaplex Core program
    #[account(address = MPL_CORE_ID)]
    pub mpl_core_program: UncheckedAccount<'info>,

    pub system_program: Program<'info, System>,
}

impl<'info> SbtContext<'info> for AcceptDealByContractor<'info> {
    fn sbt_collection(&self) -> AccountInfo<'info> { self.sbt_collection.to_account_info() }
    fn mpl_core_program(&self) -> AccountInfo<'info> { self.mpl_core_program.to_account_info() }
    fn system_program(&self) -> AccountInfo<'info> { self.system_program.to_account_info() }
}

impl<'info> AcceptDealByContractor<'info> {
    pub fn accept_deal_by_contractor(&mut self, bumps: &AcceptDealByContractorBumps) -> Result<()> {
        require!(
            self.task.status == TaskStatus::CustomerCreated,
            BlinkFlowError::InvalidTaskStatus
        );
        require!(
            self.deal.contractor == Pubkey::default(),
            BlinkFlowError::ContractorMustBeEmpty
        );
        require!(
            self.deal.pending_contractor.is_some()
                && self.deal.pending_contractor.unwrap() == self.contractor.key(),
            BlinkFlowError::ContractorMustBePending
        );

        let current_time = Clock::get()?.unix_timestamp;

        self.task.started_at = current_time;
        self.task.status = TaskStatus::Started;
        
        self.deal.pending_contractor = None;
        self.deal.contractor =self.contractor.key();

        emit!(DealAcceptedByContractor {
            deal: self.deal.key(),
            contractor: self.contractor.key(),
            accepted_at: current_time
        });

        let created = ensure_sbt_asset(
            &*self, 
            &self.sbt_asset.to_account_info(),
            &self.contractor.to_account_info(), 
            &self.contractor.to_account_info(),
            bumps.sbt_asset, 
            bumps.sbt_collection, 
            // name, 
            // uri
        )?;
        
        if created { 
            emit!(SbtCreated { 
                creator: self.contractor.key(),
                created_at: Clock::get()?.unix_timestamp, 
            });
        } 

        Ok(())
    }
}
