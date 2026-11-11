import { useEffect, useState } from "react";
import { readOwnedAccount } from "../accountRead";
import { humanToRaw, rawToHuman, tokenLabel } from "../book";
import { STORAGE_BUFFER } from "../config";
import { nsToDate } from "../format";
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
        if (!closed) setError("代币列表没有读到");
      });
    return () => {
      closed = true;
    };
  }, []);

  async function freeze() {
    if (!accountId) return;
    setError("");
    setNote("");
    setBusy("等待钱包");
    try {
      const read = await readOwnedAccount(accountId, signOwnership);
      const holdings = read.holdings.filter((holding) => holding.available !== "0");
      if (holdings.length === 0) throw new Error("没有读到可冻结的余额");
      setBusy("提交本金");
      await call("publish_book", {
        holdings: holdings.map((holding) => ({ token_id: holding.tokenId, available: holding.available })),
      }, STORAGE_BUFFER.toString());
      setNote("本金已冻结");
      await onChanged();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "冻结失败");
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
      setError("先选择列表里的代币");
      return;
    }
    if (out.assetId === into.assetId) {
      setError("兑出和兑入要是两种代币");
      return;
    }
    setBusy("提交操作");
    try {
      await call("publish_swap", {
        asset_out: out.assetId,
        amount_out: humanToRaw(amountOut, out.decimals),
        asset_in: into.assetId,
        amount_in: humanToRaw(amountIn, into.decimals),
      }, STORAGE_BUFFER.toString());
      setAmountOut("");
      setAmountIn("");
      setNote("这笔操作已记下");
      await onChanged();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "记录失败");
    } finally {
      setBusy("");
    }
  }

  const ordered = swaps.slice().sort((a, b) => (BigInt(a.created_at) < BigInt(b.created_at) ? -1 : 1));

  return (
    <section className="panel">
      <h2>公布后的本金</h2>
      {book ? (
        <>
          <p className="hint">冻结于 {nsToDate(book.marked_at).toLocaleString()}。数量按代币精度显示。</p>
          {book.holdings.map((holding) => {
            const token = tokens.find((item) => item.assetId === holding.token_id);
            const amount = token ? rawToHuman(holding.available, token.decimals) : holding.available;
            return <p key={holding.token_id}><span className="num">{tokenLabel(holding.token_id, tokens)}</span> · <span className="num">{amount}</span></p>;
          })}
        </>
      ) : (
        <p className="hint">冻结时的余额是本金。之后只记兑出和兑入，收益率从这里起算。余额来自主网 1Click，测试网公钥没有登记在 intents.near 时读不到。</p>
      )}
      {mine && !book ? (
        <button type="button" className="button" disabled={Boolean(busy)} onClick={() => void freeze()}>
          {busy || "用钱包冻结本金"}
        </button>
      ) : null}
      {!mine && !book ? <p className="empty">本金还没有冻结。</p> : null}
      {book && ordered.length === 0 ? <p className="empty">公布后还没有操作。</p> : null}
      {ordered.length > 0 ? (
        <ul className="ops">
          {ordered.map((swap) => (
            <li key={swap.id}>
              <span>{nsToDate(swap.created_at).toLocaleString()}</span>
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
          <label>兑出
            <select value={assetOut} onChange={(event) => setAssetOut(event.target.value)}>
              {tokens.map((token) => <option key={token.assetId} value={token.assetId}>{token.symbol} · {token.blockchain}</option>)}
            </select>
          </label>
          <label>兑出数量<input value={amountOut} onChange={(event) => setAmountOut(event.target.value)} placeholder="1.5" /></label>
          <label>兑入
            <select value={assetIn} onChange={(event) => setAssetIn(event.target.value)}>
              {tokens.map((token) => <option key={`in-${token.assetId}`} value={token.assetId}>{token.symbol} · {token.blockchain}</option>)}
            </select>
          </label>
          <label>兑入数量<input value={amountIn} onChange={(event) => setAmountIn(event.target.value)} placeholder="1.5" /></label>
          <button type="button" className="button" disabled={Boolean(busy)} onClick={() => void record()}>{busy || "记下这笔"}</button>
        </div>
      ) : null}
      {note ? <p className="hint">{note}</p> : null}
      {error ? <p className="error">{error}</p> : null}
    </section>
  );
}
