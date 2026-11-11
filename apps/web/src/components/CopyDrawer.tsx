import { useEffect, useState } from "react";
import { STORAGE_BUFFER } from "../config";
import { addYocto, marketLabel, nearToYocto, sideLabel } from "../format";
import { HYPERLIQUID_USDC, findUsdc, previewQuote } from "../quote";
import { useNear } from "../near/wallet";
import type { Policy, Trade } from "../types";

function formatPreview(body: { confidential: object; publicQuote: object | null }): string {
  return JSON.stringify({
    confidentialDry: body.confidential,
    publicDry: body.publicQuote,
  }, null, 2);
}

export function CopyDrawer({
  open,
  leader,
  trade,
  feeBps,
  policy,
  onClose,
  onChanged,
}: {
  open: boolean;
  leader: string;
  trade: Trade | null;
  feeBps: number;
  policy: Policy | null;
  onClose: () => void;
  onChanged?: () => Promise<void>;
}) {
  const { accountId, call } = useNear();
  const market = trade?.market ?? "Spot";
  const cap = market === "Spot" ? policy?.spot_max_equity_bps ?? 0 : policy?.perp_max_equity_bps ?? 0;
  const [equity, setEquity] = useState("500");
  const [leverage, setLeverage] = useState(market === "Spot" ? "1" : "2");
  const [feeCap, setFeeCap] = useState("0.2");
  const [notional, setNotional] = useState(market === "Spot" ? "spot-copy" : "perp-copy");
  const [recipient, setRecipient] = useState("");
  const [refundTo, setRefundTo] = useState(accountId ?? "");
  const [spotCap, setSpotCap] = useState("5000");
  const [perpCap, setPerpCap] = useState("2000");
  const [maxLev, setMaxLev] = useState("5");
  const [quoteText, setQuoteText] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (accountId && !refundTo) setRefundTo(accountId);
  }, [accountId, refundTo]);

  if (!open || !trade) return null;

  async function quote() {
    if (!trade) return;
    setError("");
    setQuoteText("");
    try {
      if (trade.market === "Spot") {
        const origin = trade.asset.startsWith("nep141:") ? trade.asset : `nep141:${trade.asset}`;
        const body = await previewQuote({
          originAsset: origin,
          destinationAsset: "nep141:usdt.tether-token.near",
          amount: trade.amount,
          recipient: recipient || accountId || "follower.testnet",
          refundTo: refundTo || accountId || "follower.testnet",
        });
        setQuoteText(formatPreview(body));
        return;
      }
      const usdc = (await findUsdc())?.assetId;
      if (!usdc) throw new Error("代币列表里没有 USDC");
      const margin = Number(trade.amount);
      const amount = Number.isFinite(margin) ? String(Math.round(margin * 1_000_000)) : trade.amount;
      const body = await previewQuote({
        originAsset: usdc,
        destinationAsset: HYPERLIQUID_USDC,
        amount,
        recipient: recipient || "0x0000000000000000000000000000000000000001",
        refundTo: refundTo || accountId || "follower.testnet",
      });
      setQuoteText(formatPreview(body));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "报价失败");
    }
  }

  async function savePolicy() {
    setError("");
    setBusy(true);
    try {
      const spot = Number(spotCap);
      const perp = Number(perpCap);
      const leverageCap = Number(maxLev);
      if (!Number.isInteger(spot) || spot < 0 || spot > 10_000) throw new Error("现货上限应在 0 到 10000 bps");
      if (!Number.isInteger(perp) || perp < 0 || perp > 10_000) throw new Error("合约上限应在 0 到 10000 bps");
      if (!Number.isInteger(leverageCap) || leverageCap < 1 || leverageCap > 40) throw new Error("最大杠杆应在 1 到 40");
      await call("set_policy", {
        spot_max_equity_bps: spot,
        perp_max_equity_bps: perp,
        max_leverage: leverageCap,
        markets_commitment: "spot,perp",
      }, STORAGE_BUFFER.toString());
      await onChanged?.();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "限额保存失败");
    } finally {
      setBusy(false);
    }
  }

  async function confirm() {
    setError("");
    setBusy(true);
    try {
      if (!accountId) throw new Error("先连接测试网钱包");
      if (!policy) throw new Error("先保存限额");
      const equityBps = Number(equity);
      const leverageN = Number(leverage);
      if (!Number.isInteger(equityBps) || equityBps < 0 || equityBps > cap) {
        throw new Error(`权益占比不能超过 ${cap} bps`);
      }
      if (trade?.market === "Spot" && leverageN !== 1) throw new Error("现货杠杆必须是 1");
      await call("open_copy", {
        leader,
        trade_id: Number(trade!.id),
        notional_commitment: notional,
        equity_bps: Number(equity),
        leverage: Number(leverage),
        fee_cap: nearToYocto(feeCap),
      }, addYocto(nearToYocto(feeCap), STORAGE_BUFFER));
      await onChanged?.();
      onClose();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "跟单失败");
    } finally {
      setBusy(false);
    }
  }

  return (
    <aside className="drawer" role="dialog" aria-label="跟单">
      <header>
        <h2>{marketLabel(trade.market)}跟单</h2>
        <button type="button" className="text" onClick={onClose}>关闭</button>
      </header>
      <p className="hint">
        {!accountId ? "先连接测试网钱包，再跟这一笔。" : policy ? `链上限额 ${cap / 100}%` : "先保存限额，再确认跟单。"}
        {" "}· 抽成 {(feeBps / 100).toFixed(2)}%，只在确认盈利后从托管里划。
      </p>
      {accountId && !policy ? (
        <div className="grid">
          <label>现货权益上限 bps<input value={spotCap} onChange={(event) => setSpotCap(event.target.value)} /></label>
          <label>合约权益上限 bps<input value={perpCap} onChange={(event) => setPerpCap(event.target.value)} /></label>
          <label>最大杠杆<input value={maxLev} onChange={(event) => setMaxLev(event.target.value)} /></label>
          <button type="button" className="button" disabled={busy} onClick={() => void savePolicy()}>保存限额</button>
        </div>
      ) : null}
      <p className="ticket">
        {sideLabel(trade.side)} {trade.asset} · 数量 {trade.amount}
        。这是你自己的机密报价预览，仍是 dry，不使用带单员的账户钥匙。
      </p>
      <label>权益占比 bps<input value={equity} onChange={(event) => setEquity(event.target.value)} /></label>
      <label>杠杆<input value={leverage} onChange={(event) => setLeverage(event.target.value)} /></label>
      <label>抽成托管 NEAR<input value={feeCap} onChange={(event) => setFeeCap(event.target.value)} /></label>
      <label>名义承诺<input value={notional} onChange={(event) => setNotional(event.target.value)} /></label>
      <label>
        {trade.market === "Spot" ? "收款账户" : "你的 Hyperliquid 地址"}
        <input value={recipient} placeholder={trade.market === "Spot" ? accountId ?? "" : "0x…"} onChange={(event) => setRecipient(event.target.value)} />
      </label>
      <label>退款账户<input value={refundTo} onChange={(event) => setRefundTo(event.target.value)} /></label>
      <p className="hint">下面是带 confidentiality 的主网 dry 预览，不生成存款地址，也不转账。</p>
      <div className="row">
        <button type="button" className="ghost" onClick={() => void quote()}>预览报价</button>
        <button type="button" className="button" disabled={busy || !accountId || !policy} onClick={() => void confirm()}>{busy ? "提交中" : "确认跟单"}</button>
      </div>
      <p className="trust">只跟你点下之后的新交易。</p>
      {error ? <p className="error">{error}</p> : null}
      {quoteText ? <pre>{quoteText}</pre> : null}
    </aside>
  );
}
