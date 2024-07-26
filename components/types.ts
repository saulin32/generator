export interface FieldElement {
  SearchParams?: Record<string, string>;
  SearchUrl?: string;
  Computed?: boolean;
  Key?: string;
  Value?: string;
  ApiUrl?: string;
  ApiParams?: Record<string, string>;
  Searchable?: boolean;
  Type?: string;
  StaticValues: any[];
  LabelProperty?: string;
  Multiple?: boolean;
}
