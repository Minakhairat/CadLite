import { extrude, revolve, volume, Entity } from './geometry';
const near = (a: number, b: number, tol: number, m: string) => { if (Math.abs(a - b) > tol) { console.error('FAIL', m, a, b); process.exit(1); } console.log('ok', m, a.toFixed(2)); };
const box: Entity[] = [{ t: 'rect', a: { x: 0, y: 0 }, b: { x: 10, y: 20 } }];
near(volume(extrude(box, 5)), 1000, 1e-6, 'box extrude volume');
const holed: Entity[] = [...box, { t: 'circle', c: { x: 5, y: 10 }, r: 2 }];
near(volume(extrude(holed, 5)), (200 - Math.PI * 4) * 5, 3, 'plate with hole volume');
near(volume(revolve([{ t: 'rect', a: { x: 0, y: 0 }, b: { x: 3, y: 10 } }])), Math.PI * 9 * 10, 2, 'revolved cylinder volume');
import { buildGeometry } from './geometry';
const f = { kind: 'extrude' as const, depth: 5, sketch: JSON.parse(JSON.stringify(box)) as Entity[] };
const e0 = f.sketch[0] as Extract<Entity, { t: 'rect' }>; e0.b.x = 20; f.depth = 10; // edit dimensions: 20 x 20 x 10
near(volume(buildGeometry(f.kind, f.sketch, f.depth)), 4000, 1e-6, 'edited feature volume');
