import { Link } from "react-router-dom";

const CARDS = [
  { title: "公开收益率", text: "先看收益、回撤和胜率，再决定跟谁。现货和合约分开两张榜。", to: "/docs/overview#public" },
  { title: "查看权", text: "成交明细单独出售。钥匙留在买家自己的浏览器里，不能动账户资产。", to: "/docs/overview#public" },
  { title: "赚到才抽成", text: "跟单盈利高出以往水位，带单员才按约定比例从托管里抽取。", to: "/docs/overview#follower" },
];

const PHASES = [
  { when: "现在", title: "测试网可试用", text: "跟上、确认一笔、结算抽成、购买查看权。" },
  { when: "接下来", title: "收益改由操作算出", text: "冻结本金之后的兑换，直接变成大厅上的收益率。" },
  { when: "之后", title: "主网与真实成交", text: "盈亏读成交结果，合约跟单接到用户自己的永续账户。" },
];

export function Home() {
  return (
    <main className="home">
      <p className="kicker">NEAR Hackathon · 测试网</p>
      <div className="title-row">
        <img src="/logo.jpg" alt="" />
        <h1>NearCopyTrading</h1>
      </div>
      <p className="tagline">公开收益率，私下成交。跟上的人赚钱，带单员按高水位抽成。</p>
      <p className="trust">机密交易里外人看不到仓位。NearCopyTrading 把能公开的收益和只卖给买家的明细分开。报价只做预览，不代替成交。</p>
      <div className="cta">
        <Link className="button" to="/?market=Spot">打开跟单</Link>
        <Link className="ghost" to="/docs/overview">产品介绍</Link>
      </div>
      <section className="home-grid" aria-label="产品要点">
        {CARDS.map((card) => (
          <Link key={card.title} to={card.to} className="card">
            <strong>{card.title}</strong>
            <p>{card.text}</p>
            <span aria-hidden="true">↗</span>
          </Link>
        ))}
      </section>
      <section className="phases" aria-labelledby="roadmap-title">
        <div className="phase-head">
          <h2 id="roadmap-title">路线图</h2>
          <Link to="/docs/roadmap">完整说明</Link>
        </div>
        <ol>
          {PHASES.map((phase) => (
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
