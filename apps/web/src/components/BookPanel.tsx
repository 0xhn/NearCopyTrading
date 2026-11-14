import { useEffect, useState } from "react";
import { readOwnedAccount } from "../accountRead";
import { humanToRaw, rawToHuman, tokenLabel } from "../book";
import { STORAGE_BUFFER } from "../config";
import { formatDate } from "../format";
import { getLang, useI18n } from "../i18n";
import { useNear } from "../near/wallet";
import { listTokens, type TokenInfo } from "../quote";
import type { Book, Swap } from "../types";

export function BookPanel({
  leaderId,
  book,
  swaps,
  onChanged,
}: {
  leaderId: string;
  book: Book | null;
  swaps: Swap[];
  onChanged: () => Promise<void>;
}) {
  const { accountId, call, signOwnership } = useNear();
  const { lang, t } = useI18n();
  const [tokens, setTokens] = useState<TokenInfo[]>([]);
  const [assetOut, setAssetOut] = useState("");
  const [assetIn, setAssetIn] = useState("");
  const [amountOut, setAmountOut] = useState("");
  const [amountIn, setAmountIn] = useState("");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [note, setNote] = useState("");
  const mine = accountId === leaderId;

  useEffect(() => {
    let closed = false;
    listTokens()
      .then((rows) => {
        if (closed) return;
        setTokens(rows);
        setAssetOut((current) => current || rows[0]?.assetId || "");
        setAssetIn((current) => current || rows[1]?.assetId || rows[0]?.assetId || "");
      })
      .catch(() => {
        if (!closed) setError(getLang() === "en" ? "Failed to load token list" : "代币列表没有读到");
      });
    return () => {
      closed = true;
    };
  }, []);

  async function freeze() {
    if (!accountId) return;
    setError("");
    setNote("");
    setBusy(t("等待钱包", "Waiting for wallet"));
    try {
      const read = await readOwnedAccount(accountId, signOwnership, lang);
      const holdings = read.holdings.filter((holding) => holding.available !== "0");
      if (holdings.length === 0) throw new Error(t("没有读到可冻结的余额", "No non-zero balance found to freeze"));
      setBusy(t("提交本金", "Submitting principal"));
      await call("publish_book", {
        holdings: holdings.map((holding) => ({ token_id: holding.tokenId, available: holding.available })),
      }, STORAGE_BUFFER.toString());
      setNote(t("本金已冻结", "Principal frozen"));
      await onChanged();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t("冻结失败", "Failed to freeze principal"));
    } finally {
      setBusy("");
    }
  }

  async function record() {
    setError("");
    setNote("");
    const out = tokens.find((token) => token.assetId === assetOut);
    const into = tokens.find((token) => token.assetId === assetIn);
    if (!out || !into) {
      setError(t("先选择列表里的代币", "Select tokens from the list first"));
      return;
    }
    if (out.assetId === into.assetId) {
      setError(t("兑出和兑入要是两种代币", "Input and output tokens must be different"));
      return;
    }
    setBusy(t("提交操作", "Submitting swap"));
    try {
      await call("publish_swap", {
        asset_out: out.assetId,
        amount_out: humanToRaw(amountOut, out.decimals, lang),
        asset_in: into.assetId,
        amount_in: humanToRaw(amountIn, into.decimals, lang),
      }, STORAGE_BUFFER.toString());
      setAmountOut("");
      setAmountIn("");
      setNote(t("这笔操作已记下", "Swap recorded"));
      await onChanged();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t("记录失败", "Failed to record swap"));
    } finally {
      setBusy("");
    }
  }

  const ordered = swaps.slice().sort((a, b) => (BigInt(a.created_at) < BigInt(b.created_at) ? -1 : 1));

  return (
    <section className="panel">
      <h2>{t("公布后的本金", "Post-freeze Principal")}</h2>
      {book ? (
        <>
          <p className="hint">
            {t(
              `冻结于 ${formatDate(book.marked_at, lang)}。数量按代币精度显示。`,
              `Frozen on ${formatDate(book.marked_at, lang)}. Amounts are formatted by token decimals.`,
            )}
          </p>
          {book.holdings.map((holding) => {
            const token = tokens.find((item) => item.assetId === holding.token_id);
            const amount = token ? rawToHuman(holding.available, token.decimals) : holding.available;
            return <p key={holding.token_id}><span className="num">{tokenLabel(holding.token_id, tokens)}</span> · <span className="num">{amount}</span></p>;
          })}
        </>
      ) : (
        <p className="hint">
          {t(
            "冻结时的余额是本金。之后只记兑出和兑入，收益率从这里起算。余额来自主网 1Click，测试网公钥没有登记在 intents.near 时读不到。",
            "Balances at freeze time serve as principal. Subsequent swaps are recorded as out/in pairs, and ROI is measured from here. Balances are read from mainnet 1Click and require a public key registered on intents.near.",
          )}
        </p>
      )}
      {mine && !book ? (
        <button type="button" className="button" disabled={Boolean(busy)} onClick={() => void freeze()}>
          {busy || t("用钱包冻结本金", "Freeze Principal with Wallet")}
        </button>
      ) : null}
      {!mine && !book ? <p className="empty">{t("本金还没有冻结。", "Principal has not been frozen yet.")}</p> : null}
      {book && ordered.length === 0 ? <p className="empty">{t("公布后还没有操作。", "No swaps recorded after freeze yet.")}</p> : null}
      {ordered.length > 0 ? (
        <ul className="ops">
          {ordered.map((swap) => (
            <li key={swap.id}>
              <span>{formatDate(swap.created_at, lang)}</span>
              <span className="num">
                {rawToHuman(swap.amount_out, tokens.find((token) => token.assetId === swap.asset_out)?.decimals ?? 0)} {tokenLabel(swap.asset_out, tokens)}
                {" → "}
                {rawToHuman(swap.amount_in, tokens.find((token) => token.assetId === swap.asset_in)?.decimals ?? 0)} {tokenLabel(swap.asset_in, tokens)}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
      {mine && book ? (
        <div className="grid">
          <label>{t("兑出", "Token Out")}
            <select value={assetOut} onChange={(event) => setAssetOut(event.target.value)}>
              {tokens.map((token) => <option key={token.assetId} value={token.assetId}>{token.symbol} · {token.blockchain}</option>)}
            </select>
          </label>
          <label>{t("兑出数量", "Amount Out")}<input value={amountOut} onChange={(event) => setAmountOut(event.target.value)} placeholder="1.5" /></label>
          <label>{t("兑入", "Token In")}
            <select value={assetIn} onChange={(event) => setAssetIn(event.target.value)}>
              {tokens.map((token) => <option key={`in-${token.assetId}`} value={token.assetId}>{token.symbol} · {token.blockchain}</option>)}
            </select>
          </label>
          <label>{t("兑入数量", "Amount In")}<input value={amountIn} onChange={(event) => setAmountIn(event.target.value)} placeholder="1.5" /></label>
          <button type="button" className="button" disabled={Boolean(busy)} onClick={() => void record()}>{busy || t("记下这笔", "Record Swap")}</button>
        </div>
      ) : null}
      {note ? <p className="hint">{note}</p> : null}
      {error ? <p className="error">{error}</p> : null}
    </section>
  );
}
