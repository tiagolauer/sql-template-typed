import { describe, expect, it } from 'vitest';
import { defineSchema } from '../src/index.js';

describe('defineSchema', () => {
  it('returns its argument unchanged', () => {
    const schema = { users: { id: 0, name: '' } };
    expect(defineSchema(schema)).toBe(schema);
  });
});
