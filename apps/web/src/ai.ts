import { NEAR_AI_BASE } from "./config";

const KEY = "keycopy.nearAiKey";

export function loadAiKey(): string {
  return sessionStorage.getItem(KEY) ?? "";
}

export function saveAiKey(value: string) {
  if (value) sessionStorage.setItem(KEY, value);
  else sessionStorage.removeItem(KEY);
}

export interface SizeAdvice {
  accept: boolean;
  equityBps: number;
  leverage: number;
  reason: string;
  live: boolean;
}

export function localAdvice(equityBps: number, leverage: number, cap: number, maxLeverage: number, spot: boolean): SizeAdvice {
  const equity = Math.max(1, Math.min(equityBps, cap));
  const nextLeverage = spot ? 1 : Math.max(1, Math.min(leverage, maxLeverage));
  return {
    accept: equityBps <= cap && nextLeverage <= maxLeverage,
    equityBps: equity,
    leverage: nextLeverage,
    reason: "按链上策略把仓位缩进限额。这不是 TEE 推理。",
    live: false,
  };
}

export async function teeAdvice(prompt: string): Promise<{ advice: SizeAdvice; chatId: string }> {
  const apiKey = loadAiKey();
  if (!apiKey) throw new Error("先在本页保存 NEAR AI key");
  const response = await fetch(`${NEAR_AI_BASE}/chat/completions`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "deepseek-ai/DeepSeek-V3.1",
      messages: [
        {
          role: "system",
          content: "Reply with JSON only: {\"accept\":boolean,\"equityBps\":number,\"leverage\":number,\"reason\":string}. Never choose a recipient address.",
        },
        { role: "user", content: prompt },
      ],
    }),
  });
  const body = (await response.json()) as {
    id?: string;
    error?: { message?: string };
    choices?: Array<{ message?: { content?: string } }>;
  };
  if (!response.ok) throw new Error(body.error?.message || "NEAR AI 请求失败");
  const content = body.choices?.[0]?.message?.content ?? "";
  const jsonStart = content.indexOf("{");
  const jsonEnd = content.lastIndexOf("}");
  const parsed = JSON.parse(content.slice(jsonStart, jsonEnd + 1)) as SizeAdvice;
  return {
    advice: { ...parsed, live: true },
    chatId: body.id ?? "",
  };
}

export async function liveAttestation(model: string): Promise<Record<string, unknown>> {
  const apiKey = loadAiKey();
  if (!apiKey) throw new Error("先保存 NEAR AI key");
  const nonceBytes = crypto.getRandomValues(new Uint8Array(32));
  const nonce = [...nonceBytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  const response = await fetch(`${NEAR_AI_BASE}/attestation/report?model=${encodeURIComponent(model)}&nonce=${nonce}`, {
    headers: { authorization: `Bearer ${apiKey}` },
  });
  const body = (await response.json()) as Record<string, unknown>;
  if (!response.ok) throw new Error("attestation 读取失败");
  return { nonce, ...body };
}

export async function chatSignature(chatId: string): Promise<Record<string, unknown>> {
  const apiKey = loadAiKey();
  const response = await fetch(`${NEAR_AI_BASE}/signature/${chatId}`, {
    headers: { authorization: `Bearer ${apiKey}` },
  });
  const body = (await response.json()) as Record<string, unknown>;
  if (!response.ok) throw new Error("签名读取失败");
  return body;
}
