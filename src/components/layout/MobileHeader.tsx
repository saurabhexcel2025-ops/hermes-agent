// MobileHeader — Full-width top bar with hamburger on mobile only
"use client";
import { Menu } from "lucide-react";
import { useSidebar } from "./SidebarContext";

export default function MobileHeader() {
  const { toggleMobile } = useSidebar();

  /* Compact mobile chrome (3rem): sidebar overlay entrypoint — intentionally shorter than desktop `--ch-shell-header-min-height` (5rem). */
  return (
    <div className="lg:hidden sticky top-0 z-50 flex items-center min-h-[var(--ch-mobile-header-min-height)] px-3 bg-dark-950/95 backdrop-blur-xl border-b border-white/10 flex-shrink-0">
      <button
        onClick={toggleMobile}
        className="p-2 rounded-lg text-white/60 hover:text-white/80 hover:bg-white/5 transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center"
        aria-label="Open navigation"
      >
        <Menu className="w-5 h-5" />
      </button>
    </div>
  );
}
