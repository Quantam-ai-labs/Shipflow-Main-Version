import { useState, useEffect, useRef, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import {
  ClipboardList,
  Camera,
  Keyboard,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Trash2,
  RefreshCw,
  FileText,
  Package,
  Loader2,
  CameraOff,
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

type ScanStatus = "valid" | "duplicate" | "not_found" | "dispatched";

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
  const [scanMode, setScanMode] = useState<"usb" | "camera">("usb");
  const [scanInput, setScanInput] = useState("");
  const [scannedItems, setScannedItems] = useState<ScannedItem[]>([]);
  const [feedback, setFeedback] = useState<ScanFeedback | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const readerRef = useRef<any>(null);
  const feedbackTimeout = useRef<ReturnType<typeof setTimeout>>();
  const shipmentMapRef = useRef<Map<string, BookedShipment>>(new Map());

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

  const showFeedback = useCallback((fb: ScanFeedback) => {
    setFeedback(fb);
    clearTimeout(feedbackTimeout.current);
    feedbackTimeout.current = setTimeout(() => setFeedback(null), 2500);
  }, []);

  const handleScan = useCallback((raw: string) => {
    const value = raw.trim().toUpperCase();
    if (!value) return;

    const alreadyScanned = scannedItems.some(
      (i) => i.trackingNumber.toUpperCase() === value
    );
    if (alreadyScanned) {
      playBeep(false);
      showFeedback({ status: "duplicate", message: "Already added to this loadsheet" });
      return;
    }

    const shipment = shipmentMapRef.current.get(value);
    if (!shipment) {
      playBeep(false);
      showFeedback({ status: "not_found", message: "Tracking number not found in booked orders" });
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
    showFeedback({
      status: "valid",
      message: "Added to loadsheet",
      orderNumber: shipment.orderNumber,
      customerName: shipment.customerName,
    });
  }, [scannedItems, showFeedback]);

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
      await reader.decodeFromVideoDevice(undefined, videoRef.current, (result, err) => {
        if (result) {
          handleScan(result.getText());
        }
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
    setScannedItems((prev) => prev.filter((i) => i.trackingNumber !== trackingNumber));
  };

  const totalCOD = scannedItems.reduce((sum, i) => sum + i.codAmount, 0);

  const generateMutation = useMutation({
    mutationFn: async () => {
      const orderIds = scannedItems.map((i) => i.id);
      const res = await apiRequest("POST", "/api/orders/generate-loadsheet", { orderIds });
      return res.json();
    },
    onSuccess: (data) => {
      if (data.pdfUrl) {
        window.open(data.pdfUrl, "_blank");
      }
      toast({ title: "Loadsheet Generated", description: `${scannedItems.length} shipments added. PDF opened.` });
      setScannedItems([]);
      queryClient.invalidateQueries({ queryKey: ["/api/loadsheet/booked-shipments"] });
      refetch();
    },
    onError: () => {
      toast({ title: "Failed to generate loadsheet", variant: "destructive" });
    },
  });

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-xl font-semibold flex items-center gap-2">
            <ClipboardList className="w-5 h-5" />
            Loadsheet Generation
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Scan shipment barcodes to build the handover manifest
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

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium">Scan Shipments</CardTitle>
              <div className="flex items-center gap-1">
                <Button
                  variant={scanMode === "usb" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setScanMode("usb")}
                  data-testid="button-mode-usb"
                  className="h-7 text-xs gap-1"
                >
                  <Keyboard className="w-3 h-3" /> USB
                </Button>
                <Button
                  variant={scanMode === "camera" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setScanMode("camera")}
                  data-testid="button-mode-camera"
                  className="h-7 text-xs gap-1"
                >
                  <Camera className="w-3 h-3" /> Camera
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {scanMode === "usb" ? (
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground">
                  Focus the field below and scan with your barcode/QR scanner or type a tracking number
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
                    placeholder="Scan or type tracking number..."
                    autoFocus
                    autoComplete="off"
                    data-testid="input-scan"
                    className="font-mono text-sm"
                  />
                  <Button type="submit" size="sm" data-testid="button-scan-submit">Add</Button>
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
        <div className="flex items-center justify-between p-3 rounded-md border bg-muted/30 text-sm">
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
    </div>
  );
}
