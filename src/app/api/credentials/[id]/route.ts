// ═══════════════════════════════════════════════════════════════
// /api/credentials/[id] — get + update + delete a credential
// ═══════════════════════════════════════════════════════════════
import { NextRequest, NextResponse } from "next/server";

import {
  getCredential,
  getCredentialWithKey,
  updateCredential,
  deleteCredential,
} from "@/lib/credentials-repository";
import { logApiError } from "@/lib/api-logger";
import { requireMcApiKey, requireNotReadOnly } from "@/lib/api-auth";
import { appendAuditLine } from "@/lib/audit-log";
import { zodErrorResponse, credentialPutSchema } from "@/lib/api-schemas";
import {
  removeCredentialFromHermesEnv,
  syncCredentialToHermesEnv,
} from "@/lib/hermes-config-sync";
import { isHermesProvider, type HermesProvider } from "@/lib/hermes-providers";

interface Ctx {
  params: Promise<{ id: string }>;
}

export async function GET(_request: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  try {
    const credential = getCredential(id);
    if (!credential) {
      return NextResponse.json({ error: "Credential not found" }, { status: 404 });
    }
    return NextResponse.json({ data: { credential } });
  } catch (error) {
    logApiError("GET /api/credentials/[id]", `id=${id}`, error);
    return NextResponse.json({ error: "Failed to load credential" }, { status: 500 });
  }
}

export async function PUT(request: NextRequest, ctx: Ctx) {
  const ro = requireNotReadOnly();
  if (ro) return ro;
  const auth = requireMcApiKey(request);
  if (auth) return auth;

  const { id } = await ctx.params;
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = credentialPutSchema.safeParse(raw);
  if (!parsed.success) return zodErrorResponse(parsed.error);

  try {
    const credential = updateCredential(id, parsed.data);
    if (!credential) return NextResponse.json({ error: "Credential not found" }, { status: 404 });

    // After a successful DB update, refresh ~/.hermes/.env so Hermes picks
    // up the rotated key and/or new provider mapping. We always read the
    // current plaintext via getCredentialWithKey because parsed.data may
    // have left apiKey unchanged.
    const withKey = getCredentialWithKey(id);
    if (withKey?.apiKey && isHermesProvider(credential.provider)) {
      syncCredentialToHermesEnv({
        provider: credential.provider as HermesProvider,
        apiKey: withKey.apiKey,
      });
    }

    appendAuditLine({ action: "credential.update", resource: id, ok: true });
    return NextResponse.json({ data: { credential } });
  } catch (error) {
    logApiError("PUT /api/credentials/[id]", `id=${id}`, error);
    return NextResponse.json({ error: "Failed to update credential" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, ctx: Ctx) {
  const ro = requireNotReadOnly();
  if (ro) return ro;
  const auth = requireMcApiKey(request);
  if (auth) return auth;

  const { id } = await ctx.params;
  try {
    const existing = getCredential(id);
    if (!existing) return NextResponse.json({ error: "Credential not found" }, { status: 404 });

    const ok = deleteCredential(id);
    if (!ok) return NextResponse.json({ error: "Credential not found" }, { status: 404 });

    if (isHermesProvider(existing.provider)) {
      try {
        removeCredentialFromHermesEnv(existing.provider as HermesProvider);
      } catch (syncErr) {
        logApiError("DELETE /api/credentials/[id]", `removing env for ${id}`, syncErr);
      }
    }

    appendAuditLine({ action: "credential.delete", resource: id, ok: true });
    return NextResponse.json({ data: { deleted: id } });
  } catch (error) {
    logApiError("DELETE /api/credentials/[id]", `id=${id}`, error);
    return NextResponse.json({ error: "Failed to delete credential" }, { status: 500 });
  }
}
