import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { publicYield, type PublicYield } from "../book";
import { LeaderSheet } from "../components/LeaderSheet";
import { TokenMark } from "../components/TokenMark";
import { Sparkline } from "../components/Sparkline";
import { bpsLabel, shortAccount, withinDays } from "../format";
import { viewCall } from "../near/rpc";
import { useNear } from "../near/wallet";
import { listTokens } from "../quote";
import type { Book, CopyPosition, Leader, Market, Swap, Trade } from "../types";

type FilterKey = "all" | "drawdown" | "win" | "copiers";

export function Board() {
  const { accountId } = useNear();
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
        if (!closed) setError(reason instanceof Error ? reason.message : "读取失败");
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
          <h1>{market === "Spot" ? "现货跟单" : "合约跟单"}</h1>
          <p className="lede">收益率公开，用来决定跟谁。查看权只卖成交明细。</p>
        </div>
        <dl className="pod" aria-label="我的跟单资产舱">
          <div><dt>跟单总权益</dt><dd className="num">—</dd></div>
          <div><dt>今日未实现盈亏</dt><dd className="num">—</dd></div>
          <div><dt>当前活跃跟单</dt><dd className="num">{activeCopies === null ? "—" : activeCopies}</dd></div>
          <div className="pod-actions">
            <Link className="ghost" to="/mine">我的跟单</Link>
            <button type="button" className="button" onClick={() => setSheet(true)}>成为带单员</button>
          </div>
        </dl>
      </header>
      <div className="controls">
        <div className="segment" role="tablist">
          {([
            ["all", "全部交易员"],
            ["drawdown", "低回撤"],
            ["win", "高胜率"],
            ["copiers", "跟单人数"],
          ] as Array<[FilterKey, string]>).map(([key, label]) => (
            <button key={key} type="button" className={filter === key ? "on" : ""} onClick={() => setFilter(key)}>{label}</button>
          ))}
        </div>
        <div className="segment">
          {([7, 30, 90] as const).map((value) => (
            <button key={value} type="button" className={days === value ? "on" : ""} onClick={() => setDays(value)}>{value}D</button>
          ))}
          <button type="button" className={market === "Spot" ? "on" : ""} onClick={() => setParams({ market: "Spot" })}>现货</button>
          <button type="button" className={market === "Perp" ? "on" : ""} onClick={() => setParams({ market: "Perp" })}>合约</button>
        </div>
        <form className="search" onSubmit={(event) => event.preventDefault()}>
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索交易员" aria-label="搜索交易员" />
          <button type="submit" className="go" aria-label="搜索">→</button>
        </form>
      </div>
      {error ? <p className="error">{error}</p> : null}
      {visible.length === 0 ? <p className="empty">这个范围内还没有交易员。</p> : null}
      <section className="cards">
        {visible.map((leader) => {
          const live = yields[leader.account_id];
          const frozen = Boolean(marks[leader.account_id]);
          const pnl = live?.ready ? live.bps : leader.snapshot?.pnl_bps ?? 0;
          const positive = pnl >= 0;
          const names = assets[leader.account_id] ?? [];
          const label = live?.ready ? bpsLabel(live.bps) : frozen ? "收益待算" : leader.snapshot ? bpsLabel(pnl) : "尚未公布";
          return (
            <article className="card" key={leader.account_id}>
              <header className="who">
                <div>
                  <strong>{leader.display_name}</strong>
                  <p>{shortAccount(leader.account_id)}</p>
                  <div className="tags">
                    <span className="tag">{market === "Spot" ? "现货" : "合约"}</span>
                    <span className="tag">{live?.ready ? "公布后" : frozen ? "本金已冻结" : leader.snapshot ? "收益公开" : "尚未公布"}</span>
                    <span className="tag">跟单 {leader.copier_count}</span>
                  </div>
                </div>
                <span className="num sub">{leader.copier_count}</span>
              </header>
              <div className="roi">
                <div>
                  <span>{live?.ready ? "公布后收益" : "公开收益率"}</span>
                  <strong className={`num ${live?.ready || (!frozen && leader.snapshot) ? (positive ? "up" : "down") : ""}`}>
                    {label}
                  </strong>
                  <em className="num">{live?.ready ? "按冻结后的操作估算" : `跟单盈亏 ${leader.snapshot ? bpsLabel(leader.snapshot.copier_pnl_bps) : "—"}`}</em>
                </div>
                <Sparkline points={live?.ready ? live.curve : leader.snapshot?.curve ?? []} positive={positive} />
              </div>
              <dl className="metrics">
                <div><dt>最大回撤</dt><dd className="num">{leader.snapshot ? `${(leader.snapshot.max_dd_bps / 100).toFixed(2)}%` : "—"}</dd></div>
                <div><dt>胜率</dt><dd className="num">{leader.snapshot ? `${(leader.snapshot.win_rate_bps / 100).toFixed(2)}%` : "—"}</dd></div>
                <div><dt>抽成</dt><dd className="num">{(leader.fee_bps / 100).toFixed(2)}%</dd></div>
                <div><dt>跟单人数</dt><dd className="num">{leader.copier_count}</dd></div>
              </dl>
              <div className="tokens">
                {names.length === 0 ? <span className="token">还没有公开标的</span> : names.map((name) => <span className="token" key={name}><TokenMark asset={name} />{name}</span>)}
              </div>
              <footer className="actions">
                <Link className="ghost" to={`/leader/${leader.account_id}?market=${market}`}>查看记录</Link>
                <Link className="button" to={`/leader/${leader.account_id}?market=${market}&copy=1`}>立即跟单</Link>
              </footer>
            </article>
          );
        })}
      </section>
      {sheet ? <LeaderSheet onClose={() => setSheet(false)} /> : null}
    </main>
  );
}
