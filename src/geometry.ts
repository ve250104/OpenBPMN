import type { BpmnModdle, ModdleElement } from 'bpmn-moddle';
import { readFile } from 'node:fs/promises';
import { OperationError } from './diagnostics.js';

interface Point {
  x: number;
  y: number;
}
interface Rect extends Point {
  width: number;
  height: number;
}
type Segment = [Point, Point];
export interface GeometryConflict {
  kind: 'shared-segment' | 'label-connector' | 'label-shape' | 'label-label' | 'connector-shape';
  elements: string[];
}

/** Required names remain semantic; this is only the complete visible caption. */
export function displayLabel(semantic: ModdleElement): string {
  if (semantic.$type === 'bpmn:Group') return semantic.categoryValueRef?.value ?? '';
  if (semantic.$type === 'bpmn:DataObjectReference' && semantic.dataState?.name)
    return [semantic.name, `[${semantic.dataState.name}]`].filter(Boolean).join('\n');
  if (semantic.$type === 'bpmn:MessageFlow')
    return [...new Set([semantic.name, semantic.messageRef?.name].filter(Boolean))].join('\n');
  return semantic.name ?? '';
}

const isContainer = (shape: ModdleElement) =>
  ['bpmn:Participant', 'bpmn:Lane', 'bpmn:Group'].includes(shape.bpmnElement.$type) ||
  (shape.bpmnElement.$type === 'bpmn:SubProcess' && shape.isExpanded);
const segments = (edge: ModdleElement): Segment[] =>
  (edge.waypoint ?? []).slice(1).map((point: Point, index: number) => [edge.waypoint[index], point]);
const overlap = (a: Rect, b: Rect) =>
  a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
const expand = (box: Rect, amount: number): Rect => ({
  x: box.x - amount,
  y: box.y - amount,
  width: box.width + amount * 2,
  height: box.height + amount * 2,
});

/** Open-interior intersection, including diagonal supplied DI. Boundary docking is legal. */
function intersects([a, b]: Segment, box: Rect): boolean {
  let low = 0;
  let high = 1;
  for (const axis of ['x', 'y'] as const) {
    const size = axis === 'x' ? box.width : box.height;
    const difference = b[axis] - a[axis];
    if (difference === 0) {
      if (a[axis] <= box[axis] || a[axis] >= box[axis] + size) return false;
    } else {
      const start = (box[axis] - a[axis]) / difference;
      const end = (box[axis] + size - a[axis]) / difference;
      low = Math.max(low, Math.min(start, end));
      high = Math.min(high, Math.max(start, end));
      if (low >= high) return false;
    }
  }
  return low < high;
}

function intersectsShape(segment: Segment, shape: ModdleElement): boolean {
  const box = shape.bounds as Rect;
  if (!intersects(segment, box)) return false;
  if (!shape.bpmnElement.$instanceOf?.('bpmn:Gateway') && !shape.bpmnElement.$instanceOf?.('bpmn:Event')) return true;
  const points = segment.map((point) => ({
    x: (point.x - box.x - box.width / 2) / (box.width / 2),
    y: (point.y - box.y - box.height / 2) / (box.height / 2),
  }));
  const [a, b] = points as [Point, Point];
  if (shape.bpmnElement.$instanceOf('bpmn:Event')) {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const t = Math.max(0, Math.min(1, -(a.x * dx + a.y * dy) / (dx * dx + dy * dy)));
    return (a.x + t * dx) ** 2 + (a.y + t * dy) ** 2 < 1 - 1e-8;
  }
  let low = 0;
  let high = 1;
  for (const [x, y] of [
    [1, 1],
    [1, -1],
    [-1, 1],
    [-1, -1],
  ]) {
    const start = a.x * x! + a.y * y!;
    const delta = (b.x - a.x) * x! + (b.y - a.y) * y!;
    if (delta === 0) {
      if (start >= 1 - 1e-8) return false;
    } else if (delta > 0) high = Math.min(high, (1 - 1e-8 - start) / delta);
    else low = Math.max(low, (1 - 1e-8 - start) / delta);
  }
  return low < high;
}

function shared([a, b]: Segment, [c, d]: Segment): boolean {
  if (a.x === b.x && c.x === d.x && a.x === c.x)
    return Math.min(Math.max(a.y, b.y), Math.max(c.y, d.y)) - Math.max(Math.min(a.y, b.y), Math.min(c.y, d.y)) > 1;
  if (a.y === b.y && c.y === d.y && a.y === c.y)
    return Math.min(Math.max(a.x, b.x), Math.max(c.x, d.x)) - Math.max(Math.min(a.x, b.x), Math.min(c.x, d.x)) > 1;
  return false;
}

