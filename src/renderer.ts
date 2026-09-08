import { constants } from 'node:fs';
import { access, chmod, mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import { delimiter, isAbsolute, join } from 'node:path';
import { OperationError, type FindingInput } from './diagnostics.js';
import type { Browser } from 'puppeteer-core';
import type { ModdleElement } from 'bpmn-moddle';
import { displayLabel } from './geometry.js';

interface FontFace {
  file: string;
  weight: number;
  unicodeRange: string;
}
interface AssetManifest {
  viewer: { file: string };
  font: { faces: FontFace[] };
}

export async function renderSvg(
  xml: string,
  options: { browserExecutable?: string; signal?: AbortSignal } = {},
): Promise<string> {
  if (options.signal?.aborted) throw renderingInterrupted();
  if (Buffer.byteLength(xml) > 5 * 1024 * 1024 || /<!\s*(?:DOCTYPE|ENTITY)\b/i.test(xml)) {
    throw new OperationError('XML_INVALID', 'xml', 'The XML cannot be safely rendered.', 3, 'refused');
  }
  const capability = await browserCapability(options.browserExecutable);
  if (!capability.available)
    throw new OperationError('RUNTIME_MISSING', 'runtime', capability.reason ?? 'A local browser is required.');
  let browser: Browser | undefined;
  let profile: string | undefined;
  const abort = () => {
    void browser?.close().catch(() => {
      browser?.process()?.kill('SIGKILL');
    });
  };
  options.signal?.addEventListener('abort', abort, { once: true });
  try {
    const { BpmnModdle } = await import('bpmn-moddle');
    let parsed: Awaited<ReturnType<InstanceType<typeof BpmnModdle>['fromXML']>>;
    try {
      parsed = await new BpmnModdle().fromXML(xml);
    } catch {
      throw new OperationError('XML_INVALID', 'xml', 'The BPMN XML could not be parsed.', 3, 'refused');
    }
    if (parsed.warnings.length)
      throw renderRefusal('RENDER_UNSUPPORTED', 'The supplied XML contains content the renderer cannot represent.');
    assertDiagramGeometry(parsed.rootElement, parsed.elementsById);
    const diagrams = (parsed.rootElement.diagrams ?? []) as Array<{
      id?: string;
      plane?: { bpmnElement?: { id?: string; name?: string }; planeElement?: Array<{ bpmnElement?: { id?: string } }> };
    }>;
    if (!diagrams.length || !diagrams[0]?.plane?.planeElement?.length || diagrams.some((diagram) => !diagram.id)) {
      throw renderRefusal('DI_MISSING', 'The supplied model has no complete diagram to display.');
    }
    const panels = diagrams.map((diagram) => ({
      id: diagram.id!,
      name: diagram.plane?.bpmnElement?.name ?? diagram.plane?.bpmnElement?.id ?? 'Process',
      visible: (diagram.plane?.planeElement ?? [])
        .map((element) => element.bpmnElement?.id)
        .filter((id): id is string => Boolean(id)),
      labels: Object.fromEntries(
        (diagram.plane?.planeElement ?? []).map((element) => [
          element.bpmnElement?.id,
          displayLabel(element.bpmnElement as ModdleElement),
        ]),
      ),
    }));
    const labelText =
      Object.values(parsed.elementsById)
        .flatMap((element) =>
          [element.name, element.text, element.value].filter((value): value is string => typeof value === 'string'),
        )
        .join('') + panels.map((panel) => panel.name).join('');
    const assets = new URL('../assets/', import.meta.url);
    const manifest: AssetManifest = JSON.parse(await readFile(new URL('runtime/manifest.json', assets), 'utf8'));
    const chars = [...new Set(labelText + 'bpmn.io')].map((char) => char.codePointAt(0)!);
    const availableRanges = manifest.font.faces.flatMap((face) => ranges(face.unicodeRange));
    if (chars.some((char) => !availableRanges.some(([low, high]) => char >= low && char <= high))) {
      throw renderRefusal(
        'RENDER_UNSUPPORTED',
        'The packaged fonts do not cover one or more diagram label characters.',
      );
    }
    const faces = manifest.font.faces.filter((face) =>
      ranges(face.unicodeRange).some(([low, high]) => chars.some((char) => char >= low && char <= high)),
    );
    const dataUrls = await Promise.all(
      faces.map(
        async (face) =>
          'data:font/woff2;base64,' + (await readFile(new URL(`fonts/${face.file}`, assets))).toString('base64'),
      ),
    );
    const fontCss = faces
      .map(
        (face, index) =>
          `@font-face{font-family:WeaveSans;font-style:normal;font-weight:${face.weight};src:url(${dataUrls[index]}) format('woff2');unicode-range:${face.unicodeRange}}`,
      )
      .join('');
    const viewerJs = await readFile(new URL(`runtime/${manifest.viewer.file}`, assets), 'utf8');
    const { default: puppeteer } = await import('puppeteer-core');
    if (options.signal?.aborted) throw renderingInterrupted();
    profile = await mkdtemp(join(tmpdir(), 'bpmn-weave-render-'));
    await chmod(profile, 0o700);
    await mkdir(join(profile, 'Default'), { mode: 0o700 });
    // This disposable profile never browses websites; online safety/preload services
    // would themselves contact remote servers before page interception can exist.
    await writeFile(
      join(profile, 'Default', 'Preferences'),
      JSON.stringify({ safebrowsing: { enabled: false, enhanced: false }, net: { network_prediction_options: 2 } }),
      { mode: 0o600 },
    );
    browser = await puppeteer.launch({
      executablePath: capability.path!,
      userDataDir: profile,
      headless: true,
      pipe: true,
      timeout: 10_000,
      protocolTimeout: 30_000,
      handleSIGINT: false,
      handleSIGTERM: false,
      handleSIGHUP: false,
      ignoreDefaultArgs: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-web-security',
        '--disable-ipc-flooding-protection',
      ],
      args: [
        '--test-type',
        '--disable-background-networking',
        '--disable-component-update',
        '--disable-domain-reliability',
        '--disable-sync',
        '--metrics-recording-only',
        '--no-first-run',
        '--no-default-browser-check',
        '--disable-breakpad',
        '--no-pings',
        '--disable-features=AutofillServerCommunication,CertificateTransparencyComponentUpdater,NetworkTimeServiceQuerying,AimEnabled',
        // Chromium's per-endpoint configuration makes startup account discovery
        // inert. It must not use a remote or loopback HTTP replacement endpoint.
        '--gaia-config-contents=' +
          JSON.stringify({ urls: { list_accounts_url: { url: 'data:application/json,[]' } } }),
        '--no-proxy-server',
        '--host-resolver-rules=MAP * ~NOTFOUND',
      ],
    });
    if (options.signal?.aborted) throw renderingInterrupted();
    // Puppeteer's fresh about:blank page belongs to this invocation alone.
    const page = (await browser.pages())[0];
    if (!page || page.url() !== 'about:blank')
      throw new OperationError(
        'DEPENDENCY_FAILURE',
        'runtime',
        'The isolated browser did not provide its blank rendering page.',
      );
    page.setDefaultTimeout(30_000);
    await page.setRequestInterception(true);
    let unexpectedRequest = false;
    const allowed = new Set(dataUrls);
    page.on('request', (request) => {
      if (allowed.has(request.url())) void request.continue().catch(() => {});
      else {
        unexpectedRequest = true;
        void request.abort().catch(() => {});
      }
    });
    await page.setContent(
      '<!doctype html><html><head></head><body><div id="canvas" style="width:1600px;height:900px"></div></body></html>',
    );
    await page.addStyleTag({ content: fontCss + 'html,body{background:white;color-scheme:light}' });
    await page.addScriptTag({ content: viewerJs });
    const svg = await page.evaluate(
      async ({ xml, panels, fontCss, labelText }) => {
        const ns = 'http://www.w3.org/2000/svg';
        const invalidVisual = (kind: string, ids: string[]) => {
          throw new Error(
            'DI_INVALID|' + JSON.stringify({ kind, ids: ids.filter((id) => /^[A-Za-z_][\w.-]{0,160}$/.test(id)) }),
          );
        };
        const create = (name: string, attrs: Record<string, string> = {}) => {
          const element = document.createElementNS(ns, name);
          for (const [key, value] of Object.entries(attrs)) element.setAttribute(key, value);
          return element;
        };
        await document.fonts.load('12px WeaveSans', labelText);
        await document.fonts.load('bold 12px WeaveSans', labelText);
        await document.fonts.ready;
        const metrics = document.createElement('canvas').getContext('2d')!;
        metrics.font = '700 14px WeaveSans';
        const sheet = create('svg', { xmlns: ns, version: '1.1', role: 'img' });
        const style = create('style');
        style.textContent = fontCss;
        sheet.append(style);
        const background = create('rect', { x: '0', y: '0', fill: 'white' });
        sheet.append(background);
        let width = 0;
        let top = 16;
        type RenderedElement = {
          id: string;
          businessObject: ModdleElement;
          di: ModdleElement;
          x: number;
          y: number;
          width: number;
          height: number;
          hidden?: boolean;
          parent?: RenderedElement;
        };
        type Viewer = {
          importXML(xml: string, diagramId: string): Promise<{ warnings: unknown[] }>;
          saveSVG(): Promise<{ svg: string }>;
          destroy(): void;
          get<T>(name: string): T;
          getDefinitions(): ModdleElement;
        };
        const ViewerClass = (window as unknown as { BpmnJS: new (config: unknown) => Viewer }).BpmnJS;
        for (const [panelIndex, panel] of panels.entries()) {
          const title = create('text', {
            x: '16',
            y: String(top + 14),
            'font-family': 'WeaveSans',
            'font-size': '14',
            'font-weight': '700',
            fill: '#22242a',
          });
          title.textContent = panel.name;
          sheet.append(title);
          width = Math.max(width, Math.ceil(metrics.measureText(panel.name).width));
          top += 28;
          if (panel.visible.length === 0) {
            const empty = create('text', {
              x: '16',
              y: String(top + 12),
              'data-diagram-id': panel.id,
              'font-family': 'WeaveSans',
              'font-size': '12',
              fill: '#56616b',
            });
            empty.textContent = 'No modeled elements';
            sheet.append(empty);
            top += 48;
            continue;
          }
          const viewer = new ViewerClass({
            container: '#canvas',
            textRenderer: {
              defaultStyle: { fontFamily: 'WeaveSans', fontSize: 12 },
              externalStyle: { fontFamily: 'WeaveSans', fontSize: 12 },
            },
          });
          try {
            // Render one legal DI view at a time. The upstream navigation importer
            // otherwise merges sibling planes into one ID registry, which cannot
            // represent a Group legally repeated across different diagrams.
            viewer
              .get<{
                on(name: string, priority: number, callback: (event: { definitions: ModdleElement }) => void): void;
              }>('eventBus')
              .on('import.render.start', 1500, ({ definitions }) => {
                definitions.diagrams = definitions.diagrams.filter((diagram: ModdleElement) => diagram.id === panel.id);
              });
            const result = await viewer.importXML(xml, panel.id);
            if (result.warnings.length) throw new Error('RENDER_UNSUPPORTED');
            const registry = viewer.get<{
              get(id: string): RenderedElement | undefined;
              getGraphics(element: RenderedElement): SVGElement;
            }>('elementRegistry');
            const importer = viewer.get<{
              add(semantic: ModdleElement, di: ModdleElement, parent: RenderedElement): RenderedElement;
              addLabel(semantic: ModdleElement, di: ModdleElement, element: RenderedElement): RenderedElement;
            }>('bpmnImporter');
            const canvas = viewer.get<{ getRootElement(): RenderedElement }>('canvas');
            const graphics = viewer.get<{ update(type: string, element: RenderedElement, gfx: SVGElement): void }>(
              'graphicsFactory',
            );
            const textRenderer = viewer.get<{ createText(text: string, options: unknown): SVGElement }>('textRenderer');
            const plane = viewer.getDefinitions().diagrams.find((diagram: ModdleElement) => diagram.id === panel.id)
              .plane as ModdleElement;
            for (const di of plane.planeElement as ModdleElement[]) {
              const semantic = di.bpmnElement as ModdleElement;
              let element = registry.get(semantic.id!);
              // The Viewer traverses semantic containment, whereas a legal partial
              // DI view may contain an ancestor-owned Group or explicit Event IO.
              if (!element && ['bpmn:Group', 'bpmn:DataInput', 'bpmn:DataOutput'].includes(semantic.$type))
                element = importer.add(semantic, di, canvas.getRootElement());
              if (!element) continue;
              if (
                semantic.$type === 'bpmn:MessageFlow' &&
                semantic.messageRef &&
                !Object.hasOwn(di, 'messageVisibleKind')
              ) {
                // A Message reference is not an instruction to show an envelope.
                // Keep the actual flow path/markers; names are in its DI label.
                const visual = registry.getGraphics(element).querySelector('.djs-visual');
                for (const child of [...(visual?.children ?? [])].slice(1)) child.remove();
              }
              const caption = panel.labels[semantic.id!];
              if (!caption || !di.label?.bounds) continue;
              const label = registry.get(semantic.id + '_label') ?? importer.addLabel(semantic, di, element);
              Object.assign(label, di.label.bounds, { hidden: false });
              const gfx = registry.getGraphics(label);
              graphics.update('shape', label, gfx);
              const visual = gfx.querySelector('.djs-visual');
              if (!visual) throw new Error('RENDER_UNSUPPORTED');
              const text = textRenderer.createText(caption, {
                box: { width: label.width, height: label.height },
                align: 'center-top',
                padding: 4,
                style: { fontFamily: 'WeaveSans', fontSize: 12, lineHeight: 1.2, fill: '#22242a' },
              });
              visual.replaceChildren(text);
              const bounds = (text as SVGGraphicsElement).getBBox();
              if (
                bounds.x < -1 ||
                bounds.y < -1 ||
                bounds.x + bounds.width > label.width + 1 ||
                bounds.y + bounds.height > label.height + 1
              )
                invalidVisual('label-overflow', [semantic.id!]);
            }
            // Advance metrics reserve space; actual browser shaping is the final
            // authority, including native internal and optional decorator labels.
            type Box = { x: number; y: number; width: number; height: number };
            const rootMatrix = (registry.getGraphics(canvas.getRootElement()) as SVGGraphicsElement)
              .getCTM()!
              .inverse();
            const textBoxes: Array<{ id: string; box: Box }> = [];
            const intersects = (a: Box, b: Box, tolerance = 1) =>
              a.x < b.x + b.width - tolerance &&
              a.x + a.width > b.x + tolerance &&
              a.y < b.y + b.height - tolerance &&
              a.y + a.height > b.y + tolerance;
            const contains = (outer: Box, inner: Box) =>
              inner.x >= outer.x - 2 &&
              inner.y >= outer.y - 2 &&
              inner.x + inner.width <= outer.x + outer.width + 2 &&
              inner.y + inner.height <= outer.y + outer.height + 2;
            const lineHits = (a: { x: number; y: number }, b: { x: number; y: number }, box: Box) => {
              let low = 0;
              let high = 1;
              for (const axis of ['x', 'y'] as const) {
                const delta = b[axis] - a[axis];
                const min = box[axis] + 1;
                const max = box[axis] + (axis === 'x' ? box.width : box.height) - 1;
                if (delta === 0) {
                  if (a[axis] <= min || a[axis] >= max) return false;
                } else {
                  const first = (min - a[axis]) / delta;
                  const last = (max - a[axis]) / delta;
                  low = Math.max(low, Math.min(first, last));
                  high = Math.min(high, Math.max(first, last));
                  if (low >= high) return false;
                }
              }
              return low < high;
            };
            for (const di of plane.planeElement as ModdleElement[]) {
              for (const id of [di.bpmnElement.id, di.bpmnElement.id + '_label']) {
                const element = registry.get(id);
                if (!element || element.hidden) continue;
                const visual = registry.getGraphics(element).querySelector('.djs-visual');
                for (const text of visual?.querySelectorAll('text') ?? []) {
                  const bounds = text.getBBox();
                  const matrix = rootMatrix.multiply(text.getCTM()!);
                  const corners = [
                    [bounds.x, bounds.y],
                    [bounds.x + bounds.width, bounds.y],
                    [bounds.x, bounds.y + bounds.height],
                    [bounds.x + bounds.width, bounds.y + bounds.height],
                  ].map(([x, y]) => new DOMPoint(x, y).matrixTransform(matrix));
                  const box = {
                    x: Math.min(...corners.map((point) => point.x)),
                    y: Math.min(...corners.map((point) => point.y)),
                    width: Math.max(...corners.map((point) => point.x)) - Math.min(...corners.map((point) => point.x)),
                    height: Math.max(...corners.map((point) => point.y)) - Math.min(...corners.map((point) => point.y)),
                  };
                  if (id.endsWith('_label') && di.label?.bounds && !contains(di.label.bounds, box))
                    invalidVisual('label-bounds', [di.bpmnElement.id]);
                  if (!id.endsWith('_label') && di.bounds && !contains(di.bounds, box))
                    invalidVisual('internal-label-overflow', [di.bpmnElement.id]);
                  textBoxes.push({ id: di.bpmnElement.id, box });
                }
              }
            }
            const ordinaryShapes = (plane.planeElement as ModdleElement[]).filter(
              (di) =>
                di.bounds &&
                !['bpmn:Participant', 'bpmn:Lane', 'bpmn:Group'].includes(di.bpmnElement.$type) &&
                !(di.bpmnElement.$type === 'bpmn:SubProcess' && di.isExpanded),
            );
            const edges = (plane.planeElement as ModdleElement[]).filter((di) => di.waypoint);
            for (const [index, text] of textBoxes.entries()) {
              const otherText = textBoxes.slice(index + 1).find((other) => intersects(text.box, other.box));
              if (otherText) invalidVisual('text-overlap', [text.id, otherText.id]);
              const shape = ordinaryShapes.find(
                (shape) => shape.bpmnElement.id !== text.id && intersects(text.box, shape.bounds),
              );
              if (shape) invalidVisual('text-shape-overlap', [text.id, shape.bpmnElement.id]);
              const edge = edges.find((edge) =>
                edge.waypoint
                  .slice(1)
                  .some((point: { x: number; y: number }, index: number) =>
                    lineHits(edge.waypoint[index], point, text.box),
                  ),
              );
              if (edge) invalidVisual('text-connector-overlap', [text.id, edge.bpmnElement.id]);
            }
            const exported = await viewer.saveSVG();
            const doc = new DOMParser().parseFromString(exported.svg, 'image/svg+xml');
            if (doc.querySelector('parsererror')) throw new Error('RENDER_UNSUPPORTED');
            const root = doc.documentElement;
            const panelWidth = Number(root.getAttribute('width'));
            const panelHeight = Number(root.getAttribute('height'));
            if (![panelWidth, panelHeight].every((value) => Number.isFinite(value) && value > 0))
              throw new Error('DI_INVALID');
            const actual = new Set(
              [...root.querySelectorAll('[data-element-id]')].map((element) => element.getAttribute('data-element-id')),
            );
            if (panel.visible.some((id) => !actual.has(id))) throw new Error('DI_MISSING');
            const allowedTags = new Set([
              'svg',
              'g',
              'defs',
              'marker',
              'rect',
              'circle',
              'ellipse',
              'path',
              'polyline',
              'polygon',
              'line',
              'text',
              'tspan',
              'clipPath',
              'title',
              'desc',
            ]);
            const idMap = new Map(
              [...root.querySelectorAll('[id]')].map((element, index) => [element.id, `svg_${panelIndex}_${index}`]),
            );
            for (const element of [root, ...root.querySelectorAll('*')]) {
              if (!allowedTags.has(element.localName)) throw new Error('RENDER_UNSUPPORTED');
              if (idMap.has(element.id)) element.id = idMap.get(element.id)!;
              for (const attr of [...element.attributes]) {
                if (/^on/i.test(attr.localName)) throw new Error('RENDER_UNSUPPORTED');
                let value = attr.value.replace(/url\((['"]?)#([^'")]+)\1\)/g, (_match, _quote: string, id: string) => {
                  const replacement = idMap.get(id);
                  if (!replacement) throw new Error('RENDER_UNSUPPORTED');
                  return `url(#${replacement})`;
                });
                for (const reference of value.matchAll(/url\(([^)]*)\)/gi)) {
                  if (!/^#[A-Za-z0-9_]+$/.test(reference[1]!)) throw new Error('RENDER_UNSUPPORTED');
                }
                if (attr.localName === 'href') {
                  if (!value.startsWith('#') || !idMap.has(value.slice(1))) throw new Error('RENDER_UNSUPPORTED');
                  value = '#' + idMap.get(value.slice(1));
                }
                attr.value = value;
              }
            }
            root.setAttribute('x', '16');
            root.setAttribute('y', String(top));
            root.setAttribute('data-diagram-id', panel.id);
            sheet.append(document.importNode(root, true));
            width = Math.max(width, panelWidth);
            top += panelHeight + 24;
          } finally {
            viewer.destroy();
          }
        }
        width = Math.max(width + 32, 260);
        const footer = create('a', { href: 'https://bpmn.io', target: '_blank', rel: 'noopener noreferrer' });
        const text = create('text', {
          x: '16',
          y: String(top + 12),
          'font-family': 'WeaveSans',
          'font-size': '12',
          fill: '#56616b',
        });
        text.textContent = 'Rendered with bpmn.io';
        footer.append(text);
        sheet.append(footer);
        top += 28;
        background.setAttribute('width', String(width));
        background.setAttribute('height', String(top));
        sheet.setAttribute('width', String(width));
        sheet.setAttribute('height', String(top));
        sheet.setAttribute('viewBox', `0 0 ${width} ${top}`);
        return '<!-- created with bpmn-js / http://bpmn.io -->\n' + new XMLSerializer().serializeToString(sheet) + '\n';
      },
      { xml, panels, fontCss, labelText },
    );
    if (unexpectedRequest)
      throw renderRefusal('RENDER_UNSUPPORTED', 'Rendering attempted to load an unapproved external resource.');
    return svg;
  } catch (error) {
    if (options.signal?.aborted) throw renderingInterrupted();
    if (error instanceof OperationError) throw error;
    const marker = error instanceof Error ? error.message : '';
    const visualMatch = marker.match(/DI_INVALID\|(\{[^\n]+\})/);
    if (visualMatch) {
      const detail = JSON.parse(visualMatch[1]!) as { kind: string; ids: string[] };
      const message = 'The rendered diagram contains a cropped or overlapping label.';
      throw new OperationError('DI_INVALID', 'diagram', message, 2, 'refused', [
        {
          code: 'DI_INVALID',
          category: 'diagram',
          message,
          elementRefs: detail.ids.map((id) => id.replace(/^M_/, '')),
          remediation: `Adjust diagram spacing or label bounds (${detail.kind}); retain the full process meaning.`,
        },
      ]);
    }
    if (/DI_MISSING|no diagram to display/.test(marker))
      throw renderRefusal('DI_MISSING', 'The supplied diagram is missing visible elements.');
    if (/DI_INVALID|RENDER_UNSUPPORTED/.test(marker))
      throw renderRefusal('RENDER_UNSUPPORTED', 'The supplied diagram could not be rendered completely.');
    throw new OperationError(
      'DEPENDENCY_FAILURE',
      'runtime',
      'The local renderer could not produce the preview. Verify the installed browser and packaged assets.',
    );
  } finally {
    options.signal?.removeEventListener('abort', abort);
    if (browser)
      await browser.close().catch(() => {
        browser?.process()?.kill('SIGKILL');
      });
    if (profile)
      await rm(profile, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 }).catch(() => {
        throw new OperationError('CLEANUP_FAILED', 'filesystem', 'Temporary renderer files could not be removed.');
      });
  }
}

function renderingInterrupted(): OperationError {
  return new OperationError('DEPENDENCY_FAILURE', 'runtime', 'Diagram rendering was interrupted.');
}

function ranges(unicode: string): Array<[number, number]> {
  return unicode.split(',').map((range) => {
    const [start, end] = range.trim().slice(2).split('-');
    return [Number.parseInt(start!, 16), Number.parseInt(end ?? start!, 16)];
  });
}

function assertDiagramGeometry(root: ModdleElement, elements: Record<string, ModdleElement>): void {
  const finding = assessSuppliedDi(root, elements)[0];
  if (finding) throw renderRefusal(finding.code, finding.message);
}

/** Read-only geometry authority shared by validation and browser rendering. */
export function assessSuppliedDi(root: ModdleElement, elements: Record<string, ModdleElement>): FindingInput[] {
  const findings: FindingInput[] = [];
  const add = (code: string, message: string, id?: string) =>
    findings.push({ code, category: 'diagram', message, ...(id ? { elementRefs: [id] } : {}) });
  const connectors = new Set([
    'bpmn:SequenceFlow',
    'bpmn:MessageFlow',
    'bpmn:Association',
    'bpmn:DataInputAssociation',
    'bpmn:DataOutputAssociation',
  ]);
  const shapes = new Set([
    'bpmn:Lane',
    'bpmn:Participant',
    'bpmn:DataObjectReference',
    'bpmn:DataStoreReference',
    'bpmn:TextAnnotation',
    'bpmn:Group',
  ]);
  const visible = new Set<string>();
  const boundsValid = (bounds: ModdleElement | undefined) =>
    bounds &&
    [bounds.x, bounds.y, bounds.width, bounds.height].every(Number.isFinite) &&
    bounds.x >= 0 &&
    bounds.y >= 0 &&
    bounds.width > 0 &&
    bounds.height > 0;
  const diagrams = (root.diagrams ?? []) as ModdleElement[];
  if (!diagrams.length || !(diagrams[0]?.plane?.planeElement ?? []).length)
    add('DI_MISSING', 'The primary process has no modeled diagram content.');
  for (const diagram of diagrams) {
    if (
      !diagram.plane?.bpmnElement ||
      !['bpmn:Process', 'bpmn:Collaboration', 'bpmn:SubProcess'].includes(diagram.plane.bpmnElement.$type)
    ) {
      add('DI_INVALID', 'A diagram plane has no resolved process or collaboration.');
      continue;
    }
    const planeVisible = new Set<string>();
    for (const element of (diagram.plane.planeElement ?? []) as ModdleElement[]) {
      const semantic = element.bpmnElement as ModdleElement | undefined;
      if (!semantic?.id) {
        add('DI_INVALID', 'Diagram geometry has an unresolved process element.');
        continue;
      }
      if (planeVisible.has(semantic.id))
        add('DI_INVALID', 'A diagram plane repeats geometry for the same semantic element.', semantic.id);
      planeVisible.add(semantic.id);
      visible.add(semantic.id);
      if (element.$type === 'bpmndi:BPMNShape') {
        if (connectors.has(semantic.$type) || !boundsValid(element.bounds))
          add('DI_INVALID', 'A diagram shape has invalid bounds or element type.', semantic.id);
      } else if (element.$type === 'bpmndi:BPMNEdge') {
        const points = (element.waypoint ?? []) as ModdleElement[];
        if (
          !connectors.has(semantic.$type) ||
          points.length < 2 ||
          points.some(
            (point) => !Number.isFinite(point.x) || !Number.isFinite(point.y) || point.x < 0 || point.y < 0,
          ) ||
          points.every((point) => point.x === points[0]?.x && point.y === points[0]?.y)
        ) {
          add('DI_INVALID', 'A diagram connection has invalid geometry or element type.', semantic.id);
        }
      } else add('DI_INVALID', 'A diagram contains an unsupported DI element.', semantic.id);
      if (element.label?.bounds && !boundsValid(element.label.bounds))
        add('DI_INVALID', 'A diagram label has invalid bounds.', semantic.id);
    }
  }
  for (const element of Object.values(elements)) {
    const processIo =
      ['bpmn:DataInput', 'bpmn:DataOutput'].includes(element.$type) &&
      element.$parent?.$type === 'bpmn:InputOutputSpecification' &&
      element.$parent?.$parent?.$type === 'bpmn:Process';
    if (
      element.id &&
      (element.$instanceOf?.('bpmn:FlowNode') ||
        shapes.has(element.$type) ||
        connectors.has(element.$type) ||
        processIo) &&
      !visible.has(element.id)
    ) {
      add('DI_MISSING', 'A visible process element has no supplied diagram geometry.', element.id);
    }
  }
  return findings;
}

function renderRefusal(code: string, message: string): OperationError {
  return new OperationError(code, 'diagram', message, 2, 'refused');
}

export async function browserCapability(
  explicit?: string,
): Promise<{ available: boolean; path?: string; reason?: string }> {
  if (explicit !== undefined) {
    if (!isAbsolute(explicit))
      return { available: false, reason: 'The browser executable override must be an absolute path.' };
    return (await executable(explicit))
      ? { available: true, path: explicit }
      : { available: false, reason: 'The selected browser executable is unavailable or not executable.' };
  }
  const candidates: string[] = [];
  if (process.platform === 'darwin') {
    for (const directory of ['/Applications', join(homedir(), 'Applications')]) {
      for (const name of ['Google Chrome', 'Microsoft Edge'])
        candidates.push(join(directory, `${name}.app`, 'Contents', 'MacOS', name));
    }
  } else if (process.platform === 'win32') {
    for (const directory of [
      process.env['PROGRAMFILES(X86)'],
      process.env.PROGRAMFILES,
      process.env.LOCALAPPDATA,
    ].filter((value): value is string => Boolean(value))) {
      candidates.push(
        join(directory, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
        join(directory, 'Google', 'Chrome', 'Application', 'chrome.exe'),
      );
    }
  }
  const names =
    process.platform === 'win32'
      ? ['msedge.exe', 'chrome.exe']
      : [
          'google-chrome',
          'google-chrome-stable',
          'microsoft-edge',
          'microsoft-edge-stable',
          'chromium',
          'chromium-browser',
        ];
  for (const directory of (process.env.PATH ?? '').split(delimiter).filter(isAbsolute)) {
    for (const name of names) candidates.push(join(directory, name));
  }
  for (const candidate of new Set(candidates))
    if (await executable(candidate)) return { available: true, path: candidate };
  return {
    available: false,
    reason: 'Install Chrome or Edge, or select an installed browser with --browser-executable.',
  };
}

async function executable(path: string): Promise<boolean> {
  try {
    if (!(await stat(path)).isFile()) return false;
    await access(path, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}
