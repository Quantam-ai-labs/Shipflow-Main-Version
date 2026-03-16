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
const MARGIN_TOP = 20;
const MARGIN_BOTTOM = 20;
const BILL_WIDTH = A4_WIDTH - MARGIN_X * 2;
const USABLE_HEIGHT = A4_HEIGHT - MARGIN_TOP - MARGIN_BOTTOM;
const SECTION_HEIGHT = USABLE_HEIGHT / 3;
const BILL_HEIGHT = SECTION_HEIGHT;

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

  const col1W = w * 0.34;
  const col2W = w * 0.33;
  const col3W = w - col1W - col2W;

  const col1X = x;
  const col2X = x + col1W;
  const col3X = x + col1W + col2W;

  // Vertical Lines
  page.drawLine({
    start: { x: col2X, y: topY },
    end: { x: col2X, y: topY - headerH - row1H - 35 },
    thickness: 1,
    color: BLACK,
  });
  page.drawLine({
    start: { x: col3X, y: topY },
    end: { x: col3X, y: topY - headerH - row1H - 35 },
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

  const remarksTopY = row1TopY - row1H - 35;
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
  drawTextSafe(
    page,
    boldFont,
    "Order:",
    col1X + pad,
    c1y - 10,
    labelSize + 7,
    BLACK,
  );
  drawTextSafe(
    page,
    boldFont,
    data.orderNumber,
    col1X + pad + 70,
    c1y - 10,
    valueSize + 7,
    BLACK,
  );

  // Order Barcode & QR Code
  const orderBarcodeY = c1y - 30;
  const orderBarcode = await generateBarcodePng(
    data.orderNumber,
    "code128",
    15,
    4,
    false,
  );
  if (orderBarcode) {
    try {
      const img = await pdfDoc.embedPng(orderBarcode);
      page.drawImage(img, {
        x: col1X + pad,
        y: orderBarcodeY - 20,
        width: 90,
        height: 20,
      });
    } catch {}
  }

  // QR Code for Order (Alignment right)
  const qrPayload = `${data.orderNumber}`;
  const qrCodeImg = await generateBarcodePng(qrPayload, "qrcode", 30, 6);
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
    `${data.codAmount}`,
    "code128",
    15,
    4,
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
  const trackQrPayload = `${data.trackingNumber},${data.quantity || 1},${Math.round(data.codAmount)}`;
  const trackQr = await generateBarcodePng(trackQrPayload, "qrcode", 30, 6);
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
    20,
    4,
  );
  if (trackBarcode) {
    try {
      const img = await pdfDoc.embedPng(trackBarcode);
      const bcWidth = col3W - 20;
      page.drawImage(img, {
        x: col3X + 10,
        y: trackBarcodeY - 5,
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
    trackBarcodeY - 15,
    9,
    BLACK,
  );

  // Service Info Grid
  const serviceY = trackBarcodeY - 25;
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
  const dateY = infoY - 8;
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
  const piecesY = infoY - 8;
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
  let cleanRemarks = data.remarks || "";
  let lowerRemarks = cleanRemarks.toLowerCase();

  const conditions = [
    "Allow Open Parcel",
    "Must call before Delivery",
    "Handle with care",
  ];

  conditions.forEach((text) => {
    if (!lowerRemarks.includes(text.toLowerCase())) {
      cleanRemarks += (cleanRemarks ? " - " : "") + text;
      lowerRemarks = cleanRemarks.toLowerCase(); // update after append
    }
  });
  cleanRemarks = cleanRemarks.replace(/^\[\s*.*?\]\s*-?\s*/, "").trim();

  drawTextSafe(
    page,
    font,
    `${cleanRemarks}`,
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
  let prodText = "";
  if (data.itemsSummary && data.itemsSummary.trim()) {
    prodText = data.itemsSummary.replace(/^\[\s*/, "").replace(/\s*\]$/, "");
  } else if ((data as any).items?.length) {
    prodText = (data as any).items
      .map((i: any) => i.name || i.title || i.sku)
      .filter(Boolean)
      .join(", ");
  }
  if (!prodText || !prodText.trim()) {
    prodText = "-";
  }
  const prodFontSize = 7;
  const prodLineHeight = 8.5;
  const maxProductLines = 4;
  const productLines = wrapText(
    prodText,
    font,
    prodFontSize,
    w - (pad + 40) - pad,
    maxProductLines,
  );
  if (productLines.length === maxProductLines) {
    const last = productLines[maxProductLines - 1];
    if (last && !last.endsWith("...")) {
      productLines[maxProductLines - 1] =
        last.length > 3 ? last.slice(0, -3) + "..." : last + "...";
    }
  }

  const basePaddingTop = 15;
  const basePaddingBottom = 10;
  const productsH = Math.max(
    40,
    productLines.length * prodLineHeight + basePaddingTop + basePaddingBottom,
  );

  const realHeight = headerH + row1H + 25 + remarksH + productsH;
  const finalHeight = Math.min(realHeight, BILL_HEIGHT);
  const bottomY = topY - finalHeight;

  const minLines = 3;

  while (productLines.length < minLines) {
    productLines.push("");
  }
  page.drawRectangle({
    x: x,
    y: bottomY,
    width: w,
    height: finalHeight,
    borderColor: BLACK,
    borderWidth: 1,
  });
  let prodY = productsTopY - 13;

  for (const line of productLines) {
    drawTextSafe(page, font, line, x + pad + 40, prodY, prodFontSize, BLACK);
    prodY -= prodLineHeight;
  }
}

function drawDashedCutLine(page: PDFPage, y: number) {
  const dashLen = 6;
  const gapLen = 4;
  const lineColor = rgb(0.55, 0.55, 0.55);
  let cx = MARGIN_X;
  const endX = A4_WIDTH - MARGIN_X;
  while (cx < endX) {
    const segEnd = Math.min(cx + dashLen, endX);
    page.drawLine({
      start: { x: cx, y },
      end: { x: segEnd, y },
      thickness: 0.5,
      color: lineColor,
    });
    cx = segEnd + gapLen;
  }
}

export async function generateAirwayBillPdfBuffer(
  bills: AirwayBillData[],
): Promise<Buffer> {
  if (bills.length === 0) {
    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage([A4_WIDTH, A4_HEIGHT]);
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    drawTextSafe(
      page,
      font,
      "No orders to generate.",
      A4_WIDTH / 2 - 60,
      A4_HEIGHT / 2,
      12,
      BLACK,
    );
    return Buffer.from(await pdfDoc.save());
  }

  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const INVOICES_PER_PAGE = 3;

  const USABLE_HEIGHT = A4_HEIGHT - MARGIN_TOP - MARGIN_BOTTOM;
  const SECTION_HEIGHT = USABLE_HEIGHT / INVOICES_PER_PAGE;

  let currentPage = pdfDoc.addPage([A4_WIDTH, A4_HEIGHT]);

  for (let i = 0; i < bills.length; i++) {
    if (i !== 0 && i % INVOICES_PER_PAGE === 0) {
      currentPage = pdfDoc.addPage([A4_WIDTH, A4_HEIGHT]);
    }

    const position = i % INVOICES_PER_PAGE;

    const topY = A4_HEIGHT - MARGIN_TOP - SECTION_HEIGHT * position;

    await drawSingleAirwayBill(
      currentPage,
      pdfDoc,
      font,
      boldFont,
      bills[i],
      MARGIN_X,
      topY,
    );

    // draw cut line between sections
    if (position < INVOICES_PER_PAGE - 1 && i < bills.length - 1) {
      const cutLineY = topY - SECTION_HEIGHT;
      drawDashedCutLine(currentPage, cutLineY);
    }
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

  if (bills.length === 0) {
    const page = pdfDoc.addPage([A4_WIDTH, A4_HEIGHT]);
    drawTextSafe(
      page,
      font,
      "No orders to generate.",
      A4_WIDTH / 2 - 60,
      A4_HEIGHT / 2,
      12,
      BLACK,
    );
    const pdfBytes = await pdfDoc.save();
    const filename = `awb_batch_empty_${Date.now()}.pdf`;
    const filepath = path.join(PDF_DIR, filename);
    fs.writeFileSync(filepath, pdfBytes);
    return filepath;
  }

  let currentPage = pdfDoc.addPage([A4_WIDTH, A4_HEIGHT]);

  for (let i = 0; i < bills.length; i++) {
    if (i !== 0 && i % 3 === 0) {
      currentPage = pdfDoc.addPage([A4_WIDTH, A4_HEIGHT]);
    }

    const position = i % 3;
    const topY = A4_HEIGHT - MARGIN_TOP - position * SECTION_HEIGHT;
    await drawSingleAirwayBill(
      currentPage,
      pdfDoc,
      font,
      boldFont,
      bills[i],
      MARGIN_X,
      topY,
    );

    if (position < 2 && i < bills.length - 1) {
      const cutLineY = topY - SECTION_HEIGHT;
      drawDashedCutLine(currentPage, cutLineY);
    }
  }

  const pdfBytes = await pdfDoc.save();
  const filename = `awb_batch_${Date.now()}.pdf`;
  const filepath = path.join(PDF_DIR, filename);
  fs.writeFileSync(filepath, pdfBytes);

  return filepath;
}

export interface BatchLoadsheetData {
  courierName: string;
  courierLoadsheetId?: string;
  merchantName: string;
  accountNumber?: string;
  accountCode?: string;
  riderName?: string;
  createdAt: string;
  items: Array<{
    trackingNumber: string;
    orderNumber: string;
    city: string;
    weight: number;
    consigneeName: string;
    productDetails: string;
    quantity: number;
    codAmount: number;
  }>;
}

export async function generateBatchLoadsheetPdf(
  data: BatchLoadsheetData,
): Promise<Buffer> {
  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const pageWidth = 841.89;
  const pageHeight = 595.28;

  const left = 30;
  const right = pageWidth - 30;
  const tableWidth = right - left;
  const rowHeight = 22;
  const headerRowHeight = 20;
  const borderWidth = 0.5;
  const borderColor = rgb(0, 0, 0);
  const headerBg = rgb(0.93, 0.93, 0.93);
  const fontSize = 7.5;
  const headerFontSize = 7.5;

  const items = Array.isArray(data.items) ? data.items : [];
  const totalCod = items.reduce((s, i) => s + (Number(i.codAmount) || 0), 0);
  const totalPieces = items.reduce((s, i) => s + (Number(i.quantity) || 0), 0);

  function formatDateTime(dateString: string) {
    const d = new Date(dateString);
    const day = String(d.getDate()).padStart(2, "0");
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const year = d.getFullYear();
    let hours = d.getHours();
    const mins = String(d.getMinutes()).padStart(2, "0");
    const ampm = hours >= 12 ? "PM" : "AM";
    hours = hours % 12 || 12;
    return `${month}/${day}/${year} ${String(hours).padStart(2, "0")}:${mins} ${ampm}`;
  }

  function formatDate(dateString: string) {
    const d = new Date(dateString);
    return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
  }

  const headers = ["Sr.", "CN #", "Order ID", "Destination", "Weight", "Consignee Name", "Product Details", "Qty", "COD Amount"];
  const colWidths = [30, 90, 65, 70, 42, 90, 220, 35, 65];
  const colXs: number[] = [left];
  for (let i = 0; i < colWidths.length; i++) {
    colXs.push(colXs[i] + colWidths[i]);
  }

  function drawTableHeader(pg: PDFPage, yPos: number): number {
    pg.drawRectangle({
      x: left, y: yPos - headerRowHeight, width: tableWidth, height: headerRowHeight,
      color: headerBg, borderColor, borderWidth,
    });
    for (const xPos of colXs) {
      pg.drawLine({ start: { x: xPos, y: yPos }, end: { x: xPos, y: yPos - headerRowHeight }, thickness: borderWidth, color: borderColor });
    }
    headers.forEach((h, i) => {
      drawTextSafe(pg, boldFont, h, colXs[i] + 3, yPos - 14, headerFontSize);
    });
    return yPos - headerRowHeight;
  }

  function drawPageHeader(pg: PDFPage): number {
    let cy = pageHeight - 35;

    const title = "Dispatch Report";
    const tw = boldFont.widthOfTextAtSize(title, 14);
    drawTextSafe(pg, boldFont, title, (pageWidth - tw) / 2, cy, 14);
    cy -= 22;

    drawTextSafe(pg, boldFont, data.courierName || "", left, cy, 10);

    const rightCol = right - 200;
    drawTextSafe(pg, boldFont, "Booked Packets Summary Report", rightCol, cy + 6, 8);
    cy -= 13;

    const infoLabels = [
      ["Pickup Date", formatDateTime(data.createdAt)],
      ["Printed On", formatDate(data.createdAt)],
    ];
    if (data.courierLoadsheetId) {
      infoLabels.push(["Challan #", data.courierLoadsheetId]);
    }

    let infoY = cy;
    for (const [lbl, val] of infoLabels) {
      drawTextSafe(pg, font, `${lbl}`, rightCol, infoY, 8);
      drawTextSafe(pg, font, val, rightCol + 80, infoY, 8);
      infoY -= 12;
    }

    cy -= 16;
    if (data.accountNumber) {
      drawTextSafe(pg, boldFont, "Client", left, cy, 8);
      drawTextSafe(pg, font, `Acc # ${data.accountNumber}`, left + 80, cy, 8);
      drawTextSafe(pg, font, `Company Name: ${data.merchantName || "-"}`, left + 180, cy, 8);
      cy -= 12;
    }
    if (data.accountCode || data.riderName) {
      drawTextSafe(pg, boldFont, "Handed Over To:", left, cy, 8);
      if (data.accountCode) drawTextSafe(pg, font, `Code: ${data.accountCode}`, left + 80, cy, 8);
      if (data.riderName) drawTextSafe(pg, font, `Name: ${data.riderName}`, left + 180, cy, 8);
      cy -= 12;
    }
    cy -= 8;
    return cy;
  }

  let page = pdfDoc.addPage([pageWidth, pageHeight]);
  let y = drawPageHeader(page);
  y = drawTableHeader(page, y);

  for (let i = 0; i < items.length; i++) {
    if (y - rowHeight < 60) {
      page = pdfDoc.addPage([pageWidth, pageHeight]);
      y = pageHeight - 35;
      y = drawTableHeader(page, y);
    }

    const item = items[i];

    page.drawRectangle({
      x: left, y: y - rowHeight, width: tableWidth, height: rowHeight,
      borderColor, borderWidth,
    });
    for (const xPos of colXs) {
      page.drawLine({ start: { x: xPos, y }, end: { x: xPos, y: y - rowHeight }, thickness: borderWidth, color: borderColor });
    }

    const textY = y - 14;
    drawTextSafe(page, font, String(i + 1), colXs[0] + 3, textY, fontSize);
    drawTextSafe(page, font, item.trackingNumber || "-", colXs[1] + 3, textY, fontSize);
    drawTextSafe(page, font, item.orderNumber || "-", colXs[2] + 3, textY, fontSize);
    drawTextSafe(page, font, truncate(item.city || "-", 16), colXs[3] + 3, textY, fontSize);
    drawTextSafe(page, font, String(item.weight || 0), colXs[4] + 3, textY, fontSize);
    drawTextSafe(page, font, truncate(item.consigneeName || "-", 20), colXs[5] + 3, textY, fontSize);
    drawTextSafe(page, font, truncate(item.productDetails || "-", 52), colXs[6] + 3, textY, fontSize);
    drawTextSafe(page, font, String(item.quantity || 0), colXs[7] + 3, textY, fontSize);
    drawTextSafe(page, font, `${item.codAmount || 0}`, colXs[8] + 3, textY, fontSize);

    y -= rowHeight;
  }

  y -= 8;
  if (y < 100) {
    page = pdfDoc.addPage([pageWidth, pageHeight]);
    y = pageHeight - 50;
  }

  drawTextSafe(page, boldFont, `Total No. Of Pieces:`, left, y, 8);
  drawTextSafe(page, font, String(totalPieces), left + 110, y, 8);
  y -= 13;
  drawTextSafe(page, boldFont, `Total No. Of Packets:`, left, y, 8);
  drawTextSafe(page, font, String(items.length), left + 110, y, 8);
  y -= 13;
  drawTextSafe(page, boldFont, `Total COD Amount:`, left, y, 8);
  drawTextSafe(page, font, String(totalCod), left + 110, y, 8);
  y -= 30;

  const sigLine = "______________________________";
  drawTextSafe(page, font, `Client Signature: ${sigLine}`, left, y, 8);
  drawTextSafe(page, font, `Booking Staff Signature: ${sigLine}`, right - 250, y, 8);

  const pdfBytes = await pdfDoc.save();
  return Buffer.from(pdfBytes);
}

export interface PicklistItem {
  image?: string | null;
  productName: string;
  variantTitle?: string | null;
  quantity: number;
  costPrice: number;
  salePrice: number;
}

export async function generatePicklistPdfBuffer(items: PicklistItem[]): Promise<Buffer> {
  const aggregated = new Map<string, PicklistItem>();
  for (const item of items) {
    const key = `${item.productName}|||${item.variantTitle || ""}`;
    const existing = aggregated.get(key);
    if (existing) {
      existing.quantity += item.quantity;
    } else {
      aggregated.set(key, { ...item });
    }
  }
  const rows = Array.from(aggregated.values()).sort((a, b) => a.productName.localeCompare(b.productName));

  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const pageWidth = 595.28;
  const pageHeight = 841.89;
  const margin = 40;
  const usableWidth = pageWidth - margin * 2;

  const colImage = 50;
  const colQty = 45;
  const colCost = 70;
  const colSale = 70;
  const colName = usableWidth - colImage - colQty - colCost - colSale;

  const rowHeight = 50;
  const headerHeight = 30;
  const imgSize = 38;

  const imageCache = new Map<string, PDFImage | null>();

  const sharp = (await import("sharp")).default;

  async function fetchAndEmbedImage(url: string): Promise<PDFImage | null> {
    if (imageCache.has(url)) return imageCache.get(url)!;
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(5000) });
      if (!response.ok) { imageCache.set(url, null); return null; }
      const contentType = (response.headers.get("content-type") || "").toLowerCase();
      const urlLower = url.toLowerCase();
      const isPng = contentType.includes("image/png") || urlLower.includes(".png");
      const isJpg = contentType.includes("image/jpeg") || contentType.includes("image/jpg") || urlLower.includes(".jpg") || urlLower.includes(".jpeg");
      const arrayBuf = await response.arrayBuffer();
      let bytes = new Uint8Array(arrayBuf);
      let img: PDFImage;
      if (isPng) {
        img = await pdfDoc.embedPng(bytes);
      } else if (isJpg) {
        img = await pdfDoc.embedJpg(bytes);
      } else {
        const pngBuffer = await sharp(Buffer.from(bytes)).png().toBuffer();
        img = await pdfDoc.embedPng(new Uint8Array(pngBuffer));
      }
      imageCache.set(url, img);
      return img;
    } catch {
      imageCache.set(url, null);
      return null;
    }
  }

  const uniqueImageUrls = [...new Set(rows.map(r => r.image).filter(Boolean))] as string[];
  await Promise.all(
    uniqueImageUrls.map(url => fetchAndEmbedImage(url))
  );

  function addNewPage(): { page: PDFPage; y: number } {
    const page = pdfDoc.addPage([pageWidth, pageHeight]);
    return { page, y: pageHeight - margin };
  }

  function drawTableHeader(page: PDFPage, y: number): number {
    const headerY = y - headerHeight;
    page.drawRectangle({
      x: margin,
      y: headerY,
      width: usableWidth,
      height: headerHeight,
      color: rgb(0.15, 0.15, 0.15),
    });

    const textY = headerY + 9;
    const headers = [
      { text: "Image", x: margin + 5, w: colImage },
      { text: "Product Name", x: margin + colImage + 5, w: colName },
      { text: "Qty", x: margin + colImage + colName + 5, w: colQty },
      { text: "Cost", x: margin + colImage + colName + colQty + 5, w: colCost },
      { text: "Sale", x: margin + colImage + colName + colQty + colCost + 5, w: colSale },
    ];

    for (const h of headers) {
      page.drawText(h.text, {
        x: h.x,
        y: textY,
        size: 9,
        font: fontBold,
        color: rgb(1, 1, 1),
      });
    }

    return headerY;
  }

  let { page, y } = addNewPage();

  page.drawText("Products Picklist", {
    x: margin,
    y: y - 5,
    size: 22,
    font: fontBold,
    color: rgb(0.1, 0.1, 0.1),
  });
  y -= 35;

  page.drawText(`Total Items: ${rows.length}  |  Total Qty: ${rows.reduce((s, r) => s + r.quantity, 0)}`, {
    x: margin,
    y: y - 2,
    size: 10,
    font,
    color: rgb(0.35, 0.35, 0.35),
  });
  y -= 22;

  y = drawTableHeader(page, y);

  let rowIndex = 0;
  for (const row of rows) {
    if (y - rowHeight < margin + 20) {
      ({ page, y } = addNewPage());
      y = drawTableHeader(page, y);
    }

    const rowY = y - rowHeight;

    if (rowIndex % 2 === 1) {
      page.drawRectangle({
        x: margin,
        y: rowY,
        width: usableWidth,
        height: rowHeight,
        color: rgb(0.96, 0.96, 0.96),
      });
    }

    page.drawLine({
      start: { x: margin, y: rowY },
      end: { x: margin + usableWidth, y: rowY },
      thickness: 0.5,
      color: rgb(0.85, 0.85, 0.85),
    });

    const cellY = rowY + (rowHeight - 9) / 2;

    if (row.image) {
      const img = await fetchAndEmbedImage(row.image);
      if (img) {
        const aspect = img.width / img.height;
        let drawW = imgSize;
        let drawH = imgSize;
        if (aspect > 1) {
          drawH = imgSize / aspect;
        } else {
          drawW = imgSize * aspect;
        }
        const imgX = margin + (colImage - drawW) / 2;
        const imgY = rowY + (rowHeight - drawH) / 2;
        page.drawImage(img, { x: imgX, y: imgY, width: drawW, height: drawH });
      }
    }

    let displayName = row.productName;
    if (row.variantTitle) {
      displayName = `${row.productName} - ${row.variantTitle}`;
    }
    displayName = (displayName || "").replace(/[^\x20-\x7E\xA0-\xFF]/g, " ").replace(/\s{2,}/g, " ").trim();
    const nameX = margin + colImage + 5;
    const maxNameWidth = colName - 10;
    let truncatedName = displayName;
    while (font.widthOfTextAtSize(truncatedName, 8.5) > maxNameWidth && truncatedName.length > 10) {
      truncatedName = truncatedName.substring(0, truncatedName.length - 4) + "...";
    }

    const nameLines: string[] = [];
    if (font.widthOfTextAtSize(displayName, 8.5) > maxNameWidth) {
      const words = displayName.split(" ");
      let line = "";
      for (const word of words) {
        const test = line ? `${line} ${word}` : word;
        if (font.widthOfTextAtSize(test, 8.5) > maxNameWidth) {
          if (line) nameLines.push(line);
          line = word;
        } else {
          line = test;
        }
      }
      if (line) nameLines.push(line);
      if (nameLines.length > 2) {
        nameLines.length = 2;
        nameLines[1] = nameLines[1].substring(0, nameLines[1].length - 3) + "...";
      }
    } else {
      nameLines.push(displayName);
    }

    const lineHeight = 11;
    const totalTextHeight = nameLines.length * lineHeight;
    let nameY = rowY + (rowHeight + totalTextHeight) / 2 - lineHeight + 2;
    for (const line of nameLines) {
      page.drawText(line, { x: nameX, y: nameY, size: 8.5, font, color: rgb(0.1, 0.1, 0.1) });
      nameY -= lineHeight;
    }

    const qtyX = margin + colImage + colName + 5;
    page.drawText(String(row.quantity), { x: qtyX, y: cellY, size: 9, font: fontBold, color: rgb(0.1, 0.1, 0.1) });

    const costX = margin + colImage + colName + colQty + 5;
    page.drawText(row.costPrice > 0 ? `Rs ${row.costPrice.toFixed(0)}` : "-", { x: costX, y: cellY, size: 8.5, font, color: rgb(0.3, 0.3, 0.3) });

    const saleX = margin + colImage + colName + colQty + colCost + 5;
    page.drawText(row.salePrice > 0 ? `Rs ${row.salePrice.toFixed(0)}` : "-", { x: saleX, y: cellY, size: 8.5, font, color: rgb(0.1, 0.1, 0.1) });

    y = rowY;
    rowIndex++;
  }

  page.drawLine({
    start: { x: margin, y },
    end: { x: margin + usableWidth, y },
    thickness: 1,
    color: rgb(0.15, 0.15, 0.15),
  });

  const pdfBytes = await pdfDoc.save();
  return Buffer.from(pdfBytes);
}

export function getPdfPath(filepath: string): string | null {
  if (!filepath) return null;
  if (fs.existsSync(filepath)) return filepath;
  const inDir = path.join(PDF_DIR, filepath);
  if (fs.existsSync(inDir)) return inDir;
  return null;
}

export async function savePdf(buffer: Buffer, namePrefix: string): Promise<string> {
  if (!fs.existsSync(PDF_DIR)) {
    fs.mkdirSync(PDF_DIR, { recursive: true });
  }
  const safeName = namePrefix.replace(/[^a-zA-Z0-9_-]/g, "_");
  const filename = `${safeName}_${Date.now()}.pdf`;
  const filepath = path.join(PDF_DIR, filename);
  fs.writeFileSync(filepath, buffer);
  return filename;
}