/** Geometric findings do not repair supplied XML or infer semantic relationships. */
export function diagramConflicts(plane: ModdleElement): GeometryConflict[] {
  const elements = (plane.planeElement ?? []) as ModdleElement[];
  const edges = elements.filter((element) => element.$type === 'bpmndi:BPMNEdge');
  const shapes = elements.filter((element) => element.$type === 'bpmndi:BPMNShape' && !isContainer(element));
  const labels = elements.filter((element) => element.label?.bounds);
  const conflicts: GeometryConflict[] = [];
  const add = (kind: GeometryConflict['kind'], a: ModdleElement, b: ModdleElement) =>
    conflicts.push({ kind, elements: [a.bpmnElement.id, b.bpmnElement.id] });
  for (const [index, edge] of edges.entries()) {
    for (const other of edges.slice(index + 1))
      if (segments(edge).some((a) => segments(other).some((b) => shared(a, b)))) add('shared-segment', edge, other);
    for (const shape of shapes)
      if (segments(edge).some((segment) => intersectsShape(segment, shape))) add('connector-shape', edge, shape);
  }
  for (const [index, label] of labels.entries()) {
    for (const edge of edges)
      if (segments(edge).some((segment) => intersects(segment, expand(label.label.bounds, 2))))
        add('label-connector', label, edge);
    for (const shape of shapes) if (overlap(label.label.bounds, shape.bounds)) add('label-shape', label, shape);
    for (const other of labels.slice(index + 1))
      if (overlap(label.label.bounds, other.label.bounds)) add('label-label', label, other);
  }
  return conflicts;
}

const distance = (a: Point, b: Point) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
const same = (a: Point, b: Point) => a.x === b.x && a.y === b.y;
const simplify = (points: Point[]): Point[] =>
  points.filter(
    (point, index) =>
      !(index && same(point, points[index - 1]!)) &&
      !(
        index &&
        index < points.length - 1 &&
        ((point.x === points[index - 1]!.x && point.x === points[index + 1]!.x) ||
          (point.y === points[index - 1]!.y && point.y === points[index + 1]!.y))
      ),
  );
const lineSegments = (points: Point[]): Segment[] => points.slice(1).map((point, index) => [points[index]!, point]);

