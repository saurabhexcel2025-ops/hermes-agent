// ═══════════════════════════════════════════════════════════════
// Gateway Health Check — Proxied through CH to avoid CORS issues
// ═══════════════════════════════════════════════════════════════
// GET /api/gateway/health
// ═══════════════════════════════════════════════════════════════

import { NextResponse } from "next/server";

/** GET /api/gateway/health — Check if Hermes Gateway is reachable. */
export async function GET() {
  try {
    const res = await fetch("http://127.0.0.1:8642/v1/models", {
      method: "GET",
      signal: AbortSignal.timeout(3000),
    });
    if (res.ok) {
      return NextResponse.json({ data: { online: true } });
    }
    return NextResponse.json({ data: { online: false } });
  } catch {
    return NextResponse.json({ data: { online: false } });
  }
}
