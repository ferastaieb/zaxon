import "server-only";

import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

const SCHEMA_VERSION = 9;

declare global {
  var __logisticDb: DatabaseSync | undefined;
}

function getDbPath(): string {
  return (
    process.env.SQLITE_PATH ??
    path.join(process.cwd(), "data", "logistic.sqlite")
  );
}

function migrateToV1(db: DatabaseSync) {
  db.exec(`
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      phone TEXT NOT NULL UNIQUE,
      role TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      disabled INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS user_sessions (
      token TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS parties (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL,
      name TEXT NOT NULL,
      phone TEXT,
      email TEXT,
      address TEXT,
      notes TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS workflow_templates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      description TEXT,
      is_archived INTEGER NOT NULL DEFAULT 0,
      is_subworkflow INTEGER NOT NULL DEFAULT 0,
      global_variables_json TEXT NOT NULL DEFAULT '[]',
      created_at TEXT NOT NULL,
      created_by_user_id INTEGER REFERENCES users(id),
      updated_at TEXT NOT NULL,
      updated_by_user_id INTEGER REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS workflow_template_steps (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      template_id INTEGER NOT NULL REFERENCES workflow_templates(id) ON DELETE CASCADE,
      sort_order INTEGER NOT NULL,
      name TEXT NOT NULL,
      owner_role TEXT NOT NULL,
      required_fields_json TEXT NOT NULL DEFAULT '[]',
      required_document_types_json TEXT NOT NULL DEFAULT '[]',
      sla_hours INTEGER,
      customer_visible INTEGER NOT NULL DEFAULT 0,
      is_external INTEGER NOT NULL DEFAULT 0,
      checklist_groups_json TEXT NOT NULL DEFAULT '[]',
      field_schema_json TEXT NOT NULL DEFAULT '{}',
      group_id TEXT,
      group_label TEXT,
      group_template_id INTEGER,
      customer_completion_message_template TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE (template_id, sort_order)
    );

    CREATE TABLE IF NOT EXISTS template_rules (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      template_id INTEGER NOT NULL REFERENCES workflow_templates(id) ON DELETE CASCADE,
      transport_mode TEXT,
      origin TEXT,
      destination TEXT,
      shipment_type TEXT,
      customer_party_id INTEGER REFERENCES parties(id),
      created_at TEXT NOT NULL,
      created_by_user_id INTEGER REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS exception_types (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      description TEXT,
      default_risk TEXT NOT NULL,
      customer_message_template TEXT,
      is_archived INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      created_by_user_id INTEGER REFERENCES users(id),
      updated_at TEXT NOT NULL,
      updated_by_user_id INTEGER REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS exception_playbook_tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      exception_type_id INTEGER NOT NULL REFERENCES exception_types(id) ON DELETE CASCADE,
      sort_order INTEGER NOT NULL,
      title TEXT NOT NULL,
      owner_role TEXT NOT NULL,
      due_hours INTEGER,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE (exception_type_id, sort_order)
    );

    CREATE TABLE IF NOT EXISTS shipments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      shipment_code TEXT NOT NULL UNIQUE,
      customer_party_id INTEGER NOT NULL REFERENCES parties(id),
      transport_mode TEXT NOT NULL,
      origin TEXT NOT NULL,
      destination TEXT NOT NULL,
      shipment_type TEXT NOT NULL,
      container_number TEXT,
      bl_number TEXT,
      job_id TEXT,
      cargo_description TEXT NOT NULL,
      packages_count INTEGER,
      weight_kg REAL,
      dimensions TEXT,
      etd TEXT,
      eta TEXT,
      overall_status TEXT NOT NULL,
      risk TEXT NOT NULL,
      workflow_template_id INTEGER REFERENCES workflow_templates(id),
      workflow_global_values_json TEXT NOT NULL DEFAULT '{}',
      last_update_at TEXT NOT NULL,
      last_update_by_user_id INTEGER REFERENCES users(id),
      created_at TEXT NOT NULL,
      created_by_user_id INTEGER REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS shipment_access (
      shipment_id INTEGER NOT NULL REFERENCES shipments(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      granted_by_user_id INTEGER REFERENCES users(id),
      created_at TEXT NOT NULL,
      PRIMARY KEY (shipment_id, user_id)
    );

    CREATE TABLE IF NOT EXISTS shipment_steps (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      shipment_id INTEGER NOT NULL REFERENCES shipments(id) ON DELETE CASCADE,
      sort_order INTEGER NOT NULL,
      name TEXT NOT NULL,
      owner_role TEXT NOT NULL,
      related_party_id INTEGER REFERENCES parties(id) ON DELETE SET NULL,
      status TEXT NOT NULL,
      notes TEXT,
      required_fields_json TEXT NOT NULL DEFAULT '[]',
      required_document_types_json TEXT NOT NULL DEFAULT '[]',
      field_values_json TEXT NOT NULL DEFAULT '{}',
      field_schema_json TEXT NOT NULL DEFAULT '{}',
      sla_hours INTEGER,
      due_at TEXT,
      started_at TEXT,
      completed_at TEXT,
      customer_visible INTEGER NOT NULL DEFAULT 0,
      is_external INTEGER NOT NULL DEFAULT 0,
      checklist_groups_json TEXT NOT NULL DEFAULT '[]',
      customer_completion_message_template TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE (shipment_id, sort_order)
    );

    CREATE TABLE IF NOT EXISTS shipment_customers (
      shipment_id INTEGER NOT NULL REFERENCES shipments(id) ON DELETE CASCADE,
      customer_party_id INTEGER NOT NULL REFERENCES parties(id),
      created_at TEXT NOT NULL,
      created_by_user_id INTEGER REFERENCES users(id),
      PRIMARY KEY (shipment_id, customer_party_id)
    );

    CREATE TABLE IF NOT EXISTS goods (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      owner_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      origin TEXT NOT NULL,
      unit_type TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE (owner_user_id, name, origin)
    );

    CREATE TABLE IF NOT EXISTS shipment_goods (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      shipment_id INTEGER NOT NULL REFERENCES shipments(id) ON DELETE CASCADE,
      good_id INTEGER NOT NULL REFERENCES goods(id),
      owner_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      customer_party_id INTEGER REFERENCES parties(id),
      applies_to_all_customers INTEGER NOT NULL DEFAULT 0,
      quantity INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      created_by_user_id INTEGER REFERENCES users(id),
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS shipment_goods_allocations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      shipment_good_id INTEGER NOT NULL REFERENCES shipment_goods(id) ON DELETE CASCADE,
      step_id INTEGER NOT NULL REFERENCES shipment_steps(id) ON DELETE CASCADE,
      taken_quantity INTEGER NOT NULL,
      inventory_quantity INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      created_by_user_id INTEGER REFERENCES users(id),
      UNIQUE (shipment_good_id, step_id)
    );

    CREATE TABLE IF NOT EXISTS inventory_transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      owner_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      good_id INTEGER NOT NULL REFERENCES goods(id),
      shipment_id INTEGER REFERENCES shipments(id) ON DELETE SET NULL,
      shipment_good_id INTEGER REFERENCES shipment_goods(id) ON DELETE SET NULL,
      step_id INTEGER REFERENCES shipment_steps(id) ON DELETE SET NULL,
      direction TEXT NOT NULL,
      quantity INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      note TEXT
    );

    CREATE TABLE IF NOT EXISTS inventory_balances (
      owner_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      good_id INTEGER NOT NULL REFERENCES goods(id),
      quantity INTEGER NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (owner_user_id, good_id)
    );

    CREATE TABLE IF NOT EXISTS shipment_exceptions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      shipment_id INTEGER NOT NULL REFERENCES shipments(id) ON DELETE CASCADE,
      exception_type_id INTEGER NOT NULL REFERENCES exception_types(id),
      status TEXT NOT NULL,
      notes TEXT,
      customer_message TEXT,
      share_with_customer INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      created_by_user_id INTEGER REFERENCES users(id),
      resolved_at TEXT,
      resolved_by_user_id INTEGER REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      shipment_id INTEGER NOT NULL REFERENCES shipments(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      related_party_id INTEGER REFERENCES parties(id) ON DELETE SET NULL,
      assignee_user_id INTEGER REFERENCES users(id),
      assignee_role TEXT,
      due_at TEXT,
      status TEXT NOT NULL,
      linked_exception_id INTEGER REFERENCES shipment_exceptions(id) ON DELETE SET NULL,
      created_at TEXT NOT NULL,
      created_by_user_id INTEGER REFERENCES users(id),
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS document_requests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      shipment_id INTEGER NOT NULL REFERENCES shipments(id) ON DELETE CASCADE,
      document_type TEXT NOT NULL,
      message TEXT,
      status TEXT NOT NULL,
      requested_by_user_id INTEGER REFERENCES users(id),
      requested_at TEXT NOT NULL,
      fulfilled_at TEXT
    );

    CREATE TABLE IF NOT EXISTS documents (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      shipment_id INTEGER NOT NULL REFERENCES shipments(id) ON DELETE CASCADE,
      file_name TEXT NOT NULL,
      storage_path TEXT NOT NULL,
      mime_type TEXT,
      size_bytes INTEGER,
      document_type TEXT NOT NULL,
      is_required INTEGER NOT NULL DEFAULT 0,
      is_received INTEGER NOT NULL DEFAULT 1,
      share_with_customer INTEGER NOT NULL DEFAULT 0,
      source TEXT NOT NULL DEFAULT 'STAFF',
      document_request_id INTEGER REFERENCES document_requests(id) ON DELETE SET NULL,
      uploaded_by_user_id INTEGER REFERENCES users(id),
      uploaded_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS activities (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      shipment_id INTEGER NOT NULL REFERENCES shipments(id) ON DELETE CASCADE,
      type TEXT NOT NULL,
      message TEXT NOT NULL,
      actor_user_id INTEGER REFERENCES users(id),
      created_at TEXT NOT NULL,
      data_json TEXT
    );

    CREATE TABLE IF NOT EXISTS alerts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      shipment_id INTEGER REFERENCES shipments(id) ON DELETE CASCADE,
      type TEXT NOT NULL,
      message TEXT NOT NULL,
      dedupe_key TEXT NOT NULL,
      is_read INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      UNIQUE (user_id, dedupe_key)
    );

    CREATE TABLE IF NOT EXISTS tracking_tokens (
      token TEXT PRIMARY KEY,
      shipment_id INTEGER NOT NULL REFERENCES shipments(id) ON DELETE CASCADE,
      created_at TEXT NOT NULL,
      revoked_at TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_shipments_customer ON shipments(customer_party_id);
    CREATE INDEX IF NOT EXISTS idx_shipments_mode ON shipments(transport_mode);
    CREATE INDEX IF NOT EXISTS idx_shipments_last_update ON shipments(last_update_at);
    CREATE INDEX IF NOT EXISTS idx_shipments_container ON shipments(container_number);
    CREATE INDEX IF NOT EXISTS idx_shipments_bl ON shipments(bl_number);
    CREATE INDEX IF NOT EXISTS idx_shipments_job_id ON shipments(job_id);

    CREATE INDEX IF NOT EXISTS idx_steps_shipment ON shipment_steps(shipment_id);
    CREATE INDEX IF NOT EXISTS idx_tasks_shipment ON tasks(shipment_id);
    CREATE INDEX IF NOT EXISTS idx_docs_shipment ON documents(shipment_id);
    CREATE INDEX IF NOT EXISTS idx_activity_shipment ON activities(shipment_id);
    CREATE INDEX IF NOT EXISTS idx_alerts_user ON alerts(user_id, is_read);
    CREATE INDEX IF NOT EXISTS idx_shipment_customers_customer ON shipment_customers(customer_party_id);
    CREATE INDEX IF NOT EXISTS idx_shipment_goods_shipment ON shipment_goods(shipment_id);
    CREATE INDEX IF NOT EXISTS idx_shipment_goods_owner ON shipment_goods(owner_user_id);
    CREATE INDEX IF NOT EXISTS idx_goods_owner ON goods(owner_user_id);
    CREATE INDEX IF NOT EXISTS idx_inventory_tx_owner ON inventory_transactions(owner_user_id);
    CREATE INDEX IF NOT EXISTS idx_inventory_tx_good ON inventory_transactions(good_id);
    CREATE INDEX IF NOT EXISTS idx_inventory_tx_shipment ON inventory_transactions(shipment_id);
  `);
}

