use anchor_lang::prelude::*;
use mpl_core::{
    ID as MPL_CORE_ID, accounts::{BaseAssetV1, BaseCollectionV1}, fetch_plugin, instructions::{CreateCollectionV2CpiBuilder, CreateV2CpiBuilder, UpdatePluginV1CpiBuilder}, types::{
        Attribute, Attributes, FreezeDelegate, Key as MPL_Key, Plugin, PluginAuthority,
        PluginAuthorityPair, PluginType, UpdateAuthority,
    },
};

use crate::{error::BlinkFlowError, SBT_COLLECTION_SEED, SBT_SEED};

pub const ATTR_VERSION: &str = "v";
pub const ATTR_CONTRACTOR_SUCCESS: &str = "contractor_success";
pub const ATTR_CONTRACTOR_LOST: &str = "contractor_lost";
pub const ATTR_CONTRACTOR_DISPUTES: &str = "contractor_disputes";
pub const ATTR_CONTRACTOR_VOLUME: &str = "contractor_volume";
pub const ATTR_CUSTOMER_SUCCESS: &str = "customer_success";
pub const ATTR_CUSTOMER_LOST: &str = "customer_lost";
pub const ATTR_CUSTOMER_DISPUTES: &str = "customer_disputes";
pub const ATTR_CUSTOMER_VOLUME: &str = "customer_volume";
pub const ATTR_FIRST_SEEN: &str = "first_seen";
pub const ATTR_LAST_SEEN: &str = "last_seen";
pub const ATTR_CONTRACTOR_AUTO_RELEASED: &str = "contractor_auto_released";
pub const ATTR_CUSTOMER_UNRESPONSIVE: &str = "customer_unresponsive";

pub const ASSET_URI: &str = "https://blinkflow-server-production.up.railway.app/sbt/";

pub trait SbtContext<'info> {
    fn sbt_collection(&self) -> AccountInfo<'info>;
    fn mpl_core_program(&self) -> AccountInfo<'info>;
    fn system_program(&self) -> AccountInfo<'info>;
}

pub fn create_collection<'info, C: SbtContext<'info>>(
        ctx: &C,
        payer: &AccountInfo<'info>,
        collection_bump: u8,
        name: String,
        uri: String,
    ) -> Result<()> {
    let collection = ctx.sbt_collection();

    let signer_seeds: &[&[u8]] = &[SBT_COLLECTION_SEED, &[collection_bump]];

    let program = ctx.mpl_core_program();
    let system = ctx.system_program();

    CreateCollectionV2CpiBuilder::new(&program)
        .collection(&collection)
        .payer(&payer)
        .update_authority(Some(&collection))
        .system_program(&system)
        .name(name)
        .uri(uri)
        .invoke_signed(&[signer_seeds])?;

    Ok(())
}

fn validate_collection(collection: &AccountInfo) -> Result<()> {
    require_keys_eq!(
        *collection.owner,
        MPL_CORE_ID,
        BlinkFlowError::InvalidSbtAccount
    );

    let base = BaseCollectionV1::try_from(collection)
        .map_err(|_| error!(BlinkFlowError::InvalidSbtAccount))?;

    require!(
        base.key == MPL_Key::CollectionV1,
        BlinkFlowError::InvalidSbtAccount
    );
    require_keys_eq!(
        base.update_authority,
        collection.key(),
        BlinkFlowError::InvalidAuthority
    );
    Ok(())
}

fn validate_asset(asset: &AccountInfo, collection: &Pubkey, owner: &Pubkey) -> Result<()> {
    require_keys_eq!(*asset.owner, MPL_CORE_ID, BlinkFlowError::InvalidSbtAccount);

    let base =
        BaseAssetV1::try_from(asset).map_err(|_| error!(BlinkFlowError::InvalidSbtAccount))?;

    require!(
        base.key == MPL_Key::AssetV1,
        BlinkFlowError::InvalidSbtAccount
    );
    require_keys_eq!(base.owner, *owner, BlinkFlowError::InvalidOwner);
    require!(
        base.update_authority == UpdateAuthority::Collection(*collection),
        BlinkFlowError::InvalidAuthority
    );
    Ok(())
}

pub const SBT_VERSION: u64 = 1;

const SCHEMA_KEYS: [&str; 13] = [
    ATTR_VERSION,
    ATTR_CONTRACTOR_SUCCESS,
    ATTR_CONTRACTOR_LOST,
    ATTR_CONTRACTOR_DISPUTES,
    ATTR_CONTRACTOR_VOLUME,
    ATTR_CUSTOMER_SUCCESS,
    ATTR_CUSTOMER_LOST,
    ATTR_CUSTOMER_DISPUTES,
    ATTR_CUSTOMER_VOLUME,
    ATTR_FIRST_SEEN,
    ATTR_LAST_SEEN,
    ATTR_CONTRACTOR_AUTO_RELEASED,
    ATTR_CUSTOMER_UNRESPONSIVE,
];

fn default_value(key: &str) -> String {
    if key == ATTR_VERSION {
        SBT_VERSION.to_string()
    } else {
        "0".to_string()
    }
}

pub fn default_attributes() -> Vec<Attribute> {
    SCHEMA_KEYS
        .into_iter()
        .map(|key| Attribute {
            key: key.to_string(),
            value: default_value(key),
        })
        .collect()
}

