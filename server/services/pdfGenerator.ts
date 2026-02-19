import {
  PDFDocument,
  StandardFonts,
  rgb,
  PDFFont,
  PDFPage,
  PDFImage,
} from "pdf-lib";
import bwipjs from "bwip-js";
import fs from "fs";
import path from "path";

const PDF_DIR = path.join(process.cwd(), "generated_pdfs");
const LEOPARDS_LOGO_PATH = path.join(
  process.cwd(),
  "attached_assets",
  "imgi_1_LCS-Main-Logo-300x128_1771073319000.png",
);
let leopardsLogoBytes: Buffer | null = null;
try {
  if (fs.existsSync(LEOPARDS_LOGO_PATH)) {
    leopardsLogoBytes = fs.readFileSync(LEOPARDS_LOGO_PATH);
  }
} catch {}

function ensurePdfDir() {
  if (!fs.existsSync(PDF_DIR)) {
    fs.mkdirSync(PDF_DIR, { recursive: true });
  }
}

function truncate(str: string, len: number): string {
  if (!str) return "";
  return str.length > len ? str.substring(0, len - 3) + "..." : str;
}

async function generateBarcodePng(
  text: string,
  bcid: string = "code128",
  height: number = 12,
  scale: number = 2,
  includeText: boolean = false,
): Promise<Buffer | null> {
  try {
    const safeText = text.replace(/[^\x20-\x7E]/g, "").trim();
    if (!safeText) return null;
    const png = await bwipjs.toBuffer({
      bcid,
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

function drawTextSafe(
  page: PDFPage,
  font: PDFFont,
  text: string,
  x: number,
  y: number,
  size: number = 10,
  color = rgb(0.1, 0.1, 0.1),
) {
  try {
    const safeText = (text || "").replace(/[^\x20-\x7E\xA0-\xFF]/g, " ");
    page.drawText(safeText, { x, y, size, font, color });
  } catch {}
}

function drawBox(
  page: PDFPage,
  x: number,
  y: number,
  w: number,
  h: number,
  opts?: { fill?: boolean; borderWidth?: number },
) {
  const borderWidth = opts?.borderWidth ?? 0.75;
  if (opts?.fill) {
    page.drawRectangle({
      x,
      y,
      width: w,
      height: h,
      color: rgb(0.94, 0.94, 0.96),
      borderColor: rgb(0.25, 0.25, 0.25),
      borderWidth,
    });
  } else {
    page.drawRectangle({
      x,
      y,
      width: w,
      height: h,
      borderColor: rgb(0.25, 0.25, 0.25),
      borderWidth,
    });
  }
}

function drawHLine(
  page: PDFPage,
  x1: number,
  x2: number,
  y: number,
  thickness: number = 0.5,
) {
  page.drawLine({
    start: { x: x1, y },
    end: { x: x2, y },
    thickness,
    color: rgb(0.3, 0.3, 0.3),
  });
}

function drawVLine(
  page: PDFPage,
  x: number,
  y1: number,
  y2: number,
  thickness: number = 0.5,
) {
  page.drawLine({
    start: { x, y: y1 },
    end: { x, y: y2 },
    thickness,
    color: rgb(0.3, 0.3, 0.3),
  });
}

function wrapText(
  text: string,
  font: PDFFont,
  fontSize: number,
  maxWidth: number,
  maxLines: number = 10,
): string[] {
  if (!text) return [""];
  if (maxWidth <= 0) maxWidth = 50;
  const safeText = text.replace(/[^\x20-\x7E\xA0-\xFF]/g, " ");
  const words = safeText.split(/\s+/).filter((w) => w.length > 0);
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
        lines[lines.length - 1] = truncate(
          lines[lines.length - 1],
          lines[lines.length - 1].length,
        );
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
  merchantCity?: string;
  merchantPhone?: string;
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
const BILL_HEIGHT = 267;
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
  const pad = 5;
  const labelSize = 7;
  const valueSize = 7.5;
  const lineSpacing = 10;

  const topBannerH = 18;
  const colHeaderH = 14;
  const bodyH = 185;
  const remarksH = 22;
  const productsH = 28;
  const totalH = topBannerH + colHeaderH + bodyH + remarksH + productsH;
  const bottomY = topY - totalH;

  const col1W = w * 0.38;
  const col2W = w * 0.32;
  const col3W = w - col1W - col2W;
  const col1X = x;
  const col2X = x + col1W;
  const col3X = x + col1W + col2W;

  page.drawRectangle({ x, y: bottomY, width: w, height: totalH, borderColor: BLACK, borderWidth: 1.2 });

  // === TOP BANNER: OVERNIGHT (COD PARCEL) Handle with care ===
  const bannerTopY = topY;
  const bannerBottomY = topY - topBannerH;
  page.drawRectangle({ x, y: bannerBottomY, width: w, height: topBannerH, color: rgb(0.95, 0.95, 0.95), borderColor: BLACK, borderWidth: 0.5 });

  if (leopardsLogoBytes && data.courierName.toLowerCase().includes("leopard")) {
    try {
      const logoImg = await pdfDoc.embedPng(leopardsLogoBytes);
      const logoAspect = logoImg.width / logoImg.height;
      const logoH = topBannerH - 4;
      const logoW = logoH * logoAspect;
      page.drawImage(logoImg, { x: x + pad, y: bannerBottomY + 2, width: logoW, height: logoH });
    } catch {}
  }

  drawTextSafe(page, boldFont, "OVERNIGHT", x + 80, bannerBottomY + 5, 11, BLACK);
  const codLabel = data.codAmount > 0 ? "(COD PARCEL)" : "(PREPAID)";
  drawTextSafe(page, boldFont, codLabel, x + 155, bannerBottomY + 5, 9, RED);
  drawTextSafe(page, font, "Handle with care", x + 240, bannerBottomY + 5, 8, GRAY);

  // === COLUMN HEADERS ===
  const colHeaderTopY = bannerBottomY;
  const colHeaderBottomY = colHeaderTopY - colHeaderH;
  page.drawLine({ start: { x, y: colHeaderBottomY }, end: { x: x + w, y: colHeaderBottomY }, thickness: 1, color: BLACK });
  drawVLine(page, col2X, colHeaderTopY, colHeaderBottomY, 1);
  drawVLine(page, col3X, colHeaderTopY, colHeaderBottomY, 1);

  const chY = colHeaderTopY - 10;
  drawTextSafe(page, boldFont, "Consignee / Shipper Information", col1X + pad, chY, 7, BLACK);
  drawTextSafe(page, boldFont, "Consignment Information", col2X + pad, chY, 7, BLACK);
  drawTextSafe(page, boldFont, "Shipment Information", col3X + pad, chY, 7, BLACK);

  // === BODY AREA ===
  const bodyTopY = colHeaderBottomY;
  const bodyBottomY = bodyTopY - bodyH;
  drawVLine(page, col2X, bodyTopY, bodyBottomY, 1);
  drawVLine(page, col3X, bodyTopY, bodyBottomY, 1);

  // === COLUMN 1: CONSIGNEE + SHIPPER ===
  let cy = bodyTopY - 3;

  drawTextSafe(page, boldFont, "Consignee Information", col1X + pad, cy - 8, 7.5, BLACK);
  cy -= 18;

  drawTextSafe(page, boldFont, "Name :", col1X + pad, cy, labelSize, GRAY);
  drawTextSafe(page, boldFont, truncate(data.consigneeName, 35), col1X + pad + 45, cy, valueSize, BLACK);
  cy -= lineSpacing;

  drawTextSafe(page, boldFont, "Address :", col1X + pad, cy, labelSize, GRAY);
  cy -= 2;
  const consAddrLines = wrapText(data.consigneeAddress || "", font, valueSize, col1W - pad * 2 - 45, 3);
  for (const l of consAddrLines) {
    drawTextSafe(page, font, l, col1X + pad + 45, cy, valueSize, BLACK);
    cy -= lineSpacing;
  }

  drawTextSafe(page, boldFont, "Contact # :", col1X + pad, cy, labelSize, GRAY);
  drawTextSafe(page, font, data.consigneePhone || "", col1X + pad + 45, cy, valueSize, BLACK);
  cy -= lineSpacing + 4;

  // Shipper / Business Info separator
  drawHLine(page, col1X, col2X, cy + 6, 0.5);

  drawTextSafe(page, boldFont, "Business Information", col1X + pad, cy - 2, 7.5, BLACK);
  cy -= 14;

  drawTextSafe(page, boldFont, "Address :", col1X + pad, cy, labelSize, GRAY);
  cy -= 2;
  const shipAddrLines = wrapText(data.merchantAddress || "", font, valueSize, col1W - pad * 2 - 10, 3);
  for (const l of shipAddrLines) {
    drawTextSafe(page, font, l, col1X + pad + 45, cy, valueSize, BLACK);
    cy -= lineSpacing;
  }
  cy -= 4;
  drawHLine(page, col1X, col2X, cy + 6, 0.5);

  drawTextSafe(page, boldFont, "Shipper / Return Information", col1X + pad, cy - 2, 7.5, BLACK);
  cy -= 14;

  drawTextSafe(page, boldFont, "AC / Name :", col1X + pad, cy, labelSize, GRAY);
  drawTextSafe(page, font, truncate(data.merchantName, 30), col1X + pad + 45, cy, valueSize, BLACK);
  cy -= lineSpacing;

  drawTextSafe(page, boldFont, "Address :", col1X + pad, cy, labelSize, GRAY);
  cy -= 2;
  const retAddrLines = wrapText(data.merchantAddress || "", font, valueSize, col1W - pad * 2 - 45, 2);
  for (const l of retAddrLines) {
    drawTextSafe(page, font, l, col1X + pad + 45, cy, valueSize, BLACK);
    cy -= lineSpacing;
  }

  drawTextSafe(page, boldFont, "Contact # :", col1X + pad, cy, labelSize, GRAY);
  drawTextSafe(page, font, data.merchantPhone || "-", col1X + pad + 45, cy, valueSize, BLACK);

  // === COLUMN 2: CONSIGNMENT INFO ===
  let c2y = bodyTopY - 5;

  // Tracking barcode with spaced characters
  const trackBarcode = await generateBarcodePng(data.trackingNumber, "code128", 14, 2);
  if (trackBarcode) {
    try {
      const img = await pdfDoc.embedPng(trackBarcode);
      const bcW = col2W - 20;
      page.drawImage(img, { x: col2X + 10, y: c2y - 35, width: bcW, height: 30 });
      c2y -= 35;
    } catch { c2y -= 10; }
  }

  const safeTN = data.trackingNumber || "";
  const spacedTN = safeTN.split("").join(" ");
  const tnFontSize = 8;
  try {
    const tnW = boldFont.widthOfTextAtSize(spacedTN, tnFontSize);
    drawTextSafe(page, boldFont, spacedTN, col2X + (col2W - tnW) / 2, c2y - 12, tnFontSize, BLACK);
  } catch {
    drawTextSafe(page, boldFont, spacedTN, col2X + pad, c2y - 12, tnFontSize, BLACK);
  }
  c2y -= 22;

  drawHLine(page, col2X, col3X, c2y, 0.5);
  c2y -= 12;

  drawTextSafe(page, boldFont, "Tracking No:", col2X + pad, c2y, labelSize, GRAY);
  drawTextSafe(page, font, data.trackingNumber, col2X + pad + 55, c2y, valueSize, BLACK);
  c2y -= lineSpacing + 2;

  drawTextSafe(page, boldFont, "Destination :", col2X + pad, c2y, labelSize, GRAY);
  drawTextSafe(page, boldFont, data.consigneeCity.toUpperCase(), col2X + pad + 55, c2y, 9, BLACK);
  c2y -= lineSpacing + 2;

  const piecesText = `${data.pieces} PCS (1/${data.pieces})`;
  drawTextSafe(page, boldFont, "Pieces :", col2X + pad, c2y, labelSize, GRAY);
  drawTextSafe(page, font, piecesText, col2X + pad + 55, c2y, valueSize, BLACK);
  c2y -= lineSpacing + 2;

  const weightText = `${data.weight} (Grams)`;
  drawTextSafe(page, boldFont, "Weight :", col2X + pad, c2y, labelSize, GRAY);
  drawTextSafe(page, font, weightText, col2X + pad + 55, c2y, valueSize, BLACK);
  c2y -= lineSpacing + 6;

  // COD Amount section
  drawHLine(page, col2X, col3X, c2y + 4, 0.5);
  const safeCodAmount = typeof data.codAmount === "number" && !isNaN(data.codAmount) ? data.codAmount : 0;
  drawTextSafe(page, boldFont, "COD Amount :", col2X + pad, c2y - 8, 8, GRAY);
  c2y -= 12;

  const codAmountStr = `PKR ${safeCodAmount.toLocaleString("en-PK", { minimumFractionDigits: 2 })}`;
  try {
    const codW = boldFont.widthOfTextAtSize(codAmountStr, 12);
    drawTextSafe(page, boldFont, codAmountStr, col2X + (col2W - codW) / 2, c2y - 8, 12, BLACK);
  } catch {
    drawTextSafe(page, boldFont, codAmountStr, col2X + pad, c2y - 8, 12, BLACK);
  }
  c2y -= 22;

  const codBarcode = await generateBarcodePng(String(Math.round(safeCodAmount)), "code128", 10, 2);
  if (codBarcode) {
    try {
      const img = await pdfDoc.embedPng(codBarcode);
      const bcW = col2W - 30;
      page.drawImage(img, { x: col2X + 15, y: c2y - 20, width: bcW, height: 18 });
    } catch {}
  }

  // === COLUMN 3: SHIPMENT INFO ===
  let c3y = bodyTopY - 12;

  drawTextSafe(page, boldFont, "Order ID :", col3X + pad, c3y, labelSize, GRAY);
  drawTextSafe(page, boldFont, data.orderNumber, col3X + pad + 55, c3y, 9, BLACK);
  c3y -= lineSpacing + 4;

  // Order barcode
  const orderBarcode = await generateBarcodePng(data.orderNumber, "code128", 10, 2, false);
  if (orderBarcode) {
    try {
      const img = await pdfDoc.embedPng(orderBarcode);
      page.drawImage(img, { x: col3X + pad, y: c3y - 18, width: col3W - pad * 2, height: 18 });
      c3y -= 22;
    } catch { c3y -= 5; }
  }

  drawHLine(page, col3X, x + w, c3y, 0.5);
  c3y -= 12;

  drawTextSafe(page, boldFont, "Origin :", col3X + pad, c3y, labelSize, GRAY);
  drawTextSafe(page, font, (data.merchantCity || "").toUpperCase() || "-", col3X + pad + 55, c3y, valueSize, BLACK);
  c3y -= lineSpacing + 2;

  drawTextSafe(page, boldFont, "Booking Date :", col3X + pad, c3y, labelSize, GRAY);
  drawTextSafe(page, font, data.bookedAt, col3X + pad + 55, c3y, valueSize, BLACK);
  c3y -= lineSpacing + 6;

  drawHLine(page, col3X, x + w, c3y + 4, 0.5);

  // QR code for tracking
  const trackQr = await generateBarcodePng(data.trackingNumber, "qrcode", 20, 2);
  if (trackQr) {
    try {
      const img = await pdfDoc.embedPng(trackQr);
      page.drawImage(img, { x: col3X + (col3W - 45) / 2, y: c3y - 50, width: 45, height: 45 });
    } catch {}
  }

  // === REMARKS ROW ===
  const remarksTopY = bodyBottomY;
  page.drawLine({ start: { x, y: remarksTopY }, end: { x: x + w, y: remarksTopY }, thickness: 1, color: BLACK });
  drawTextSafe(page, boldFont, "Remarks :-", x + pad, remarksTopY - 14, 8, BLACK);
  const remarksText = data.remarks || "";
  drawTextSafe(page, font, truncate(remarksText, 90), x + pad + 50, remarksTopY - 14, 7.5, BLACK);

  // === PRODUCTS ROW ===
  const productsTopY = remarksTopY - remarksH;
  page.drawLine({ start: { x, y: productsTopY }, end: { x: x + w, y: productsTopY }, thickness: 0.5, color: BLACK });
  drawTextSafe(page, boldFont, "Products:", x + pad, productsTopY - 12, 8, BLACK);
  const prodLines = wrapText(data.itemsSummary || "", font, 7, w - pad * 2 - 50, 2);
  let prodY = productsTopY - 12;
  for (const l of prodLines) {
    drawTextSafe(page, font, `[ ${l} ]`, x + pad + 50, prodY, 7, BLACK);
    prodY -= 10;
  }
}

export async function generateAirwayBillPdfBuffer(
  bills: AirwayBillData[],
): Promise<Buffer> {
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
    await drawSingleAirwayBill(
      page,
      pdfDoc,
      font,
      boldFont,
      bills[i],
      MARGIN_X,
      topY,
    );
  }

  const pdfBytes = await pdfDoc.save();
  return Buffer.from(pdfBytes);
}

export async function generateAirwayBillPdf(
  data: AirwayBillData,
): Promise<string> {
  ensurePdfDir();

  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const page = pdfDoc.addPage([A4_WIDTH, A4_HEIGHT]);
  await drawSingleAirwayBill(
    page,
    pdfDoc,
    font,
    boldFont,
    data,
    MARGIN_X,
    A4_HEIGHT - MARGIN_TOP,
  );

  const pdfBytes = await pdfDoc.save();
  const filename = `awb_${data.trackingNumber}_${Date.now()}.pdf`;
  const filepath = path.join(PDF_DIR, filename);
  fs.writeFileSync(filepath, pdfBytes);

  return filepath;
}

export async function generateMultiAirwayBillPdf(
  bills: AirwayBillData[],
): Promise<string> {
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
    await drawSingleAirwayBill(
      page,
      pdfDoc,
      font,
      boldFont,
      bills[i],
      MARGIN_X,
      topY,
    );
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

function drawLabel(
  page: PDFPage,
  font: PDFFont,
  boldFont: PDFFont,
  label: string,
  value: string,
  x: number,
  y: number,
  labelSize: number = 8,
  valueSize: number = 10,
) {
  drawTextSafe(page, font, label, x, y + 12, labelSize, rgb(0.5, 0.5, 0.5));
  drawTextSafe(page, boldFont, value || "-", x, y, valueSize);
}

export async function generateBatchLoadsheetPdf(
  data: BatchLoadsheetData,
): Promise<string> {
  ensurePdfDir();

  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const pageWidth = 595.28;
  const pageHeight = 841.89;

  let page = pdfDoc.addPage([pageWidth, pageHeight]);
  let y = pageHeight - 60;
  const left = 40;

  // =========================
  // CENTERED TITLE
  // =========================
  const title = "Loadsheet";
  const titleSize = 18;
  const titleWidth = boldFont.widthOfTextAtSize(title, titleSize);
  const centerTitleX = (pageWidth - titleWidth) / 2;

  // =========================
  // CENTERED DATE
  // =========================
  function formatDate(dateString: string) {
    const date = new Date(dateString);

    const day = String(date.getDate()).padStart(2, "0");
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const year = date.getFullYear();

    let hours = date.getHours();
    const minutes = String(date.getMinutes()).padStart(2, "0");

    const ampm = hours >= 12 ? "PM" : "AM";
    hours = hours % 12 || 12;

    const formattedHours = String(hours).padStart(2, "0");

    return `${day}-${month}-${year} ${formattedHours}:${minutes} ${ampm}`;
  }
  function formatDate2(dateString: string) {
    const date = new Date(dateString);

    const day = String(date.getDate()).padStart(2, "0");
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const year = date.getFullYear();

    return `${day}-${month}-${year}`;
  }

  drawTextSafe(page, boldFont, title, centerTitleX, y, titleSize - 2);

  const fontSize = 10;
  const label = "Date: ";
  const value = formatDate(data.createdAt);

  const labelWidth = boldFont.widthOfTextAtSize(label, fontSize);
  const valueWidth = font.widthOfTextAtSize(value, fontSize);
  const totalWidth = labelWidth + valueWidth;
  const centerX = (pageWidth - totalWidth) / 2;

  drawTextSafe(page, font, value, centerX + labelWidth, y - 20, fontSize);
  drawTextSafe(page, boldFont, label, centerX, y - 20, fontSize);

  y -= 25;

  y -= 35;

  // =========================
  // SUMMARY
  // =========================

  // =========================
  // 3 COLUMN SUMMARY SECTION
  // =========================

  const items = Array.isArray(data.items) ? data.items : [];

  const totalAmount = items.reduce(
    (sum, i) => sum + (Number(i.codAmount) || 0),
    0,
  );

  // Define evenly spaced columns
  const usableWidth = pageWidth - left * 2;
  const colWidth = usableWidth / 3;

  const col1X = left;
  const col2X = left + colWidth;
  const col3X = left + colWidth * 2;

  const lineGap = 18;
  const underline1 = "___________________";

  // Row 1
  drawTextSafe(
    page,
    boldFont,
    `Courier Name: ${data.courierName ?? "-"}`,
    col1X,
    y,
    9,
  );
  drawTextSafe(page, boldFont, `Brand Name: ${underline1}`, col2X, y, 8);
  drawTextSafe(page, boldFont, `Rider Name: ${underline1}`, col3X, y, 8);
  y -= lineGap;

  // Row 2
  drawTextSafe(page, boldFont, `Total Shipments: ${items.length}`, col1X, y, 8);
  drawTextSafe(page, boldFont, `Brand Phone: ${underline1}`, col2X, y, 8);
  drawTextSafe(page, boldFont, `Rider Phone: ${underline1}`, col3X, y, 8);
  y -= lineGap;

  // Row 3
  drawTextSafe(
    page,
    boldFont,
    `Orders Total: Rs ${totalAmount.toLocaleString()}`,
    col1X,
    y,
    8,
  );
  y -= lineGap;
  drawTextSafe(page, boldFont, `Brand Signature: ${underline1}`, col2X, y, 8);
  drawTextSafe(page, boldFont, `Rider Signature: ${underline1}`, col3X, y, 8);

  // Row 4 (only first column has content)
  drawTextSafe(
    page,
    boldFont,
    `Orders COD: Rs ${totalAmount.toLocaleString()}`,
    col1X,
    y,
    8,
  );
  y += lineGap;

  y -= 40;

  // =========================
  // TABLE SETUP
  // =========================
  const headers = [
    "",
    "Booked",
    "Name",
    "Order #",
    "Amount",
    "COD",
    "Weight",
    "City",
    "Tracking",
  ];

  const rowHeight = 20;
  const borderWidth = 0.7;
  const borderColor = rgb(0, 0, 0);

  const colXs = [
    left,
    55, // Booked
    190, // Name
    130, // Order #
    270, // Amount
    330, // COD
    380, // Weight
    430, // City
    490, // Tracking (start earlier)
    pageWidth - 40,
  ];

  const tableWidth = pageWidth - left - 40;

  // =========================
  // HEADER ROW
  // =========================
  page.drawRectangle({
    x: left,
    y: y - rowHeight,
    width: tableWidth,
    height: rowHeight,
    borderColor,
    borderWidth,
  });

  colXs.forEach((xPos) => {
    page.drawLine({
      start: { x: xPos, y: y - rowHeight },
      end: { x: xPos, y: y },
      thickness: borderWidth,
      color: borderColor,
    });
  });

  headers.forEach((h, i) => {
    drawTextSafe(page, boldFont, h, colXs[i] + 4, y - 14, 9);
  });

  y -= rowHeight;

  // =========================
  // DATA ROWS
  // =========================
  for (let i = 0; i < data.items.length; i++) {
    const item = data.items[i];

    page.drawRectangle({
      x: left,
      y: y - rowHeight,
      width: tableWidth,
      height: rowHeight,
      borderColor,
      borderWidth,
    });

    colXs.forEach((xPos) => {
      page.drawLine({
        start: { x: xPos, y: y - rowHeight },
        end: { x: xPos, y: y },
        thickness: borderWidth,
        color: borderColor,
      });
    });

    drawTextSafe(page, font, String(i + 1), colXs[0] + 4, y - 14, 8);
    drawTextSafe(
      page,
      font,
      formatDate2(data.createdAt),
      colXs[1] + 4,
      y - 14,
      8,
    );
    drawTextSafe(
      page,
      font,
      truncate(item.consigneeName, 18),
      colXs[2] + 4,
      y - 14,
      8,
    );
    const cleanOrderNumber = item.orderNumber?.startsWith("#")
      ? item.orderNumber.slice(1)
      : item.orderNumber;

    drawTextSafe(page, font, cleanOrderNumber, colXs[3] + 4, y - 14, 8);
    drawTextSafe(page, font, `Rs ${item.codAmount}`, colXs[4] + 4, y - 14, 8);
    drawTextSafe(page, font, `Rs ${item.codAmount}`, colXs[5] + 4, y - 14, 8);
    drawTextSafe(page, font, "100", colXs[6] + 4, y - 14, 8);
    drawTextSafe(page, font, item.consigneeCity, colXs[7] + 4, y - 14, 8);
    drawTextSafe(
      page,
      font,
      item.trackingNumber || "-",
      colXs[8] + 4,
      y - 14,
      8,
    );

    y -= rowHeight;

    if (y < 60) {
      page = pdfDoc.addPage([pageWidth, pageHeight]);
      y = pageHeight - 60;
    }
  }

  const pdfBytes = await pdfDoc.save();
  const filename = `loadsheet_${Date.now()}.pdf`;
  const filepath = path.join(PDF_DIR, filename);
  fs.writeFileSync(filepath, pdfBytes);

  return filepath;
}

export function getPdfPath(filepath: string): string | null {
  if (!filepath) return null;
  if (fs.existsSync(filepath)) return filepath;
  return null;
}