function migrateToV2(db: DatabaseSync) {
  db.exec(`PRAGMA foreign_keys = ON;`);

  const columns = db.prepare("PRAGMA table_info(shipment_steps)").all() as Array<
    { name?: string } | undefined
  >;
  const hasFieldValues = columns.some((c) => c?.name === "field_values_json");
  if (!hasFieldValues) {
    db.exec(
      "ALTER TABLE shipment_steps ADD COLUMN field_values_json TEXT NOT NULL DEFAULT '{}'",
    );
  }
}

function migrateToV3(db: DatabaseSync) {
  db.exec(`
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS tracking_sessions (
      token TEXT PRIMARY KEY,
      tracking_token TEXT NOT NULL REFERENCES tracking_tokens(token) ON DELETE CASCADE,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_tracking_sessions_token ON tracking_sessions(tracking_token);
  `);
}

function migrateToV4(db: DatabaseSync) {
  db.exec(`PRAGMA foreign_keys = ON;`);

  const stepColumns = db.prepare("PRAGMA table_info(shipment_steps)").all() as Array<
    { name?: string } | undefined
  >;
  const hasStepParty = stepColumns.some((c) => c?.name === "related_party_id");
  if (!hasStepParty) {
    db.exec(
      "ALTER TABLE shipment_steps ADD COLUMN related_party_id INTEGER REFERENCES parties(id) ON DELETE SET NULL",
    );
  }

  const taskColumns = db.prepare("PRAGMA table_info(tasks)").all() as Array<
    { name?: string } | undefined
  >;
  const hasTaskParty = taskColumns.some((c) => c?.name === "related_party_id");
  if (!hasTaskParty) {
    db.exec(
      "ALTER TABLE tasks ADD COLUMN related_party_id INTEGER REFERENCES parties(id) ON DELETE SET NULL",
    );
  }

  const exceptionColumns = db
    .prepare("PRAGMA table_info(shipment_exceptions)")
    .all() as Array<{ name?: string } | undefined>;
  const hasShareWithCustomer = exceptionColumns.some(
    (c) => c?.name === "share_with_customer",
  );
  if (!hasShareWithCustomer) {
    db.exec(
      "ALTER TABLE shipment_exceptions ADD COLUMN share_with_customer INTEGER NOT NULL DEFAULT 0",
    );
  }
}

