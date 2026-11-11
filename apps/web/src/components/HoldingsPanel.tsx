import { useState } from "react";
import { readOwnedAccount, type AccountRead } from "../accountRead";
import { useNear } from "../near/wallet";

export function HoldingsPanel({ leaderId }: { leaderId: string }) {
  const { accountId, signOwnership } = useNear();
  const [reading, setReading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<AccountRead | null>(null);
  const mine = accountId === leaderId;

  async function read() {
    if (!accountId) return;
    setError("");
    setReading(true);
    try {
      setResult(await readOwnedAccount(accountId, signOwnership));
    } catch (reason) {
      setResult(null);
      setError(reason instanceof Error ? reason.message : "读取失败");
    } finally {
      setReading(false);
    }
  }

  return (
    <section className="panel">
      <h2>钱包签名读到的持仓</h2>
      <p className="hint">签名证明你控制这个 NEAR 账户，并读到机密余额。这次读取不会公开。要把余额当成本金，用上面的冻结。刷新许可不保存。1Click 在主网验签，测试网账户的公钥没有登记在 intents.near 时，这里会失败。</p>
      {mine ? (
        <button type="button" className="button" disabled={reading} onClick={() => void read()}>
          {reading ? "等待钱包" : "用钱包读取我的余额"}
        </button>
      ) : (
        <p className="empty">只有这个带单员的钱包能读自己的余额。</p>
      )}
      {error ? <p className="error">{error}</p> : null}
      {result ? (
        <>
          <p className="hint">{result.accountId} · {result.history}</p>
          {result.holdings.length === 0 ? <p className="empty">没有读到非零余额。</p> : null}
          {result.holdings.map((holding) => (
            <p key={holding.tokenId}><span className="num">{holding.tokenId}</span> · <span className="num">{holding.available}</span></p>
          ))}
        </>
      ) : null}
    </section>
  );
}
