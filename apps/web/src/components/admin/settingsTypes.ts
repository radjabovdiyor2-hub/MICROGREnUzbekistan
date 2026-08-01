export interface Field {
  key: string;
  category: string;
  type: 'number' | 'money' | 'string' | 'text' | 'boolean' | 'list';
  labelRu: string;
  labelUz: string;
  hintRu: string | null;
  min: number | null;
  max: number | null;
  default: unknown;
  value: unknown;
  modified: boolean;
}

export interface Category {
  id: string;
  ru: string;
  uz: string;
}