#[allow(clippy::too_many_arguments)]
pub fn ensure_sbt_asset<'info, C: SbtContext<'info>>(
    ctx: &C,
    sbt_asset: &AccountInfo<'info>,
    owner: &AccountInfo<'info>,
    payer: &AccountInfo<'info>,
    asset_bump: u8,
    collection_bump: u8,
) -> Result<bool> {
    let collection = ctx.sbt_collection();
    validate_collection(&collection)?;

    if *sbt_asset.owner == MPL_CORE_ID && !sbt_asset.data_is_empty() {
        validate_asset(sbt_asset, &collection.key(), &owner.key())?;
        return Ok(false);
    }

    require!(
        *sbt_asset.owner == System::id() && sbt_asset.data_is_empty(),
        BlinkFlowError::InvalidSbtAccount
    );

    let collection_bump = [collection_bump];
    let collection_seeds: &[&[u8]] = &[SBT_COLLECTION_SEED, &collection_bump];

    let owner_key = owner.key();
    let asset_bump = [asset_bump];
    let asset_seeds: &[&[u8]] = &[SBT_SEED, owner_key.as_ref(), &asset_bump];

    let freeze_plugin = PluginAuthorityPair {
        plugin: Plugin::FreezeDelegate(FreezeDelegate { frozen: true }),
        authority: Some(PluginAuthority::UpdateAuthority),
    };
    let attributes_plugin = PluginAuthorityPair {
        plugin: Plugin::Attributes(Attributes {
            attribute_list: default_attributes(),
        }),
        authority: Some(PluginAuthority::UpdateAuthority),
    };

    let program = ctx.mpl_core_program();
    let system = ctx.system_program();

    let asset_name = owner.key().to_string();
    let asset_uri = format!("{}{}.json", ASSET_URI, owner.key());

    CreateV2CpiBuilder::new(&program)
        .asset(sbt_asset)
        .collection(Some(&collection))
        .authority(Some(&collection))
        .payer(payer)
        .owner(Some(owner))
        .update_authority(None)
        .system_program(&system)
        .name(asset_name)
        .uri(asset_uri)
        .plugins(vec![freeze_plugin, attributes_plugin])
        .invoke_signed(&[collection_seeds, asset_seeds])?;

    Ok(true)
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum SbtRole {
    Customer,
    Contractor,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum SbtOutcome {
    Completed,
    DisputeWon,
    DisputeLost,
    AutoReleased,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct SbtUpdate {
    pub role: SbtRole,
    pub outcome: SbtOutcome,
    pub amount: u64,
}

impl SbtUpdate {
    pub fn new(role: SbtRole, outcome: SbtOutcome, amount: u64) -> Self {
        Self {
            role,
            outcome,
            amount,
        }
    }

    fn deltas(&self) -> Deltas {
        let auto = self.outcome == SbtOutcome::AutoReleased;
        let won = match self.role {
            SbtRole::Customer => matches!(self.outcome, SbtOutcome::Completed | SbtOutcome::DisputeWon),
            SbtRole::Contractor => matches!(
                self.outcome,
                SbtOutcome::Completed | SbtOutcome::DisputeWon | SbtOutcome::AutoReleased
            ),
        };
        let lost = self.outcome == SbtOutcome::DisputeLost;
        let disputed = matches!(self.outcome, SbtOutcome::DisputeWon | SbtOutcome::DisputeLost);
        let paid_out = match self.role {
            SbtRole::Customer => matches!(
                self.outcome,
                SbtOutcome::Completed | SbtOutcome::DisputeLost | SbtOutcome::AutoReleased
            ),
            SbtRole::Contractor => won,
        };
        Deltas {
            success: won as u64,
            lost: lost as u64,
            disputes: disputed as u64,
            volume: if paid_out { self.amount } else { 0 },
            auto_released: (auto && self.role == SbtRole::Contractor) as u64,
            unresponsive: (auto && self.role == SbtRole::Customer) as u64,
            touch_last_seen: !(auto && self.role == SbtRole::Customer),
        }
    }

    fn keys(&self) -> RoleKeys {
        match self.role {
            SbtRole::Customer => RoleKeys {
                success: ATTR_CUSTOMER_SUCCESS,
                lost: ATTR_CUSTOMER_LOST,
                disputes: ATTR_CUSTOMER_DISPUTES,
                volume: ATTR_CUSTOMER_VOLUME,
            },
            SbtRole::Contractor => RoleKeys {
                success: ATTR_CONTRACTOR_SUCCESS,
                lost: ATTR_CONTRACTOR_LOST,
                disputes: ATTR_CONTRACTOR_DISPUTES,
                volume: ATTR_CONTRACTOR_VOLUME,
            },
        }
    }
}

struct Deltas {
    success: u64,
    lost: u64,
    disputes: u64,
    volume: u64,
    auto_released: u64,
    unresponsive: u64,
    touch_last_seen: bool,
}

struct RoleKeys {
    success: &'static str,
    lost: &'static str,
    disputes: &'static str,
    volume: &'static str,
}

pub fn update_sbt<'info, C: SbtContext<'info>>(
    ctx: &C,
    sbt_asset: &AccountInfo<'info>,
    owner: &Pubkey,
    payer: &AccountInfo<'info>,
    collection_bump: u8,
    update: SbtUpdate,
) -> Result<()> {
    let collection = ctx.sbt_collection();
    validate_collection(&collection)?;
    validate_asset(sbt_asset, &collection.key(), owner)?;

    let (_, attributes, _) =
        fetch_plugin::<BaseAssetV1, Attributes>(sbt_asset, PluginType::Attributes)
            .map_err(|_| error!(BlinkFlowError::InvalidSbtAccount))?;

    let now = Clock::get()?.unix_timestamp;
    let attribute_list = apply_update(attributes.attribute_list, now, update)?;

    let bump = [collection_bump];
    let collection_seeds: &[&[u8]] = &[SBT_COLLECTION_SEED, &bump];

    let program = ctx.mpl_core_program();
    let system = ctx.system_program();

    UpdatePluginV1CpiBuilder::new(&program)
        .asset(sbt_asset)
        .collection(Some(&collection))
        .payer(payer)
        .authority(Some(&collection))
        .system_program(&system)
        .plugin(Plugin::Attributes(Attributes { attribute_list }))
        .invoke_signed(&[collection_seeds])?;

    Ok(())
}

fn normalize_attributes(mut list: Vec<Attribute>) -> Result<Vec<Attribute>> {
    for key in SCHEMA_KEYS {
        if !list.iter().any(|attribute| attribute.key == key) {
            list.push(Attribute {
                key: key.to_string(),
                value: default_value(key),
            });
        }
    }

    for attribute in list.iter_mut().filter(|a| a.key == ATTR_VERSION) {
        let version = attribute
            .value
            .parse::<u64>()
            .map_err(|_| error!(BlinkFlowError::InvalidSbtAttribute))?;
        if version < SBT_VERSION {
            attribute.value = SBT_VERSION.to_string();
        }
    }

    Ok(list)
}

fn bump(current: &str, delta: u64) -> Result<String> {
    if delta == 0 {
        return Ok(current.to_string());
    }
    let value = current
        .parse::<u64>()
        .map_err(|_| error!(BlinkFlowError::InvalidSbtAttribute))?;

    Ok(value
        .checked_add(delta)
        .ok_or_else(|| error!(BlinkFlowError::InvalidSbtAttribute))?
        .to_string())
}

fn apply_update(attributes: Vec<Attribute>, now: i64, update: SbtUpdate) -> Result<Vec<Attribute>> {
    let list = normalize_attributes(attributes)?;
    let keys = update.keys();
    let deltas = update.deltas();

    list.into_iter()
        .map(|attribute| {
            let cur = attribute.value.as_str();
            let key = attribute.key.as_str();

            let value = if key == keys.success {
                bump(cur, deltas.success)?
            } else if key == keys.lost {
                bump(cur, deltas.lost)?
            } else if key == keys.disputes {
                bump(cur, deltas.disputes)?
            } else if key == keys.volume {
                bump(cur, deltas.volume)?
            } else if key == ATTR_FIRST_SEEN {
                let first_seen = cur
                    .parse::<i64>()
                    .map_err(|_| error!(BlinkFlowError::InvalidSbtAttribute))?;
                if first_seen == 0 {
                    now.to_string()
                } else {
                    first_seen.to_string()
                }
            } else if key == ATTR_LAST_SEEN {
                if deltas.touch_last_seen {
                    now.to_string()
                } else {
                    attribute.value.clone()
                }
            } else if key == ATTR_CONTRACTOR_AUTO_RELEASED {
                bump(cur, deltas.auto_released)?
            } else if key == ATTR_CUSTOMER_UNRESPONSIVE {
                bump(cur, deltas.unresponsive)?
            } else {
                attribute.value.clone()
            };

            Ok(Attribute {
                key: attribute.key,
                value,
            })
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    const NOW: i64 = 1_800_000_000;
    const EARLIER: i64 = 1_700_000_000;

    fn attrs(pairs: &[(&str, &str)]) -> Vec<Attribute> {
        pairs
            .iter()
            .map(|(key, value)| Attribute {
                key: key.to_string(),
                value: value.to_string(),
            })
            .collect()
    }

    fn get<'a>(list: &'a [Attribute], key: &str) -> &'a str {
        let found: Vec<&Attribute> = list.iter().filter(|a| a.key == key).collect();
        assert_eq!(found.len(), 1, "key {key} must appear exactly once");
        found[0].value.as_str()
    }

    fn keys(list: &[Attribute]) -> Vec<&str> {
        list.iter().map(|a| a.key.as_str()).collect()
    }

    fn assert_code(result: Result<Vec<Attribute>>, code: BlinkFlowError) {
        match result {
            Err(Error::AnchorError(e)) => {
                assert_eq!(e.error_code_number, u32::from(code))
            }
            other => panic!("expected anchor error, got {other:?}"),
        }
    }

    fn fresh() -> Vec<Attribute> {
        default_attributes()
    }

    fn update(role: SbtRole, outcome: SbtOutcome, amount: u64) -> SbtUpdate {
        SbtUpdate::new(role, outcome, amount)
    }

    fn run(list: Vec<Attribute>, u: SbtUpdate) -> Vec<Attribute> {
        apply_update(list, NOW, u).unwrap()
    }

    fn snapshot(list: &[Attribute]) -> Vec<(String, String)> {
        let mut v: Vec<(String, String)> = list
            .iter()
            .map(|a| (a.key.clone(), a.value.clone()))
            .collect();
        v.sort();
        v
    }

    #[test]
    fn default_attributes_follow_schema() {
        let list = default_attributes();
        assert_eq!(list.len(), SCHEMA_KEYS.len());
        assert_eq!(keys(&list), SCHEMA_KEYS.to_vec());
        assert_eq!(get(&list, ATTR_VERSION), "1");
        for key in SCHEMA_KEYS.iter().filter(|k| **k != ATTR_VERSION) {
            assert_eq!(get(&list, key), "0");
        }
    }

    #[test]
    fn normalize_leaves_complete_list_untouched() {
        let list = fresh();
        let normalized = normalize_attributes(list.clone()).unwrap();
        assert_eq!(normalized, list);
    }

    #[test]
    fn normalize_is_idempotent() {
        let once = normalize_attributes(attrs(&[(ATTR_VERSION, "1")])).unwrap();
        let twice = normalize_attributes(once.clone()).unwrap();
        assert_eq!(once, twice);
    }

    #[test]
    fn normalize_adds_every_missing_attribute_to_empty_list() {
        let normalized = normalize_attributes(Vec::new()).unwrap();
        assert_eq!(normalized, default_attributes());
    }

    #[test]
    fn normalize_appends_missing_keys_after_existing_ones_in_schema_order() {
        let old = attrs(&[
            (ATTR_CUSTOMER_SUCCESS, "4"),
            (ATTR_VERSION, "1"),
            (ATTR_CONTRACTOR_SUCCESS, "2"),
        ]);
        let normalized = normalize_attributes(old).unwrap();

        assert_eq!(
            keys(&normalized)[..3],
            [ATTR_CUSTOMER_SUCCESS, ATTR_VERSION, ATTR_CONTRACTOR_SUCCESS]
        );
        let appended: Vec<&str> = SCHEMA_KEYS
            .iter()
            .copied()
            .filter(|k| {
                *k != ATTR_CUSTOMER_SUCCESS && *k != ATTR_VERSION && *k != ATTR_CONTRACTOR_SUCCESS
            })
            .collect();
        assert_eq!(keys(&normalized)[3..], appended[..]);
        assert_eq!(normalized.len(), SCHEMA_KEYS.len());
    }

    #[test]
    fn normalize_keeps_existing_values() {
        let old = attrs(&[
            (ATTR_VERSION, "1"),
            (ATTR_CUSTOMER_SUCCESS, "7"),
            (ATTR_CONTRACTOR_VOLUME, "123456"),
            (ATTR_FIRST_SEEN, "1700000000"),
        ]);
        let normalized = normalize_attributes(old).unwrap();
        assert_eq!(get(&normalized, ATTR_CUSTOMER_SUCCESS), "7");
        assert_eq!(get(&normalized, ATTR_CONTRACTOR_VOLUME), "123456");
        assert_eq!(get(&normalized, ATTR_FIRST_SEEN), "1700000000");
        assert_eq!(get(&normalized, ATTR_CONTRACTOR_LOST), "0");
        assert_eq!(get(&normalized, ATTR_LAST_SEEN), "0");
    }

    #[test]
    fn normalize_keeps_unknown_attributes() {
        let old = attrs(&[(ATTR_VERSION, "1"), ("badge", "gold")]);
        let normalized = normalize_attributes(old).unwrap();
        assert_eq!(get(&normalized, "badge"), "gold");
        assert_eq!(normalized.len(), SCHEMA_KEYS.len() + 1);
    }

    #[test]
    fn normalize_raises_older_version_and_keeps_newer() {
        let old = normalize_attributes(attrs(&[(ATTR_VERSION, "0")])).unwrap();
        assert_eq!(get(&old, ATTR_VERSION), SBT_VERSION.to_string());

        let newer = normalize_attributes(attrs(&[(ATTR_VERSION, "99")])).unwrap();
        assert_eq!(get(&newer, ATTR_VERSION), "99");
    }

    #[test]
    fn normalize_rejects_invalid_version() {
        assert_code(
            normalize_attributes(attrs(&[(ATTR_VERSION, "one")])),
            BlinkFlowError::InvalidSbtAttribute,
        );
    }

    #[test]
    fn update_adds_missing_attributes_before_applying_changes() {
        let old = attrs(&[
            (ATTR_VERSION, "1"),
            (ATTR_CUSTOMER_SUCCESS, "2"),
            (ATTR_CUSTOMER_LOST, "1"),
            (ATTR_CUSTOMER_DISPUTES, "1"),
            (ATTR_CUSTOMER_VOLUME, "500"),
            (ATTR_CONTRACTOR_SUCCESS, "3"),
        ]);

        let out = run(old, update(SbtRole::Customer, SbtOutcome::Completed, 40));

        assert_eq!(out.len(), SCHEMA_KEYS.len());
        for key in SCHEMA_KEYS {
            get(&out, key);
        }
        assert_eq!(get(&out, ATTR_CUSTOMER_SUCCESS), "3");
        assert_eq!(get(&out, ATTR_CUSTOMER_LOST), "1");
        assert_eq!(get(&out, ATTR_CUSTOMER_DISPUTES), "1");
        assert_eq!(get(&out, ATTR_CUSTOMER_VOLUME), "540");
        assert_eq!(get(&out, ATTR_CONTRACTOR_SUCCESS), "3");
        assert_eq!(get(&out, ATTR_CONTRACTOR_LOST), "0");
        assert_eq!(get(&out, ATTR_CONTRACTOR_DISPUTES), "0");
        assert_eq!(get(&out, ATTR_CONTRACTOR_VOLUME), "0");
        assert_eq!(get(&out, ATTR_FIRST_SEEN), NOW.to_string());
        assert_eq!(get(&out, ATTR_LAST_SEEN), NOW.to_string());
    }

    #[test]
    fn update_counts_event_on_a_newly_added_attribute() {
        let old = attrs(&[(ATTR_VERSION, "1"), (ATTR_CONTRACTOR_SUCCESS, "5")]);

        let out = run(
            old,
            update(SbtRole::Contractor, SbtOutcome::DisputeLost, 10),
        );

        assert_eq!(get(&out, ATTR_CONTRACTOR_SUCCESS), "5");
        assert_eq!(get(&out, ATTR_CONTRACTOR_LOST), "1");
        assert_eq!(get(&out, ATTR_CONTRACTOR_DISPUTES), "1");
        assert_eq!(get(&out, ATTR_CONTRACTOR_VOLUME), "0");
    }

    #[test]
    fn update_on_empty_attribute_list_builds_full_set() {
        let out = run(
            Vec::new(),
            update(SbtRole::Contractor, SbtOutcome::Completed, 25),
        );
        assert_eq!(out.len(), SCHEMA_KEYS.len());
        assert_eq!(get(&out, ATTR_CONTRACTOR_SUCCESS), "1");
        assert_eq!(get(&out, ATTR_CONTRACTOR_VOLUME), "25");
    }

    #[test]
    fn update_keeps_unknown_attributes_and_existing_order() {
        let old = attrs(&[("badge", "gold"), (ATTR_VERSION, "1")]);
        let out = run(old, update(SbtRole::Customer, SbtOutcome::Completed, 1));
        assert_eq!(keys(&out)[0], "badge");
        assert_eq!(keys(&out)[1], ATTR_VERSION);
        assert_eq!(get(&out, "badge"), "gold");
    }

    #[test]
    fn update_raises_version_of_old_asset() {
        let old = attrs(&[(ATTR_VERSION, "0")]);
        let out = run(old, update(SbtRole::Customer, SbtOutcome::Completed, 1));
        assert_eq!(get(&out, ATTR_VERSION), SBT_VERSION.to_string());
    }

    #[test]
    fn first_seen_is_set_once_and_last_seen_always_moves() {
        let first = run(fresh(), update(SbtRole::Customer, SbtOutcome::Completed, 1));
        assert_eq!(get(&first, ATTR_FIRST_SEEN), NOW.to_string());
        assert_eq!(get(&first, ATTR_LAST_SEEN), NOW.to_string());

        let later = apply_update(
            first,
            NOW + 500,
            update(SbtRole::Customer, SbtOutcome::Completed, 1),
        )
        .unwrap();
        assert_eq!(get(&later, ATTR_FIRST_SEEN), NOW.to_string());
        assert_eq!(get(&later, ATTR_LAST_SEEN), (NOW + 500).to_string());
    }

    #[test]
    fn existing_first_seen_is_preserved() {
        let old = attrs(&[(ATTR_FIRST_SEEN, &EARLIER.to_string())]);
        let out = run(old, update(SbtRole::Contractor, SbtOutcome::Completed, 1));
        assert_eq!(get(&out, ATTR_FIRST_SEEN), EARLIER.to_string());
        assert_eq!(get(&out, ATTR_LAST_SEEN), NOW.to_string());
    }

    #[test]
    fn customer_completed() {
        let out = run(
            fresh(),
            update(SbtRole::Customer, SbtOutcome::Completed, 70),
        );
        assert_eq!(get(&out, ATTR_CUSTOMER_SUCCESS), "1");
        assert_eq!(get(&out, ATTR_CUSTOMER_LOST), "0");
        assert_eq!(get(&out, ATTR_CUSTOMER_DISPUTES), "0");
        assert_eq!(get(&out, ATTR_CUSTOMER_VOLUME), "70");
        assert_eq!(get(&out, ATTR_CONTRACTOR_SUCCESS), "0");
        assert_eq!(get(&out, ATTR_CONTRACTOR_VOLUME), "0");
    }

    #[test]
    fn contractor_completed() {
        let out = run(
            fresh(),
            update(SbtRole::Contractor, SbtOutcome::Completed, 63),
        );
        assert_eq!(get(&out, ATTR_CONTRACTOR_SUCCESS), "1");
        assert_eq!(get(&out, ATTR_CONTRACTOR_LOST), "0");
        assert_eq!(get(&out, ATTR_CONTRACTOR_DISPUTES), "0");
        assert_eq!(get(&out, ATTR_CONTRACTOR_VOLUME), "63");
        assert_eq!(get(&out, ATTR_CUSTOMER_SUCCESS), "0");
        assert_eq!(get(&out, ATTR_CUSTOMER_VOLUME), "0");
    }

    #[test]
    fn customer_wins_dispute_gets_no_volume() {
        let out = run(
            fresh(),
            update(SbtRole::Customer, SbtOutcome::DisputeWon, 80),
        );
        assert_eq!(get(&out, ATTR_CUSTOMER_SUCCESS), "1");
        assert_eq!(get(&out, ATTR_CUSTOMER_LOST), "0");
        assert_eq!(get(&out, ATTR_CUSTOMER_DISPUTES), "1");
        assert_eq!(get(&out, ATTR_CUSTOMER_VOLUME), "0");
    }

    #[test]
    fn customer_loses_dispute_gets_volume() {
        let out = run(
            fresh(),
            update(SbtRole::Customer, SbtOutcome::DisputeLost, 80),
        );
        assert_eq!(get(&out, ATTR_CUSTOMER_SUCCESS), "0");
        assert_eq!(get(&out, ATTR_CUSTOMER_LOST), "1");
        assert_eq!(get(&out, ATTR_CUSTOMER_DISPUTES), "1");
        assert_eq!(get(&out, ATTR_CUSTOMER_VOLUME), "80");
    }

    #[test]
    fn contractor_wins_dispute_gets_volume() {
        let out = run(
            fresh(),
            update(SbtRole::Contractor, SbtOutcome::DisputeWon, 55),
        );
        assert_eq!(get(&out, ATTR_CONTRACTOR_SUCCESS), "1");
        assert_eq!(get(&out, ATTR_CONTRACTOR_LOST), "0");
        assert_eq!(get(&out, ATTR_CONTRACTOR_DISPUTES), "1");
        assert_eq!(get(&out, ATTR_CONTRACTOR_VOLUME), "55");
    }

    #[test]
    fn contractor_loses_dispute_gets_no_volume() {
        let out = run(
            fresh(),
            update(SbtRole::Contractor, SbtOutcome::DisputeLost, 55),
        );
        assert_eq!(get(&out, ATTR_CONTRACTOR_SUCCESS), "0");
        assert_eq!(get(&out, ATTR_CONTRACTOR_LOST), "1");
        assert_eq!(get(&out, ATTR_CONTRACTOR_DISPUTES), "1");
        assert_eq!(get(&out, ATTR_CONTRACTOR_VOLUME), "0");
    }

    #[test]
    fn updates_accumulate() {
        let mut list = fresh();
        list = run(list, update(SbtRole::Customer, SbtOutcome::Completed, 10));
        list = run(list, update(SbtRole::Customer, SbtOutcome::Completed, 15));
        list = run(list, update(SbtRole::Customer, SbtOutcome::DisputeLost, 5));
        assert_eq!(get(&list, ATTR_CUSTOMER_SUCCESS), "2");
        assert_eq!(get(&list, ATTR_CUSTOMER_LOST), "1");
        assert_eq!(get(&list, ATTR_CUSTOMER_DISPUTES), "1");
        assert_eq!(get(&list, ATTR_CUSTOMER_VOLUME), "30");
    }

    #[test]
    fn zero_amount_leaves_volume_unchanged() {
        let out = run(fresh(), update(SbtRole::Customer, SbtOutcome::Completed, 0));
        assert_eq!(get(&out, ATTR_CUSTOMER_VOLUME), "0");
        assert_eq!(get(&out, ATTR_CUSTOMER_SUCCESS), "1");
    }

    #[test]
    fn counter_overflow_is_rejected() {
        let old = attrs(&[(ATTR_CUSTOMER_VOLUME, &u64::MAX.to_string())]);
        assert_code(
            apply_update(
                old,
                NOW,
                update(SbtRole::Customer, SbtOutcome::Completed, 1),
            ),
            BlinkFlowError::InvalidSbtAttribute,
        );
    }

    #[test]
    fn non_numeric_counter_is_rejected_only_when_it_would_change() {
        let broken = attrs(&[(ATTR_CUSTOMER_SUCCESS, "many")]);
        assert_code(
            apply_update(
                broken.clone(),
                NOW,
                update(SbtRole::Customer, SbtOutcome::Completed, 1),
            ),
            BlinkFlowError::InvalidSbtAttribute,
        );
        let out = apply_update(
            broken,
            NOW,
            update(SbtRole::Contractor, SbtOutcome::Completed, 1),
        )
        .unwrap();
        assert_eq!(get(&out, ATTR_CUSTOMER_SUCCESS), "many");
    }

    #[test]
    fn invalid_first_seen_is_rejected() {
        let broken = attrs(&[(ATTR_FIRST_SEEN, "yesterday")]);
        assert_code(
            apply_update(
                broken,
                NOW,
                update(SbtRole::Customer, SbtOutcome::Completed, 1),
            ),
            BlinkFlowError::InvalidSbtAttribute,
        );
    }

    #[test]
    fn update_does_not_touch_the_other_role() {
        let before = run(
            fresh(),
            update(SbtRole::Contractor, SbtOutcome::Completed, 9),
        );
        let after = run(
            before.clone(),
            update(SbtRole::Customer, SbtOutcome::DisputeLost, 4),
        );
        for key in [
            ATTR_CONTRACTOR_SUCCESS,
            ATTR_CONTRACTOR_LOST,
            ATTR_CONTRACTOR_DISPUTES,
            ATTR_CONTRACTOR_VOLUME,
        ] {
            assert_eq!(get(&after, key), get(&before, key));
        }
    }

    fn schema_v1() -> Vec<Attribute> {
        attrs(&[
            (ATTR_VERSION, "1"),
            (ATTR_CONTRACTOR_SUCCESS, "4"),
            (ATTR_CONTRACTOR_LOST, "1"),
            (ATTR_CONTRACTOR_DISPUTES, "1"),
            (ATTR_CONTRACTOR_VOLUME, "700"),
            (ATTR_CUSTOMER_SUCCESS, "6"),
            (ATTR_CUSTOMER_LOST, "0"),
            (ATTR_CUSTOMER_DISPUTES, "0"),
            (ATTR_CUSTOMER_VOLUME, "900"),
            (ATTR_FIRST_SEEN, &EARLIER.to_string()),
            (ATTR_LAST_SEEN, &EARLIER.to_string()),
        ])
    }

    #[test]
    fn contractor_auto_released_counts_success_volume_and_auto_release() {
        let out = run(
            fresh(),
            update(SbtRole::Contractor, SbtOutcome::AutoReleased, 48),
        );
        assert_eq!(get(&out, ATTR_CONTRACTOR_SUCCESS), "1");
        assert_eq!(get(&out, ATTR_CONTRACTOR_VOLUME), "48");
        assert_eq!(get(&out, ATTR_CONTRACTOR_AUTO_RELEASED), "1");
        assert_eq!(get(&out, ATTR_CONTRACTOR_LOST), "0");
        assert_eq!(get(&out, ATTR_CONTRACTOR_DISPUTES), "0");
        assert_eq!(get(&out, ATTR_CUSTOMER_UNRESPONSIVE), "0");
        assert_eq!(get(&out, ATTR_LAST_SEEN), NOW.to_string());
    }

    #[test]
    fn customer_auto_released_counts_volume_and_unresponsive_but_no_success() {
        let out = run(
            schema_v1(),
            update(SbtRole::Customer, SbtOutcome::AutoReleased, 50),
        );
        assert_eq!(get(&out, ATTR_CUSTOMER_SUCCESS), "6");
        assert_eq!(get(&out, ATTR_CUSTOMER_VOLUME), "950");
        assert_eq!(get(&out, ATTR_CUSTOMER_UNRESPONSIVE), "1");
        assert_eq!(get(&out, ATTR_CUSTOMER_LOST), "0");
        assert_eq!(get(&out, ATTR_CUSTOMER_DISPUTES), "0");
        assert_eq!(get(&out, ATTR_CONTRACTOR_AUTO_RELEASED), "0");
    }

    #[test]
    fn customer_auto_released_keeps_last_seen_and_first_seen() {
        let out = run(
            schema_v1(),
            update(SbtRole::Customer, SbtOutcome::AutoReleased, 50),
        );
        assert_eq!(get(&out, ATTR_LAST_SEEN), EARLIER.to_string());
        assert_eq!(get(&out, ATTR_FIRST_SEEN), EARLIER.to_string());
    }

    #[test]
    fn auto_release_does_not_touch_the_other_role() {
        let before = run(
            schema_v1(),
            update(SbtRole::Contractor, SbtOutcome::Completed, 1),
        );
        let after = run(
            before.clone(),
            update(SbtRole::Customer, SbtOutcome::AutoReleased, 5),
        );
        for key in [
            ATTR_CONTRACTOR_SUCCESS,
            ATTR_CONTRACTOR_LOST,
            ATTR_CONTRACTOR_DISPUTES,
            ATTR_CONTRACTOR_VOLUME,
            ATTR_CONTRACTOR_AUTO_RELEASED,
        ] {
            assert_eq!(get(&after, key), get(&before, key));
        }
    }

    #[test]
    fn schema_v1_asset_gets_new_counters_and_counts_them_on_first_auto_release() {
        let contractor = run(
            schema_v1(),
            update(SbtRole::Contractor, SbtOutcome::AutoReleased, 30),
        );
        assert_eq!(contractor.len(), SCHEMA_KEYS.len());
        assert_eq!(get(&contractor, ATTR_CONTRACTOR_AUTO_RELEASED), "1");
        assert_eq!(get(&contractor, ATTR_CUSTOMER_UNRESPONSIVE), "0");
        assert_eq!(get(&contractor, ATTR_CONTRACTOR_SUCCESS), "5");
        assert_eq!(get(&contractor, ATTR_CONTRACTOR_VOLUME), "730");
        assert_eq!(
            keys(&contractor)[11..],
            [ATTR_CONTRACTOR_AUTO_RELEASED, ATTR_CUSTOMER_UNRESPONSIVE]
        );

        let customer = run(
            schema_v1(),
            update(SbtRole::Customer, SbtOutcome::AutoReleased, 30),
        );
        assert_eq!(get(&customer, ATTR_CUSTOMER_UNRESPONSIVE), "1");
        assert_eq!(get(&customer, ATTR_CONTRACTOR_AUTO_RELEASED), "0");
    }

    #[test]
    fn schema_v1_asset_gets_new_counters_as_zero_on_other_outcomes() {
        for outcome in [
            SbtOutcome::Completed,
            SbtOutcome::DisputeWon,
            SbtOutcome::DisputeLost,
        ] {
            for role in [SbtRole::Customer, SbtRole::Contractor] {
                let out = run(schema_v1(), update(role, outcome, 10));
                assert_eq!(get(&out, ATTR_CONTRACTOR_AUTO_RELEASED), "0");
                assert_eq!(get(&out, ATTR_CUSTOMER_UNRESPONSIVE), "0");
                assert_eq!(get(&out, ATTR_VERSION), "1");
            }
        }
    }

    #[test]
    fn auto_released_counters_accumulate() {
        let mut list = fresh();
        for _ in 0..3 {
            list = run(list, update(SbtRole::Contractor, SbtOutcome::AutoReleased, 2));
        }
        list = run(list, update(SbtRole::Contractor, SbtOutcome::Completed, 2));
        assert_eq!(get(&list, ATTR_CONTRACTOR_SUCCESS), "4");
        assert_eq!(get(&list, ATTR_CONTRACTOR_AUTO_RELEASED), "3");
        assert_eq!(get(&list, ATTR_CONTRACTOR_VOLUME), "8");
    }

    #[test]
    fn version_stays_one() {
        assert_eq!(SBT_VERSION, 1);
        let out = run(schema_v1(), update(SbtRole::Customer, SbtOutcome::AutoReleased, 1));
        assert_eq!(get(&out, ATTR_VERSION), "1");
    }

    mod legacy {
        use super::*;

        fn bump(current: &str, delta: u64, apply: bool) -> Result<String> {
            if !apply {
                return Ok(current.to_string());
            }
            let value = current
                .parse::<u64>()
                .map_err(|_| error!(BlinkFlowError::InvalidSbtAttribute))?;
            Ok(value
                .checked_add(delta)
                .ok_or(BlinkFlowError::InvalidSbtAttribute)?
                .to_string())
        }

        #[allow(clippy::too_many_arguments)]
        pub fn compute_attributes(
            attributes: Vec<Attribute>,
            now: i64,
            is_customer: bool,
            is_winner: bool,
            is_dispute: bool,
            is_success: bool,
            customer_amount: u64,
            contractor_amount: u64,
        ) -> Result<Vec<Attribute>> {
            let is_contractor = !is_customer;
            let won = is_winner || is_success;
            let lost = !is_winner && !is_success;
            let mut out = Vec::with_capacity(attributes.len());
            for attribute in attributes {
                let cur = attribute.value.as_str();
                let value = match attribute.key.as_str() {
                    ATTR_CONTRACTOR_SUCCESS => bump(cur, 1, is_contractor && won)?,
                    ATTR_CONTRACTOR_LOST => bump(cur, 1, is_contractor && lost)?,
                    ATTR_CONTRACTOR_DISPUTES => bump(cur, 1, is_contractor && is_dispute)?,
                    ATTR_CONTRACTOR_VOLUME => bump(cur, contractor_amount, is_contractor && won)?,
                    ATTR_CUSTOMER_SUCCESS => bump(cur, 1, is_customer && won)?,
                    ATTR_CUSTOMER_LOST => bump(cur, 1, is_customer && lost)?,
                    ATTR_CUSTOMER_DISPUTES => bump(cur, 1, is_customer && is_dispute)?,
                    ATTR_CUSTOMER_VOLUME => bump(
                        cur,
                        customer_amount,
                        is_customer && (!is_winner || is_success),
                    )?,
                    ATTR_FIRST_SEEN => {
                        let v = cur
                            .parse::<i64>()
                            .map_err(|_| error!(BlinkFlowError::InvalidSbtAttribute))?;
                        if v == 0 {
                            now.to_string()
                        } else {
                            v.to_string()
                        }
                    }
                    ATTR_LAST_SEEN => now.to_string(),
                    _ => attribute.value.clone(),
                };
                out.push(Attribute {
                    key: attribute.key,
                    value,
                });
            }
            Ok(out)
        }
    }

    #[test]
    fn new_logic_matches_previous_implementation_on_complete_attribute_lists() {
        let outcomes = [
            (SbtOutcome::Completed, false, false, true),
            (SbtOutcome::DisputeWon, true, true, false),
            (SbtOutcome::DisputeLost, false, true, false),
        ];
        let starts = [
            fresh(),
            attrs(&[
                (ATTR_VERSION, "1"),
                (ATTR_CONTRACTOR_SUCCESS, "3"),
                (ATTR_CONTRACTOR_LOST, "1"),
                (ATTR_CONTRACTOR_DISPUTES, "2"),
                (ATTR_CONTRACTOR_VOLUME, "900"),
                (ATTR_CUSTOMER_SUCCESS, "5"),
                (ATTR_CUSTOMER_LOST, "2"),
                (ATTR_CUSTOMER_DISPUTES, "1"),
                (ATTR_CUSTOMER_VOLUME, "1200"),
                (ATTR_FIRST_SEEN, &EARLIER.to_string()),
                (ATTR_LAST_SEEN, &EARLIER.to_string()),
            ]),
        ];

        for start in starts {
            for (outcome, is_winner, is_dispute, is_success) in outcomes {
                for is_customer in [true, false] {
                    let role = if is_customer {
                        SbtRole::Customer
                    } else {
                        SbtRole::Contractor
                    };
                    let (customer_amount, contractor_amount) = (37u64, 41u64);
                    let amount = if is_customer {
                        customer_amount
                    } else {
                        contractor_amount
                    };

                    let old = legacy::compute_attributes(
                        start.clone(),
                        NOW,
                        is_customer,
                        is_winner,
                        is_dispute,
                        is_success,
                        customer_amount,
                        contractor_amount,
                    )
                    .unwrap();
                    let new =
                        apply_update(start.clone(), NOW, update(role, outcome, amount)).unwrap();

                    assert_eq!(get(&new, ATTR_CONTRACTOR_AUTO_RELEASED), "0");
                    assert_eq!(get(&new, ATTR_CUSTOMER_UNRESPONSIVE), "0");
                    let new: Vec<Attribute> = new
                        .into_iter()
                        .filter(|a| {
                            a.key != ATTR_CONTRACTOR_AUTO_RELEASED
                                && a.key != ATTR_CUSTOMER_UNRESPONSIVE
                        })
                        .collect();
                    let old: Vec<Attribute> = old
                        .into_iter()
                        .filter(|a| {
                            a.key != ATTR_CONTRACTOR_AUTO_RELEASED
                                && a.key != ATTR_CUSTOMER_UNRESPONSIVE
                        })
                        .collect();
                    assert_eq!(
                        snapshot(&old),
                        snapshot(&new),
                        "role {role:?} outcome {outcome:?}"
                    );
                }
            }
        }
    }
}
