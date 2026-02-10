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

    const url = `https://api.postex.pk/services/integration/api/order/v3/airway-bill/${encodeURIComponent(trackingNumber)}`;
    const resp = await fetch(url, {
      method: "GET",
      headers: {
        "token": token,
        "Accept": "application/pdf,application/json,*/*",
      },
      signal: AbortSignal.timeout(15000),
    });

    if (!resp.ok) {
      return { success: false, error: `PostEx airway bill fetch failed: HTTP ${resp.status}` };
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

    if (contentType.includes("json")) {
      try {
        const json = JSON.parse(buffer.toString());
        if (json.dist?.url || json.dist?.labelUrl || json.url || json.labelUrl) {
          const labelUrl = json.dist?.url || json.dist?.labelUrl || json.url || json.labelUrl;
          const labelResp = await fetch(labelUrl, { signal: AbortSignal.timeout(15000) });
          if (labelResp.ok) {
            const labelBuffer = Buffer.from(await labelResp.arrayBuffer());
            return { success: true, pdfBuffer: labelBuffer };
          }
        }
        return { success: false, error: `PostEx returned JSON without PDF: ${JSON.stringify(json).substring(0, 200)}` };
      } catch {
        return { success: false, error: "PostEx returned unparseable response" };
      }
    }

    return { success: true, pdfBuffer: buffer };
  } catch (err: any) {
    return { success: false, error: `Failed to fetch PostEx airway bill: ${err.message}` };
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
