import "server-only";

import crypto from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import type { Role } from "@/lib/domain";
import { getDb, inTransaction, nowIso } from "@/lib/db";
import { execute, queryOne } from "@/lib/sql";

const SESSION_COOKIE_NAME = "logistic_session";
const SESSION_TTL_DAYS = 30;

export type AuthUser = {
  id: number;
  name: string;
  phone: string;
  role: Role;
  disabled: 0 | 1;
};

function safeEqual(a: Uint8Array, b: Uint8Array) {
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16);
  const derivedKey = crypto.scryptSync(password, salt, 32);
  return `scrypt$${salt.toString("base64")}$${Buffer.from(derivedKey).toString(
    "base64",
  )}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const parts = stored.split("$");
  if (parts.length !== 3) return false;
  const [algo, saltB64, hashB64] = parts;
  if (algo !== "scrypt") return false;
  const salt = Buffer.from(saltB64, "base64");
  const expected = Buffer.from(hashB64, "base64");
  const actual = crypto.scryptSync(password, salt, expected.length);
  return safeEqual(expected, actual);
}

function sessionExpiresAt() {
  return new Date(Date.now() + SESSION_TTL_DAYS * 86400 * 1000).toISOString();
}

async function setSessionCookie(token: string, expiresAtIso: string) {
  const expires = new Date(expiresAtIso);
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: process.env.NODE_ENV === "production",
    expires,
  });
}

export async function clearSessionCookie() {
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE_NAME, "", {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: process.env.NODE_ENV === "production",
    expires: new Date(0),
  });
}

export async function getSessionToken(): Promise<string | null> {
  const cookieStore = await cookies();
  return cookieStore.get(SESSION_COOKIE_NAME)?.value ?? null;
}

export async function createSession(userId: number): Promise<string> {
  const db = getDb();
  const token = crypto.randomBytes(24).toString("base64url");
  const createdAt = nowIso();
  const expiresAt = sessionExpiresAt();

  inTransaction(db, () => {
    execute(
      "INSERT INTO user_sessions (token, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)",
      [token, userId, expiresAt, createdAt],
      db,
    );
  });

  await setSessionCookie(token, expiresAt);
  return token;
}

export function deleteSession(token: string) {
  const db = getDb();
  execute("DELETE FROM user_sessions WHERE token = ?", [token], db);
}

export async function logout() {
  const token = await getSessionToken();
  if (token) deleteSession(token);
  await clearSessionCookie();
  redirect("/login");
}

export async function getCurrentUser(): Promise<AuthUser | null> {
  const token = await getSessionToken();
  if (!token) return null;

  const db = getDb();
  const row = queryOne<{
    token: string;
    expires_at: string;
    id: number;
    name: string;
    phone: string;
    role: Role;
    disabled: 0 | 1;
  }>(
    `
      SELECT
        s.token,
        s.expires_at,
        u.id,
        u.name,
        u.phone,
        u.role,
        u.disabled
      FROM user_sessions s
      JOIN users u ON u.id = s.user_id
      WHERE s.token = ?
      LIMIT 1
    `,
    [token],
    db,
  );

  if (!row) {
    await clearSessionCookie();
    return null;
  }

  if (row.disabled) {
    deleteSession(token);
    await clearSessionCookie();
    return null;
  }

  if (Date.parse(row.expires_at) <= Date.now()) {
    deleteSession(token);
    await clearSessionCookie();
    return null;
  }

  return {
    id: row.id,
    name: row.name,
    phone: row.phone,
    role: row.role,
    disabled: row.disabled,
  };
}

export async function requireUser(): Promise<AuthUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

export async function requireAdmin(): Promise<AuthUser> {
  const user = await requireUser();
  if (user.role !== "ADMIN") redirect("/forbidden");
  return user;
}

export function canWrite(role: Role) {
  return role !== "FINANCE";
}

export function assertCanWrite(user: AuthUser) {
  if (!canWrite(user.role)) redirect("/forbidden");
}
