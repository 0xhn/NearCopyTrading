const KNOWN: Record<string, { label: string; bg: string; color: string }> = {
  near: { label: "N", bg: "#111111", color: "#ffffff" },
  btc: { label: "₿", bg: "#f7931a", color: "#ffffff" },
  eth: { label: "Ξ", bg: "#627eea", color: "#ffffff" },
  usdt: { label: "₮", bg: "#26a17b", color: "#ffffff" },
  usdc: { label: "$", bg: "#2775ca", color: "#ffffff" },
};

function known(asset: string) {
  const key = asset.toLowerCase();
  if (key === "wrap.near" || key.endsWith(".near") || key === "near") return KNOWN.near;
  return KNOWN[key];
}

export function TokenMark({ asset }: { asset: string }) {
  const mark = known(asset) ?? {
    label: (asset.replace(/[^a-zA-Z0-9]/g, "").slice(0, 1) || "?").toUpperCase(),
    bg: "#1e2538",
    color: "#e5e7eb",
  };
  return (
    <span className="mark" style={{ background: mark.bg, color: mark.color }} aria-hidden="true">
      {mark.label}
    </span>
  );
}
