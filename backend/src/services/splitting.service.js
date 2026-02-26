const { PDFDocument } = require('pdf-lib');
const openai = require('../utils/openai');
const storageService = require('./storage.service');

const SYSTEM_PROMPT = `You are a document splitting assistant. Given the document and splitting instructions,
identify where to split the document into separate sub-documents.
Return ONLY valid JSON in this exact format, with no other text:
{
  "splits": [
    { "pages": [1, 2], "label": "Document label" },
    { "pages": [3, 4, 5], "label": "Document label" }
  ]
}
Page numbers are 1-indexed. Every page must appear in exactly one split.`;

/**
 * Fetch a file from a URL and return as a Buffer.
 */
async function fetchBuffer(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch document: ${res.status}`);
  const arrayBuffer = await res.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

/**
 * Ask OpenAI to return split page ranges for a document.
 * Passes the file directly (PDF or image) — same approach as the extractor.
 */
async function getSplitPlan(fileBuffer, fileType, instructions, totalPages) {
  const base64 = fileBuffer.toString('base64');
  const isPdf = fileType === 'application/pdf';

  const contentItem = isPdf
    ? { type: 'input_file', filename: 'document.pdf', file_data: `data:application/pdf;base64,${base64}` }
    : { type: 'input_image', image_url: `data:${fileType};base64,${base64}` };

  const response = await openai.responses.create({
    model: 'gpt-4o',
    instructions: SYSTEM_PROMPT,
    input: [
      {
        role: 'user',
        content: [
          contentItem,
          {
            type: 'input_text',
            text: `Splitting instructions: ${instructions}\nThis document has ${totalPages} page(s). Identify split points.`,
          },
        ],
      },
    ],
    text: { format: { type: 'json_object' } },
    max_output_tokens: 1000,
  });

  const parsed = JSON.parse(response.output_text);
  return parsed.splits;
}

/**
 * Split a PDF buffer into multiple PDFs based on page ranges.
 * @param {Buffer} pdfBuffer
 * @param {Array<{pages: number[], label: string}>} splitPlan - 1-indexed page numbers
 * @returns {Array<{buffer: Buffer, label: string, pageStart: number, pageEnd: number}>}
 */
async function splitPdf(pdfBuffer, splitPlan) {
  const srcPdf = await PDFDocument.load(pdfBuffer);
  const results = [];

  for (const split of splitPlan) {
    const newPdf = await PDFDocument.create();
    const zeroIndexed = split.pages.map((p) => p - 1);
    const copiedPages = await newPdf.copyPages(srcPdf, zeroIndexed);
    copiedPages.forEach((page) => newPdf.addPage(page));
    const buffer = Buffer.from(await newPdf.save());
    results.push({
      buffer,
      label: split.label,
      pageStart: split.pages[0],
      pageEnd: split.pages[split.pages.length - 1],
    });
  }

  return results;
}

/**
 * Process a document through the SPLITTING node.
 * Returns an array of new document records (uploaded sub-documents).
 * Child file names follow the convention: parentname_p{start}_{end}.pdf
 *
 * @param {Object} document - The document DB record { file_url, file_name, file_type }
 * @param {string} instructions - The splitting instructions text
 * @returns {Array<{file_url, file_name, file_type, label}>}
 */
async function processDocument(document, instructions) {
  const { file_url, file_name, file_type } = document;
  const isPdf = file_type === 'application/pdf';

  const fileBuffer = await fetchBuffer(file_url);

  if (isPdf) {
    const pdfDoc = await PDFDocument.load(fileBuffer);
    const totalPages = pdfDoc.getPageCount();

    const splitPlan = await getSplitPlan(fileBuffer, file_type, instructions, totalPages);
    const pdfParts = await splitPdf(fileBuffer, splitPlan);

    const baseName = file_name.replace(/\.pdf$/i, '');
    const splits = [];
    for (const part of pdfParts) {
      const partName = `${baseName}_p${part.pageStart}_${part.pageEnd}.pdf`;
      const { url } = await storageService.upload(part.buffer, partName, 'application/pdf');
      splits.push({ file_url: url, file_name: partName, file_type: 'application/pdf', label: part.label });
    }
    return splits;
  } else {
    // Images are single-page — pass to VLM to label, return as-is (can't split by page)
    const splitPlan = await getSplitPlan(fileBuffer, file_type, instructions, 1);
    const label = splitPlan[0]?.label || 'Document';
    return [{ file_url, file_name, file_type, label }];
  }
}

module.exports = { processDocument };
