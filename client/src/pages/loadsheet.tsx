import { useState, useEffect, useRef, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { DateRange } from "react-day-picker";
import { DateRangePicker, dateRangeToParams } from "@/components/date-range-picker";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Link } from "wouter";
import { formatPkDateTime } from "@/lib/dateFormat";
import {
  ClipboardList,
  Camera,
  Keyboard,
  CheckCircle2,
  XCircle,
  Trash2,
  RefreshCw,
  FileText,
  Package,
  Loader2,
  CameraOff,
  BookOpen,
  FileSpreadsheet,
  Truck,
  Printer,
  Download,
  Eye,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";

interface BookedShipment {
  id: string;
  orderNumber: string;
  courierTracking: string;
  customerName: string;
  city: string;
  totalAmount: string;
  courierName: string;
}

type ScanStatus = "valid" | "duplicate" | "not_found" | "dispatched" | "wrong_courier";

interface ScannedItem {
  id: string;
  orderNumber: string;
  trackingNumber: string;
  customerName: string;
  city: string;
  codAmount: number;
  courierName: string;
  scannedAt: Date;
}

interface ScanFeedback {
  status: ScanStatus;
  message: string;
  orderNumber?: string;
  customerName?: string;
}

interface BatchType {
  id: string;
  merchantId: string;
  createdByUserId: string | null;
  courierName: string;
  batchType: string;
  status: string;
  totalSelectedCount: number | null;
  successCount: number | null;
  failedCount: number | null;
  notes: string | null;
  pdfBatchPath: string | null;
  pdfBatchMeta: any;
  createdAt: string | null;
}

interface BatchesResponse {
  batches: BatchType[];
  total: number;
}

interface BatchItemType {
  id: string;
  batchId: string;
  orderId: string;
  orderNumber: string | null;
  bookingStatus: string;
  bookingError: string | null;
  trackingNumber: string | null;
  slipUrl: string | null;
  printRecordId: string | null;
  consigneeName: string | null;
  consigneePhone: string | null;
  consigneeCity: string | null;
  codAmount: string | null;
  createdAt: string | null;
}

interface BatchDetailResponse {
  batch: BatchType;
  items: BatchItemType[];
}

const courierOptions = [
  { value: "all", label: "All Couriers" },
  { value: "leopards", label: "Leopards" },
  { value: "postex", label: "PostEx" },
  { value: "tcs", label: "TCS" },
];

const BATCH_STATUS_COLORS: Record<string, string> = {
  "SUCCESS": "bg-green-500/10 text-green-600 border-green-500/20",
  "PARTIAL_SUCCESS": "bg-amber-500/10 text-amber-600 border-amber-500/20",
  "FAILED": "bg-red-500/10 text-red-600 border-red-500/20",
  "CREATED": "bg-blue-500/10 text-blue-600 border-blue-500/20",
};

function getBatchStatusBadge(status: string) {
  const color = BATCH_STATUS_COLORS[status] || "bg-muted text-muted-foreground";
  const label = status.replace(/_/g, " ");
  return <Badge className={color}>{label}</Badge>;
}

function Pagination({ page, totalPages, total, pageSize, onPrev, onNext, prevTestId, nextTestId }: {
  page: number; totalPages: number; total: number; pageSize: number;
  onPrev: () => void; onNext: () => void; prevTestId: string; nextTestId: string;
}) {
  if (totalPages <= 1) return null;
  return (
    <div className="flex items-center justify-between gap-4 p-4 border-t">
      <p className="text-sm text-muted-foreground">
        Showing {(page - 1) * pageSize + 1} to {Math.min(page * pageSize, total)} of {total}
      </p>
      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" onClick={onPrev} disabled={page === 1} data-testid={prevTestId}>
          <ChevronLeft className="w-4 h-4" />
        </Button>
        <span className="text-sm">Page {page} of {totalPages}</span>
        <Button variant="outline" size="sm" onClick={onNext} disabled={page >= totalPages} data-testid={nextTestId}>
          <ChevronRight className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
}

function playBeep(success: boolean) {
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = success ? 880 : 220;
    osc.type = "sine";
    gain.gain.setValueAtTime(0.3, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + (success ? 0.12 : 0.25));
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + (success ? 0.12 : 0.25));
  } catch {}
}

