import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { HashRouter } from "react-router-dom";
import App from "./App";
import { NearProvider } from "./near/wallet";
import "./index.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <HashRouter>
      <NearProvider>
        <App />
      </NearProvider>
    </HashRouter>
  </StrictMode>,
);
