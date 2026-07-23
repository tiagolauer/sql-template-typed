import { describe, it, expect } from 'vitest';
import { createTypedDb, isOk } from '../src/index.js';
import { createNodeSqliteExecutor } from '../src/adapters/node-sqlite.js';
import { loadSqlite, sqliteAvailable } from './sqlite-availability.js';

interface DB {
  users: { id: number; name: string };
}

function seededDatabase(): import('node:sqlite').DatabaseSync {
  const DatabaseSync = loadSqlite();
  const db = new DatabaseSync(':memory:');
  db.exec('create table users (id integer primary key, name text not null)');
  db.prepare('insert into users (id, name) values (?, ?)').run(1, 'ada');
  db.prepare('insert into users (id, name) values (?, ?)').run(2, 'grace');
  return db;
}

describe.skipIf(!sqliteAvailable)('createNodeSqliteExecutor', () => {
  it('runs a real query against an in-memory node:sqlite database', async () => {
    const sqlite = seededDatabase();
    const db = createTypedDb<DB>(createNodeSqliteExecutor(sqlite));

    const result = await db.query('select id, name from users order by id');

    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result.value).toEqual([
        { id: 1, name: 'ada' },
        { id: 2, name: 'grace' },
      ]);
    }
  });

  it('binds positional parameters through to the prepared statement', async () => {
    const sqlite = seededDatabase();
    const db = createTypedDb<DB>(createNodeSqliteExecutor(sqlite));

    const result = await db.query('select id, name from users where id = ?', 2);

    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result.value).toEqual([{ id: 2, name: 'grace' }]);
    }
  });

  it('routes @name and $name placeholders through the named-parameters object', async () => {
    const sqlite = seededDatabase();
    const db = createTypedDb<DB>(createNodeSqliteExecutor(sqlite));

    const atResult = await db.query('select id, name from users where id = @id', 1);
    expect(isOk(atResult)).toBe(true);
    if (isOk(atResult)) {
      expect(atResult.value).toEqual([{ id: 1, name: 'ada' }]);
    }

    const dollarResult = await db.query('select id, name from users where name = $name', 'grace');
    expect(isOk(dollarResult)).toBe(true);
    if (isOk(dollarResult)) {
      expect(dollarResult.value).toEqual([{ id: 2, name: 'grace' }]);
    }
  });

  it('ignores named-parameter lookalikes inside string literals', async () => {
    const sqlite = seededDatabase();
    const db = createTypedDb<DB>(createNodeSqliteExecutor(sqlite));

    const result = await db.query("select id from users where name = 'no @param here' or id = ?", 1);

    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result.value).toEqual([{ id: 1 }]);
    }
  });

  it('coerces boolean and Date params to driver-supported values', async () => {
    const DatabaseSync = loadSqlite();
    const sqlite = new DatabaseSync(':memory:');
    sqlite.exec('create table flags (id integer primary key, active integer, seen_at text)');
    const executor = createNodeSqliteExecutor(sqlite);

    const stamp = new Date('2026-01-02T03:04:05.000Z');
    await executor('insert into flags (id, active, seen_at) values (?, ?, ?)', [1, true, stamp]);

    const rows = await executor('select active, seen_at from flags where id = ?', [1]);
    expect(rows).toEqual([{ active: 1, seen_at: '2026-01-02T03:04:05.000Z' }]);
  });

  it('binds ? and a named parameter together without dropping the positional value', async () => {
    const sqlite = seededDatabase();
    const db = createTypedDb<DB>(createNodeSqliteExecutor(sqlite));

    const result = await db.query('select id, name from users where name = ? and id = @id', 'ada', 1);

    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result.value).toEqual([{ id: 1, name: 'ada' }]);
    }
  });

  it('binds a repeated named parameter once, without misaligning the parameter after it', async () => {
    const DatabaseSync = loadSqlite();
    const sqlite = new DatabaseSync(':memory:');
    sqlite.exec('create table events (id integer primary key, note text, note2 text)');
    sqlite.prepare('insert into events (id, note, note2) values (1, ?, ?)').run('old', 'old');
    sqlite.prepare('insert into events (id, note, note2) values (2, ?, ?)').run('untouched', 'untouched');
    const executor = createNodeSqliteExecutor(sqlite);

    // note and note2 both bind to the same @note occurrence, deduped to one
    // slot; @id is a distinct third occurrence. If the previously-buggy
    // type demanded a slot per *occurrence* instead of per distinct name,
    // a caller following it would pass an extra positional value here,
    // shifting @id onto that extra value instead of the real id - and
    // event 1 would never actually be matched/updated.
    await executor('update events set note = @note, note2 = @note where id = @id', ['new', 1]);

    const rows = await executor('select id, note, note2 from events order by id', []);
    expect(rows).toEqual([
      { id: 1, note: 'new', note2: 'new' },
      { id: 2, note: 'untouched', note2: 'untouched' },
    ]);
  });

  it('supports an INSERT round-trip through the typed client', async () => {
    const sqlite = seededDatabase();
    const db = createTypedDb<DB>(createNodeSqliteExecutor(sqlite));

    const insert = await db.query('insert into users (id, name) values ($1, $2)', 3, 'lin');
    expect(isOk(insert)).toBe(true);

    const rows = await db.query('select name from users where id = ?', 3);
    expect(isOk(rows)).toBe(true);
    if (isOk(rows)) {
      expect(rows.value).toEqual([{ name: 'lin' }]);
    }
  });
});
