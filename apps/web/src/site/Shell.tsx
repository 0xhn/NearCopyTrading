import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { Doc } from "./Doc";
import { GROUPS, pageBySlug } from "./docs/pages";
import { Search } from "./docs/search";
import { Home } from "./Home";

export function SiteShell() {
  const location = useLocation();
  const [search, setSearch] = useState(false);
  const [menu, setMenu] = useState(false);
  const slug = location.pathname.split("/").pop();
  const current = pageBySlug(slug);
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
          {docs ? <button type="button" className="menu" aria-label="打开导航" onClick={() => setMenu((open) => !open)}>目录</button> : null}
          <Link to="/home"><img src="/logo.jpg" alt="" />NearCopyTrading</Link>
          <span className="pill">testnet</span>
          <Link className="pill" to="/?market=Spot">跟单</Link>
        </div>
        <button type="button" className="ask" onClick={() => setSearch(true)}>
          <span className="spark" aria-hidden="true">✦</span>
          <span className="ask-label">搜索文档</span>
          <kbd>⌘ K</kbd>
        </button>
        <nav className="mods">
          {GROUPS.map((group) => (
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
