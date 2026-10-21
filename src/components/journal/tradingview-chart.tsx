import { Button } from "@/components/ui/button";
import { Activity, RefreshCw } from "lucide-react";
import { useEffect, useRef, useState } from "react";

type ChartStatus = "loading" | "ready" | "error";

export function TradingViewChart({
  symbol,
  interval,
  watchlist,
  reloadKey = 0,
}: {
  symbol: string;
  interval: string;
  watchlist: string[];
  reloadKey?: number;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<ChartStatus>("loading");
  const [internalReloadKey, setInternalReloadKey] = useState(0);
  const watchlistKey = watchlist.join(",");
  const cleanSymbol = symbol.trim().toUpperCase();

  useEffect(() => {
    const container = containerRef.current;
    if (!container || !cleanSymbol) return;

    setStatus("loading");
    container.innerHTML = "";

    const widget = document.createElement("div");
    widget.className = "tradingview-widget-container__widget";
    widget.style.height = "100%";
    widget.style.width = "100%";
    container.appendChild(widget);

    const markReady = () => {
      const iframe = container.querySelector("iframe");
      if (!iframe) return false;
      iframe.title = `${cleanSymbol} live TradingView chart`;
      iframe.allowFullscreen = true;
      iframe.setAttribute("allow", "fullscreen; clipboard-write");
      setStatus("ready");
      return true;
    };

    const observer = new MutationObserver(markReady);
    observer.observe(container, { childList: true, subtree: true });

    const timeout = window.setTimeout(() => {
      if (!markReady()) setStatus("error");
    }, 15000);

    const script = document.createElement("script");
    script.type = "text/javascript";
    script.async = true;
    script.src = "https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js";
    script.onerror = () => setStatus("error");
    script.textContent = JSON.stringify({
      autosize: true,
      symbol: cleanSymbol,
      interval,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "exchange",
      theme: "dark",
      style: "1",
      locale: "en",
      backgroundColor: "rgba(12, 13, 16, 1)",
      gridColor: "rgba(255, 255, 255, 0.06)",
      hide_top_toolbar: false,
      hide_side_toolbar: false,
      hide_legend: false,
      hide_volume: false,
      enable_publishing: false,
      allow_symbol_change: true,
      withdateranges: true,
      details: false,
      hotlist: false,
      calendar: false,
      save_image: true,
      show_popup_button: true,
      popup_width: "1600",
      popup_height: "950",
      watchlist: watchlistKey ? watchlistKey.split(",") : undefined,
      support_host: "https://www.tradingview.com",
    });
    container.appendChild(script);

    return () => {
      observer.disconnect();
      window.clearTimeout(timeout);
      container.innerHTML = "";
    };
  }, [cleanSymbol, interval, watchlistKey, reloadKey, internalReloadKey]);

  if (!cleanSymbol) {
    return (
      <div className="flex h-full items-center justify-center px-6 text-center text-sm text-muted">
        Enter a TradingView symbol to load the live chart.
      </div>
    );
  }

  return (
    <div className="relative flex h-full min-h-0 flex-col overflow-hidden bg-[#0c0d10]">
      <div ref={containerRef} className="tradingview-widget-container relative min-h-0 flex-1" />

      {status !== "ready" ? (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-[#0c0d10]/92 px-6 text-center">
          {status === "loading" ? (
            <div>
              <Activity className="mx-auto size-6 animate-pulse text-up" aria-hidden="true" />
              <p className="mt-3 font-medium">Connecting to the TradingView live feed…</p>
              <p className="mt-1 font-mono text-sm text-muted">{cleanSymbol} · {interval}</p>
            </div>
          ) : (
            <div>
              <p className="font-medium">The live chart did not load.</p>
              <p className="mx-auto mt-1 max-w-md text-sm text-muted">
                Check the symbol and connection, then try again. Some embedded exchange feeds are delayed, but the
                chart itself should still open.
              </p>
              <Button className="mt-4" onClick={() => setInternalReloadKey((value) => value + 1)}>
                <RefreshCw className="size-4" />
                Retry live chart
              </Button>
            </div>
          )}
        </div>
      ) : null}

      <p className="flex h-7 shrink-0 items-center border-t border-border px-3 text-[11px] text-subtle">
        <a
          href={`https://www.tradingview.com/symbols/${encodeURIComponent(cleanSymbol.replace(":", "-"))}/`}
          target="_blank"
          rel="noreferrer"
          className="underline decoration-border underline-offset-4 hover:text-foreground"
        >
          {cleanSymbol} chart
        </a>
        <span className="ml-1">by TradingView</span>
        <span className="ml-auto hidden sm:inline">Streaming availability and delay depend on the symbol’s exchange feed.</span>
      </p>
    </div>
  );
}
