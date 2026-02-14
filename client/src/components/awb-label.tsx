import { useEffect, useRef, useCallback } from "react";
import JsBarcode from "jsbarcode";
import QRCode from "qrcode";

export interface LabelData {
  trackingNumber: string;
  orderNumber: string;
  customerName: string;
  customerPhone: string;
  customerAddress: string;
  customerCity: string;
  customerProvince: string;
  postalCode: string;
  codAmount: string;
  totalQuantity: number;
  weight: string;
  pieces: number;
  paymentMethod: string;
  courierName: string;
  remark: string;
  products: { name: string; qty: number; price: string; sku: string }[];
  brandName: string;
  brandPhone: string;
  brandAddress: string;
  brandCity: string;
  orderDate: string;
  bookedAt: string;
  itemSummary: string;
}

type LabelsPerPage = 1 | 2 | 3 | 4;

function BarcodeCanvas({ value, height = 40 }: { value: string; height?: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (canvasRef.current && value) {
      try {
        JsBarcode(canvasRef.current, value, {
          format: "CODE128",
          width: 1.5,
          height,
          displayValue: false,
          margin: 0,
        });
      } catch {
        // invalid barcode value
      }
    }
  }, [value, height]);

  return <canvas ref={canvasRef} style={{ maxWidth: "100%", height: "auto" }} />;
}

function QRCodeCanvas({ value, size = 60 }: { value: string; size?: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (canvasRef.current && value) {
      QRCode.toCanvas(canvasRef.current, value, {
        width: size,
        margin: 0,
        errorCorrectionLevel: "M",
      }).catch(() => {});
    }
  }, [value, size]);

  return <canvas ref={canvasRef} style={{ width: size, height: size }} />;
}

