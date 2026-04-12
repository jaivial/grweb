import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

export interface PdfColumn {
  header: string;
  dataKey: string;
}

export interface PdfExportOptions {
  title: string;
  columns: PdfColumn[];
  rows: Record<string, unknown>[];
  filename: string;
  theme?: 'striped' | 'grid' | 'plain';
  fontSize?: number;
}

const BRAND_RED = [220, 20, 60] as const;

export function formatDate(dateStr: string): string {
  // Only append T00:00:00 if the string is a date-only format (YYYY-MM-DD)
  // ISO datetime strings already have a time component
  const normalized = dateStr.includes('T') ? dateStr : `${dateStr}T00:00:00`;
  const date = new Date(normalized);
  return date.toLocaleDateString('es-ES', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

function formatTime(timeStr: string): string {
  return timeStr.substring(0, 5);
}

export function exportPdf(options: PdfExportOptions): void {
  const {
    title,
    columns,
    rows,
    filename,
    theme = 'striped',
    fontSize = 9,
  } = options;

  const doc = new jsPDF({
    orientation: 'landscape',
    unit: 'mm',
    format: 'a4',
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 14;
  const availableWidth = pageWidth - margin * 2;

  // Header: title + date on every page
  const headerHeight = 18;

  doc.setFillColor(...BRAND_RED);
  doc.rect(0, 0, pageWidth, headerHeight, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(13);
  doc.setFont('helvetica', 'bold');
  doc.text(title, margin, margin - 3);

  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  const dateStr = new Date().toLocaleDateString('es-ES', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });
  doc.text(`Generado: ${dateStr}`, margin, margin + 3);

  const tableStartY = headerHeight + 4;

  // Calculate column widths proportionally
  const colCount = columns.length;
  const colWidth = availableWidth / colCount;

  const headers = columns.map(c => c.header);
  const dataKeys = columns.map(c => c.dataKey);

  const formattedRows = rows.map(row =>
    dataKeys.map(key => {
      const value = row[key];
      if (value === null || value === undefined) return '-';
      // Format known fields
      if (key === 'date') return formatDate(String(value));
      if (key === 'startTime' || key === 'endTime') return formatTime(String(value));
      if (key === 'registrationDate') return formatDate(String(value));
      if (key === 'sex') return value === 'Male' ? 'Hombre' : 'Mujer';
      if (key === 'isPaid') return value ? 'Sí' : 'No';
      return String(value);
    })
  );

  autoTable(doc, {
    startY: tableStartY,
    head: [headers],
    body: formattedRows,
    theme,
    headStyles: {
      fillColor: [40, 40, 40],
      textColor: [255, 255, 255],
      fontSize,
      fontStyle: 'bold',
      halign: 'left',
    },
    bodyStyles: {
      fontSize,
      textColor: [50, 50, 50],
      halign: 'left',
      valign: 'middle',
    },
    alternateRowStyles: {
      fillColor: [248, 248, 248],
    },
    columnStyles: {
      0: { cellWidth: colWidth },
    },
    margin: { left: margin, right: margin, bottom: margin },
    // Prevent row splitting across pages
    didDrawPage: undefined,
    pageBreak: 'auto',
    rowPageBreak: 'avoid',
    tableWidth: 'auto',
    showHead: 'firstPage',
  });

  doc.save(`${filename}.pdf`);
}
