import { useEffect, useState } from "react";
import { Link, useLocation, useParams } from "react-router-dom";
import { useI18n } from "../i18n";
import { Blocks, CopyButton } from "./docs/blocks";
import { pageMarkdown } from "./docs/markdown";
import { groupsFor, pageBySlug, pagesFor } from "./docs/pages";
import type { DocPage } from "./docs/types";

function headings(page: DocPage) {
  return page.blocks.filter((block) => block.type === "h2" || block.type === "h3");
}

export function Doc({ menuOpen, onNavigate }: { menuOpen: boolean; onNavigate: () => void }) {
  const { slug } = useParams();
  const location = useLocation();
  const { lang, t } = useI18n();
  const groups = groupsFor(lang);
  const pages = pagesFor(lang);
  const page = pageBySlug(slug ?? "overview", lang);
  const [active, setActive] = useState("");

  useEffect(() => {
    const id = location.hash.replace("#", "");
    if (!id) return;
    document.getElementById(id)?.scrollIntoView({ block: "start" });
  }, [location.hash, slug]);

  useEffect(() => {
    if (!page) return;
    const nodes = headings(page)
      .map((block) => (block.type === "h2" || block.type === "h3" ? document.getElementById(block.id) : null))
      .filter((node): node is HTMLElement => node !== null);
    if (nodes.length === 0) return;
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((entry) => entry.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        if (visible?.target.id) setActive(visible.target.id);
      },
      { rootMargin: "-80px 0px -60% 0px", threshold: [0.2, 0.6] },
    );
    nodes.forEach((node) => observer.observe(node));
    return () => observer.disconnect();
  }, [page]);

  if (!page) {
    return (
      <div className="docs">
        <p className="miss">{t("没有这一页。", "Page not found.")}</p>
      </div>
    );
  }

  const toc = headings(page);
  return (
    <div className="docs">
      <aside className={`side ${menuOpen ? "open" : ""}`}>
        {groups.map((group) => (
          <div key={group.id}>
            <p>{group.label}</p>
            <ul>
              {pages.filter((item) => item.group === group.id).map((item) => (
                <li key={item.slug}>
                  <Link className={item.slug === page.slug ? "on" : ""} to={`/docs/${item.slug}`} onClick={onNavigate}>
                    {item.title}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </aside>
      <article>
        <nav className="crumbs">{page.crumbs.join("  >  ")}</nav>
        <header className="doc-head">
          <h1>{page.title}</h1>
          <CopyButton text={pageMarkdown(page, lang)} label={t("复制本页 Markdown", "Copy Markdown")} />
        </header>
        <p className="lead">{page.lead}</p>
        <nav className="toc-inline" aria-label={t("本页目录", "On this page")}>
          {toc.map((block) => (
            block.type === "h2" || block.type === "h3"
              ? <a key={block.id} className={block.type === "h3" ? "sub" : ""} href={`#${block.id}`}>{block.text}</a>
              : null
          ))}
        </nav>
        <Blocks blocks={page.blocks} />
      </article>
      <aside className="toc">
        <p>{t("本页目录", "On this page")}</p>
        {toc.map((block) => (
          block.type === "h2" || block.type === "h3"
            ? (
              <a key={block.id} className={`${block.type === "h3" ? "sub" : ""} ${active === block.id ? "on" : ""}`} href={`#${block.id}`}>
                {block.text}
              </a>
            )
            : null
        ))}
        <Link className="debug" to="/docs/roadmap">{t("路线图", "Roadmap")}</Link>
      </aside>
    </div>
  );
}
