import type { Playbook } from "./types.ts";

export function presetPlaybooks(now = new Date().toISOString()): Playbook[] {
  return [
    {
      id: "playbook-trend-pullback",
      name: "Trend pullback",
      description:
        "Trade with the dominant trend after a controlled pullback into a planned level or value area.",
      markets: ["stocks", "futures", "forex", "crypto", "indices"],
      sessions: ["london", "overlap", "newyork"],
      timeframes: ["15m", "1H", "4H"],
      entryCriteria: [
        "Higher-timeframe trend is clear",
        "Pullback reached the planned zone",
        "Trigger confirms at the zone",
        "Stop is beyond invalidation",
        "At least 1.8R is available to target",
      ],
      invalidation: "A decisive close through the pullback zone or a higher-timeframe structure break against the trend.",
      managementRules: [
        "Partial at the prior swing",
        "Trail behind minor structure after 1R",
        "No second attempt in the same zone after a full stop",
      ],
      notes: "The first candle back in trend direction is not automatically the entry. Wait for price to reach the planned location.",
      exampleScreenshot: "",
      createdAt: now,
      updatedAt: now,
    },
    {
      id: "playbook-opening-range",
      name: "Opening range breakout",
      description:
        "Define the opening range, wait for acceptance outside it, then trade the retest in the direction of the break.",
      markets: ["stocks", "futures", "indices", "forex"],
      sessions: ["london", "newyork"],
      timeframes: ["1m", "5m", "15m"],
      entryCriteria: [
        "Opening range is complete",
        "Candle closes outside the range",
        "Retest holds the broken edge",
        "Measured move offers at least 1.5R",
        "No high-impact release is imminent",
      ],
      invalidation: "Acceptance back inside the opening range after the break.",
      managementRules: [
        "First target is one times the range height",
        "Reduce risk after the first impulse leg",
        "Only one attempt per direction",
      ],
      notes: "Fast models need attempt limits. Most damage comes from retrying a failed break until the session thesis is gone.",
      exampleScreenshot: "",
      createdAt: now,
      updatedAt: now,
    },
    {
      id: "playbook-liquidity-reversal",
      name: "Liquidity sweep reversal",
      description:
        "Wait for an obvious high/low to be swept, then require displacement and a structure shift before entering the reversal.",
      markets: ["forex", "indices", "metals", "crypto", "futures"],
      sessions: ["asia", "london", "overlap", "newyork"],
      timeframes: ["5m", "15m", "1H"],
      entryCriteria: [
        "Obvious liquidity pool was swept",
        "Displacement closes back through the trigger",
        "Entry is on the retest, not mid-range",
        "Stop sits beyond the sweep extreme",
        "Next opposing pool offers at least 2R",
      ],
      invalidation: "A close beyond the sweep extreme or continued acceptance through the level without a retest.",
      managementRules: [
        "Take a partial at 1R",
        "Move stop only after structure confirms",
        "Final target is the next opposing pool",
      ],
      notes: "A sweep by itself is information, not an entry. Confirmation is what separates reversal trading from catching knives.",
      exampleScreenshot: "",
      createdAt: now,
      updatedAt: now,
    },
  ];
}
