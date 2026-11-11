import { useEffect, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { BookPanel } from "../components/BookPanel";
import { CopyDrawer } from "../components/CopyDrawer";
import { HoldingsPanel } from "../components/HoldingsPanel";
import { JournalPanel } from "../components/JournalPanel";
import { TokenMark } from "../components/TokenMark";
import { Sparkline } from "../components/Sparkline";
import { publicYield } from "../book";
import { STORAGE_BUFFER } from "../config";
import { bpsLabel, copyStatus, marketLabel, nearToYocto, nsToDate, sideLabel, yoctoToNear } from "../format";
import { viewCall } from "../near/rpc";
import { useNear } from "../near/wallet";
import { listTokens, type TokenInfo } from "../quote";
import type { Book, CopyPosition, Follow, Leader, Market, Policy, Swap, Trade } from "../types";

export function LeaderPage() {
  const { accountId: leaderId = "" } = useParams();
  const [params, setParams] = useSearchParams();
  const market: Market = params.get("market") === "Perp" ? "Perp" : "Spot";
  const { accountId, call } = useNear();
  const [leader, setLeader] = useState<Leader | null>(null);
  const [trades, setTrades] = useState<Trade[]>([]);
  const [copies, setCopies] = useState<CopyPosition[]>([]);
  const [followers, setFollowers] = useState<Follow[]>([]);
  const [mine, setMine] = useState<Follow | null>(null);
  const [policy, setPolicy] = useState<Policy | null>(null);
  const [book, setBook] = useState<Book | null>(null);
  const [swaps, setSwaps] = useState<Swap[]>([]);
  const [tokens, setTokens] = useState<TokenInfo[]>([]);
  const [selected, setSelected] = useState<Trade | null>(null);
  const [error, setError] = useState("");
  const [profit, setProfit] = useState("1");

  async function reload() {
    const [nextLeader, nextTrades, nextCopies, nextFollowers] = await Promise.all([
      viewCall<Leader | null>("get_leader", { account_id: leaderId }),
      viewCall<Trade[]>("list_trades", { leader: leaderId, market, from_index: 0, limit: 50 }),
      viewCall<CopyPosition[]>("list_copies_by_leader", { leader: leaderId, from_index: 0, limit: 20 }),
      viewCall<Follow[]>("list_market_followers", { leader: leaderId, market, from_index: 0, limit: 20 }),
    ]);
    setError("");
    setLeader(nextLeader);
    setTrades(nextTrades);
    setCopies(nextCopies);
    setFollowers(nextFollowers);
    try {
      const [nextBook, nextSwaps] = await Promise.all([
        viewCall<Book | null>("get_book", { account_id: leaderId }),
        viewCall<Swap[]>("list_swaps", { leader: leaderId, from_index: 0, limit: 50 }),
      ]);
      setBook(nextBook);
      setSwaps(nextSwaps);
    } catch {
      setBook(null);
      setSwaps([]);
    }
    if (accountId) {
      const [follow, nextPolicy] = await Promise.all([
        viewCall<Follow | null>("get_market_follow", { leader: leaderId, follower: accountId, market }),
        viewCall<Policy | null>("get_policy", { account_id: accountId }),
      ]);
      setMine(follow);
      setPolicy(nextPolicy);
    } else {
      setMine(null);
      setPolicy(null);
    }
  }

  useEffect(() => {
    let closed = false;
    reload().catch((reason: unknown) => {
      if (!closed) setError(reason instanceof Error ? reason.message : "读取失败");
    });
    return () => {
      closed = true;
    };
    // reload identity changes with leader and market
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leaderId, market, accountId]);

  useEffect(() => {
    let closed = false;
    listTokens()
      .then((rows) => {
        if (!closed) setTokens(rows);
      })
      .catch(() => {
        if (!closed) setTokens([]);
      });
    return () => {
      closed = true;
    };
  }, []);

  useEffect(() => {
    if (params.get("copy") !== "1") return;
    const viewing = accountId ? mine : followers[0] ?? null;
    if (!viewing) return;
    let closed = false;
    const line = BigInt(viewing.followed_at);
    void viewCall<Trade[]>("list_trades", { leader: leaderId, market, from_index: 0, limit: 50 })
      .then((rows) => {
        const next = rows
          .filter((trade) => trade.market === market && BigInt(trade.created_at) > line)
          .sort((a, b) => (BigInt(a.created_at) < BigInt(b.created_at) ? -1 : 1))[0];
        if (!closed && next) setSelected((current) => current ?? next);
      })
      .catch(() => undefined);
    return () => {
      closed = true;
    };
  }, [accountId, followers, leaderId, market, mine, params]);

  async function follow() {
    setError("");
    try {
      await call("follow_market", { leader: leaderId, market }, STORAGE_BUFFER.toString());
      await reload();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "跟单失败");
    }
  }

  async function act(method: "propose_settlement" | "confirm_settlement" | "reclaim_copy", args: object) {
    setError("");
    try {
      await call(method, args, "0");
      await reload();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "交易失败");
    }
  }

  if (!leader) {
    return <main className="page"><p className="empty">{error || "正在读取交易员"}</p></main>;
  }

  const live = book ? publicYield(book, swaps, tokens) : null;
  const pnl = live?.ready ? live.bps : leader.snapshot?.pnl_bps ?? 0;
  const shown = live?.ready ? bpsLabel(live.bps) : book ? "收益待算" : leader.snapshot ? bpsLabel(pnl) : "尚未公布";
  const viewingFollow = accountId ? mine : followers[0] ?? null;
  const canCopy = Boolean(mine && viewingFollow && accountId === viewingFollow.follower);
  const cutoff = viewingFollow ? BigInt(viewingFollow.followed_at) : null;
  const ordered = trades.slice().sort((a, b) => (BigInt(a.created_at) < BigInt(b.created_at) ? -1 : 1));
  const earlier = cutoff === null ? ordered : ordered.filter((trade) => BigInt(trade.created_at) <= cutoff);
  const later = cutoff === null ? [] : ordered.filter((trade) => BigInt(trade.created_at) > cutoff);

  return (
    <main className="page">
      <header className="identity">
        <div>
          <h1>{leader.display_name}</h1>
          <p>{leader.account_id}</p>
        </div>
        <div>
          <button type="button" className="button" onClick={() => void follow()} disabled={!accountId || Boolean(mine)}>
            {mine ? "已在跟" : market === "Spot" ? "跟现货" : "跟合约"}
          </button>
          <p className="trust">只跟你点下之后的新交易。</p>
          {mine && copies.filter((copy) => copy.follower === accountId && copy.market === market).length === 0 ? (
            <p className="hint">你已经跟上。还没有确认某一笔，所以没有你自己的盈亏。点下面截止线之后的「可跟」才会开仓。</p>
          ) : null}
        </div>
      </header>
      <p className="eyebrow">{book ? "公布后收益" : "公开收益"}</p>
      <p className={`return num ${live?.ready || (!book && leader.snapshot) ? (pnl >= 0 ? "up" : "down") : ""}`}>
        {shown}
      </p>
      <Sparkline points={live?.ready ? live.curve : leader.snapshot?.curve ?? []} width={280} height={64} positive={pnl >= 0} />
      <p className="trust">
        {book
          ? `从冻结本金那一刻算起，按 Intents 现价估算。${live?.note ? `${live.note} ` : ""}跟单从你点下之后的新交易开始。`
          : "任何人都能看到这条收益率。跟单从你点下之后的新交易开始。查看权只包含成交明细。"}
      </p>
      <BookPanel leaderId={leaderId} book={book} swaps={swaps} onChanged={reload} />
      <dl className="meta">
        <div><dt>跟单人数</dt><dd><strong className="num">{leader.copier_count}</strong></dd></div>
        <div><dt>抽成</dt><dd><strong className="num">{(leader.fee_bps / 100).toFixed(2)}%</strong></dd></div>
        {book ? (
          <div><dt>公布后操作</dt><dd><strong className="num">{swaps.length}</strong></dd></div>
        ) : (
          <div><dt>胜率</dt><dd><strong className="num">{leader.snapshot ? `${(leader.snapshot.win_rate_bps / 100).toFixed(2)}%` : "—"}</strong></dd></div>
        )}
        {book ? (
          <div><dt>冻结资产</dt><dd><strong className="num">{book.holdings.length}</strong></dd></div>
        ) : (
          <div><dt>最大回撤</dt><dd><strong className="num">{leader.snapshot ? `${(leader.snapshot.max_dd_bps / 100).toFixed(2)}%` : "—"}</strong></dd></div>
        )}
      </dl>
      <HoldingsPanel leaderId={leaderId} />
      <JournalPanel leaderId={leaderId} accountId={accountId} isLeader={accountId === leaderId} call={call} />
      <section className="workspace">
        <header>
          <h2>操作记录</h2>
          <div className="switch">
            {(["Spot", "Perp"] as Market[]).map((item) => (
              <button key={item} type="button" className={market === item ? "on" : ""} onClick={() => setParams({ market: item })}>
                {item === "Spot" ? "现货" : "合约"}
              </button>
            ))}
          </div>
        </header>
        {error ? <p className="error" style={{ padding: "12px 20px" }}>{error}</p> : null}
        <table>
          <thead>
            <tr>
              <th>时间</th>
              <th>市场</th>
              <th>方向</th>
              <th>标的</th>
              <th className="right">数量</th>
              <th>状态</th>
            </tr>
          </thead>
          <tbody>
            {ordered.length === 0 ? (
              <tr><td colSpan={6}>这个市场还没有交易。</td></tr>
            ) : null}
            {earlier.map((trade) => (
              <tr key={trade.id}>
                <td>{nsToDate(trade.created_at).toLocaleString()}</td>
                <td>{marketLabel(trade.market)}</td>
                <td>{sideLabel(trade.side)}</td>
                <td><span className="asset"><TokenMark asset={trade.asset} />{trade.asset}</span></td>
                <td className="right num">{trade.amount}</td>
                <td>{cutoff === null ? "只可看" : "开跟前"}</td>
              </tr>
            ))}
            {cutoff !== null ? (
              <tr className="cutoff">
                <td colSpan={6}><span className="dot" />{viewingFollow!.follower} 从这里开始跟{market === "Spot" ? "现货" : "合约"} · {nsToDate(viewingFollow!.followed_at).toLocaleString()}</td>
              </tr>
            ) : null}
            {later.map((trade) => (
              <tr key={trade.id}>
                <td>{nsToDate(trade.created_at).toLocaleString()}</td>
                <td>{marketLabel(trade.market)}</td>
                <td>{sideLabel(trade.side)}</td>
                <td><span className="asset"><TokenMark asset={trade.asset} />{trade.asset}</span></td>
                <td className="right num">{trade.amount}</td>
                <td>
                  {canCopy ? (
                    <button type="button" className="linkish" onClick={() => setSelected(trade)}>
                      <span className="dot" />可跟
                    </button>
                  ) : (
                    <span><span className="dot" />可跟</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      <section className="panel">
        <h2>已开的跟单</h2>
        {copies.filter((copy) => copy.market === market).length === 0 ? <p className="empty">这个市场还没有跟单记录。</p> : null}
        {copies.filter((copy) => copy.market === market).map((copy) => (
          <p key={copy.id}>
            #{copy.id} {marketLabel(copy.market)} · {copyStatus(copy.status)} · 已抽成 <span className="num">{yoctoToNear(copy.fee_paid)} NEAR</span>
            <span className="hint"> · {copy.follower}</span>
            {accountId === copy.follower && (copy.status === "Open" || copy.status === "Proposed") ? (
              <span className="row">
                <input value={profit} onChange={(event) => setProfit(event.target.value)} aria-label="盈利 NEAR" placeholder="盈利 NEAR" />
                <span className="hint">不超过以往高水位时，托管直接退回。</span>
                <button type="button" className="ghost" onClick={() => void act("propose_settlement", { copy_id: Number(copy.id), profit: nearToYocto(profit) })}>申报盈利</button>
                <button type="button" className="ghost" onClick={() => void act("reclaim_copy", { copy_id: Number(copy.id) })}>取回托管</button>
              </span>
            ) : null}
            {accountId === leaderId && copy.status === "Proposed" ? (
              <button type="button" className="button" onClick={() => void act("confirm_settlement", { copy_id: Number(copy.id) })}>确认抽成</button>
            ) : null}
          </p>
        ))}
      </section>
      <section className="panel">
        <h2>跟随者</h2>
        {followers.length === 0 ? <p className="empty">还没有跟随者。</p> : null}
        {followers.map((follower) => (
          <p key={follower.follower}>{follower.follower} · {nsToDate(follower.followed_at).toLocaleString()}</p>
        ))}
      </section>
      <CopyDrawer
        open={selected !== null}
        leader={leaderId}
        trade={selected}
        feeBps={leader.fee_bps}
        policy={policy}
        onClose={() => setSelected(null)}
        onChanged={reload}
      />
    </main>
  );
}
