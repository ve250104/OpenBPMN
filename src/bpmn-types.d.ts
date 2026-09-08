declare module 'bpmn-moddle' {
  export interface ModdleProperty {
    name: string;
    type: string;
    isMany?: boolean;
    isReference?: boolean;
    isVirtual?: boolean;
  }

  /** Dynamic properties are restricted to this third-party object boundary. */
  export interface ModdleElement {
    $type: string;
    $parent?: ModdleElement;
    $descriptor: { properties: ModdleProperty[] };
    $attrs?: Record<string, string>;
    id?: string;
    [property: string]: any;
  }

  export interface ModdleWarning {
    message: string;
    error?: Error;
    [property: string]: unknown;
  }

  export class BpmnModdle {
    constructor(packages?: Record<string, unknown>, options?: Record<string, unknown>);
    create(type: string, attributes?: Record<string, unknown>): ModdleElement;
    fromXML(
      xml: string,
      typeName?: string,
    ): Promise<{
      rootElement: ModdleElement;
      elementsById: Record<string, ModdleElement>;
      warnings: ModdleWarning[];
      references: unknown[];
    }>;
    toXML(element: ModdleElement, options?: { format?: boolean; preamble?: boolean }): Promise<{ xml: string }>;
  }
}

declare module 'bpmn-auto-layout' {
  export interface LayoutWarning {
    code?: string;
    message?: string;
    [property: string]: unknown;
  }
  export function layoutProcess(xml: string): Promise<{ xml: string; warnings: LayoutWarning[] }>;
}
