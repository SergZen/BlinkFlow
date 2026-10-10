use anchor_lang::prelude::*;

#[error_code]
pub enum BlinkFlowError {
    #[msg("Unauthorized access")]
    Unauthorized,
    #[msg("Amount must be greater than zero.")]
    InvalidAmount,
    #[msg("Basis points cannot exceed 100% (10000 bps)")]
    InvalidBps,
    #[msg("The provided trust authority does not match the configured trust authority.")]
    InvalidTrustAuthority,
    #[msg("Deadline must be greater than zero.")]
    InvalidDeadline,
    #[msg("Task hash cannot be zero.")]
    InvalidTaskHash,
    #[msg("Invalid pubkey provided")]
    InvalidPubkey,
    #[msg("Contractor must be empty to add a new contractor.")]
    ContractorMustBeEmpty,
    #[msg("Contractor must be set as pending to accept the dial.")]
    ContractorMustBePending,
    #[msg("Task has already been deposited.")]
    TaskAlreadyDeposited,
    #[msg("Task status is invalid for this operation.")]
    InvalidTaskStatus,
    #[msg("The provided mint does not match the expected mint.")]
    InvalidMint,
    #[msg("The provided solution hash is invalid.")]
    InvalidSolutionHash,
    #[msg("The deadline for this task has expired.")]
    DeadlineExpired,
    #[msg("Overflow occurred during arithmetic operation.")]
    Overflow,
    #[msg("All tasks must be closed before the dial can be closed.")]
    AllTasksNotClosed,
    #[msg("Trust authority cannot act as a party to the contract.")]
    TrustAuthorityRoleMismatch,
    #[msg("Protocol operations are currently paused.")]
    ProtocolPaused,
    #[msg("The number of tasks exceeds the maximum allowed limit per dial.")]
    MaxTasksPerDealExceeded,
    #[msg("Collection name exceeds the maximum allowed length.")]
    CollectionNameTooLong,
    #[msg("Collection URI exceeds the maximum allowed length.")]
    CollectionUriTooLong,
    #[msg("The provided account is not the valid owner of this SBT.")]
    InvalidOwner,
    #[msg("The provided authority is invalid or not authorized to modify this SBT.")]
    InvalidAuthority,
    #[msg("It is too early to refund. The order deadline has not been reached yet.")]
    RefundTimeNotReached,
    #[msg("Invalid SBT account provided.")]
    InvalidSbtAccount,
    #[msg("Invalid or missing SBT attribute.")]
    InvalidSbtAttribute,
    #[msg("The provided review time is invalid.")]
    InvalidReviewTime,
    #[msg("The required time period before submitting a review has not been reached.")]
    ReviewPeriodNotReached,
    #[msg("The combined protocol and arbitration fee bps cannot exceed 10,000.")]  
    FeeSumExceedsMaximum,
}