function route(
  edge: ModdleElement,
  shapes: ModdleElement[],
  others: ModdleElement[],
  labels: Rect[],
  containers: ModdleElement[],
): Point[] {
  const original = edge.waypoint as Point[];
  // Sequence Flows may cross lanes, but must stay within their Process pool
  // and any visible enclosing SubProcess. Message Flows cross pools instead.
  const ancestors: ModdleElement[] = [];
  if (edge.bpmnElement.$type === 'bpmn:SequenceFlow')
    for (let parent = edge.bpmnElement.$parent; parent; parent = parent.$parent) ancestors.push(parent);
  const subprocesses = containers.filter(
    (container) =>
      container.bpmnElement.$type === 'bpmn:SubProcess' &&
      ancestors.some((parent) => parent.id === container.bpmnElement.id),
  );
  const process = ancestors.find((parent) => parent.$type === 'bpmn:Process');
  const pools = containers.filter(
    (container) =>
      container.bpmnElement.$type === 'bpmn:Participant' &&
      process &&
      container.bpmnElement.processRef?.id === process.id,
  );
  const inside = (points: Point[], container: ModdleElement) => {
    const box = container.bounds as Rect;
    return points.every(
      (point) => point.x >= box.x && point.y >= box.y && point.x <= box.x + box.width && point.y <= box.y + box.height,
    );
  };
  const obstacles = [...shapes.map((shape) => shape.bounds as Rect), ...labels.map((box) => expand(box, 4))];
  const occupied = others.flatMap(segments);
  const vertical = new Map<number, Segment[]>();
  const horizontal = new Map<number, Segment[]>();
  for (const segment of occupied) {
    const map = segment[0].x === segment[1].x ? vertical : horizontal;
    const key = segment[0].x === segment[1].x ? segment[0].x : segment[0].y;
    const values = map.get(key) ?? [];
    values.push(segment);
    map.set(key, values);
  }
  const cache = new Map<string, boolean>();
  const legal = (points: Point[]) =>
    subprocesses.every((container) => inside(points, container)) &&
    (!pools.length || pools.some((container) => inside(points, container))) &&
    lineSegments(points).every((segment) => {
      const [a, b] = segment;
      const key = `${a.x},${a.y},${b.x},${b.y}`;
      const cached = cache.get(key);
      if (cached !== undefined) return cached;
      const relevant = a.x === b.x ? vertical.get(a.x) : horizontal.get(a.y);
      const result =
        (a.x === b.x || a.y === b.y) &&
        !shapes.some((shape) => intersectsShape(segment, shape)) &&
        !labels.some((box) => intersects(segment, expand(box, 4))) &&
        !(relevant ?? []).some((other) => shared(segment, other));
      cache.set(key, result);
      return result;
    });
  if (legal(original)) return original;
  const outward = (point: Point, next: Point): Point => ({
    x: point.x + Math.sign(next.x - point.x) * 16,
    y: point.y + Math.sign(next.y - point.y) * 16,
  });
  const ports = (point: Point, next: Point, reference: ModdleElement | ModdleElement[]): Array<[Point, Point]> => {
    let anchor: ModdleElement | undefined;
    for (let current = Array.isArray(reference) ? reference[0] : reference; current; current = current.$parent) {
      anchor = [...shapes, ...containers].find((shape) => shape.bpmnElement.id === current.id);
      if (anchor) break;
    }
    const shape =
      anchor ??
      shapes
        .filter((shape) => {
          const b = shape.bounds as Rect;
          return point.x >= b.x && point.x <= b.x + b.width && point.y >= b.y && point.y <= b.y + b.height;
        })
        .sort((a, b) => a.bounds.width * a.bounds.height - b.bounds.width * b.bounds.height)[0];
    const result: Array<[Point, Point]> = [[point, outward(point, next)]];
    if (shape) {
      const b = shape.bounds as Rect;
      const cx = b.x + b.width / 2;
      const cy = b.y + b.height / 2;
      result.push(
        [
          { x: b.x + b.width, y: cy },
          { x: b.x + b.width + 16, y: cy },
        ],
        [
          { x: b.x, y: cy },
          { x: b.x - 16, y: cy },
        ],
        [
          { x: cx, y: b.y + b.height },
          { x: cx, y: b.y + b.height + 16 },
        ],
        [
          { x: cx, y: b.y },
          { x: cx, y: b.y - 16 },
        ],
      );
      // Centre/quarter ports alone exhaust even a twelve-handoff activity.
      // Reserve further docking positions from its actual perimeter space.
      const divisions = Math.max(4, Math.floor(Math.min(b.width, b.height) / 12));
      const fractions = [
        ...new Set([0.25, 0.75, ...Array.from({ length: divisions - 1 }, (_, index) => (index + 1) / divisions)]),
      ];
      for (const fraction of fractions) {
        const radial = Math.abs(fraction * 2 - 1);
        const inset = shape.bpmnElement.$instanceOf?.('bpmn:Gateway')
          ? radial
          : shape.bpmnElement.$instanceOf?.('bpmn:Event')
            ? 1 - Math.sqrt(1 - radial * radial)
            : 0;
        result.push(
          [
            { x: b.x + b.width - (b.width / 2) * inset, y: b.y + b.height * fraction },
            { x: b.x + b.width + 16, y: b.y + b.height * fraction },
          ],
          [
            { x: b.x + (b.width / 2) * inset, y: b.y + b.height * fraction },
            { x: b.x - 16, y: b.y + b.height * fraction },
          ],
          [
            { x: b.x + b.width * fraction, y: b.y + b.height - (b.height / 2) * inset },
            { x: b.x + b.width * fraction, y: b.y + b.height + 16 },
          ],
          [
            { x: b.x + b.width * fraction, y: b.y + (b.height / 2) * inset },
            { x: b.x + b.width * fraction, y: b.y - 16 },
          ],
        );
      }
    }
    return result;
  };
  const score = (points: Point[]) =>
    lineSegments(points).reduce((total, [a, b]) => total + distance(a, b), 0) + points.length * 10;
  const starts = ports(original[0]!, original[1]!, edge.bpmnElement.sourceRef);
  const ends = ports(original.at(-1)!, original.at(-2)!, edge.bpmnElement.targetRef);
  for (const [first, start] of starts)
    for (const [last, end] of ends) {
      if (!legal([first, start]) || !legal([end, last])) continue;
      const candidates: Point[][] = [];
      const xs = [
        ...new Set([
          start.x,
          end.x,
          ...obstacles.flatMap((box) => [box.x - 24, box.x + box.width + 24]),
          ...original.map((point) => point.x - 20),
          ...original.map((point) => point.x + 20),
        ]),
      ];
      const ys = [
        ...new Set([
          start.y,
          end.y,
          ...obstacles.flatMap((box) => [box.y - 24, box.y + box.height + 24]),
          ...original.map((point) => point.y - 20),
          ...original.map((point) => point.y + 20),
        ]),
      ];
      candidates.push(
        [first, start, { x: end.x, y: start.y }, end, last],
        [first, start, { x: start.x, y: end.y }, end, last],
        ...xs.map((x) => [first, start, { x, y: start.y }, { x, y: end.y }, end, last]),
        ...ys.map((y) => [first, start, { x: start.x, y }, { x: end.x, y }, end, last]),
      );
      candidates.sort((a, b) => score(a) - score(b));
      for (const candidate of candidates) {
        const points = simplify(candidate);
        if (legal(points)) return points;
      }
    }
  for (const [first, start] of starts)
    for (const [last, end] of ends) {
      if (!legal([first, start]) || !legal([end, last])) continue;
      const xs = [
        ...new Set([start.x, end.x, ...obstacles.flatMap((box) => [box.x - 16, box.x + box.width + 16])]),
      ].sort((a, b) => a - b);
      const ys = [
        ...new Set([start.y, end.y, ...obstacles.flatMap((box) => [box.y - 16, box.y + box.height + 16])]),
      ].sort((a, b) => a - b);
      const middle = searchRoute(start, end, xs, ys, (a, b) => legal([a, b]));
      if (middle) return simplify([first, ...middle, last]);
    }
  const message = 'The layout could not route a connection without an ambiguous overlap.';
  throw new OperationError('DI_INVALID', 'diagram', message, 2, 'refused', [
    {
      code: 'DI_INVALID',
      category: 'diagram',
      message,
      elementRefs: [edge.bpmnElement.id.replace(/^M_/, '')],
      remediation:
        'Try another participant/lane order or expand a containing subprocess; preserve the process relationships. Report the fixture if no presentation choice works.',
    },
  ]);
}

