/**
 * Chat transcript → PDF.
 *
 * Produces an A4 document with the session title, export timestamp and the
 * full message flow (user / assistant turns, image placeholders), fully
 * RTL-aware: Arabic text is shaped to presentation forms and laid out with
 * the pragmatic bidi engine in bidiText.ts, using the embedded Amiri font
 * for Arabic runs and the built-in Helvetica for Latin runs.
 *
 * Text is embedded unsubsetted (pdf-lib's subsetting is unreliable for
 * Amiri's large glyph set), which costs ~220 KB per export — fine for a
 * shareable document.
 */

import {PDFDocument, PDFFont, PDFPage, StandardFonts, rgb} from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';

import {AMIRI_FONT_BASE64} from './fontData';
import {base64ToBytes} from './base64';
import {layoutParagraph, type MeasureText, type FontKey} from './bidiText';

export interface PdfChatMessage {
  role: 'user' | 'assistant';
  text: string;
  imageCount: number;
  timestamp?: string;
}

export interface ChatPdfInput {
  title: string;
  exportedAt: string;
  messages: PdfChatMessage[];
  /** Localized labels: {user, assistant, image, page, exported} */
  labels: {
    user: string;
    assistant: string;
    image: string;
    page: string;
    exported: string;
  };
}

interface Fonts {
  arabic: PDFFont;
  latin: PDFFont;
  latinBold: PDFFont;
}

const PAGE_WIDTH = 595.28; // A4
const PAGE_HEIGHT = 841.89;
const MARGIN = 52;
const BODY_SIZE = 11;
const BODY_LEADING = 17;
const LABEL_SIZE = 9.5;
const TITLE_SIZE = 17;

const COLOR_TEXT = rgb(0.13, 0.13, 0.15);
const COLOR_MUTED = rgb(0.45, 0.47, 0.5);
const COLOR_USER = rgb(0.16, 0.42, 0.78);
const COLOR_ASSISTANT = rgb(0.13, 0.55, 0.35);
const COLOR_RULE = rgb(0.85, 0.86, 0.88);

const makeMeasure =
  (fonts: Fonts, size: number): MeasureText =>
  (text, font: FontKey) =>
    font === 'arabic'
      ? fonts.arabic.widthOfTextAtSize(text, size)
      : fonts.latin.widthOfTextAtSize(text, size);

const drawParagraph = (
  page: PDFPage,
  text: string,
  opts: {
    x: number;
    y: number;
    size: number;
    leading: number;
    maxWidth: number;
    color: ReturnType<typeof rgb>;
    fonts: Fonts;
    rtl?: boolean;
  },
): number => {
  const lines = layoutParagraph(text, {
    maxWidth: opts.maxWidth,
    spaceWidth: opts.fonts.latin.widthOfTextAtSize(' ', opts.size),
    measure: makeMeasure(opts.fonts, opts.size),
    rtl: opts.rtl,
  });
  let y = opts.y;
  for (const line of lines) {
    let x = line.rtl ? opts.x + opts.maxWidth - line.width : opts.x;
    for (const run of line.runs) {
      const font = run.font === 'arabic' ? opts.fonts.arabic : opts.fonts.latin;
      page.drawText(run.text, {
        x,
        y,
        size: opts.size,
        font,
        color: opts.color,
      });
      x += run.width;
    }
    y -= opts.leading;
  }
  return y; // y of the next baseline
};

const drawPagesFooter = (pages: PDFPage[], fonts: Fonts, label: string) => {
  pages.forEach((page, index) => {
    const text = `${label} ${index + 1} / ${pages.length}`;
    const size = 8.5;
    const width = fonts.latin.widthOfTextAtSize(text, size);
    page.drawText(text, {
      x: (PAGE_WIDTH - width) / 2,
      y: MARGIN / 2,
      size,
      font: fonts.latin,
      color: COLOR_MUTED,
    });
  });
};

