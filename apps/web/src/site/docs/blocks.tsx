import { useState } from "react";
import { Link } from "react-router-dom";
import type { Block, CodeTab } from "./types";

function Rich({ text }: { text: string }) {
  const parts = text.split(/(`[^`]+`)/g);
  return (
    <>
      {parts.map((part, index) => (
        part.startsWith("`") && part.endsWith("`")
          ? <code key={index}>{part.slice(1, -1)}</code>
          : <span key={index}>{part}</span>
      ))}
    </>
  );
}

function CopyButton({ text, label = "复制" }: { text: string; label?: string }) {
  const [done, setDone] = useState(false);
  async function copy() {
    let copied = false;
    try {
      await navigator.clipboard.writeText(text);
      copied = true;
    } catch {
      const area = document.createElement("textarea");
      area.value = text;
      area.setAttribute("readonly", "");
      area.style.position = "fixed";
      area.style.left = "-9999px";
      document.body.append(area);
      area.select();
      copied = document.execCommand("copy");
      area.remove();
    }
    if (!copied) return;
    setDone(true);
    window.setTimeout(() => setDone(false), 4000);
  }
  return (
    <button type="button" className={`ghost tiny ${done ? "ok" : ""}`} onClick={() => void copy()}>
      {done ? "已复制" : label}
    </button>
  );
}

function CodeBlock({ filename, tabs }: { filename: string; tabs: CodeTab[] }) {
  const [index, setIndex] = useState(0);
  const tab = tabs[index] ?? tabs[0];
  const lines = tab.code.split("\n");
  return (
    <figure className="code">
      <figcaption>
        <span className="file">{filename}</span>
        <span className="langs">
          {tabs.map((item, itemIndex) => (
            <button key={item.lang} type="button" className={itemIndex === index ? "on" : ""} onClick={() => setIndex(itemIndex)}>
              {item.lang}
            </button>
          ))}
        </span>
        <CopyButton text={tab.code} />
      </figcaption>
      <pre>
        {lines.map((line, lineIndex) => {
          const marked = tab.highlight?.includes(lineIndex + 1);
          return <span key={lineIndex} className={marked ? "mark" : undefined}>{line}{"\n"}</span>;
        })}
      </pre>
    </figure>
  );
}

export function Blocks({ blocks }: { blocks: Block[] }) {
  return (
    <>
      {blocks.map((block, index) => {
        if (block.type === "h2") return <h2 key={block.id} id={block.id}>{block.text}</h2>;
        if (block.type === "h3") return <h3 key={block.id} id={block.id}>{block.text}</h3>;
        if (block.type === "p") return <p key={index}><Rich text={block.text} /></p>;
        if (block.type === "ul") {
          return (
            <ul key={index}>
              {block.items.map((item) => <li key={item}><Rich text={item} /></li>)}
            </ul>
          );
        }
        if (block.type === "callout") {
          return (
            <aside key={index} className="callout">
              <strong>{block.title}</strong>
              <p><Rich text={block.text} /></p>
            </aside>
          );
        }
        if (block.type === "steps") {
          return (
            <ol key={index} className="steps">
              {block.items.map((item, step) => (
                <li key={item.title}>
                  <span>{step + 1}</span>
                  <div>
                    <strong>{item.title}</strong>
                    <p><Rich text={item.text} /></p>
                  </div>
                </li>
              ))}
            </ol>
          );
        }
        if (block.type === "code") return <CodeBlock key={index} filename={block.filename} tabs={block.tabs} />;
        if (block.type === "params") {
          return (
            <div key={index} className="params">
              {block.rows.map((row) => (
                <div key={row.name}>
                  <div>
                    <code>{row.name}</code>
                    <em>{row.type}</em>
                    {row.required ? <b>Required</b> : null}
                  </div>
                  <p><Rich text={row.text} /></p>
                </div>
              ))}
            </div>
          );
        }
        return (
          <div key={index} className="cards">
            {block.items.map((item) => (
              <Link key={item.to + item.title} to={item.to} className="card">
                <strong>{item.title}</strong>
                <p>{item.text}</p>
                <span aria-hidden="true">↗</span>
              </Link>
            ))}
          </div>
        );
      })}
    </>
  );
}

export { CopyButton };
