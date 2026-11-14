import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { useI18n } from "../i18n";
import { Doc } from "./Doc";
import { groupsFor, pageBySlug } from "./docs/pages";
import { Search } from "./docs/search";
import { Home } from "./Home";

export function SiteShell() {
  const location = useLocation();
  const { lang, toggleLang, t } = useI18n();
  const [search, setSearch] = useState(false);
  const [menu, setMenu] = useState(false);
  const slug = location.pathname.split("/").pop();
  const groups = groupsFor(lang);
  const current = pageBySlug(slug, lang);
  const docs = location.pathname.startsWith("/docs");

  useEffect(() => {
    setMenu(false);
  }, [location.pathname]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setSearch(true);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="site-root">
      <div className="ambient" aria-hidden="true" />
      <header className="top">
        <div className="brand">
          {docs ? <button type="button" className="menu" aria-label={t("打开导航", "Open navigation")} onClick={() => setMenu((open) => !open)}>{t("目录", "Menu")}</button> : null}
          <Link to="/home"><img src="/logo.jpg" alt="" />NearCopyTrading</Link>
          <span className="pill">testnet</span>
          <Link className="pill" to="/?market=Spot">{t("跟单", "Copy")}</Link>
          <button
            type="button"
            className="pill lang-btn"
            onClick={toggleLang}
            aria-label={t("Switch to English", "切换到中文")}
            title={t("Switch to English", "切换到中文")}
          >
            {lang === "en" ? "中文" : "EN"}
          </button>
        </div>
        <button type="button" className="ask" onClick={() => setSearch(true)}>
          <span className="spark" aria-hidden="true">✦</span>
          <span className="ask-label">{t("搜索文档", "Search docs")}</span>
          <kbd>⌘ K</kbd>
        </button>
        <nav className="mods">
          {groups.map((group) => (
            <Link key={group.id} className={current?.group === group.id ? "on" : ""} to={`/docs/${group.slug}`}>
              {group.label}
            </Link>
          ))}
        </nav>
      </header>
      {docs ? <Doc menuOpen={menu} onNavigate={() => setMenu(false)} /> : <Home />}
      <Search open={search} onClose={() => setSearch(false)} />
    </div>
  );
}
