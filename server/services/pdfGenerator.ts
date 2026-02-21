// ================== CONSTANTS ==================
const A4_WIDTH = 595.28;
const A4_HEIGHT = 841.89;
const MARGIN_X = 18;
const MARGIN_TOP = 16;
const BILL_HEIGHT = 260;
const GAP_Y = 6;

const BLACK = rgb(0, 0, 0);

// ================== MAIN GENERATOR ==================
export async function generateAirwayBillPdfBuffer(
  bills: AirwayBillData[],
): Promise<Buffer> {
  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  // ✅ SINGLE PAGE ONLY
  const page = pdfDoc.addPage([A4_WIDTH, A4_HEIGHT]);

  bills.forEach(async (bill, index) => {
    const topY =
      A4_HEIGHT - MARGIN_TOP - index * (BILL_HEIGHT + GAP_Y);

    // ⚠️ Prevent invisible rendering
    if (topY - BILL_HEIGHT < 0) return;

    await drawSingleAirwayBill(
      page,
      pdfDoc,
      font,
      boldFont,
      bill,
      MARGIN_X,
      topY,
    );
  });

  return Buffer.from(await pdfDoc.save());
}

// ================== DRAW AIRWAY BILL ==================
async function drawSingleAirwayBill(
  page: PDFPage,
  pdfDoc: PDFDocument,
  font: PDFFont,
  boldFont: PDFFont,
  data: AirwayBillData,
  x: number,
  topY: number,
) {
  const w = A4_WIDTH - MARGIN_X * 2;
  const bottomY = topY - BILL_HEIGHT;

  // ===== Outer Box =====
  page.drawRectangle({
    x,
    y: bottomY,
    width: w,
    height: BILL_HEIGHT,
    borderColor: BLACK,
    borderWidth: 1,
  });

  const col1W = w * 0.34;
  const col2W = w * 0.33;
  const col3W = w - col1W - col2W;

  const col1X = x;
  const col2X = x + col1W;
  const col3X = x + col1W + col2W;

  // ===== Headers =====
  drawTextSafe(page, boldFont, "Customer Information", col1X + 10, topY - 14, 9);
  drawTextSafe(page, boldFont, "Brand Information", col2X + 10, topY - 14, 9);
  drawTextSafe(page, boldFont, "Parcel Information", col3X + 10, topY - 14, 9);

  // ===== Column Lines =====
  page.drawLine({ start: { x: col2X, y: topY }, end: { x: col2X, y: bottomY }, thickness: 1 });
  page.drawLine({ start: { x: col3X, y: topY }, end: { x: col3X, y: bottomY }, thickness: 1 });

  // ================== COLUMN 1 ==================
  let y = topY - 30;
  const pad = 8;

  drawTextSafe(page, boldFont, "Name:", col1X + pad, y, 8);
  drawTextSafe(page, font, truncate(data.consigneeName, 30), col1X + 50, y, 8);

  y -= 12;
  drawTextSafe(page, boldFont, "Phone:", col1X + pad, y, 8);
  drawTextSafe(page, font, data.consigneePhone, col1X + 50, y, 8);

  y -= 12;
  drawTextSafe(page, boldFont, "Address:", col1X + pad, y, 8);

  wrapText(
    data.consigneeAddress || "-",
    font,
    8,
    col1W - pad * 2,
    2, // 🔒 FIXED LINE COUNT
  ).forEach((line) => {
    y -= 10;
    drawTextSafe(page, font, line, col1X + pad, y, 8);
  });

  y -= 14;
  drawTextSafe(page, boldFont, "Destination:", col1X + pad, y, 8);
  drawTextSafe(page, font, data.consigneeCity, col1X + 80, y, 8);

  y -= 18;
  drawTextSafe(page, boldFont, "Order:", col1X + pad, y, 10);
  drawTextSafe(page, boldFont, data.orderNumber, col1X + 70, y, 10);

  // Barcode
  const orderBarcode = await generateBarcodePng(data.orderNumber);
  if (orderBarcode) {
    const img = await pdfDoc.embedPng(orderBarcode);
    page.drawImage(img, {
      x: col1X + pad,
      y: y - 30,
      width: 90,
      height: 20,
    });
  }

  // QR aligned properly
  const qr = await generateBarcodePng(data.orderNumber, "qrcode");
  if (qr) {
    const img = await pdfDoc.embedPng(qr);
    const size = 30;
    page.drawImage(img, {
      x: col1X + col1W - size - pad,
      y: y - 30,
      width: size,
      height: size,
    });
  }

  // ================== COLUMN 2 ==================
  y = topY - 30;
  drawTextSafe(page, boldFont, "Shipper:", col2X + pad, y, 8);
  drawTextSafe(page, font, truncate(data.merchantName, 25), col2X + 60, y, 8);

  y -= 12;
  drawTextSafe(page, boldFont, "Address:", col2X + pad, y, 8);

  wrapText(
    data.merchantAddress || "-",
    font,
    8,
    col2W - pad * 2,
    2,
  ).forEach((line) => {
    y -= 10;
    drawTextSafe(page, font, line, col2X + pad, y, 8);
  });

  y -= 20;
  drawTextSafe(
    page,
    boldFont,
    `Amount: Rs ${data.codAmount}`,
    col2X + pad,
    y,
    12,
  );

  // ================== COLUMN 3 ==================
  y = topY - 30;

  drawTextSafe(page, boldFont, data.courierName, col3X + pad, y, 14);

  const trackQR = await generateBarcodePng(data.trackingNumber, "qrcode");
  if (trackQR) {
    const img = await pdfDoc.embedPng(trackQR);
    page.drawImage(img, {
      x: col3X + col3W - 40,
      y: y - 35,
      width: 35,
      height: 35,
    });
  }

  const trackBarcode = await generateBarcodePng(data.trackingNumber);
  if (trackBarcode) {
    const img = await pdfDoc.embedPng(trackBarcode);
    page.drawImage(img, {
      x: col3X + pad,
      y: y - 80,
      width: col3W - pad * 2,
      height: 30,
    });
  }

  // ================== PRODUCTS ==================
  const productsText =
    typeof data.itemsSummary === "string" && data.itemsSummary.trim()
      ? truncate(data.itemsSummary.replace(/^\[|\]$/g, ""), 80)
      : "—";

  drawTextSafe(page, boldFont, "Products:", x + pad, bottomY + 25, 8);
  drawTextSafe(page, font, productsText, x + 80, bottomY + 25, 8);
}