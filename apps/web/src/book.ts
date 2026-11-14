import { getLang, type Lang } from "./i18n";
import type { TokenInfo } from "./quote";
import type { Book, Swap } from "./types";

export interface PublicYield {
  bps: number;
  curve: number[];
  ready: boolean;
  note: string;
}

export function humanToRaw(value: string, decimals: number, lang: Lang = getLang()): string {
  const trimmed = value.trim();
  if (!/^\d+(\.\d+)?$/.test(trimmed)) {
    throw new Error(lang === "en" ? "Invalid amount format" : "数量格式不对");
  }
  const [whole, frac = ""] = trimmed.split(".");
  if (frac.length > decimals) {
    throw new Error(lang === "en" ? "Decimal places exceed token precision" : "小数位超过这个代币的精度");
  }
  const digits = `${whole}${frac.padEnd(decimals, "0")}`.replace(/^0+/, "");
  if (!digits) {
    throw new Error(lang === "en" ? "Amount must be greater than 0" : "数量要大于 0");
  }
  return digits;
}

export function rawToHuman(raw: string, decimals: number): string {
  if (!/^\d+$/.test(raw)) return raw;
  const padded = raw.padStart(decimals + 1, "0");
  const whole = padded.slice(0, padded.length - decimals);
  const frac = padded.slice(padded.length - decimals).replace(/0+$/, "");
  return frac ? `${whole}.${frac}` : whole;
}

export function tokenLabel(assetId: string, tokens: TokenInfo[]): string {
  const token = tokens.find((item) => item.assetId === assetId);
  return token ? `${token.symbol} · ${token.blockchain}` : assetId;
}

function usdMicros(amount: bigint, decimals: number, price: string): bigint | null {
  if (amount < 0n || !/^\d+(\.\d+)?$/.test(price)) return null;
  const [whole, frac = ""] = price.split(".");
  const priceMicros = BigInt(whole) * 1_000_000n + BigInt((frac + "000000").slice(0, 6));
  return (amount * priceMicros) / 10n ** BigInt(decimals);
}

function marked(balances: Map<string, bigint>, tokens: TokenInfo[]): bigint | null {
  const prices = new Map(tokens.map((token) => [token.assetId, token]));
  let total = 0n;
  for (const [assetId, amount] of balances) {
    if (amount === 0n) continue;
    if (amount < 0n) return null;
    const token = prices.get(assetId);
    if (!token || token.price === undefined) return null;
    const usd = usdMicros(amount, token.decimals, token.price);
    if (usd === null) return null;
    total += usd;
  }
  return total;
}

export function publicYield(book: Book, swaps: Swap[], tokens: TokenInfo[], lang: Lang = getLang()): PublicYield {
  const start = new Map(book.holdings.map((holding) => [holding.token_id, BigInt(holding.available)]));
  const ordered = swaps
    .filter((swap) => BigInt(swap.created_at) >= BigInt(book.marked_at))
    .sort((a, b) => (BigInt(a.created_at) < BigInt(b.created_at) ? -1 : 1));
  const running = new Map(start);
  const marks: Array<Map<string, bigint>> = [];
  let overdrawn = false;
  for (const swap of ordered) {
    const out = running.get(swap.asset_out) ?? 0n;
    const spent = BigInt(swap.amount_out);
    if (spent > out) overdrawn = true;
    running.set(swap.asset_out, out - spent);
    running.set(swap.asset_in, (running.get(swap.asset_in) ?? 0n) + BigInt(swap.amount_in));
    marks.push(new Map(running));
  }
  const startUsd = marked(start, tokens);
  if (overdrawn) {
    return {
      bps: 0,
      curve: [0],
      ready: false,
      note: lang === "en" ? "A swap output exceeded the frozen balance." : "有一笔兑出超过了冻结时的余额。",
    };
  }
  if (startUsd === null) {
    return {
      bps: 0,
      curve: [0],
      ready: false,
      note: lang === "en" ? "Some tokens have no USD price, so return is hidden for now." : "有的代币没有美元价格，收益率先不显示。",
    };
  }
  if (startUsd === 0n) {
    return {
      bps: 0,
      curve: [0],
      ready: false,
      note: lang === "en" ? "Frozen principal is valued at $0 at current prices." : "冻结本金按现价是 0。",
    };
  }
  const curve = [0];
  for (const mark of marks) {
    const endUsd = marked(mark, tokens);
    if (endUsd === null) {
      return {
        bps: 0,
        curve,
        ready: false,
        note: lang === "en" ? "Some tokens have no USD price, so return is hidden for now." : "有的代币没有美元价格，收益率先不显示。",
      };
    }
    curve.push(Number(((endUsd - startUsd) * 10_000n) / startUsd));
  }
  return { bps: curve[curve.length - 1] ?? 0, curve, ready: true, note: "" };
}