function migrateToV5(db: DatabaseSync) {
  db.exec(`PRAGMA foreign_keys = ON;`);

  const shipmentColumns = db.prepare("PRAGMA table_info(shipments)").all() as Array<
    { name?: string } | undefined
  >;
  const hasJobId = shipmentColumns.some((c) => c?.name === "job_id");
  if (!hasJobId) {
    db.exec("ALTER TABLE shipments ADD COLUMN job_id TEXT");
    db.exec("CREATE INDEX IF NOT EXISTS idx_shipments_job_id ON shipments(job_id)");
  }
}

function migrateToV6(db: DatabaseSync) {
  db.exec(`
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS shipment_job_ids (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      shipment_id INTEGER NOT NULL REFERENCES shipments(id) ON DELETE CASCADE,
      job_id TEXT NOT NULL,
      created_at TEXT NOT NULL,
      created_by_user_id INTEGER REFERENCES users(id),
      UNIQUE (shipment_id, job_id)
    );

    CREATE INDEX IF NOT EXISTS idx_shipment_job_ids_shipment ON shipment_job_ids(shipment_id);
    CREATE INDEX IF NOT EXISTS idx_shipment_job_ids_job_id ON shipment_job_ids(job_id);
  `);

  // Backfill from the legacy single-column field (introduced in v5).
  const shipmentColumns = db.prepare("PRAGMA table_info(shipments)").all() as Array<
    { name?: string } | undefined
  >;
  const hasJobId = shipmentColumns.some((c) => c?.name === "job_id");
  if (hasJobId) {
    db.exec(`
      INSERT OR IGNORE INTO shipment_job_ids (shipment_id, job_id, created_at, created_by_user_id)
      SELECT id, TRIM(job_id), created_at, created_by_user_id
      FROM shipments
      WHERE job_id IS NOT NULL AND TRIM(job_id) <> ''
    `);
  }
}

