import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { parseArgs } from 'node:util';
import { BpmnModdle } from 'bpmn-moddle';
import { layoutProcess } from 'bpmn-auto-layout';
import puppeteer from 'puppeteer-core';
import { XmlDocument, XsdValidator, XmlBufferInputProvider, xmlRegisterInputProvider, xmlCleanupInputProvider, ParseOption } from 'libxml2-wasm';

const hash = s => createHash('sha256').update(s).digest('hex');
const { values } = parseArgs({ options: { 'browser-executable': { type: 'string' } } });
assert.ok(values['browser-executable'], 'Pass --browser-executable with the absolute path to an already-installed Chrome or Edge executable.');
const provenance = JSON.parse(await fs.readFile('schema-provenance.json', 'utf8'));
const base = provenance.baseUrl;
const schemaNames = Object.keys(provenance.sha256);
await fs.mkdir('artifacts', { recursive: true });
const schemas = {};
for (const name of schemaNames) {
  const response = await fetch(base + name);
  assert(response.ok);
  schemas[base + name] = Buffer.from(await response.arrayBuffer());
  assert.equal(hash(schemas[base + name]), provenance.sha256[name], 'Official schema bytes changed: ' + name);
}
// Only these five in-memory official schemas can resolve; never register filesystem I/O.
xmlCleanupInputProvider();
xmlRegisterInputProvider(new XmlBufferInputProvider(schemas));
const options = { option: ParseOption.XML_PARSE_NONET | ParseOption.XML_PARSE_NO_XXE | ParseOption.XML_PARSE_NO_SYS_CATALOG };
const schema = XmlDocument.fromBuffer(schemas[base + 'BPMN20.xsd'], { ...options, url: base + 'BPMN20.xsd' });
const validator = XsdValidator.fromDoc(schema);
function validate(xml) { const doc = XmlDocument.fromString(xml, options); try { validator.validate(doc); } finally { doc.dispose(); } }

