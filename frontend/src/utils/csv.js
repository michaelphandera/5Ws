// Client-side CSV download for table views. The activities 5W matrix keeps its
// richer server-side export (HXL row, P-codes); this covers every other table.
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
