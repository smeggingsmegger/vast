import { describe, expect, it } from 'vitest';
import { splitShellStatements, stripShellComments } from './shell-script.js';

describe('shell-script parsing', () => {
  it('strips line comments', () => {
    const s = stripShellComments('const a = 1; // hi\nconst b = 2;');
    expect(s).toContain('const a = 1;');
    expect(s).not.toContain('hi');
    expect(s).toContain('const b = 2;');
  });

  it('strips block comments', () => {
    const s = stripShellComments('a /* x */ + /* y */ b');
    expect(s.replace(/\s+/g, ' ').trim()).toBe('a + b');
  });

  it('splits multi-statement scripts', () => {
    const stmts = splitShellStatements(`
      const accts = db.accounts.find({}).toArray();
      accts
      db.other.find({ x: 1 }).toArray()
    `);
    expect(stmts.length).toBeGreaterThanOrEqual(2);
    expect(stmts[0]).toMatch(/const accts/);
    expect(stmts.some((s) => s.trim() === 'accts')).toBe(true);
  });

  it('keeps object literals intact', () => {
    const stmts = splitShellStatements(`db.col.find({ a: 1, b: { c: 2 } }).toArray()`);
    expect(stmts).toHaveLength(1);
    expect(stmts[0]).toContain('{ a: 1, b: { c: 2 } }');
  });

  it('does not split on semicolon inside strings', () => {
    const stmts = splitShellStatements(`db.col.find({ s: "a;b" }).toArray()`);
    expect(stmts).toHaveLength(1);
  });
});
