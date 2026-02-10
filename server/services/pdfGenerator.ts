import { PDFDocument, StandardFonts, rgb, PDFFont, PDFPage } from "pdf-lib";
import bwipjs from "bwip-js";
import fs from "fs";
import path from "path";

const PDF_DIR = path.join(process.cwd(), "generated_pdfs");

function ensurePdfDir() {
  if (!fs.existsSync(PDF_DIR)) {
    fs.mkdirSync(PDF_DIR, { recursive: true });
  }
}

function truncate(str: string, len: number): string {
  if (!str) return "";
  return str.length > len ? str.substring(0, len - 3) + "..." : str;
}

async function generateBarcode(text: string): Promise<Buffer | null> {
  try {
    const png = await bwipjs.toBuffer({
      bcid: "code128",
      text: text,
      scale: 2,
      height: 12,
      includetext: true,
      textxalign: "center",
      textsize: 8,
    });
    return png;
  } catch (err) {
    console.error("[PDF] Barcode generation failed:", err);
    return null;
  }
}

function drawLine(page: PDFPage, y: number, width: number) {
  page.drawLine({
    start: { x: 40, y },
    end: { x: width - 40, y },
    thickness: 0.5,
    color: rgb(0.8, 0.8, 0.8),
  });
}

function drawText(page: PDFPage, font: PDFFont, text: string, x: number, y: number, size: number = 10, color = rgb(0.15, 0.15, 0.15)) {
  page.drawText(text || "", { x, y, size, font, color });
}

function drawLabel(page: PDFPage, font: PDFFont, boldFont: PDFFont, label: string, value: string, x: number, y: number, labelSize: number = 8, valueSize: number = 10) {
  drawText(page, font, label, x, y + 12, labelSize, rgb(0.5, 0.5, 0.5));
  drawText(page, boldFont, value || "-", x, y, valueSize);
}

export interface AirwayBillData {
  trackingNumber: string;
  orderNumber: string;
  courierName: string;
  bookedAt: string;
  merchantName: string;
  consigneeName: string;
  consigneePhone: string;
  consigneeCity: string;
  consigneeAddress: string;
  codAmount: number;
  weight: number;
  pieces: number;
  itemsSummary?: string;
  shipmentType?: string;
}

