use anchor_lang::prelude::*;
use anchor_spl::{
    associated_token::AssociatedToken,
    token::{
        close_account, transfer_checked, CloseAccount, Mint, Token, TokenAccount, TransferChecked,
    },
};

use crate::{error::BlinkFlowError, events::DealClosed, Deal, DIAL_SEED};

#[derive(Accounts)]
pub struct CloseDealAccount<'info> {
    #[account(mut)]
    pub creator: Signer<'info>,

    #[account(
        mut,
        close = creator,
        has_one = creator @ BlinkFlowError::Unauthorized,
        has_one = mint @ BlinkFlowError::InvalidMint,
        seeds = [DIAL_SEED, deal.customer.as_ref(), deal.seed.to_le_bytes().as_ref()],
        bump = deal.bump,
    )]
    pub deal: Account<'info, Deal>,

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
        associated_token::authority = creator,
        associated_token::token_program = token_program
    )]
    pub creator_ata: Account<'info, TokenAccount>,

    pub associated_token_program: Program<'info, AssociatedToken>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

impl<'info> CloseDealAccount<'info> {
    pub fn close_deal_account(&mut self) -> Result<()> {
        require!(
            self.deal.task_closed_count == self.deal.task_total_count,
            BlinkFlowError::AllTasksNotClosed
        );

        let bump = [self.deal.bump];
        let signer_seeds: &[&[&[u8]]] = &[&[
            DIAL_SEED,
            self.deal.customer.as_ref(),
            &self.deal.seed.to_le_bytes(),
            &bump,
        ]];

        let remaining = self.deal_vault.amount;
        if remaining > 0 {
            transfer_checked(
                CpiContext::new_with_signer(
                    self.token_program.to_account_info(),
                    TransferChecked {
                        from: self.deal_vault.to_account_info(),
                        mint: self.mint.to_account_info(),
                        to: self.creator_ata.to_account_info(),
                        authority: self.deal.to_account_info(),
                    },
                    signer_seeds,
                ),
                remaining,
                self.mint.decimals,
            )?;
        }

        close_account(CpiContext::new_with_signer(
            self.token_program.to_account_info(),
            CloseAccount {
                account: self.deal_vault.to_account_info(),
                destination: self.creator_ata.to_account_info(),
                authority: self.deal.to_account_info(),
            },
            signer_seeds,
        ))?;

        let current_time = Clock::get()?.unix_timestamp;

        emit!(DealClosed {
            deal: self.deal.key(),
            creator: self.creator.key(),
            closed_at: current_time,
        });

        Ok(())
    }
}
