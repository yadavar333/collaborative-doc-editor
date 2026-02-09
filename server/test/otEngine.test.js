import { applyOp, transform } from '../src/ot/otEngine.js';

/** Verify the OT convergence property for a given doc and two ops. */
function converges(doc, op1, op2) {
  const [op1Prime, op2Prime] = transform(op1, op2);
  const path1 = applyOp(applyOp(doc, op1), op2Prime);
  const path2 = applyOp(applyOp(doc, op2), op1Prime);
  return { path1, path2, ok: path1 === path2 };
}

// ── 1. applyOp basic tests ────────────────────────────────────────────────────

test('applyOp: insert at start', () => {
  expect(applyOp('abc', [{ insert: 'X' }, { retain: 3 }])).toBe('Xabc');
});

test('applyOp: insert in middle', () => {
  expect(applyOp('abc', [{ retain: 1 }, { insert: 'X' }, { retain: 2 }])).toBe('aXbc');
});

test('applyOp: delete from start', () => {
  expect(applyOp('abcde', [{ delete: 2 }, { retain: 3 }])).toBe('cde');
});

test('applyOp: delete from middle', () => {
  expect(applyOp('abcde', [{ retain: 1 }, { delete: 3 }, { retain: 1 }])).toBe('ae');
});

// ── 2. Concurrent inserts at the same position (left-bias) ────────────────────

test('scenario 01: concurrent inserts at same position', () => {
  const doc = 'abc';
  const op1 = [{ insert: 'X' }, { retain: 3 }];
  const op2 = [{ insert: 'Y' }, { retain: 3 }];
  const { ok, path1 } = converges(doc, op1, op2);
  expect(ok).toBe(true);
  expect(path1).toBe('XYabc'); // op1 wins left-bias
});

// ── 3. Concurrent deletes overlapping exactly ─────────────────────────────────

test('scenario 02: concurrent deletes overlap exactly', () => {
  const doc = 'abcde';
  const op1 = [{ retain: 1 }, { delete: 3 }, { retain: 1 }]; // delete "bcd"
  const op2 = [{ retain: 1 }, { delete: 3 }, { retain: 1 }]; // delete "bcd"
  const { ok, path1 } = converges(doc, op1, op2);
  expect(ok).toBe(true);
  expect(path1).toBe('ae');
});

// ── 4. Concurrent deletes partially overlapping ───────────────────────────────

test('scenario 03: concurrent deletes partially overlapping', () => {
  const doc = 'abcde';
  const op1 = [{ retain: 1 }, { delete: 2 }, { retain: 2 }]; // delete "bc"
  const op2 = [{ retain: 2 }, { delete: 2 }, { retain: 1 }]; // delete "cd"
  const { ok, path1 } = converges(doc, op1, op2);
  expect(ok).toBe(true);
  expect(path1).toBe('ae');
});

// ── 5. Insert and delete at the same position ─────────────────────────────────

test('scenario 04: insert and delete at same position', () => {
  const doc = 'abc';
  const op1 = [{ insert: 'X' }, { retain: 3 }];          // insert at 0
  const op2 = [{ delete: 1 }, { retain: 2 }];             // delete 'a'
  const { ok } = converges(doc, op1, op2);
  expect(ok).toBe(true);
});

// ── 6. Insert preceding a delete ─────────────────────────────────────────────

test('scenario 05: insert before delete region', () => {
  const doc = 'abcde';
  const op1 = [{ retain: 1 }, { insert: 'Z' }, { retain: 4 }]; // insert after 'a'
  const op2 = [{ retain: 2 }, { delete: 2 }, { retain: 1 }];   // delete "cd"
  const { ok } = converges(doc, op1, op2);
  expect(ok).toBe(true);
});

// ── 7. Delete preceding an insert ────────────────────────────────────────────

test('scenario 06: delete before insert position', () => {
  const doc = 'abcde';
  const op1 = [{ delete: 2 }, { retain: 3 }];                         // delete "ab"
  const op2 = [{ retain: 3 }, { insert: 'Z' }, { retain: 2 }];        // insert after 'c'
  const { ok } = converges(doc, op1, op2);
  expect(ok).toBe(true);
});

