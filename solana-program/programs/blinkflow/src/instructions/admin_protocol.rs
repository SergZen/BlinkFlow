use anchor_lang::prelude::*;

use crate::{error::BlinkFlowError, events::ProtocolSettingsChanged, Protocol, PROTOCOL_SEED};

#[derive(Accounts)]
pub struct AdminProtocol<'info> {
    pub admin: Signer<'info>,

    #[account(
        mut,
        seeds = [PROTOCOL_SEED],
        bump = protocol.bump,
        has_one = admin @ BlinkFlowError::Unauthorized
    )]
    pub protocol: Account<'info, Protocol>,
}

impl<'info> AdminProtocol<'info> {
    pub fn set_protocol_pause(&mut self, paused: bool) -> Result<()> {
        self.protocol.paused = paused;

        emit!(ProtocolSettingsChanged {
            admin: self.admin.key(),
            settings: "paused".to_string(),
            changed_at: Clock::get()?.unix_timestamp
        });

        Ok(())
    }

    pub fn set_trust_authority(&mut self, new_trust_authority: Pubkey) -> Result<()> {
        require_keys_neq!(
            new_trust_authority,
            Pubkey::default(),
            BlinkFlowError::InvalidPubkey
        );

        self.protocol.trust_authority = new_trust_authority;

        emit!(ProtocolSettingsChanged {
            admin: self.admin.key(),
            settings: "trust_authority".to_string(),
            changed_at: Clock::get()?.unix_timestamp
        });

        Ok(())
    }

    pub fn set_fee_recipient(&mut self, new_fee_recipient: Pubkey) -> Result<()> {
        require_keys_neq!(
            new_fee_recipient,
            Pubkey::default(),
            BlinkFlowError::InvalidPubkey
        );

        self.protocol.fee_recipient = new_fee_recipient;

        emit!(ProtocolSettingsChanged {
            admin: self.admin.key(),
            settings: "fee_recipient".to_string(),
            changed_at: Clock::get()?.unix_timestamp
        });

        Ok(())
    }

    pub fn set_protocol_fee_bps(&mut self, new_protocol_fee_bps: u16) -> Result<()> {
        require!(new_protocol_fee_bps <= 10_000, BlinkFlowError::InvalidBps);

        require!(
            new_protocol_fee_bps.checked_add(self.protocol.arbitration_fee_bps).unwrap_or(u16::MAX) <= 10_000,
            BlinkFlowError::FeeSumExceedsMaximum
        );

        self.protocol.protocol_fee_bps = new_protocol_fee_bps;

        emit!(ProtocolSettingsChanged {
            admin: self.admin.key(),
            settings: "protocol_fee_bps".to_string(),
            changed_at: Clock::get()?.unix_timestamp
        });

        Ok(())
    }

    pub fn set_arbitration_fee_bps(&mut self, new_arbitration_fee_bps: u16) -> Result<()> {
        require!(
            new_arbitration_fee_bps <= 10_000,
            BlinkFlowError::InvalidBps
        );

        require!(
            new_arbitration_fee_bps.checked_add(self.protocol.protocol_fee_bps).unwrap_or(u16::MAX) <= 10_000,
            BlinkFlowError::FeeSumExceedsMaximum
        );

        self.protocol.arbitration_fee_bps = new_arbitration_fee_bps;

        emit!(ProtocolSettingsChanged {
            admin: self.admin.key(),
            settings: "arbitration_fee_bps".to_string(),
            changed_at: Clock::get()?.unix_timestamp
        });

        Ok(())
    }
}
