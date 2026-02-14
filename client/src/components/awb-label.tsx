import { useEffect, useRef } from "react";
import JsBarcode from "jsbarcode";
import QRCode from "qrcode";

export interface LabelData {
  orderId: string;
  orderNumber: string;
  trackingNumber: string;
  courierName: string;
  customerName: string;
  customerPhone: string;
  customerEmail: string;
  shippingAddress: string;
  city: string;
  province: string;
  postalCode: string;
  country: string;
  totalAmount: number;
  codAmount: number;
  isCOD: boolean;
  totalQuantity: number;
  itemSummary: string;
  remark: string;
  products: { name: string; qty: number; sku: string; variant: string }[];
  orderDate: string | null;
  bookedAt: string | null;
  slipUrl: string;
  shipper: {
    name: string;
    phone: string;
    address: string;
    city: string;
    logoUrl: string;
  };
}

interface AwbLabelProps {
  data: LabelData;
  pieces?: number;
}

function BarcodeCanvas({ value, height = 40 }: { value: string; height?: number }) {
  const ref = useRef<SVGSVGElement>(null);
  useEffect(() => {
    if (ref.current && value) {
      try {
        JsBarcode(ref.current, value, {
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
  return <svg ref={ref} />;
}

function QRCanvas({ value, size = 70 }: { value: string; size?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (ref.current && value) {
      QRCode.toCanvas(ref.current, value, {
        width: size,
        margin: 0,
        errorCorrectionLevel: "M",
      });
    }
  }, [value, size]);
  return <canvas ref={ref} style={{ width: size, height: size }} />;
}

export function AwbLabel({ data, pieces = 1 }: AwbLabelProps) {
  const courierDisplay = data.courierName
    ? data.courierName.charAt(0).toUpperCase() + data.courierName.slice(1)
    : "N/A";
  const paymentType = data.isCOD ? "COD" : "PREPAID";
  const formattedDate = data.bookedAt
    ? new Date(data.bookedAt).toLocaleDateString("en-PK", { day: "2-digit", month: "short", year: "numeric" })
    : data.orderDate
      ? new Date(data.orderDate).toLocaleDateString("en-PK", { day: "2-digit", month: "short", year: "numeric" })
      : "";

  return (
    <div className="awb-label" style={{
      width: "100%",
      fontFamily: "'Arial', 'Helvetica', sans-serif",
      fontSize: "11px",
      lineHeight: 1.3,
      color: "#000",
      background: "#fff",
      border: "2px solid #000",
      boxSizing: "border-box",
      pageBreakInside: "avoid",
      overflow: "hidden",
    }}>
      {/* TOP SECTION: 3 columns */}
      <div style={{ display: "flex", borderBottom: "2px solid #000" }}>
        {/* Col 1: Customer Info */}
        <div style={{ flex: "1 1 38%", padding: "8px 10px", borderRight: "2px solid #000" }}>
          <div style={{ fontSize: "9px", fontWeight: 700, textTransform: "uppercase", color: "#666", marginBottom: 4, letterSpacing: "0.5px" }}>
            Ship To
          </div>
          <div style={{ fontSize: "14px", fontWeight: 700, marginBottom: 3 }}>{data.customerName}</div>
          <div style={{ fontSize: "11px", marginBottom: 2 }}>{data.customerPhone}</div>
          <div style={{ fontSize: "10px", color: "#333", marginBottom: 4, maxHeight: 48, overflow: "hidden" }}>
            {data.shippingAddress}
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <span style={{ fontSize: "12px", fontWeight: 700 }}>{data.city}</span>
            {data.province && <span style={{ fontSize: "10px", color: "#555" }}>{data.province}</span>}
          </div>
        </div>

        {/* Col 2: Brand / Shipper Info */}
        <div style={{ flex: "1 1 30%", padding: "8px 10px", borderRight: "2px solid #000", display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
          <div>
            <div style={{ fontSize: "9px", fontWeight: 700, textTransform: "uppercase", color: "#666", marginBottom: 4, letterSpacing: "0.5px" }}>
              Ship From
            </div>
            <div style={{ fontSize: "12px", fontWeight: 700, marginBottom: 2 }}>{data.shipper.name}</div>
            <div style={{ fontSize: "10px", color: "#333", marginBottom: 1 }}>{data.shipper.phone}</div>
            <div style={{ fontSize: "9px", color: "#555", maxHeight: 28, overflow: "hidden" }}>{data.shipper.address}</div>
            <div style={{ fontSize: "10px", fontWeight: 600, marginTop: 2 }}>{data.shipper.city}</div>
          </div>
          <div style={{ marginTop: 6 }}>
            <div style={{ fontSize: "9px", color: "#666", marginBottom: 2 }}>Courier</div>
            <div style={{ fontSize: "13px", fontWeight: 700, textTransform: "uppercase" }}>{courierDisplay}</div>
          </div>
        </div>

        {/* Col 3: Parcel Info */}
        <div style={{ flex: "1 1 32%", padding: "8px 10px", display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6 }}>
              <div>
                <div style={{ fontSize: "9px", fontWeight: 700, textTransform: "uppercase", color: "#666", letterSpacing: "0.5px" }}>Order</div>
                <div style={{ fontSize: "13px", fontWeight: 700 }}>{data.orderNumber}</div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: "9px", color: "#666" }}>Date</div>
                <div style={{ fontSize: "10px" }}>{formattedDate}</div>
              </div>
            </div>

            {/* Payment info */}
            <div style={{
              display: "inline-block",
              padding: "2px 8px",
              fontSize: "11px",
              fontWeight: 700,
              background: data.isCOD ? "#000" : "#fff",
              color: data.isCOD ? "#fff" : "#000",
              border: "1.5px solid #000",
              marginBottom: 4,
            }}>
              {paymentType}
            </div>

            <div style={{ display: "flex", justifyContent: "space-between", gap: 6, marginTop: 4 }}>
              <div>
                <div style={{ fontSize: "9px", color: "#666" }}>Amount</div>
                <div style={{ fontSize: "14px", fontWeight: 700 }}>Rs. {data.codAmount.toLocaleString()}</div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: "9px", color: "#666" }}>Pcs</div>
                <div style={{ fontSize: "14px", fontWeight: 700 }}>{pieces}</div>
              </div>
            </div>
          </div>

          <div style={{ fontSize: "9px", color: "#666", marginTop: 4 }}>
            Qty: {data.totalQuantity} items
          </div>
        </div>
      </div>

      {/* TRACKING BARCODE ROW */}
      <div style={{ borderBottom: "2px solid #000", padding: "6px 10px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        <div style={{ flex: 1, textAlign: "center" }}>
          {data.trackingNumber ? (
            <>
              <BarcodeCanvas value={data.trackingNumber} height={36} />
              <div style={{ fontSize: "12px", fontWeight: 700, fontFamily: "monospace", letterSpacing: "1px", marginTop: 2 }}>
                {data.trackingNumber}
              </div>
            </>
          ) : (
            <div style={{ fontSize: "11px", color: "#999", padding: "10px 0" }}>No tracking number</div>
          )}
        </div>
        <div style={{ flexShrink: 0 }}>
          {data.trackingNumber && (
            <QRCanvas
              value={data.courierName === "leopards"
                ? `https://leopardscourier.com/tracking/?tracking_number=${data.trackingNumber}`
                : data.courierName === "postex"
                  ? `https://postex.pk/tracking/${data.trackingNumber}`
                  : data.trackingNumber}
              size={56}
            />
          )}
        </div>
      </div>

      {/* BOTTOM SECTION: 2 rows */}
      {/* Row 1: Remarks */}
      <div style={{ borderBottom: "1px solid #999", padding: "4px 10px", minHeight: 20 }}>
        <span style={{ fontSize: "9px", fontWeight: 700, color: "#666", textTransform: "uppercase", marginRight: 6 }}>Remarks:</span>
        <span style={{ fontSize: "10px" }}>{data.remark || "-"}</span>
      </div>

      {/* Row 2: Products */}
      <div style={{ padding: "4px 10px", minHeight: 20 }}>
        <span style={{ fontSize: "9px", fontWeight: 700, color: "#666", textTransform: "uppercase", marginRight: 6 }}>Items:</span>
        <span style={{ fontSize: "10px" }}>
          {data.products.length > 0
            ? data.products.map((p, i) => (
                <span key={i}>
                  {i > 0 && " | "}
                  {p.name}{p.variant ? ` (${p.variant})` : ""} x{p.qty}
                </span>
              ))
            : data.itemSummary || "-"}
        </span>
      </div>
    </div>
  );
}

export default AwbLabel;
