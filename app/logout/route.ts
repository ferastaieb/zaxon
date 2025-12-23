import { NextResponse } from "next/server";

import { clearSessionCookie, deleteSession, getSessionToken } from "@/lib/auth";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const token = await getSessionToken();
  if (token) deleteSession(token);
  await clearSessionCookie();

  return NextResponse.redirect(new URL("/login", request.url));
}

export async function GET(request: Request) {
  const token = await getSessionToken();
  if (token) deleteSession(token);
  await clearSessionCookie();

  return NextResponse.redirect(new URL("/login", request.url));
}
