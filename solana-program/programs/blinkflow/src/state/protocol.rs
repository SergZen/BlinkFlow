use anchor_lang::prelude::*;

#[account]
#[derive(InitSpace)]
pub struct Protocol {
    pub admin: Pubkey,              
    pub trust_authority: Pubkey,
    pub fee_recipient: Pubkey,
    pub mint: Pubkey,
    pub protocol_fee_bps: u16,
    pub arbitration_fee_bps: u16,
    pub paused: bool,
    pub bump: u8,
}