export async function generateAirwayBillPdf(data: AirwayBillData): Promise<string> {
  ensurePdfDir();

  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([595.28, 841.89]);
  const { width, height } = page.getSize();

  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  let y = height - 50;

  page.drawRectangle({
    x: 30,
    y: y - 10,
    width: width - 60,
    height: 45,
    color: rgb(0.12, 0.12, 0.18),
  });
  drawText(page, boldFont, "AIRWAY BILL", 45, y + 8, 18, rgb(1, 1, 1));
  drawText(page, font, data.courierName.toUpperCase(), 45, y - 5, 10, rgb(0.7, 0.7, 0.7));
  drawText(page, boldFont, data.trackingNumber, width - 250, y + 5, 14, rgb(1, 1, 1));

  y -= 55;

  const barcodePng = await generateBarcode(data.trackingNumber);
  if (barcodePng) {
    const barcodeImage = await pdfDoc.embedPng(barcodePng);
    const barcodeWidth = 220;
    const barcodeHeight = (barcodeImage.height / barcodeImage.width) * barcodeWidth;
    page.drawImage(barcodeImage, {
      x: (width - barcodeWidth) / 2,
      y: y - barcodeHeight - 5,
      width: barcodeWidth,
      height: barcodeHeight,
    });
    y -= barcodeHeight + 20;
  }

  drawLine(page, y, width);
  y -= 10;

  drawText(page, boldFont, "Shipment Details", 45, y, 12, rgb(0.2, 0.2, 0.3));
  y -= 30;

  const col1 = 45;
  const col2 = 200;
  const col3 = 360;

  drawLabel(page, font, boldFont, "Order Number", `#${data.orderNumber}`, col1, y);
  drawLabel(page, font, boldFont, "Booking Date", data.bookedAt, col2, y);
  drawLabel(page, font, boldFont, "Merchant", truncate(data.merchantName, 25), col3, y);

  y -= 45;

  drawLabel(page, font, boldFont, "Weight", `${data.weight}g`, col1, y);
  drawLabel(page, font, boldFont, "Pieces", String(data.pieces), col2, y);
  drawLabel(page, font, boldFont, "Mode", data.shipmentType || "Overnight", col3, y);

  y -= 50;
  drawLine(page, y, width);
  y -= 10;

  drawText(page, boldFont, "Consignee Details", 45, y, 12, rgb(0.2, 0.2, 0.3));
  y -= 30;

  drawLabel(page, font, boldFont, "Name", data.consigneeName, col1, y);
  drawLabel(page, font, boldFont, "Phone", data.consigneePhone, col2, y);
  drawLabel(page, font, boldFont, "City", data.consigneeCity, col3, y);

  y -= 45;
  drawLabel(page, font, boldFont, "Address", truncate(data.consigneeAddress, 80), col1, y, 8, 9);

  y -= 50;
  drawLine(page, y, width);
  y -= 10;

  drawText(page, boldFont, "Payment", 45, y, 12, rgb(0.2, 0.2, 0.3));
  y -= 30;

  page.drawRectangle({
    x: 40,
    y: y - 5,
    width: 180,
    height: 35,
    color: rgb(0.95, 0.95, 0.97),
    borderColor: rgb(0.8, 0.8, 0.85),
    borderWidth: 1,
  });
  drawText(page, font, "COD Amount", 50, y + 15, 8, rgb(0.5, 0.5, 0.5));
  drawText(page, boldFont, `PKR ${data.codAmount.toLocaleString()}`, 50, y, 14, rgb(0.1, 0.4, 0.2));

  if (data.itemsSummary) {
    y -= 55;
    drawLine(page, y, width);
    y -= 10;
    drawText(page, boldFont, "Items", 45, y, 12, rgb(0.2, 0.2, 0.3));
    y -= 20;
    drawText(page, font, truncate(data.itemsSummary, 120), 45, y, 9);
  }

  y -= 60;
  drawLine(page, y, width);
  y -= 15;
  drawText(page, font, "This is a computer-generated document. No signature required.", 45, y, 7, rgb(0.6, 0.6, 0.6));
  drawText(page, font, `Generated by ShipFlow | ${new Date().toISOString()}`, 45, y - 12, 7, rgb(0.6, 0.6, 0.6));

  const pdfBytes = await pdfDoc.save();
  const filename = `awb_${data.trackingNumber}_${Date.now()}.pdf`;
  const filepath = path.join(PDF_DIR, filename);
  fs.writeFileSync(filepath, pdfBytes);

  return filepath;
}

export interface BatchLoadsheetData {
  batchId: string;
  courierName: string;
  createdBy: string;
  createdAt: string;
  merchantName: string;
  totalCount: number;
  successCount: number;
  failedCount: number;
  items: Array<{
    orderNumber: string;
    trackingNumber: string;
    consigneeName: string;
    consigneeCity: string;
    consigneePhone: string;
    codAmount: number;
    status: string;
    error?: string;
  }>;
}