function formatCOD(amount: string | number): string {
  const num = typeof amount === "string" ? parseFloat(amount) : amount;
  if (isNaN(num)) return "0";
  return num.toLocaleString("en-PK", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

function SingleLabel({ label, compact = false }: { label: LabelData; compact?: boolean }) {
  const fontSize = compact ? "6.5px" : "8px";
  const headerSize = compact ? "7.5px" : "9px";
  const barcodeH = compact ? 28 : 40;
  const qrSize = compact ? 45 : 60;
  const codSize = compact ? "12px" : "16px";
  const sectionPad = compact ? "2px 3px" : "3px 5px";

  const isCOD = !label.paymentMethod || label.paymentMethod.toUpperCase() === "COD" || label.paymentMethod.toUpperCase() === "CASH ON DELIVERY";

  const cellStyle = (extra?: React.CSSProperties): React.CSSProperties => ({
    borderRight: "1px solid #000",
    borderBottom: "1px solid #000",
    padding: sectionPad,
    verticalAlign: "top",
    fontSize,
    lineHeight: "1.3",
    ...extra,
  });

  const headerStyle = (extra?: React.CSSProperties): React.CSSProperties => ({
    fontSize: headerSize,
    fontWeight: 700,
    marginBottom: compact ? "1px" : "2px",
    textTransform: "uppercase" as const,
    letterSpacing: "0.3px",
    ...extra,
  });

  return (
    <div
      style={{
        border: "2px solid #000",
        fontFamily: "'Arial', 'Helvetica', sans-serif",
        color: "#000",
        background: "#fff",
        width: "100%",
        boxSizing: "border-box",
        pageBreakInside: "avoid",
      }}
      data-testid="awb-label"
    >
      {/* TOP ROW: 3 columns */}
      <table
        style={{
          width: "100%",
          borderCollapse: "collapse",
          tableLayout: "fixed",
        }}
      >
        <colgroup>
          <col style={{ width: "40%" }} />
          <col style={{ width: "30%" }} />
          <col style={{ width: "30%" }} />
        </colgroup>
        <tbody>
          <tr>
            {/* COLUMN 1: Customer Info */}
            <td style={cellStyle()}>
              <div style={headerStyle()}>Ship To</div>
              <div style={{ fontWeight: 700, fontSize: compact ? "8px" : "10px", marginBottom: "2px" }}>
                {label.customerName}
              </div>
              <div style={{ marginBottom: "1px" }}>{label.customerPhone}</div>
              <div style={{
                fontSize: compact ? "6px" : "7px",
                lineHeight: "1.25",
                maxHeight: compact ? "28px" : "36px",
                overflow: "hidden",
                marginBottom: "2px",
              }}>
                {label.customerAddress}
              </div>
              <div style={{ fontWeight: 700, fontSize: compact ? "8px" : "10px" }}>
                {label.customerCity}
                {label.customerProvince ? `, ${label.customerProvince}` : ""}
                {label.postalCode ? ` ${label.postalCode}` : ""}
              </div>
            </td>

            {/* COLUMN 2: Brand / Shipper Info */}
            <td style={cellStyle()}>
              <div style={headerStyle()}>Ship From</div>
              <div style={{ fontWeight: 600, fontSize: compact ? "7px" : "9px", marginBottom: "1px" }}>
                {label.brandName}
              </div>
              {label.brandPhone && <div style={{ marginBottom: "1px" }}>{label.brandPhone}</div>}
              {label.brandAddress && (
                <div style={{
                  fontSize: compact ? "5.5px" : "6.5px",
                  lineHeight: "1.2",
                  maxHeight: compact ? "20px" : "24px",
                  overflow: "hidden",
                }}>
                  {label.brandAddress}
                </div>
              )}
              {label.brandCity && (
                <div style={{ fontWeight: 600, marginTop: "1px" }}>{label.brandCity}</div>
              )}
            </td>

            {/* COLUMN 3: Parcel Info */}
            <td style={cellStyle({ borderRight: "none" })}>
              <div style={headerStyle()}>Parcel Info</div>
              <div style={{
                display: "flex",
                justifyContent: "space-between",
                gap: "4px",
                marginBottom: "2px",
              }}>
                <div>
                  <span style={{ fontSize: compact ? "5.5px" : "6.5px", color: "#666" }}>Pieces</span>
                  <div style={{ fontWeight: 700 }}>{label.pieces}</div>
                </div>
                <div>
                  <span style={{ fontSize: compact ? "5.5px" : "6.5px", color: "#666" }}>Weight</span>
                  <div style={{ fontWeight: 700 }}>{label.weight} kg</div>
                </div>
                <div>
                  <span style={{ fontSize: compact ? "5.5px" : "6.5px", color: "#666" }}>Qty</span>
                  <div style={{ fontWeight: 700 }}>{label.totalQuantity}</div>
                </div>
              </div>
              <div style={{
                background: isCOD ? "#000" : "#16a34a",
                color: "#fff",
                textAlign: "center",
                padding: compact ? "2px" : "3px",
                fontWeight: 700,
                fontSize: codSize,
                letterSpacing: "0.5px",
              }}>
                {isCOD ? `COD: Rs ${formatCOD(label.codAmount)}` : "PREPAID"}
              </div>
            </td>
          </tr>
        </tbody>
      </table>

      {/* TRACKING BARCODE ROW */}
      <div style={{
        borderBottom: "1px solid #000",
        padding: compact ? "3px 5px" : "4px 8px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: "8px",
      }}>
        <div style={{ flex: 1, textAlign: "center" }}>
          <BarcodeCanvas value={label.trackingNumber} height={barcodeH} />
          <div style={{ fontSize: compact ? "7px" : "9px", fontWeight: 700, letterSpacing: "1px", marginTop: "1px" }}>
            {label.trackingNumber}
          </div>
        </div>
        <QRCodeCanvas value={label.trackingNumber || "N/A"} size={qrSize} />
      </div>

      {/* ORDER BARCODE ROW */}
      <div style={{
        borderBottom: "1px solid #000",
        padding: compact ? "2px 5px" : "3px 8px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: "8px",
      }}>
        <div style={{ flex: 1 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1px" }}>
            <div>
              <span style={{ fontSize: compact ? "5.5px" : "6.5px", color: "#666" }}>ORDER </span>
              <span style={{ fontWeight: 700, fontSize: compact ? "8px" : "10px" }}>#{label.orderNumber}</span>
            </div>
            <div>
              <span style={{ fontSize: compact ? "5.5px" : "6.5px", color: "#666" }}>DATE </span>
              <span style={{ fontWeight: 600, fontSize: compact ? "7px" : "8px" }}>{label.orderDate || label.bookedAt}</span>
            </div>
            <div>
              <span style={{ fontSize: compact ? "5.5px" : "6.5px", color: "#666" }}>COURIER </span>
              <span style={{ fontWeight: 600, fontSize: compact ? "7px" : "8px" }}>{label.courierName}</span>
            </div>
          </div>
        </div>
      </div>

      {/* BOTTOM: 2 columns — Remarks + Products */}
      <table
        style={{
          width: "100%",
          borderCollapse: "collapse",
          tableLayout: "fixed",
        }}
      >
        <colgroup>
          <col style={{ width: "35%" }} />
          <col style={{ width: "65%" }} />
        </colgroup>
        <tbody>
          <tr>
            {/* REMARKS */}
            <td style={{
              borderRight: "1px solid #000",
              padding: sectionPad,
              verticalAlign: "top",
              fontSize,
              lineHeight: "1.3",
            }}>
              <div style={headerStyle()}>Remarks</div>
              <div style={{
                maxHeight: compact ? "22px" : "30px",
                overflow: "hidden",
                fontSize: compact ? "6px" : "7px",
                lineHeight: "1.25",
              }}>
                {label.remark || "—"}
              </div>
            </td>

            {/* PRODUCTS */}
            <td style={{
              padding: sectionPad,
              verticalAlign: "top",
              fontSize,
              lineHeight: "1.3",
            }}>
              <div style={headerStyle()}>Products</div>
              {label.products.length > 0 ? (
                <div style={{
                  maxHeight: compact ? "22px" : "30px",
                  overflow: "hidden",
                }}>
                  {label.products.map((p, i) => (
                    <div key={i} style={{
                      fontSize: compact ? "5.5px" : "6.5px",
                      lineHeight: "1.2",
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}>
                      {p.qty}x {p.name}{p.sku ? ` (${p.sku})` : ""}
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ fontSize: compact ? "5.5px" : "6.5px", color: "#666" }}>
                  {label.itemSummary || "—"}
                </div>
              )}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

interface AWBLabelsProps {
  labels: LabelData[];
  labelsPerPage?: LabelsPerPage;
  onReady?: () => void;
}

export default function AWBLabels({ labels, labelsPerPage = 2, onReady }: AWBLabelsProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const timer = setTimeout(() => {
      onReady?.();
    }, 500);
    return () => clearTimeout(timer);
  }, [labels, onReady]);

  const compact = labelsPerPage >= 3;

  const pageHeight = (() => {
    switch (labelsPerPage) {
      case 1: return "100%";
      case 2: return "49%";
      case 3: return "32%";
      case 4: return "24%";
    }
  })();

  return (
    <div ref={containerRef} data-testid="awb-labels-container">
      {labels.map((label, idx) => (
        <div
          key={idx}
          style={{
            height: pageHeight,
            marginBottom: labelsPerPage === 1 ? "0" : "4px",
            pageBreakAfter: (idx + 1) % labelsPerPage === 0 ? "always" : "auto",
            boxSizing: "border-box",
          }}
          data-testid={`awb-label-wrapper-${idx}`}
        >
          <SingleLabel label={label} compact={compact} />
        </div>
      ))}
    </div>
  );
}

export function PrintLabelsButton({
  batchId,
  orderIds,
  labelsPerPage = 2,
  variant = "default",
  size = "sm",
  children,
  className = "",
}: {
  batchId?: string;
  orderIds?: string[];
  labelsPerPage?: LabelsPerPage;
  variant?: "default" | "outline" | "ghost";
  size?: "sm" | "default" | "lg" | "icon";
  children?: React.ReactNode;
  className?: string;
}) {
  const handlePrint = useCallback(async () => {
    let url: string;
    if (batchId) {
      url = `/api/print/label-data/batch/${batchId}`;
    } else if (orderIds && orderIds.length > 0) {
      url = `/api/print/label-data/orders?ids=${orderIds.join(",")}`;
    } else {
      return;
    }

    try {
      const resp = await fetch(url, { credentials: "include" });
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({ message: "Failed" }));
        alert(err.message || "Failed to fetch label data");
        return;
      }
      const data = await resp.json();
      if (!data.labels || data.labels.length === 0) {
        alert("No labels to print");
        return;
      }

      const printWindow = window.open("", "_blank", "width=800,height=600");
      if (!printWindow) {
        alert("Popup blocked. Please allow popups for this site.");
        return;
      }

      printWindow.document.write(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>AWB Labels</title>
          <style>
            @page {
              size: A4;
              margin: 8mm;
            }
            * {
              box-sizing: border-box;
              margin: 0;
              padding: 0;
            }
            body {
              font-family: Arial, Helvetica, sans-serif;
              -webkit-print-color-adjust: exact;
              print-color-adjust: exact;
            }
            .label-page {
              page-break-after: always;
              display: flex;
              flex-direction: column;
              gap: 4px;
              height: 277mm;
            }
            .label-page:last-child {
              page-break-after: auto;
            }
            .label-slot {
              flex: 1;
              overflow: hidden;
            }
            .loading-msg {
              text-align: center;
              padding: 40px;
              font-size: 16px;
              color: #666;
            }
            @media print {
              .no-print { display: none !important; }
            }
          </style>
        </head>
        <body>
          <div class="no-print" style="padding: 12px; background: #f5f5f5; border-bottom: 1px solid #ddd; display: flex; align-items: center; gap: 12px;">
            <button onclick="window.print()" style="padding: 8px 20px; background: #000; color: #fff; border: none; border-radius: 4px; cursor: pointer; font-size: 14px;">
              Print Labels
            </button>
            <span style="color: #666; font-size: 13px;">${data.labels.length} label(s) | ${labelsPerPage} per page</span>
            <button onclick="window.close()" style="margin-left: auto; padding: 6px 14px; background: #fff; border: 1px solid #ccc; border-radius: 4px; cursor: pointer; font-size: 13px;">
              Close
            </button>
          </div>
          <div id="label-root">
            <div class="loading-msg">Generating labels...</div>
          </div>
        </body>
        </html>
      `);
      printWindow.document.close();

      const labelDataStr = JSON.stringify(data.labels);
      const scriptEl = printWindow.document.createElement("script");
      scriptEl.type = "module";
      scriptEl.textContent = `
        const labels = ${labelDataStr};
        const perPage = ${labelsPerPage};
        const compact = perPage >= 3;

        function formatCOD(amount) {
          const num = typeof amount === "string" ? parseFloat(amount) : amount;
          if (isNaN(num)) return "0";
          return num.toLocaleString("en-PK", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
        }

        function renderLabel(label) {
          const fontSize = compact ? "6.5px" : "8px";
          const headerSize = compact ? "7.5px" : "9px";
          const codSize = compact ? "12px" : "16px";
          const sectionPad = compact ? "2px 3px" : "3px 5px";
          const isCOD = !label.paymentMethod || label.paymentMethod.toUpperCase() === "COD" || label.paymentMethod.toUpperCase() === "CASH ON DELIVERY";

          const productsHtml = label.products && label.products.length > 0
            ? label.products.map(p => '<div style="font-size:' + (compact ? '5.5px' : '6.5px') + ';line-height:1.2;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + p.qty + 'x ' + p.name + (p.sku ? ' (' + p.sku + ')' : '') + '</div>').join('')
            : '<div style="font-size:' + (compact ? '5.5px' : '6.5px') + ';color:#666">' + (label.itemSummary || '—') + '</div>';

          return '<div style="border:2px solid #000;font-family:Arial,Helvetica,sans-serif;color:#000;background:#fff;width:100%;box-sizing:border-box;height:100%;">'
            + '<table style="width:100%;border-collapse:collapse;table-layout:fixed;">'
            + '<colgroup><col style="width:40%"><col style="width:30%"><col style="width:30%"></colgroup>'
            + '<tbody><tr>'
            + '<td style="border-right:1px solid #000;border-bottom:1px solid #000;padding:' + sectionPad + ';vertical-align:top;font-size:' + fontSize + ';line-height:1.3;">'
              + '<div style="font-size:' + headerSize + ';font-weight:700;margin-bottom:' + (compact ? '1px' : '2px') + ';text-transform:uppercase;letter-spacing:0.3px;">Ship To</div>'
              + '<div style="font-weight:700;font-size:' + (compact ? '8px' : '10px') + ';margin-bottom:2px;">' + label.customerName + '</div>'
              + '<div style="margin-bottom:1px;">' + label.customerPhone + '</div>'
              + '<div style="font-size:' + (compact ? '6px' : '7px') + ';line-height:1.25;max-height:' + (compact ? '28px' : '36px') + ';overflow:hidden;margin-bottom:2px;">' + label.customerAddress + '</div>'
              + '<div style="font-weight:700;font-size:' + (compact ? '8px' : '10px') + ';">' + label.customerCity + (label.customerProvince ? ', ' + label.customerProvince : '') + (label.postalCode ? ' ' + label.postalCode : '') + '</div>'
            + '</td>'
            + '<td style="border-right:1px solid #000;border-bottom:1px solid #000;padding:' + sectionPad + ';vertical-align:top;font-size:' + fontSize + ';line-height:1.3;">'
              + '<div style="font-size:' + headerSize + ';font-weight:700;margin-bottom:' + (compact ? '1px' : '2px') + ';text-transform:uppercase;letter-spacing:0.3px;">Ship From</div>'
              + '<div style="font-weight:600;font-size:' + (compact ? '7px' : '9px') + ';margin-bottom:1px;">' + label.brandName + '</div>'
              + (label.brandPhone ? '<div style="margin-bottom:1px;">' + label.brandPhone + '</div>' : '')
              + (label.brandAddress ? '<div style="font-size:' + (compact ? '5.5px' : '6.5px') + ';line-height:1.2;max-height:' + (compact ? '20px' : '24px') + ';overflow:hidden;">' + label.brandAddress + '</div>' : '')
              + (label.brandCity ? '<div style="font-weight:600;margin-top:1px;">' + label.brandCity + '</div>' : '')
            + '</td>'
            + '<td style="border-bottom:1px solid #000;padding:' + sectionPad + ';vertical-align:top;font-size:' + fontSize + ';line-height:1.3;">'
              + '<div style="font-size:' + headerSize + ';font-weight:700;margin-bottom:' + (compact ? '1px' : '2px') + ';text-transform:uppercase;letter-spacing:0.3px;">Parcel Info</div>'
              + '<div style="display:flex;justify-content:space-between;gap:4px;margin-bottom:2px;">'
                + '<div><span style="font-size:' + (compact ? '5.5px' : '6.5px') + ';color:#666;">Pieces</span><div style="font-weight:700;">' + label.pieces + '</div></div>'
                + '<div><span style="font-size:' + (compact ? '5.5px' : '6.5px') + ';color:#666;">Weight</span><div style="font-weight:700;">' + label.weight + ' kg</div></div>'
                + '<div><span style="font-size:' + (compact ? '5.5px' : '6.5px') + ';color:#666;">Qty</span><div style="font-weight:700;">' + label.totalQuantity + '</div></div>'
              + '</div>'
              + '<div style="background:' + (isCOD ? '#000' : '#16a34a') + ';color:#fff;text-align:center;padding:' + (compact ? '2px' : '3px') + ';font-weight:700;font-size:' + codSize + ';letter-spacing:0.5px;">'
                + (isCOD ? 'COD: Rs ' + formatCOD(label.codAmount) : 'PREPAID')
              + '</div>'
            + '</td>'
            + '</tr></tbody></table>'
            + '<div style="border-bottom:1px solid #000;padding:' + (compact ? '3px 5px' : '4px 8px') + ';display:flex;align-items:center;justify-content:space-between;gap:8px;">'
              + '<div style="flex:1;text-align:center;">'
                + '<canvas class="barcode" data-value="' + label.trackingNumber + '" data-height="' + (compact ? 28 : 40) + '"></canvas>'
                + '<div style="font-size:' + (compact ? '7px' : '9px') + ';font-weight:700;letter-spacing:1px;margin-top:1px;">' + label.trackingNumber + '</div>'
              + '</div>'
              + '<canvas class="qrcode" data-value="' + label.trackingNumber + '" data-size="' + (compact ? 45 : 60) + '"></canvas>'
            + '</div>'
            + '<div style="border-bottom:1px solid #000;padding:' + (compact ? '2px 5px' : '3px 8px') + ';display:flex;align-items:center;justify-content:space-between;gap:8px;">'
              + '<div style="flex:1;">'
                + '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1px;">'
                  + '<div><span style="font-size:' + (compact ? '5.5px' : '6.5px') + ';color:#666;">ORDER </span><span style="font-weight:700;font-size:' + (compact ? '8px' : '10px') + ';">#' + label.orderNumber + '</span></div>'
                  + '<div><span style="font-size:' + (compact ? '5.5px' : '6.5px') + ';color:#666;">DATE </span><span style="font-weight:600;font-size:' + (compact ? '7px' : '8px') + ';">' + (label.orderDate || label.bookedAt) + '</span></div>'
                  + '<div><span style="font-size:' + (compact ? '5.5px' : '6.5px') + ';color:#666;">COURIER </span><span style="font-weight:600;font-size:' + (compact ? '7px' : '8px') + ';">' + label.courierName + '</span></div>'
                + '</div>'
              + '</div>'
            + '</div>'
            + '<table style="width:100%;border-collapse:collapse;table-layout:fixed;">'
            + '<colgroup><col style="width:35%"><col style="width:65%"></colgroup>'
            + '<tbody><tr>'
            + '<td style="border-right:1px solid #000;padding:' + sectionPad + ';vertical-align:top;font-size:' + fontSize + ';line-height:1.3;">'
              + '<div style="font-size:' + headerSize + ';font-weight:700;margin-bottom:' + (compact ? '1px' : '2px') + ';text-transform:uppercase;letter-spacing:0.3px;">Remarks</div>'
              + '<div style="max-height:' + (compact ? '22px' : '30px') + ';overflow:hidden;font-size:' + (compact ? '6px' : '7px') + ';line-height:1.25;">' + (label.remark || '—') + '</div>'
            + '</td>'
            + '<td style="padding:' + sectionPad + ';vertical-align:top;font-size:' + fontSize + ';line-height:1.3;">'
              + '<div style="font-size:' + headerSize + ';font-weight:700;margin-bottom:' + (compact ? '1px' : '2px') + ';text-transform:uppercase;letter-spacing:0.3px;">Products</div>'
              + '<div style="max-height:' + (compact ? '22px' : '30px') + ';overflow:hidden;">' + productsHtml + '</div>'
            + '</td>'
            + '</tr></tbody></table>'
          + '</div>';
        }

        const root = document.getElementById("label-root");
        const pages = [];
        for (let i = 0; i < labels.length; i += perPage) {
          const pageLabels = labels.slice(i, i + perPage);
          let pageHtml = '<div class="label-page">';
          for (const label of pageLabels) {
            pageHtml += '<div class="label-slot">' + renderLabel(label) + '</div>';
          }
          pageHtml += '</div>';
          pages.push(pageHtml);
        }
        root.innerHTML = pages.join('');

        // Render barcodes
        const barcodeEls = document.querySelectorAll("canvas.barcode");
        for (const el of barcodeEls) {
          const val = el.getAttribute("data-value");
          const h = parseInt(el.getAttribute("data-height") || "40");
          if (val) {
            try {
              const JsBarcode = (await import("https://cdn.jsdelivr.net/npm/jsbarcode@3.11.6/+esm")).default;
              JsBarcode(el, val, { format: "CODE128", width: 1.5, height: h, displayValue: false, margin: 0 });
            } catch(e) { console.error("Barcode error:", e); }
          }
        }

        // Render QR codes
        const qrEls = document.querySelectorAll("canvas.qrcode");
        for (const el of qrEls) {
          const val = el.getAttribute("data-value");
          const size = parseInt(el.getAttribute("data-size") || "60");
          if (val) {
            try {
              const QRCode = (await import("https://cdn.jsdelivr.net/npm/qrcode@1.5.4/+esm")).default;
              await QRCode.toCanvas(el, val, { width: size, margin: 0, errorCorrectionLevel: "M" });
              el.style.width = size + "px";
              el.style.height = size + "px";
            } catch(e) { console.error("QR error:", e); }
          }
        }
      `;
      printWindow.document.body.appendChild(scriptEl);
    } catch (err) {
      console.error("Print error:", err);
      alert("Failed to generate labels");
    }
  }, [batchId, orderIds, labelsPerPage]);

  return null;
}

export { SingleLabel };
export type { LabelsPerPage };