/** A bounded orthogonal visibility grid is a fallback, not the common-case path. */
function searchRoute(
  start: Point,
  end: Point,
  xs: number[],
  ys: number[],
  legal: (a: Point, b: Point) => boolean,
): Point[] | undefined {
  if (xs.length * ys.length > 1_000_000) return undefined;
  const width = xs.length;
  const encode = (x: number, y: number) => y * width + x;
  const point = (id: number): Point => ({ x: xs[id % width]!, y: ys[Math.floor(id / width)]! });
  const initial = encode(xs.indexOf(start.x), ys.indexOf(start.y));
  const goal = encode(xs.indexOf(end.x), ys.indexOf(end.y));
  const costs = new Map<number, number>([[initial, 0]]);
  const previous = new Map<number, number>();
  const queue: Array<{ id: number; score: number }> = [];
  const push = (entry: { id: number; score: number }) => {
    queue.push(entry);
    let index = queue.length - 1;
    while (index) {
      const parent = (index - 1) >> 1;
      if (queue[parent]!.score <= entry.score) break;
      queue[index] = queue[parent]!;
      index = parent;
    }
    queue[index] = entry;
  };
  const pop = () => {
    const result = queue[0]!;
    const last = queue.pop()!;
    if (queue.length) {
      let index = 0;
      while (index * 2 + 1 < queue.length) {
        let child = index * 2 + 1;
        if (child + 1 < queue.length && queue[child + 1]!.score < queue[child]!.score) child++;
        if (queue[child]!.score >= last.score) break;
        queue[index] = queue[child]!;
        index = child;
      }
      queue[index] = last;
    }
    return result;
  };
  push({ id: initial, score: distance(start, end) });
  const visited = new Set<number>();
  while (queue.length && visited.size < 100_000) {
    const current = pop().id;
    if (visited.has(current)) continue;
    if (current === goal) {
      const path = [point(current)];
      let cursor = current;
      while (previous.has(cursor)) {
        cursor = previous.get(cursor)!;
        path.push(point(cursor));
      }
      return path.reverse();
    }
    visited.add(current);
    const x = current % width;
    const y = Math.floor(current / width);
    const a = point(current);
    for (const [nx, ny] of [
      [x - 1, y],
      [x + 1, y],
      [x, y - 1],
      [x, y + 1],
    ]) {
      if (nx! < 0 || ny! < 0 || nx! >= width || ny! >= ys.length) continue;
      const next = encode(nx!, ny!);
      if (visited.has(next)) continue;
      const b = point(next);
      if (!legal(a, b)) continue;
      const cost = costs.get(current)! + distance(a, b);
      if (cost >= (costs.get(next) ?? Infinity)) continue;
      costs.set(next, cost);
      previous.set(next, current);
      push({ id: next, score: cost + distance(b, end) });
    }
  }
  return undefined;
}

