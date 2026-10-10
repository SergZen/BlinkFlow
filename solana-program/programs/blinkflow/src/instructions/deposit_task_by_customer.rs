use anchor_lang::prelude::*;
use anchor_spl::{associated_token::AssociatedToken, token::{Mint, Token, TokenAccount, TransferChecked, transfer_checked}};
use mpl_core::ID as MPL_CORE_ID;

use crate::{DIAL_SEED, Deal, PROTOCOL_SEED, Protocol, SBT_COLLECTION_SEED, SBT_SEED, TASK_SEED, Task, TaskStatus, error::BlinkFlowError, events::{SbtCreated, TaskDeposited}, sbt::{SbtContext, ensure_sbt_asset}};

#[derive(Accounts)]
#[instruction(task_index: u8)]
pub struct DepositTaskByCustomer<'info> {
    #[account(mut)]
    pub customer: Signer<'info>,

    #[account(
        seeds = [PROTOCOL_SEED],
        bump = protocol.bump,
    )]
    pub protocol: Account<'info, Protocol>,

    #[account(
        mut,
        has_one = customer @ BlinkFlowError::Unauthorized,
        has_one = mint @ BlinkFlowError::InvalidMint,
        seeds = [DIAL_SEED, customer.key().as_ref(), deal.seed.to_le_bytes().as_ref()],
        bump = deal.bump,
    )]
    pub deal: Account<'info, Deal>,

    #[account(
        mut,
        seeds = [TASK_SEED, deal.key().as_ref(), task_index.to_le_bytes().as_ref()],
        bump = task.bump,
    )]
    pub task: Account<'info, Task>,

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

impl<'info> SbtContext<'info> for DepositTaskByCustomer<'info> {
    fn sbt_collection(&self) -> AccountInfo<'info> { self.sbt_collection.to_account_info() }
    fn mpl_core_program(&self) -> AccountInfo<'info> { self.mpl_core_program.to_account_info() }
    fn system_program(&self) -> AccountInfo<'info> { self.system_program.to_account_info() }
}

impl<'info> DepositTaskByCustomer<'info> {
    pub fn deposit_task_by_customer(&mut self, task_index: u8, bumps: &DepositTaskByCustomerBumps) -> Result<()> {
        require!(!self.protocol.paused, BlinkFlowError::ProtocolPaused);
        require!(self.task.status == TaskStatus::ContractorCreated, BlinkFlowError::InvalidTaskStatus);
        require!(!self.task.deposited, BlinkFlowError::TaskAlreadyDeposited);
        
        let amount = self.task.amount;
        require!(amount > 0, BlinkFlowError::InvalidAmount);

        let current_time = Clock::get()?.unix_timestamp;

        self.task.deposited = true;
        self.task.deposited_at = current_time;
        self.task.started_at = current_time;
        self.task.status = TaskStatus::Started;

        let transfer_accounts = TransferChecked {
            from: self.customer_ata.to_account_info(),
            mint: self.mint.to_account_info(),
            to: self.deal_vault.to_account_info(),
            authority: self.customer.to_account_info(),
        };

        let cpi_ctx = CpiContext::new(self.token_program.to_account_info(), transfer_accounts);

        transfer_checked(cpi_ctx, amount, self.mint.decimals)?;

        emit!(TaskDeposited {
            deal: self.deal.key(),
            task: self.task.key(),
            customer: self.customer.key(),
            deposited_at: current_time,
            task_index
        });

        let created = ensure_sbt_asset(
            &*self, 
            &self.sbt_asset.to_account_info(),
            &self.customer.to_account_info(), 
            &self.customer.to_account_info(),
            bumps.sbt_asset, 
            bumps.sbt_collection, 
            // name, 
            // uri
        )?;
        
        if created { 
            emit!(SbtCreated { 
                creator: self.customer.key(),
                created_at: Clock::get()?.unix_timestamp, 
            });
        } 

        Ok(())
    }
}