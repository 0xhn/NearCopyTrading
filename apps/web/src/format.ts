const YOCTO = 10n ** 24n;

export function yoctoToNear(yocto: string): string {
  const value = BigInt(yocto || "0");
  const whole = value / YOCTO;
  const frac = (value % YOCTO).toString().padStart(24, "0").slice(0, 4);
  return `${whole}.${frac}`;
}

export function nearToYocto(near: string): string {
  const trimmed = near.trim();
  if (!/^\d+(\.\d+)?$/.test(trimmed)) {
    throw new Error("金额格式应为数字");
  }
  const [whole, frac = ""] = trimmed.split(".");
  const fracPadded = `${frac}${"0".repeat(24)}`.slice(0, 24);
  return (BigInt(whole) * YOCTO + BigInt(fracPadded)).toString();
}

export function addYocto(left: string, right: bigint): string {
  return (BigInt(left) + right).toString();
}

export function bpsLabel(bps: number): string {
  const sign = bps > 0 ? "+" : "";
  return `${sign}${(bps / 100).toFixed(2)}%`;
}

export function percentToBps(value: string, label: string): number {
  const trimmed = value.trim();
  if (!/^-?\d+(\.\d+)?$/.test(trimmed)) {
    throw new Error(`${label}应为数字`);
  }
  const bps = Math.round(Number(trimmed) * 100);
  if (!Number.isSafeInteger(bps)) {
    throw new Error(`${label}过大`);
  }
  return bps;
}

export function nsToDate(ns: string): Date {
  return new Date(Number(BigInt(ns) / 1_000_000n));
}

export function withinDays(ns: string, days: number): boolean {
  if (days <= 0) return true;
  const age = Date.now() - nsToDate(ns).getTime();
  return age <= days * 24 * 60 * 60 * 1000;
}

export function shortAccount(account: string): string {
  if (account.length <= 22) return account;
  return `${account.slice(0, 10)}…${account.slice(-8)}`;
}

export function copyStatus(status: string): string {
  if (status === "Open") return "持仓中";
  if (status === "Proposed") return "待确认";
  if (status === "Settled") return "已结算";
  if (status === "Refunded") return "已退回";
  return status;
}

export function sideLabel(side: string): string {
  if (side === "Buy") return "买入";
  if (side === "Sell") return "卖出";
  if (side === "Long") return "多";
  if (side === "Short") return "空";
  return side;
}

export function marketLabel(market: string): string {
  return market === "Perp" ? "合约" : "现货";
}

export function initials(name: string): string {
  const trimmed = name.trim();
  return (trimmed.slice(0, 2) || "?").toUpperCase();
}
