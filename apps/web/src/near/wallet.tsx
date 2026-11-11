import { Buffer } from "buffer";
import { actionCreators, setupWalletSelector } from "@near-wallet-selector/core";
import { setupHereWallet } from "@near-wallet-selector/here-wallet";
import { setupMeteorWallet } from "@near-wallet-selector/meteor-wallet";
import { setupModal } from "@near-wallet-selector/modal-ui";
import "@near-wallet-selector/modal-ui/styles.css";
import { setupMyNearWallet } from "@near-wallet-selector/my-near-wallet";
import { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { CONTRACT_ID, GAS } from "../config";

interface NearWallet {
  accountId: string | null;
  ready: boolean;
  signIn: () => void;
  signOut: () => Promise<void>;
  call: (method: string, args: object, deposit: string) => Promise<void>;
  signOwnership: (message: string, nonce: Uint8Array) => Promise<{
    accountId: string;
    publicKey: string;
    signature: string;
    callbackUrl: string | null;
  }>;
}

const NearContext = createContext<NearWallet | null>(null);

export function NearProvider({ children }: { children: ReactNode }) {
  const [accountId, setAccountId] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [tools, setTools] = useState<{
    show: () => void;
    signOut: () => Promise<void>;
    call: NearWallet["call"];
    signOwnership: NearWallet["signOwnership"];
  } | null>(null);

  useEffect(() => {
    let closed = false;
    void (async () => {
      const selector = await setupWalletSelector({
        network: "testnet",
        modules: [setupMyNearWallet(), setupMeteorWallet(), setupHereWallet()],
      });
      const modal = setupModal(selector, { contractId: CONTRACT_ID, theme: "light" });
      const sync = () => {
        const active = selector.store.getState().accounts.find((account) => account.active);
        setAccountId(active?.accountId ?? selector.store.getState().accounts[0]?.accountId ?? null);
      };
      sync();
      const subscription = selector.store.observable.subscribe(sync);
      if (closed) {
        subscription.unsubscribe();
        return;
      }
      setTools({
        show: () => modal.show(),
        signOut: async () => {
          const wallet = await selector.wallet();
          await wallet.signOut();
          setAccountId(null);
        },
        call: async (method: string, args: object, deposit: string) => {
          const signerId = selector.store.getState().accounts.find((account) => account.active)?.accountId
            ?? selector.store.getState().accounts[0]?.accountId;
          if (!signerId) throw new Error("先连接测试网钱包");
          const wallet = await selector.wallet();
          await wallet.signAndSendTransaction({
            signerId,
            receiverId: CONTRACT_ID,
            actions: [actionCreators.functionCall(method, args, GAS, BigInt(deposit))],
          });
        },
        signOwnership: async (message: string, nonce: Uint8Array) => {
          const wallet = await selector.wallet();
          const callbackUrl = wallet.id === "meteor-wallet" ? undefined : window.location.href;
          const signed = await wallet.signMessage({
            message,
            recipient: "intents.near",
            nonce: Buffer.from(nonce),
            ...(callbackUrl ? { callbackUrl } : {}),
          });
          if (!signed) throw new Error("钱包没有返回签名");
          return {
            accountId: signed.accountId,
            publicKey: signed.publicKey,
            signature: signed.signature,
            callbackUrl: callbackUrl ?? null,
          };
        },
      });
      setReady(true);
    })();
    return () => {
      closed = true;
    };
  }, []);

  const value = useMemo<NearWallet>(() => ({
    accountId,
    ready,
    signIn: () => tools?.show(),
    signOut: async () => {
      await tools?.signOut();
    },
    call: async (method, args, deposit) => {
      if (!tools) throw new Error("钱包还在初始化");
      await tools.call(method, args, deposit);
    },
    signOwnership: async (message, nonce) => {
      if (!tools) throw new Error("钱包还在初始化");
      return tools.signOwnership(message, nonce);
    },
  }), [accountId, ready, tools]);

  return <NearContext.Provider value={value}>{children}</NearContext.Provider>;
}

export function useNear(): NearWallet {
  const value = useContext(NearContext);
  if (!value) throw new Error("NearProvider missing");
  return value;
}