/** Conservative advance-based reservation; browser tests remain the shaping authority. */
async function labelSizer(): Promise<(text: string, explicitWidth?: number) => { width: number; height: number }> {
  const metrics: { faces: Array<{ weight: number; advances: Record<string, number> }> } = JSON.parse(
    await readFile(new URL('../assets/fonts/metrics.json', import.meta.url), 'utf8'),
  );
  const advances: Record<string, number> = Object.assign(
    {},
    ...metrics.faces.filter((face) => face.weight === 400).map((face) => face.advances),
  );
  return (text, explicitWidth) => {
    const measure = (value: string) =>
      [...value].reduce((sum, char) => sum + (advances[char.codePointAt(0)!] ?? 1) * 12 * 1.08, 0);
    const width = explicitWidth ?? Math.max(90, Math.min(200, Math.ceil(measure(text) + 12)));
    let lines = 0;
    for (const paragraph of text.split(/\r?\n/)) {
      let used = 0;
      lines++;
      for (const token of paragraph.split(/(?<=[\s-])/u)) {
        const advance = measure(token);
        if (used && used + advance >= width - 12) {
          used = 0;
          lines++;
        }
        if (advance >= width - 12) {
          const count = Math.ceil(advance / (width - 12));
          lines += count - 1;
          used = advance - (count - 1) * (width - 12);
        } else used += advance;
      }
    }
    return { width, height: Math.ceil(lines * 14.4 + 8) };
  };
}

function reserveInternalText(
  elements: ModdleElement[],
  size: (text: string, width?: number) => { width: number; height: number },
): void {
  interface Cut {
    start: number;
    end: number;
    factor: number;
  }
  const xCuts: Cut[] = [];
  const yCuts: Cut[] = [];
  const shapes = elements.filter((element) => element.$type === 'bpmndi:BPMNShape');
  const before = new Map(shapes.map((shape) => [shape, { ...shape.bounds } as Rect]));
  for (const shape of shapes) {
    const semantic = shape.bpmnElement;
    const b = shape.bounds as Rect;
    if ((!semantic.$instanceOf?.('bpmn:Activity') || shape.isExpanded) && semantic.$type !== 'bpmn:TextAnnotation')
      continue;
    const text = semantic.$type === 'bpmn:TextAnnotation' ? semantic.text : semantic.name;
    if (!text) continue;
    const initial = size(text, b.width - 14);
    if (initial.height + 28 <= b.height) continue;
    const width = Math.max(b.width, Math.min(280, Math.ceil(Math.sqrt(initial.height * b.width * 1.8))));
    const height = Math.max(b.height, size(text, width - 14).height + 28);
    if (width > b.width) xCuts.push({ start: b.x, end: b.x + b.width, factor: width / b.width });
    if (height > b.height) yCuts.push({ start: b.y, end: b.y + b.height, factor: height / b.height });
  }
  if (!xCuts.length && !yCuts.length) return;
  const mapping = (cuts: Cut[]) => {
    const breaks = [...new Set(cuts.flatMap((cut) => [cut.start, cut.end]))].sort((a, b) => a - b);
    const intervals = breaks.slice(1).map((end, index) => {
      const start = breaks[index]!;
      const factor = Math.max(
        1,
        ...cuts.filter((cut) => cut.start <= start && cut.end >= end).map((cut) => cut.factor),
      );
      return { start, end, factor };
    });
    return (value: number) =>
      value +
      intervals.reduce(
        (extra, interval) =>
          extra + Math.max(0, Math.min(value, interval.end) - interval.start) * (interval.factor - 1),
        0,
      );
  };
  const x = mapping(xCuts);
  const y = mapping(yCuts);
  for (const shape of shapes) {
    const b = before.get(shape)!;
    const fixed =
      !isContainer(shape) &&
      !shape.bpmnElement.$instanceOf?.('bpmn:Activity') &&
      shape.bpmnElement.$type !== 'bpmn:TextAnnotation';
    Object.assign(
      shape.bounds,
      fixed
        ? { x: x(b.x + b.width / 2) - b.width / 2, y: y(b.y + b.height / 2) - b.height / 2 }
        : { x: x(b.x), y: y(b.y), width: x(b.x + b.width) - x(b.x), height: y(b.y + b.height) - y(b.y) },
    );
  }
  const retarget = (point: Point): Point => {
    const anchor = shapes
      .filter((shape) => {
        const b = before.get(shape)!;
        return (
          !isContainer(shape) &&
          point.x >= b.x &&
          point.x <= b.x + b.width &&
          point.y >= b.y &&
          point.y <= b.y + b.height
        );
      })
      .sort((a, b) => before.get(a)!.width * before.get(a)!.height - before.get(b)!.width * before.get(b)!.height)[0];
    if (!anchor) return { x: x(point.x), y: y(point.y) };
    const b = before.get(anchor)!;
    const next = anchor.bounds as Rect;
    return {
      x: next.x + (next.width * (point.x - b.x)) / b.width,
      y: next.y + (next.height * (point.y - b.y)) / b.height,
    };
  };
  for (const edge of elements.filter((element) => element.$type === 'bpmndi:BPMNEdge')) {
    const original = edge.waypoint as Point[];
    const points = original.map((point) => ({ x: x(point.x), y: y(point.y) }));
    points[0] = retarget(original[0]!);
    points[points.length - 1] = retarget(original.at(-1)!);
    if (points.length === 2 && points[0]!.x !== points[1]!.x && points[0]!.y !== points[1]!.y) {
      const mid = (points[0]!.x + points[1]!.x) / 2;
      points.splice(1, 0, { x: mid, y: points[0]!.y }, { x: mid, y: points[1]!.y });
    } else if (points.length > 2) {
      if (original[0]!.x === original[1]!.x) points[1]!.x = points[0]!.x;
      else points[1]!.y = points[0]!.y;
      if (original.at(-1)!.x === original.at(-2)!.x) points[points.length - 2]!.x = points.at(-1)!.x;
      else points[points.length - 2]!.y = points.at(-1)!.y;
    }
    edge.waypoint = points;
  }
}

