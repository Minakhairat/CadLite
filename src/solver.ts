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
