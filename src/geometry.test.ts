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
import { resolveLoops, filletCorner, trimLine, arcPoints, circle3 } from './geometry';
const tri: Entity[] = [{ t: 'line', a: { x: 0, y: 0 }, b: { x: 10, y: 0 } }, { t: 'line', a: { x: 0, y: 10 }, b: { x: 10, y: 0 } }, { t: 'line', a: { x: 0, y: 0 }, b: { x: 0, y: 10 } }];
near(volume(extrude(resolveLoops(tri), 2)), 100, 1e-6, 'triangle from 3 lines (shuffled order and direction)');
const dshape: Entity[] = [{ t: 'line', a: { x: -10, y: 0 }, b: { x: 10, y: 0 } }, { t: 'arc', a: { x: 10, y: 0 }, b: { x: -10, y: 0 }, m: { x: 0, y: 10 } }];
near(volume(extrude(resolveLoops(dshape), 1)), (Math.PI * 100) / 2, 0.5, 'half disc from line + 3-point arc');
const lower: Entity[] = [{ t: 'line', a: { x: -10, y: 0 }, b: { x: 10, y: 0 } }, { t: 'arc', a: { x: 10, y: 0 }, b: { x: -10, y: 0 }, m: { x: 0, y: -10 } }];
near(volume(extrude(resolveLoops(lower), 1)), (Math.PI * 100) / 2, 0.5, 'arc through the lower side');
let threw = false; try { resolveLoops(tri.slice(0, 2)); } catch { threw = true; }
if (!threw) { console.error('FAIL open profile accepted'); process.exit(1); } console.log('ok open profile rejected');

{ // 90 degree corner at the origin, r=2: tangent points at 2, arc centre (2,2), middle point on the circle nearest the corner
  const f = filletCorner({ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 0, y: 10 }, 2);
  near(f.t1.x, 2, 1e-9, 'fillet tangent point 1 x'); near(f.t2.y, 2, 1e-9, 'fillet tangent point 2 y');
  const k = circle3(f.arc.a, f.arc.b, f.arc.m)!; near(k.c.x, 2, 1e-9, 'fillet centre x'); near(k.c.y, 2, 1e-9, 'fillet centre y'); near(k.r, 2, 1e-9, 'fillet radius');
  let big = false; try { filletCorner({ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 0, y: 10 }, 20); } catch { big = true; } if (!big) { console.error('FAIL oversize'); process.exit(1); }
  // closed square 10x10 with one corner rounded r=2: area = 100 - r^2(1 - pi/4)
  const sq = [{ t: 'line', a: { x: 0, y: 0 }, b: { x: 10, y: 0 } }, { t: 'line', a: { x: 10, y: 0 }, b: { x: 10, y: 10 } }, { t: 'line', a: { x: 10, y: 10 }, b: { x: 0, y: 10 } }, { t: 'line', a: { x: 0, y: 10 }, b: { x: 0, y: 0 } }] as any[];
  const fc = filletCorner({ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 0, y: 10 }, 2); sq[0].a = fc.t1; sq[3].b = fc.t2; sq.push({ t: 'arc', ...fc.arc });
  near(volume(extrude(resolveLoops(sq), 1)), 100 - 4 * (1 - Math.PI / 4), 0.05, 'square with one rounded corner');
  void arcPoints;
}

{ // a 10 long line crossed at x=3 and x=7 by two vertical lines
  const l = { a: { x: 0, y: 0 }, b: { x: 10, y: 0 } }; const cr = [{ a: { x: 3, y: -1 }, b: { x: 3, y: 1 } }, { a: { x: 7, y: -1 }, b: { x: 7, y: 1 } }];
  const mid = trimLine(l, cr, { x: 5, y: 0 }); near(mid.length, 2, 0, 'trim middle leaves two pieces'); near(mid[0].b.x, 3, 1e-9, 'left piece ends at 3'); near(mid[1].a.x, 7, 1e-9, 'right piece starts at 7');
  const end = trimLine(l, cr, { x: 9, y: 0 }); near(end.length, 1, 0, 'trim the end leaves one piece'); near(end[0].b.x, 7, 1e-9, 'kept piece ends at 7');
  near(trimLine(l, [], { x: 5, y: 0 }).length, 0, 0, 'no crossing removes the line');
}
