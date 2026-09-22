import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';

export interface ReadOnlyStatement {
  all(...params: Array<number | string>): Record<string, unknown>[];
}

export interface ReadOnlyDatabase {
  prepare(sql: string): ReadOnlyStatement;
  close(): void;
}

interface DriverStatement {
  all(...params: Array<number | string>): unknown[];
}

interface BunDatabase {
  query(sql: string): DriverStatement;
  close(): void;
}

interface BunDatabaseConstructor {
  new (path: string, options: { readonly?: boolean; create?: boolean }): BunDatabase;
}

interface NodeDatabase {
  prepare(sql: string): DriverStatement;
  close(): void;
}

interface NodeDatabaseConstructor {
  new (path: string, options: { readOnly?: boolean }): NodeDatabase;
}

const require = createRequire(import.meta.url);

export function isBunRuntime(): boolean {
  return typeof Bun !== 'undefined';
}

function wrapStatement(stmt: DriverStatement): ReadOnlyStatement {
  return {
    all: (...params) => stmt.all(...params) as Record<string, unknown>[],
  };
}

function openWithBun(path: string): ReadOnlyDatabase {
  const { Database } = require('bun:sqlite') as { Database: BunDatabaseConstructor };
  let db: BunDatabase;
  // Swallow the read-only open failure and retry without it; if this second
  // attempt also fails, that error is still surfaced by openReadOnly's own
  // catch below (mirrors pre-restructure behavior).
  try {
    db = new Database(path, { readonly: true, create: false });
  } catch {
    db = new Database(path, { create: false });
  }
  // Force header validation so a non-database file fails here, not on first query.
  db.query('SELECT 1').all();
  return {
    prepare: (sql) => wrapStatement(db.query(sql)),
    close: () => db.close(),
  };
}

function openWithNode(path: string): ReadOnlyDatabase {
  const { DatabaseSync } = require('node:sqlite') as { DatabaseSync: NodeDatabaseConstructor };
  const db = new DatabaseSync(path, { readOnly: true });
  db.prepare('SELECT 1').all();
  return {
    prepare: (sql) => wrapStatement(db.prepare(sql)),
    close: () => db.close(),
  };
}

/**
 * Opens a SQLite file read-only using whichever built-in driver the current
 * runtime provides. This is the only module that references bun:sqlite or
 * node:sqlite, and it does so via require() so neither specifier appears as a
 * static import in the emitted JavaScript.
 */
export function openReadOnly(path: string): ReadOnlyDatabase {
  if (!existsSync(path)) {
    throw new Error(
      `GeoNames database not found at "${path}". Please verify that geonames.sqlite exists.`
    );
  }
  try {
    return isBunRuntime() ? openWithBun(path) : openWithNode(path);
  } catch (err) {
    const cause = err instanceof Error ? err.message : String(err);
    throw new Error(`Failed to open SQLite database at "${path}": ${cause}`);
  }
}
