import { useState, useCallback, useRef, useEffect } from "react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Phone,
  PhoneCall,
  CheckCircle2,
  XCircle,
  Clock,
  Loader2,
  Key,
  Wallet,
  Plus,
  Trash2,
  RefreshCw,
  Send,
  Mail,
} from "lucide-react";

interface CallRecord {
  to: string;
  callId?: string;
  status: string;
  dtmf?: number | null;
  amount?: string;
  orderNumber?: string;
  error?: string;
  polling?: boolean;
}

const CALL_STATUS_MAP: Record<number, { label: string; color: string }> = {
  1: { label: "Initiated", color: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300" },
  2: { label: "Answered", color: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300" },
  3: { label: "Congestion", color: "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-300" },
  4: { label: "Busy", color: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300" },
  5: { label: "No Answer", color: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300" },
  6: { label: "Hangup", color: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300" },
  8: { label: "Pushed to SIP", color: "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300" },
};

const DTMF_MAP: Record<number, { label: string; color: string }> = {
  1: { label: "Confirmed", color: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300" },
  2: { label: "Cancelled", color: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300" },
  3: { label: "Callback", color: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300" },
};

export default function RoboCallPage() {
  const { toast } = useToast();

  const [apiKey, setApiKey] = useState("");
  const [email, setEmail] = useState("");
  const [keyVerified, setKeyVerified] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [balance, setBalance] = useState<{ remaining_balance: string; remaining_date: string } | null>(null);
  const [checkingBalance, setCheckingBalance] = useState(false);

  const [phoneTo, setPhoneTo] = useState("");
  const [amount, setAmount] = useState("");
  const [voiceId, setVoiceId] = useState("1");
  const [orderId, setOrderId] = useState("");
  const [orderNumber, setOrderNumber] = useState("");
  const [sending, setSending] = useState(false);

  const [bulkRows, setBulkRows] = useState<Array<{ to: string; amount: string; orderNumber: string }>>([
    { to: "", amount: "", orderNumber: "" },
  ]);
  const [bulkVoiceId, setBulkVoiceId] = useState("1");
  const [sendingBulk, setSendingBulk] = useState(false);

  const [callHistory, setCallHistory] = useState<CallRecord[]>([]);
  const pollingIntervals = useRef<Map<string, NodeJS.Timeout>>(new Map());

  useEffect(() => {
    return () => {
      pollingIntervals.current.forEach((interval) => clearInterval(interval));
    };
  }, []);

  const credentialsValid = apiKey.trim() && email.trim();

  const verifyKey = async () => {
    if (!credentialsValid) return;
    setVerifying(true);
    try {
      const res = await apiRequest("POST", "/api/robocall/verify-key", { apiKey, email });
      const data = await res.json();
      const sms = data.sms;
      if (data.error || data.status === 401) {
        setKeyVerified(false);
        toast({ title: "Invalid Credentials", description: data.response || data.error || "Verification failed.", variant: "destructive" });
      } else if (sms && sms.code === "000") {
        setKeyVerified(true);
        setBalance({ remaining_balance: sms.remaining_balance, remaining_date: sms.remaining_date || "" });
        toast({ title: "Verified", description: `Credentials valid. Balance: PKR ${sms.remaining_balance}` });
      } else {
        setKeyVerified(false);
        toast({ title: "Invalid Credentials", description: sms?.response || "Verification failed.", variant: "destructive" });
      }
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setVerifying(false);
    }
  };

  const checkBalance = async () => {
    if (!credentialsValid) return;
    setCheckingBalance(true);
    try {
      const res = await apiRequest("POST", "/api/robocall/balance", { apiKey, email });
      const data = await res.json();
      const sms = data.sms;
      if (sms && sms.remaining_balance !== undefined) {
        setBalance({ remaining_balance: sms.remaining_balance, remaining_date: sms.remaining_date || "" });
        setKeyVerified(true);
      } else {
        toast({ title: "Error", description: sms?.response || data.error || "Could not fetch balance.", variant: "destructive" });
      }
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setCheckingBalance(false);
    }
  };

  const pollCallStatus = useCallback((callId: string) => {
    if (pollingIntervals.current.has(callId)) return;

    const interval = setInterval(async () => {
      try {
        const res = await apiRequest("POST", "/api/robocall/status", { apiKey, email, callId });
        const data = await res.json();
        const statusData = data.data || data.sms;
        if (statusData && statusData.call_status !== undefined) {
          const callStatus = statusData.call_status;
          const dtmf = statusData.dtmf;
          const retry = statusData.retry ?? 0;
          const isFinal = callStatus === 2 || (callStatus >= 3 && retry >= 3);

          setCallHistory((prev) =>
            prev.map((c) =>
              c.callId === callId
                ? {
                    ...c,
                    status: CALL_STATUS_MAP[callStatus]?.label || `Status ${callStatus}`,
                    dtmf,
                    polling: !isFinal,
                  }
                : c
            )
          );

          if (isFinal) {
            clearInterval(interval);
            pollingIntervals.current.delete(callId);
          }
        } else if (statusData && statusData.code && statusData.code !== "000") {
          setCallHistory((prev) =>
            prev.map((c) =>
              c.callId === callId
                ? { ...c, status: "Error", error: statusData.response || "Status check failed", polling: false }
                : c
            )
          );
          clearInterval(interval);
          pollingIntervals.current.delete(callId);
        }
      } catch {
        // silent retry
      }
    }, 5000);

    pollingIntervals.current.set(callId, interval);
  }, [apiKey, email]);

  const sendSingleCall = async () => {
    if (!credentialsValid || !phoneTo.trim() || !voiceId.trim()) {
      toast({ title: "Missing fields", description: "Email, API Key, Phone Number, and Voice ID are required.", variant: "destructive" });
      return;
    }
    setSending(true);
    try {
      const res = await apiRequest("POST", "/api/robocall/send", {
        apiKey,
        email,
        to: phoneTo.trim(),
        amount: amount || "0",
        voiceId,
        orderId,
        orderNumber,
      });
      const data = await res.json();
      const sms = data.sms;
      const callId = data.data?.call_id ? String(data.data.call_id) : (sms?.call_id ? String(sms.call_id) : (data.call_id ? String(data.call_id) : undefined));
      if (data.error || (sms && sms.code !== "000" && sms.code !== "200" && sms.code !== "201")) {
        toast({ title: "Call Failed", description: data.error || sms?.response || "Unknown error", variant: "destructive" });
      } else {
        const record: CallRecord = {
          to: phoneTo.trim(),
          callId,
          status: "Initiated",
          amount,
          orderNumber,
          polling: !!callId,
        };
        setCallHistory((prev) => [record, ...prev]);
        toast({ title: "Call Sent", description: `Call initiated to ${phoneTo}${callId ? ` (ID: ${callId})` : ""}` });
        if (callId) pollCallStatus(callId);
      }
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setSending(false);
    }
  };

  const sendBulkCalls = async () => {
    const validRows = bulkRows.filter((r) => r.to.trim());
    if (!credentialsValid || validRows.length === 0) {
      toast({ title: "Missing data", description: "Email, API Key, and at least one phone number are required.", variant: "destructive" });
      return;
    }
    setSendingBulk(true);
    try {
      const calls = validRows.map((r) => ({
        to: r.to.trim(),
        amount: r.amount || "0",
        voiceId: bulkVoiceId,
        orderNumber: r.orderNumber || "",
      }));
      const res = await apiRequest("POST", "/api/robocall/send-bulk", { apiKey, email, calls });
      const data = await res.json();
      if (data.results) {
        const newRecords: CallRecord[] = data.results.map((r: any) => {
          const smsR = r.sms;
          const callId = r.data?.call_id ? String(r.data.call_id) : (smsR?.call_id ? String(smsR.call_id) : (r.call_id ? String(r.call_id) : undefined));
          const hasError = r.error || (smsR && smsR.code !== "000" && smsR.code !== "200" && smsR.code !== "201");
          return {
            to: r.to,
            callId,
            status: hasError ? "Error" : "Initiated",
            error: r.error || (hasError ? smsR?.response : undefined),
            polling: !hasError && !!callId,
          };
        });
        setCallHistory((prev) => [...newRecords, ...prev]);
        newRecords.forEach((rec) => {
          if (rec.callId && !rec.error) pollCallStatus(rec.callId);
        });
        toast({ title: "Bulk Calls Sent", description: `${newRecords.filter((r) => !r.error).length} of ${newRecords.length} calls initiated.` });
      }
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setSendingBulk(false);
    }
  };

  const refreshCallStatus = async (callId: string) => {
    try {
      const res = await apiRequest("POST", "/api/robocall/status", { apiKey, email, callId });
      const data = await res.json();
      const statusData = data.data || data.sms;
      if (statusData && statusData.call_status !== undefined) {
        setCallHistory((prev) =>
          prev.map((c) =>
            c.callId === callId
              ? {
                  ...c,
                  status: CALL_STATUS_MAP[statusData.call_status]?.label || `Status ${statusData.call_status}`,
                  dtmf: statusData.dtmf,
                }
              : c
          )
        );
      } else if (statusData && statusData.code && statusData.code !== "000") {
        setCallHistory((prev) =>
          prev.map((c) =>
            c.callId === callId
              ? { ...c, status: "Error", error: statusData.response || "Status check failed" }
              : c
          )
        );
      }
    } catch {
      // silent
    }
  };

  const addBulkRow = () => {
    setBulkRows((prev) => [...prev, { to: "", amount: "", orderNumber: "" }]);
  };

  const removeBulkRow = (index: number) => {
    setBulkRows((prev) => prev.filter((_, i) => i !== index));
  };

  const updateBulkRow = (index: number, field: string, value: string) => {
    setBulkRows((prev) => prev.map((row, i) => (i === index ? { ...row, [field]: value } : row)));
  };

  const parseBulkText = (text: string) => {
    const lines = text.split("\n").filter((l) => l.trim());
    const rows = lines.map((line) => {
      const parts = line.split(/[,\t]/).map((p) => p.trim());
      return { to: parts[0] || "", amount: parts[1] || "", orderNumber: parts[2] || "" };
    });
    if (rows.length > 0) setBulkRows(rows);
  };

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-5xl">
      <div>
        <h1 className="text-2xl font-bold" data-testid="text-page-title">RoboCall Testing</h1>
        <p className="text-muted-foreground mt-1" data-testid="text-page-description">
          Test IVR DTMF calls via BrandedSMS Pakistan. Send single or bulk calls and monitor responses.
        </p>
      </div>

      <Card data-testid="card-api-config">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Key className="w-5 h-5" />
            API Configuration
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label htmlFor="email">Account Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="your@email.com"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  setKeyVerified(false);
                  setBalance(null);
                }}
                data-testid="input-email"
              />
              <p className="text-xs text-muted-foreground mt-1">Your BrandedSMS portal login email</p>
            </div>
            <div>
              <Label htmlFor="apiKey">API Key</Label>
              <Input
                id="apiKey"
                type="password"
                placeholder="Enter your API key"
                value={apiKey}
                onChange={(e) => {
                  setApiKey(e.target.value);
                  setKeyVerified(false);
                  setBalance(null);
                }}
                data-testid="input-api-key"
              />
              <p className="text-xs text-muted-foreground mt-1">From app.brandedsmspakistan.com/developers/key</p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Button onClick={verifyKey} disabled={verifying || !credentialsValid} variant="outline" data-testid="button-verify-key">
              {verifying ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <CheckCircle2 className="w-4 h-4 mr-1" />}
              Verify
            </Button>
            <Button onClick={checkBalance} disabled={checkingBalance || !credentialsValid} variant="outline" data-testid="button-check-balance">
              {checkingBalance ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Wallet className="w-4 h-4 mr-1" />}
              Balance
            </Button>
            {keyVerified && (
              <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300" data-testid="badge-key-verified">
                <CheckCircle2 className="w-3 h-3 mr-1" /> Verified
              </Badge>
            )}
            {balance && (
              <div className="flex items-center gap-3 text-sm" data-testid="text-balance-info">
                <span>
                  <strong>Balance:</strong> PKR {balance.remaining_balance}
                </span>
                {balance.remaining_date && (
                  <span>
                    <strong>Expiry:</strong> {balance.remaining_date}
                  </span>
                )}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue="single">
        <TabsList data-testid="tabs-call-type">
          <TabsTrigger value="single" data-testid="tab-single-call">
            <Phone className="w-4 h-4 mr-1" /> Single Call
          </TabsTrigger>
          <TabsTrigger value="bulk" data-testid="tab-bulk-call">
            <PhoneCall className="w-4 h-4 mr-1" /> Bulk Calls
          </TabsTrigger>
        </TabsList>

        <TabsContent value="single">
          <Card data-testid="card-single-call">
            <CardHeader>
              <CardTitle className="text-lg">Send Single Call</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                <div>
                  <Label htmlFor="phoneTo">Phone Number *</Label>
                  <Input
                    id="phoneTo"
                    placeholder="923001234567"
                    value={phoneTo}
                    onChange={(e) => setPhoneTo(e.target.value)}
                    data-testid="input-phone-to"
                  />
                  <p className="text-xs text-muted-foreground mt-1">Format: 923xxxxxxxxx</p>
                </div>
                <div>
                  <Label htmlFor="amount">Amount</Label>
                  <Input
                    id="amount"
                    placeholder="1500"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    data-testid="input-amount"
                  />
                </div>
                <div>
                  <Label htmlFor="voiceId">Voice ID *</Label>
                  <Input
                    id="voiceId"
                    placeholder="1"
                    value={voiceId}
                    onChange={(e) => setVoiceId(e.target.value)}
                    data-testid="input-voice-id"
                  />
                </div>
                <div>
                  <Label htmlFor="orderId">Order ID</Label>
                  <Input
                    id="orderId"
                    placeholder="123"
                    value={orderId}
                    onChange={(e) => setOrderId(e.target.value)}
                    data-testid="input-order-id"
                  />
                </div>
                <div>
                  <Label htmlFor="orderNumber">Order Number</Label>
                  <Input
                    id="orderNumber"
                    placeholder="ORD12345"
                    value={orderNumber}
                    onChange={(e) => setOrderNumber(e.target.value)}
                    data-testid="input-order-number"
                  />
                </div>
              </div>

              <Button onClick={sendSingleCall} disabled={sending || !credentialsValid} className="w-full sm:w-auto" data-testid="button-send-single">
                {sending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Send className="w-4 h-4 mr-2" />}
                Send Call
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="bulk">
          <Card data-testid="card-bulk-calls">
            <CardHeader>
              <CardTitle className="text-lg">Send Bulk Calls</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="bulkVoiceId">Voice ID *</Label>
                  <Input
                    id="bulkVoiceId"
                    placeholder="1"
                    value={bulkVoiceId}
                    onChange={(e) => setBulkVoiceId(e.target.value)}
                    data-testid="input-bulk-voice-id"
                  />
                </div>
              </div>

              <div>
                <Label>Paste CSV (phone, amount, orderNumber — one per line)</Label>
                <Textarea
                  placeholder={"923001234567, 1500, ORD001\n923009876543, 2000, ORD002"}
                  rows={3}
                  onChange={(e) => parseBulkText(e.target.value)}
                  data-testid="textarea-bulk-csv"
                />
              </div>

              <div className="space-y-2">
                <Label>Or add rows manually:</Label>
                {bulkRows.map((row, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <Input
                      placeholder="Phone (923...)"
                      value={row.to}
                      onChange={(e) => updateBulkRow(i, "to", e.target.value)}
                      className="flex-1"
                      data-testid={`input-bulk-phone-${i}`}
                    />
                    <Input
                      placeholder="Amount"
                      value={row.amount}
                      onChange={(e) => updateBulkRow(i, "amount", e.target.value)}
                      className="w-28"
                      data-testid={`input-bulk-amount-${i}`}
                    />
                    <Input
                      placeholder="Order #"
                      value={row.orderNumber}
                      onChange={(e) => updateBulkRow(i, "orderNumber", e.target.value)}
                      className="w-32"
                      data-testid={`input-bulk-ordernum-${i}`}
                    />
                    <Button variant="ghost" size="icon" onClick={() => removeBulkRow(i)} disabled={bulkRows.length === 1} data-testid={`button-remove-row-${i}`}>
                      <Trash2 className="w-4 h-4 text-muted-foreground" />
                    </Button>
                  </div>
                ))}
                <Button variant="outline" size="sm" onClick={addBulkRow} data-testid="button-add-row">
                  <Plus className="w-4 h-4 mr-1" /> Add Row
                </Button>
              </div>

              <Button onClick={sendBulkCalls} disabled={sendingBulk || !credentialsValid} className="w-full sm:w-auto" data-testid="button-send-bulk">
                {sendingBulk ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Send className="w-4 h-4 mr-2" />}
                Send {bulkRows.filter((r) => r.to.trim()).length} Calls
              </Button>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {callHistory.length > 0 && (
        <Card data-testid="card-call-history">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Clock className="w-5 h-5" />
              Call History ({callHistory.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left">
                    <th className="py-2 pr-4 font-medium">Phone</th>
                    <th className="py-2 pr-4 font-medium">Call ID</th>
                    <th className="py-2 pr-4 font-medium">Amount</th>
                    <th className="py-2 pr-4 font-medium">Order #</th>
                    <th className="py-2 pr-4 font-medium">Status</th>
                    <th className="py-2 pr-4 font-medium">Response</th>
                    <th className="py-2 font-medium"></th>
                  </tr>
                </thead>
                <tbody>
                  {callHistory.map((call, i) => (
                    <tr key={i} className="border-b last:border-0" data-testid={`row-call-${i}`}>
                      <td className="py-2 pr-4 font-mono" data-testid={`text-call-phone-${i}`}>{call.to}</td>
                      <td className="py-2 pr-4 font-mono text-muted-foreground" data-testid={`text-call-id-${i}`}>{call.callId || "—"}</td>
                      <td className="py-2 pr-4" data-testid={`text-call-amount-${i}`}>{call.amount || "—"}</td>
                      <td className="py-2 pr-4" data-testid={`text-call-order-${i}`}>{call.orderNumber || "—"}</td>
                      <td className="py-2 pr-4">
                        <div className="flex items-center gap-1">
                          {call.polling && <Loader2 className="w-3 h-3 animate-spin" />}
                          <Badge
                            variant="secondary"
                            className={
                              call.status === "Error"
                                ? "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300"
                                : call.status === "Answered"
                                ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300"
                                : call.status === "Initiated"
                                ? "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300"
                                : ""
                            }
                            data-testid={`badge-call-status-${i}`}
                          >
                            {call.status}
                          </Badge>
                        </div>
                      </td>
                      <td className="py-2 pr-4">
                        {call.dtmf != null ? (
                          <Badge className={DTMF_MAP[call.dtmf]?.color || ""} data-testid={`badge-call-dtmf-${i}`}>
                            {call.dtmf === 1 && <CheckCircle2 className="w-3 h-3 mr-1" />}
                            {call.dtmf === 2 && <XCircle className="w-3 h-3 mr-1" />}
                            {call.dtmf === 3 && <PhoneCall className="w-3 h-3 mr-1" />}
                            Press {call.dtmf}: {DTMF_MAP[call.dtmf]?.label || "Unknown"}
                          </Badge>
                        ) : call.error ? (
                          <span className="text-red-600 text-xs" data-testid={`text-call-error-${i}`}>{call.error}</span>
                        ) : call.status === "Answered" ? (
                          <span className="text-muted-foreground text-xs">No input</span>
                        ) : (
                          <span className="text-muted-foreground text-xs">—</span>
                        )}
                      </td>
                      <td className="py-2">
                        {call.callId && (
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => refreshCallStatus(call.callId!)}
                            data-testid={`button-refresh-call-${i}`}
                          >
                            <RefreshCw className="w-4 h-4" />
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
