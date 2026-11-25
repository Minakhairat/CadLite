/// <reference types="vite/client" />
import { make_gcs_wrapper } from '@salusoft89/planegcs';
import wasmUrl from '@salusoft89/planegcs/dist/planegcs_dist/planegcs.wasm?url';
import { solveLines, L, Con } from './solver-core';
import { solveCircles, circleFixedMarks, C, CCon } from './circle-solver-core';
export type { Con, L };
let w: Promise<unknown> | null = null;
/** Load the planegcs WebAssembly solver on first use, then solve. */
export async function solveSketch(lines: L[], cons: Con[]): Promise<void> {
  if (!w) w = make_gcs_wrapper(wasmUrl).catch((e) => { w = null; throw e; });
  solveLines((await w) as never, lines, cons);
}
export async function solveCircleSketch(lines: L[], circles: C[], cons: CCon[]): Promise<void> {
  if (!w) w = make_gcs_wrapper(wasmUrl).catch((e) => { w = null; throw e; });
  solveCircles((await w) as never, lines, circles, cons);
}
export const getW = async (): Promise<unknown> => { if (!w) w = make_gcs_wrapper(wasmUrl).catch((e) => { w = null; throw e; }); return w; };
/** Degrees of freedom left in the sketch lines (end points) under the line constraints. Works on copies, so the sketch is not moved. -1 when unknown. */
export async function dofSketch(lines: L[], cons: Con[]): Promise<number> {
  if (!w) w = make_gcs_wrapper(wasmUrl).catch((e) => { w = null; throw e; });
  const cp = lines.map((l) => ({ a: { ...l.a }, b: { ...l.b } }));
  const map = (x?: L) => (x ? cp[lines.indexOf(x)] : undefined);
  const cc = cons.filter((c) => lines.includes(c.l) && (!c.m || lines.includes(c.m)) && (!c.n || lines.includes(c.n))).map((c) => ({ ...c, l: map(c.l) as L, ...(c.m ? { m: map(c.m) as L } : {}), ...(c.n ? { n: map(c.n) as L } : {}) }));
  return solveLines((await w) as never, cp, cc);
}

/** Per line: true when the line cannot move at all under the line constraints (fixing it would remove no degree of freedom). Works on copies. */
export async function dofLineMarks(lines: L[], cons: Con[]): Promise<boolean[]> {
  const base = await dofSketch(lines, cons);
  if (base < 0) return lines.map(() => false);
  const out: boolean[] = [];
  for (const l of lines) {
    const d = await dofSketch(lines, [...cons, { k: 'fix', l }]);
    out.push(d >= 0 && d === base);
  }
  return out;
}

/** Per circle: true when the circle constraints already fix its centre and radius. Works on copies of the numbers. */
export async function dofCircleMarks(lines: L[], circles: C[], cons: CCon[]): Promise<boolean[]> {
  if (!w) w = make_gcs_wrapper(wasmUrl).catch((e) => { w = null; throw e; });
  return circleFixedMarks((await w) as never, lines, circles, cons);
}
