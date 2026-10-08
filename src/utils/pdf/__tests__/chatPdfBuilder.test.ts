import {buildChatPdf} from '../chatPdfBuilder';

// Rendering a real PDF through pdf-lib + the embedded Amiri font takes a
// couple of seconds; keep the case count small but meaningful.
describe('buildChatPdf', () => {
  it('produces a valid multi-message PDF with Arabic and Latin text', async () => {
    const bytes = await buildChatPdf({
      title: 'محادثة تجريبية',
      exportedAt: '2026-10-08 05:00',
      messages: [
        {
          role: 'user',
          text: 'مرحبا بالعالم، هذا اختبار لتصدير المحادثات PDF',
          imageCount: 1,
          timestamp: '2026-10-08 04:59',
        },
        {
          role: 'assistant',
          text: 'أهلاً بك! Hello from the assistant.',
          imageCount: 0,
        },
        {
          role: 'user',
          text: 'A longer Latin paragraph that will comfortably fit on a single line of the generated document.',
          imageCount: 0,
          timestamp: '2026-10-08 05:01',
        },
      ],
      labels: {
        user: 'User',
        assistant: 'Assistant',
        image: 'image',
        page: 'Page',
        exported: 'Exported',
      },
    });

    const header = String.fromCharCode(...bytes.slice(0, 5));
    expect(header).toBe('%PDF-');
    // Full Amiri embed (~430 KB source) must be present.
    expect(bytes.length).toBeGreaterThan(150000);

    // Parseable by pdf-lib itself (round-trip sanity).
    const {PDFDocument} = require('pdf-lib');
    const doc = await PDFDocument.load(Buffer.from(bytes));
    expect(doc.getPageCount()).toBeGreaterThanOrEqual(1);
    expect(doc.getTitle()).toBe('محادثة تجريبية');
  }, 30000);

  it('handles an empty transcript without crashing', async () => {
    const bytes = await buildChatPdf({
      title: 'empty',
      exportedAt: '2026-10-08 05:00',
      messages: [],
      labels: {
        user: 'User',
        assistant: 'Assistant',
        image: 'image',
        page: 'Page',
        exported: 'Exported',
      },
    });
    expect(String.fromCharCode(...bytes.slice(0, 5))).toBe('%PDF-');
  });

  it('emits multiple pages for long content', async () => {
    const messages = Array.from({length: 60}, (_, i) => ({
      role: (i % 2 === 0 ? 'user' : 'assistant') as 'user' | 'assistant',
      text: 'This is a fairly long message meant to consume vertical space in the document so that pagination becomes necessary for the export. '.repeat(
        2,
      ),
      imageCount: 0,
    }));
    const bytes = await buildChatPdf({
      title: 'long chat',
      exportedAt: '2026-10-08 05:00',
      messages,
      labels: {
        user: 'User',
        assistant: 'Assistant',
        image: 'image',
        page: 'Page',
        exported: 'Exported',
      },
    });
    const {PDFDocument} = require('pdf-lib');
    const doc = await PDFDocument.load(Buffer.from(bytes));
    expect(doc.getPageCount()).toBeGreaterThan(1);
  }, 30000);
});
