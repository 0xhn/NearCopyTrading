import { ONE_CLICK } from "./config";
import { ed25519Key, ed25519Signature, versionedNonce } from "./nep413";

export interface Holding {
  tokenId: string;
  available: string;
}

export interface AccountRead {
  accountId: string;
  holdings: Holding[];
  history: string;
}

function nonceB64(nonce: Uint8Array): string {
  let binary = "";
  nonce.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary);
}

export function ownershipMessage(accountId: string): { message: string; nonce: Uint8Array } {
  const start = new Date();
  const deadline = new Date(start.getTime() + 5 * 60_000);
  const nonce = versionedNonce(start, deadline);
  const message = JSON.stringify({
    deadline: deadline.toISOString(),
    intents: [],
    signer_id: accountId,
  });
  return { message, nonce };
}

export async function readOwnedAccount(
  accountId: string,
  signOwnership: (message: string, nonce: Uint8Array) => Promise<{
    accountId: string;
    publicKey: string;
    signature: string;
    callbackUrl: string | null;
  }>,
): Promise<AccountRead> {
  const { message, nonce } = ownershipMessage(accountId);
  const signed = await signOwnership(message, nonce);
  if (signed.accountId !== accountId) {
    throw new Error("签名账户和当前钱包不一致");
  }
  const auth = await fetch(`${ONE_CLICK}/auth/authenticate`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      signedData: {
        standard: "nep413",
        payload: {
          recipient: "intents.near",
          nonce: nonceB64(nonce),
          message,
          ...(signed.callbackUrl ? { callbackUrl: signed.callbackUrl } : {}),
        },
        public_key: ed25519Key(signed.publicKey),
        signature: ed25519Signature(signed.signature),
      },
    }),
  });
  const authBody = await auth.json() as { accessToken?: string; refreshToken?: string; message?: string };
  const accessToken = authBody.accessToken ?? "";
  delete authBody.refreshToken;
  if (!auth.ok || !accessToken) {
    const raw = authBody.message || "钱包签名没有换到读取许可";
    if (raw === "signature verification failed" && accountId.endsWith(".testnet")) {
      throw new Error("1Click 在主网 intents.near 上验签。测试网账户的公钥没有登记在那里，所以校验失败。");
    }
    if (raw === "signature verification failed") {
      throw new Error("签名没有通过。请确认这个公钥已经在 intents.near 登记。");
    }
    throw new Error(raw);
  }
  const balances = await fetch(`${ONE_CLICK}/account/balances`, {
    headers: { authorization: `Bearer ${accessToken}` },
  });
  const balanceBody = await balances.json() as {
    balances?: Array<{ tokenId?: string; available?: string }>;
    message?: string;
  };
  if (!balances.ok) throw new Error(balanceBody.message || "余额读取失败");
  const history = await fetch(`${ONE_CLICK}/account/history`, {
    headers: { authorization: `Bearer ${accessToken}` },
  });
  const historyText = history.ok ? JSON.stringify(await history.json()) : "";
  const historyNote = history.status === 403
    ? "成交历史是邀请制，这次没有开仓和已实现收益。"
    : history.ok && /pnl|unrealized|position/i.test(historyText)
      ? "历史里出现了仓位相关字段，但接口没有给出可公开的开仓收益率。"
      : history.ok
        ? "历史接口有响应，里面没有开仓盈亏。"
        : "成交历史没有读到，所以没有开仓收益。";
  return {
    accountId,
    holdings: (balanceBody.balances ?? [])
      .filter((item) => item.tokenId && item.available)
      .map((item) => ({ tokenId: item.tokenId as string, available: item.available as string })),
    history: historyNote,
  };
}
