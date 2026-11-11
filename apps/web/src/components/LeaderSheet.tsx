import { useState } from "react";
import { STORAGE_BUFFER } from "../config";
import { useNear } from "../near/wallet";
import type { Market, Side } from "../types";

const SIDES: Record<Market, Side[]> = {
  Spot: ["Buy", "Sell"],
  Perp: ["Long", "Short"],
};

const STEPS = ["登记", "发布交易", "冻结本金", "限额"] as const;

export function LeaderSheet({ onClose }: { onClose: () => void }) {
  const { accountId, call } = useNear();
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
      setError("先连接测试网钱包");
      return;
    }
    try {
      await call(method, args, deposit.toString());
      setNote("已提交");
      setStep((current) => Math.min(current + 1, STEPS.length - 1));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "交易失败");
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
      <section className="sheet" role="dialog" aria-label="成为带单员" onClick={(event) => event.stopPropagation()}>
        <header>
          <h2>成为带单员</h2>
          <button type="button" className="ghost" onClick={onClose}>关闭</button>
        </header>
        <div className="steps segment">
          {STEPS.map((label, index) => (
            <button key={label} type="button" className={step === index ? "on" : ""} onClick={() => setStep(index)}>{label}</button>
          ))}
        </div>
        {step === 0 ? (
          <>
            <label>显示名<input value={name} onChange={(event) => setName(event.target.value)} /></label>
            <label>抽成 bps<input value={fee} onChange={(event) => setFee(event.target.value)} /></label>
            <button type="button" className="button" onClick={() => void send("register_leader", { fee_bps: Number(fee), display_name: name })}>登记</button>
          </>
        ) : null}
        {step === 1 ? (
          <>
            <div className="segment">
              <button type="button" className={market === "Spot" ? "on" : ""} onClick={() => chooseMarket("Spot")}>现货</button>
              <button type="button" className={market === "Perp" ? "on" : ""} onClick={() => chooseMarket("Perp")}>合约</button>
            </div>
            <div className="grid">
              <label>方向
                <select value={side} onChange={(event) => setSide(event.target.value as Side)}>
                  {SIDES[market].map((item) => <option key={item} value={item}>{item}</option>)}
                </select>
              </label>
              <label>标的<input value={asset} onChange={(event) => setAsset(event.target.value)} /></label>
              <label>数量<input value={amount} onChange={(event) => setAmount(event.target.value)} /></label>
            </div>
            <button type="button" className="button" onClick={() => void send("publish_trade", { market, side, asset, amount }, STORAGE_BUFFER * 3n)}>发布</button>
          </>
        ) : null}
        {step === 2 ? (
          <p className="hint">收益率从冻结本金开始计算。登记之后打开自己的主页，用钱包冻结当前余额，再记下之后每一笔兑换的兑出和兑入。</p>
        ) : null}
        {step === 3 ? (
          <>
            <div className="grid">
              <label>现货权益上限 bps<input value={spotCap} onChange={(event) => setSpotCap(event.target.value)} /></label>
              <label>合约权益上限 bps<input value={perpCap} onChange={(event) => setPerpCap(event.target.value)} /></label>
              <label>最大杠杆<input value={leverage} onChange={(event) => setLeverage(event.target.value)} /></label>
            </div>
            <button type="button" className="button" onClick={() => void send("set_policy", {
              spot_max_equity_bps: Number(spotCap),
              perp_max_equity_bps: Number(perpCap),
              max_leverage: Number(leverage),
              markets_commitment: "spot,perp",
            })}>保存限额</button>
          </>
        ) : null}
        <p className="trust">只跟你点下之后的新交易。</p>
        {note ? <p className="hint">{note}</p> : null}
        {error ? <p className="error">{error}</p> : null}
      </section>
    </div>
  );
}