/** Build the PDF bytes for a chat transcript. */
export const buildChatPdf = async (
  input: ChatPdfInput,
): Promise<Uint8Array> => {
  const pdfDoc = await PDFDocument.create();
  pdfDoc.registerFontkit(fontkit);

  const arabicBytes = base64ToBytes(AMIRI_FONT_BASE64);
  const arabic = await pdfDoc.embedFont(arabicBytes, {subset: false});
  const latin = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const latinBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const fonts: Fonts = {arabic, latin, latinBold};

  pdfDoc.setTitle(input.title || 'DRS AI Chat');
  pdfDoc.setProducer('DRS AI');
  pdfDoc.setCreationDate(new Date());

  const contentWidth = PAGE_WIDTH - MARGIN * 2;
  let page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  const pages: PDFPage[] = [page];
  let y = PAGE_HEIGHT - MARGIN;

  // Title (right-aligned when Arabic)
  const titleRtl = layoutParagraph(input.title, {
    maxWidth: contentWidth,
    spaceWidth: fonts.latin.widthOfTextAtSize(' ', TITLE_SIZE),
    measure: makeMeasure(fonts, TITLE_SIZE),
  })[0]?.rtl;
  y = drawParagraph(page, input.title, {
    x: MARGIN,
    y,
    size: TITLE_SIZE,
    leading: TITLE_SIZE + 8,
    maxWidth: contentWidth,
    color: COLOR_TEXT,
    fonts,
    rtl: titleRtl,
  });
  y = drawParagraph(page, `${input.labels.exported}: ${input.exportedAt}`, {
    x: MARGIN,
    y: y - 2,
    size: 9,
    leading: 13,
    maxWidth: contentWidth,
    color: COLOR_MUTED,
    fonts,
  });
  page.drawLine({
    start: {x: MARGIN, y: y - 4},
    end: {x: PAGE_WIDTH - MARGIN, y: y - 4},
    thickness: 0.8,
    color: COLOR_RULE,
  });
  y -= 26;

  const ensureSpace = (needed: number) => {
    if (y - needed < MARGIN + BODY_LEADING) {
      page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
      pages.push(page);
      y = PAGE_HEIGHT - MARGIN;
    }
  };

  for (const message of input.messages) {
    const isUser = message.role === 'user';
    const label = isUser ? input.labels.user : input.labels.assistant;
    const labelColor = isUser ? COLOR_USER : COLOR_ASSISTANT;

    // Role label (+ timestamp)
    const labelLine =
      message.timestamp != null ? `${label} · ${message.timestamp}` : label;
    ensureSpace(BODY_LEADING * 2);
    const labelRuns = layoutParagraph(labelLine, {
      maxWidth: contentWidth,
      spaceWidth: fonts.latin.widthOfTextAtSize(' ', LABEL_SIZE),
      measure: makeMeasure(fonts, LABEL_SIZE),
      // direction auto-detected: localized labels may be Arabic or Latin
    })[0];
    let labelX = MARGIN;
    if (labelRuns?.rtl) {
      labelX = MARGIN + contentWidth - labelRuns.width;
    }
    for (const run of labelRuns?.runs ?? []) {
      const font = run.font === 'arabic' ? fonts.arabic : fonts.latinBold;
      page.drawText(run.text, {
        x: labelX,
        y,
        size: LABEL_SIZE,
        font,
        color: labelColor,
      });
      labelX += run.width;
    }
    y -= LABEL_SIZE + 7;

    // Body
    const body =
      message.text && message.text.trim().length > 0 ? message.text : '—';
    const lines = layoutParagraph(body, {
      maxWidth: contentWidth,
      spaceWidth: fonts.latin.widthOfTextAtSize(' ', BODY_SIZE),
      measure: makeMeasure(fonts, BODY_SIZE),
    });
    for (const line of lines) {
      ensureSpace(BODY_LEADING);
      let x = line.rtl ? MARGIN + contentWidth - line.width : MARGIN;
      for (const run of line.runs) {
        const font = run.font === 'arabic' ? fonts.arabic : fonts.latin;
        page.drawText(run.text, {
          x,
          y,
          size: BODY_SIZE,
          font,
          color: COLOR_TEXT,
        });
        x += run.width;
      }
      y -= BODY_LEADING;
    }

    // Image placeholders
    for (let i = 0; i < message.imageCount; i++) {
      ensureSpace(BODY_LEADING);
      y = drawParagraph(page, `[${input.labels.image}]`, {
        x: MARGIN + 10,
        y,
        size: BODY_SIZE - 1,
        leading: BODY_LEADING,
        maxWidth: contentWidth - 10,
        color: COLOR_MUTED,
        fonts,
      });
    }

    // Separator between turns
    ensureSpace(BODY_LEADING);
    page.drawLine({
      start: {x: MARGIN, y: y - 2},
      end: {x: PAGE_WIDTH - MARGIN, y: y - 2},
      thickness: 0.5,
      color: COLOR_RULE,
    });
    y -= 22;
  }

  drawPagesFooter(pages, fonts, input.labels.page);

  return pdfDoc.save();
};
