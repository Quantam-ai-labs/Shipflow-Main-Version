import { useEffect, useRef } from "react";
import JsBarcode from "jsbarcode";
import QRCode from "qrcode";
import leopardsLogoUrl from "@assets/imgi_1_LCS-Main-Logo-300x128_1771073319000.png";

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
  weight: number;
  pieces: number;
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
}

function BarcodeCanvas({ value, height = 40, width = 1.5 }: { value: string; height?: number; width?: number }) {
  const ref = useRef<SVGSVGElement>(null);
  useEffect(() => {
    if (ref.current && value) {
      try {
        JsBarcode(ref.current, value, {
          format: "CODE128",
          width,
          height,
          displayValue: false,
          margin: 0,
        });
      } catch {}
    }
  }, [value, height, width]);
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

const B = "1px solid #222";
const BT = "0.5px solid #222";

export function AwbLabel({ data }: AwbLabelProps) {
  const formattedDate = data.bookedAt
    ? new Date(data.bookedAt).toLocaleDateString("en-GB")
    : data.orderDate
      ? new Date(data.orderDate).toLocaleDateString("en-GB")
      : "";

  const isLeopards = data.courierName?.toLowerCase().includes("leopard");
  const courierDisplay = data.courierName
    ? data.courierName.charAt(0).toUpperCase() + data.courierName.slice(1)
    : "N/A";

  const prodText = data.products.length > 0
    ? data.products.map((p) => `${p.name}${p.variant ? ` (${p.variant})` : ""} x${p.qty}`).join(", ")
    : data.itemSummary || "-";

  return (
    <div data-testid={`awb-label-${data.orderId}`} style={{
      width: "100%",
      fontFamily: "'Helvetica', 'Arial', sans-serif",
      fontSize: "8px",
      lineHeight: 1.3,
      color: "#111",
      background: "#fff",
      border: B,
      boxSizing: "border-box",
      pageBreakInside: "avoid",
      overflow: "hidden",
    }}>
      {/* Header Row */}
      <div style={{ display: "flex", borderBottom: B }}>
        <div style={{ flex: "0 0 34%", borderRight: B, padding: "3px 0", textAlign: "center", fontWeight: 700, fontSize: "9px" }}>
          Customer Information
        </div>
        <div style={{ flex: "0 0 33%", borderRight: B, padding: "3px 0", textAlign: "center", fontWeight: 700, fontSize: "9px" }}>
          Brand Information
        </div>
        <div style={{ flex: "0 0 33%", padding: "3px 0", textAlign: "center", fontWeight: 700, fontSize: "9px" }}>
          Parcel Information
        </div>
      </div>

      {/* Main 3-Column Content */}
      <div style={{ display: "flex", borderBottom: B }}>
        {/* Column 1: Customer Information */}
        <div style={{ flex: "0 0 34%", borderRight: B, display: "flex", flexDirection: "column" }}>
          <div style={{ padding: "4px 5px", flex: 1 }}>
            <div style={{ marginBottom: 2 }}>
              <span style={{ fontWeight: 700, fontSize: "8px" }}>Name: </span>
              <span style={{ fontSize: "8px" }}>{data.customerName?.substring(0, 30)}</span>
            </div>
            <div style={{ marginBottom: 2 }}>
              <span style={{ fontWeight: 700, fontSize: "8px" }}>Phone: </span>
              <span style={{ fontSize: "8px" }}>{data.customerPhone}</span>
            </div>
            <div style={{ marginBottom: 2 }}>
              <span style={{ fontWeight: 700, fontSize: "8px" }}>Address:</span>
            </div>
            <div style={{ fontSize: "8px", maxHeight: 36, overflow: "hidden", marginBottom: 2 }}>
              {data.shippingAddress}
            </div>
          </div>

          {/* Destination */}
          <div style={{ borderTop: BT, padding: "3px 5px" }}>
            <span style={{ fontWeight: 700, fontSize: "8px" }}>Destination: </span>
            <span style={{ fontSize: "8px" }}>{data.city}</span>
          </div>

          {/* Order + Barcodes */}
          <div style={{ borderTop: BT, padding: "4px 5px" }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 4, marginBottom: 4 }}>
              <span style={{ fontWeight: 700, fontSize: "15px" }}>Order:</span>
              <span style={{ fontWeight: 700, fontSize: "15px" }}>{data.orderNumber}</span>
            </div>
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
              <div style={{ maxWidth: "60%" }}>
                {data.orderNumber && <BarcodeCanvas value={data.orderNumber} height={20} width={1} />}
              </div>
              <div>
                {data.orderNumber && <QRCanvas value={data.orderNumber} size={30} />}
              </div>
            </div>
          </div>
        </div>

        {/* Column 2: Brand Information */}
        <div style={{ flex: "0 0 33%", borderRight: B, display: "flex", flexDirection: "column" }}>
          <div style={{ padding: "4px 5px" }}>
            <div style={{ marginBottom: 2 }}>
              <span style={{ fontWeight: 700, fontSize: "8px" }}>Shipper: </span>
              <span style={{ fontSize: "8px" }}>{data.shipper.name?.substring(0, 25)}</span>
            </div>
            <div style={{ marginBottom: 2 }}>
              <span style={{ fontWeight: 700, fontSize: "8px" }}>Shipper Address:</span>
            </div>
            <div style={{ fontSize: "8px", maxHeight: 22, overflow: "hidden" }}>
              {data.shipper.address}
            </div>
          </div>

          {/* Amount Section */}
          <div style={{ borderTop: BT, padding: "6px 5px", flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
            <div style={{ fontWeight: 700, fontSize: "14px", marginBottom: 6, textAlign: "center" }}>
              Amount: Rs {data.codAmount.toLocaleString()}
            </div>
            <div style={{ width: "80%" }}>
              <BarcodeCanvas value={String(Math.round(data.codAmount))} height={22} width={1.2} />
            </div>
          </div>
        </div>

        {/* Column 3: Parcel Information */}
        <div style={{ flex: "0 0 33%", display: "flex", flexDirection: "column" }}>
          {/* Courier Logo / Name */}
          <div style={{ padding: "4px 5px", display: "flex", justifyContent: "center", alignItems: "center", minHeight: 30 }}>
            {isLeopards ? (
              <img src={leopardsLogoUrl} alt="Leopards" style={{ maxWidth: 70, maxHeight: 28, objectFit: "contain" }} />
            ) : (
              <span style={{ fontWeight: 700, fontSize: "16px" }}>{courierDisplay}</span>
            )}
          </div>

          {/* Tracking QR */}
          <div style={{ display: "flex", justifyContent: "flex-end", padding: "0 5px 2px" }}>
            {data.trackingNumber && <QRCanvas value={data.trackingNumber} size={35} />}
          </div>

          {/* Tracking Barcode */}
          <div style={{ borderTop: BT, padding: "4px 5px", textAlign: "center" }}>
            {data.trackingNumber && (
              <>
                <div style={{ width: "100%" }}>
                  <BarcodeCanvas value={data.trackingNumber} height={28} width={1.2} />
                </div>
                <div style={{ fontSize: "9px", fontFamily: "monospace", letterSpacing: "0.5px", marginTop: 1 }}>
                  {data.trackingNumber}
                </div>
              </>
            )}
          </div>

          {/* Service Info Grid */}
          <div style={{ borderTop: BT }}>
            <div style={{ display: "flex", justifyContent: "space-between", padding: "2px 5px" }}>
              <div><span style={{ fontWeight: 700, fontSize: "8px" }}>Service: </span><span style={{ fontSize: "8px" }}>Overnight</span></div>
              <div><span style={{ fontWeight: 700, fontSize: "8px" }}>Fragile: </span><span style={{ fontSize: "8px" }}>yes</span></div>
            </div>
          </div>
          <div style={{ borderTop: BT }}>
            <div style={{ display: "flex", justifyContent: "space-between", padding: "2px 5px" }}>
              <div><span style={{ fontWeight: 700, fontSize: "8px" }}>Date: </span><span style={{ fontSize: "8px" }}>{formattedDate}</span></div>
              <div><span style={{ fontWeight: 700, fontSize: "8px" }}>Weight: </span><span style={{ fontSize: "8px" }}>{data.weight} (Grams)</span></div>
            </div>
          </div>
          <div style={{ borderTop: BT }}>
            <div style={{ display: "flex", justifyContent: "space-between", padding: "2px 5px" }}>
              <div><span style={{ fontWeight: 700, fontSize: "8px" }}>Pieces: </span><span style={{ fontSize: "8px" }}>{data.pieces}</span></div>
              <div><span style={{ fontWeight: 700, fontSize: "8px" }}>Qty: </span><span style={{ fontSize: "8px" }}>{data.totalQuantity}</span></div>
            </div>
          </div>
        </div>
      </div>

      {/* Remarks Row */}
      <div style={{ borderBottom: B, padding: "3px 5px" }}>
        <span style={{ fontWeight: 700, fontSize: "8px" }}>Remarks: </span>
        <span style={{ fontSize: "8px" }}>- {data.remark || ""}</span>
      </div>

      {/* Products Row */}
      <div style={{ padding: "3px 5px" }}>
        <span style={{ fontWeight: 700, fontSize: "8px" }}>Products: </span>
        <span style={{ fontSize: "8px" }}>{prodText.substring(0, 120)}</span>
      </div>
    </div>
  );
}

export default AwbLabel;
