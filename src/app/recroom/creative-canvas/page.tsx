// Creative Canvas — Hub for visual creative tools
"use client";
import Link from "next/link";
import { Palette, ChevronRight } from "lucide-react";

const tools = [
  {
    icon: "✏️",
    label: "Excalidraw",
    href: "/recroom/excalidraw",
    color: "border-neon-orange/30 hover:border-neon-orange/50",
    desc: "Hand-drawn style diagrams — architecture, flowcharts, wireframes",
    accent: "text-neon-orange",
    badge: null,
  },
  {
    icon: "🎨",
    label: "p5.js Sketches",
    href: "/recroom/p5js",
    color: "border-neon-pink/30 hover:border-neon-pink/50",
    desc: "Generative art, interactive sketches, 3D with WebGL",
    accent: "text-neon-pink",
    badge: null,
  },
  {
    icon: "🔲",
    label: "Pixel Art",
    href: "/recroom/pixel-art",
    color: "border-neon-green/30 hover:border-neon-green/50",
    desc: "Pixel art with era palettes — NES, Game Boy, PICO-8",
    accent: "text-neon-green",
    badge: null,
  },
  {
    icon: "📐",
    label: "Architecture Diagrams",
    href: "/recroom/architecture-diagram",
    color: "border-neon-cyan/30 hover:border-neon-cyan/50",
    desc: "Dark-themed SVG cloud and infrastructure diagrams",
    accent: "text-neon-cyan",
    badge: null,
  },
  {
    icon: "🎬",
    label: "Manim Animations",
    href: "/recroom/manim",
    color: "border-neon-purple/30 hover:border-neon-purple/50",
    desc: "3Blue1Brown-style math and algorithm animations",
    accent: "text-neon-purple",
    badge: null,
  },
  {
    icon: "💡",
    label: "Ideation",
    href: "/recroom/ideation",
    color: "border-yellow-500/30 hover:border-yellow-500/50",
    desc: "Generate creative project ideas via structured constraints",
    accent: "text-yellow-400",
    badge: null,
  },
  {
    icon: "🎙️",
    label: "Songwriting + AI Music",
    href: "/recroom/songwriting",
    color: "border-neon-cyan/30 hover:border-neon-cyan/50",
    desc: "Craft lyrics and generate music with Suno AI",
    accent: "text-neon-cyan",
    badge: null,
  },
  {
    icon: "🌐",
    label: "Web Design Inspiration",
    href: "/recroom/web-designs",
    color: "border-neon-purple/30 hover:border-neon-purple/50",
    desc: "54 production-quality design systems from real products",
    accent: "text-neon-purple",
    badge: null,
  },
];

export default function CreativeCanvasPage() {
  return (
    <div className="min-h-screen bg-dark-950 grid-bg">
      {/* Header */}
      <div className="border-b border-white/10 bg-dark-900/50 px-6 py-5 backdrop-blur-xl border-t-2 border-purple-500/30">
        <div className="flex items-center gap-3">
          <Palette className="w-6 h-6 text-neon-purple" />
          <div>
            <h1 className="text-xl font-bold text-white">Creative Canvas</h1>
            <p className="text-xs text-white/40 font-mono">
              Visual and generative creative tools
            </p>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-6 py-10">
        <p className="text-sm text-white/50 mb-8 max-w-lg leading-relaxed">
          A suite of visual creative tools powered by your agent. Pick a tool to
          get started — each one is a self-contained creative environment.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {tools.map((tool) => (
            <Link
              key={tool.label}
              href={tool.href}
              className={`flex items-start gap-4 rounded-xl border bg-dark-900/50 p-5 transition-all ${tool.color} hover:shadow-[0_0_20px_rgba(168,85,247,0.06)] group`}
            >
              <span className="text-2xl mt-0.5">{tool.icon}</span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <h3 className="font-semibold text-white">{tool.label}</h3>
                  {tool.badge && (
                    <span
                      className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${tool.badge}`}
                    >
                      {tool.badge}
                    </span>
                  )}
                </div>
                <p className="text-xs text-white/40 leading-relaxed">
                  {tool.desc}
                </p>
              </div>
              <ChevronRight className="w-4 h-4 text-white/20 group-hover:text-white/50 flex-shrink-0 mt-1 transition-colors" />
            </Link>
          ))}
        </div>

        <div className="mt-8 p-4 rounded-xl border border-white/5 bg-dark-900/30">
          <h3 className="text-xs font-mono text-white/30 uppercase tracking-widest mb-2">
            More coming soon
          </h3>
          <p className="text-xs text-white/30 font-mono">
            TouchDesigner MCP, Claude Design, and more creative tools are in
            development.
          </p>
        </div>
      </div>
    </div>
  );
}
