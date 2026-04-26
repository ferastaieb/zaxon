import "server-only";

import crypto from "node:crypto";
import { cookies } from "next/headers";

import { deleteItem, getItem, nowIso, putItem, tableName } from "@/lib/db";
import { getTrackingCustomerPartyIdForToken } from "@/lib/data/tracking";

const TRACKING_SESSION_COOKIE_NAME = "logistic_tracking_session";
const TRACKING_SESSION_TTL_DAYS = 7;

const TRACKING_SESSIONS_TABLE = tableName("tracking_sessions");

type TrackingSessionRow = {
  token: string;
  tracking_token: string;
  customer_party_id?: number | null;
  expires_at: string;
  created_at: string;
};

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

export async function getValidTrackingSession(): Promise<TrackingSessionRow | null> {
  const token = await getTrackingSessionToken();
  if (!token) return null;

  const row = await getItem<TrackingSessionRow>(TRACKING_SESSIONS_TABLE, { token });
  if (!row) return null;

  if (Date.parse(row.expires_at) <= Date.now()) {
    await deleteTrackingSession(token);
    await clearTrackingSessionCookie();
    return null;
  }

  return row;
}

export async function createTrackingSession(input: {
  trackingToken: string;
  customerPartyId?: number | null;
}): Promise<string> {
  const token = crypto.randomBytes(24).toString("base64url");
  const createdAt = nowIso();
  const expiresAt = trackingSessionExpiresAt();

  await putItem(TRACKING_SESSIONS_TABLE, {
    token,
    tracking_token: input.trackingToken,
    customer_party_id: input.customerPartyId ?? null,
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
  const row = await getValidTrackingSession();
  if (!row) return false;
  if (row.tracking_token === trackingToken) return true;

  const customerPartyId =
    typeof row.customer_party_id === "number" && row.customer_party_id > 0
      ? row.customer_party_id
      : null;
  if (!customerPartyId) return false;

  const expectedCustomerPartyId = await getTrackingCustomerPartyIdForToken(trackingToken);
  if (!expectedCustomerPartyId) return false;

  return expectedCustomerPartyId === customerPartyId;
}

export async function getTrackingSessionCustomerPartyId(
  fallbackTrackingToken?: string,
): Promise<number | null> {
  const row = await getValidTrackingSession();
  if (!row) return null;
  if (typeof row.customer_party_id === "number" && row.customer_party_id > 0) {
    return row.customer_party_id;
  }

  if (!fallbackTrackingToken) return null;
  return getTrackingCustomerPartyIdForToken(fallbackTrackingToken);
}
