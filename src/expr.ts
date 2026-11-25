/** Parameters and expressions for sketch dimensions: numbers, parameter names, + - * / ^ and parentheses. Millimetres only, no functions. */
export type Param = { name: string; expr: string };
const NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;
export const validName = (n: string) => NAME.test(n);

/** Evaluate one expression against already-resolved values. Throws a readable error. */
export function evalExpr(text: string, vals: Record<string, number>): number {
  const s = text.trim(); if (!s) throw new Error('The expression is empty.');
  let i = 0;
  const ws = () => { while (i < s.length && s[i] === ' ') i++; };
  const num = (): number => {
    ws(); const c = s[i];
    if (c === '(') { i++; const v = add(); ws(); if (s[i] !== ')') throw new Error('Missing closing parenthesis.'); i++; return v; }
    if (c === '-') { i++; return -pow(); }
    if (c === '+') { i++; return pow(); }
    const m = /^(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?/.exec(s.slice(i));
    if (m) { i += m[0].length; return parseFloat(m[0]); }
    const id = /^[A-Za-z_][A-Za-z0-9_]*/.exec(s.slice(i));
    if (id) { i += id[0].length; if (!Object.prototype.hasOwnProperty.call(vals, id[0])) throw new Error(`Unknown parameter "${id[0]}".`); return vals[id[0]]; }
    throw new Error(i >= s.length ? 'The expression ends too early.' : `Unexpected "${s[i]}" in the expression.`);
  };
  const pow = (): number => { const b = num(); ws(); if (s[i] === '^') { i++; const e = pow(); const r = Math.pow(b, e); if (!isFinite(r)) throw new Error('The power is not a finite number.'); return r; } return b; };
  const mul = (): number => { let v = pow(); for (;;) { ws(); if (s[i] === '*') { i++; v *= pow(); } else if (s[i] === '/') { i++; const d = pow(); if (d === 0) throw new Error('Division by zero.'); v /= d; } else return v; } };
  const add = (): number => { let v = mul(); for (;;) { ws(); if (s[i] === '+') { i++; v += mul(); } else if (s[i] === '-') { i++; v -= mul(); } else return v; } };
  const v = add(); ws(); if (i < s.length) throw new Error(`Unexpected "${s[i]}" in the expression.`);
  if (!isFinite(v)) throw new Error('The result is not a finite number.');
  return v;
}

/** Resolve all parameters (any order). Throws on bad names, duplicates, circular references, unknown names. */
export function resolveParams(list: Param[]): Record<string, number> {
  const seen = new Set<string>();
  for (const p of list) { if (!validName(p.name)) throw new Error(`"${p.name}" is not a valid parameter name (letters, digits, underscore; not starting with a digit).`); if (seen.has(p.name)) throw new Error(`Parameter "${p.name}" is defined twice.`); seen.add(p.name); }
  const by = new Map(list.map((p) => [p.name, p])); const vals: Record<string, number> = {}; const stack: string[] = [];
  const get = (n: string): number => {
    if (Object.prototype.hasOwnProperty.call(vals, n)) return vals[n];
    if (stack.includes(n)) throw new Error(`Circular reference: ${[...stack.slice(stack.indexOf(n)), n].join(' -> ')}.`);
    const p = by.get(n)!; stack.push(n);
    const ids = new Set(p.expr.replace(/(?<![A-Za-z0-9_.])(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?/g, ' ').match(/[A-Za-z_][A-Za-z0-9_]*/g) ?? []);
    const refs = [...ids].filter((x) => by.has(x)); const loc: Record<string, number> = {};
    for (const r of refs) loc[r] = get(r);
    const v = evalExpr(p.expr, loc); stack.pop(); vals[n] = v; return v;
  };
  for (const p of list) get(p.name);
  return vals;
}
