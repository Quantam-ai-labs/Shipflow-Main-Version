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

async function generateBarcode(text: string, height: number = 10, scale: number = 2): Promise<Buffer | null> {
  try {
    const png = await bwipjs.toBuffer({
      bcid: "code128",
      text: text,
      scale,
      height,
      includetext: false,
    });
    return png;
  } catch (err) {
    console.error("[PDF] Barcode generation failed:", err);
    return null;
  }
}

async function generateBarcodeWithText(text: string, height: number = 12, scale: number = 2): Promise<Buffer | null> {
  try {
    const png = await bwipjs.toBuffer({
      bcid: "code128",
      text: text,
      scale,
      height,
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

function drawText(page: PDFPage, font: PDFFont, text: string, x: number, y: number, size: number = 10, color = rgb(0.15, 0.15, 0.15)) {
  page.drawText(text || "", { x, y, size, font, color });
}

function drawRect(page: PDFPage, x: number, y: number, w: number, h: number, borderOnly: boolean = false) {
  if (borderOnly) {
    page.drawRectangle({ x, y, width: w, height: h, borderColor: rgb(0.3, 0.3, 0.3), borderWidth: 0.75 });
  } else {
    page.drawRectangle({ x, y, width: w, height: h, color: rgb(0.95, 0.95, 0.95), borderColor: rgb(0.3, 0.3, 0.3), borderWidth: 0.75 });
  }
}

function drawHLine(page: PDFPage, x1: number, x2: number, y: number) {
  page.drawLine({ start: { x: x1, y }, end: { x: x2, y }, thickness: 0.75, color: rgb(0.3, 0.3, 0.3) });
}

function drawVLine(page: PDFPage, x: number, y1: number, y2: number) {
  page.drawLine({ start: { x, y: y1 }, end: { x, y: y2 }, thickness: 0.75, color: rgb(0.3, 0.3, 0.3) });
}

function wrapText(text: string, font: PDFFont, fontSize: number, maxWidth: number): string[] {
  if (!text) return [""];
  const words = text.split(" ");
  const lines: string[] = [];
  let currentLine = "";

  for (const word of words) {
    const testLine = currentLine ? `${currentLine} ${word}` : word;
    const testWidth = font.widthOfTextAtSize(testLine, fontSize);
    if (testWidth > maxWidth && currentLine) {
      lines.push(currentLine);
      currentLine = word;
    } else {
      currentLine = testLine;
    }
  }
  if (currentLine) lines.push(currentLine);
  return lines;
}

export interface AirwayBillData {
  trackingNumber: string;
  orderNumber: string;
  courierName: string;
  bookedAt: string;
  merchantName: string;
  merchantAddress?: string;
  consigneeName: string;
  consigneePhone: string;
  consigneeCity: string;
  consigneeAddress: string;
  codAmount: number;
  weight: number;
  pieces: number;
  itemsSummary?: string;
  shipmentType?: string;
  remarks?: string;
}

// A4: 595.28 x 841.89 points
// 3 bills per page: each bill ~260pt tall with gaps
const A4_WIDTH = 595.28;
const A4_HEIGHT = 841.89;
const BILL_WIDTH = A4_WIDTH - 40; // 20pt margin each side
const BILL_HEIGHT = 255;
const MARGIN_X = 20;
const GAP_Y = 8;

async function drawSingleAirwayBill(
  page: PDFPage,
  pdfDoc: PDFDocument,
  font: PDFFont,
  boldFont: PDFFont,
  data: AirwayBillData,
  startX: number,
  startY: number,
) {
  const x = startX;
  const topY = startY;
  const w = BILL_WIDTH;

  const col1W = Math.floor(w * 0.36);
  const col2W = Math.floor(w * 0.32);
  const col3W = w - col1W - col2W;

  const headerH = 16;
  const mainH = 140;
  const remarksH = 18;
  const productsH = 18;
  const totalH = headerH + mainH + remarksH + productsH;

  const col1X = x;
  const col2X = x + col1W;
  const col3X = x + col1W + col2W;

  drawRect(page, x, topY - totalH, w, totalH, true);

  drawRect(page, col1X, topY - headerH, col1W, headerH);
  drawText(page, boldFont, "Customer Information", col1X + 4, topY - headerH + 4, 8);

  drawRect(page, col2X, topY - headerH, col2W, headerH);
  drawText(page, boldFont, "Brand Information", col2X + 4, topY - headerH + 4, 8);

  drawRect(page, col3X, topY - headerH, col3W, headerH);
  drawText(page, boldFont, "Parcel Information", col3X + 4, topY - headerH + 4, 8);

  drawVLine(page, col2X, topY - headerH, topY - headerH - mainH);
  drawVLine(page, col3X, topY - headerH, topY - headerH - mainH);

  const mainTopY = topY - headerH;

  // === COLUMN 1: Customer Information ===
  let cy = mainTopY - 14;
  drawText(page, boldFont, "Name: ", col1X + 4, cy, 7.5);
  drawText(page, font, truncate(data.consigneeName, 28), col1X + 35, cy, 7.5);

  cy -= 12;
  drawText(page, boldFont, "Phone: ", col1X + 4, cy, 7.5);
  drawText(page, font, data.consigneePhone || "-", col1X + 35, cy, 7.5);

  cy -= 12;
  const addressLines = wrapText(data.consigneeAddress || "-", font, 6.5, col1W - 45);
  drawText(page, boldFont, "Address: ", col1X + 4, cy, 7.5);
  drawText(page, font, addressLines[0] || "-", col1X + 43, cy, 6.5);
  if (addressLines[1]) {
    cy -= 10;
    drawText(page, font, addressLines[1], col1X + 43, cy, 6.5);
  }
  if (addressLines[2]) {
    cy -= 10;
    drawText(page, font, addressLines[2], col1X + 43, cy, 6.5);
  }

  cy -= 16;
  drawHLine(page, col1X, col2X, cy + 6);
  drawText(page, boldFont, "Destination: ", col1X + 4, cy, 7.5);
  drawText(page, font, data.consigneeCity || "-", col1X + 55, cy, 8, rgb(0, 0, 0));

  cy -= 16;
  drawHLine(page, col1X, col2X, cy + 6);
  drawText(page, boldFont, "Order: ", col1X + 4, cy, 7.5);
  drawText(page, font, data.orderNumber || "-", col1X + 35, cy, 8);

  const orderBarcode = await generateBarcode(data.orderNumber?.replace('#', '') || "0", 8, 1);
  if (orderBarcode) {
    try {
      const barcodeImg = await pdfDoc.embedPng(orderBarcode);
      const bw = Math.min(90, col1W - 20);
      const bh = (barcodeImg.height / barcodeImg.width) * bw;
      page.drawImage(barcodeImg, { x: col1X + 8, y: cy - bh - 5, width: bw, height: bh });
    } catch {}
  }

  // === COLUMN 2: Brand Information ===
  let by = mainTopY - 14;
  drawText(page, boldFont, "Shipper: ", col2X + 4, by, 7.5);
  drawText(page, font, truncate(data.merchantName, 22), col2X + 40, by, 7.5);

  by -= 12;
  if (data.merchantAddress) {
    const shipAddrLines = wrapText(data.merchantAddress, font, 6.5, col2W - 60);
    drawText(page, boldFont, "Shipper Address: ", col2X + 4, by, 6.5);
    drawText(page, font, shipAddrLines[0] || "", col2X + 70, by, 6.5);
    if (shipAddrLines[1]) {
      by -= 10;
      drawText(page, font, shipAddrLines[1], col2X + 70, by, 6.5);
    }
  }

  by -= 24;
  drawHLine(page, col2X, col3X, by + 12);
  drawText(page, boldFont, "Amount: ", col2X + 4, by + 2, 8);
  drawText(page, boldFont, `Rs ${data.codAmount.toLocaleString()}`, col2X + 45, by + 2, 12, rgb(0.8, 0.1, 0.1));

  const amountBarcode = await generateBarcode(String(data.codAmount), 8, 1);
  if (amountBarcode) {
    try {
      const barcodeImg = await pdfDoc.embedPng(amountBarcode);
      const bw = Math.min(80, col2W - 20);
      const bh = (barcodeImg.height / barcodeImg.width) * bw;
      page.drawImage(barcodeImg, { x: col2X + 8, y: by - bh - 8, width: bw, height: bh });
    } catch {}
  }

  // === COLUMN 3: Parcel Information ===
  let py = mainTopY - 14;
  drawText(page, boldFont, data.courierName.toUpperCase(), col3X + 4, py, 9);

  py -= 18;
  const trackingBarcode = await generateBarcodeWithText(data.trackingNumber, 10, 2);
  if (trackingBarcode) {
    try {
      const barcodeImg = await pdfDoc.embedPng(trackingBarcode);
      const bw = Math.min(col3W - 12, 150);
      const bh = (barcodeImg.height / barcodeImg.width) * bw;
      page.drawImage(barcodeImg, { x: col3X + 4, y: py - bh, width: bw, height: bh });
      py -= bh + 6;
    } catch {}
  }

  py -= 4;
  drawHLine(page, col3X, x + w, py + 2);
  const serviceMode = data.shipmentType || "Overnight";
  drawText(page, boldFont, "Service: ", col3X + 4, py - 8, 7);
  drawText(page, font, serviceMode, col3X + 40, py - 8, 7);

  const fragileX = col3X + col3W - 55;
  drawText(page, boldFont, "Fragile: ", fragileX, py - 8, 7);
  drawText(page, font, "yes", fragileX + 32, py - 8, 7);

  py -= 22;
  drawHLine(page, col3X, x + w, py + 2);
  drawText(page, boldFont, "Date: ", col3X + 4, py - 8, 7);
  drawText(page, font, data.bookedAt, col3X + 28, py - 8, 7);

  const weightX = col3X + col3W / 2;
  drawText(page, boldFont, "Weight: ", weightX, py - 8, 7);
  drawText(page, font, `${data.weight} (Grams)`, weightX + 32, py - 8, 7);

  py -= 22;
  drawHLine(page, col3X, x + w, py + 2);
  drawText(page, boldFont, "Pieces: ", col3X + 4, py - 8, 7);
  drawText(page, font, String(data.pieces), col3X + 34, py - 8, 7);

  const qtyX = col3X + col3W / 2;
  drawText(page, boldFont, "Qty: ", qtyX, py - 8, 7);
  drawText(page, font, String(data.pieces), qtyX + 22, py - 8, 7);

  // === REMARKS ROW ===
  const remarksY = topY - headerH - mainH;
  drawHLine(page, x, x + w, remarksY);
  drawRect(page, x, remarksY - remarksH, w, remarksH, true);
  drawText(page, boldFont, "Remarks: ", x + 4, remarksY - 12, 7);
  const remarksText = data.remarks || "Allow Open Parcel - Must Call Before Delivery - Handle With Care";
  drawText(page, font, truncate(remarksText, 110), x + 42, remarksY - 12, 6.5);

  // === PRODUCTS ROW ===
  const productsY = remarksY - remarksH;
  drawRect(page, x, productsY - productsH, w, productsH, true);
  drawText(page, boldFont, "Products: ", x + 4, productsY - 12, 7);
  const productsText = data.itemsSummary ? `[ ${data.itemsSummary} ]` : "[ - ]";
  drawText(page, font, truncate(productsText, 110), x + 45, productsY - 12, 6.5);
}

export async function generateAirwayBillPdf(data: AirwayBillData): Promise<string> {
  ensurePdfDir();

  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const page = pdfDoc.addPage([A4_WIDTH, A4_HEIGHT]);
  await drawSingleAirwayBill(page, pdfDoc, font, boldFont, data, MARGIN_X, A4_HEIGHT - 20);

  const pdfBytes = await pdfDoc.save();
  const filename = `awb_${data.trackingNumber}_${Date.now()}.pdf`;
  const filepath = path.join(PDF_DIR, filename);
  fs.writeFileSync(filepath, pdfBytes);

  return filepath;
}

export async function generateMultiAirwayBillPdf(bills: AirwayBillData[]): Promise<string> {
  ensurePdfDir();

  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const billsPerPage = 3;

  for (let i = 0; i < bills.length; i++) {
    const posOnPage = i % billsPerPage;
    let page: PDFPage;

    if (posOnPage === 0) {
      page = pdfDoc.addPage([A4_WIDTH, A4_HEIGHT]);
    } else {
      page = pdfDoc.getPages()[pdfDoc.getPageCount() - 1];
    }

    const topY = A4_HEIGHT - 20 - posOnPage * (BILL_HEIGHT + GAP_Y);
    await drawSingleAirwayBill(page, pdfDoc, font, boldFont, bills[i], MARGIN_X, topY);
  }

  const pdfBytes = await pdfDoc.save();
  const filename = `awb_batch_${Date.now()}.pdf`;
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

function drawLine(page: PDFPage, y: number, width: number) {
  page.drawLine({
    start: { x: 40, y },
    end: { x: width - 40, y },
    thickness: 0.5,
    color: rgb(0.8, 0.8, 0.8),
  });
}

function drawLabel(page: PDFPage, font: PDFFont, boldFont: PDFFont, label: string, value: string, x: number, y: number, labelSize: number = 8, valueSize: number = 10) {
  drawText(page, font, label, x, y + 12, labelSize, rgb(0.5, 0.5, 0.5));
  drawText(page, boldFont, value || "-", x, y, valueSize);
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
