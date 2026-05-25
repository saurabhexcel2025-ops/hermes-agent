// ═══════════════════════════════════════════════════════════════
// /api/memory/route.ts — Memory provider dispatcher
//
// Holographic branch removed: the memory page now renders
// HindsightBrowser directly, so holographic read/write routes
// are permanently orphaned. Hindsight operations go through
// /api/memory/hindsight instead.
// ═══════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from "next/server";

import { getMemoryProviderType } from "@/lib/memory-providers";
import { requireAuth } from "@/lib/api-auth";
import type { ApiResponse } from "@/types/hermes";
import type { MemoryReadResult } from "@/lib/memory-providers";

// ── Shared Error Responses ──────────────────────────────────────

const HINDSIGHT_EDIT_ERROR = NextResponse.json(
  {
    error:
      "Hindsight facts are managed through agent tools (hindsight_retain). Dashboard editing is not supported for Hindsight.",
  },
  { status: 400 }
);

const NO_PROVIDER_ERROR = NextResponse.json(
  { error: "No memory provider configured" },
  { status: 404 }
);

function dormantResponse(): NextResponse<ApiResponse<MemoryReadResult>> {
  return NextResponse.json<ApiResponse<MemoryReadResult>>({
    data: {
      facts: [], total: 0, dbSize: 0,
      available: true, provider: "hindsight",
      message: "Hindsight memory is active. Facts are managed through agent tools: " +
        "hindsight_retain (store), hindsight_recall (search), hindsight_reflect (reason).",
    },
  });
}

function noMemoryResponse(): NextResponse<ApiResponse<MemoryReadResult>> {
  return NextResponse.json<ApiResponse<MemoryReadResult>>({
    data: {
      facts: [], total: 0, dbSize: 0, available: false, provider: "none",
      message: "No memory provider configured. Run: hermes memory setup",
    },
  });
}

// ── GET — Read memory status (holographic branch removed) ──────
// For Hindsight embedded: dormant status (facts managed via agent tools)
// This endpoint is no longer called by the memory page — kept for API parity.
export async function GET() {
  const providerType = getMemoryProviderType();

  if (providerType === "hindsight") return dormantResponse();
  if (providerType === "none") return noMemoryResponse();

  // holographic — no longer reachable via the UI, but keep dormant for API compat
  return dormantResponse();
}

// POST, PUT, DELETE — holographic-only; Hindsight redirects to error
export async function POST(request: NextRequest) {
  const auth = requireAuth(request);
  if (auth) return auth;

  const providerType = getMemoryProviderType();
  if (providerType === "hindsight") return HINDSIGHT_EDIT_ERROR;
  if (providerType === "none") return NO_PROVIDER_ERROR;

  // holographic — orphaned; redirect to error
  return NextResponse.json({ error: "Holographic memory is no longer supported via the dashboard." }, { status: 410 });
}

export async function PUT(request: NextRequest) {
  const auth = requireAuth(request);
  if (auth) return auth;

  const providerType = getMemoryProviderType();
  if (providerType === "hindsight") return HINDSIGHT_EDIT_ERROR;
  if (providerType === "none") return NO_PROVIDER_ERROR;

  return NextResponse.json({ error: "Holographic memory is no longer supported via the dashboard." }, { status: 410 });
}

export async function DELETE(request: NextRequest) {
  const auth = requireAuth(request);
  if (auth) return auth;

  const providerType = getMemoryProviderType();
  if (providerType === "hindsight") {
    return NextResponse.json(
      { error: "Hindsight facts are managed through agent tools (hindsight_retain). Dashboard deletion is not supported for Hindsight." },
      { status: 400 }
    );
  }
  if (providerType === "none") return NO_PROVIDER_ERROR;

  return NextResponse.json({ error: "Holographic memory is no longer supported via the dashboard." }, { status: 410 });
}
