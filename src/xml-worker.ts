import { parentPort, workerData } from 'node:worker_threads';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import {
  XmlDocument,
  XsdValidator,
  XmlBufferInputProvider,
  xmlRegisterInputProvider,
  xmlCleanupInputProvider,
  ParseOption,
  XmlParseError,
  XmlValidateError,
} from 'libxml2-wasm';
import type { XmlAssessment } from './xml.js';

async function assess(): Promise<XmlAssessment> {
  const base = new URL('../assets/xsd/', import.meta.url);
  const provenance = JSON.parse(await readFile(new URL('provenance.json', base), 'utf8')) as {
    source: string;
    sha256: Record<string, string>;
  };
  const buffers: Record<string, Buffer> = {};
  for (const [name, expected] of Object.entries(provenance.sha256)) {
    const bytes = await readFile(new URL(name, base));
    if (createHash('sha256').update(bytes).digest('hex') !== expected)
      throw new Error('Schema integrity check failed.');
    buffers[provenance.source + name] = bytes;
  }
  xmlCleanupInputProvider();
  xmlRegisterInputProvider(new XmlBufferInputProvider(buffers));
  const parseOptions = {
    option: ParseOption.XML_PARSE_NONET | ParseOption.XML_PARSE_NO_XXE | ParseOption.XML_PARSE_NO_SYS_CATALOG,
  };
  let schema: XmlDocument | undefined;
  let validator: XsdValidator | undefined;
  let document: XmlDocument | undefined;
  try {
    schema = XmlDocument.fromBuffer(buffers[provenance.source + 'BPMN20.xsd']!, {
      ...parseOptions,
      url: provenance.source + 'BPMN20.xsd',
    });
    validator = XsdValidator.fromDoc(schema);
    try {
      document = XmlDocument.fromString(workerData.xml, parseOptions);
    } catch (error) {
      if (!(error instanceof XmlParseError)) throw error;
      return {
        xmlValid: false,
        schemaValid: false,
        findings: [
          { code: 'XML_PARSE', category: 'xml', message: 'The input is not a well-formed supported XML document.' },
        ],
      };
    }
    try {
      validator.validate(document);
    } catch (error) {
      if (!(error instanceof XmlValidateError)) throw error;
      return {
        xmlValid: true,
        schemaValid: false,
        findings: [
          {
            code: 'BPMN_XSD',
            category: 'xml',
            message: 'The document violates the official BPMN 2.0.2 schema.',
            remediation: 'Check required BPMN elements, attributes, values, and ordering.',
          },
        ],
      };
    }
    return { xmlValid: true, schemaValid: true, findings: [] };
  } finally {
    document?.dispose();
    validator?.dispose();
    schema?.dispose();
    xmlCleanupInputProvider();
  }
}

try {
  parentPort?.postMessage(await assess());
} catch {
  parentPort?.postMessage({ failure: true });
}
