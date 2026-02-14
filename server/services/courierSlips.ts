import { PDFDocument } from "pdf-lib";

const POSTEX_INVOICE_URL = "https://api.postex.pk/services/integration/api/order/v1/get-invoice";
const POSTEX_MAX_PER_REQUEST = 10;

export interface CourierSlipResult {
  success: boolean;
  pdfBuffer?: Buffer;
  error?: string;
  failedTrackingNumbers?: string[];
}

const LEOPARDS_SLIP_URL = "https://merchantapi.leopardscourier.com/api/getSlipDataPDF/format/json/";

export async function fetchLeopardsSlip(
  slipUrl: string,
  credentials?: { apiKey: string; apiPassword: string; trackingNumber: string }
): Promise<CourierSlipResult> {
  try {
    let resp: Response;

    if (credentials?.apiKey && credentials?.apiPassword && credentials?.trackingNumber) {
      console.log(`[Leopards Slip] Fetching slip via API for tracking: ${credentials.trackingNumber}`);
      resp = await fetch(LEOPARDS_SLIP_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          api_key: credentials.apiKey,
          api_password: credentials.apiPassword,
          track_numbers: credentials.trackingNumber,
        }),
        signal: AbortSignal.timeout(15000),
      });

      if (!resp.ok) {
        console.log(`[Leopards Slip] API returned ${resp.status}, trying stored URL fallback`);
        if (slipUrl) {
          resp = await fetch(slipUrl, { signal: AbortSignal.timeout(15000) });
          if (!resp.ok) {
            return { success: false, error: `Leopards slip fetch failed: HTTP ${resp.status}` };
          }
        } else {
          return { success: false, error: `Leopards slip API returned HTTP ${resp.status}` };
        }
      }
    } else if (slipUrl) {
      resp = await fetch(slipUrl, { signal: AbortSignal.timeout(15000) });
      if (!resp.ok) {
        return { success: false, error: `Leopards slip fetch failed: HTTP ${resp.status}` };
      }
    } else {
      return { success: false, error: "No slip URL or credentials available" };
    }
    const contentType = resp.headers.get("content-type") || "";
    const buffer = Buffer.from(await resp.arrayBuffer());

    if (contentType.includes("json")) {
      try {
        const jsonData = JSON.parse(buffer.toString("utf-8"));
        console.log(`[Leopards Slip] JSON response status: ${jsonData.status}, keys: ${Object.keys(jsonData).join(",")}`);
        if (jsonData.status === 1 && jsonData.slip_data) {
          const pdfBuf = Buffer.from(jsonData.slip_data, "base64");
          if (pdfBuf.length > 0) {
            return { success: true, pdfBuffer: pdfBuf };
          }
        }
        if (jsonData.status === 1 && jsonData.slipUrl) {
          const slipResp = await fetch(jsonData.slipUrl, { signal: AbortSignal.timeout(15000) });
          if (slipResp.ok) {
            const slipBuf = Buffer.from(await slipResp.arrayBuffer());
            if (slipBuf.length > 0) {
              return { success: true, pdfBuffer: slipBuf };
            }
          }
        }
        if (jsonData.status === 0 || jsonData.error) {
          const errMsg = typeof jsonData.error === "string" ? jsonData.error : (jsonData.message || "Leopards slip unavailable");
          return { success: false, error: `Leopards: ${errMsg}` };
        }
      } catch (parseErr) {
        console.log(`[Leopards Slip] JSON parse failed, treating as raw data`);
      }
    }

    if (contentType.includes("pdf") || (buffer.length >= 5 && buffer.slice(0, 5).toString() === "%PDF-")) {
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

function parsePostExError(buffer: Buffer, httpStatus: number): string {
  let errorMsg = `PostEx invoice fetch failed: HTTP ${httpStatus}`;
  try {
    const text = buffer.toString("utf-8").trim();
    const json = JSON.parse(text);
    if (json.statusMessage === "INVALID TRACKING NUMBER(S)") {
      return "PostEx: Invoice not available — order(s) may be delivered, returned, or cancelled. PostEx only generates invoices for active orders.";
    }
    if (json.statusCode && json.statusCode !== "200") {
      return `PostEx: ${json.statusMessage || "Invoice unavailable"}`;
    }
    if (json.statusMessage) {
      return `PostEx: ${json.statusMessage}`;
    }
    if (json.error || json.message) {
      return `PostEx: ${json.message || json.error}`;
    }
  } catch {}
  return errorMsg;
}

async function callPostExInvoice(trackingNumbers: string[], token: string): Promise<CourierSlipResult> {
  const joined = trackingNumbers.map(t => String(t).trim()).filter(Boolean).join(",");
  if (!joined) {
    return { success: false, error: "No valid tracking numbers provided" };
  }

  const url = `${POSTEX_INVOICE_URL}?trackingNumbers=${joined}`;

  console.log(`[PostEx Invoice] Fetching invoice for ${trackingNumbers.length} tracking number(s): ${joined.substring(0, 80)}${joined.length > 80 ? "..." : ""}`);

  const resp = await fetch(url, {
    method: "GET",
    headers: {
      "token": token,
    },
    signal: AbortSignal.timeout(30000),
  });

  const contentType = resp.headers.get("content-type") || "";
  const buffer = Buffer.from(await resp.arrayBuffer());
  const isPdf = contentType.includes("pdf") || (buffer.length >= 5 && buffer.slice(0, 5).toString() === "%PDF-");

  console.log(`[PostEx Invoice] Response: HTTP ${resp.status}, content-type: ${contentType}, size: ${buffer.length} bytes, isPdf: ${isPdf}, first8: ${buffer.slice(0, 8).toString("hex")}`);

  if (buffer.length === 0) {
    return { success: false, error: "PostEx returned empty response for invoice request" };
  }

  if (isPdf) {
    return { success: true, pdfBuffer: buffer };
  }

  if (!resp.ok || contentType.includes("json") || contentType.includes("text")) {
    const errorMsg = parsePostExError(buffer, resp.status);
    return { success: false, error: errorMsg, failedTrackingNumbers: trackingNumbers };
  }

  return { success: true, pdfBuffer: buffer };
}

export async function fetchPostExSlip(trackingNumber: string, token: string): Promise<CourierSlipResult> {
  try {
    if (!trackingNumber || !token) {
      return { success: false, error: "Missing tracking number or API token" };
    }

    const cleaned = String(trackingNumber).trim();
    console.log(`[PostEx Invoice] Single invoice request for tracking: ${cleaned}`);

    return await callPostExInvoice([cleaned], token);
  } catch (err: any) {
    console.error(`[PostEx Invoice] Error fetching single invoice:`, err.message);
    return { success: false, error: `Failed to fetch PostEx invoice: ${err.message}` };
  }
}

export async function fetchPostExSlipBulk(
  trackingNumbers: string[],
  token: string
): Promise<CourierSlipResult & { chunkErrors?: Array<{ trackingNumbers: string[]; error: string }> }> {
  try {
    if (!trackingNumbers.length || !token) {
      return { success: false, error: "Missing tracking numbers or API token" };
    }

    const cleaned = Array.from(new Set(trackingNumbers.map(t => String(t).trim()).filter(Boolean)));
    if (cleaned.length === 0) {
      return { success: false, error: "No valid tracking numbers after cleanup" };
    }

    console.log(`[PostEx Invoice] Bulk invoice request for ${cleaned.length} tracking numbers`);

    const chunks: string[][] = [];
    for (let i = 0; i < cleaned.length; i += POSTEX_MAX_PER_REQUEST) {
      chunks.push(cleaned.slice(i, i + POSTEX_MAX_PER_REQUEST));
    }

    console.log(`[PostEx Invoice] Split into ${chunks.length} chunk(s): ${chunks.map(c => c.length).join(", ")}`);

    const pdfBuffers: Buffer[] = [];
    const chunkErrors: Array<{ trackingNumbers: string[]; error: string }> = [];

    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      console.log(`[PostEx Invoice] Processing chunk ${i + 1}/${chunks.length} (${chunk.length} tracking numbers)`);

      const result = await callPostExInvoice(chunk, token);

      if (result.success && result.pdfBuffer) {
        pdfBuffers.push(result.pdfBuffer);
      } else {
        chunkErrors.push({
          trackingNumbers: chunk,
          error: result.error || "Unknown error",
        });
        console.error(`[PostEx Invoice] Chunk ${i + 1} failed: ${result.error}`);
      }
    }

    if (chunkErrors.length > 0 && pdfBuffers.length === 0) {
      const allFailed = chunkErrors.flatMap(e => e.trackingNumbers);
      return {
        success: false,
        error: chunkErrors[0].error,
        failedTrackingNumbers: allFailed,
        chunkErrors,
      };
    }

    if (pdfBuffers.length === 0) {
      return { success: false, error: "No PDF data received from PostEx" };
    }

    let finalPdf: Buffer;
    if (pdfBuffers.length === 1) {
      finalPdf = pdfBuffers[0];
    } else {
      console.log(`[PostEx Invoice] Merging ${pdfBuffers.length} PDFs...`);
      finalPdf = await combinePdfs(pdfBuffers);
    }

    if (chunkErrors.length > 0) {
      console.warn(`[PostEx Invoice] Partial success: ${pdfBuffers.length} chunks OK, ${chunkErrors.length} chunks failed`);
      return {
        success: true,
        pdfBuffer: finalPdf,
        chunkErrors,
        failedTrackingNumbers: chunkErrors.flatMap(e => e.trackingNumbers),
      };
    }

    console.log(`[PostEx Invoice] All ${chunks.length} chunks succeeded, final PDF: ${finalPdf.length} bytes`);
    return { success: true, pdfBuffer: finalPdf };
  } catch (err: any) {
    console.error(`[PostEx Invoice] Bulk invoice error:`, err.message);
    return { success: false, error: `Failed to fetch PostEx invoices: ${err.message}` };
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
