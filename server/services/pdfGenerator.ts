import { PDFDocument, StandardFonts, rgb, PDFFont, PDFPage, PDFImage } from "pdf-lib";
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

async function generateBarcodePng(text: string, height: number = 12, scale: number = 2, includeText: boolean = false): Promise<Buffer | null> {
  try {
    const safeText = text.replace(/[^\x20-\x7E]/g, "").trim();
    if (!safeText) return null;
    const png = await bwipjs.toBuffer({
      bcid: "code128",
      text: safeText,
      scale,
      height,
      includetext: includeText,
      textxalign: "center",
      textsize: 9,
    });
    return png;
  } catch (err) {
    console.error("[PDF] Barcode generation failed for:", text, err);
    return null;
  }
}

function drawTextSafe(page: PDFPage, font: PDFFont, text: string, x: number, y: number, size: number = 10, color = rgb(0.1, 0.1, 0.1)) {
  try {
    const safeText = (text || "").replace(/[^\x20-\x7E\xA0-\xFF]/g, " ");
    page.drawText(safeText, { x, y, size, font, color });
  } catch {}
}

function drawBox(page: PDFPage, x: number, y: number, w: number, h: number, opts?: { fill?: boolean; borderWidth?: number }) {
  const borderWidth = opts?.borderWidth ?? 0.75;
  if (opts?.fill) {
    page.drawRectangle({
      x, y, width: w, height: h,
      color: rgb(0.94, 0.94, 0.96),
      borderColor: rgb(0.25, 0.25, 0.25),
      borderWidth,
    });
  } else {
    page.drawRectangle({
      x, y, width: w, height: h,
      borderColor: rgb(0.25, 0.25, 0.25),
      borderWidth,
    });
  }
}

function drawHLine(page: PDFPage, x1: number, x2: number, y: number, thickness: number = 0.5) {
  page.drawLine({ start: { x: x1, y }, end: { x: x2, y }, thickness, color: rgb(0.3, 0.3, 0.3) });
}

function drawVLine(page: PDFPage, x: number, y1: number, y2: number, thickness: number = 0.5) {
  page.drawLine({ start: { x, y: y1 }, end: { x, y: y2 }, thickness, color: rgb(0.3, 0.3, 0.3) });
}

function wrapText(text: string, font: PDFFont, fontSize: number, maxWidth: number, maxLines: number = 10): string[] {
  if (!text) return [""];
  const safeText = text.replace(/[^\x20-\x7E\xA0-\xFF]/g, " ");
  const words = safeText.split(/\s+/).filter(w => w.length > 0);
  const lines: string[] = [];
  let currentLine = "";

  for (const word of words) {
    const testLine = currentLine ? `${currentLine} ${word}` : word;
    let testWidth: number;
    try {
      testWidth = font.widthOfTextAtSize(testLine, fontSize);
    } catch {
      testWidth = testLine.length * fontSize * 0.5;
    }
    if (testWidth > maxWidth && currentLine) {
      lines.push(currentLine);
      if (lines.length >= maxLines) {
        lines[lines.length - 1] = truncate(lines[lines.length - 1], lines[lines.length - 1].length);
        return lines;
      }
      currentLine = word;
    } else {
      currentLine = testLine;
    }
  }
  if (currentLine) {
    if (lines.length >= maxLines) {
      lines[lines.length - 1] = lines[lines.length - 1] + "...";
    } else {
      lines.push(currentLine);
    }
  }
  return lines.length > 0 ? lines : [""];
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
  quantity?: number;
}

const A4_WIDTH = 595.28;
const A4_HEIGHT = 841.89;
const MARGIN_X = 18;
const MARGIN_TOP = 16;
const BILL_WIDTH = A4_WIDTH - MARGIN_X * 2;
const BILL_HEIGHT = 260;
const GAP_Y = 6;

