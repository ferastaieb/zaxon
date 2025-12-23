import "server-only";

import type { DatabaseSync } from "node:sqlite";
import { getDb } from "@/lib/db";

export type SqlValue = string | number | bigint | null | Uint8Array;

function toPlainObject<T>(value: T): T {
  if (!value || typeof value !== "object") return value;
  if (value instanceof Uint8Array) return value;
  if (Array.isArray(value)) return value.map(toPlainObject) as T;

  const proto = Object.getPrototypeOf(value);
  if (proto === Object.prototype) return value;
  return { ...(value as Record<string, unknown>) } as T;
}

function normalizeParam(value: unknown, index: number): SqlValue {
  if (value === undefined) {
    throw new TypeError(`SQLite parameter ${index + 1} is undefined`);
  }
  if (typeof value === "boolean") return value ? 1 : 0;
  if (value instanceof Date) return value.toISOString();
  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "bigint" ||
    value === null ||
    value instanceof Uint8Array
  ) {
    return value;
  }
  throw new TypeError(
    `SQLite parameter ${index + 1} has unsupported type: ${typeof value}`,
  );
}

function normalizeParams(params: unknown[]): SqlValue[] {
  return params.map(normalizeParam);
}

export function queryAll<T>(
  sql: string,
  params: unknown[] = [],
  db: DatabaseSync = getDb(),
): T[] {
  const rows = db.prepare(sql).all(...normalizeParams(params));
  return toPlainObject(rows) as T[];
}

export function queryOne<T>(
  sql: string,
  params: unknown[] = [],
  db: DatabaseSync = getDb(),
): T | null {
  const row = db.prepare(sql).get(...normalizeParams(params)) as T | undefined;
  return row ? (toPlainObject(row) as T) : null;
}

export function execute(
  sql: string,
  params: unknown[] = [],
  db: DatabaseSync = getDb(),
): { lastInsertRowid: number; changes: number } {
  const result = db.prepare(sql).run(...normalizeParams(params)) as unknown as {
    lastInsertRowid: number;
    changes: number;
  };
  return result;
}

export function jsonParse<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

export function nonEmptyOrNull(value: FormDataEntryValue | null): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
}
