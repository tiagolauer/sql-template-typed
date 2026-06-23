import { createTypedDb, ResultStatus } from '../src/index.js';

interface DB {
  users: { id: number; name: string };
}

declare const db: ReturnType<typeof createTypedDb<DB>>;

export async function resultMustBeNarrowed() {
  const result = await db.query('select id, name from users');

  // @ts-expect-error value is only present after narrowing to the Ok branch
  result.value;

  // @ts-expect-error error is only present after narrowing to the Error branch
  result.error;

  // @ts-expect-error a Result is a union, not an array — no array methods
  result.map((row) => row);

  if (result.status === ResultStatus.Ok) {
    result.value;
    // @ts-expect-error error does not exist on the Ok branch
    result.error;
  }
}

export function queryArgumentMustBeString() {
  // @ts-expect-error the query must be a string literal, not a number
  return db.query(123);
}
