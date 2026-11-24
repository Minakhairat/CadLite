/// <reference types="vite/client" />
import * as THREE from 'three';
import * as R from 'replicad';
import { buildBodies, Spec } from './kernel-core';

let ready: Promise<void> | null = null;
/** Load the OpenCascade WebAssembly kernel on first use (about 7 MB compressed). */
export function loadKernel(): Promise<void> {
  if (!ready) ready = (async () => {
    const init = (await import('replicad-opencascadejs')).default as (o?: object) => Promise<unknown>;
    const wasm = (await import('replicad-opencascadejs/wasm?url')).default as string;
    R.setOC((await init({ locateFile: () => wasm })) as never);
  })().catch((e) => { ready = null; throw e; });
  return ready;
}
export type Body = { shape: R.Shape3D; geo: THREE.BufferGeometry };
export async function computeBodies(feats: Spec[]): Promise<Body[]> {
  await loadKernel();
  return buildBodies(R, feats).map((shape) => {
    const m = shape.mesh({ tolerance: 0.02, angularTolerance: 0.15 });
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(m.vertices, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(m.normals, 3));
    g.setIndex(m.triangles);
    const ng = g.toNonIndexed(); g.dispose(); // per-triangle lighting
    const geo = ng; geo.computeVertexNormals();
    return { shape, geo };
  });
}
export async function stepOf(bodies: Body[]): Promise<Blob> {
  const s = bodies.length === 1 ? bodies[0].shape : R.makeCompound(bodies.map((b) => b.shape));
  return s.blobSTEP();
}
