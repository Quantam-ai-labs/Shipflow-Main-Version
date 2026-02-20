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

  // Dimensions and Grid Layout
  const headerH = 20;
  const row1H = 120;
  const remarksH = 20;
  const productsH = 40;
  const totalH = headerH + row1H + remarksH + productsH;
  const bottomY = topY - totalH;

  const col1W = w * 0.34;
  const col2W = w * 0.33;
  const col3W = w - col1W - col2W;

  const col1X = x;
  const col2X = x + col1W;
  const col3X = x + col1W + col2W;

  // Draw Main Box Border
  page.drawRectangle({
    x: x,
    y: bottomY,
    width: w,
    height: totalH,
    borderColor: BLACK,
    borderWidth: 1,
  });

  // Vertical Lines
  page.drawLine({
    start: { x: col2X, y: topY },
    end: { x: col2X, y: topY - headerH - row1H },
    thickness: 1,
    color: BLACK,
  });
  page.drawLine({
    start: { x: col3X, y: topY },
    end: { x: col3X, y: topY - headerH - row1H },
    thickness: 1,
    color: BLACK,
  });

  // Horizontal Lines
  const row1TopY = topY - headerH;
  page.drawLine({
    start: { x: x, y: row1TopY },
    end: { x: x + w, y: row1TopY },
    thickness: 1,
    color: BLACK,
  });

  const remarksTopY = row1TopY - row1H;
  page.drawLine({
    start: { x: x, y: remarksTopY },
    end: { x: x + w, y: remarksTopY },
    thickness: 1,
    color: BLACK,
  });

  const productsTopY = remarksTopY - remarksH;
  page.drawLine({
    start: { x: x, y: productsTopY },
    end: { x: x + w, y: productsTopY },
    thickness: 1,
    color: BLACK,
  });

  // --- Headers ---
  const headerTextY = topY - 14;
  drawTextSafe(
    page,
    boldFont,
    "Customer Information",
    col1X + col1W / 2 - 40,
    headerTextY,
    9,
    BLACK,
  );
  drawTextSafe(
    page,
    boldFont,
    "Brand Information",
    col2X + col2W / 2 - 35,
    headerTextY,
    9,
    BLACK,
  );
  drawTextSafe(
    page,
    boldFont,
    "Parcel Information",
    col3X + col3W / 2 - 35,
    headerTextY,
    9,
    BLACK,
  );

  // --- Column 1: Customer Information ---
  let c1y = row1TopY - 12;
  const pad = 5;
  const labelSize = 8;
  const valueSize = 8;

  // Name
  drawTextSafe(page, boldFont, "Name:", col1X + pad, c1y, labelSize, BLACK);
  drawTextSafe(
    page,
    font,
    truncate(data.consigneeName, 30),
    col1X + pad + 30,
    c1y,
    valueSize,
    BLACK,
  );

  // Phone
  c1y -= 12;
  drawTextSafe(page, boldFont, "Phone:", col1X + pad, c1y, labelSize, BLACK);
  drawTextSafe(
    page,
    font,
    data.consigneePhone,
    col1X + pad + 30,
    c1y,
    valueSize,
    BLACK,
  );

  // Address
  c1y -= 12;
  drawTextSafe(page, boldFont, "Address:", col1X + pad, c1y, labelSize, BLACK);
  const addrLines = wrapText(
    data.consigneeAddress || "",
    font,
    valueSize,
    col1W - pad * 2 - 5,
    3,
  );
  for (let l of addrLines) {
    c1y -= 10;
    drawTextSafe(page, font, l, col1X + pad, c1y, valueSize, BLACK);
  }

  // Destination (Boxed)
  c1y -= 15;
  page.drawLine({
    start: { x: col1X, y: c1y + 10 },
    end: { x: col2X, y: c1y + 10 },
    thickness: 0.5,
    color: BLACK,
  });
  drawTextSafe(
    page,
    boldFont,
    "Destination:",
    col1X + pad,
    c1y,
    labelSize,
    BLACK,
  );
  drawTextSafe(
    page,
    font,
    data.consigneeCity,
    col1X + pad + 50,
    c1y,
    valueSize,
    BLACK,
  );

  // Order Info
  c1y -= 15;
  page.drawLine({
    start: { x: col1X, y: c1y + 10 },
    end: { x: col2X, y: c1y + 10 },
    thickness: 0.5,
    color: BLACK,
  });
  drawTextSafe(page, boldFont, "Order:", col1X + pad, c1y, labelSize, BLACK);
  drawTextSafe(
    page,
    font,
    data.orderNumber,
    col1X + pad + 30,
    c1y,
    valueSize,
    BLACK,
  );

  // Order Barcode & QR Code
  const orderBarcodeY = c1y - 30;
  const orderBarcode = await generateBarcodePng(
    data.orderNumber,
    "code128",
    10,
    2,
    false,
  );
  if (orderBarcode) {
    try {
      const img = await pdfDoc.embedPng(orderBarcode);
      page.drawImage(img, {
        x: col1X + pad,
        y: orderBarcodeY,
        width: 90,
        height: 20,
      });
    } catch {}
  }

  // QR Code for Order (Alignment right)
  const qrCodeImg = await generateBarcodePng(data.orderNumber, "qrcode", 20, 2);
  if (qrCodeImg) {
    try {
      const img = await pdfDoc.embedPng(qrCodeImg);
      page.drawImage(img, {
        x: col2X - 35,
        y: orderBarcodeY,
        width: 30,
        height: 30,
      });
    } catch {}
  }

  // --- Column 2: Brand Information ---
  let c2y = row1TopY - 12;

  // Shipper
  drawTextSafe(page, boldFont, "Shipper:", col2X + pad, c2y, labelSize, BLACK);
  drawTextSafe(
    page,
    font,
    truncate(data.merchantName, 25),
    col2X + pad + 40,
    c2y,
    valueSize,
    BLACK,
  );
  c2y -= 12;

  // Shipper Address
  drawTextSafe(
    page,
    boldFont,
    "Shipper Address:",
    col2X + pad,
    c2y,
    labelSize,
    BLACK,
  );
  const shipAddrLines = wrapText(
    data.merchantAddress || "",
    font,
    valueSize,
    col2W - pad * 2,
    2,
  );
  for (let l of shipAddrLines) {
    c2y -= 10;
    drawTextSafe(page, font, l, col2X + pad, c2y, valueSize, BLACK);
  }

  // Amount Section (Boxed)
  const amountBoxTop = row1TopY - 50;
  page.drawLine({
    start: { x: col2X, y: amountBoxTop },
    end: { x: col3X, y: amountBoxTop },
    thickness: 0.5,
    color: BLACK,
  });

  const amountY = amountBoxTop - 25;
  const amountText = `Amount: Rs ${data.codAmount}`;
  const amountWidth = boldFont.widthOfTextAtSize(amountText, 14);
  drawTextSafe(
    page,
    boldFont,
    amountText,
    col2X + (col2W - amountWidth) / 2,
    amountY,
    14,
    BLACK,
  );

  // Amount Barcode
  const amountBarcodeY = amountY - 35;
  const amountBarcode = await generateBarcodePng(
    String(Math.round(data.codAmount)),
    "code128",
    10,
    2,
  );
  if (amountBarcode) {
    try {
      const img = await pdfDoc.embedPng(amountBarcode);
      const bcWidth = 100;
      page.drawImage(img, {
        x: col2X + (col2W - bcWidth) / 2,
        y: amountBarcodeY,
        width: bcWidth,
        height: 25,
      });
    } catch {}
  }

  // --- Column 3: Parcel Information ---
  let c3y = row1TopY - 5;

  if (leopardsLogoBytes && data.courierName.toLowerCase().includes("leopard")) {
    try {
      const logoImg = await pdfDoc.embedPng(leopardsLogoBytes);
      const logoAspect = logoImg.width / logoImg.height;
      const logoW = Math.min(col3W - 20, 70);
      const logoH = logoW / logoAspect;
      page.drawImage(logoImg, {
        x: col3X + (col3W - logoW) / 2 - 10,
        y: c3y - logoH - 2,
        width: logoW,
        height: logoH,
      });
    } catch {
      drawTextSafe(
        page,
        boldFont,
        data.courierName,
        col3X + 15,
        c3y - 20,
        16,
        rgb(0, 0, 0),
      );
    }
  } else {
    drawTextSafe(
      page,
      boldFont,
      data.courierName,
      col3X + 15,
      c3y - 20,
      16,
      rgb(0, 0, 0),
    );
  }

  // Tracking QR
  const trackQrY = c3y - 35;
  const trackQr = await generateBarcodePng(
    data.trackingNumber,
    "qrcode",
    20,
    2,
  );
  if (trackQr) {
    try {
      const img = await pdfDoc.embedPng(trackQr);
      page.drawImage(img, {
        x: col3X + col3W - 40,
        y: trackQrY,
        width: 35,
        height: 35,
      });
    } catch {}
  }

  // Tracking Barcode (Big)
  const trackBarcodeY = trackQrY - 35;
  page.drawLine({
    start: { x: col3X, y: trackQrY - 5 },
    end: { x: x + w, y: trackQrY - 5 },
    thickness: 0.5,
    color: BLACK,
  });

  const trackBarcode = await generateBarcodePng(
    data.trackingNumber,
    "code128",
    14,
    2,
  );
  if (trackBarcode) {
    try {
      const img = await pdfDoc.embedPng(trackBarcode);
      const bcWidth = col3W - 20;
      page.drawImage(img, {
        x: col3X + 10,
        y: trackBarcodeY,
        width: bcWidth,
        height: 30,
      });
    } catch {}
  }

  // Tracking Number Text
  const tnText = data.trackingNumber;
  const tnWidth = font.widthOfTextAtSize(tnText, 9);
  drawTextSafe(
    page,
    font,
    tnText,
    col3X + (col3W - tnWidth) / 2,
    trackBarcodeY - 10,
    9,
    BLACK,
  );

  // Service Info Grid
  const serviceY = trackBarcodeY - 15;
  page.drawLine({
    start: { x: col3X, y: serviceY },
    end: { x: x + w, y: serviceY },
    thickness: 0.5,
    color: BLACK,
  });

  let infoY = serviceY - 11;
  drawTextSafe(page, boldFont, "Service:", col3X + pad, infoY, 8, BLACK);
  drawTextSafe(page, font, "Overnight", col3X + pad + 35, infoY, 8, BLACK);

  drawTextSafe(page, boldFont, "Fragile:", col3X + col3W - 55, infoY, 8, BLACK);
  drawTextSafe(page, font, "yes", col3X + col3W - 25, infoY, 8, BLACK);

  // Date/Weight Grid
  const dateY = infoY - 4;
  page.drawLine({
    start: { x: col3X, y: dateY },
    end: { x: x + w, y: dateY },
    thickness: 0.5,
    color: BLACK,
  });

  infoY = dateY - 11;
  drawTextSafe(page, boldFont, "Date:", col3X + pad, infoY, 8, BLACK);
  drawTextSafe(page, font, data.bookedAt, col3X + pad + 25, infoY, 8, BLACK);

  const wText = `${data.weight} (Grams)`;
  drawTextSafe(page, boldFont, "Weight:", col3X + col3W - 85, infoY, 8, BLACK);
  drawTextSafe(page, font, wText, col3X + col3W - 55, infoY, 8, BLACK);

  // Pieces/Qty Grid
  const piecesY = infoY - 4;
  page.drawLine({
    start: { x: col3X, y: piecesY },
    end: { x: x + w, y: piecesY },
    thickness: 0.5,
    color: BLACK,
  });

  infoY = piecesY - 11;
  drawTextSafe(page, boldFont, "Pieces:", col3X + pad, infoY, 8, BLACK);
  drawTextSafe(
    page,
    font,
    String(data.pieces),
    col3X + pad + 35,
    infoY,
    8,
    BLACK,
  );

  drawTextSafe(page, boldFont, "Qty:", col3X + col3W - 35, infoY, 8, BLACK);
  drawTextSafe(
    page,
    font,
    String(data.quantity),
    col3X + col3W - 15,
    infoY,
    8,
    BLACK,
  );

  // --- Remarks Row ---
  drawTextSafe(page, boldFont, "Remarks:", x + pad, remarksTopY - 13, 8, BLACK);
  drawTextSafe(
    page,
    font,
    `- ${data.remarks}`,
    x + pad + 40,
    remarksTopY - 13,
    8,
    BLACK,
  );

  // --- Products Row ---
  drawTextSafe(
    page,
    boldFont,
    "Products:",
    x + pad,
    productsTopY - 13,
    8,
    BLACK,
  );
  const prodText = `[ ${data.itemsSummary} ]`;
  drawTextSafe(page, font, prodText, x + pad + 40, productsTopY - 13, 8, BLACK);
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
