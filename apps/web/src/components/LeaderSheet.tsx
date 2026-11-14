import { useState } from "react";
import { STORAGE_BUFFER } from "../config";
import { sideLabel } from "../format";
import { useI18n } from "../i18n";
import { useNear } from "../near/wallet";
import type { Market, Side } from "../types";

const SIDES: Record<Market, Side[]> = {
  Spot: ["Buy", "Sell"],
  Perp: ["Long", "Short"],
};

export function LeaderSheet({ onClose }: { onClose: () => void }) {
  const { accountId, call } = useNear();
  const { lang, t } = useI18n();
  const steps = [
    t("登记", "Register"),
    t("发布交易", "Publish Trade"),
    t("冻结本金", "Freeze Principal"),
    t("限额", "Policy"),
  ];
  const [step, setStep] = useState(0);
  const [name, setName] = useState("Ada");
  const [fee, setFee] = useState("1000");
  const [market, setMarket] = useState<Market>("Spot");
  const [side, setSide] = useState<Side>("Buy");
  const [asset, setAsset] = useState("wrap.near");
  const [amount, setAmount] = useState("1000000000000000000000000");
  const [spotCap, setSpotCap] = useState("5000");
  const [perpCap, setPerpCap] = useState("2000");
  const [leverage, setLeverage] = useState("5");
  const [note, setNote] = useState("");
  const [error, setError] = useState("");

  async function send(method: string, args: object, deposit = STORAGE_BUFFER) {
    setError("");
    setNote("");
    if (!accountId) {
      setError(t("先连接测试网钱包", "Connect a testnet wallet first"));
      return;
    }
    try {
      await call(method, args, deposit.toString());
      setNote(t("已提交", "Submitted"));
      setStep((current) => Math.min(current + 1, steps.length - 1));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t("交易失败", "Transaction failed"));
    }
  }

  function chooseMarket(next: Market) {
    setMarket(next);
    setSide(SIDES[next][0]);
    setAsset(next === "Spot" ? "wrap.near" : "BTC");
    setAmount(next === "Spot" ? "1000000000000000000000000" : "5");
  }

  return (
    <div className="sheet-back" role="presentation" onClick={onClose}>
      <section className="sheet" role="dialog" aria-label={t("成为带单员", "Become a Leader")} onClick={(event) => event.stopPropagation()}>
        <header>
          <h2>{t("成为带单员", "Become a Leader")}</h2>
          <button type="button" className="ghost" onClick={onClose}>{t("关闭", "Close")}</button>
        </header>
        <div className="steps segment">
          {steps.map((label, index) => (
            <button key={label} type="button" className={step === index ? "on" : ""} onClick={() => setStep(index)}>{label}</button>
          ))}
        </div>
        {step === 0 ? (
          <>
            <label>{t("显示名", "Display Name")}<input value={name} onChange={(event) => setName(event.target.value)} /></label>
            <label>{t("抽成 bps", "Fee (bps)")}<input value={fee} onChange={(event) => setFee(event.target.value)} /></label>
            <button type="button" className="button" onClick={() => void send("register_leader", { fee_bps: Number(fee), display_name: name })}>{t("登记", "Register")}</button>
          </>
        ) : null}
        {step === 1 ? (
          <>
            <div className="segment">
              <button type="button" className={market === "Spot" ? "on" : ""} onClick={() => chooseMarket("Spot")}>{t("现货", "Spot")}</button>
              <button type="button" className={market === "Perp" ? "on" : ""} onClick={() => chooseMarket("Perp")}>{t("合约", "Perp")}</button>
            </div>
            <div className="grid">
              <label>{t("方向", "Side")}
                <select value={side} onChange={(event) => setSide(event.target.value as Side)}>
                  {SIDES[market].map((item) => <option key={item} value={item}>{sideLabel(item, lang)}</option>)}
                </select>
              </label>
              <label>{t("标的", "Asset")}<input value={asset} onChange={(event) => setAsset(event.target.value)} /></label>
              <label>{t("数量", "Amount")}<input value={amount} onChange={(event) => setAmount(event.target.value)} /></label>
            </div>
            <button type="button" className="button" onClick={() => void send("publish_trade", { market, side, asset, amount }, STORAGE_BUFFER * 3n)}>{t("发布", "Publish")}</button>
          </>
        ) : null}
        {step === 2 ? (
          <p className="hint">
            {t(
              "收益率从冻结本金开始计算。登记之后打开自己的主页，用钱包冻结当前余额，再记下之后每一笔兑换的兑出和兑入。",
              "Returns are calculated from the moment principal is frozen. After registering, open your leader page, freeze your current balance with your wallet, and record subsequent swap pairs.",
            )}
          </p>
        ) : null}
        {step === 3 ? (
          <>
            <div className="grid">
              <label>{t("现货权益上限 bps", "Spot Equity Cap (bps)")}<input value={spotCap} onChange={(event) => setSpotCap(event.target.value)} /></label>
              <label>{t("合约权益上限 bps", "Perp Equity Cap (bps)")}<input value={perpCap} onChange={(event) => setPerpCap(event.target.value)} /></label>
              <label>{t("最大杠杆", "Max Leverage")}<input value={leverage} onChange={(event) => setLeverage(event.target.value)} /></label>
            </div>
            <button type="button" className="button" onClick={() => void send("set_policy", {
              spot_max_equity_bps: Number(spotCap),
              perp_max_equity_bps: Number(perpCap),
              max_leverage: Number(leverage),
              markets_commitment: "spot,perp",
            })}>{t("保存限额", "Save Policy")}</button>
          </>
        ) : null}
        <p className="trust">{t("只跟你点下之后的新交易。", "Only applies to new trades published after following.")}</p>
        {note ? <p className="hint">{note}</p> : null}
        {error ? <p className="error">{error}</p> : null}
      </section>
    </div>
  );
}
