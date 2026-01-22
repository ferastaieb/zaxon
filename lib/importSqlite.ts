import "server-only";

import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

import { getItem, putItem, tableName } from "@/lib/db";

const IMPORT_TABLES = new Set([
  "users",
  "user_sessions",
  "parties",
  "workflow_templates",
  "workflow_template_steps",
  "template_rules",
  "exception_types",
  "exception_playbook_tasks",
  "shipments",
  "shipment_access",
  "shipment_steps",
  "shipment_customers",
  "shipment_links",
  "goods",
  "shipment_goods",
  "shipment_goods_allocations",
  "inventory_transactions",
  "inventory_balances",
  "shipment_exceptions",
  "tasks",
  "document_requests",
  "documents",
  "activities",
  "alerts",
  "tracking_tokens",
  "tracking_sessions",
  "shipment_job_ids",
]);

const COUNTER_ENTITIES = new Set([
  "activities",
  "alerts",
  "document_requests",
  "documents",
  "exception_types",
  "exception_playbook_tasks",
  "shipment_exceptions",
  "goods",
  "shipment_goods",
  "inventory_transactions",
  "shipment_goods_allocations",
  "parties",
  "shipment_links",
  "shipments",
  "shipment_job_ids",
  "shipment_steps",
  "tasks",
  "users",
  "workflow_templates",
  "workflow_template_steps",
  "template_rules",
]);

const KEY_FIELDS: Record<string, string[]> = {
  users: ["id"],
  user_sessions: ["token"],
  parties: ["id"],
  workflow_templates: ["id"],
  workflow_template_steps: ["id"],
  template_rules: ["id"],
  exception_types: ["id"],
  exception_playbook_tasks: ["id"],
  shipments: ["id"],
  shipment_access: ["shipment_id", "user_id"],
  shipment_steps: ["id"],
  shipment_customers: ["shipment_id", "customer_party_id"],
  shipment_links: ["id"],
  goods: ["id"],
  shipment_goods: ["id"],
  shipment_goods_allocations: ["id"],
  inventory_transactions: ["id"],
  inventory_balances: ["owner_user_id", "good_id"],
  shipment_exceptions: ["id"],
  tasks: ["id"],
  document_requests: ["id"],
  documents: ["id"],
  activities: ["id"],
  alerts: ["id"],
  tracking_tokens: ["token"],
  tracking_sessions: ["token"],
  shipment_job_ids: ["id"],
};

export type ImportSummary = {
  totalRows: number;
  tableCounts: Record<string, number>;
  countersUpdated: number;
};

function isSqliteHeader(buffer: Buffer): boolean {
  if (buffer.length < 16) return false;
  return buffer.slice(0, 16).toString("utf8") === "SQLite format 3\0";
}

function normalizeValue(value: unknown) {
  if (value === undefined) return undefined;
  if (typeof value === "bigint") return Number(value);
  if (value instanceof Uint8Array) return Buffer.from(value);
  return value;
}

function normalizeRow(table: string, row: Record<string, unknown>) {
  const keyFields = new Set(KEY_FIELDS[table] ?? []);
  const output: Record<string, unknown> = {};
  for (const [key, rawValue] of Object.entries(row)) {
    const value = normalizeValue(rawValue);
    if (value === undefined) continue;
    if (value === "" && !keyFields.has(key)) {
      output[key] = null;
    } else {
      output[key] = value;
    }
  }
  return output;
}

function safeTableName(name: string) {
  return `"${name.replace(/"/g, '""')}"`;
}

export async function importSqliteBuffer(buffer: Buffer): Promise<ImportSummary> {
  if (!isSqliteHeader(buffer)) {
    throw new Error("invalid_sqlite");
  }

  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "logistic-import-"));
  const filePath = path.join(tempDir, `import-${crypto.randomUUID()}.sqlite`);
  await fs.writeFile(filePath, buffer);

  let db: DatabaseSync | null = null;
  const tableCounts: Record<string, number> = {};
  const maxIds: Record<string, number> = {};
  let totalRows = 0;

  try {
    db = new DatabaseSync(filePath);
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
      .all() as { name: string }[];

    for (const row of tables) {
      const name = String(row.name);
      if (!IMPORT_TABLES.has(name)) continue;

      const rows = db
        .prepare(`SELECT * FROM ${safeTableName(name)}`)
        .all() as Record<string, unknown>[];
      tableCounts[name] = rows.length;

      for (const raw of rows) {
        const normalized = normalizeRow(name, raw);
        await putItem(tableName(name), normalized);
        totalRows += 1;

        if (COUNTER_ENTITIES.has(name)) {
          const idValue = normalized.id;
          if (typeof idValue === "number" && Number.isFinite(idValue)) {
            maxIds[name] = Math.max(maxIds[name] ?? 0, idValue);
          }
        }
      }
    }

    let countersUpdated = 0;
    for (const [entity, maxId] of Object.entries(maxIds)) {
      const counterTable = tableName("counters");
      const existing = await getItem<{ entity: string; value?: number }>(
        counterTable,
        { entity },
      );
      const value = Math.max(existing?.value ?? 0, maxId);
      await putItem(counterTable, { entity, value });
      countersUpdated += 1;
    }

    return { totalRows, tableCounts, countersUpdated };
  } finally {
    try {
      db?.close();
    } catch {
      // Ignore close errors to avoid masking import failures.
    }
    await fs.rm(tempDir, { recursive: true, force: true });
  }
}
