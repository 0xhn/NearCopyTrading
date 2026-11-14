import { HYPERLIQUID_USDC, ONE_CLICK } from "./config";
import { getLang, type Lang } from "./i18n";

export interface TokenInfo {
  assetId: string;
  symbol: string;
  decimals: number;
  blockchain: string;
  price?: string;
}

interface QuoteBody {
  message?: string;
  quote?: {
    amountInFormatted?: string;
    amountOutFormatted?: string;
    minAmountOut?: string;
    deadline?: string;
    depositAddress?: string;
  };
  [key: string]: unknown;
}

async function postQuote(body: Record<string, unknown>): Promise<{ ok: boolean; body: QuoteBody }> {
  // Always dry. A confidential preview is not a session and not an intents.near key.
  const request = { ...body, dry: true };
  const response = await fetch(`${ONE_CLICK}/quote`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(request),
  });
  const parsed = (await response.json()) as QuoteBody;
  return { ok: response.ok, body: parsed };
}

export async function previewQuote(input: {
  originAsset: string;
  destinationAsset: string;
  amount: string;
  recipient: string;
  refundTo: string;
}): Promise<{ confidential: QuoteBody; publicQuote: QuoteBody | null }> {
  const shared = {
    dry: true,
    swapType: "EXACT_INPUT",
    slippageTolerance: 100,
    originAsset: input.originAsset,
    destinationAsset: input.destinationAsset,
    amount: input.amount,
    depositType: "ORIGIN_CHAIN",
    recipient: input.recipient,
    recipientType: "DESTINATION_CHAIN",
    refundTo: input.refundTo,
    refundType: "ORIGIN_CHAIN",
    deadline: new Date(Date.now() + 30 * 60_000).toISOString(),
    referral: "keycopy",
  };
  const confidential = await postQuote({ ...shared, confidentiality: "basic" });
  const publicQuote = confidential.ok ? null : await postQuote(shared);
  return { confidential: confidential.body, publicQuote: publicQuote?.body ?? null };
}

let tokenCache: TokenInfo[] | null = null;

export async function listTokens(lang: Lang = getLang()): Promise<TokenInfo[]> {
  if (tokenCache) return tokenCache;
  const response = await fetch(`${ONE_CLICK}/tokens`);
  if (!response.ok) throw new Error(lang === "en" ? "Unable to load Intents token list" : "无法读取 Intents 代币列表");
  const body = (await response.json()) as TokenInfo[];
  tokenCache = body;
  return body;
}

export async function findUsdc(): Promise<TokenInfo | undefined> {
  const tokens = await listTokens();
  return tokens.find((token) => token.symbol === "USDC" && token.blockchain === "eth")
    ?? tokens.find((token) => token.symbol === "USDC");
}

export { HYPERLIQUID_USDC };
