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

pub fn default_attributes() -> Vec<Attribute> {
    [
        (ATTR_VERSION, "1"),
        (ATTR_CONTRACTOR_SUCCESS, "0"),
        (ATTR_CONTRACTOR_LOST, "0"),
        (ATTR_CONTRACTOR_DISPUTES, "0"),
        (ATTR_CONTRACTOR_VOLUME, "0"),
        (ATTR_CUSTOMER_SUCCESS, "0"),
        (ATTR_CUSTOMER_LOST, "0"),
        (ATTR_CUSTOMER_DISPUTES, "0"),
        (ATTR_CUSTOMER_VOLUME, "0"),
        (ATTR_FIRST_SEEN, "0"),
        (ATTR_LAST_SEEN, "0"),
    ]
    .into_iter()
    .map(|(k, v)| Attribute {
        key: k.to_string(),
        value: v.to_string(),
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

#[allow(clippy::too_many_arguments)]
pub fn update_sbt<'info, C: SbtContext<'info>>(
    ctx: &C,
    sbt_asset: &AccountInfo<'info>,
    owner: &Pubkey,
    payer: &AccountInfo<'info>,
    collection_bump: u8,
    is_customer: bool,
    is_winner: bool,
    is_dispute: bool,
    is_success: bool,
    customer_amount: u64,
    contractor_amount: u64,
) -> Result<()> {
    let collection = ctx.sbt_collection();
    validate_collection(&collection)?;
    validate_asset(sbt_asset, &collection.key(), owner)?;

    let (_, attributes, _) =
        fetch_plugin::<BaseAssetV1, Attributes>(sbt_asset, PluginType::Attributes)
            .map_err(|_| error!(BlinkFlowError::InvalidSbtAccount))?;

    let attribute_list = prepare_asset_attributes(
        attributes,
        is_customer,
        is_winner,
        is_dispute,
        is_success,
        customer_amount,
        contractor_amount,
    )?;

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

fn prepare_asset_attributes(
    attributes: Attributes,
    is_customer: bool,
    is_winner: bool,
    is_dispute: bool,
    is_success: bool,
    customer_amount: u64,
    contractor_amount: u64,
) -> Result<Vec<Attribute>> {
    let now = Clock::get()?.unix_timestamp;
    compute_attributes(
        attributes,
        now,
        is_customer,
        is_winner,
        is_dispute,
        is_success,
        customer_amount,
        contractor_amount,
    )
}

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
fn compute_attributes(
    attributes: Attributes,
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

    let mut out = Vec::with_capacity(attributes.attribute_list.len());

    for attribute in attributes.attribute_list {
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