function reserveCommunicationSpace(elements: ModdleElement[]): void {
  if (elements.filter((element) => element.bpmnElement.$type === 'bpmn:MessageFlow').length <= 10) return;
  const sx = 1.5;
  const sy = 2;
  const shapes = elements.filter((element) => element.bounds);
  const before = new Map(shapes.map((shape) => [shape, { ...shape.bounds } as Rect]));
  for (const shape of shapes) {
    const b = before.get(shape)!;
    Object.assign(
      shape.bounds,
      isContainer(shape)
        ? { x: b.x * sx, y: b.y * sy, width: b.width * sx, height: b.height * sy }
        : { x: (b.x + b.width / 2) * sx - b.width / 2, y: (b.y + b.height / 2) * sy - b.height / 2 },
    );
  }
  const endpoint = (point: Point): Point => {
    const anchor = shapes
      .filter((shape) => {
        const b = before.get(shape)!;
        return (
          !isContainer(shape) &&
          point.x >= b.x &&
          point.x <= b.x + b.width &&
          point.y >= b.y &&
          point.y <= b.y + b.height
        );
      })
      .sort((a, b) => before.get(a)!.width * before.get(a)!.height - before.get(b)!.width * before.get(b)!.height)[0];
    if (!anchor) return { x: point.x * sx, y: point.y * sy };
    const b = before.get(anchor)!;
    return { x: anchor.bounds.x + point.x - b.x, y: anchor.bounds.y + point.y - b.y };
  };
  for (const edge of elements.filter((element) => element.waypoint)) {
    const original = edge.waypoint as Point[];
    const points = original.map((point) => ({ x: point.x * sx, y: point.y * sy }));
    points[0] = endpoint(original[0]!);
    points[points.length - 1] = endpoint(original.at(-1)!);
    if (points.length === 2 && points[0]!.x !== points[1]!.x && points[0]!.y !== points[1]!.y) {
      const mid = (points[0]!.x + points[1]!.x) / 2;
      points.splice(1, 0, { x: mid, y: points[0]!.y }, { x: mid, y: points[1]!.y });
    } else if (points.length > 2) {
      if (original[0]!.x === original[1]!.x) points[1]!.x = points[0]!.x;
      else points[1]!.y = points[0]!.y;
      if (original.at(-1)!.x === original.at(-2)!.x) points[points.length - 2]!.x = points.at(-1)!.x;
      else points[points.length - 2]!.y = points.at(-1)!.y;
    }
    edge.waypoint = points;
  }
}

