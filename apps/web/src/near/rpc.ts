import { CONTRACT_ID, TESTNET_RPC } from "../config";
import { getLang } from "../i18n";

export async function viewCall<T>(method: string, args: object): Promise<T> {
  const response = await fetch(TESTNET_RPC, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: "keycopy",
      method: "query",
      params: {
        request_type: "call_function",
        account_id: CONTRACT_ID,
        method_name: method,
        args_base64: btoa(JSON.stringify(args)),
        finality: "optimistic",
      },
    }),
  });
  const body = (await response.json()) as {
    result?: { result?: number[]; error?: string };
    error?: { message?: string; data?: string };
  };
  if (body.error) {
    throw new Error(body.error.data || body.error.message || (getLang() === "en" ? "Contract view call failed" : "合约读取失败"));
  }
  const error = body.result?.error;
  if (error) throw new Error(error);
  const bytes = body.result?.result ?? [];
  const text = new TextDecoder().decode(Uint8Array.from(bytes));
  return JSON.parse(text) as T;
}