export default function LoadsheetPage() {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("scanner");

  // ---- Scanner state ----
  const [scanMode, setScanMode] = useState<"usb" | "camera">("usb");
  const [scanInput, setScanInput] = useState("");
  const [scannedItems, setScannedItems] = useState<ScannedItem[]>([]);
  const [lockedCourier, setLockedCourier] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<ScanFeedback | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);

  // ---- Dispatch setup state ----
  const [selectedCourier, setSelectedCourier] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const readerRef = useRef<any>(null);
  const feedbackTimeout = useRef<ReturnType<typeof setTimeout>>();
  const shipmentMapRef = useRef<Map<string, BookedShipment>>(new Map());

  // ---- Logs state ----
  const [bkCourierFilter, setBkCourierFilter] = useState("all");
  const [bkDateRange, setBkDateRange] = useState<DateRange | undefined>(undefined);
  const [bkPage, setBkPage] = useState(1);

  const [batchCourierFilter, setBatchCourierFilter] = useState("all");
  const [batchDateRange, setBatchDateRange] = useState<DateRange | undefined>(undefined);
  const [batchPage, setBatchPage] = useState(1);
  const [selectedBatchId, setSelectedBatchId] = useState<string | null>(null);

  const [downloadingBatchAwb, setDownloadingBatchAwb] = useState<Set<string>>(new Set());
  const [downloadingBatchPdf, setDownloadingBatchPdf] = useState<Set<string>>(new Set());

  // ---- Courier integrations query (for courier selector) ----
  const { data: integrationsData } = useQuery<{
    couriers: Array<{ id: string; name: string; isActive: boolean }>;
  }>({ queryKey: ["/api/integrations"] });
  const configuredCouriers = (integrationsData?.couriers ?? []).filter((c) => c.isActive);
  const COURIER_DISPLAY: Record<string, string> = { leopards: "Leopards", postex: "PostEx" };
  const courierDisplayName = (name: string) => COURIER_DISPLAY[name.toLowerCase()] ?? (name.charAt(0).toUpperCase() + name.slice(1));

  // ---- Booked shipments query (no date filter — all booked) ----
  const { data, isLoading, refetch } = useQuery<{ shipments: BookedShipment[]; total: number }>({
    queryKey: ["/api/loadsheet/booked-shipments"],
  });

  useEffect(() => {
    if (data?.shipments) {
      const map = new Map<string, BookedShipment>();
      for (const s of data.shipments) {
        if (s.courierTracking) map.set(s.courierTracking.trim().toUpperCase(), s);
      }
      shipmentMapRef.current = map;
    }
  }, [data]);

  // ---- Booking Logs query ----
  const bkDateParams = dateRangeToParams(bkDateRange);
  const bkQueryParams = new URLSearchParams({
    page: String(bkPage), pageSize: "100", courier: bkCourierFilter, batchType: "BOOKING",
    ...(bkDateParams.dateFrom ? { dateFrom: bkDateParams.dateFrom } : {}),
    ...(bkDateParams.dateTo ? { dateTo: bkDateParams.dateTo } : {}),
  });
  const { data: bkData, isLoading: bkLoading } = useQuery<BatchesResponse>({
    queryKey: ["/api/shipment-batches", "booking", bkCourierFilter, bkDateRange, bkPage],
    queryFn: async () => {
      const res = await fetch(`/api/shipment-batches?${bkQueryParams.toString()}`, { credentials: "include" });
      if (!res.ok) throw new Error(`${res.status}`);
      return res.json();
    },
    enabled: activeTab === "booking-logs",
  });
  const bookingBatches = bkData?.batches ?? [];
  const bkTotalPages = Math.ceil((bkData?.total ?? 0) / 100);

  // ---- Loadsheet Logs query ----
  const batchDateParams = dateRangeToParams(batchDateRange);
  const batchQueryParams = new URLSearchParams({
    page: String(batchPage), pageSize: "100", courier: batchCourierFilter, batchType: "LOADSHEET",
    ...(batchDateParams.dateFrom ? { dateFrom: batchDateParams.dateFrom } : {}),
    ...(batchDateParams.dateTo ? { dateTo: batchDateParams.dateTo } : {}),
  });
  const { data: batchesData, isLoading: batchesLoading } = useQuery<BatchesResponse>({
    queryKey: ["/api/shipment-batches", "loadsheet", batchCourierFilter, batchDateRange, batchPage],
    queryFn: async () => {
      const res = await fetch(`/api/shipment-batches?${batchQueryParams.toString()}`, { credentials: "include" });
      if (!res.ok) throw new Error(`${res.status}`);
      return res.json();
    },
    enabled: activeTab === "loadsheet-logs",
  });
  const batches = batchesData?.batches ?? [];
  const batchTotalPages = Math.ceil((batchesData?.total ?? 0) / 100);

  // ---- Batch detail query ----
  const { data: batchDetailData, isLoading: batchDetailLoading } = useQuery<BatchDetailResponse>({
    queryKey: ["/api/shipment-batches", "detail", selectedBatchId],
    queryFn: async () => {
      const res = await fetch(`/api/shipment-batches/${selectedBatchId}`, { credentials: "include" });
      if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
      return res.json();
    },
    enabled: !!selectedBatchId,
  });

  // ---- Download helpers ----
  const handleBatchAwbAction = async (batchId: string, action: "download" | "print") => {
    setDownloadingBatchAwb(prev => new Set(prev).add(batchId));
    try {
      const resp = await fetch(`/api/print/batch-awb/${batchId}.pdf`, { credentials: "include" });
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({ message: "Failed to fetch airway bills" }));
        toast({ title: "AWB Error", description: err.message, variant: "destructive" });
        return;
      }
      const blob = await resp.blob();
      if (blob.size === 0 || blob.type.includes("json")) {
        toast({ title: "AWB Error", description: "Invoices not available for this batch", variant: "destructive" });
        return;
      }
      const url = URL.createObjectURL(blob);
      if (action === "download") {
        const a = document.createElement("a");
        a.href = url;
        a.download = `batch-awbs-${batchId.substring(0, 8)}.pdf`;
        a.click();
        URL.revokeObjectURL(url);
      } else {
        window.open(url, "_blank");
        setTimeout(() => URL.revokeObjectURL(url), 60000);
      }
    } catch {
      toast({ title: "Error", description: "Could not fetch airway bills", variant: "destructive" });
    } finally {
      setDownloadingBatchAwb(prev => { const n = new Set(prev); n.delete(batchId); return n; });
    }
  };

  const handleBatchPdfDownload = async (batchId: string) => {
    setDownloadingBatchPdf(prev => new Set(prev).add(batchId));
    try {
      const resp = await fetch(`/api/print/batch/${batchId}.pdf`, { credentials: "include" });
      if (!resp.ok) {
        toast({ title: "Error", description: "Failed to fetch loadsheet", variant: "destructive" });
        return;
      }
      const blob = await resp.blob();
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank");
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch {
      toast({ title: "Error", description: "Could not fetch loadsheet", variant: "destructive" });
    } finally {
      setDownloadingBatchPdf(prev => { const n = new Set(prev); n.delete(batchId); return n; });
    }
  };

  // ---- Scanner logic ----
  const showFeedback = useCallback((fb: ScanFeedback) => {
    setFeedback(fb);
    clearTimeout(feedbackTimeout.current);
    const duration = fb.status === "wrong_courier" || fb.status === "not_found" ? 4000 : 2500;
    feedbackTimeout.current = setTimeout(() => setFeedback(null), duration);
  }, []);

  const handleScan = useCallback((raw: string) => {
    const value = raw.trim().toUpperCase();
    if (!value) return;
    let shipment = shipmentMapRef.current.get(value);
    let resolvedCN = value;
    if (!shipment) {
      const tokens = value.split(/[\s|,;]+/).filter(Boolean);
      for (const token of tokens) {
        const match = shipmentMapRef.current.get(token);
        if (match) {
          shipment = match;
          resolvedCN = token;
          break;
        }
      }
    }
    const alreadyScanned = scannedItems.some((i) => i.trackingNumber.toUpperCase() === resolvedCN);
    if (alreadyScanned) {
      playBeep(false);
      showFeedback({ status: "duplicate", message: "Already added to this loadsheet" });
      return;
    }
    if (!shipment) {
      playBeep(false);
      showFeedback({ status: "not_found", message: `CN not found: "${value}" — not in booked orders or already fulfilled` });
      return;
    }
    // Enforce single-courier loadsheet
    const normalizeCourierName = (name: string) => name.trim().toLowerCase().replace(/\s+courier$/i, "");
    if (lockedCourier && normalizeCourierName(shipment.courierName) !== normalizeCourierName(lockedCourier)) {
      playBeep(false);
      showFeedback({ status: "wrong_courier", message: `Wrong courier — this loadsheet is locked to ${lockedCourier}. "${value}" belongs to ${shipment.courierName}.` });
      return;
    }
    playBeep(true);
    const item: ScannedItem = {
      id: shipment.id,
      orderNumber: shipment.orderNumber,
      trackingNumber: shipment.courierTracking,
      customerName: shipment.customerName,
      city: shipment.city,
      codAmount: Number(shipment.totalAmount || 0),
      courierName: shipment.courierName,
      scannedAt: new Date(),
    };
    setScannedItems((prev) => [item, ...prev]);
    if (!lockedCourier) setLockedCourier(shipment.courierName);
    showFeedback({ status: "valid", message: "Added to loadsheet", orderNumber: shipment.orderNumber, customerName: shipment.customerName });
  }, [scannedItems, lockedCourier, showFeedback]);

  useEffect(() => {
    if (scanMode === "usb") {
      stopCamera();
      setTimeout(() => inputRef.current?.focus(), 100);
    } else {
      startCamera();
    }
    return () => stopCamera();
  }, [scanMode]);

  async function startCamera() {
    setCameraError(null);
    try {
      const { BrowserMultiFormatReader } = await import("@zxing/browser");
      const reader = new BrowserMultiFormatReader();
      readerRef.current = reader;
      if (!videoRef.current) return;
      await reader.decodeFromVideoDevice(undefined, videoRef.current, (result) => {
        if (result) handleScan(result.getText());
      });
    } catch (err: any) {
      setCameraError(err?.message || "Camera not accessible");
    }
  }

  function stopCamera() {
    if (readerRef.current) {
      try { readerRef.current.reset(); } catch {}
      readerRef.current = null;
    }
  }

  const removeItem = (trackingNumber: string) => {
    setScannedItems((prev) => {
      const next = prev.filter((i) => i.trackingNumber !== trackingNumber);
      if (next.length === 0) setLockedCourier(selectedCourier ? lockedCourier : null);
      return next;
    });
  };

  const handleCourierSelect = (courierName: string | null) => {
    if (scannedItems.length > 0 && courierName !== selectedCourier) {
      setScannedItems([]);
      toast({ title: "Session cleared", description: "Scanned items cleared — courier changed." });
    }
    setSelectedCourier(courierName);
    setLockedCourier(courierName ? courierDisplayName(courierName) : null);
  };

  const totalCOD = scannedItems.reduce((sum, i) => sum + i.codAmount, 0);

  const generateMutation = useMutation({
    mutationFn: async () => {
      const orderIds = scannedItems.map((i) => i.id);
      const res = await apiRequest("POST", "/api/orders/generate-loadsheet", { orderIds });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Failed to generate loadsheet");
      return data;
    },
    onSuccess: (data) => {
      if (data.pdfUrl) window.open(data.pdfUrl, "_blank");
      toast({ title: "Loadsheet Generated", description: `${scannedItems.length} shipments. ${data.transitioned ?? 0} orders moved to Fulfilled. PDF opened.` });
      setScannedItems([]);
      setLockedCourier(null);
      setSelectedCourier(null);
      queryClient.invalidateQueries({ queryKey: ["/api/loadsheet/booked-shipments"] });
      queryClient.invalidateQueries({ queryKey: ["/api/shipment-batches", "loadsheet"] });
      refetch();
    },
    onError: (err: any) => {
      const msg = err?.message || "Failed to generate loadsheet";
      toast({ title: "Loadsheet Failed", description: msg, variant: "destructive" });
    },
  });

  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-xl font-semibold flex items-center gap-2">
            <ClipboardList className="w-5 h-5" />
            Loadsheet
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Scan shipments, generate loadsheets, and view booking &amp; loadsheet logs
          </p>
        </div>
        <div className="flex items-center gap-2">
          {isLoading ? (
            <Skeleton className="h-7 w-24" />
          ) : (
            <Badge variant="outline" data-testid="badge-booked-count">
              <Package className="w-3 h-3 mr-1" />
              {data?.total ?? 0} booked ready
            </Badge>
          )}
          <Button variant="ghost" size="sm" onClick={() => refetch()} data-testid="button-refresh-booked">
            <RefreshCw className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="flex flex-wrap gap-1" data-testid="tabs-loadsheet">
          <TabsTrigger value="scanner" data-testid="tab-scanner">
            <ClipboardList className="w-4 h-4 mr-2" />
            Scanner
          </TabsTrigger>
          <TabsTrigger value="booking-logs" data-testid="tab-booking-logs">
            <BookOpen className="w-4 h-4 mr-2" />
            Booking Logs
          </TabsTrigger>
          <TabsTrigger value="loadsheet-logs" data-testid="tab-loadsheet-logs">
            <FileSpreadsheet className="w-4 h-4 mr-2" />
            Loadsheet Logs
          </TabsTrigger>
        </TabsList>

        {/* ====== SCANNER TAB ====== */}
        <TabsContent value="scanner" className="mt-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <CardTitle className="text-sm font-medium">Scan Shipments</CardTitle>
                    {lockedCourier && (
                      <Badge variant="secondary" className="text-xs gap-1" data-testid="badge-locked-courier">
                        <Truck className="w-3 h-3" />
                        {lockedCourier}
                      </Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-1">
                    <Button
                      variant={scanMode === "usb" ? "default" : "outline"}
                      size="sm"
                      onClick={() => setScanMode("usb")}
                      data-testid="button-mode-usb"
                    >
                      <Keyboard className="w-3 h-3 mr-1" /> USB
                    </Button>
                    <Button
                      variant={scanMode === "camera" ? "default" : "outline"}
                      size="sm"
                      onClick={() => setScanMode("camera")}
                      data-testid="button-mode-camera"
                    >
                      <Camera className="w-3 h-3 mr-1" /> Camera
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {/* ---- Courier selector + dispatch fields ---- */}
                <div className="space-y-2 pb-2 border-b border-border/50">
                  <div className="flex items-center gap-2">
                    <label className="text-xs font-medium text-muted-foreground w-16 shrink-0">Courier</label>
                    <div className="flex flex-wrap gap-1.5">
                      {configuredCouriers.length === 0 ? (
                        <span className="text-xs text-muted-foreground">No couriers configured</span>
                      ) : (
                        configuredCouriers.map((c) => (
                          <Button
                            key={c.id}
                            type="button"
                            size="sm"
                            variant={selectedCourier === c.name ? "default" : "outline"}
                            onClick={() => handleCourierSelect(selectedCourier === c.name ? null : c.name)}
                            data-testid={`button-select-courier-${c.name}`}
                          >
                            {courierDisplayName(c.name)}
                          </Button>
                        ))
                      )}
                    </div>
                  </div>

                  {!selectedCourier && (
                    <p className="text-xs text-muted-foreground italic">Select a courier above to begin scanning</p>
                  )}
                </div>

                {scanMode === "usb" ? (
                  <div className="space-y-2">
                    <p className="text-xs text-muted-foreground">
                      {selectedCourier
                        ? "Focus the field below and scan with your barcode/QR scanner or type a tracking number"
                        : "Select a courier above first"}
                    </p>
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        handleScan(scanInput);
                        setScanInput("");
                      }}
                      className="flex gap-2"
                    >
                      <Input
                        ref={inputRef}
                        value={scanInput}
                        onChange={(e) => setScanInput(e.target.value)}
                        placeholder={selectedCourier ? "Scan or type tracking number..." : "Select a courier first..."}
                        autoFocus
                        autoComplete="off"
                        disabled={!selectedCourier}
                        data-testid="input-scan"
                        className="font-mono text-sm"
                      />
                      <Button type="submit" size="sm" disabled={!selectedCourier} data-testid="button-scan-submit">Add</Button>
                    </form>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {cameraError ? (
                      <div className="flex flex-col items-center justify-center h-48 rounded-md border bg-muted/30 gap-2 text-sm text-muted-foreground">
                        <CameraOff className="w-8 h-8" />
                        <span>{cameraError}</span>
                        <Button size="sm" variant="outline" onClick={() => { setCameraError(null); startCamera(); }}>
                          Retry
                        </Button>
                      </div>
                    ) : (
                      <div className="relative rounded-md overflow-hidden border bg-black">
                        <video
                          ref={videoRef}
                          className="w-full h-48 object-cover"
                          autoPlay
                          playsInline
                          muted
                          data-testid="video-scanner"
                        />
                        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                          <div className="w-40 h-24 border-2 border-green-400 rounded opacity-70" />
                        </div>
                        <button
                          onClick={() => setScanMode("usb")}
                          className="absolute bottom-2 left-1/2 -translate-x-1/2 flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-black/60 text-white text-xs font-medium backdrop-blur-sm hover:bg-black/80 transition-colors"
                          data-testid="button-stop-camera"
                        >
                          <Keyboard className="w-3 h-3" />
                          ← USB Scanner
                        </button>
                      </div>
                    )}
                    <p className="text-xs text-muted-foreground text-center">
                      Point camera at barcode or QR code — auto-detects
                    </p>
                  </div>
                )}

                {feedback && (
                  <div
                    className={`flex items-start gap-2 p-2.5 rounded-md text-sm transition-all ${
                      feedback.status === "valid"
                        ? "bg-green-500/10 text-green-700 dark:text-green-400 border border-green-500/20"
                        : "bg-red-500/10 text-red-700 dark:text-red-400 border border-red-500/20"
                    }`}
                    data-testid="scan-feedback"
                  >
                    {feedback.status === "valid" ? (
                      <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
                    ) : (
                      <XCircle className="w-4 h-4 shrink-0 mt-0.5" />
                    )}
                    <div>
                      <p className="font-medium">{feedback.message}</p>
                      {feedback.orderNumber && (
                        <p className="text-xs opacity-80">{feedback.orderNumber} — {feedback.customerName}</p>
                      )}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-sm font-medium">Session Summary</CardTitle>
                    <CardDescription className="text-xs">
                      {scannedItems.length} shipments · COD: Rs {totalCOD.toLocaleString()}
                    </CardDescription>
                  </div>
                  <Button
                    onClick={() => generateMutation.mutate()}
                    disabled={scannedItems.length === 0 || generateMutation.isPending}
                    data-testid="button-generate-loadsheet"
                    className="h-8 text-xs gap-1.5"
                  >
                    {generateMutation.isPending ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <FileText className="w-3.5 h-3.5" />
                    )}
                    Generate ({scannedItems.length})
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {scannedItems.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-32 text-muted-foreground text-sm gap-2">
                    <Package className="w-8 h-8 opacity-30" />
                    <span>No shipments scanned yet</span>
                  </div>
                ) : (
                  <div className="space-y-1.5 max-h-64 overflow-y-auto pr-1">
                    {scannedItems.map((item) => (
                      <div
                        key={item.trackingNumber}
                        className="flex items-center gap-2 p-2 rounded-md bg-muted/40 text-xs"
                        data-testid={`scanned-item-${item.trackingNumber}`}
                      >
                        <CheckCircle2 className="w-3.5 h-3.5 text-green-500 shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="font-medium truncate">{item.orderNumber}</p>
                          <p className="text-muted-foreground truncate">{item.customerName} · {item.city}</p>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="font-medium">Rs {item.codAmount.toLocaleString()}</p>
                          <Badge variant="outline" className="text-xs h-4 font-normal">{item.courierName}</Badge>
                        </div>
                        <button
                          onClick={() => removeItem(item.trackingNumber)}
                          className="ml-1 text-muted-foreground hover:text-destructive transition-colors"
                          data-testid={`button-remove-${item.trackingNumber}`}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {scannedItems.length > 0 && (
            <div className="flex items-center justify-between p-3 rounded-md border bg-muted/30 text-sm mt-4">
              <div className="flex items-center gap-4">
                <span><span className="font-semibold">{scannedItems.length}</span> shipments ready</span>
                <span className="text-muted-foreground">Total COD: <span className="font-semibold text-foreground">Rs {totalCOD.toLocaleString()}</span></span>
              </div>
              <Button
                onClick={() => generateMutation.mutate()}
                disabled={generateMutation.isPending}
                data-testid="button-generate-bottom"
              >
                {generateMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <FileText className="w-4 h-4 mr-2" />}
                Generate Loadsheet
              </Button>
            </div>
          )}
        </TabsContent>

        {/* ====== BOOKING LOGS TAB ====== */}
        <TabsContent value="booking-logs" className="space-y-4 mt-4">
          <Card>
            <CardContent className="p-4">
              <div className="flex flex-col sm:flex-row gap-4 flex-wrap">
                <Select value={bkCourierFilter} onValueChange={(v) => { setBkCourierFilter(v); setBkPage(1); }}>
                  <SelectTrigger className="w-[160px]" data-testid="select-bk-courier">
                    <Truck className="w-4 h-4 mr-2" />
                    <SelectValue placeholder="Courier" />
                  </SelectTrigger>
                  <SelectContent>
                    {courierOptions.map((option) => (
                      <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <DateRangePicker
                  dateRange={bkDateRange}
                  onDateRangeChange={(range) => { setBkDateRange(range); setBkPage(1); }}
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-4">
              <CardTitle className="text-lg font-semibold flex items-center gap-2">
                <BookOpen className="w-5 h-5" />
                Booking Sessions
                {bkData?.total !== undefined && (
                  <Badge variant="secondary" className="ml-2">{bkData.total} sessions</Badge>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {bkLoading ? (
                <div className="p-4 space-y-4">
                  {[1, 2, 3, 4, 5].map((i) => (
                    <div key={i} className="flex items-center gap-4">
                      <Skeleton className="h-4 w-20" />
                      <Skeleton className="h-4 w-24" />
                      <Skeleton className="h-4 w-32 flex-1" />
                      <Skeleton className="h-6 w-24" />
                    </div>
                  ))}
                </div>
              ) : bookingBatches.length > 0 ? (
                <>
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Batch ID</TableHead>
                          <TableHead>Courier</TableHead>
                          <TableHead className="text-center">Total</TableHead>
                          <TableHead className="text-center">Success</TableHead>
                          <TableHead className="text-center">Failed</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Booked At</TableHead>
                          <TableHead>Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {bookingBatches.map((batch) => (
                          <TableRow key={batch.id} data-testid={`bk-row-${batch.id}`}>
                            <TableCell className="font-mono text-sm" data-testid={`bk-batch-id-${batch.id}`}>{batch.id.substring(0, 8)}</TableCell>
                            <TableCell className="capitalize" data-testid={`bk-courier-${batch.id}`}>{batch.courierName}</TableCell>
                            <TableCell className="text-center" data-testid={`bk-total-${batch.id}`}>{batch.totalSelectedCount ?? "-"}</TableCell>
                            <TableCell className="text-center text-green-600" data-testid={`bk-success-${batch.id}`}>{batch.successCount ?? "-"}</TableCell>
                            <TableCell className="text-center text-red-600" data-testid={`bk-failed-${batch.id}`}>{batch.failedCount ?? "-"}</TableCell>
                            <TableCell data-testid={`bk-status-${batch.id}`}>{getBatchStatusBadge(batch.status)}</TableCell>
                            <TableCell className="text-muted-foreground text-sm whitespace-nowrap">
                              {batch.createdAt ? formatPkDateTime(batch.createdAt) : "-"}
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-1 flex-wrap">
                                {(batch.successCount ?? 0) > 0 && (
                                  <>
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      disabled={downloadingBatchAwb.has(batch.id)}
                                      onClick={() => handleBatchAwbAction(batch.id, "print")}
                                      data-testid={`button-bk-print-awbs-${batch.id}`}
                                    >
                                      {downloadingBatchAwb.has(batch.id) ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <Printer className="w-3.5 h-3.5 mr-1" />}
                                      Print AWBs
                                    </Button>
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      disabled={downloadingBatchAwb.has(batch.id)}
                                      onClick={() => handleBatchAwbAction(batch.id, "download")}
                                      data-testid={`button-bk-download-awbs-${batch.id}`}
                                    >
                                      {downloadingBatchAwb.has(batch.id) ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <Download className="w-3.5 h-3.5 mr-1" />}
                                      AWBs
                                    </Button>
                                  </>
                                )}
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => setSelectedBatchId(batch.id)}
                                  data-testid={`button-bk-details-${batch.id}`}
                                >
                                  <Eye className="w-4 h-4" />
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                  <Pagination page={bkPage} totalPages={bkTotalPages} total={bkData?.total ?? 0} pageSize={100}
                    onPrev={() => setBkPage(bkPage - 1)} onNext={() => setBkPage(bkPage + 1)}
                    prevTestId="button-bk-prev" nextTestId="button-bk-next" />
                </>
              ) : (
                <div className="text-center py-16">
                  <BookOpen className="w-12 h-12 text-muted-foreground/50 mx-auto mb-4" />
                  <h3 className="font-medium mb-1" data-testid="text-no-booking-logs">No booking sessions found</h3>
                  <p className="text-sm text-muted-foreground">Booking sessions will appear here when orders are booked with couriers</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ====== LOADSHEET LOGS TAB ====== */}
        <TabsContent value="loadsheet-logs" className="space-y-4 mt-4">
          <Card>
            <CardContent className="p-4">
              <div className="flex flex-col sm:flex-row gap-4 flex-wrap">
                <Select value={batchCourierFilter} onValueChange={(v) => { setBatchCourierFilter(v); setBatchPage(1); }}>
                  <SelectTrigger className="w-[160px]" data-testid="select-batch-courier">
                    <Truck className="w-4 h-4 mr-2" />
                    <SelectValue placeholder="Courier" />
                  </SelectTrigger>
                  <SelectContent>
                    {courierOptions.map((option) => (
                      <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <DateRangePicker
                  dateRange={batchDateRange}
                  onDateRangeChange={(range) => { setBatchDateRange(range); setBatchPage(1); }}
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-4">
              <CardTitle className="text-lg font-semibold flex items-center gap-2">
                <FileSpreadsheet className="w-5 h-5" />
                Loadsheet Logs
                {batchesData?.total !== undefined && (
                  <Badge variant="secondary" className="ml-2">{batchesData.total} loadsheets</Badge>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {batchesLoading ? (
                <div className="p-4 space-y-4">
                  {[1, 2, 3, 4, 5].map((i) => (
                    <div key={i} className="flex items-center gap-4">
                      <Skeleton className="h-4 w-20" />
                      <Skeleton className="h-4 w-24" />
                      <Skeleton className="h-4 w-16" />
                      <Skeleton className="h-4 w-32 flex-1" />
                      <Skeleton className="h-6 w-24" />
                    </div>
                  ))}
                </div>
              ) : batches.length > 0 ? (
                <>
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Batch ID</TableHead>
                          <TableHead>Courier</TableHead>
                          <TableHead className="text-center">Total</TableHead>
                          <TableHead className="text-center">Success</TableHead>
                          <TableHead className="text-center">Failed</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Created At</TableHead>
                          <TableHead>Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {batches.map((batch) => (
                          <TableRow key={batch.id} data-testid={`batch-row-${batch.id}`}>
                            <TableCell className="font-mono text-sm">{batch.id.substring(0, 8)}</TableCell>
                            <TableCell className="capitalize">{batch.courierName}</TableCell>
                            <TableCell className="text-center">{batch.totalSelectedCount ?? "-"}</TableCell>
                            <TableCell className="text-center text-green-600">{batch.successCount ?? "-"}</TableCell>
                            <TableCell className="text-center text-red-600">{batch.failedCount ?? "-"}</TableCell>
                            <TableCell>{getBatchStatusBadge(batch.status)}</TableCell>
                            <TableCell className="text-muted-foreground text-sm whitespace-nowrap">
                              {batch.createdAt ? formatPkDateTime(batch.createdAt) : "-"}
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-1 flex-wrap">
                                {(batch.successCount ?? 0) > 0 && (
                                  <>
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      disabled={downloadingBatchAwb.has(batch.id)}
                                      onClick={() => handleBatchAwbAction(batch.id, "print")}
                                      data-testid={`button-print-batch-awb-${batch.id}`}
                                    >
                                      {downloadingBatchAwb.has(batch.id) ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <Printer className="w-3.5 h-3.5 mr-1" />}
                                      Print AWBs
                                    </Button>
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      disabled={downloadingBatchAwb.has(batch.id)}
                                      onClick={() => handleBatchAwbAction(batch.id, "download")}
                                      data-testid={`button-download-batch-awb-${batch.id}`}
                                    >
                                      {downloadingBatchAwb.has(batch.id) ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <Download className="w-3.5 h-3.5 mr-1" />}
                                      AWBs
                                    </Button>
                                  </>
                                )}
                                {batch.pdfBatchPath && (
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    disabled={downloadingBatchPdf.has(batch.id)}
                                    onClick={() => handleBatchPdfDownload(batch.id)}
                                    data-testid={`button-download-batch-pdf-${batch.id}`}
                                  >
                                    {downloadingBatchPdf.has(batch.id) ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <FileSpreadsheet className="w-3.5 h-3.5 mr-1" />}
                                    Loadsheet
                                  </Button>
                                )}
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => setSelectedBatchId(batch.id)}
                                  data-testid={`button-batch-details-${batch.id}`}
                                >
                                  <Eye className="w-4 h-4" />
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                  <Pagination page={batchPage} totalPages={batchTotalPages} total={batchesData?.total ?? 0} pageSize={100}
                    onPrev={() => setBatchPage(batchPage - 1)} onNext={() => setBatchPage(batchPage + 1)}
                    prevTestId="button-batch-prev" nextTestId="button-batch-next" />
                </>
              ) : (
                <div className="text-center py-16">
                  <FileSpreadsheet className="w-12 h-12 text-muted-foreground/50 mx-auto mb-4" />
                  <h3 className="font-medium mb-1">No loadsheets found</h3>
                  <p className="text-sm text-muted-foreground">Loadsheets generated here will appear in this log</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Batch detail dialog */}
      <Dialog open={!!selectedBatchId} onOpenChange={(open) => { if (!open) setSelectedBatchId(null); }}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="w-5 h-5" />
              Batch Details
              {batchDetailData?.batch && (
                <Badge variant="secondary" className="ml-2">{batchDetailData.batch.id.substring(0, 8)}</Badge>
              )}
            </DialogTitle>
          </DialogHeader>
          {batchDetailLoading ? (
            <div className="space-y-4 p-4">
              {[1, 2, 3].map((i) => (
                <div key={i} className="flex items-center gap-4">
                  <Skeleton className="h-4 w-20" />
                  <Skeleton className="h-4 w-24 flex-1" />
                  <Skeleton className="h-6 w-16" />
                </div>
              ))}
            </div>
          ) : batchDetailData ? (
            <div className="space-y-4">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
                <div>
                  <p className="text-muted-foreground">Courier</p>
                  <p className="font-medium capitalize">{batchDetailData.batch.courierName}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Status</p>
                  {getBatchStatusBadge(batchDetailData.batch.status)}
                </div>
                <div>
                  <p className="text-muted-foreground">Success / Failed</p>
                  <p className="font-medium">
                    <span className="text-green-600">{batchDetailData.batch.successCount ?? 0}</span>
                    {" / "}
                    <span className="text-red-600">{batchDetailData.batch.failedCount ?? 0}</span>
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground">Created</p>
                  <p className="font-medium">
                    {batchDetailData.batch.createdAt ? formatPkDateTime(batchDetailData.batch.createdAt) : "-"}
                  </p>
                </div>
              </div>
              <div className="overflow-x-auto border rounded-md">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Order</TableHead>
                      <TableHead>Customer</TableHead>
                      <TableHead>City</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Tracking #</TableHead>
                      <TableHead className="text-right">COD</TableHead>
                      <TableHead>Error</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {batchDetailData.items.map((item) => (
                      <TableRow key={item.id} data-testid={`batch-item-${item.id}`}>
                        <TableCell>
                          <Link href={`/orders/detail/${item.orderId}`} className="text-primary hover:underline font-medium">
                            {item.orderNumber || "-"}
                          </Link>
                        </TableCell>
                        <TableCell className="text-sm">{item.consigneeName || "-"}</TableCell>
                        <TableCell className="text-muted-foreground text-sm">{item.consigneeCity || "-"}</TableCell>
                        <TableCell>
                          <Badge className={
                            item.bookingStatus === "BOOKED"
                              ? "bg-green-500/10 text-green-600 border-green-500/20"
                              : item.bookingStatus === "FAILED"
                              ? "bg-red-500/10 text-red-600 border-red-500/20"
                              : "bg-muted text-muted-foreground"
                          }>
                            {item.bookingStatus}
                          </Badge>
                        </TableCell>
                        <TableCell className="font-mono text-sm">{item.trackingNumber || "-"}</TableCell>
                        <TableCell className="text-right font-medium text-sm">
                          {item.codAmount ? `PKR ${Number(item.codAmount).toLocaleString()}` : "-"}
                        </TableCell>
                        <TableCell>
                          {item.bookingError ? (
                            <div className="max-w-[200px]">
                              <p className="text-sm text-red-600 truncate" title={item.bookingError}>{item.bookingError}</p>
                            </div>
                          ) : (
                            <span className="text-muted-foreground/50">-</span>
                          )}
                        </TableCell>
                        <TableCell>
                          {item.slipUrl && (
                            <Button variant="ghost" size="icon" onClick={() => window.open(item.slipUrl!, "_blank")} title="View Airway Bill">
                              <Printer className="w-4 h-4" />
                            </Button>
                          )}
                          {item.printRecordId && (
                            <Button variant="ghost" size="icon" onClick={() => window.open(`/api/print/shipment/${item.printRecordId}.pdf`, "_blank")} title="Download Print Record">
                              <Download className="w-4 h-4" />
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
