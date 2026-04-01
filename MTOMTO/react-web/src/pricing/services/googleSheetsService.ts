// MTO Pricing — Google Sheets external service (stubbed, CSV fallback)

import type { ExportRow } from '../types';
import { exportRowsToCsv } from '../utils';

const API_KEY = String(import.meta.env.VITE_GOOGLE_SHEETS_API_KEY ?? '').trim();

export function isGoogleSheetsConfigured(): boolean {
  return Boolean(API_KEY);
}

export async function exportToGoogleSheets(
  _spreadsheetId: string,
  _rows: ExportRow[],
): Promise<boolean> {
  if (!API_KEY) {
    return false;
  }
  // TODO: Implement actual Google Sheets API integration in Day 2
  return false;
}

export function downloadCsvFallback(rows: ExportRow[], fileName: string): void {
  const csv = exportRowsToCsv(rows);
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
}
