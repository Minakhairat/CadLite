/// <reference types="vite/client" />
import { make_gcs_wrapper } from '@salusoft89/planegcs';
import wasmUrl from '@salusoft89/planegcs/dist/planegcs_dist/planegcs.wasm?url';
import { solveLines, L, Con } from './solver-core';
import { solveCircles, C, CCon } from './circle-solver-core';
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
