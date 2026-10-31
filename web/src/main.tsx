import "@fontsource-variable/hanken-grotesk";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { Shell } from "./components/Shell";
import { AdvisorPage } from "./pages/Advisor";
import { MarketPage } from "./pages/Market";
import { PortfolioPage } from "./pages/Portfolio";
import { StockPage } from "./pages/Stock";
import "./styles.css";

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } } });

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route element={<Shell />}>
            <Route index element={<PortfolioPage />} />
            <Route path="market" element={<MarketPage />} />
            <Route path="stock/:symbol" element={<StockPage />} />
            <Route path="advisor" element={<AdvisorPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
);
