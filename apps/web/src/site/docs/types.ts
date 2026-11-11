export type GroupId = "product" | "roadmap";

export interface CodeTab {
  lang: string;
  code: string;
  highlight?: number[];
}

export type Block =
  | { type: "h2"; id: string; text: string }
  | { type: "h3"; id: string; text: string }
  | { type: "p"; text: string }
  | { type: "ul"; items: string[] }
  | { type: "callout"; title: string; text: string }
  | { type: "steps"; items: Array<{ title: string; text: string }> }
  | { type: "code"; filename: string; tabs: CodeTab[] }
  | { type: "params"; rows: Array<{ name: string; type: string; required?: boolean; text: string }> }
  | { type: "cards"; items: Array<{ title: string; text: string; to: string }> };

export interface DocPage {
  slug: string;
  group: GroupId;
  title: string;
  lead: string;
  crumbs: string[];
  blocks: Block[];
}

export interface SearchHit {
  slug: string;
  page: string;
  label: string;
  id?: string;
  haystack: string;
}
