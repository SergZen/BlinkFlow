use anchor_lang::prelude::*;
use anchor_spl::{
    associated_token::AssociatedToken,
    token::{transfer_checked, Mint, Token, TokenAccount, TransferChecked},
};

use crate::{error::BlinkFlowError, events::ProtocolFeeWithdrawn, Protocol, PROTOCOL_SEED};

#[derive(Accounts)]
pub struct WithdrawProtocolFee<'info> {
    #[account(mut)]
    pub fee_recipient: Signer<'info>,

    #[account(
        has_one = fee_recipient @ BlinkFlowError::Unauthorized,
        seeds = [PROTOCOL_SEED],
        bump = protocol.bump,
    )]
    pub protocol: Account<'info, Protocol>,

    #[account(
        mint::token_program = token_program
    )]
    pub mint: Account<'info, Mint>,

    #[account(
        mut,
        associated_token::mint = mint,
        associated_token::authority = protocol,
        associated_token::token_program = token_program
    )]
    pub protocol_vault: Account<'info, TokenAccount>,

    #[account(
        init_if_needed,
        payer = fee_recipient,
        associated_token::mint = mint,
        associated_token::authority = fee_recipient,
        associated_token::token_program = token_program
    )]
    pub fee_recipient_ata: Account<'info, TokenAccount>,

    pub associated_token_program: Program<'info, AssociatedToken>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

impl<'info> WithdrawProtocolFee<'info> {
    pub fn withdraw_protocol_fee(&mut self, amount: u64) -> Result<()> {
        require!(!self.protocol.paused, BlinkFlowError::ProtocolPaused);
        require!(amount > 0, BlinkFlowError::InvalidAmount);

        let bump = [self.protocol.bump];
        let signer_seeds: &[&[&[u8]]] = &[&[PROTOCOL_SEED, &bump]];

        let transfer_accounts = TransferChecked {
            from: self.protocol_vault.to_account_info(),
            mint: self.mint.to_account_info(),
            to: self.fee_recipient_ata.to_account_info(),
            authority: self.protocol.to_account_info(),
        };

        let cpi_ctx = CpiContext::new_with_signer(
            self.token_program.to_account_info(),
            transfer_accounts,
            signer_seeds,
        );

        transfer_checked(cpi_ctx, amount, self.mint.decimals)?;

        let current_time = Clock::get()?.unix_timestamp;

        emit!(ProtocolFeeWithdrawn {
            fee_recipient: self.fee_recipient.key(),
            amount,
            withdrawn_at: current_time
        });

        Ok(())
    }
}