function migrateToV7(db: DatabaseSync) {
  db.exec(`PRAGMA foreign_keys = ON;`);

  const templateColumns = db
    .prepare("PRAGMA table_info(workflow_template_steps)")
    .all() as Array<{ name?: string } | undefined>;
  const hasTemplateExternal = templateColumns.some((c) => c?.name === "is_external");
  if (!hasTemplateExternal) {
    db.exec(
      "ALTER TABLE workflow_template_steps ADD COLUMN is_external INTEGER NOT NULL DEFAULT 0",
    );
  }
  const hasTemplateChecklists = templateColumns.some(
    (c) => c?.name === "checklist_groups_json",
  );
  if (!hasTemplateChecklists) {
    db.exec(
      "ALTER TABLE workflow_template_steps ADD COLUMN checklist_groups_json TEXT NOT NULL DEFAULT '[]'",
    );
  }

  const stepColumns = db.prepare("PRAGMA table_info(shipment_steps)").all() as Array<
    { name?: string } | undefined
  >;
  const hasStepExternal = stepColumns.some((c) => c?.name === "is_external");
  if (!hasStepExternal) {
    db.exec("ALTER TABLE shipment_steps ADD COLUMN is_external INTEGER NOT NULL DEFAULT 0");
  }
  const hasStepChecklists = stepColumns.some(
    (c) => c?.name === "checklist_groups_json",
  );
  if (!hasStepChecklists) {
    db.exec(
      "ALTER TABLE shipment_steps ADD COLUMN checklist_groups_json TEXT NOT NULL DEFAULT '[]'",
    );
  }
}

