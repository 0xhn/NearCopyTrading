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
import { bpsLabel, copyStatus, formatDate, marketLabel, nearToYocto, sideLabel, yoctoToNear } from "../format";
import { useI18n } from "../i18n";
import { viewCall } from "../near/rpc";
import { useNear } from "../near/wallet";
import { listTokens, type TokenInfo } from "../quote";
import type { Book, CopyPosition, Follow, Leader, Market, Policy, Swap, Trade } from "../types";

export function LeaderPage() {
  const { accountId: leaderId = "" } = useParams();
  const { lang, t } = useI18n();
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
      if (!closed) setError(reason instanceof Error ? reason.message : t("读取失败", "Failed to load"));
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
      setError(reason instanceof Error ? reason.message : t("跟单失败", "Failed to follow"));
    }
  }

  async function act(
    method: "propose_settlement" | "confirm_settlement" | "reclaim_copy",
    args: object,
    deposit: string,
  ) {
    setError("");
    try {
      await call(method, args, deposit);
      await reload();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t("交易失败", "Transaction failed"));
    }
  }

  if (!leader) {
    return <main className="page"><p className="empty">{error || t("正在读取交易员", "Loading leader...")}</p></main>;
  }

  const live = book ? publicYield(book, swaps, tokens, lang) : null;
  const pnl = live?.ready ? live.bps : leader.snapshot?.pnl_bps ?? 0;
  const shown = live?.ready
    ? bpsLabel(live.bps)
    : book
      ? t("收益待算", "Pending")
      : leader.snapshot
        ? bpsLabel(pnl)
        : t("尚未公布", "Unpublished");
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
            {mine
              ? t("已在跟", "Following")
              : market === "Spot"
                ? t("跟现货", "Follow Spot")
                : t("跟合约", "Follow Perp")}
          </button>
          <p className="trust">{t("只跟你点下之后的新交易。", "Only applies to new trades published after you follow.")}</p>
          {mine && copies.filter((copy) => copy.follower === accountId && copy.market === market).length === 0 ? (
            <p className="hint">
              {t(
                "你已经跟上。还没有确认某一笔，所以没有你自己的盈亏。点下面截止线之后的「可跟」才会开仓。",
                "You are following this market. No copy position has been opened yet, so you have no personal PnL. Click \"Copyable\" below the cutoff line to open one.",
              )}
            </p>
          ) : null}
        </div>
      </header>
      <p className="eyebrow">{book ? t("公布后收益", "Post-freeze Return") : t("公开收益", "Public Return")}</p>
      <p className={`return num ${live?.ready || (!book && leader.snapshot) ? (pnl >= 0 ? "up" : "down") : ""}`}>
        {shown}
      </p>
      <Sparkline points={live?.ready ? live.curve : leader.snapshot?.curve ?? []} width={280} height={64} positive={pnl >= 0} />
      <p className="trust">
        {book
          ? t(
            `从冻结本金那一刻算起，按 Intents 现价估算。${live?.note ? `${live.note} ` : ""}跟单从你点下之后的新交易开始。`,
            `Measured from the moment principal was frozen, valued at current Intents prices. ${live?.note ? `${live.note} ` : ""}Copying starts with new trades after you follow.`,
          )
          : t(
            "任何人都能看到这条收益率。跟单从你点下之后的新交易开始。查看权只包含成交明细。",
            "Anyone can see this return. Copying starts with new trades after you follow. Viewing keys only unlock trade details.",
          )}
      </p>
      <BookPanel leaderId={leaderId} book={book} swaps={swaps} onChanged={reload} />
      <dl className="meta">
        <div><dt>{t("跟单人数", "Copiers")}</dt><dd><strong className="num">{leader.copier_count}</strong></dd></div>
        <div><dt>{t("抽成", "Fee")}</dt><dd><strong className="num">{(leader.fee_bps / 100).toFixed(2)}%</strong></dd></div>
        {book ? (
          <div><dt>{t("公布后操作", "Post-freeze Swaps")}</dt><dd><strong className="num">{swaps.length}</strong></dd></div>
        ) : (
          <div><dt>{t("胜率", "Win Rate")}</dt><dd><strong className="num">{leader.snapshot ? `${(leader.snapshot.win_rate_bps / 100).toFixed(2)}%` : "—"}</strong></dd></div>
        )}
        {book ? (
          <div><dt>{t("冻结资产", "Frozen Assets")}</dt><dd><strong className="num">{book.holdings.length}</strong></dd></div>
        ) : (
          <div><dt>{t("最大回撤", "Max Drawdown")}</dt><dd><strong className="num">{leader.snapshot ? `${(leader.snapshot.max_dd_bps / 100).toFixed(2)}%` : "—"}</strong></dd></div>
        )}
      </dl>
      <HoldingsPanel leaderId={leaderId} />
      <JournalPanel leaderId={leaderId} accountId={accountId} isLeader={accountId === leaderId} call={call} />
      <section className="workspace">
        <header>
          <h2>{t("操作记录", "Trade Ledger")}</h2>
          <div className="switch">
            {(["Spot", "Perp"] as Market[]).map((item) => (
              <button key={item} type="button" className={market === item ? "on" : ""} onClick={() => setParams({ market: item })}>
                {marketLabel(item, lang)}
              </button>
            ))}
          </div>
        </header>
        {error ? <p className="error" style={{ padding: "12px 20px" }}>{error}</p> : null}
        <table>
          <thead>
            <tr>
              <th>{t("时间", "Time")}</th>
              <th>{t("市场", "Market")}</th>
              <th>{t("方向", "Side")}</th>
              <th>{t("标的", "Asset")}</th>
              <th className="right">{t("数量", "Amount")}</th>
              <th>{t("状态", "Status")}</th>
            </tr>
          </thead>
          <tbody>
            {ordered.length === 0 ? (
              <tr><td colSpan={6}>{t("这个市场还没有交易。", "No trades in this market yet.")}</td></tr>
            ) : null}
            {earlier.map((trade) => (
              <tr key={trade.id}>
                <td>{formatDate(trade.created_at, lang)}</td>
                <td>{marketLabel(trade.market, lang)}</td>
                <td>{sideLabel(trade.side, lang)}</td>
                <td><span className="asset"><TokenMark asset={trade.asset} />{trade.asset}</span></td>
                <td className="right num">{trade.amount}</td>
                <td>{cutoff === null ? t("只可看", "View only") : t("开跟前", "Before follow")}</td>
              </tr>
            ))}
            {cutoff !== null ? (
              <tr className="cutoff">
                <td colSpan={6}>
                  <span className="dot" />
                  {lang === "en"
                    ? `${viewingFollow!.follower} started following ${marketLabel(market, lang)} here · ${formatDate(viewingFollow!.followed_at, lang)}`
                    : `${viewingFollow!.follower} 从这里开始跟${marketLabel(market, lang)} · ${formatDate(viewingFollow!.followed_at, lang)}`}
                </td>
              </tr>
            ) : null}
            {later.map((trade) => (
              <tr key={trade.id}>
                <td>{formatDate(trade.created_at, lang)}</td>
                <td>{marketLabel(trade.market, lang)}</td>
                <td>{sideLabel(trade.side, lang)}</td>
                <td><span className="asset"><TokenMark asset={trade.asset} />{trade.asset}</span></td>
                <td className="right num">{trade.amount}</td>
                <td>
                  {canCopy ? (
                    <button type="button" className="linkish" onClick={() => setSelected(trade)}>
                      <span className="dot" />{t("可跟", "Copyable")}
                    </button>
                  ) : (
                    <span><span className="dot" />{t("可跟", "Copyable")}</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      <section className="panel">
        <h2>{t("已开的跟单", "Opened Copies")}</h2>
        {copies.filter((copy) => copy.market === market).length === 0 ? <p className="empty">{t("这个市场还没有跟单记录。", "No copy positions in this market yet.")}</p> : null}
        {copies.filter((copy) => copy.market === market).map((copy) => (
          <p key={copy.id}>
            #{copy.id} {marketLabel(copy.market, lang)} · {copyStatus(copy.status, lang)} · {t("已抽成", "Fee paid")} <span className="num">{yoctoToNear(copy.fee_paid)} NEAR</span>
            <span className="hint"> · {copy.follower}</span>
            {accountId === copy.follower && (copy.status === "Open" || copy.status === "Proposed") ? (
              <span className="row">
                <input value={profit} onChange={(event) => setProfit(event.target.value)} aria-label={t("盈利 NEAR", "Profit NEAR")} placeholder={t("盈利 NEAR", "Profit NEAR")} />
                <span className="hint">
                  {t(
                    "不超过以往高水位时托管退回，水位不动。抽成超过这笔托管会被拒绝。",
                    "If profit does not exceed your high water, escrow is refunded and high water stays unchanged. Rejected if the fee exceeds this copy's escrow.",
                  )}
                </span>
                <button type="button" className="ghost" onClick={() => void act("propose_settlement", { copy_id: Number(copy.id), profit: nearToYocto(profit, lang) }, STORAGE_BUFFER.toString())}>{t("申报盈利", "Propose Profit")}</button>
                <button type="button" className="ghost" onClick={() => void act("reclaim_copy", { copy_id: Number(copy.id) }, "1")}>{t("取回托管", "Reclaim Escrow")}</button>
              </span>
            ) : null}
            {accountId === leaderId && copy.status === "Proposed" && copy.proposed_profit ? (
              <button type="button" className="button" onClick={() => void act("confirm_settlement", { copy_id: Number(copy.id), profit: copy.proposed_profit }, STORAGE_BUFFER.toString())}>
                {t("确认抽成", "Confirm Fee")} {yoctoToNear(copy.proposed_profit)}
              </button>
            ) : null}
          </p>
        ))}
      </section>
      <section className="panel">
        <h2>{t("跟随者", "Followers")}</h2>
        {followers.length === 0 ? <p className="empty">{t("还没有跟随者。", "No followers yet.")}</p> : null}
        {followers.map((follower) => (
          <p key={follower.follower}>{follower.follower} · {formatDate(follower.followed_at, lang)}</p>
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
