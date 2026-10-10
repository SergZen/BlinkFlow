use anchor_lang::prelude::*;

use crate::{
    error::BlinkFlowError, events::ContractorAddedToDeal, Deal, Task, TaskStatus, DIAL_SEED,
    FIRST_TASK_INDEX, TASK_SEED,
};

#[derive(Accounts)]
pub struct AddContractorToDeal<'info> {
    pub customer: Signer<'info>,

    /// CHECK:
    pub contractor: UncheckedAccount<'info>,

    #[account(
        mut,
        has_one = customer @ BlinkFlowError::Unauthorized,
        has_one = contractor @ BlinkFlowError::Unauthorized,
        seeds = [DIAL_SEED, customer.key().as_ref(), deal.seed.to_le_bytes().as_ref()],
        bump = deal.bump,
    )]
    pub deal: Account<'info, Deal>,

    #[account(
        mut,
        seeds = [TASK_SEED, deal.key().as_ref(), FIRST_TASK_INDEX],
        bump = task.bump,
    )]
    pub task: Account<'info, Task>,
}

impl<'info> AddContractorToDeal<'info> {
    pub fn add_contractor_to_deal(&mut self) -> Result<()> {
        require!(
            self.task.status == TaskStatus::CustomerCreated,
            BlinkFlowError::InvalidTaskStatus
        );
        require!(
            self.deal.contractor == Pubkey::default(),
            BlinkFlowError::ContractorMustBeEmpty
        );
        require_keys_neq!(
            self.deal.trust_authority,
            self.contractor.key(),
            BlinkFlowError::TrustAuthorityRoleMismatch
        );

        self.deal.pending_contractor = Some(self.contractor.key());

        let current_time = Clock::get()?.unix_timestamp;

        emit!(ContractorAddedToDeal {
            deal: self.deal.key(),
            customer: self.customer.key(),
            contractor: self.contractor.key(),
            added_at: current_time
        });

        Ok(())
    }
}
