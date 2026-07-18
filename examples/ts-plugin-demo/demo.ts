import { createTypedDb } from '@owlsql/core';

interface DB {
  users: { id: number; name: string; email: string };
}

const db = createTypedDb<DB>(async () => []);

db.query(`
  select id, na
`);
