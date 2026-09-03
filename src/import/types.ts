export interface TextItem {
  str: string;
  x: number;
  y: number;
  width: number;
}

export interface ExtractedPage {
  items: TextItem[];
  width: number;
  height: number;
}