const BLACK = rgb(0.05, 0.05, 0.05);
const DARK = rgb(0.15, 0.15, 0.15);
const GRAY = rgb(0.4, 0.4, 0.4);
const LIGHT_GRAY = rgb(0.6, 0.6, 0.6);
const RED = rgb(0.75, 0.1, 0.1);
const HEADER_BG = rgb(0.13, 0.13, 0.2);
const WHITE = rgb(1, 1, 1);

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

  const col1W = Math.round(w * 0.35);
  const col2W = Math.round(w * 0.30);
  const col3W = w - col1W - col2W;

  const headerH = 18;
  const mainH = 150;
  const remarksH = 20;
  const productsH = 30;
  const totalH = headerH + mainH + remarksH + productsH;
  const bottomY = topY - totalH;

  const col1X = x;
  const col2X = x + col1W;
  const col3X = x + col1W + col2W;

  const pad = 6;
  const lineH = 11;
  const labelFS = 7;
  const valueFS = 8;
  const smallFS = 6.5;

  drawBox(page, x, bottomY, w, totalH);

  page.drawRectangle({
    x: col1X, y: topY - headerH, width: col1W, height: headerH,
    color: HEADER_BG, borderColor: rgb(0.25, 0.25, 0.25), borderWidth: 0.75,
  });
  drawTextSafe(page, boldFont, "CUSTOMER INFORMATION", col1X + pad, topY - headerH + 5, 7.5, WHITE);

  page.drawRectangle({
    x: col2X, y: topY - headerH, width: col2W, height: headerH,
    color: HEADER_BG, borderColor: rgb(0.25, 0.25, 0.25), borderWidth: 0.75,
  });
  drawTextSafe(page, boldFont, "BRAND INFORMATION", col2X + pad, topY - headerH + 5, 7.5, WHITE);

  page.drawRectangle({
    x: col3X, y: topY - headerH, width: col3W, height: headerH,
    color: HEADER_BG, borderColor: rgb(0.25, 0.25, 0.25), borderWidth: 0.75,
  });
  drawTextSafe(page, boldFont, "PARCEL INFORMATION", col3X + pad, topY - headerH + 5, 7.5, WHITE);

  drawVLine(page, col2X, topY - headerH, topY - headerH - mainH);
  drawVLine(page, col3X, topY - headerH, topY - headerH - mainH);

  const mainTopY = topY - headerH;

  // =====================================================
  // COLUMN 1: Customer Information
  // =====================================================
  let cy = mainTopY - pad - lineH;

  drawTextSafe(page, boldFont, "Name:", col1X + pad, cy, labelFS, GRAY);
  drawTextSafe(page, boldFont, truncate(data.consigneeName, 30), col1X + pad + 32, cy, valueFS, BLACK);

  cy -= lineH + 2;
  drawTextSafe(page, boldFont, "Phone:", col1X + pad, cy, labelFS, GRAY);
  drawTextSafe(page, font, data.consigneePhone || "-", col1X + pad + 32, cy, valueFS, DARK);

  cy -= lineH + 4;
  drawHLine(page, col1X + 2, col2X - 2, cy + 4);

  drawTextSafe(page, boldFont, "Address:", col1X + pad, cy, labelFS, GRAY);
  cy -= 2;
  const addrMaxW = col1W - pad * 2 - 2;
  const addrLines = wrapText(data.consigneeAddress || "-", font, smallFS, addrMaxW, 4);
  for (let i = 0; i < Math.min(addrLines.length, 4); i++) {
    drawTextSafe(page, font, addrLines[i], col1X + pad, cy - (i * 9), smallFS, DARK);
  }
  cy -= Math.min(addrLines.length, 4) * 9 + 4;

  drawHLine(page, col1X + 2, col2X - 2, cy + 4);
  drawTextSafe(page, boldFont, "Dest. City:", col1X + pad, cy - 2, labelFS, GRAY);
  drawTextSafe(page, boldFont, (data.consigneeCity || "-").toUpperCase(), col1X + pad + 48, cy - 2, 9, BLACK);

  cy -= lineH + 6;
  drawHLine(page, col1X + 2, col2X - 2, cy + 4);
  drawTextSafe(page, boldFont, "Order #:", col1X + pad, cy - 2, labelFS, GRAY);
  drawTextSafe(page, boldFont, data.orderNumber || "-", col1X + pad + 38, cy - 2, valueFS, DARK);

  const orderBarcodeArea = cy - 6;
  const orderBarcodeText = (data.orderNumber || "0").replace(/[^a-zA-Z0-9]/g, "");
  if (orderBarcodeText.length > 0) {
    const orderBarcode = await generateBarcodePng(orderBarcodeText, 8, 1);
    if (orderBarcode) {
      try {
        const barcodeImg = await pdfDoc.embedPng(orderBarcode);
        const bw = Math.min(col1W - pad * 2 - 4, 120);
        const bh = Math.min((barcodeImg.height / barcodeImg.width) * bw, 22);
        page.drawImage(barcodeImg, { x: col1X + pad, y: orderBarcodeArea - bh, width: bw, height: bh });
      } catch {}
    }
  }

  // =====================================================
  // COLUMN 2: Brand Information
  // =====================================================
  let by = mainTopY - pad - lineH;

  drawTextSafe(page, boldFont, "Shipper:", col2X + pad, by, labelFS, GRAY);
  drawTextSafe(page, boldFont, truncate(data.merchantName, 24), col2X + pad + 36, by, valueFS, BLACK);

  by -= lineH + 4;
  drawHLine(page, col2X + 2, col3X - 2, by + 4);

  if (data.merchantAddress) {
    drawTextSafe(page, boldFont, "Address:", col2X + pad, by, labelFS, GRAY);
    by -= 2;
    const shipAddrMaxW = col2W - pad * 2 - 2;
    const shipAddrLines = wrapText(data.merchantAddress, font, smallFS, shipAddrMaxW, 3);
    for (let i = 0; i < Math.min(shipAddrLines.length, 3); i++) {
      drawTextSafe(page, font, shipAddrLines[i], col2X + pad, by - (i * 9), smallFS, DARK);
    }
    by -= Math.min(shipAddrLines.length, 3) * 9 + 4;
  } else {
    by -= 10;
  }

  drawHLine(page, col2X + 2, col3X - 2, by + 4);

  by -= 4;
  drawTextSafe(page, boldFont, "COD Amount:", col2X + pad, by, labelFS, GRAY);
  by -= 4;
  drawTextSafe(page, boldFont, `Rs. ${data.codAmount.toLocaleString()}`, col2X + pad, by - 14, 16, RED);

  const amountBarcodeY = by - 36;
  const amountBarcode = await generateBarcodePng(String(Math.round(data.codAmount)), 8, 1);
  if (amountBarcode) {
    try {
      const barcodeImg = await pdfDoc.embedPng(amountBarcode);
      const bw = Math.min(col2W - pad * 2 - 4, 110);
      const bh = Math.min((barcodeImg.height / barcodeImg.width) * bw, 22);
      page.drawImage(barcodeImg, { x: col2X + pad, y: amountBarcodeY - bh, width: bw, height: bh });
    } catch {}
  }

  // =====================================================
  // COLUMN 3: Parcel Information
  // =====================================================
  let py = mainTopY - pad - 2;

  const courierLabel = data.courierName.toUpperCase();
  drawTextSafe(page, boldFont, courierLabel, col3X + pad, py - 8, 11, BLACK);

  py -= 22;

  const trackingBarcode = await generateBarcodePng(data.trackingNumber, 14, 2, true);
  if (trackingBarcode) {
    try {
      const barcodeImg = await pdfDoc.embedPng(trackingBarcode);
      const bw = Math.min(col3W - pad * 2, 160);
      const bh = Math.min((barcodeImg.height / barcodeImg.width) * bw, 40);
      page.drawImage(barcodeImg, { x: col3X + pad, y: py - bh, width: bw, height: bh });
      py -= bh + 4;
    } catch {}
  } else {
    drawTextSafe(page, boldFont, `TN: ${data.trackingNumber}`, col3X + pad, py - 8, 8, BLACK);
    py -= 14;
  }

  py -= 4;
  drawHLine(page, col3X + 2, x + w - 2, py + 2);

  const infoStartY = py - 4;
  const halfCol = (col3W - pad * 2) / 2;

  drawTextSafe(page, boldFont, "Service:", col3X + pad, infoStartY, labelFS, GRAY);
  drawTextSafe(page, font, data.shipmentType || "Overnight", col3X + pad + 36, infoStartY, valueFS, DARK);

  drawTextSafe(page, boldFont, "Fragile:", col3X + pad + halfCol, infoStartY, labelFS, GRAY);
  drawTextSafe(page, font, "Yes", col3X + pad + halfCol + 32, infoStartY, valueFS, DARK);

  const row2Y = infoStartY - lineH - 2;
  drawHLine(page, col3X + 2, x + w - 2, row2Y + 5);

  drawTextSafe(page, boldFont, "Date:", col3X + pad, row2Y, labelFS, GRAY);
  drawTextSafe(page, font, data.bookedAt, col3X + pad + 24, row2Y, valueFS, DARK);

  drawTextSafe(page, boldFont, "Weight:", col3X + pad + halfCol, row2Y, labelFS, GRAY);
  drawTextSafe(page, font, `${data.weight}g`, col3X + pad + halfCol + 32, row2Y, valueFS, DARK);

  const row3Y = row2Y - lineH - 2;
  drawHLine(page, col3X + 2, x + w - 2, row3Y + 5);

  drawTextSafe(page, boldFont, "Pieces:", col3X + pad, row3Y, labelFS, GRAY);
  drawTextSafe(page, font, String(data.pieces), col3X + pad + 32, row3Y, valueFS, DARK);

  const qty = data.quantity || data.pieces;
  drawTextSafe(page, boldFont, "Qty:", col3X + pad + halfCol, row3Y, labelFS, GRAY);
  drawTextSafe(page, font, String(qty), col3X + pad + halfCol + 20, row3Y, valueFS, DARK);

  // =====================================================
  // REMARKS ROW (full width)
  // =====================================================
  const remarksTopY = topY - headerH - mainH;
  drawHLine(page, x, x + w, remarksTopY, 0.75);

  page.drawRectangle({
    x, y: remarksTopY - remarksH, width: w, height: remarksH,
    color: rgb(0.97, 0.97, 0.98),
    borderColor: rgb(0.25, 0.25, 0.25),
    borderWidth: 0.5,
  });

  drawTextSafe(page, boldFont, "Remarks:", x + pad, remarksTopY - 13, 7, GRAY);
  const remarksText = data.remarks || "Allow Open Parcel  |  Must Call Before Delivery  |  Handle With Care";
  const remarksMaxW = w - pad * 2 - 48;
  const wrappedRemarks = wrapText(remarksText, font, smallFS, remarksMaxW, 2);
  drawTextSafe(page, font, wrappedRemarks[0] || "", x + pad + 44, remarksTopY - 8, smallFS, DARK);
  if (wrappedRemarks[1]) {
    drawTextSafe(page, font, wrappedRemarks[1], x + pad + 44, remarksTopY - 17, smallFS, DARK);
  }

  // =====================================================
  // PRODUCTS ROW (full width)
  // =====================================================
  const productsTopY = remarksTopY - remarksH;

  drawBox(page, x, productsTopY - productsH, w, productsH);

  drawTextSafe(page, boldFont, "Products:", x + pad, productsTopY - 10, 7, GRAY);

  const productsText = data.itemsSummary || "-";
  const productsMaxW = w - pad * 2 - 50;
  const productLines = wrapText(productsText, font, smallFS, productsMaxW, 3);
  for (let i = 0; i < Math.min(productLines.length, 3); i++) {
    drawTextSafe(page, font, productLines[i], x + pad + 46, productsTopY - 10 - (i * 9), smallFS, DARK);
  }
}

