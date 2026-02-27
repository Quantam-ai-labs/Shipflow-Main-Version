import { useEffect, useState, useCallback } from "react";
import { useLocation } from "wouter";
import { AwbLabel, type LabelData } from "@/components/awb-label";
import { Button } from "@/components/ui/button";
import { Printer, ArrowLeft, Grid2x2, Grid3x3, LayoutGrid, Square } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";

type LayoutMode = 1 | 2 | 3 | 4;

export default function PrintLabels() {
  const [, navigate] = useLocation();
  const [labels, setLabels] = useState<LabelData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [layout, setLayout] = useState<LayoutMode>(3);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const idsParam = params.get("ids");
    if (!idsParam) {
      setError("No order IDs provided");
      setLoading(false);
      return;
    }
    const orderIds = idsParam.split(",").filter(Boolean);
    if (orderIds.length === 0) {
      setError("No valid order IDs");
      setLoading(false);
      return;
    }

    apiRequest("POST", "/api/labels/data", { orderIds })
      .then((r) => r.json())
      .then((data) => {
        setLabels(data.labels || []);
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message || "Failed to load label data");
        setLoading(false);
      });
  }, []);

  const handlePrint = useCallback(() => {
    window.print();
  }, []);

  if (loading) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", fontFamily: "Arial, sans-serif" }}>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 18, marginBottom: 8 }}>Loading labels...</div>
          <div style={{ fontSize: 13, color: "#666" }}>Preparing {new URLSearchParams(window.location.search).get("ids")?.split(",").length || 0} labels</div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", fontFamily: "Arial, sans-serif" }}>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 18, color: "#dc2626", marginBottom: 12 }}>{error}</div>
          <Button onClick={() => navigate("/pipeline")} variant="outline" data-testid="button-back-pipeline">
            <ArrowLeft className="w-4 h-4 mr-2" />Back to Pipeline
          </Button>
        </div>
      </div>
    );
  }

  if (labels.length === 0) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", fontFamily: "Arial, sans-serif" }}>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 18, marginBottom: 12 }}>No labels to display</div>
          <Button onClick={() => navigate("/pipeline")} variant="outline" data-testid="button-back-pipeline-empty">
            <ArrowLeft className="w-4 h-4 mr-2" />Back to Pipeline
          </Button>
        </div>
      </div>
    );
  }

  const gridCols = layout === 1 ? 1 : layout === 2 ? 2 : layout === 3 ? 3 : 2;
  const gridRows = layout === 4 ? 2 : 1;

  return (
    <>
      <style>{`
        @media print {
          .print-toolbar { display: none !important; }
          body { margin: 0; padding: 0; }
          .print-page {
            page-break-after: always;
            page-break-inside: avoid;
            margin: 0;
            padding: 8mm;
            box-sizing: border-box;
          }
          .print-page:last-child { page-break-after: auto; }
          @page {
            size: A4;
            margin: 0;
          }
        }
        @media screen {
          .print-page {
            background: #fff;
            width: 210mm;
            min-height: 297mm;
            margin: 0 auto 16px;
            padding: 8mm;
            box-sizing: border-box;
            box-shadow: 0 1px 4px rgba(0,0,0,0.15);
          }
        }
      `}</style>

      {/* Toolbar - hidden on print */}
      <div className="print-toolbar" style={{
        position: "sticky",
        top: 0,
        zIndex: 100,
        background: "#f8f9fa",
        borderBottom: "1px solid #ddd",
        padding: "10px 20px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
        flexWrap: "wrap",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <Button onClick={() => navigate("/pipeline")} variant="ghost" size="sm" data-testid="button-back">
            <ArrowLeft className="w-4 h-4 mr-1" />Back
          </Button>
          <span style={{ fontSize: 14, fontWeight: 600 }}>{labels.length} Label{labels.length !== 1 ? "s" : ""}</span>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ fontSize: 12, color: "#666", marginRight: 4 }}>Per page:</span>
          {([1, 2, 3, 4] as LayoutMode[]).map((n) => (
            <Button
              key={n}
              size="sm"
              variant={layout === n ? "default" : "outline"}
              onClick={() => setLayout(n)}
              data-testid={`button-layout-${n}`}
            >
              {n === 1 && <Square className="w-3.5 h-3.5 mr-1" />}
              {n === 2 && <Grid2x2 className="w-3.5 h-3.5 mr-1" />}
              {n === 3 && <Grid3x3 className="w-3.5 h-3.5 mr-1" />}
              {n === 4 && <LayoutGrid className="w-3.5 h-3.5 mr-1" />}
              {n}
            </Button>
          ))}
        </div>

        <Button onClick={handlePrint} data-testid="button-print">
          <Printer className="w-4 h-4 mr-2" />Print Labels
        </Button>
      </div>

      {/* Label pages */}
      <div style={{ background: "#e5e7eb", minHeight: "calc(100vh - 52px)", padding: "16px 0" }}>
        {renderPages(labels, layout, gridCols, gridRows)}
      </div>
    </>
  );
}

function renderPages(labels: LabelData[], layout: LayoutMode, cols: number, rows: number) {
  const perPage = layout === 1 ? 1 : layout === 2 ? 2 : layout === 3 ? 3 : 4;
  const pages: LabelData[][] = [];

  for (let i = 0; i < labels.length; i += perPage) {
    pages.push(labels.slice(i, i + perPage));
  }

  return pages.map((pageLabels, pageIdx) => (
    <div key={pageIdx} className="print-page" data-testid={`print-page-${pageIdx}`}>
      {layout === 3 ? (
        <div style={{ display: "flex", flexDirection: "column", height: "100%", justifyContent: "flex-start" }}>
          {pageLabels.map((label, idx) => (
            <div key={label.orderId}>
              <AwbLabel data={label} />
              {idx < pageLabels.length - 1 && (
                <div style={{
                  borderTop: "1.5px dashed #999",
                  margin: "6px 0",
                }} />
              )}
            </div>
          ))}
        </div>
      ) : (
        <div style={{
          display: "grid",
          gridTemplateColumns: `repeat(${cols}, 1fr)`,
          gridTemplateRows: layout === 4 ? "repeat(2, 1fr)" : undefined,
          gap: layout === 1 ? 0 : 10,
          height: "100%",
          alignContent: "start",
        }}>
          {pageLabels.map((label) => (
            <div key={label.orderId}>
              <AwbLabel data={label} />
            </div>
          ))}
        </div>
      )}
    </div>
  ));
}
