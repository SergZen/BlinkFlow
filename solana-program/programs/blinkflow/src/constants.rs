use anchor_lang::prelude::*;

#[constant]
pub const PROTOCOL_SEED: &[u8] = b"protocol";

#[constant]
pub const SBT_COLLECTION_SEED: &[u8] = b"sbt_collection";

#[constant]
pub const SBT_SEED: &[u8] = b"sbt";

#[constant]
pub const DIAL_SEED: &[u8] = b"dial";

#[constant]
pub const TASK_SEED: &[u8] = b"task";

#[constant]
pub const FIRST_TASK_INDEX: &[u8; 1] = &[0];

#[constant]
pub const GHOSTING_TIMER_SECS: i64 = 14 * 24 * 60 * 60;

#[constant]
pub const REVIEW_PERIOD_SECS: i64 = 14 * 24 * 60 * 60;

#[constant]
pub const DEADLINE_MIN_SECS: i64 = 1 * 24 * 60 * 60;

#[constant]
pub const DEADLINE_MAX_SECS: i64 = 365 * 24 * 60 * 60;

#[constant]
pub const MAX_COUNT_TASK_BY_DIAL:u8 = 255;

#[constant]
pub const COLLECTION_NAME_MAX_SIZE:u8 = 32;

#[constant]
pub const COLLECTION_URI_MAX_SIZE:u8 = 200;