// Client-side "print the dashboard" exports: capture a DOM node with
// html-to-image (charts, Leaflet map tiles and all) and hand it over as a
// PNG download or a paginated A4 PDF. Used by every dashboard's Export menu.
import { exportFilename } from './csv';

// Elements marked data-export-exclude (the Export menu itself, buttons that
// make no sense on paper) are left out of the capture.
const keep = (el) => !(el instanceof Element && el.hasAttribute('data-export-exclude'));

function pageBackground() {
  const c = getComputedStyle(document.body).backgroundColor;
  return !c || c === 'transparent' || c === 'rgba(0, 0, 0, 0)' ? '#ffffff' : c;
}

// Both libraries are heavy; load them on first use so dashboards stay light.
async function captureNode(node) {
  const { toCanvas } = await import('html-to-image');
  return toCanvas(node, { pixelRatio: 2, backgroundColor: pageBackground(), filter: keep });
}

export async function exportNodeAsPng(node, descriptor) {
  const canvas = await captureNode(node);
  const a = document.createElement('a');
  a.href = canvas.toDataURL('image/png');
  a.download = exportFilename(descriptor, 'png');
  a.click();
}

// A4 portrait PDF: the capture is scaled to the page width and sliced across
// as many pages as it needs; page one carries a small title + date header.
export async function exportNodeAsPdf(node, descriptor, title) {
  const [{ jsPDF }, canvas] = await Promise.all([import('jspdf'), captureNode(node)]);
  const pdf = new jsPDF({ unit: 'pt', format: 'a4' });
  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();
  const margin = 28;
  const imgW = pageW - margin * 2;
  const scale = imgW / canvas.width;

  let sy = 0;
  let page = 0;
  while (sy < canvas.height) {
    if (page > 0) pdf.addPage();
    let y = margin;
    if (page === 0 && title) {
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(14);
      pdf.setTextColor(23, 38, 60);
      pdf.text(title, margin, y + 6);
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(9);
      pdf.setTextColor(120, 128, 140);
      const stamp = new Date().toLocaleDateString('en-GB', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      });
      pdf.text(`Generated ${stamp} — 5Ws Seychelles`, margin, y + 20);
      y += 34;
    }
    const slicePx = Math.min(canvas.height - sy, Math.floor((pageH - margin - y) / scale));
    const slice = document.createElement('canvas');
    slice.width = canvas.width;
    slice.height = slicePx;
    slice.getContext('2d').drawImage(canvas, 0, sy, canvas.width, slicePx, 0, 0, canvas.width, slicePx);
    pdf.addImage(slice.toDataURL('image/png'), 'PNG', margin, y, imgW, slicePx * scale);
    sy += slicePx;
    page += 1;
  }
  pdf.save(exportFilename(descriptor, 'pdf'));
}
