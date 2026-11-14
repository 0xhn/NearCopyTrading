import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { bpsLabel, copyStatus, formatDate, marketLabel, yoctoToNear } from "../format";
import { getLang, useI18n } from "../i18n";
import { viewCall } from "../near/rpc";
import { useNear } from "../near/wallet";
import type { CopyPosition, Follow, Leader, Market } from "../types";

interface Followed {
  leader: Leader;
  market: Market;
  followedAt: string;
  later: number;
}

export function MinePage() {
  const { accountId, signIn } = useNear();
  const { lang, t } = useI18n();
  const [follows, setFollows] = useState<Followed[]>([]);
  const [copies, setCopies] = useState<CopyPosition[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!accountId) return;
    let closed = false;
    void (async () => {
      try {
        const [leaders, mine] = await Promise.all([
          viewCall<Leader[]>("list_leaders", { from_index: 0, limit: 50 }),
          viewCall<CopyPosition[]>("list_copies_by_follower", { follower: accountId, from_index: 0, limit: 50 }),
        ]);
        const rows = await Promise.all(leaders.flatMap((leader) => (["Spot", "Perp"] as Market[]).map(async (market) => {
          const follow = await viewCall<Follow | null>("get_market_follow", {
            leader: leader.account_id,
            follower: accountId,
            market,
          });
          if (!follow) return null;
          const trades = await viewCall<Array<{ created_at: string }>>("list_trades", {
            leader: leader.account_id,
            market,
            from_index: 0,
            limit: 50,
          });
          const later = trades.filter((trade) => BigInt(trade.created_at) > BigInt(follow.followed_at)).length;
          return { leader, market, followedAt: follow.followed_at, later };
        })));
        if (closed) return;
        setError("");
        setCopies(mine);
        setFollows(rows.filter((row): row is Followed => row !== null));
      } catch (reason) {
        if (!closed) setError(reason instanceof Error ? reason.message : (getLang() === "en" ? "Failed to load" : "读取失败"));
      }
    })();
    return () => {
      closed = true;
    };
  }, [accountId]);

  return (
    <main className="page">
      <h1>{t("我的跟单", "My Copies")}</h1>
      <p className="lede">
        {t(
          "跟上只记下截止时间。你自己的盈亏从确认某一笔之后才开始算。带单员公布的收益率不是你的账户结果。",
          "Following only records a cutoff timestamp. Your own PnL starts after you confirm a copy trade. A leader's public ROI is not your account result.",
        )}
      </p>
      {!accountId ? <button type="button" className="button" onClick={signIn}>{t("连接钱包", "Connect Wallet")}</button> : null}
      {error ? <p className="error">{error}</p> : null}
      {accountId && follows.length === 0 && copies.length === 0 ? <p className="empty">{t("还没有跟上任何人。", "You are not following anyone yet.")}</p> : null}
      {follows.length > 0 ? (
        <section className="cards">
          {follows.map((row) => {
            const pnl = row.leader.snapshot?.pnl_bps;
            return (
              <article className="card" key={`${row.leader.account_id}-${row.market}`}>
                <header className="who">
                  <div>
                    <strong>{row.leader.display_name}</strong>
                    <p>
                      {marketLabel(row.market, lang)} · {lang === "en" ? `Since ${formatDate(row.followedAt, lang)}` : `${formatDate(row.followedAt, lang)} 起`}
                    </p>
                  </div>
                </header>
                <div className="roi">
                  <div>
                    <span>{t("带单员公开收益率", "Leader Public ROI")}</span>
                    <strong className={`num ${pnl === undefined ? "" : pnl >= 0 ? "up" : "down"}`}>
                      {pnl === undefined ? t("尚未公布", "Unpublished") : bpsLabel(pnl)}
                    </strong>
                    <em>
                      {row.later > 0
                        ? (lang === "en" ? `${row.later} trade(s) available after cutoff` : `截止后有 ${row.later} 笔可以确认`)
                        : t("截止后还没有新交易", "No new trades after cutoff yet")}
                    </em>
                  </div>
                </div>
                {copies.some((copy) => copy.leader === row.leader.account_id && copy.market === row.market) ? null : (
                  <p className="hint">
                    {t(
                      "这个市场还没有你确认过的跟单，所以没有你自己的盈亏。",
                      "You have not confirmed any copy trade in this market yet, so there is no personal PnL.",
                    )}
                  </p>
                )}
                <footer className="actions">
                  <Link className="button" to={`/leader/${row.leader.account_id}?market=${row.market}`}>
                    {row.later > 0 ? t("去确认一笔", "Confirm a Trade") : t("查看记录", "View Ledger")}
                  </Link>
                </footer>
              </article>
            );
          })}
        </section>
      ) : null}
      {copies.length > 0 ? (
        <section className="workspace">
          <header><h2>{t("我确认过的跟单", "My Confirmed Copies")}</h2></header>
          <table>
            <thead>
              <tr>
                <th>{t("编号", "ID")}</th>
                <th>{t("带单员", "Leader")}</th>
                <th>{t("市场", "Market")}</th>
                <th>{t("状态", "Status")}</th>
                <th className="right">{t("申报盈利", "Proposed Profit")}</th>
                <th className="right">{t("已抽成 NEAR", "Fee Paid NEAR")}</th>
              </tr>
            </thead>
            <tbody>
              {copies.map((copy) => (
                <tr key={copy.id}>
                  <td className="num">#{copy.id}</td>
                  <td><Link to={`/leader/${copy.leader}`}>{copy.leader}</Link></td>
                  <td>{marketLabel(copy.market, lang)}</td>
                  <td>{copyStatus(copy.status, lang)}</td>
                  <td className="right num">{copy.proposed_profit ? `${yoctoToNear(copy.proposed_profit)} NEAR` : "—"}</td>
                  <td className="right num">{yoctoToNear(copy.fee_paid)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ) : null}
    </main>
  );
}