function migrateToV8(db: DatabaseSync) {
  db.exec(`PRAGMA foreign_keys = ON;`);

  const templateColumns = db
    .prepare("PRAGMA table_info(workflow_templates)")
    .all() as Array<{ name?: string } | undefined>;
  const hasSubworkflow = templateColumns.some((c) => c?.name === "is_subworkflow");
  if (!hasSubworkflow) {
    db.exec(
      "ALTER TABLE workflow_templates ADD COLUMN is_subworkflow INTEGER NOT NULL DEFAULT 0",
    );
  }
  const hasGlobalVars = templateColumns.some(
    (c) => c?.name === "global_variables_json",
  );
  if (!hasGlobalVars) {
    db.exec(
      "ALTER TABLE workflow_templates ADD COLUMN global_variables_json TEXT NOT NULL DEFAULT '[]'",
    );
  }

  const templateStepColumns = db
    .prepare("PRAGMA table_info(workflow_template_steps)")
    .all() as Array<{ name?: string } | undefined>;
  const hasFieldSchema = templateStepColumns.some(
    (c) => c?.name === "field_schema_json",
  );
  if (!hasFieldSchema) {
    db.exec(
      "ALTER TABLE workflow_template_steps ADD COLUMN field_schema_json TEXT NOT NULL DEFAULT '{}'",
    );
  }
  const hasGroupId = templateStepColumns.some((c) => c?.name === "group_id");
  if (!hasGroupId) {
    db.exec("ALTER TABLE workflow_template_steps ADD COLUMN group_id TEXT");
  }
  const hasGroupLabel = templateStepColumns.some((c) => c?.name === "group_label");
  if (!hasGroupLabel) {
    db.exec("ALTER TABLE workflow_template_steps ADD COLUMN group_label TEXT");
  }
  const hasGroupTemplateId = templateStepColumns.some(
    (c) => c?.name === "group_template_id",
  );
  if (!hasGroupTemplateId) {
    db.exec("ALTER TABLE workflow_template_steps ADD COLUMN group_template_id INTEGER");
  }

  const shipmentColumns = db
    .prepare("PRAGMA table_info(shipments)")
    .all() as Array<{ name?: string } | undefined>;
  const hasWorkflowGlobals = shipmentColumns.some(
    (c) => c?.name === "workflow_global_values_json",
  );
  if (!hasWorkflowGlobals) {
    db.exec(
      "ALTER TABLE shipments ADD COLUMN workflow_global_values_json TEXT NOT NULL DEFAULT '{}'",
    );
  }

  const stepColumns = db.prepare("PRAGMA table_info(shipment_steps)").all() as Array<
    { name?: string } | undefined
  >;
  const hasStepSchema = stepColumns.some((c) => c?.name === "field_schema_json");
  if (!hasStepSchema) {
    db.exec(
      "ALTER TABLE shipment_steps ADD COLUMN field_schema_json TEXT NOT NULL DEFAULT '{}'",
    );
  }
}

