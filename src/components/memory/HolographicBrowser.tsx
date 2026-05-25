// ═══════════════════════════════════════════════════════════════
// HolographicBrowser — View holographic memory facts
// ═══════════════════════════════════════════════════════════════

import { Brain } from "lucide-react";
import type { MemoryReadResult } from "@/lib/memory-providers";
import { timeAgo } from "@/lib/utils";

/** Parse a raw holographic fact dict string into clean display fields */
function parseHolographicFact(raw: string): {
  text: string;
  type: string;
  entities: string;
  occurred: string;
} {
  try {
    // Format: {'id': '...', 'text': '...', 'fact_type': '...', 'entities': '...', 'occurred_start': '...'}
    const textMatch = raw.match(/'text':\s*'((?:[^'\\]|\\.)*)'/);
    const typeMatch = raw.match(/'fact_type':\s*'([^']*)'/);
    const entitiesMatch = raw.match(/'entities':\s*'([^']*)'/);
    const occurredMatch = raw.match(/'occurred_start':\s*'([^']*)'/);

    const text = textMatch ? textMatch[1].replace(/\\'/g, "'") : raw;
    const type = typeMatch ? typeMatch[1] : "observation";
    const entities = entitiesMatch ? entitiesMatch[1] : "";
    const occurred = occurredMatch ? timeAgo(occurredMatch[1]) : "";

    return { text, type, entities, occurred };
  } catch {
    return { text: raw, type: "observation", entities: "", occurred: "" };
  }
}

export default function HolographicBrowser({ initialData }: {
  initialData: MemoryReadResult;
}) {
  const data = initialData;

  if (!data?.available) {
    return (
      <div className="text-center py-12">
        <Brain className="w-12 h-12 text-pink-400/40 mx-auto mb-4" />
        <h2 className="text-lg font-semibold text-white mb-2">Memory Not Available</h2>
        <p className="text-sm text-white/50">{data?.message || "No memory provider configured"}</p>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-4 text-xs text-white/30">
        {data.total} facts stored — {data.dbSize > 0 ? (data.dbSize / 1024).toFixed(1) + " KB" : "Unknown size"}
      </div>
      <div className="space-y-3">
        {data.facts.map((fact) => {
          const parsed = parseHolographicFact(fact.content);
          return (
            <div key={fact.id} className="rounded-xl border border-white/10 bg-dark-900/50 p-4">
              <p className="text-sm text-white/80 leading-relaxed">{parsed.text}</p>
              <div className="flex items-center gap-2 mt-2 flex-wrap">
                <span className={`text-[10px] font-medium px-2 py-0.5 rounded ${
                  parsed.type === "observation" ? "bg-neon-cyan/15 text-neon-cyan" :
                  parsed.type === "world" ? "bg-neon-purple/15 text-neon-purple" :
                  parsed.type === "directive" ? "bg-neon-orange/15 text-neon-orange" :
                  "bg-white/10 text-white/50"
                }`}>
                  {parsed.type}
                </span>
                {parsed.entities.length > 0 && (
                  <span className="text-[10px] text-white/40">
                    {parsed.entities}
                  </span>
                )}
                {parsed.occurred && (
                  <span className="text-[10px] text-white/30 ml-auto">
                    {parsed.occurred}
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
