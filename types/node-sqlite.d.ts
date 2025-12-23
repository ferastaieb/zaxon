declare module "node:sqlite" {
  export type SqliteBindValue = string | number | bigint | null | Uint8Array;

  export interface StatementSync {
    get(...params: SqliteBindValue[]): unknown;
    all(...params: SqliteBindValue[]): unknown[];
    run(
      ...params: SqliteBindValue[]
    ): { lastInsertRowid: number; changes: number };
  }

  export class DatabaseSync {
    constructor(filename: string, options?: unknown);
    exec(sql: string): void;
    prepare(sql: string): StatementSync;
  }
}