function migrateToV9(db: DatabaseSync) {
  db.exec(`
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS shipment_customers (
      shipment_id INTEGER NOT NULL REFERENCES shipments(id) ON DELETE CASCADE,
      customer_party_id INTEGER NOT NULL REFERENCES parties(id),
      created_at TEXT NOT NULL,
      created_by_user_id INTEGER REFERENCES users(id),
      PRIMARY KEY (shipment_id, customer_party_id)
    );

    CREATE TABLE IF NOT EXISTS goods (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      owner_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      origin TEXT NOT NULL,
      unit_type TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE (owner_user_id, name, origin)
    );

    CREATE TABLE IF NOT EXISTS shipment_goods (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      shipment_id INTEGER NOT NULL REFERENCES shipments(id) ON DELETE CASCADE,
      good_id INTEGER NOT NULL REFERENCES goods(id),
      owner_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      customer_party_id INTEGER REFERENCES parties(id),
      applies_to_all_customers INTEGER NOT NULL DEFAULT 0,
      quantity INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      created_by_user_id INTEGER REFERENCES users(id),
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS shipment_goods_allocations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      shipment_good_id INTEGER NOT NULL REFERENCES shipment_goods(id) ON DELETE CASCADE,
      step_id INTEGER NOT NULL REFERENCES shipment_steps(id) ON DELETE CASCADE,
      taken_quantity INTEGER NOT NULL,
      inventory_quantity INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      created_by_user_id INTEGER REFERENCES users(id),
      UNIQUE (shipment_good_id, step_id)
    );

    CREATE TABLE IF NOT EXISTS inventory_transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      owner_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      good_id INTEGER NOT NULL REFERENCES goods(id),
      shipment_id INTEGER REFERENCES shipments(id) ON DELETE SET NULL,
      shipment_good_id INTEGER REFERENCES shipment_goods(id) ON DELETE SET NULL,
      step_id INTEGER REFERENCES shipment_steps(id) ON DELETE SET NULL,
      direction TEXT NOT NULL,
      quantity INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      note TEXT
    );

    CREATE TABLE IF NOT EXISTS inventory_balances (
      owner_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      good_id INTEGER NOT NULL REFERENCES goods(id),
      quantity INTEGER NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (owner_user_id, good_id)
    );

    CREATE INDEX IF NOT EXISTS idx_shipment_customers_customer ON shipment_customers(customer_party_id);
    CREATE INDEX IF NOT EXISTS idx_shipment_goods_shipment ON shipment_goods(shipment_id);
    CREATE INDEX IF NOT EXISTS idx_shipment_goods_owner ON shipment_goods(owner_user_id);
    CREATE INDEX IF NOT EXISTS idx_goods_owner ON goods(owner_user_id);
    CREATE INDEX IF NOT EXISTS idx_inventory_tx_owner ON inventory_transactions(owner_user_id);
    CREATE INDEX IF NOT EXISTS idx_inventory_tx_good ON inventory_transactions(good_id);
    CREATE INDEX IF NOT EXISTS idx_inventory_tx_shipment ON inventory_transactions(shipment_id);
  `);

  db.exec(`
    INSERT OR IGNORE INTO shipment_customers (
      shipment_id, customer_party_id, created_at, created_by_user_id
    )
    SELECT id, customer_party_id, created_at, created_by_user_id
    FROM shipments
    WHERE customer_party_id IS NOT NULL
  `);
}

function migrate(db: DatabaseSync) {
  const row = db.prepare("PRAGMA user_version").get() as
    | { user_version?: number }
    | undefined;
  const currentVersion = row?.user_version ?? 0;

  if (currentVersion >= SCHEMA_VERSION) return;

  if (currentVersion < 1) migrateToV1(db);
  if (currentVersion < 2) migrateToV2(db);
  if (currentVersion < 3) migrateToV3(db);
  if (currentVersion < 4) migrateToV4(db);
  if (currentVersion < 5) migrateToV5(db);
  if (currentVersion < 6) migrateToV6(db);
  if (currentVersion < 7) migrateToV7(db);
  if (currentVersion < 8) migrateToV8(db);
  if (currentVersion < 9) migrateToV9(db);

  db.exec(`PRAGMA user_version = ${SCHEMA_VERSION};`);
}

export function getDb(): DatabaseSync {
  if (globalThis.__logisticDb) {
    migrate(globalThis.__logisticDb);
    return globalThis.__logisticDb;
  }

  const dbPath = getDbPath();
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });

  const db = new DatabaseSync(dbPath);
  migrate(db);

  globalThis.__logisticDb = db;
  return db;
}

export function nowIso() {
  return new Date().toISOString();
}

export function inTransaction<T>(db: DatabaseSync, fn: () => T): T {
  db.exec("BEGIN");
  try {
    const result = fn();
    db.exec("COMMIT");
    return result;
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}
