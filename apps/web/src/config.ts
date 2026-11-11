export const CONTRACT_ID =
  import.meta.env.VITE_CONTRACT_ID ?? "keycopy-ledger.testnet";

export const TESTNET_RPC = "https://rpc.testnet.fastnear.com";

export const ONE_CLICK = import.meta.env.DEV
  ? "/1click/v0"
  : "https://1click.chaindefuser.com/v0";

export const HYPERLIQUID_USDC =
  "1cs_v1:hypercore:hip1:0x6d1e7cde53ba9467b783cb7c530ce054";

export const NEAR_AI_BASE = "https://cloud-api.near.ai/v1";

export const STORAGE_BUFFER = 100_000_000_000_000_000_000_000n;
export const GAS = 100_000_000_000_000n;
