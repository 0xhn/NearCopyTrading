import type { ReactNode } from "react";
import { Link, Route, Routes } from "react-router-dom";
import { CONTRACT_ID } from "./config";
import { shortAccount } from "./format";
import { useI18n } from "./i18n";
import { useNear } from "./near/wallet";
import { Board } from "./pages/Board";
import { LeaderPage } from "./pages/LeaderPage";
import { MinePage } from "./pages/MinePage";
import { Studio } from "./pages/Studio";
import { SiteShell } from "./site/Shell";
import "./site.css";

function TradeLayout({ children }: { children: ReactNode }) {
  const { accountId, ready, signIn, signOut } = useNear();
  const { lang, toggleLang, t } = useI18n();
  return (
    <>
      <div className="ambient" aria-hidden="true" />
      <header className="top">
        <Link to="/" className="brand"><img src="/logo.jpg" alt="" />NearCopyTrading</Link>
        <nav>
          <Link to="/?market=Spot">{t("跟单", "Copy")}</Link>
          <Link to="/mine">{t("我的跟单", "My Copies")}</Link>
          <Link to="/home">{t("官网", "Home")}</Link>
          <Link to="/docs/overview">{t("文档", "Docs")}</Link>
        </nav>
        <div className="account">
          <span>{CONTRACT_ID}</span>
          <button
            type="button"
            className="ghost"
            onClick={toggleLang}
            aria-label={t("Switch to English", "切换到中文")}
            title={t("Switch to English", "切换到中文")}
          >
            {lang === "en" ? "中文" : "EN"}
          </button>
          {accountId ? (
            <button type="button" className="ghost" onClick={() => void signOut()}>{shortAccount(accountId)}</button>
          ) : (
            <button type="button" className="ghost" disabled={!ready} onClick={signIn}>{t("连接钱包", "Connect Wallet")}</button>
          )}
        </div>
      </header>
      {children}
    </>
  );
}

export default function App() {
  return (
    <Routes>
      <Route path="/home" element={<SiteShell />} />
      <Route path="/docs" element={<SiteShell />} />
      <Route path="/docs/:slug" element={<SiteShell />} />
      <Route path="/" element={<TradeLayout><Board /></TradeLayout>} />
      <Route path="/leader/:accountId" element={<TradeLayout><LeaderPage /></TradeLayout>} />
      <Route path="/mine" element={<TradeLayout><MinePage /></TradeLayout>} />
      <Route path="/studio" element={<TradeLayout><Studio /></TradeLayout>} />
    </Routes>
  );
}
