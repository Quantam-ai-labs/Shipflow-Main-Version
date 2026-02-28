import { format } from "date-fns";

function escapeCsvField(value: any): string {
  if (value === null || value === undefined) return "";
  const str = String(value);
  if (str.includes(",") || str.includes('"') || str.includes("\n")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function exportCsv(
  filename: string,
  headers: string[],
  rows: string[][],
) {
  const headerLine = headers.map(escapeCsvField).join(",");
  const dataLines = rows.map(row => row.map(escapeCsvField).join(",")).join("\n");
  const csv = headerLine + "\n" + dataLines;
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename.endsWith(".csv") ? filename : `${filename}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export function exportCsvWithDate(
  prefix: string,
  headers: string[],
  rows: string[][],
) {
  const dateStr = format(new Date(), "yyyy-MM-dd");
  exportCsv(`${prefix}-${dateStr}.csv`, headers, rows);
}
