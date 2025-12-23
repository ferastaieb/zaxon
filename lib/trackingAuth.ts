import "server-only";

import crypto from "node:crypto";
import { cookies } from "next/headers";

import { getDb, inTransaction, nowIso } from "@/lib/db";
import { execute, queryOne } from "@/lib/sql";

const TRACKING_SESSION_COOKIE_NAME = "logistic_tracking_session";
const TRACKING_SESSION_TTL_DAYS = 7;

function trackingSessionExpiresAt() {
  return new Date(
    Date.now() + TRACKING_SESSION_TTL_DAYS * 86400 * 1000,
  ).toISOString();
}

async function setTrackingSessionCookie(token: string, expiresAtIso: string) {
  const expires = new Date(expiresAtIso);
  const cookieStore = await cookies();
  cookieStore.set(TRACKING_SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: process.env.NODE_ENV === "production",
    expires,
  });
}

export async function clearTrackingSessionCookie() {
  const cookieStore = await cookies();
  cookieStore.set(TRACKING_SESSION_COOKIE_NAME, "", {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: process.env.NODE_ENV === "production",
    expires: new Date(0),
  });
}

export async function getTrackingSessionToken(): Promise<string | null> {
  const cookieStore = await cookies();
  return cookieStore.get(TRACKING_SESSION_COOKIE_NAME)?.value ?? null;
}

export async function createTrackingSession(trackingToken: string): Promise<string> {
  const db = getDb();
  const token = crypto.randomBytes(24).toString("base64url");
  const createdAt = nowIso();
  const expiresAt = trackingSessionExpiresAt();

  inTransaction(db, () => {
    execute(
      "INSERT INTO tracking_sessions (token, tracking_token, expires_at, created_at) VALUES (?, ?, ?, ?)",
      [token, trackingToken, expiresAt, createdAt],
      db,
    );
  });

  await setTrackingSessionCookie(token, expiresAt);
  return token;
}

export function deleteTrackingSession(token: string) {
  const db = getDb();
  execute("DELETE FROM tracking_sessions WHERE token = ?", [token], db);
}

export async function isTrackingSessionValid(trackingToken: string): Promise<boolean> {
  const token = await getTrackingSessionToken();
  if (!token) return false;

  const db = getDb();
  const row = queryOne<{ token: string; tracking_token: string; expires_at: string }>(
    `
      SELECT token, tracking_token, expires_at
      FROM tracking_sessions
      WHERE token = ?
      LIMIT 1
    `,
    [token],
    db,
  );

  if (!row || row.tracking_token !== trackingToken) return false;

  if (Date.parse(row.expires_at) <= Date.now()) {
    deleteTrackingSession(token);
    await clearTrackingSessionCookie();
    return false;
  }

  return true;
}

