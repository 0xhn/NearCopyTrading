import { useState } from "react";
import { readOwnedAccount, type AccountRead } from "../accountRead";
import { useI18n } from "../i18n";
import { useNear } from "../near/wallet";

export function HoldingsPanel({ leaderId }: { leaderId: string }) {
  const { accountId, signOwnership } = useNear();
  const { lang, t } = useI18n();
  const [reading, setReading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<AccountRead | null>(null);
  const mine = accountId === leaderId;

  async function read() {
    if (!accountId) return;
    setError("");
    setReading(true);
    try {
      setResult(await readOwnedAccount(accountId, signOwnership, lang));
    } catch (reason) {
      setResult(null);
      setError(reason instanceof Error ? reason.message : t("读取失败", "Failed to read balances"));
    } finally {
      setReading(false);
    }
  }

  return (
    <section className="panel">
      <h2>{t("钱包签名读到的持仓", "Wallet-Verified Holdings")}</h2>
      <p className="hint">
        {t(
          "签名证明你控制这个 NEAR 账户，并读到机密余额。这次读取不会公开。要把余额当成本金，用上面的冻结。刷新许可不保存。1Click 在主网验签，测试网账户的公钥没有登记在 intents.near 时，这里会失败。",
          "Signing proves ownership of this NEAR account to read confidential balances privately. Use Freeze above to publish them as principal. Refresh tokens are never stored. 1Click verifies signatures on mainnet intents.near, so testnet keys not registered there will fail.",
        )}
      </p>
      {mine ? (
        <button type="button" className="button" disabled={reading} onClick={() => void read()}>
          {reading ? t("等待钱包", "Waiting for wallet") : t("用钱包读取我的余额", "Read My Balances with Wallet")}
        </button>
      ) : (
        <p className="empty">{t("只有这个带单员的钱包能读自己的余额。", "Only this leader's wallet can read their balances.")}</p>
      )}
      {error ? <p className="error">{error}</p> : null}
      {result ? (
        <>
          <p className="hint">{result.accountId} · {result.history}</p>
          {result.holdings.length === 0 ? <p className="empty">{t("没有读到非零余额。", "No non-zero balances found.")}</p> : null}
          {result.holdings.map((holding) => (
            <p key={holding.tokenId}><span className="num">{holding.tokenId}</span> · <span className="num">{holding.available}</span></p>
          ))}
        </>
      ) : null}
    </section>
  );
}