// ── 8. Multiple retains interwoven with inserts ───────────────────────────────

test('scenario 07: multiple retains interwoven with inserts', () => {
  const doc = 'hello world';
  const op1 = [{ retain: 5 }, { insert: ' beautiful' }, { retain: 6 }];
  const op2 = [{ retain: 11 }, { insert: '!' }];
  const { ok } = converges(doc, op1, op2);
  expect(ok).toBe(true);
});

// ── 9. Two inserts at different positions (op1 earlier) ──────────────────────

test('scenario 08: inserts at different positions, op1 first', () => {
  const doc = 'abcd';
  const op1 = [{ retain: 1 }, { insert: 'X' }, { retain: 3 }]; // insert at 1
  const op2 = [{ retain: 3 }, { insert: 'Y' }, { retain: 1 }]; // insert at 3
  const { ok, path1 } = converges(doc, op1, op2);
  expect(ok).toBe(true);
  expect(path1).toBe('aXbcYd');
});

// ── 10. Two inserts at different positions (op2 earlier) ─────────────────────

test('scenario 09: inserts at different positions, op2 first', () => {
  const doc = 'abcd';
  const op1 = [{ retain: 3 }, { insert: 'X' }, { retain: 1 }]; // insert at 3
  const op2 = [{ retain: 1 }, { insert: 'Y' }, { retain: 3 }]; // insert at 1
  const { ok } = converges(doc, op1, op2);
  expect(ok).toBe(true);
});

// ── 11. Delete all + insert ───────────────────────────────────────────────────

test('scenario 10: delete all then insert vs insert at end', () => {
  const doc = 'old';
  const op1 = [{ delete: 3 }, { insert: 'new' }];          // replace all
  const op2 = [{ retain: 3 }, { insert: '!' }];             // append
  const { ok } = converges(doc, op1, op2);
  expect(ok).toBe(true);
});

// ── 12. Insert in middle + delete at end ─────────────────────────────────────

test('scenario 11: insert in middle, delete at end', () => {
  const doc = 'abcde';
  const op1 = [{ retain: 2 }, { insert: 'XY' }, { retain: 3 }];
  const op2 = [{ retain: 4 }, { delete: 1 }];
  const { ok } = converges(doc, op1, op2);
  expect(ok).toBe(true);
});

// ── 13. Large retain vs delete-heavy op ──────────────────────────────────────

test('scenario 12: retain-heavy vs delete-heavy', () => {
  const doc = 'abcdefghij';
  const op1 = [{ retain: 10 }];
  const op2 = [{ delete: 5 }, { retain: 5 }];
  const { ok } = converges(doc, op1, op2);
  expect(ok).toBe(true);
});

// ── 14. Multiple inserts in both ops ─────────────────────────────────────────

test('scenario 13: multiple inserts in both ops', () => {
  const doc = 'ac';
  const op1 = [{ retain: 1 }, { insert: 'b' }, { retain: 1 }];
  const op2 = [{ retain: 2 }, { insert: 'd' }];
  const { ok, path1 } = converges(doc, op1, op2);
  expect(ok).toBe(true);
  expect(path1).toBe('abcd');
});

// ── 15. Complex interleaved: multiple inserts + delete ────────────────────────

test('scenario 14: complex — insert + delete + insert', () => {
  const doc = 'hello world';
  const op1 = [{ insert: '[' }, { retain: 5 }, { insert: ']' }, { retain: 6 }];
  const op2 = [{ retain: 6 }, { delete: 5 }]; // delete "world"
  const { ok } = converges(doc, op1, op2);
  expect(ok).toBe(true);
});

// ── 16. Empty document ────────────────────────────────────────────────────────

test('scenario 15: concurrent inserts on empty document', () => {
  const doc = '';
  const op1 = [{ insert: 'Alice' }];
  const op2 = [{ insert: 'Bob' }];
  const { ok } = converges(doc, op1, op2);
  expect(ok).toBe(true);
});
