import { PDFDocument } from "pdf-lib";

export interface CourierSlipResult {
  success: boolean;
  pdfBuffer?: Buffer;
  error?: string;
}

export async function fetchLeopardsSlip(slipUrl: string): Promise<CourierSlipResult> {
  try {
    if (!slipUrl) {
      return { success: false, error: "No slip URL available" };
    }
    const resp = await fetch(slipUrl, { signal: AbortSignal.timeout(15000) });
    if (!resp.ok) {
      return { success: false, error: `Leopards slip fetch failed: HTTP ${resp.status}` };
    }
    const contentType = resp.headers.get("content-type") || "";
    const buffer = Buffer.from(await resp.arrayBuffer());

    if (contentType.includes("pdf") || buffer.slice(0, 5).toString() === "%PDF-") {
      return { success: true, pdfBuffer: buffer };
    }

    if (contentType.includes("image")) {
      const pdfDoc = await PDFDocument.create();
      let img;
      if (contentType.includes("png")) {
        img = await pdfDoc.embedPng(buffer);
      } else {
        img = await pdfDoc.embedJpg(buffer);
      }
      const aspectRatio = img.width / img.height;
      const pageWidth = 595;
      const pageHeight = pageWidth / aspectRatio;
      const page = pdfDoc.addPage([pageWidth, Math.max(pageHeight, 842)]);
      const drawWidth = pageWidth - 40;
      const drawHeight = drawWidth / aspectRatio;
      page.drawImage(img, {
        x: 20,
        y: page.getHeight() - drawHeight - 20,
        width: drawWidth,
        height: drawHeight,
      });
      const pdfBytes = await pdfDoc.save();
      return { success: true, pdfBuffer: Buffer.from(pdfBytes) };
    }

    return { success: true, pdfBuffer: buffer };
  } catch (err: any) {
    return { success: false, error: `Failed to fetch Leopards slip: ${err.message}` };
  }
}

export async function fetchPostExSlip(trackingNumber: string, token: string): Promise<CourierSlipResult> {
  try {
    if (!trackingNumber || !token) {
      return { success: false, error: "Missing tracking number or API token" };
    }

    const url = "https://api.postex.pk/services/integration/api/order/v2/generate-load-sheet";
    const resp = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "token": token,
      },
      body: JSON.stringify({ trackingNumbers: [trackingNumber] }),
      signal: AbortSignal.timeout(20000),
    });

    const contentType = resp.headers.get("content-type") || "";
    const buffer = Buffer.from(await resp.arrayBuffer());

    if (buffer.length === 0) {
      return { success: false, error: "PostEx returned empty response" };
    }

    if (contentType.includes("pdf") || buffer.slice(0, 5).toString() === "%PDF-") {
      return { success: true, pdfBuffer: buffer };
    }

    if (contentType.includes("image")) {
      const pdfDoc = await PDFDocument.create();
      let img;
      if (contentType.includes("png")) {
        img = await pdfDoc.embedPng(buffer);
      } else {
        img = await pdfDoc.embedJpg(buffer);
      }
      const aspectRatio = img.width / img.height;
      const pageWidth = 595;
      const pageHeight = pageWidth / aspectRatio;
      const page = pdfDoc.addPage([pageWidth, Math.max(pageHeight, 842)]);
      const drawWidth = pageWidth - 40;
      const drawHeight = drawWidth / aspectRatio;
      page.drawImage(img, {
        x: 20,
        y: page.getHeight() - drawHeight - 20,
        width: drawWidth,
        height: drawHeight,
      });
      const pdfBytes = await pdfDoc.save();
      return { success: true, pdfBuffer: Buffer.from(pdfBytes) };
    }

    if (contentType.includes("json") || !resp.ok) {
      let errorMsg = `PostEx AWB fetch failed: HTTP ${resp.status}`;
      try {
        const errorJson = JSON.parse(buffer.toString());
        if (errorJson.statusMessage === "INVALID TRACKING NUMBER(S)") {
          errorMsg = "PostEx: AWB not available — this order may be delivered, returned, or cancelled. PostEx only generates airway bills for active orders.";
        } else if (errorJson.statusCode && errorJson.statusCode !== "200") {
          errorMsg = `PostEx: ${errorJson.statusMessage || "AWB unavailable"}`;
        } else if (errorJson.statusMessage) {
          errorMsg = `PostEx: ${errorJson.statusMessage}`;
        } else if (errorJson.error) {
          errorMsg = `PostEx: ${errorJson.message || errorJson.error}`;
        }
      } catch {}
      return { success: false, error: errorMsg };
    }

    return { success: true, pdfBuffer: buffer };
  } catch (err: any) {
    return { success: false, error: `Failed to fetch PostEx airway bill: ${err.message}` };
  }
}

export async function fetchPostExSlipBulk(trackingNumbers: string[], token: string): Promise<CourierSlipResult> {
  try {
    if (!trackingNumbers.length || !token) {
      return { success: false, error: "Missing tracking numbers or API token" };
    }

    const url = "https://api.postex.pk/services/integration/api/order/v2/generate-load-sheet";
    const resp = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "token": token,
      },
      body: JSON.stringify({ trackingNumbers }),
      signal: AbortSignal.timeout(30000),
    });

    const contentType = resp.headers.get("content-type") || "";
    const buffer = Buffer.from(await resp.arrayBuffer());

    if (buffer.length === 0) {
      return { success: false, error: "PostEx returned empty response for batch AWBs" };
    }

    if (contentType.includes("pdf") || buffer.slice(0, 5).toString() === "%PDF-") {
      return { success: true, pdfBuffer: buffer };
    }

    if (contentType.includes("json") || !resp.ok) {
      let errorMsg = `PostEx batch AWB fetch failed: HTTP ${resp.status}`;
      try {
        const errorJson = JSON.parse(buffer.toString());
        if (errorJson.statusMessage === "INVALID TRACKING NUMBER(S)") {
          errorMsg = "PostEx: AWBs not available — orders may be delivered, returned, or cancelled. PostEx only generates airway bills for active orders.";
        } else if (errorJson.statusCode && errorJson.statusCode !== "200") {
          errorMsg = `PostEx: ${errorJson.statusMessage || "AWBs unavailable"}`;
        } else if (errorJson.statusMessage) {
          errorMsg = `PostEx: ${errorJson.statusMessage}`;
        } else if (errorJson.error) {
          errorMsg = `PostEx: ${errorJson.message || errorJson.error}`;
        }
      } catch {}
      return { success: false, error: errorMsg };
    }

    return { success: true, pdfBuffer: buffer };
  } catch (err: any) {
    return { success: false, error: `Failed to fetch PostEx batch airway bills: ${err.message}` };
  }
}

export async function combinePdfs(pdfBuffers: Buffer[]): Promise<Buffer> {
  const mergedDoc = await PDFDocument.create();

  for (const buf of pdfBuffers) {
    try {
      const srcDoc = await PDFDocument.load(buf, { ignoreEncryption: true });
      const pages = await mergedDoc.copyPages(srcDoc, srcDoc.getPageIndices());
      for (const page of pages) {
        mergedDoc.addPage(page);
      }
    } catch (err) {
      console.error("[CombinePDFs] Failed to load a PDF buffer, skipping:", err);
    }
  }

  const merged = await mergedDoc.save();
  return Buffer.from(merged);
}
