import "server-only";

import crypto from "node:crypto";
import { cookies } from "next/headers";

import { deleteItem, getItem, nowIso, putItem, tableName } from "@/lib/db";

const TRACKING_SESSION_COOKIE_NAME = "logistic_tracking_session";
const TRACKING_SESSION_TTL_DAYS = 7;

const TRACKING_SESSIONS_TABLE = tableName("tracking_sessions");

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
  const token = crypto.randomBytes(24).toString("base64url");
  const createdAt = nowIso();
  const expiresAt = trackingSessionExpiresAt();

  await putItem(TRACKING_SESSIONS_TABLE, {
    token,
    tracking_token: trackingToken,
    expires_at: expiresAt,
    created_at: createdAt,
  });

  await setTrackingSessionCookie(token, expiresAt);
  return token;
}

export async function deleteTrackingSession(token: string) {
  await deleteItem(TRACKING_SESSIONS_TABLE, { token });
}

export async function isTrackingSessionValid(
  trackingToken: string,
): Promise<boolean> {
  const token = await getTrackingSessionToken();
  if (!token) return false;

  const row = await getItem<{ token: string; tracking_token: string; expires_at: string }>(
    TRACKING_SESSIONS_TABLE,
    { token },
  );

  if (!row || row.tracking_token !== trackingToken) return false;

  if (Date.parse(row.expires_at) <= Date.now()) {
    await deleteTrackingSession(token);
    return false;
  }

  return true;
}