export async function generateBatchLoadsheetPdf(data: BatchLoadsheetData): Promise<string> {
  ensurePdfDir();

  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const pageWidth = 841.89;
  const pageHeight = 595.28;

  let page = pdfDoc.addPage([pageWidth, pageHeight]);
  let y = pageHeight - 40;

  page.drawRectangle({
    x: 25,
    y: y - 8,
    width: pageWidth - 50,
    height: 38,
    color: rgb(0.12, 0.12, 0.18),
  });
  drawText(page, boldFont, "BATCH LOADSHEET", 35, y + 5, 16, rgb(1, 1, 1));
  drawText(page, font, `${data.courierName.toUpperCase()} | Batch: ${data.batchId.substring(0, 8)}`, 35, y - 8, 9, rgb(0.7, 0.7, 0.7));

  const statusText = `Total: ${data.totalCount} | Success: ${data.successCount} | Failed: ${data.failedCount}`;
  drawText(page, boldFont, statusText, pageWidth - 300, y + 2, 10, rgb(1, 1, 1));

  y -= 50;

  drawText(page, font, `Merchant: ${data.merchantName}`, 35, y, 9, rgb(0.4, 0.4, 0.4));
  drawText(page, font, `Created: ${data.createdAt}`, 250, y, 9, rgb(0.4, 0.4, 0.4));
  drawText(page, font, `By: ${data.createdBy}`, 500, y, 9, rgb(0.4, 0.4, 0.4));

  y -= 25;

  const cols = [35, 120, 235, 345, 435, 540, 640, 720];
  const colHeaders = ["#", "Order", "Tracking", "Name", "City", "Phone", "COD", "Status"];

  page.drawRectangle({
    x: 25,
    y: y - 5,
    width: pageWidth - 50,
    height: 20,
    color: rgb(0.93, 0.93, 0.96),
  });
  colHeaders.forEach((header, i) => {
    drawText(page, boldFont, header, cols[i], y, 8, rgb(0.3, 0.3, 0.35));
  });
  y -= 22;

  const rowsPerPage = 28;
  let rowCount = 0;

  for (let idx = 0; idx < data.items.length; idx++) {
    if (rowCount >= rowsPerPage) {
      page = pdfDoc.addPage([pageWidth, pageHeight]);
      y = pageHeight - 40;
      page.drawRectangle({
        x: 25,
        y: y - 5,
        width: pageWidth - 50,
        height: 20,
        color: rgb(0.93, 0.93, 0.96),
      });
      colHeaders.forEach((header, i) => {
        drawText(page, boldFont, header, cols[i], y, 8, rgb(0.3, 0.3, 0.35));
      });
      y -= 22;
      rowCount = 0;
    }

    const item = data.items[idx];
    const isSuccess = item.status === "BOOKED";
    const rowColor = idx % 2 === 0 ? rgb(0.98, 0.98, 0.99) : rgb(1, 1, 1);

    page.drawRectangle({
      x: 25,
      y: y - 4,
      width: pageWidth - 50,
      height: 18,
      color: rowColor,
    });

    const textColor = isSuccess ? rgb(0.15, 0.15, 0.15) : rgb(0.7, 0.2, 0.2);
    drawText(page, font, String(idx + 1), cols[0], y, 8, textColor);
    drawText(page, font, truncate(item.orderNumber, 15), cols[1], y, 8, textColor);
    drawText(page, font, item.trackingNumber || "-", cols[2], y, 8, textColor);
    drawText(page, font, truncate(item.consigneeName, 15), cols[3], y, 8, textColor);
    drawText(page, font, truncate(item.consigneeCity, 12), cols[4], y, 8, textColor);
    drawText(page, font, truncate(item.consigneePhone, 14), cols[5], y, 8, textColor);
    drawText(page, font, item.codAmount ? `${item.codAmount.toLocaleString()}` : "-", cols[6], y, 8, textColor);

    const statusColor = isSuccess ? rgb(0.1, 0.5, 0.2) : rgb(0.8, 0.2, 0.2);
    drawText(page, boldFont, isSuccess ? "OK" : "FAIL", cols[7], y, 8, statusColor);

    y -= 18;
    rowCount++;

    if (!isSuccess && item.error) {
      drawText(page, font, `  Error: ${truncate(item.error, 100)}`, cols[1], y, 7, rgb(0.6, 0.3, 0.3));
      y -= 14;
      rowCount++;
    }
  }

  y -= 20;
  drawLine(page, y, pageWidth);
  y -= 15;
  drawText(page, font, `Generated by ShipFlow | ${new Date().toISOString()}`, 35, y, 7, rgb(0.6, 0.6, 0.6));

  const pdfBytes = await pdfDoc.save();
  const filename = `batch_${data.batchId.substring(0, 8)}_${Date.now()}.pdf`;
  const filepath = path.join(PDF_DIR, filename);
  fs.writeFileSync(filepath, pdfBytes);

  return filepath;
}

export function getPdfPath(filepath: string): string | null {
  if (!filepath) return null;
  if (fs.existsSync(filepath)) return filepath;
  return null;
}
