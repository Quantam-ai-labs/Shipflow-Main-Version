import { useState, useEffect, useRef, useCallback } from "react";
import { useParams } from "wouter";
import { Loader2, CheckCircle2, XCircle, Package, ClipboardList, Trash2, LogOut, RefreshCw, Keyboard, Camera, Truck, ChevronRight, ArrowLeft } from "lucide-react";

interface BookedShipment {
  id: string;
  orderNumber: string;
  courierTracking: string;
  customerName: string;
  city: string;
  totalAmount: string;
  courierName: string;
}

interface ScannedItem {
  id: string;
  orderNumber: string;
  trackingNumber: string;
  customerName: string;
  city: string;
  codAmount: number;
  courierName: string;
}

interface AvailableCourier {
  name: string;
  norm: string;
  displayName: string;
}

type Screen = "pin" | "courier" | "scanning" | "done";

type ScanResult = {
  status: "valid" | "duplicate" | "not_found";
  message: string;
  item?: ScannedItem;
} | null;

function playBeep(success: boolean) {
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = success ? 880 : 220;
    osc.type = "sine";
    gain.gain.setValueAtTime(0.4, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + (success ? 0.15 : 0.3));
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + (success ? 0.15 : 0.3));
  } catch {}
}

export default function WarehousePage() {
  const params = useParams<{ slug: string }>();
  const slug = params.slug || "";

  const [screen, setScreen] = useState<Screen>("pin");
  const [pin, setPin] = useState("");
  const [loginError, setLoginError] = useState("");
  const [loginLoading, setLoginLoading] = useState(false);
  const [merchantName, setMerchantName] = useState("");
  const [token, setToken] = useState<string | null>(() => localStorage.getItem(`wh_token_${slug}`));

  const [shipmentMap, setShipmentMap] = useState<Map<string, BookedShipment>>(new Map());
  const [totalBooked, setTotalBooked] = useState(0);
  const [scannedItems, setScannedItems] = useState<ScannedItem[]>([]);
  const [lockedCourier, setLockedCourier] = useState<string | null>(null);
  const [scanResult, setScanResult] = useState<ScanResult>(null);
  const [loadingShipments, setLoadingShipments] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);

  const [availableCouriers, setAvailableCouriers] = useState<AvailableCourier[]>([]);
  const [selectedCourier, setSelectedCourier] = useState<AvailableCourier | null>(null);

  const [scanMode, setScanMode] = useState<"camera" | "manual">("camera");
  const [manualInput, setManualInput] = useState("");

  const videoRef = useRef<HTMLVideoElement>(null);
  const manualInputRef = useRef<HTMLInputElement>(null);
  const readerRef = useRef<any>(null);
  const scanResultTimeout = useRef<ReturnType<typeof setTimeout>>();
  const lastScannedRef = useRef<string>("");
  const lastScanTimeRef = useRef<number>(0);

  useEffect(() => {
    if (token) {
      fetchCouriers(token).then(() => setScreen("courier"));
      loadShipments(token);
    }
    fetchMerchantName();
  }, []);

  async function fetchCouriers(authToken: string) {
    try {
      const res = await fetch("/api/warehouse/couriers", {
        headers: { Authorization: `Bearer ${authToken}` },
      });
      if (res.ok) {
        const data = await res.json();
        setAvailableCouriers(data.couriers || []);
      }
    } catch {}
  }

  async function fetchMerchantName() {
    try {
      const res = await fetch(`/api/warehouse/merchant-info/${slug}`);
      if (res.ok) {
        const data = await res.json();
        setMerchantName(data.name);
      }
    } catch {}
  }

  async function loadShipments(authToken: string) {
    setLoadingShipments(true);
    try {
      const res = await fetch("/api/warehouse/booked-shipments", {
        headers: { Authorization: `Bearer ${authToken}` },
      });
      if (res.status === 401) {
        logout();
        return;
      }
      const data = await res.json();
      const map = new Map<string, BookedShipment>();
      for (const s of data.shipments || []) {
        if (s.courierTracking) map.set(s.courierTracking.trim().toUpperCase(), s);
      }
      setShipmentMap(map);
      setTotalBooked(data.total || 0);
    } catch {}
    setLoadingShipments(false);
  }

  async function handleLogin() {
    if (pin.length < 4) return;
    setLoginLoading(true);
    setLoginError("");
    try {
      const res = await fetch("/api/warehouse/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ merchantSlug: slug, pin }),
      });
      const data = await res.json();
      if (!res.ok) {
        setLoginError(data.message || "Incorrect PIN");
        setPin("");
        playBeep(false);
        setLoginLoading(false);
        return;
      }
      localStorage.setItem(`wh_token_${slug}`, data.token);
      setToken(data.token);
      setMerchantName(data.merchantName);
      await fetchCouriers(data.token);
      loadShipments(data.token);
      setScreen("courier");
    } catch {
      setLoginError("Connection error. Try again.");
      playBeep(false);
    }
    setLoginLoading(false);
  }

  function logout() {
    localStorage.removeItem(`wh_token_${slug}`);
    setToken(null);
    setPin("");
    setScannedItems([]);
    setSelectedCourier(null);
    setLockedCourier(null);
    setScreen("pin");
    stopCamera();
  }

  const handleScan = useCallback((raw: string) => {
    const value = raw.trim().toUpperCase();
    if (!value) return;
    const now = Date.now();
    if (value === lastScannedRef.current && now - lastScanTimeRef.current < 2000) return;
    lastScannedRef.current = value;
    lastScanTimeRef.current = now;

    if (scannedItems.some((i) => i.trackingNumber.toUpperCase() === value)) {
      playBeep(false);
      showResult({ status: "duplicate", message: "Already scanned" });
      return;
    }
    const shipment = shipmentMap.get(value);
    if (!shipment) {
      playBeep(false);
      showResult({ status: "not_found", message: `CN not found: "${value}" — not in booked orders` });
      return;
    }
    if (lockedCourier && shipment.courierName !== lockedCourier) {
      playBeep(false);
      showResult({ status: "not_found", message: `Wrong courier — locked to ${lockedCourier}. This CN is ${shipment.courierName}.` });
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
    };
    setScannedItems((prev) => [item, ...prev]);
    if (!lockedCourier) setLockedCourier(shipment.courierName);
    showResult({ status: "valid", message: `${shipment.orderNumber} — ${shipment.customerName}`, item });
  }, [scannedItems, shipmentMap, lockedCourier]);

  function showResult(result: ScanResult) {
    setScanResult(result);
    clearTimeout(scanResultTimeout.current);
    scanResultTimeout.current = setTimeout(() => setScanResult(null), 2500);
  }

  useEffect(() => {
    if (screen === "scanning") {
      if (scanMode === "camera") {
        startCamera();
      } else {
        stopCamera();
        setTimeout(() => manualInputRef.current?.focus(), 100);
      }
    }
    return () => stopCamera();
  }, [screen, scanMode]);

  useEffect(() => {
    if (readerRef.current) {
      (readerRef.current as any).__handleScan = handleScan;
    }
  }, [handleScan]);

  async function startCamera() {
    try {
      const { BrowserMultiFormatReader } = await import("@zxing/browser");
      const reader = new BrowserMultiFormatReader();
      (reader as any).__handleScan = handleScan;
      readerRef.current = reader;
      if (!videoRef.current) return;
      const constraints = { video: { facingMode: "environment" } };
      await reader.decodeFromConstraints(constraints, videoRef.current, (result) => {
        if (result && readerRef.current) {
          (readerRef.current as any).__handleScan?.(result.getText());
        }
      });
    } catch {}
  }

  function stopCamera() {
    if (readerRef.current) {
      try { readerRef.current.reset(); } catch {}
      readerRef.current = null;
    }
  }

  async function generateLoadsheet() {
    if (!token || scannedItems.length === 0) return;
    setGenerating(true);
    try {
      const res = await fetch("/api/warehouse/generate-loadsheet", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ trackingNumbers: scannedItems.map((i) => i.trackingNumber) }),
      });
      const data = await res.json();
      if (res.ok && data.pdfUrl) {
        setPdfUrl(data.pdfUrl);
        setLockedCourier(null);
        setScreen("done");
        stopCamera();
      } else {
        showResult({ status: "not_found", message: data.message || "Failed to generate loadsheet" });
      }
    } catch {
      showResult({ status: "not_found", message: "Connection error. Please retry." });
    }
    setGenerating(false);
  }

  const totalCOD = scannedItems.reduce((s, i) => s + i.codAmount, 0);

  // ---- PIN Screen ----
  if (screen === "pin") {
    return (
      <div className="min-h-screen bg-slate-950 text-white flex flex-col items-center justify-center p-6 select-none">
        <div className="w-full max-w-sm space-y-6">
          <div className="text-center space-y-1">
            <div className="w-14 h-14 rounded-2xl bg-slate-800 flex items-center justify-center mx-auto mb-3">
              <Package className="w-7 h-7 text-blue-400" />
            </div>
            <h1 className="text-xl font-bold">{merchantName || "1SOL Warehouse"}</h1>
            <p className="text-slate-400 text-sm">Enter your PIN to continue</p>
          </div>

          <div className="bg-slate-900 rounded-2xl p-5 space-y-4">
            <div className="flex justify-center gap-3">
              {[0, 1, 2, 3, 4, 5].map((i) => (
                <div
                  key={i}
                  className={`w-4 h-4 rounded-full border-2 transition-colors ${
                    i < pin.length ? "bg-blue-400 border-blue-400" : "border-slate-600"
                  }`}
                  data-testid={`pin-dot-${i}`}
                />
              ))}
            </div>

            {loginError && (
              <p className="text-red-400 text-sm text-center" data-testid="pin-error">{loginError}</p>
            )}

            <div className="grid grid-cols-3 gap-3">
              {[1,2,3,4,5,6,7,8,9].map((n) => (
                <button
                  key={n}
                  onClick={() => { if (pin.length < 6) setPin((p) => p + n); }}
                  className="h-14 rounded-xl bg-slate-800 text-xl font-semibold active:bg-slate-700 transition-colors"
                  data-testid={`pin-btn-${n}`}
                >
                  {n}
                </button>
              ))}
              <button
                onClick={() => setPin((p) => p.slice(0, -1))}
                className="h-14 rounded-xl bg-slate-800 text-sm text-slate-400 active:bg-slate-700 transition-colors"
                data-testid="pin-btn-back"
              >
                ⌫
              </button>
              <button
                onClick={() => { if (pin.length < 6) setPin((p) => p + "0"); }}
                className="h-14 rounded-xl bg-slate-800 text-xl font-semibold active:bg-slate-700 transition-colors"
                data-testid="pin-btn-0"
              >
                0
              </button>
              <button
                onClick={handleLogin}
                disabled={pin.length < 4 || loginLoading}
                className="h-14 rounded-xl bg-blue-600 text-sm font-semibold active:bg-blue-700 disabled:opacity-40 transition-colors flex items-center justify-center"
                data-testid="pin-btn-enter"
              >
                {loginLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : "Enter"}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ---- Courier Selection Screen ----
  if (screen === "courier") {
    return (
      <div className="min-h-screen bg-slate-950 text-white flex flex-col select-none">
        <div className="flex items-center justify-between px-4 pt-5 pb-3">
          <div>
            <p className="font-semibold text-base">{merchantName}</p>
            <p className="text-slate-400 text-xs">{loadingShipments ? "Loading shipments..." : `${totalBooked} shipments ready`}</p>
          </div>
          <button onClick={logout} className="p-2 rounded-lg bg-slate-800 active:bg-slate-700" data-testid="button-logout-courier">
            <LogOut className="w-4 h-4 text-slate-300" />
          </button>
        </div>

        <div className="flex-1 flex flex-col px-4 pt-4 pb-8">
          <div className="mb-6">
            <h2 className="text-2xl font-bold">Select Courier</h2>
            <p className="text-slate-400 text-sm mt-1">Choose the courier for this dispatch session</p>
          </div>

          {availableCouriers.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center gap-3 text-slate-500">
              <Truck className="w-10 h-10 opacity-30" />
              <p className="text-sm">No couriers configured</p>
              <p className="text-xs text-slate-600">Add a courier in Settings → Couriers</p>
            </div>
          ) : (
            <div className="space-y-3">
              {availableCouriers.map((c) => (
                <button
                  key={c.name}
                  type="button"
                  onClick={() => {
                    setSelectedCourier(c);
                    setLockedCourier(c.displayName);
                    setScannedItems([]);
                    setScanMode("camera");
                    setScreen("scanning");
                  }}
                  className="w-full flex items-center gap-4 bg-slate-900 hover:bg-slate-800 active:bg-slate-800 rounded-2xl px-5 py-5 transition-colors text-left"
                  data-testid={`button-select-courier-${c.name}`}
                >
                  <div className="w-12 h-12 rounded-xl bg-blue-600/20 flex items-center justify-center shrink-0">
                    <Truck className="w-6 h-6 text-blue-400" />
                  </div>
                  <div className="flex-1">
                    <p className="font-semibold text-base">{c.displayName}</p>
                    <p className="text-slate-400 text-sm mt-0.5">Tap to start scanning</p>
                  </div>
                  <ChevronRight className="w-5 h-5 text-slate-500 shrink-0" />
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  // ---- Done Screen ----
  if (screen === "done") {
    return (
      <div className="min-h-screen bg-slate-950 text-white flex flex-col items-center justify-center p-6 text-center space-y-5">
        <div className="w-20 h-20 rounded-full bg-green-500/20 flex items-center justify-center">
          <CheckCircle2 className="w-10 h-10 text-green-400" />
        </div>
        <div>
          <h2 className="text-xl font-bold">Loadsheet Generated!</h2>
          <p className="text-slate-400 text-sm mt-1">{scannedItems.length} shipments handed over</p>
        </div>
        {pdfUrl && (
          <a
            href={pdfUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="px-6 py-3 bg-blue-600 rounded-xl text-sm font-semibold active:bg-blue-700"
            data-testid="link-open-pdf"
          >
            Open PDF
          </a>
        )}
        <button
          onClick={() => {
            setScannedItems([]);
            setPdfUrl(null);
            setLockedCourier(null);
            setSelectedCourier(null);
            setScreen("courier");
            loadShipments(token!);
          }}
          className="text-slate-400 text-sm underline"
          data-testid="button-new-loadsheet"
        >
          Start new loadsheet
        </button>
      </div>
    );
  }

  // ---- Scanning Screen ----
  return (
    <div className="min-h-screen bg-slate-950 text-white flex flex-col select-none">
      <div className="flex items-center justify-between px-4 pt-4 pb-2">
        <div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                setScannedItems([]);
                setLockedCourier(null);
                setSelectedCourier(null);
                stopCamera();
                setScreen("courier");
              }}
              className="p-1 -ml-1 rounded-lg active:bg-slate-800"
              data-testid="button-back-to-courier"
            >
              <ArrowLeft className="w-4 h-4 text-slate-400" />
            </button>
            <p className="font-semibold text-sm">{merchantName}</p>
            {selectedCourier && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-blue-600/30 text-blue-300 text-xs font-medium" data-testid="badge-locked-courier">
                <Truck className="w-3 h-3" /> {selectedCourier.displayName}
              </span>
            )}
          </div>
          <p className="text-slate-400 text-xs pl-6">
            {loadingShipments ? "Loading..." : `${totalBooked} booked · ${scannedItems.length} scanned`}
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => token && loadShipments(token)} className="p-2 rounded-lg bg-slate-800 active:bg-slate-700" data-testid="button-refresh">
            <RefreshCw className="w-4 h-4 text-slate-300" />
          </button>
          <button onClick={logout} className="p-2 rounded-lg bg-slate-800 active:bg-slate-700" data-testid="button-logout">
            <LogOut className="w-4 h-4 text-slate-300" />
          </button>
        </div>
      </div>

      {scanMode === "camera" ? (
        <div className="relative bg-black mx-3 rounded-2xl overflow-hidden" style={{ height: "45vh" }}>
          <video ref={videoRef} className="w-full h-full object-cover" autoPlay playsInline muted data-testid="warehouse-camera" />
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="w-52 h-28 rounded-lg border-2 border-blue-400 opacity-80" />
          </div>
          <button
            onClick={() => setScanMode("manual")}
            className="absolute top-3 right-3 flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 text-slate-200 text-xs font-medium active:bg-slate-700"
            data-testid="button-switch-manual"
          >
            <Keyboard className="w-3.5 h-3.5" />
            Manual
          </button>
          {scanResult && (
            <div className={`absolute bottom-3 left-3 right-3 rounded-xl p-3 flex items-center gap-2 text-sm font-medium ${
              scanResult.status === "valid" ? "bg-green-600 text-white" : "bg-red-600 text-white"
            }`} data-testid="warehouse-scan-result">
              {scanResult.status === "valid"
                ? <CheckCircle2 className="w-4 h-4 shrink-0" />
                : <XCircle className="w-4 h-4 shrink-0" />}
              <span className="truncate">{scanResult.message}</span>
            </div>
          )}
        </div>
      ) : (
        <div className="mx-3 rounded-2xl bg-slate-900 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-slate-200">Manual / USB Entry</p>
            <button
              onClick={() => setScanMode("camera")}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 text-slate-300 text-xs font-medium active:bg-slate-700"
              data-testid="button-switch-camera"
            >
              <Camera className="w-3.5 h-3.5" />
              Camera
            </button>
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleScan(manualInput);
              setManualInput("");
            }}
            className="flex gap-2"
          >
            <input
              ref={manualInputRef}
              value={manualInput}
              onChange={(e) => setManualInput(e.target.value)}
              placeholder="Type or scan tracking number..."
              autoComplete="off"
              autoFocus
              className="flex-1 bg-slate-800 text-white placeholder:text-slate-500 rounded-xl px-4 py-3 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
              data-testid="input-manual-tracking"
            />
            <button
              type="submit"
              className="px-4 py-3 rounded-xl bg-blue-600 text-white text-sm font-semibold active:bg-blue-700"
              data-testid="button-manual-add"
            >
              Add
            </button>
          </form>
          {scanResult && (
            <div className={`rounded-xl p-3 flex items-center gap-2 text-sm font-medium ${
              scanResult.status === "valid" ? "bg-green-500/20 text-green-300" : "bg-red-500/20 text-red-300"
            }`} data-testid="warehouse-scan-result-manual">
              {scanResult.status === "valid"
                ? <CheckCircle2 className="w-4 h-4 shrink-0" />
                : <XCircle className="w-4 h-4 shrink-0" />}
              <span className="truncate">{scanResult.message}</span>
            </div>
          )}
        </div>
      )}

      <div className="flex-1 flex flex-col px-3 pt-3 pb-4 space-y-2 overflow-hidden">
        <div className="flex items-center justify-between">
          <p className="text-xs text-slate-400 font-medium uppercase tracking-wide">Scanned ({scannedItems.length})</p>
          <p className="text-xs text-slate-300">COD: Rs {totalCOD.toLocaleString()}</p>
        </div>

        <div className="flex-1 overflow-y-auto space-y-1.5">
          {scannedItems.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-20 text-slate-600 text-xs gap-1">
              <Package className="w-5 h-5" />
              <span>Scan shipments above</span>
            </div>
          ) : (
            scannedItems.map((item) => (
              <div key={item.trackingNumber} className="flex items-center gap-2 bg-slate-900 rounded-xl px-3 py-2" data-testid={`wh-item-${item.trackingNumber}`}>
                <CheckCircle2 className="w-3.5 h-3.5 text-green-400 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{item.orderNumber}</p>
                  <p className="text-xs text-slate-400 truncate">{item.customerName}</p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-xs font-medium">Rs {item.codAmount.toLocaleString()}</p>
                </div>
                <button
                  onClick={() => setScannedItems((p) => p.filter((i) => i.trackingNumber !== item.trackingNumber))}
                  className="ml-1 text-slate-600 active:text-red-400"
                  data-testid={`wh-remove-${item.trackingNumber}`}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))
          )}
        </div>

        <button
          onClick={generateLoadsheet}
          disabled={scannedItems.length === 0 || generating}
          className="w-full py-4 rounded-2xl bg-blue-600 font-semibold text-base active:bg-blue-700 disabled:opacity-40 transition-colors flex items-center justify-center gap-2"
          data-testid="button-warehouse-generate"
        >
          {generating ? (
            <Loader2 className="w-5 h-5 animate-spin" />
          ) : (
            <ClipboardList className="w-5 h-5" />
          )}
          Generate Loadsheet ({scannedItems.length})
        </button>
      </div>
    </div>
  );
}
