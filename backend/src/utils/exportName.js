// Official filename convention for every file the system serves for download:
//   Seychelles_CSO_5W_<Descriptor>_<DDMMYY>.<ext>
// e.g. Seychelles_CSO_5W_Activities_230826.xlsx (date = day the file was produced).
// Mirrored by exportFilename in frontend/src/utils/csv.js — keep in sync.
function exportFilename(descriptor, ext) {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  const stamp = `${p(d.getDate())}${p(d.getMonth() + 1)}${String(d.getFullYear()).slice(-2)}`;
  return `Seychelles_CSO_5W_${descriptor}_${stamp}.${ext}`;
}

module.exports = { exportFilename };
