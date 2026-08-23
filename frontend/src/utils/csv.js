// Client-side CSV download for table views. The activities 5W matrix keeps its
// richer server-side export (HXL row, P-codes); this covers every other table.

// Official filename convention for every download from the system:
//   Seychelles_CSO_5W_<Descriptor>_<DDMMYY>.<ext>
// Mirrors backend/src/utils/exportName.js — keep in sync.
export function exportFilename(descriptor, ext) {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  const stamp = `${p(d.getDate())}${p(d.getMonth() + 1)}${String(d.getFullYear()).slice(-2)}`;
  return `Seychelles_CSO_5W_${descriptor}_${stamp}.${ext}`;
}
function esc(v) {
  const s = v == null ? '' : String(v);
  return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

export function downloadCsv(filename, headers, rows) {
  const lines = [headers, ...rows].map((r) => r.map(esc).join(','));
  // BOM so Excel opens UTF-8 correctly.
  const blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
