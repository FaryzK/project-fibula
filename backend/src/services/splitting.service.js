const { PDFDocument } = require('pdf-lib');
const openai = require('../utils/openai');
const storageService = require('./storage.service');

const SYSTEM_PROMPT = `You are a document splitting assistant. Given the document content and splitting instructions,
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
 * @param {string} content - Text content or base64 image
 * @param {string} mimeType - MIME type of the document
 * @param {string} instructions - The splitting instructions
 * @param {number} totalPages - Total number of pages in the document
 * @returns {Array<{pages: number[], label: string}>}
 */
async function getSplitPlan(content, mimeType, instructions, totalPages) {
  const isImage = mimeType.startsWith('image/');

  const userMessage = isImage
    ? {
        role: 'user',
        content: [
          {
            type: 'image_url',
            image_url: { url: `data:${mimeType};base64,${content}` },
          },
          {
            type: 'text',
            text: `Splitting instructions: ${instructions}\nThis document has ${totalPages} page(s). Identify split points.`,
          },
        ],
      }
    : {
        role: 'user',
        content: `Splitting instructions: ${instructions}\nThis document has ${totalPages} pages.\n\nDocument text:\n${content}`,
      };

  const response = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [{ role: 'system', content: SYSTEM_PROMPT }, userMessage],
    response_format: { type: 'json_object' },
    max_tokens: 1000,
  });

  const parsed = JSON.parse(response.choices[0].message.content);
  return parsed.splits;
}

/**
 * Split a PDF buffer into multiple PDFs based on page ranges.
 * @param {Buffer} pdfBuffer
 * @param {Array<{pages: number[], label: string}>} splitPlan - 1-indexed page numbers
 * @returns {Array<{buffer: Buffer, label: string}>}
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
    results.push({ buffer, label: split.label });
  }

  return results;
}

/**
 * Process a document through the SPLITTING node.
 * Returns an array of new document records (uploaded sub-documents).
 * @param {Object} document - The document DB record { file_url, file_name, file_type }
 * @param {string} instructions - The splitting instructions text
 * @returns {Array<{file_url: string, file_name: string, file_type: string, label: string}>}
 */
async function processDocument(document, instructions) {
  const { file_url, file_name, file_type } = document;
  const isPdf = file_type === 'application/pdf';

  const fileBuffer = await fetchBuffer(file_url);

  let splits;

  if (isPdf) {
    // Get total page count
    const pdfDoc = await PDFDocument.load(fileBuffer);
    const totalPages = pdfDoc.getPageCount();

    // Extract text for splitting plan (send as text content)
    let textContent;
    try {
      const pdfParse = require('pdf-parse');
      const data = await pdfParse(fileBuffer);
      textContent = data.text;
    } catch (_) {
      textContent = `[PDF document, ${totalPages} page(s)]`;
    }

    const splitPlan = await getSplitPlan(textContent, file_type, instructions, totalPages);

    // Split the actual PDF
    const pdfParts = await splitPdf(fileBuffer, splitPlan);

    // Upload each part
    splits = [];
    for (const part of pdfParts) {
      const baseName = file_name.replace(/\.pdf$/i, '');
      const partName = `${baseName} — ${part.label}.pdf`;
      const { url } = await storageService.upload(part.buffer, partName, 'application/pdf');
      splits.push({ file_url: url, file_name: partName, file_type: 'application/pdf', label: part.label });
    }
  } else {
    // For single-page images, just treat as a single split
    const base64 = fileBuffer.toString('base64');
    const pdfDoc = await PDFDocument.create();
    const splitPlan = await getSplitPlan(base64, file_type, instructions, 1);

    // Images can't be split by page — return as single split with the label
    const label = splitPlan[0]?.label || 'Document';
    splits = [{ file_url, file_name, file_type, label }];
  }

  return splits;
}

module.exports = { processDocument };
