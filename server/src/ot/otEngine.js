/**
 * Character-based Operational Transformation Engine
 *
 * An operation is an array of components:
 *   { retain: N }   — keep N characters from the document
 *   { insert: "s" } — insert string s at the current position
 *   { delete: N }   — remove N characters from the document
 *
 * Convergence property:
 *   applyOp(applyOp(doc, op1), op2') === applyOp(applyOp(doc, op2), op1')
 *   where [op1', op2'] = transform(op1, op2)
 */

// ── Internal cursor over an operation ─────────────────────────────────────────

class OpCursor {
  constructor(op) {
    this._op     = [...op];
    this._idx    = 0;
    this._offset = 0;   // how many chars we've consumed within current component
  }

  hasMore() {
    return this._idx < this._op.length;
  }

  type() {
    if (!this.hasMore()) return null;
    const c = this._op[this._idx];
    if (c.insert  !== undefined) return 'insert';
    if (c.retain  !== undefined) return 'retain';
    if (c.delete  !== undefined) return 'delete';
    return null;
  }

  /** Remaining length in current component (0 for inserts — handled separately). */
  size() {
    if (!this.hasMore()) return 0;
    const c = this._op[this._idx];
    if (c.retain !== undefined) return c.retain - this._offset;
    if (c.delete !== undefined) return c.delete - this._offset;
    return 0;
  }

  /** Advance past the full current insert component. Returns the component. */
  takeInsert() {
    const c = this._op[this._idx];
    this._idx++;
    this._offset = 0;
    return c;
  }

  /** Consume n characters from a retain or delete component. */
  consume(n) {
    const c    = this._op[this._idx];
    const total = c.retain ?? c.delete;
    this._offset += n;
    if (this._offset >= total) {
      this._idx++;
      this._offset = 0;
    }
  }
}

// ── Helper: push component, merging adjacent same-type components ─────────────

function sameAttrs(a, b) {
  // Treat undefined and absent the same way; compare by stable serialisation.
  const sa = a ? JSON.stringify(a) : null;
  const sb = b ? JSON.stringify(b) : null;
  return sa === sb;
}

function push(arr, comp) {
  if (!arr.length) { arr.push({ ...comp }); return; }
  const last = arr[arr.length - 1];
  // Only merge adjacent components of the same type AND same attributes.
  // Components with differing attributes must stay separate so that Quill
  // can apply the correct formatting to each character range.
  if (comp.retain !== undefined && last.retain !== undefined
      && sameAttrs(comp.attributes, last.attributes)) {
    last.retain += comp.retain;
  } else if (comp.delete !== undefined && last.delete !== undefined) {
    last.delete += comp.delete;
  } else if (comp.insert !== undefined && last.insert !== undefined
             && sameAttrs(comp.attributes, last.attributes)) {
    last.insert += comp.insert;
  } else {
    arr.push({ ...comp });
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Apply an operation to a string.
 * @param {string} text
 * @param {Array}  op
 * @returns {string}
 */
export function applyOp(text, op) {
  let result = '';
  let pos    = 0;

  for (const comp of op) {
    if (comp.retain !== undefined) {
      result += text.slice(pos, pos + comp.retain);
      pos    += comp.retain;
    } else if (comp.insert !== undefined) {
      result += comp.insert;
    } else if (comp.delete !== undefined) {
      pos += comp.delete;
    }
  }

  // Append any remaining characters not addressed by the operation
  result += text.slice(pos);
  return result;
}

/**
 * Transform two concurrent operations against each other.
 * Both ops start from the same document state.
 *
 * @param {Array} op1
 * @param {Array} op2
 * @returns {[Array, Array]}  [op1Prime, op2Prime]
 */
export function transform(op1, op2) {
  const prime1 = [];
  const prime2 = [];

  const c1 = new OpCursor(op1);
  const c2 = new OpCursor(op2);

  while (c1.hasMore() || c2.hasMore()) {
    // ── Insert in op1 takes priority (left-bias) ─────────────────────────────
    if (c1.type() === 'insert') {
      const ins = c1.takeInsert();
      push(prime1, ins);
      push(prime2, { retain: ins.insert.length });
      continue;
    }

    // ── Insert in op2 ────────────────────────────────────────────────────────
    if (c2.type() === 'insert') {
      const ins = c2.takeInsert();
      push(prime1, { retain: ins.insert.length });
      push(prime2, ins);
      continue;
    }

    // ── Both exhausted ────────────────────────────────────────────────────────
    if (!c1.hasMore() && !c2.hasMore()) break;

    // ── One side exhausted (only retain/delete left on the other) ─────────────
    if (!c1.hasMore()) {
      const t2   = c2.type();
      const n    = c2.size();
      const attrs2 = c2._op[c2._idx].attributes;
      if (t2 === 'retain') push(prime2, attrs2 ? { retain: n, attributes: attrs2 } : { retain: n });
      else if (t2 === 'delete') push(prime2, { delete: n });
      c2.consume(n);
      continue;
    }

    if (!c2.hasMore()) {
      const t1   = c1.type();
      const n    = c1.size();
      const attrs1 = c1._op[c1._idx].attributes;
      if (t1 === 'retain') push(prime1, attrs1 ? { retain: n, attributes: attrs1 } : { retain: n });
      else if (t1 === 'delete') push(prime1, { delete: n });
      c1.consume(n);
      continue;
    }

    // ── Both have retain/delete remaining ────────────────────────────────────
    const t1     = c1.type();
    const t2     = c2.type();
    const n      = Math.min(c1.size(), c2.size());
    const attrs1 = c1._op[c1._idx].attributes;
    const attrs2 = c2._op[c2._idx].attributes;

    if (t1 === 'retain' && t2 === 'retain') {
      // Both keep these characters — preserve each op's attributes independently.
      push(prime1, attrs1 ? { retain: n, attributes: attrs1 } : { retain: n });
      push(prime2, attrs2 ? { retain: n, attributes: attrs2 } : { retain: n });

    } else if (t1 === 'delete' && t2 === 'retain') {
      // op1 deletes chars that op2 keeps → op1' still deletes, op2' is silent
      push(prime1, { delete: n });

    } else if (t1 === 'retain' && t2 === 'delete') {
      // op2 deletes chars that op1 keeps → op2' still deletes, op1' is silent
      push(prime2, { delete: n });

    } else if (t1 === 'delete' && t2 === 'delete') {
      // Both delete the same chars — the overlap is already gone, both silent
    }

    c1.consume(n);
    c2.consume(n);
  }

  return [prime1, prime2];
}

/**
 * Transform a single component against a full operation (helper for server-side
 * sequential transformation of multiple past ops).
 *
 * @param {Object} comp  — single {insert|retain|delete} component
 * @param {Array}  op    — full operation
 * @returns {Object}     — transformed component
 */
export function transformComponent(comp, op) {
  const [transformed] = transform([comp], op);
  return transformed[0] ?? { retain: 0 };
}
