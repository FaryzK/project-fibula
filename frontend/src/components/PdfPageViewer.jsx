import { useEffect, useRef, useState } from 'react';
import * as pdfjsLib from 'pdfjs-dist';

// Configure the worker (Vite handles the URL resolution)
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.mjs',
  import.meta.url
).toString();

/**
 * Renders a PDF file one page at a time using pdfjs-dist.
 * Props:
 *   file — a File object (from <input type="file">)
 */
export default function PdfPageViewer({ file }) {
  const canvasRef = useRef(null);
  const [pdfDoc, setPdfDoc] = useState(null);
  const [pageNum, setPageNum] = useState(1);
  const [numPages, setNumPages] = useState(0);
  const [rendering, setRendering] = useState(false);
  const renderTaskRef = useRef(null);

  // Load PDF whenever file changes
  useEffect(() => {
    if (!file) { setPdfDoc(null); setNumPages(0); setPageNum(1); return; }

    let cancelled = false;
    (async () => {
      const arrayBuffer = await file.arrayBuffer();
      if (cancelled) return;
      const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
      const doc = await loadingTask.promise;
      if (cancelled) return;
      setPdfDoc(doc);
      setNumPages(doc.numPages);
      setPageNum(1);
    })();

    return () => { cancelled = true; };
  }, [file]);

  // Render whenever pdfDoc or pageNum changes
  useEffect(() => {
    if (!pdfDoc || !canvasRef.current) return;

    let cancelled = false;
    (async () => {
      setRendering(true);
      // Cancel any in-progress render
      if (renderTaskRef.current) {
        try { renderTaskRef.current.cancel(); } catch {}
      }

      const page = await pdfDoc.getPage(pageNum);
      if (cancelled) return;

      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');
      const containerWidth = canvas.parentElement?.clientWidth || 500;
      const unscaled = page.getViewport({ scale: 1 });
      const scale = containerWidth / unscaled.width;
      const viewport = page.getViewport({ scale });

      canvas.width = viewport.width;
      canvas.height = viewport.height;

      const renderTask = page.render({ canvasContext: ctx, viewport });
      renderTaskRef.current = renderTask;

      try {
        await renderTask.promise;
      } catch (err) {
        if (err?.name !== 'RenderingCancelledException') console.error('PDF render error:', err);
      }
      if (!cancelled) setRendering(false);
    })();

    return () => { cancelled = true; };
  }, [pdfDoc, pageNum]);

  if (!file) return null;

  return (
    <div className="flex flex-col">
      <canvas ref={canvasRef} className="w-full block" />
      {numPages > 1 && (
        <div className="flex items-center justify-center gap-3 py-2 border-t border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700">
          <button
            onClick={() => setPageNum((p) => Math.max(1, p - 1))}
            disabled={pageNum <= 1 || rendering}
            className="px-2 py-1 text-xs text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600 rounded disabled:opacity-40 transition"
          >
            ← Prev
          </button>
          <span className="text-xs text-gray-500 dark:text-gray-400">
            {pageNum} / {numPages}
          </span>
          <button
            onClick={() => setPageNum((p) => Math.min(numPages, p + 1))}
            disabled={pageNum >= numPages || rendering}
            className="px-2 py-1 text-xs text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600 rounded disabled:opacity-40 transition"
          >
            Next →
          </button>
        </div>
      )}
    </div>
  );
}
