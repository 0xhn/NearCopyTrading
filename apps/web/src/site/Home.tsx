import { Link } from "react-router-dom";
import { useI18n } from "../i18n";

export function Home() {
  const { t } = useI18n();
  const cards = [
    {
      title: t("公开收益率", "Public Returns"),
      text: t("先看收益、回撤和胜率，再决定跟谁。现货和合约分开两张榜。", "Review ROI, drawdown, and win rate before deciding whom to follow. Spot and Perp have separate boards."),
      to: "/docs/overview#public",
    },
    {
      title: t("查看权", "Viewing Keys"),
      text: t("成交明细单独出售。钥匙留在买家自己的浏览器里，不能动账户资产。", "Trade details are sold separately. Keys stay in the buyer's browser and cannot move account funds."),
      to: "/docs/overview#public",
    },
    {
      title: t("赚到才抽成", "Pay Only on Profit"),
      text: t("跟单盈利高出以往水位，带单员才按约定比例从托管里抽取。", "Leaders only draw their agreed fee share from escrow when copy profit exceeds the high-water mark."),
      to: "/docs/overview#follower",
    },
  ];

  const phases = [
    {
      when: t("现在", "Now"),
      title: t("测试网可试用", "Live on Testnet"),
      text: t("跟上、确认一笔、结算抽成、购买查看权。", "Follow markets, confirm copy trades, settle fees, and buy viewing keys."),
    },
    {
      when: t("接下来", "Next"),
      title: t("收益改由操作算出", "Swap-Derived Returns"),
      text: t("冻结本金之后的兑换，直接变成大厅上的收益率。", "Swaps recorded after principal freeze directly compute leaderboard ROI."),
    },
    {
      when: t("之后", "Later"),
      title: t("主网与真实成交", "Mainnet & Real Fills"),
      text: t("盈亏读成交结果，合约跟单接到用户自己的永续账户。", "PnL reads directly from fills, and perp copying connects to users' own perpetual accounts."),
    },
  ];

  return (
    <main className="home">
      <p className="kicker">{t("NEAR Hackathon · 测试网", "NEAR Hackathon · Testnet")}</p>
      <div className="title-row">
        <img src="/logo.jpg" alt="" />
        <h1>NearCopyTrading</h1>
      </div>
      <p className="tagline">{t("公开收益率，私下成交。跟上的人赚钱，带单员按高水位抽成。", "Public returns, private execution. Followers profit, leaders earn a high-water fee.")}</p>
      <p className="trust">{t("机密交易里外人看不到仓位。NearCopyTrading 把能公开的收益和只卖给买家的明细分开。报价只做预览，不代替成交。", "Confidential trading hides positions from outsiders. NearCopyTrading separates public returns from buyer-only trade details. Quotes remain dry previews, not fills.")}</p>
      <div className="cta">
        <Link className="button" to="/?market=Spot">{t("打开跟单", "Open Copy Board")}</Link>
        <Link className="ghost" to="/docs/overview">{t("产品介绍", "Overview")}</Link>
      </div>
      <section className="home-grid" aria-label={t("产品要点", "Highlights")}>
        {cards.map((card) => (
          <Link key={card.title} to={card.to} className="card">
            <strong>{card.title}</strong>
            <p>{card.text}</p>
            <span aria-hidden="true">↗</span>
          </Link>
        ))}
      </section>
      <section className="phases" aria-labelledby="roadmap-title">
        <div className="phase-head">
          <h2 id="roadmap-title">{t("路线图", "Roadmap")}</h2>
          <Link to="/docs/roadmap">{t("完整说明", "Full Roadmap")}</Link>
        </div>
        <ol>
          {phases.map((phase) => (
            <li key={phase.when}>
              <span>{phase.when}</span>
              <strong>{phase.title}</strong>
              <p>{phase.text}</p>
            </li>
          ))}
        </ol>
      </section>
    </main>
  );
}
