import { useState } from "react";
import { chatSignature, liveAttestation, loadAiKey, saveAiKey, teeAdvice } from "../ai";

function addressOf(value: Record<string, unknown>): string {
  const direct = value.signing_address ?? value.signingAddress ?? value.address;
  if (typeof direct === "string") return direct;
  return "";
}

export function VerifyPanel({ prompt }: { prompt?: string }) {
  const [key, setKey] = useState(loadAiKey);
  const [note, setNote] = useState("");
  const [receipt, setReceipt] = useState<Record<string, unknown> | null>(null);

  async function run() {
    setNote("");
    setReceipt(null);
    if (!loadAiKey()) {
      setNote("先到 cloud.near.ai 创建 API key，再贴到上面。没有 key 时这里不向 NEAR AI 发请求。");
      return;
    }
    try {
      const report = await liveAttestation("deepseek-ai/DeepSeek-V3.1");
      let signature: Record<string, unknown> = {};
      let advice = "";
      if (prompt) {
        const result = await teeAdvice(prompt);
        advice = result.advice.reason;
        if (result.chatId) signature = await chatSignature(result.chatId);
      }
      const signing = addressOf(report);
      const signed = addressOf(signature);
      setReceipt({
        nonce: report.nonce,
        signing_address: signing || "(报告里没有 signing_address)",
        signature_address: signed || "(还没有聊天签名)",
        matched: Boolean(signing && signed && signing === signed),
        advice,
      });
    } catch (error) {
      setNote(error instanceof Error ? error.message : "验证失败");
    }
  }

  return (
    <section className="panel">
      <header className="panel-head">
        <h2>NEAR AI 证明</h2>
        <p>登记带单员不用这把钥匙。它是 NEAR AI Cloud 的 API key，只用来读取这次模型的 TEE 证明。钥匙存在这个标签页里，关掉或刷新就消失。它不会上链，也不能签名，和查看权不是同一把。</p>
      </header>
      <label>
        NEAR AI Cloud API key
        <input
          type="password"
          autoComplete="off"
          value={key}
          placeholder="从 cloud.near.ai 复制"
          onChange={(event) => {
            setKey(event.target.value);
            saveAiKey(event.target.value.trim());
          }}
        />
      </label>
      <p className="hint">
        打开 <a href="https://cloud.near.ai" target="_blank" rel="noreferrer">cloud.near.ai</a>，登录后创建 API key。读取证明不计费。
      </p>
      <button type="button" className="ghost" disabled={!key.trim()} onClick={() => void run()}>读取证明</button>
      {!key.trim() ? <p className="empty">还没有 key，这次不会向 NEAR AI 发请求。</p> : null}
      {note ? <p className="error">{note}</p> : null}
      {receipt ? (
        <dl className="receipt">
          <div><dt>来源</dt><dd>这次请求</dd></div>
          <div><dt>nonce</dt><dd>{String(receipt.nonce)}</dd></div>
          <div><dt>signing address</dt><dd>{String(receipt.signing_address)}</dd></div>
          <div><dt>签名地址</dt><dd>{String(receipt.signature_address ?? "—")}</dd></div>
          <div><dt>地址一致</dt><dd>{receipt.matched ? "是" : "否"}</dd></div>
          {receipt.advice ? <div><dt>建议</dt><dd>{String(receipt.advice)}</dd></div> : null}
        </dl>
      ) : null}
    </section>
  );
}
