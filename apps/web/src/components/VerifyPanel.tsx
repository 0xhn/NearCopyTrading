import { useState } from "react";
import { chatSignature, liveAttestation, loadAiKey, saveAiKey, teeAdvice } from "../ai";
import { useI18n } from "../i18n";

function addressOf(value: Record<string, unknown>): string {
  const direct = value.signing_address ?? value.signingAddress ?? value.address;
  if (typeof direct === "string") return direct;
  return "";
}

export function VerifyPanel({ prompt }: { prompt?: string }) {
  const { lang, t } = useI18n();
  const [key, setKey] = useState(loadAiKey);
  const [note, setNote] = useState("");
  const [receipt, setReceipt] = useState<Record<string, unknown> | null>(null);

  async function run() {
    setNote("");
    setReceipt(null);
    if (!loadAiKey()) {
      setNote(t("先到 cloud.near.ai 创建 API key，再贴到上面。没有 key 时这里不向 NEAR AI 发请求。", "Create an API key at cloud.near.ai first and paste it above. Without a key, no request is sent to NEAR AI."));
      return;
    }
    try {
      const report = await liveAttestation("deepseek-ai/DeepSeek-V3.1", lang);
      let signature: Record<string, unknown> = {};
      let advice = "";
      if (prompt) {
        const result = await teeAdvice(prompt, lang);
        advice = result.advice.reason;
        if (result.chatId) signature = await chatSignature(result.chatId, lang);
      }
      const signing = addressOf(report);
      const signed = addressOf(signature);
      setReceipt({
        nonce: report.nonce,
        signing_address: signing || t("(报告里没有 signing_address)", "(no signing_address in report)"),
        signature_address: signed || t("(还没有聊天签名)", "(no chat signature yet)"),
        matched: Boolean(signing && signed && signing === signed),
        advice,
      });
    } catch (error) {
      setNote(error instanceof Error ? error.message : t("验证失败", "Verification failed"));
    }
  }

  return (
    <section className="panel">
      <header className="panel-head">
        <h2>{t("NEAR AI 证明", "NEAR AI Attestation")}</h2>
        <p>
          {t(
            "登记带单员不用这把钥匙。它是 NEAR AI Cloud 的 API key，只用来读取这次模型的 TEE 证明。钥匙存在这个标签页里，关掉或刷新就消失。它不会上链，也不能签名，和查看权不是同一把。",
            "You do not need this key to register as a leader. It is a NEAR AI Cloud API key used only to fetch this model's TEE attestation. It stays in this tab's session storage, disappears when closed or refreshed, never goes on-chain, cannot sign transactions, and is separate from viewing keys.",
          )}
        </p>
      </header>
      <label>
        NEAR AI Cloud API key
        <input
          type="password"
          autoComplete="off"
          value={key}
          placeholder={t("从 cloud.near.ai 复制", "Copy from cloud.near.ai")}
          onChange={(event) => {
            setKey(event.target.value);
            saveAiKey(event.target.value.trim());
          }}
        />
      </label>
      <p className="hint">
        {lang === "en" ? (
          <>Open <a href="https://cloud.near.ai" target="_blank" rel="noreferrer">cloud.near.ai</a>, sign in, and create an API key. Reading attestation is free.</>
        ) : (
          <>打开 <a href="https://cloud.near.ai" target="_blank" rel="noreferrer">cloud.near.ai</a>，登录后创建 API key。读取证明不计费。</>
        )}
      </p>
      <button type="button" className="ghost" disabled={!key.trim()} onClick={() => void run()}>{t("读取证明", "Fetch Attestation")}</button>
      {!key.trim() ? <p className="empty">{t("还没有 key，这次不会向 NEAR AI 发请求。", "No key entered; no request will be sent to NEAR AI.")}</p> : null}
      {note ? <p className="error">{note}</p> : null}
      {receipt ? (
        <dl className="receipt">
          <div><dt>{t("来源", "Source")}</dt><dd>{t("这次请求", "This request")}</dd></div>
          <div><dt>nonce</dt><dd>{String(receipt.nonce)}</dd></div>
          <div><dt>signing address</dt><dd>{String(receipt.signing_address)}</dd></div>
          <div><dt>{t("签名地址", "Signature address")}</dt><dd>{String(receipt.signature_address ?? "—")}</dd></div>
          <div><dt>{t("地址一致", "Match")}</dt><dd>{receipt.matched ? t("是", "Yes") : t("否", "No")}</dd></div>
          {receipt.advice ? <div><dt>{t("建议", "Advice")}</dt><dd>{String(receipt.advice)}</dd></div> : null}
        </dl>
      ) : null}
    </section>
  );
}