export async function generateAirwayBillPdf(data: AirwayBillData): Promise<string> {
  ensurePdfDir();

  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const page = pdfDoc.addPage([A4_WIDTH, A4_HEIGHT]);
  await drawSingleAirwayBill(page, pdfDoc, font, boldFont, data, MARGIN_X, A4_HEIGHT - MARGIN_TOP);

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

    const topY = A4_HEIGHT - MARGIN_TOP - posOnPage * (BILL_HEIGHT + GAP_Y);
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
  drawTextSafe(page, font, label, x, y + 12, labelSize, rgb(0.5, 0.5, 0.5));
  drawTextSafe(page, boldFont, value || "-", x, y, valueSize);
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
  drawTextSafe(page, boldFont, "BATCH LOADSHEET", 35, y + 5, 16, rgb(1, 1, 1));
  drawTextSafe(page, font, `${data.courierName.toUpperCase()} | Batch: ${data.batchId.substring(0, 8)}`, 35, y - 8, 9, rgb(0.7, 0.7, 0.7));

  const statusText = `Total: ${data.totalCount} | Success: ${data.successCount} | Failed: ${data.failedCount}`;
  drawTextSafe(page, boldFont, statusText, pageWidth - 300, y + 2, 10, rgb(1, 1, 1));

  y -= 50;

  drawTextSafe(page, font, `Merchant: ${data.merchantName}`, 35, y, 9, rgb(0.4, 0.4, 0.4));
  drawTextSafe(page, font, `Created: ${data.createdAt}`, 250, y, 9, rgb(0.4, 0.4, 0.4));
  drawTextSafe(page, font, `By: ${data.createdBy}`, 500, y, 9, rgb(0.4, 0.4, 0.4));

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
    drawTextSafe(page, boldFont, header, cols[i], y, 8, rgb(0.3, 0.3, 0.35));
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
        drawTextSafe(page, boldFont, header, cols[i], y, 8, rgb(0.3, 0.3, 0.35));
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
    drawTextSafe(page, font, String(idx + 1), cols[0], y, 8, textColor);
    drawTextSafe(page, font, truncate(item.orderNumber, 15), cols[1], y, 8, textColor);
    drawTextSafe(page, font, item.trackingNumber || "-", cols[2], y, 8, textColor);
    drawTextSafe(page, font, truncate(item.consigneeName, 15), cols[3], y, 8, textColor);
    drawTextSafe(page, font, truncate(item.consigneeCity, 12), cols[4], y, 8, textColor);
    drawTextSafe(page, font, truncate(item.consigneePhone, 14), cols[5], y, 8, textColor);
    drawTextSafe(page, font, item.codAmount ? `${item.codAmount.toLocaleString()}` : "-", cols[6], y, 8, textColor);

    const statusColor = isSuccess ? rgb(0.1, 0.5, 0.2) : rgb(0.8, 0.2, 0.2);
    drawTextSafe(page, boldFont, isSuccess ? "OK" : "FAIL", cols[7], y, 8, statusColor);

    y -= 18;
    rowCount++;

    if (!isSuccess && item.error) {
      drawTextSafe(page, font, `  Error: ${truncate(item.error, 100)}`, cols[1], y, 7, rgb(0.6, 0.3, 0.3));
      y -= 14;
      rowCount++;
    }
  }

  y -= 20;
  drawLine(page, y, pageWidth);
  y -= 15;
  drawTextSafe(page, font, `Generated by ShipFlow | ${new Date().toISOString()}`, 35, y, 7, rgb(0.6, 0.6, 0.6));

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
