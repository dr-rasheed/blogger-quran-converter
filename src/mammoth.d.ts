declare module 'mammoth' {
  export interface ConversionResult {
    value: string;
    messages: any[];
  }
  export interface ConversionOptions {
    arrayBuffer: ArrayBuffer;
  }
  export function convertToHtml(input: ConversionOptions): Promise<ConversionResult>;
}
