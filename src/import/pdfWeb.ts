import type { ExtractedPage } from './types';

type PdfTextItem = {
  str: string;
  transform: number[];
  width: number;
};

export async function extractPdfPagesWeb(data: ArrayBuffer): Promise<ExtractedPage[]> {
  if (typeof window === 'undefined') throw new Error('Web PDF extraction requires a browser');
  const pdfjs = await import('pdfjs-dist/webpack.mjs');
  const document = await pdfjs.getDocument({ data: new Uint8Array(data) }).promise;
  const pages: ExtractedPage[] = [];

  for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
    const page = await document.getPage(pageNumber);
    const viewport = page.getViewport({ scale: 1 });
    const content = await page.getTextContent();
    const textItems = (content.items as unknown[]).filter(
      (item): item is PdfTextItem => typeof item === 'object' && item !== null && 'str' in item,
    );
    const items = textItems.map((item) => ({
      str: item.str,
      x: item.transform[4],
      y: viewport.height - item.transform[5],
      width: item.width,
    }));
    pages.push({ items, width: viewport.width, height: viewport.height });
  }

  return pages;
}