const model = new BpmnModdle();
const start = model.create('bpmn:StartEvent', { id: 'Start', name: 'Invoice received' });
const task = model.create('bpmn:UserTask', { id: 'Review', name: 'Review invoice' });
const end = model.create('bpmn:EndEvent', { id: 'End', name: 'Invoice accepted' });
const f1 = model.create('bpmn:SequenceFlow', { id: 'Flow1', sourceRef: start, targetRef: task });
const f2 = model.create('bpmn:SequenceFlow', { id: 'Flow2', sourceRef: task, targetRef: end });
start.outgoing = [f1]; task.incoming = [f1]; task.outgoing = [f2]; end.incoming = [f2];
const businessProcess = model.create('bpmn:Process', { id: 'Process', isExecutable: false, flowElements: [start, task, end, f1, f2] });
const definitions = model.create('bpmn:Definitions', { id: 'Definitions', targetNamespace: 'https://example.invalid/openbpmn-smoke', rootElements: [businessProcess] });
const { xml: compiled } = await model.toXML(definitions, { format: true });
validate(compiled);
const dataInput = model.create('bpmn:DataInput', {id:'InvoiceInput', name:'Invoice data'});
const dataOutput = model.create('bpmn:DataOutput', {id:'ReviewOutput', name:'Review result'});
businessProcess.ioSpecification = model.create('bpmn:InputOutputSpecification', {id:'ProcessIO', dataInputs:[dataInput], dataOutputs:[dataOutput],inputSets:[model.create('bpmn:InputSet',{id:'Inputs',dataInputRefs:[dataInput]})],outputSets:[model.create('bpmn:OutputSet',{id:'Outputs',dataOutputRefs:[dataOutput]})]});
const {xml:ioXml} = await model.toXML(definitions, {format:true});
validate(ioXml);
delete businessProcess.ioSpecification;
const ioLayout = await layoutProcess(ioXml);
const ioParsed = await model.fromXML(ioLayout.xml);
const ioPlane = ioParsed.rootElement.diagrams[0].plane;
const missingIoBefore = ['InvoiceInput','ReviewOutput'].filter(id=>!ioPlane.planeElement.some(e=>e.bpmnElement.id===id));
assert.equal(missingIoBefore.length,2);
for (const [index,id] of missingIoBefore.entries()) {
  ioPlane.planeElement.push(model.create('bpmndi:BPMNShape',{id:id+'_di',bpmnElement:ioParsed.elementsById[id],bounds:model.create('dc:Bounds',{x:210+index*100,y:230,width:36,height:50}),label:model.create('bpmndi:BPMNLabel',{bounds:model.create('dc:Bounds',{x:190+index*100,y:285,width:80,height:30})})}));
}
const {xml:completedIoXml} = await model.toXML(ioParsed.rootElement,{format:true});
validate(completedIoXml);
const t0 = performance.now();
const layout = await layoutProcess(compiled);
const layoutMs = performance.now() - t0;
assert.equal(layout.warnings.length, 0);
assert.equal(layout.xml, (await layoutProcess(compiled)).xml);
assert.equal(layout.xml, await fs.readFile('fixtures/simple.bpmn', 'utf8'));
validate(layout.xml);
const parsed = await model.fromXML(layout.xml);
assert.equal(parsed.warnings.length, 0);
assert.equal(parsed.rootElement.diagrams[0].plane.planeElement.length, 5);
const semantic = root => root.rootElements[0].flowElements.map(e => [e.id,e.$type,e.name??null,e.sourceRef?.id??null,e.targetRef?.id??null]);
assert.deepEqual(semantic(parsed.rootElement), semantic(definitions));
assert.throws(() => validate(layout.xml.replace(/ targetNamespace="[^"]*"/, '')));
assert.throws(() => validate(layout.xml.replace('targetRef="Review"', '')));
await assert.rejects(() => layoutProcess('<broken'));

const viewerJs = await fs.readFile('node_modules/bpmn-js/dist/bpmn-viewer.production.min.js', 'utf8');
const regularFont = await fs.readFile('node_modules/@fontsource/noto-sans/files/noto-sans-latin-400-normal.woff2');
const boldFont = await fs.readFile('node_modules/@fontsource/noto-sans/files/noto-sans-latin-700-normal.woff2');
const fontCss = `@font-face{font-family:OpenBPMNSans;src:url(data:font/woff2;base64,${regularFont.toString('base64')});font-weight:400}@font-face{font-family:OpenBPMNSans;src:url(data:font/woff2;base64,${boldFont.toString('base64')});font-weight:700}`;
const browserStart = performance.now();
const browser = await puppeteer.launch({ executablePath: values['browser-executable'], headless: true, pipe: true, args: ['--disable-background-networking', '--disable-component-update', '--no-first-run'] });
let render;
try {
  const page = await browser.newPage();
  const blockedRequests = [];
  await page.setRequestInterception(true);
  page.on('request', request => { if (request.url().startsWith('data:')) request.continue(); else { blockedRequests.push(request.url()); request.abort(); } });
  await page.setContent('<!doctype html><html><head></head><body><div id="canvas" style="width:1600px;height:900px"></div></body></html>');
  await page.addStyleTag({ content: fontCss });
  await page.addScriptTag({ content: viewerJs });
  await page.evaluate(async () => { await document.fonts.load('12px OpenBPMNSans'); await document.fonts.load('bold 12px OpenBPMNSans'); await document.fonts.ready; });
  render = await page.evaluate(async (xml, noDi, ioXml) => {
    async function render(xml) {
      const viewer = new BpmnJS({ container: '#canvas', textRenderer: { defaultStyle: { fontFamily: 'OpenBPMNSans', fontSize: 12 }, externalStyle: { fontFamily: 'OpenBPMNSans', fontSize: 12 } } });
      try {
        const { warnings } = await viewer.importXML(xml); const { svg } = await viewer.saveSVG();
        const doc = new DOMParser().parseFromString(svg, 'image/svg+xml');
        // Stable SVG IDs are presentation details, independent of BPMN identities.
        const ids = new Map([...doc.querySelectorAll('[id]')].map((el,index)=>[el.id, 'svg-def-' + index]));
        for (const el of doc.querySelectorAll('*')) {
          if (ids.has(el.id)) el.id = ids.get(el.id);
          for (const attr of [...el.attributes]) {
            let value = attr.value;
            for (const [oldId,newId] of ids) {
              value = value.replaceAll(`url('#${oldId}')`, `url('#${newId}')`).replaceAll(`url(#${oldId})`, `url(#${newId})`).replaceAll(`url("#${oldId}")`, `url("#${newId}")`);
              if ((attr.localName === 'href') && value === '#' + oldId) value = '#' + newId;
            }
            attr.value = value;
          }
        }
        return {svg, normalized:new XMLSerializer().serializeToString(doc),warnings:warnings.map(w=>w.message)};
      }
      finally { viewer.destroy(); }
    }
    const first = await render(xml);
    const second = await render(xml);
    const io = await render(ioXml);
    let noDiFailure = null;
    try { await render(noDi); } catch (error) { noDiFailure = error.message; }
    return { first, second, io, noDiFailure };
  }, layout.xml, compiled, completedIoXml);
  assert.equal(render.first.warnings.length, 0);
  assert.match(render.first.svg, /Review invoice/);
  assert.match(render.first.svg, /<svg /);
  assert.ok(render.noDiFailure);
  assert.equal(render.first.normalized,render.second.normalized);
  assert.equal(render.io.warnings.length,0);
  assert.match(render.io.svg,/data-element-id="InvoiceInput"/);
  assert.match(render.io.svg,/data-element-id="ReviewOutput"/);
  console.log(JSON.stringify({supplementalIoShapes:{upstreamMissing:missingIoBefore,warnings:ioLayout.warnings.map(w=>({code:w.code,message:w.message})),completedXsdValid:true,completedViewerWarnings:render.io.warnings,shapesRendered:true},normalizedSvgDeterministic:true}));
  const svg = render.first.svg.replace(/(<svg[^>]*>)/, '$1<style>' + fontCss + '</style>');
  await fs.writeFile('artifacts/smoke.bpmn', layout.xml);
  await fs.writeFile('artifacts/smoke.svg', svg);
  await page.setContent('<style>html,body{background:#fff;color-scheme:light}</style>' + svg);
  await page.screenshot({path:'artifacts/smoke.png'});
  console.log(JSON.stringify({ node: process.version, browser: await browser.version(), schemaHashes: Object.fromEntries(Object.entries(schemas).map(([url,bytes])=>[url,hash(bytes)])), checks: { compileXsd: true, layoutXsd: true, layoutDeterministic: true, semanticsUnchanged: true, completeFiveElementDi:true, schemaMissingTargetNamespaceRejected: true, schemaMissingFlowTargetRejected: true, malformedLayoutRejected: true, viewerImport: true, svgContainsLabel: true, missingDiRejected:render.noDiFailure, rawSvgDeterministic:render.first.svg===render.second.svg }, layoutMs:Math.round(layoutMs), browserAndRenderingMs:Math.round(performance.now()-browserStart), blockedRequests, sizes:{xmlBytes:Buffer.byteLength(layout.xml),svgWithEmbeddedLatinFontsBytes:Buffer.byteLength(svg),regularFontBytes:regularFont.length,boldFontBytes:boldFont.length}, rawSvgHashes:[hash(render.first.svg),hash(render.second.svg)] },null,2));
  if (render.first.svg!==render.second.svg) { await fs.writeFile('artifacts/first.svg',render.first.svg); await fs.writeFile('artifacts/second.svg',render.second.svg); }
} finally { await browser.close(); validator.dispose(); schema.dispose(); xmlCleanupInputProvider(); }
