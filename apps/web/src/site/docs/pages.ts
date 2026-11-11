import type { DocPage, GroupId, SearchHit } from "./types";

export const GROUPS: Array<{ id: GroupId; label: string; slug: string }> = [
  { id: "product", label: "产品", slug: "overview" },
  { id: "roadmap", label: "路线图", slug: "roadmap" },
];

export const PAGES: DocPage[] = [
  {
    slug: "overview",
    group: "product",
    title: "产品介绍",
    lead: "NearCopyTrading 是 NEAR 上的跟单产品。收益率公开，成交明细单独出售。跟单赚到的部分，按高水位分给带单员。",
    crumbs: ["产品", "产品介绍"],
    blocks: [
      {
        type: "cards",
        items: [
          { title: "打开跟单", text: "先看大厅上的公开收益率，再决定跟谁。", to: "/?market=Spot" },
          { title: "路线图", text: "测试网已经能走通的部分，以及后面要接上的成交。", to: "/docs/roadmap" },
        ],
      },
      { type: "h2", id: "problem", text: "它解决什么" },
      {
        type: "p",
        text: "机密交易把仓位和入金藏起来，外人看不到带单员在做什么。跟单需要一条能公开核对的收益，也需要一条只卖给买家的成交明细。NearCopyTrading 把这两件事分开：大厅展示收益率，查看权才打开明细。",
      },
      {
        type: "p",
        text: "跟单资格、抽成托管和结算规则记在 NEAR 上。报价走 NEAR Intents，用来预览一笔兑换，不代替已经成交的单。",
      },
      { type: "h2", id: "people", text: "两种角色" },
      {
        type: "ul",
        items: [
          "带单员公布收益率，发布现货或合约交易，并在跟单盈利时抽取约定比例。",
          "跟单员按市场跟上。截止时间之后的新交易才能确认。自己的盈亏从确认那一笔开始。",
        ],
      },
      { type: "h2", id: "public", text: "公开的和出售的" },
      {
        type: "p",
        text: "大厅上的收益率、回撤和胜率不需要先买查看权。现货和合约分开显示，一条市场的记录不会出现在另一条市场上。",
      },
      {
        type: "p",
        text: "成交明细是查看权。买家付款后，钥匙留在自己的浏览器里，用来解开带单员封存的内容。这把钥匙不能动账户里的资产，也不会变成 NEAR Intents 的登录凭证。",
      },
      {
        type: "callout",
        title: "换浏览器就解不开",
        text: "付款记录留在链上。明文只在当初购买的那台浏览器里解得开。清掉本地数据之后，不能再读那份明细。",
      },
      { type: "h2", id: "leader", text: "带单员怎么用" },
      {
        type: "steps",
        items: [
          { title: "登记", text: "连接钱包，写下显示名和抽成比例。" },
          { title: "公布收益", text: "大厅用这条公开数字排序。也可以在公布时刻冻结持仓，之后的兑换按市价重算收益率。" },
          { title: "发布交易", text: "现货和合约分开写。跟单员只能确认这条截止线之后的新交易。" },
          { title: "确认抽成", text: "跟单员申报的盈利高出以往水位时，带单员确认后才从托管里划走约定比例。" },
        ],
      },
      { type: "h2", id: "follower", text: "跟单员怎么用" },
      {
        type: "steps",
        items: [
          { title: "看大厅", text: "按收益率、回撤、胜率或跟单人数挑选。现货和合约是两张榜。" },
          { title: "跟上", text: "跟上只记下这个市场的开始时间。截止前的交易不能开仓，另一个市场也不跟着打开。" },
          { title: "确认一笔", text: "为自己设权益上限和杠杆。现货杠杆是 1 倍。托管的是抽成上限，不是这笔交易的本金。" },
          { title: "申报盈利", text: "没有超过以往高水位时，托管直接退回。有抽成时等待带单员确认。满 24 小时仍未确认，可以自己取回。" },
        ],
      },
      {
        type: "callout",
        title: "带单员的收益率不是你的账户结果",
        text: "跟上之后、确认某一笔之前，没有你自己的盈亏。确认之后，这一笔的结果才记在你的跟单里。",
      },
      { type: "h2", id: "now", text: "现在打开就能做" },
      {
        type: "ul",
        items: [
          "在测试网连接钱包，浏览带单员，分别跟上现货或合约。",
          "对截止线之后的交易确认跟单，申报盈利，完成或取回托管。",
          "购买查看权。没有封存内容时，买到的是之后能解开明细的资格。",
          "跟单前看一笔兑换预览。预览不生成存款，也不算成交。",
        ],
      },
    ],
  },
  {
    slug: "roadmap",
    group: "roadmap",
    title: "路线图",
    lead: "演示跑在 NEAR 测试网。评审期间这套页面保持可打开。下面是已经能用的闭环，以及还没接到真实成交的部分。",
    crumbs: ["路线图", "路线图"],
    blocks: [
      { type: "h2", id: "live", text: "已经上线" },
      {
        type: "ul",
        items: [
          "公开收益率大厅，现货和合约分开浏览。",
          "按市场上跟，截止线只生效一次，不能回头改。",
          "确认跟单、托管抽成上限、按高水位结算，超时可取回。",
          "查看权：成交明细只卖给买过的人，钥匙留在买家浏览器。",
          "公布时刻可以冻结持仓，之后的兑换用来重算收益率。",
          "跟单前的 Intents 报价预览。",
        ],
      },
      { type: "h2", id: "next", text: "接下来" },
      {
        type: "ul",
        items: [
          "带单员的公开收益率改由冻结本金和之后的真实操作连续算出，不再手写百分比。",
          "跟单确认后，给出与那笔交易同方向的可执行兑换，仍由跟单员自己签名。",
          "查看权里的明细和大厅上的收益率使用同一套操作记录。",
        ],
      },
      { type: "h2", id: "later", text: "之后" },
      {
        type: "ul",
        items: [
          "主网开放跟单和抽成结算。",
          "跟单盈亏改为读成交结果，不再由跟单员申报一个数字。",
          "合约跟单接到用户自己的永续账户，而不是只记录一笔方向和数量。",
        ],
      },
      {
        type: "callout",
        title: "这一版的边界",
        text: "报价保持预览，不会替任何人成交。查看权不是账户钥匙。测试网演示会保留到黑客松评审结束。",
      },
    ],
  },
];

export function pageBySlug(slug: string | undefined): DocPage | undefined {
  return PAGES.find((page) => page.slug === slug);
}

export function searchHits(): SearchHit[] {
  const hits: SearchHit[] = [];
  for (const page of PAGES) {
    hits.push({
      slug: page.slug,
      page: page.title,
      label: page.title,
      haystack: `${page.title} ${page.lead} ${page.crumbs.join(" ")}`.toLowerCase(),
    });
    for (const block of page.blocks) {
      if (block.type === "h2" || block.type === "h3") {
        hits.push({
          slug: page.slug,
          page: page.title,
          label: block.text,
          id: block.id,
          haystack: `${page.title} ${block.text}`.toLowerCase(),
        });
      }
    }
  }
  return hits;
}
