import { useEffect, useRef } from "react";

export function TradingViewChart({
  symbol,
  interval,
  watchlist,
}: {
  symbol: string;
  interval: string;
  watchlist: string[];
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const watchlistKey = watchlist.join(",");

  useEffect(() => {
    const container = containerRef.current;
    if (!container || !symbol.trim()) return;

    container.innerHTML = "";
    const widget = document.createElement("div");
    widget.className = "tradingview-widget-container__widget";
    widget.style.height = "100%";
    widget.style.width = "100%";
    container.appendChild(widget);

    const script = document.createElement("script");
    script.type = "text/javascript";
    script.async = true;
    script.src = "https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js";
    script.innerHTML = JSON.stringify({
      autosize: true,
      symbol: symbol.trim().toUpperCase(),
      interval,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "exchange",
      theme: "dark",
      style: "1",
      locale: "en",
      backgroundColor: "rgba(12, 13, 16, 1)",
      gridColor: "rgba(255, 255, 255, 0.06)",
      hide_side_toolbar: false,
      allow_symbol_change: true,
      withdateranges: true,
      details: false,
      hotlist: false,
      calendar: false,
      save_image: true,
      watchlist: watchlistKey ? watchlistKey.split(",") : undefined,
      support_host: "https://www.tradingview.com",
    });
    container.appendChild(script);

    return () => {
      container.innerHTML = "";
    };
  }, [symbol, interval, watchlistKey]);

  if (!symbol.trim()) {
    return (
      <div className="flex h-full items-center justify-center px-6 text-center text-sm text-muted">
        Enter a TradingView symbol to load the chart.
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div ref={containerRef} className="tradingview-widget-container min-h-0 flex-1" />
      <p className="border-t border-border px-3 py-2 text-xs text-subtle">
        <a
          href={`https://www.tradingview.com/symbols/${encodeURIComponent(symbol.replace(":", "-"))}/`}
          target="_blank"
          rel="noreferrer"
          className="underline decoration-border underline-offset-4 hover:text-foreground"
        >
          {symbol} chart
        </a>{" "}
        by TradingView
      </p>
    </div>
  );
}
