use near_api::{AccountId, NearToken};
use near_sdk::serde_json::json;

#[derive(near_sdk::serde::Deserialize)]
#[serde(crate = "near_sdk::serde")]
struct LeaderView {
    account_id: AccountId,
    display_name: String,
    fee_bps: u16,
}

async fn flow_on(contract_wasm: Vec<u8>) -> testresult::TestResult<()> {
    let sandbox = near_sandbox::Sandbox::start_sandbox().await?;
    let sandbox_network =
        near_api::NetworkConfig::from_rpc_url("sandbox", sandbox.rpc_addr.parse()?);
    let signer = near_api::Signer::from_secret_key(
        near_sandbox::config::DEFAULT_GENESIS_ACCOUNT_PRIVATE_KEY
            .parse()
            .unwrap(),
    )?;

    let leader = create_subaccount(&sandbox, "leader.sandbox").await?;
    let follower = create_subaccount(&sandbox, "follower.sandbox").await?;
    let contract = create_subaccount(&sandbox, "contract.sandbox")
        .await?
        .as_contract();

    near_api::Contract::deploy(contract.account_id().clone())
        .use_code(contract_wasm)
        .with_init_call("init", json!({}))?
        .with_signer(signer.clone())
        .send_to(&sandbox_network)
        .await?
        .assert_success();

    contract
        .call_function(
            "register_leader",
            json!({
                "fee_bps": 1000,
                "display_name": "Ada"
            }),
        )
        .transaction()
        .deposit(NearToken::from_near(1))
        .with_signer(leader.account_id().clone(), signer.clone())
        .send_to(&sandbox_network)
        .await?
        .assert_success();

    let stored: LeaderView = contract
        .call_function("get_leader", json!({ "account_id": leader.account_id() }))
        .read_only()
        .fetch_from(&sandbox_network)
        .await?
        .data;
    assert_eq!(&stored.account_id, leader.account_id());
    assert_eq!(stored.display_name, "Ada");
    assert_eq!(stored.fee_bps, 1000);

    contract
        .call_function(
            "publish_trade",
            json!({
                "market": "Spot",
                "side": "Buy",
                "asset": "wrap.near",
                "amount": "1"
            }),
        )
        .transaction()
        .deposit(NearToken::from_near(1))
        .with_signer(leader.account_id().clone(), signer.clone())
        .send_to(&sandbox_network)
        .await?
        .assert_success();

    contract
        .call_function("follow_market", json!({ "leader": leader.account_id(), "market": "Spot" }))
        .transaction()
        .deposit(NearToken::from_near(1))
        .with_signer(follower.account_id().clone(), signer.clone())
        .send_to(&sandbox_network)
        .await?
        .assert_success();

    contract
        .call_function(
            "publish_trade",
            json!({
                "market": "Perp",
                "side": "Long",
                "asset": "BTC",
                "amount": "5"
            }),
        )
        .transaction()
        .deposit(NearToken::from_near(1))
        .with_signer(leader.account_id().clone(), signer)
        .send_to(&sandbox_network)
        .await?
        .assert_success();

    Ok(())
}

async fn create_subaccount(
    sandbox: &near_sandbox::Sandbox,
    name: &str,
) -> testresult::TestResult<near_api::Account> {
    let account_id: AccountId = name.parse().unwrap();
    sandbox
        .create_account(account_id.clone())
        .initial_balance(NearToken::from_near(10))
        .send()
        .await?;
    Ok(near_api::Account(account_id))
}

#[tokio::test]
async fn test_contract_is_operational() -> testresult::TestResult<()> {
    let contract_wasm_path = cargo_near_build::build_with_cli(Default::default())?;
    let contract_wasm = std::fs::read(contract_wasm_path)?;
    flow_on(contract_wasm).await
}
