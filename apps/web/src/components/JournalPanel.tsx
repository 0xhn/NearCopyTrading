import { useEffect, useState } from "react";
import { STORAGE_BUFFER } from "../config";
import { loadViewingKey, openSignal, sealSignal, viewingKeyFor } from "../crypto";
import { addYocto, nearToYocto, yoctoToNear } from "../format";
import { viewCall } from "../near/rpc";
import type { Journal, Viewer } from "../types";

export function JournalPanel({
  leaderId,
  accountId,
  isLeader,
  call,
}: {
  leaderId: string;
  accountId: string | null;
  isLeader: boolean;
  call: (method: string, args: object, deposit: string) => Promise<void>;
}) {
  const [price, setPrice] = useState<string | null>(null);
  const [viewers, setViewers] = useState<Viewer[]>([]);
  const [journal, setJournal] = useState<Journal | null>(null);
  const [mine, setMine] = useState<Viewer | null>(null);
  const [plain, setPlain] = useState("");
  const [note, setNote] = useState("");
  const [ask, setAsk] = useState("1");
  const [error, setError] = useState("");

  async function reload() {
    const [nextPrice, nextViewers, nextJournal] = await Promise.all([
      viewCall<string | null>("get_view_price", { leader: leaderId }),
      viewCall<Viewer[]>("list_viewers", { leader: leaderId, from_index: 0, limit: 32 }),
      viewCall<Journal | null>("get_journal", { leader: leaderId }),
    ]);
    setPrice(nextPrice);
    setViewers(nextViewers);
    setJournal(nextJournal);
    if (accountId && !isLeader) {
      setMine(await viewCall<Viewer | null>("get_viewer", { leader: leaderId, buyer: accountId }));
    } else {
      setMine(null);
    }
  }

  useEffect(() => {
    let closed = false;
    reload().catch((reason: unknown) => {
      if (!closed) setError(reason instanceof Error ? reason.message : "读取查看权失败");
    });
    return () => {
      closed = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leaderId, accountId, isLeader]);

  useEffect(() => {
    if (!accountId || !journal) {
      setPlain("");
      return;
    }
    const wrap = journal.wraps.find((item) => item.buyer === accountId);
    const key = loadViewingKey(accountId);
    if (!wrap || !key) {
      setPlain("");
      return;
    }
    let closed = false;
    openSignal(journal.ciphertext, wrap.wrapped_key, key.secretB64)
      .then((text) => {
        if (!closed) setPlain(text);
      })
      .catch(() => {
        if (!closed) setPlain("");
      });
    return () => {
      closed = true;
    };
  }, [accountId, journal]);

  async function setViewPrice() {
    setError("");
    try {
      await call("set_view_price", { price: nearToYocto(ask) }, STORAGE_BUFFER.toString());
      await reload();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "标价失败");
    }
  }

  async function buy() {
    if (!accountId) return;
    setError("");
    try {
      const key = viewingKeyFor(accountId);
      const deposit = addYocto(price ?? nearToYocto(ask), STORAGE_BUFFER);
      await call("buy_view", { leader: leaderId, public_hex: key.publicHex }, deposit);
      await reload();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "购买失败");
    }
  }

  async function seal() {
    setError("");
    try {
      const sealed = await sealSignal(
        note.trim(),
        viewers.map((viewer) => ({ buyer: viewer.buyer, publicHex: viewer.public_hex })),
      );
      await call("publish_journal", sealed, STORAGE_BUFFER.toString());
      setNote("");
      await reload();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "封存失败");
    }
  }

  return (
    <section className="panel">
      <h2>私人成交</h2>
      <p className="hint">这里是成交明细。收益率在上面，任何人都能看到，跟单看的就是那条公开收益。密钥留在买家浏览器里，不会登记到 intents.near。</p>
      <p className="hint">查看权价格 <span className="num">{price ? `${yoctoToNear(price)} NEAR` : "—"}</span> · 已购买 {viewers.length}</p>
      {isLeader ? (
        <div className="row">
          <input value={ask} onChange={(event) => setAsk(event.target.value)} aria-label="查看权价格 NEAR" />
          <button type="button" className="ghost" onClick={() => void setViewPrice()}>设定价格</button>
        </div>
      ) : null}
      {isLeader ? (
        <>
          <label>
            要封存的成交
            <textarea value={note} onChange={(event) => setNote(event.target.value)} rows={4} placeholder="只写给已购买的人。收益率在上面，所有人都能看到。" />
          </label>
          <button type="button" className="button" disabled={viewers.length === 0 || note.trim().length === 0} onClick={() => void seal()}>封存</button>
        </>
      ) : (
        <button type="button" className="button" disabled={!accountId || !price || Boolean(mine)} onClick={() => void buy()}>
          {mine ? "已购买" : "购买查看权"}
        </button>
      )}
      {plain ? <pre>{plain}</pre> : null}
      {!plain && journal ? <p className="hint">密文已在链上。没有对应的本地密钥就解不开。</p> : null}
      {!journal ? <p className="empty">还没有封存的成交。收益率在上面。</p> : null}
      {error ? <p className="error">{error}</p> : null}
    </section>
  );
}
