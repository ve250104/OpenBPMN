import { BpmnModdle } from 'bpmn-moddle';
import { createRequire } from 'node:module';

interface XmlElement {
  name: string;
  attrs: Record<string, string>;
}
interface XmlContext {
  data: string;
  line: number;
  column: number;
}
interface XmlParser {
  ns(namespaces: Record<string, string>): void;
  on(event: string, callback: (...args: any[]) => void): void;
  parse(xml: string): unknown;
}
const { Parser } = createRequire(import.meta.url)('saxen') as {
  Parser: new (options: { proxy: boolean }) => XmlParser;
};

/**
 * Moddle accepts only literal `true`, whereas XML Schema booleans also allow
 * 1/0, character references and surrounding XML whitespace. Give its readers
 * an equivalent private lexical view; never serialize a replacement document.
 * Namespace-aware tag events keep comments, CDATA, text and extensions intact.
 * XML integrity/XSD validation must continue to assess the original bytes.
 */
export function xmlForBpmnConsumer(xml: string): string {
  const parser = new Parser({ proxy: true });
  parser.ns({
    'http://www.omg.org/spec/BPMN/20100524/MODEL': 'bpmn',
    'http://www.omg.org/spec/BPMN/20100524/DI': 'bpmndi',
    'http://www.omg.org/spec/DD/20100524/DC': 'dc',
    'http://www.omg.org/spec/DD/20100524/DI': 'di',
  });
  const moddle = new BpmnModdle();
  const attributesByType = new Map<string, Set<string>>();
  let lineOffsets: number[] | undefined;
  const replacements: Array<{ start: number; end: number; value: string }> = [];
  parser.on(
    'openTag',
    (element: XmlElement, decode: (value: string) => string, _closed: boolean, context: () => XmlContext) => {
      const [prefix, local = ''] = element.name.split(':');
      if (!['bpmn', 'bpmndi', 'dc', 'di'].includes(prefix ?? '')) return;
      const type = `${prefix}:${local.slice(0, 1).toUpperCase()}${local.slice(1)}`;
      let booleans = attributesByType.get(type);
      if (!booleans) {
        try {
          booleans = new Set(
            moddle
              .create(type)
              .$descriptor.properties.filter((property) => property.type === 'Boolean')
              .map((property) => property.name),
          );
        } catch {
          booleans = new Set();
        }
        attributesByType.set(type, booleans);
      }
      const canonical = new Map<string, string>();
      for (const [name, raw] of Object.entries(element.attrs)) {
        if (!booleans.has(name)) continue;
        const value = decode(raw).replace(/^[\t\n\r ]+|[\t\n\r ]+$/g, '');
        const normalized = /^(?:true|1)$/.test(value) ? 'true' : /^(?:false|0)$/.test(value) ? 'false' : undefined;
        if (normalized !== undefined && raw !== normalized) canonical.set(name, normalized);
      }
      if (!canonical.size) return;
      const tag = context();
      if (!lineOffsets) {
        lineOffsets = [0];
        for (const match of xml.matchAll(/\r\n|\r|\n/g)) lineOffsets.push(match.index + match[0].length);
      }
      const start = lineOffsets[tag.line]! + tag.column;
      const value = tag.data.replace(/(\s+)([^\s=]+)(\s*=\s*)(["'])(.*?)\4/gs, (whole, space, name, equals, quote) =>
        canonical.has(name) ? `${space}${name}${equals}${quote}${canonical.get(name)}${quote}` : whole,
      );
      replacements.push({ start, end: start + tag.data.length, value });
    },
  );
  parser.on('error', () => {
    throw new Error('Cannot adapt malformed XML.');
  });
  parser.parse(xml);
  let cursor = 0;
  const result: string[] = [];
  for (const replacement of replacements) {
    result.push(xml.slice(cursor, replacement.start), replacement.value);
    cursor = replacement.end;
  }
  result.push(xml.slice(cursor));
  return result.join('');
}
