use anchor_lang::prelude::*;
use anchor_spl::{associated_token::AssociatedToken, token::{Mint, Token, TokenAccount}};

use mpl_core:: ID as MPL_CORE_ID;

use crate::{COLLECTION_NAME_MAX_SIZE, COLLECTION_URI_MAX_SIZE, PROTOCOL_SEED, SBT_COLLECTION_SEED, error::BlinkFlowError, sbt::{SbtContext, create_collection}, state::Protocol};

#[derive(Accounts)]
pub struct InitProtocol<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,

    /// CHECK: This is the trust authority account that will be used for certain operations in the program.
    trust_authority: UncheckedAccount<'info>,

    /// CHECK: This is the fee recipient account that will receive fees from the program.
    fee_recipient: UncheckedAccount<'info>,

    #[account(
        mint::token_program = token_program
    )]
    pub mint: Account<'info, Mint>,

    #[account(
        init,
        payer = admin,
        seeds = [PROTOCOL_SEED],
        space = Protocol::DISCRIMINATOR.len() + Protocol::INIT_SPACE,
        bump,
    )]
    pub protocol: Account<'info, Protocol>,

    #[account(
        init,
        payer = admin,
        associated_token::mint = mint,
        associated_token::authority = protocol,
        associated_token::token_program = token_program
    )]
    pub protocol_vault: Account<'info, TokenAccount>,
    
    #[account(
        constraint = program_data.upgrade_authority_address.is_some_and(|auth| auth == admin.key()) @ BlinkFlowError::Unauthorized,
        seeds = [crate::ID.as_ref()],
        bump,
        seeds::program = bpf_loader_upgradeable::id(),
    )]
    pub program_data: Account<'info, ProgramData>,

    /// CHECK: sbt_collection
    #[account(
        mut,
        seeds = [SBT_COLLECTION_SEED],
        bump
    )]
    pub sbt_collection: UncheckedAccount<'info>,

    /// CHECK: This is the ID of the Metaplex Core program
    #[account(address = MPL_CORE_ID)]
    pub mpl_core_program: UncheckedAccount<'info>,

    pub associated_token_program: Program<'info, AssociatedToken>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

impl<'info> SbtContext<'info> for InitProtocol<'info> {
    fn sbt_collection(&self) -> AccountInfo<'info> { self.sbt_collection.to_account_info() }
    fn mpl_core_program(&self) -> AccountInfo<'info> { self.mpl_core_program.to_account_info() }
    fn system_program(&self) -> AccountInfo<'info> { self.system_program.to_account_info() }
}

impl<'info> InitProtocol<'info> {
    pub fn init_protocol(
        &mut self,
        protocol_fee_bps: u16,
        arbitration_fee_bps: u16,
        name: String,
        uri: String,
        bumps: &InitProtocolBumps,
    ) -> Result<()> {
        require!(protocol_fee_bps <= 10000, BlinkFlowError::InvalidBps);
        require!(arbitration_fee_bps <= 10000, BlinkFlowError::InvalidBps);

        require!(
            protocol_fee_bps.checked_add(arbitration_fee_bps).unwrap_or(u16::MAX) <= 10_000,
            BlinkFlowError::FeeSumExceedsMaximum
        );

        require!(name.len() <= COLLECTION_NAME_MAX_SIZE as usize, BlinkFlowError::CollectionNameTooLong);
        require!(uri.len() <= COLLECTION_URI_MAX_SIZE as usize, BlinkFlowError::CollectionUriTooLong);
    
        self.protocol.set_inner(Protocol {
            admin: self.admin.key(),
            trust_authority: self.trust_authority.key(),
            fee_recipient: self.fee_recipient.key(),
            mint: self.mint.key(),
            protocol_fee_bps,
            arbitration_fee_bps,
            paused: false,
            bump: bumps.protocol,
        });

        create_collection(                
            &*self,
            &self.admin.to_account_info(),  
            bumps.sbt_collection,
            name,
            uri,
        )
    }
}
