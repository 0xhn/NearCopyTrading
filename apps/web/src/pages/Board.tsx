import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { publicYield, type PublicYield } from "../book";
import { LeaderSheet } from "../components/LeaderSheet";
import { TokenMark } from "../components/TokenMark";
import { Sparkline } from "../components/Sparkline";
import { bpsLabel, shortAccount, withinDays } from "../format";
import { getLang, useI18n } from "../i18n";
import { viewCall } from "../near/rpc";
import { useNear } from "../near/wallet";
import { listTokens } from "../quote";
import type { Book, CopyPosition, Leader, Market, Swap, Trade } from "../types";

type FilterKey = "all" | "drawdown" | "win" | "copiers";

export function Board() {
  const { accountId } = useNear();
  const { lang, t } = useI18n();
  const [params, setParams] = useSearchParams();
  const market: Market = params.get("market") === "Perp" ? "Perp" : "Spot";
  const [leaders, setLeaders] = useState<Leader[]>([]);
  const [assets, setAssets] = useState<Record<string, string[]>>({});
  const [yields, setYields] = useState<Record<string, PublicYield>>({});
  const [marks, setMarks] = useState<Record<string, string>>({});
  const [activeCopies, setActiveCopies] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [days, setDays] = useState(30);
  const [filter, setFilter] = useState<FilterKey>("all");
  const [sheet, setSheet] = useState(false);

  useEffect(() => {
    let closed = false;
    viewCall<Leader[]>("list_leaders", { from_index: 0, limit: 50 })
      .then(async (rows) => {
        if (closed) return;
        setError("");
        setLeaders(rows);
        const pairs = await Promise.all(rows.map(async (leader) => {
          const trades = await viewCall<Trade[]>("list_trades", { leader: leader.account_id, market, from_index: 0, limit: 50 });
          const names = [...new Set(trades.map((trade) => trade.asset))].slice(0, 4);
          return [leader.account_id, names] as const;
        }));
        if (!closed) setAssets(Object.fromEntries(pairs));
        const tokens = await listTokens().catch(() => []);
        const books = await Promise.all(rows.map(async (leader) => {
          try {
            const nextBook = await viewCall<Book | null>("get_book", { account_id: leader.account_id });
            if (!nextBook) return null;
            const nextSwaps = await viewCall<Swap[]>("list_swaps", { leader: leader.account_id, from_index: 0, limit: 50 });
            return [leader.account_id, nextBook, publicYield(nextBook, nextSwaps, tokens)] as const;
          } catch {
            return null;
          }
        }));
        if (!closed) {
          const ready = books.filter((item): item is readonly [string, Book, PublicYield] => item !== null);
          setYields(Object.fromEntries(ready.map((item) => [item[0], item[2]])));
          setMarks(Object.fromEntries(ready.map((item) => [item[0], item[1].marked_at])));
        }
      })
      .catch((reason: unknown) => {
        if (!closed) setError(reason instanceof Error ? reason.message : (getLang() === "en" ? "Failed to load" : "读取失败"));
      });
    return () => {
      closed = true;
    };
  }, [market]);

  useEffect(() => {
    if (!accountId) {
      setActiveCopies(null);
      return;
    }
    let closed = false;
    viewCall<CopyPosition[]>("list_copies_by_follower", { follower: accountId, from_index: 0, limit: 50 })
      .then((rows) => {
        if (!closed) {
          setActiveCopies(rows.filter((copy) => copy.market === market && (copy.status === "Open" || copy.status === "Proposed")).length);
        }
      })
      .catch(() => {
        if (!closed) setActiveCopies(null);
      });
    return () => {
      closed = true;
    };
  }, [accountId, market]);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return leaders
      .filter((leader) => !needle || leader.display_name.toLowerCase().includes(needle) || leader.account_id.includes(needle))
      .filter((leader) => {
        const at = marks[leader.account_id] ?? leader.snapshot?.updated_at;
        return !at || withinDays(at, days);
      })
      .slice()
      .sort((a, b) => {
        if (filter === "copiers") return b.copier_count - a.copier_count;
        const pick = (leader: Leader) => {
          const live = yields[leader.account_id];
          if (live?.ready && filter === "all") return live.bps;
          if (!leader.snapshot) return live?.ready ? live.bps : Number.NEGATIVE_INFINITY;
          if (filter === "drawdown") return -leader.snapshot.max_dd_bps;
          if (filter === "win") return leader.snapshot.win_rate_bps;
          return live?.ready ? live.bps : leader.snapshot.pnl_bps;
        };
        return pick(b) - pick(a);
      });
  }, [days, filter, leaders, marks, query, yields]);

  return (
    <main className="page">
      <header className="hero">
        <div>
          <h1>{market === "Spot" ? t("现货跟单", "Spot Copy") : t("合约跟单", "Perp Copy")}</h1>
          <p className="lede">{t("收益率公开，用来决定跟谁。查看权只卖成交明细。", "Returns are public so you can choose whom to follow. Viewing keys only sell trade details.")}</p>
        </div>
        <dl className="pod" aria-label={t("我的跟单资产舱", "My copy portfolio")}>
          <div><dt>{t("跟单总权益", "Total Copy Equity")}</dt><dd className="num">—</dd></div>
          <div><dt>{t("今日未实现盈亏", "Today's Unrealized PnL")}</dt><dd className="num">—</dd></div>
          <div><dt>{t("当前活跃跟单", "Active Copies")}</dt><dd className="num">{activeCopies === null ? "—" : activeCopies}</dd></div>
          <div className="pod-actions">
            <Link className="ghost" to="/mine">{t("我的跟单", "My Copies")}</Link>
            <button type="button" className="button" onClick={() => setSheet(true)}>{t("成为带单员", "Become a Leader")}</button>
          </div>
        </dl>
      </header>
      <div className="controls">
        <div className="segment" role="tablist">
          {([
            ["all", t("全部交易员", "All Leaders")],
            ["drawdown", t("低回撤", "Low Drawdown")],
            ["win", t("高胜率", "High Win Rate")],
            ["copiers", t("跟单人数", "Most Copiers")],
          ] as Array<[FilterKey, string]>).map(([key, label]) => (
            <button key={key} type="button" className={filter === key ? "on" : ""} onClick={() => setFilter(key)}>{label}</button>
          ))}
        </div>
        <div className="segment">
          {([7, 30, 90] as const).map((value) => (
            <button key={value} type="button" className={days === value ? "on" : ""} onClick={() => setDays(value)}>{value}D</button>
          ))}
          <button type="button" className={market === "Spot" ? "on" : ""} onClick={() => setParams({ market: "Spot" })}>{t("现货", "Spot")}</button>
          <button type="button" className={market === "Perp" ? "on" : ""} onClick={() => setParams({ market: "Perp" })}>{t("合约", "Perp")}</button>
        </div>
        <form className="search" onSubmit={(event) => event.preventDefault()}>
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t("搜索交易员", "Search leaders")} aria-label={t("搜索交易员", "Search leaders")} />
          <button type="submit" className="go" aria-label={t("搜索", "Search")}>→</button>
        </form>
      </div>
      {error ? <p className="error">{error}</p> : null}
      {visible.length === 0 ? <p className="empty">{t("这个范围内还没有交易员。", "No leaders in this range yet.")}</p> : null}
      <section className="cards">
        {visible.map((leader) => {
          const live = yields[leader.account_id];
          const frozen = Boolean(marks[leader.account_id]);
          const pnl = live?.ready ? live.bps : leader.snapshot?.pnl_bps ?? 0;
          const positive = pnl >= 0;
          const names = assets[leader.account_id] ?? [];
          const label = live?.ready
            ? bpsLabel(live.bps)
            : frozen
              ? t("收益待算", "Pending")
              : leader.snapshot
                ? bpsLabel(pnl)
                : t("尚未公布", "Unpublished");
          return (
            <article className="card" key={leader.account_id}>
              <header className="who">
                <div>
                  <strong>{leader.display_name}</strong>
                  <p>{shortAccount(leader.account_id)}</p>
                  <div className="tags">
                    <span className="tag">{market === "Spot" ? t("现货", "Spot") : t("合约", "Perp")}</span>
                    <span className="tag">
                      {live?.ready
                        ? t("公布后", "Post-freeze")
                        : frozen
                          ? t("本金已冻结", "Principal Frozen")
                          : leader.snapshot
                            ? t("收益公开", "Public ROI")
                            : t("尚未公布", "Unpublished")}
                    </span>
                    <span className="tag">{lang === "en" ? `Copiers ${leader.copier_count}` : `跟单 ${leader.copier_count}`}</span>
                  </div>
                </div>
                <span className="num sub">{leader.copier_count}</span>
              </header>
              <div className="roi">
                <div>
                  <span>{live?.ready ? t("公布后收益", "Post-freeze Return") : t("公开收益率", "Public ROI")}</span>
                  <strong className={`num ${live?.ready || (!frozen && leader.snapshot) ? (positive ? "up" : "down") : ""}`}>
                    {label}
                  </strong>
                  <em className="num">
                    {live?.ready
                      ? t("按冻结后的操作估算", "Estimated from post-freeze swaps")
                      : `${t("跟单盈亏", "Copier PnL")} ${leader.snapshot ? bpsLabel(leader.snapshot.copier_pnl_bps) : "—"}`}
                  </em>
                </div>
                <Sparkline points={live?.ready ? live.curve : leader.snapshot?.curve ?? []} positive={positive} />
              </div>
              <dl className="metrics">
                <div><dt>{t("最大回撤", "Max Drawdown")}</dt><dd className="num">{leader.snapshot ? `${(leader.snapshot.max_dd_bps / 100).toFixed(2)}%` : "—"}</dd></div>
                <div><dt>{t("胜率", "Win Rate")}</dt><dd className="num">{leader.snapshot ? `${(leader.snapshot.win_rate_bps / 100).toFixed(2)}%` : "—"}</dd></div>
                <div><dt>{t("抽成", "Fee")}</dt><dd className="num">{(leader.fee_bps / 100).toFixed(2)}%</dd></div>
                <div><dt>{t("跟单人数", "Copiers")}</dt><dd className="num">{leader.copier_count}</dd></div>
              </dl>
              <div className="tokens">
                {names.length === 0 ? <span className="token">{t("还没有公开标的", "No public assets yet")}</span> : names.map((name) => <span className="token" key={name}><TokenMark asset={name} />{name}</span>)}
              </div>
              <footer className="actions">
                <Link className="ghost" to={`/leader/${leader.account_id}?market=${market}`}>{t("查看记录", "View Ledger")}</Link>
                <Link className="button" to={`/leader/${leader.account_id}?market=${market}&copy=1`}>{t("立即跟单", "Copy Now")}</Link>
              </footer>
            </article>
          );
        })}
      </section>
      {sheet ? <LeaderSheet onClose={() => setSheet(false)} /> : null}
    </main>
  );
}
