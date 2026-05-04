// ASCII Studio — ASCII art and video tools
"use client";
import Link from "next/link";
import { Terminal, ChevronRight } from "lucide-react";

const tools = [
  {
    icon: "🔤",
    label: "ASCII Art",
    href: "/recroom/ascii-art",
    color: "border-neon-green/30 hover:border-neon-green/50",
    desc: "Text banners, signatures, and ASCII art using 571 fonts",
    accent: "text-neon-green",
  },
  {
    icon: "🎞️",
    label: "ASCII Video",
    href: "/recroom/ascii-video",
    color: "border-neon-cyan/30 hover:border-neon-cyan/50",
    desc: "Full cinematic ASCII video pipeline — video-to-ASCII, audio-reactive, generative",
    accent: "text-neon-cyan",
  },
];

export default function AsciiStudioPage() {
  return (
    <div className="min-h-screen bg-dark-950 grid-bg">
      {/* Header */}
      <div className="border-b border-white/10 bg-dark-900/50 px-6 py-5 backdrop-blur-xl border-t-2 border-green-500/30">
        <div className="flex items-center gap-3">
          <Terminal className="w-6 h-6 text-neon-green" />
          <div>
            <h1 className="text-xl font-bold text-white">ASCII Studio</h1>
            <p className="text-xs text-white/40 font-mono">
              Text art and animated ASCII video tools
            </p>
          </div>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-6 py-10">
        <div className="rounded-xl border border-green-500/10 bg-dark-900/30 p-4 mb-8 font-mono text-xs text-white/30">
          <span className="text-green-400">$</span> Available tools:{" "}
          {tools.length} &nbsp;|&nbsp; All tools run locally, no API keys
          required
        </div>

        <div className="space-y-4">
          {tools.map((tool) => (
            <Link
              key={tool.label}
              href={tool.href}
              className={`flex items-center justify-between rounded-xl border bg-dark-900/50 p-6 transition-all ${tool.color} hover:shadow-[0_0_20px_rgba(34,197,94,0.05)] group`}
            >
              <div className="flex items-center gap-4">
                <span className="text-3xl">{tool.icon}</span>
                <div>
                  <h3 className="font-semibold text-white mb-1">
                    {tool.label}
                  </h3>
                  <p className="text-xs text-white/40">{tool.desc}</p>
                </div>
              </div>
              <ChevronRight className="w-5 h-5 text-white/20 group-hover:text-white/60 transition-colors" />
            </Link>
          ))}
        </div>

        <div className="mt-8 p-4 rounded-xl border border-white/5 bg-dark-900/30 font-mono text-xs text-white/20">
          <p className="mb-2">
            <span className="text-green-400">$</span> pyfiglet — 571 built-in
            fonts &nbsp;
            <span className="text-white/10">|</span>&nbsp; cowsay — speech
            bubbles &nbsp;
            <span className="text-white/10">|</span>&nbsp; boxes — decorative
            frames
          </p>
          <p>
            <span className="text-green-400">$</span> ascii-co.uk API — free
            remote rendering
          </p>
        </div>
      </div>
    </div>
  );
}
