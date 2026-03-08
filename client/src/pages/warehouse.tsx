import { useState, useEffect, useRef, useCallback } from "react";
import { useParams } from "wouter";
import { Loader2, CheckCircle2, XCircle, Package, ClipboardList, Trash2, LogOut, RefreshCw } from "lucide-react";

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
}

type Screen = "pin" | "scanning" | "done";

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
  const [scanResult, setScanResult] = useState<ScanResult>(null);
  const [loadingShipments, setLoadingShipments] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const readerRef = useRef<any>(null);
  const scanResultTimeout = useRef<ReturnType<typeof setTimeout>>();
  const lastScannedRef = useRef<string>("");
  const lastScanTimeRef = useRef<number>(0);

  useEffect(() => {
    if (token) {
      setScreen("scanning");
      loadShipments(token);
    }
    fetchMerchantName();
  }, []);

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
      setScreen("scanning");
      loadShipments(data.token);
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
      showResult({ status: "not_found", message: "Not found in booked orders" });
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
    };
    setScannedItems((prev) => [item, ...prev]);
    showResult({ status: "valid", message: `${shipment.orderNumber} — ${shipment.customerName}`, item });
  }, [scannedItems, shipmentMap]);

  function showResult(result: ScanResult) {
    setScanResult(result);
    clearTimeout(scanResultTimeout.current);
    scanResultTimeout.current = setTimeout(() => setScanResult(null), 2500);
  }

  useEffect(() => {
    if (screen === "scanning") {
      startCamera();
    }
    return () => stopCamera();
  }, [screen]);

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
        setScreen("done");
        stopCamera();
      }
    } catch {}
    setGenerating(false);
  }

  const totalCOD = scannedItems.reduce((s, i) => s + i.codAmount, 0);

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
                    i < pin.length
                      ? "bg-blue-400 border-blue-400"
                      : "border-slate-600"
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
          onClick={() => { setScannedItems([]); setPdfUrl(null); setScreen("scanning"); loadShipments(token!); startCamera(); }}
          className="text-slate-400 text-sm underline"
          data-testid="button-new-loadsheet"
        >
          Start new loadsheet
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-white flex flex-col select-none">
      <div className="flex items-center justify-between px-4 pt-4 pb-2">
        <div>
          <p className="font-semibold text-sm">{merchantName}</p>
          <p className="text-slate-400 text-xs">
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

      <div className="relative bg-black mx-3 rounded-2xl overflow-hidden" style={{ height: "45vh" }}>
        <video ref={videoRef} className="w-full h-full object-cover" autoPlay playsInline muted data-testid="warehouse-camera" />
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="w-52 h-28 rounded-lg border-2 border-blue-400 opacity-80" />
        </div>
        {scanResult && (
          <div className={`absolute bottom-3 left-3 right-3 rounded-xl p-3 flex items-center gap-2 text-sm font-medium backdrop-blur-sm ${
            scanResult.status === "valid"
              ? "bg-green-500/80 text-white"
              : "bg-red-500/80 text-white"
          }`} data-testid="warehouse-scan-result">
            {scanResult.status === "valid"
              ? <CheckCircle2 className="w-4 h-4 shrink-0" />
              : <XCircle className="w-4 h-4 shrink-0" />}
            <span className="truncate">{scanResult.message}</span>
          </div>
        )}
      </div>

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
                <button onClick={() => setScannedItems((p) => p.filter((i) => i.trackingNumber !== item.trackingNumber))} className="ml-1 text-slate-600 active:text-red-400" data-testid={`wh-remove-${item.trackingNumber}`}>
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
