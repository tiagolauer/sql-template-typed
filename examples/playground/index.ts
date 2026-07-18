import { createTypedDb, ResultStatus, type Query } from '@owlsql/core';
import type { DB } from './schema.js';

// --- 1. Type-only usage: hover `Result` below to see the inferred row shape.
type BasicSelect = Query<DB, 'select id, name from users'>;
declare const basicResult: BasicSelect;
basicResult[0]?.name;
//              ^? hover here: string

// --- 2. Joins infer across tables, LEFT JOIN makes the right side nullable.
type JoinedRows = Query<
  DB,
  'select u.name, p.title from users u left join posts p on u.id = p.user_id'
>;
declare const joined: JoinedRows;
joined[0]?.title;
//          ^? hover here: string | null

// --- 3. CASE branches union together.
type Bucketed = Query<
  DB,
  "select case when views > 1000 then 'popular' else 'normal' end as bucket from posts"
>;
declare const bucketed: Bucketed;
bucketed[0]?.bucket;
//            ^? hover here: string

// --- 4. Try breaking it: uncomment the line below and watch the column
//        name turn red. Strict mode turns unknown columns/tables into a
//        compile-time QueryTypeError instead of silently returning `unknown`.
// type Typo = StrictQuery<DB, 'select nam from users'>;

// --- 5. A real client, wired to a fake in-memory executor (no database
//        needed to explore this playground).
const db = createTypedDb<DB>(async (sql, params) => {
  console.log('would run:', sql, params);
  return [];
});

async function main() {
  const result = await db.query('select id, name from users where active = $1', true);
  //                                                                    ^ try changing `true` to a string — type error
  if (result.status === ResultStatus.Ok) {
    result.value;
    //     ^? hover here: { id: number; name: string }[]
  }
}

void main;
