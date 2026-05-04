import { NextResponse } from "next/server";

// /api/agent is a namespace prefix — sub-routes handle their own routes.
// This catches any direct hit to /api/agent that has no specific handler.
export async function GET() {
  return NextResponse.json({ error: "Not Found" }, { status: 404 });
}

export async function POST() {
  return NextResponse.json({ error: "Not Found" }, { status: 404 });
}
