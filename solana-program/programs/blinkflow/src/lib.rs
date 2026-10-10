#![allow(unexpected_cfgs)]

use anchor_lang::prelude::*;

pub mod constants;
pub mod error;
pub mod events;
pub mod instructions;
pub mod state;
pub mod sbt;

pub use constants::*;
pub use instructions::*;
pub use state::*;

declare_id!("3vJWWymQCHkntbWTgPfL2ujrquLrYHLneqzebr7bnkik");

#[program]
pub mod blinkflow {
    use super::*;

    // admin
    pub fn init_protocol(
        ctx: Context<InitProtocol>,
        success_fee_bps: u16,
        arbitration_fee_bps: u16,
        name: String,
        uri: String,
    ) -> Result<()> {
        ctx.accounts
            .init_protocol(success_fee_bps, arbitration_fee_bps, name, uri, &ctx.bumps)
    }

    pub fn set_protocol_pause(ctx: Context<AdminProtocol>, paused: bool) -> Result<()> {
        ctx.accounts.set_protocol_pause(paused)
    }

    pub fn set_trust_authority(
        ctx: Context<AdminProtocol>,
        new_trust_authority: Pubkey,
    ) -> Result<()> {
        ctx.accounts.set_trust_authority(new_trust_authority)
    }

    pub fn set_fee_recipient(ctx: Context<AdminProtocol>, new_fee_recipient: Pubkey) -> Result<()> {
        ctx.accounts.set_fee_recipient(new_fee_recipient)
    }

    pub fn set_protocol_fee_bps(
        ctx: Context<AdminProtocol>,
        new_protocol_fee_bps: u16,
    ) -> Result<()> {
        ctx.accounts.set_protocol_fee_bps(new_protocol_fee_bps)
    }

    pub fn set_arbitration_fee_bps(
        ctx: Context<AdminProtocol>,
        new_arbitration_fee_bps: u16,
    ) -> Result<()> {
        ctx.accounts
            .set_arbitration_fee_bps(new_arbitration_fee_bps)
    }
    
    // customer
    pub fn init_deal_by_customer(
        ctx: Context<InitDealByCustomer>,
        seed: u64,
        amount: u64,
        task_hash: [u8; 32],
        deadline: i64,
    ) -> Result<()> {
        ctx.accounts
            .init_deal_by_customer(seed, amount, task_hash, deadline, &ctx.bumps)
    }

    pub fn add_task_by_customer(
        ctx: Context<AddTaskByCustomer>,
        amount: u64,
        task_hash: [u8; 32],
        deadline: i64,
    ) -> Result<()> {
        ctx.accounts.add_task_by_customer(amount, task_hash, deadline, &ctx.bumps)
    }

    pub fn complete_task_by_customer(
        ctx: Context<CompleteTaskByCustomer>,
        task_index: u8,
        approved: bool,
    ) -> Result<()> {
        ctx.accounts.complete_task_by_customer(task_index, approved, &ctx.bumps)
    }

    pub fn release_task_after_review_period(
        ctx: Context<ReleaseTaskAfterReviewPeriod>,
        task_index: u8,
    ) -> Result<()> {
        ctx.accounts.release_task_after_review_period(task_index, &ctx.bumps)
    }

    pub fn deposit_task_by_customer(ctx: Context<DepositTaskByCustomer>, task_index: u8) -> Result<()> {
        ctx.accounts.deposit_task_by_customer(task_index, &ctx.bumps)
    }

    // contractor
    pub fn init_deal_by_contractor(
        ctx: Context<InitDealByContractor>,
        seed: u64,
        amount: u64,
        task_hash: [u8; 32],
        deadline: i64,
    ) -> Result<()> {
        ctx.accounts
            .init_deal_by_contractor(seed, amount, task_hash, deadline, &ctx.bumps)
    }

    pub fn add_contractor_to_deal(ctx: Context<AddContractorToDeal>) -> Result<()> {
        ctx.accounts.add_contractor_to_deal()
    }

    pub fn accept_deal_by_contractor(ctx: Context<AcceptDealByContractor>) -> Result<()> {
        ctx.accounts.accept_deal_by_contractor(&ctx.bumps)
    }

    pub fn accept_task_by_contractor(ctx: Context<AcceptTaskByContractor>, task_index: u8) -> Result<()> {
        ctx.accounts.accept_task_by_contractor(task_index)
    }

    pub fn add_task_by_contractor(
        ctx: Context<AddTaskByContractor>,
        amount: u64,
        task_hash: [u8; 32],
        deadline: i64,
    ) -> Result<()> {
        ctx.accounts.add_task_by_contractor(amount, task_hash, deadline, &ctx.bumps)
    }

    pub fn cancel_task_by_contractor(ctx: Context<CancelTaskByContractor>, task_index: u8) -> Result<()> {
        ctx.accounts.cancel_task_by_contractor(task_index)
    }

    pub fn cancel_task_by_customer(ctx: Context<CancelTaskByCustomer>, task_index: u8) -> Result<()> {
        ctx.accounts.cancel_task_by_customer(task_index)
    }

    pub fn refund_task_deadline(ctx: Context<RefundTaskDeadline>, task_index: u8) -> Result<()> {
        ctx.accounts.refund_task_deadline(task_index)
    }

    pub fn finish_task_by_contractor(ctx: Context<FinishTaskByContractor>, task_index: u8, solution_hash: [u8; 32]) -> Result<()> {
        ctx.accounts.finish_task_by_contractor(task_index, solution_hash)
    }

    //customer || contractor
    pub fn close_deal_account(ctx: Context<CloseDealAccount>) -> Result<()> {
        ctx.accounts.close_deal_account()
    }

    pub fn close_task_account(ctx: Context<CloseTaskAccount>, task_index: u8) -> Result<()> {
        ctx.accounts.close_task_account(task_index)
    }

    // trust_authority
    pub fn resolve_dispute(
        ctx: Context<ResolveDispute>,
        task_index: u8,
        customer_win: bool,
    ) -> Result<()> {
        ctx.accounts.resolve_dispute(task_index, customer_win, &ctx.bumps)
    }

    // fee_recipient
    pub fn withdraw_protocol_fee(ctx: Context<WithdrawProtocolFee>, amount: u64) -> Result<()> {
        ctx.accounts.withdraw_protocol_fee(amount)
    }
   
}
