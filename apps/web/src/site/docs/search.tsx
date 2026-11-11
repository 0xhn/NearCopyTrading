import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { searchHits } from "./pages";

export function Search({ open, onClose }: { open: boolean; onClose: () => void }) {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [cursor, setCursor] = useState(0);
  const hits = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const all = searchHits();
    if (!needle) return all.slice(0, 8);
    return all.filter((hit) => hit.haystack.includes(needle)).slice(0, 8);
  }, [query]);

  useEffect(() => {
    setCursor(0);
  }, [query, open]);

  useEffect(() => {
    if (!open) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
      if (event.key === "ArrowDown") {
        event.preventDefault();
        setCursor((current) => Math.min(current + 1, Math.max(hits.length - 1, 0)));
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        setCursor((current) => Math.max(current - 1, 0));
      }
      if (event.key === "Enter" && hits[cursor]) {
        event.preventDefault();
        const hit = hits[cursor];
        navigate(hit.id ? `/docs/${hit.slug}#${hit.id}` : `/docs/${hit.slug}`);
        onClose();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [cursor, hits, navigate, onClose, open]);

  if (!open) return null;
  return (
    <div className="search-back" role="presentation" onClick={onClose}>
      <div className="search-panel" role="dialog" aria-label="搜索文档" onClick={(event) => event.stopPropagation()}>
        <input
          autoFocus
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="搜索文档或向 AI 提问..."
          aria-label="搜索文档"
        />
        <ul>
          {hits.length === 0 ? <li className="empty">没有匹配的小节。</li> : null}
          {hits.map((hit, index) => (
            <li key={`${hit.slug}-${hit.id ?? "page"}`}>
              <button
                type="button"
                className={index === cursor ? "on" : ""}
                onMouseEnter={() => setCursor(index)}
                onClick={() => {
                  navigate(hit.id ? `/docs/${hit.slug}#${hit.id}` : `/docs/${hit.slug}`);
                  onClose();
                }}
              >
                <strong>{hit.label}</strong>
                <em>{hit.page}</em>
              </button>
            </li>
          ))}
        </ul>
        <p>结果来自这些文档页面。</p>
      </div>
    </div>
  );
}