export async function completeGeometry(
  plane: ModdleElement,
  moddle: BpmnModdle,
  groups: Map<string, string[]> = new Map(),
): Promise<void> {
  const elements = (plane.planeElement ?? []) as ModdleElement[];
  const size = await labelSizer();
  reserveInternalText(elements, size);
  reserveCommunicationSpace(elements);
  const shapes = elements.filter((element) => element.$type === 'bpmndi:BPMNShape' && !isContainer(element));
  const containers = elements.filter(
    (element) =>
      element.$type === 'bpmndi:BPMNShape' && isContainer(element) && element.bpmnElement.$type !== 'bpmn:Group',
  );
  const edges = elements.filter((element) => element.$type === 'bpmndi:BPMNEdge');
  const placed: Rect[] = containers
    .filter(
      (container) =>
        ['bpmn:Lane', 'bpmn:Participant'].includes(container.bpmnElement.$type) &&
        (container.bpmnElement.$type === 'bpmn:Lane' || container.bpmnElement.processRef),
    )
    .map((container) => ({ x: container.bounds.x, y: container.bounds.y, width: 30, height: container.bounds.height }));
  let occupiedSegments: Segment[] = [];
  const available = (box: Rect) =>
    !shapes.some((shape) => overlap(expand(box, 3), shape.bounds)) &&
    !placed.some((other) => overlap(expand(box, 4), other)) &&
    !occupiedSegments.some((segment) => intersects(segment, expand(box, 4))) &&
    !containers.some((container) => {
      const b = container.bounds as Rect;
      return [
        [
          { x: b.x, y: b.y },
          { x: b.x + b.width, y: b.y },
        ],
        [
          { x: b.x, y: b.y + b.height },
          { x: b.x + b.width, y: b.y + b.height },
        ],
        [
          { x: b.x, y: b.y },
          { x: b.x, y: b.y + b.height },
        ],
        [
          { x: b.x + b.width, y: b.y },
          { x: b.x + b.width, y: b.y + b.height },
        ],
      ].some((segment) => intersects(segment as Segment, expand(box, 4)));
    });
  const externals = elements.filter(
    (element) =>
      Boolean(displayLabel(element.bpmnElement)) &&
      (element.$type === 'bpmndi:BPMNEdge' ||
        element.bpmnElement.$instanceOf?.('bpmn:Event') ||
        element.bpmnElement.$instanceOf?.('bpmn:Gateway') ||
        ['bpmn:DataInput', 'bpmn:DataOutput', 'bpmn:DataObjectReference', 'bpmn:DataStoreReference'].includes(
          element.bpmnElement.$type,
        )),
  );
  // Shape labels are the visual anchor; flow labels use remaining nearby space.
  externals.sort((a, b) => Number(a.$type === 'bpmndi:BPMNEdge') - Number(b.$type === 'bpmndi:BPMNEdge'));
  let routed = false;
  const routeEdges = () => {
    // Initial paths are proposals, and may overlap. Only accepted paths occupy
    // a channel; reserving the unprocessed proposals can make legal routes fail.
    const completed: ModdleElement[] = [];
    for (const edge of [...edges].reverse()) {
      edge.waypoint = route(edge, shapes, completed, placed, containers).map((point) =>
        moddle.create('dc:Point', { x: point.x, y: point.y }),
      );
      completed.push(edge);
    }
    occupiedSegments = edges.flatMap(segments);
    routed = true;
  };
  for (const element of externals) {
    if (element.$type === 'bpmndi:BPMNEdge' && !routed) routeEdges();
    const { width, height } = size(displayLabel(element.bpmnElement));
    const candidates: Rect[] = [];
    if (element.$type === 'bpmndi:BPMNShape') {
      const b = element.bounds as Rect;
      for (const gap of [8, 20, 36, 56, 80])
        candidates.push(
          { x: b.x + b.width / 2 - width / 2, y: b.y + b.height + gap, width, height },
          { x: b.x + b.width / 2 - width / 2, y: b.y - height - gap, width, height },
          { x: b.x + b.width + gap, y: b.y + b.height / 2 - height / 2, width, height },
          { x: b.x - width - gap, y: b.y + b.height / 2 - height / 2, width, height },
        );
    } else {
      for (const gap of [8, 20, 36, 56, 80, 120, 180, 260])
        for (const [a, b] of segments(element)) {
          const steps = Math.max(1, Math.min(100, Math.floor(distance(a, b) / 24)));
          const fractions = [
            ...new Set([0.5, ...Array.from({ length: steps }, (_, index) => (index + 1) / (steps + 1))]),
          ].sort((x, y) => Math.abs(x - 0.5) - Math.abs(y - 0.5));
          for (const fraction of fractions) {
            const x = a.x + (b.x - a.x) * fraction;
            const y = a.y + (b.y - a.y) * fraction;
            if (a.y === b.y)
              candidates.push(
                { x: x - width / 2, y: y - height - gap, width, height },
                { x: x - width / 2, y: y + gap, width, height },
              );
            else
              candidates.push(
                { x: x + gap, y: y - height / 2, width, height },
                { x: x - width - gap, y: y - height / 2, width, height },
              );
          }
        }
    }
    const ownContainer =
      element.$type === 'bpmndi:BPMNShape' &&
      containers
        .filter((container) => {
          const c = container.bounds as Rect;
          const b = element.bounds as Rect;
          return b.x >= c.x && b.y >= c.y && b.x + b.width <= c.x + c.width && b.y + b.height <= c.y + c.height;
        })
        .sort((a, b) => a.bounds.width * a.bounds.height - b.bounds.width * b.bounds.height)[0];
    const adjusted = ownContainer
      ? candidates.map((box) => {
          const c = ownContainer.bounds as Rect;
          return {
            ...box,
            x: Math.max(c.x + 36, Math.min(c.x + c.width - 8 - box.width, box.x)),
            y: Math.max(c.y + 8, Math.min(c.y + c.height - 8 - box.height, box.y)),
          };
        })
      : candidates;
    const bounds = adjusted.find(available);
    if (!bounds) {
      const message = 'The layout could not reserve readable space for a complete label.';
      throw new OperationError('DI_INVALID', 'diagram', message, 2, 'refused', [
        {
          code: 'DI_INVALID',
          category: 'diagram',
          message,
          elementRefs: [element.bpmnElement.id.replace(/^M_/, '')],
          remediation:
            'Choose a clearer short label or another participant/lane order. Do not remove process meaning to work around a layout failure.',
        },
      ]);
    }
    placed.push(bounds);
    element.label = moddle.create('bpmndi:BPMNLabel', { bounds: moddle.create('dc:Bounds', { ...bounds }) });
  }
  if (!routed) routeEdges();
  for (const shape of elements.filter((element) => element.bpmnElement.$type === 'bpmn:Group')) {
    const members = new Set(groups.get(shape.bpmnElement.id) ?? []);
    const points: Point[] = elements
      .filter((element) => members.has(element.bpmnElement.id))
      .flatMap((element) => [
        ...(element.bounds
          ? [
              element.bounds,
              { x: element.bounds.x + element.bounds.width, y: element.bounds.y + element.bounds.height },
            ]
          : (element.waypoint ?? [])),
        ...(element.label?.bounds
          ? [
              element.label.bounds,
              {
                x: element.label.bounds.x + element.label.bounds.width,
                y: element.label.bounds.y + element.label.bounds.height,
              },
            ]
          : []),
      ]);
    if (!points.length) continue;
    const caption = size(displayLabel(shape.bpmnElement));
    const left = Math.min(...points.map((point) => point.x)) - 24;
    let top = Math.min(...points.map((point) => point.y)) - caption.height - 24;
    const width = Math.max(caption.width + 24, Math.max(...points.map((point) => point.x)) - left + 24);
    const candidates: Rect[] = [];
    for (const gap of [0, 24, 48, 80, 120, 180])
      for (let x = left + 12; x + caption.width <= left + width - 12; x += 24)
        candidates.push({ x, y: top + 8 - gap, ...caption });
    const label = candidates.find(available);
    if (!label)
      throw new OperationError(
        'DI_INVALID',
        'diagram',
        'The layout could not reserve a readable Group caption.',
        2,
        'refused',
      );
    top = Math.min(top, label.y - 8);
    Object.assign(shape.bounds, {
      x: left,
      y: top,
      width,
      height: Math.max(...points.map((point) => point.y)) - top + 24,
    });
    shape.label = moddle.create('bpmndi:BPMNLabel', { bounds: moddle.create('dc:Bounds', { ...label }) });
    placed.push(label);
  }
  // OMG DI uses the positive quadrant. Move the whole plane, never its meaning.
  const points: Point[] = elements.flatMap((element) => [
    ...(element.bounds ? [element.bounds] : (element.waypoint ?? [])),
    ...(element.label?.bounds ? [element.label.bounds] : []),
  ]);
  const dx = Math.max(0, 16 - Math.min(...points.map((point) => point.x)));
  const dy = Math.max(0, 16 - Math.min(...points.map((point) => point.y)));
  for (const point of points) {
    point.x += dx;
    point.y += dy;
  }
  const conflicts = diagramConflicts(plane);
  if (conflicts.length) {
    const message = 'The completed diagram contains overlapping labels or ambiguous routing.';
    throw new OperationError(
      'DI_INVALID',
      'diagram',
      message,
      2,
      'refused',
      conflicts.map((conflict) => ({
        code: 'DI_INVALID',
        category: 'diagram',
        message,
        elementRefs: conflict.elements.map((id) => id.replace(/^M_/, '')),
        remediation: 'Try another presentation order or expansion setting; retain the complete process relationships.',
      })),
    );
  }
}
