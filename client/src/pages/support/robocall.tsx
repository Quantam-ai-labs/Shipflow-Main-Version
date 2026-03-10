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
  PhoneOff,
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
} from "lucide-react";

interface CallRecord {
  callerId: string;
  callId?: string;
  status: string;
  dtmf?: number | null;
  amount?: string;
  text2?: string;
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
  const [keyVerified, setKeyVerified] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [balance, setBalance] = useState<{ balance: string; username: string; call_rate: string } | null>(null);
  const [checkingBalance, setCheckingBalance] = useState(false);

  const [callerId, setCallerId] = useState("");
  const [amount, setAmount] = useState("");
  const [voiceId, setVoiceId] = useState("102");
  const [text1, setText1] = useState("");
  const [text2, setText2] = useState("");
  const [key1, setKey1] = useState("");
  const [key2, setKey2] = useState("");
  const [key3, setKey3] = useState("");
  const [key4, setKey4] = useState("");
  const [key5, setKey5] = useState("");
  const [sending, setSending] = useState(false);

  const [bulkRows, setBulkRows] = useState<Array<{ callerId: string; amount: string; text2: string }>>([
    { callerId: "", amount: "", text2: "" },
  ]);
  const [bulkVoiceId, setBulkVoiceId] = useState("102");
  const [bulkText1, setBulkText1] = useState("");
  const [sendingBulk, setSendingBulk] = useState(false);

  const [callHistory, setCallHistory] = useState<CallRecord[]>([]);
  const pollingIntervals = useRef<Map<string, NodeJS.Timeout>>(new Map());

  useEffect(() => {
    return () => {
      pollingIntervals.current.forEach((interval) => clearInterval(interval));
    };
  }, []);

  const verifyKey = async () => {
    if (!apiKey.trim()) return;
    setVerifying(true);
    try {
      const res = await apiRequest("POST", "/api/robocall/verify-key", { apiKey });
      const data = await res.json();
      if (String(data.status) === "200") {
        setKeyVerified(true);
        toast({ title: "API Key Verified", description: "Your RoboCall API key is valid." });
      } else {
        setKeyVerified(false);
        toast({ title: "Invalid API Key", description: data.response || "Key verification failed.", variant: "destructive" });
      }
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setVerifying(false);
    }
  };

  const checkBalance = async () => {
    if (!apiKey.trim()) return;
    setCheckingBalance(true);
    try {
      const res = await apiRequest("POST", "/api/robocall/balance", { apiKey });
      const data = await res.json();
      if (String(data.status) === "200" && data.data) {
        setBalance(data.data);
      } else {
        toast({ title: "Error", description: data.response || "Could not fetch balance.", variant: "destructive" });
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
        const res = await apiRequest("POST", "/api/robocall/status", { apiKey, callId });
        const data = await res.json();
        if (data.data) {
          const callStatus = data.data.call_status;
          const dtmf = data.data.dtmf;
          const retry = data.data.retry ?? 0;
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
        }
      } catch {
        // silent retry
      }
    }, 5000);

    pollingIntervals.current.set(callId, interval);
  }, [apiKey]);

  const sendSingleCall = async () => {
    if (!apiKey.trim() || !callerId.trim() || !voiceId.trim()) {
      toast({ title: "Missing fields", description: "API Key, Phone Number, and Voice ID are required.", variant: "destructive" });
      return;
    }
    setSending(true);
    try {
      const res = await apiRequest("POST", "/api/robocall/send", {
        apiKey,
        callerId: callerId.trim(),
        amount: amount || "0",
        voiceId,
        text1,
        text2,
        key1: key1 || "0",
        key2: key2 || "0",
        key3: key3 || "0",
        key4: key4 || "0",
        key5: key5 || "0",
      });
      const data = await res.json();
      if (data.status === "200" || data.status === 200) {
        const callId = data.data?.call_id ? String(data.data.call_id) : undefined;
        const record: CallRecord = {
          callerId: callerId.trim(),
          callId,
          status: "Initiated",
          amount,
          text2,
          polling: !!callId,
        };
        setCallHistory((prev) => [record, ...prev]);
        toast({ title: "Call Sent", description: `Call initiated to ${callerId}${callId ? ` (ID: ${callId})` : ""}` });
        if (callId) pollCallStatus(callId);
      } else {
        toast({ title: "Call Failed", description: data.message || JSON.stringify(data), variant: "destructive" });
      }
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setSending(false);
    }
  };

  const sendBulkCalls = async () => {
    const validRows = bulkRows.filter((r) => r.callerId.trim());
    if (!apiKey.trim() || validRows.length === 0) {
      toast({ title: "Missing data", description: "API Key and at least one phone number are required.", variant: "destructive" });
      return;
    }
    setSendingBulk(true);
    try {
      const calls = validRows.map((r) => ({
        callerId: r.callerId.trim(),
        amount: r.amount || "0",
        voiceId: bulkVoiceId,
        text1: bulkText1,
        text2: r.text2 || "",
      }));
      const res = await apiRequest("POST", "/api/robocall/send-bulk", { apiKey, calls });
      const data = await res.json();
      if (data.results) {
        const newRecords: CallRecord[] = data.results.map((r: any) => {
          const callId = r.data?.call_id ? String(r.data.call_id) : undefined;
          return {
            callerId: r.callerId,
            callId,
            status: r.error ? "Error" : "Initiated",
            error: r.error,
            polling: !r.error && !!callId,
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
      const res = await apiRequest("POST", "/api/robocall/status", { apiKey, callId });
      const data = await res.json();
      if (data.data) {
        setCallHistory((prev) =>
          prev.map((c) =>
            c.callId === callId
              ? {
                  ...c,
                  status: CALL_STATUS_MAP[data.data.call_status]?.label || `Status ${data.data.call_status}`,
                  dtmf: data.data.dtmf,
                }
              : c
          )
        );
      }
    } catch {
      // silent
    }
  };

  const addBulkRow = () => {
    setBulkRows((prev) => [...prev, { callerId: "", amount: "", text2: "" }]);
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
      return { callerId: parts[0] || "", amount: parts[1] || "", text2: parts[2] || "" };
    });
    if (rows.length > 0) setBulkRows(rows);
  };

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-5xl">
      <div>
        <h1 className="text-2xl font-bold" data-testid="text-page-title">RoboCall Testing</h1>
        <p className="text-muted-foreground mt-1" data-testid="text-page-description">
          Test IVR calls via RoboCall Pakistan (robocall.pk). Send single or bulk calls and monitor responses.
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
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="flex-1">
              <Label htmlFor="apiKey">API Key</Label>
              <Input
                id="apiKey"
                type="password"
                placeholder="Enter your RoboCall API key"
                value={apiKey}
                onChange={(e) => {
                  setApiKey(e.target.value);
                  setKeyVerified(false);
                  setBalance(null);
                }}
                data-testid="input-api-key"
              />
            </div>
            <div className="flex items-end gap-2">
              <Button onClick={verifyKey} disabled={verifying || !apiKey.trim()} variant="outline" data-testid="button-verify-key">
                {verifying ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <CheckCircle2 className="w-4 h-4 mr-1" />}
                Verify
              </Button>
              <Button onClick={checkBalance} disabled={checkingBalance || !apiKey.trim()} variant="outline" data-testid="button-check-balance">
                {checkingBalance ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Wallet className="w-4 h-4 mr-1" />}
                Balance
              </Button>
            </div>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            {keyVerified && (
              <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300" data-testid="badge-key-verified">
                <CheckCircle2 className="w-3 h-3 mr-1" /> Key Verified
              </Badge>
            )}
            {balance && (
              <div className="flex items-center gap-3 text-sm" data-testid="text-balance-info">
                <span>
                  <strong>Balance:</strong> PKR {balance.balance}
                </span>
                <span>
                  <strong>Rate:</strong> PKR {balance.call_rate}/call
                </span>
                <span>
                  <strong>User:</strong> {balance.username}
                </span>
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
                  <Label htmlFor="callerId">Phone Number *</Label>
                  <Input
                    id="callerId"
                    placeholder="923001234567"
                    value={callerId}
                    onChange={(e) => setCallerId(e.target.value)}
                    data-testid="input-caller-id"
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
                    placeholder="102"
                    value={voiceId}
                    onChange={(e) => setVoiceId(e.target.value)}
                    data-testid="input-voice-id"
                  />
                  <p className="text-xs text-muted-foreground mt-1">e.g. 48, 49, 102</p>
                </div>
                <div>
                  <Label htmlFor="text1">Store Name (text1)</Label>
                  <Input
                    id="text1"
                    placeholder="My Store"
                    value={text1}
                    onChange={(e) => setText1(e.target.value)}
                    data-testid="input-text1"
                  />
                </div>
                <div>
                  <Label htmlFor="text2">Order ID (text2)</Label>
                  <Input
                    id="text2"
                    placeholder="ORD12345"
                    value={text2}
                    onChange={(e) => setText2(e.target.value)}
                    data-testid="input-text2"
                  />
                </div>
              </div>

              <details className="text-sm">
                <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
                  Advanced Fields (key1–key5)
                </summary>
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mt-3">
                  <div>
                    <Label htmlFor="key1">key1</Label>
                    <Input id="key1" placeholder="0" value={key1} onChange={(e) => setKey1(e.target.value)} data-testid="input-key1" />
                  </div>
                  <div>
                    <Label htmlFor="key2">key2</Label>
                    <Input id="key2" placeholder="0" value={key2} onChange={(e) => setKey2(e.target.value)} data-testid="input-key2" />
                  </div>
                  <div>
                    <Label htmlFor="key3">key3</Label>
                    <Input id="key3" placeholder="0" value={key3} onChange={(e) => setKey3(e.target.value)} data-testid="input-key3" />
                  </div>
                  <div>
                    <Label htmlFor="key4">key4</Label>
                    <Input id="key4" placeholder="0" value={key4} onChange={(e) => setKey4(e.target.value)} data-testid="input-key4" />
                  </div>
                  <div>
                    <Label htmlFor="key5">key5</Label>
                    <Input id="key5" placeholder="0" value={key5} onChange={(e) => setKey5(e.target.value)} data-testid="input-key5" />
                  </div>
                </div>
              </details>

              <Button onClick={sendSingleCall} disabled={sending || !apiKey.trim()} className="w-full sm:w-auto" data-testid="button-send-single">
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
                    placeholder="102"
                    value={bulkVoiceId}
                    onChange={(e) => setBulkVoiceId(e.target.value)}
                    data-testid="input-bulk-voice-id"
                  />
                </div>
                <div>
                  <Label htmlFor="bulkText1">Store Name (text1)</Label>
                  <Input
                    id="bulkText1"
                    placeholder="My Store"
                    value={bulkText1}
                    onChange={(e) => setBulkText1(e.target.value)}
                    data-testid="input-bulk-text1"
                  />
                </div>
              </div>

              <div>
                <Label>Paste CSV (phone, amount, orderId — one per line)</Label>
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
                      value={row.callerId}
                      onChange={(e) => updateBulkRow(i, "callerId", e.target.value)}
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
                      placeholder="Order ID"
                      value={row.text2}
                      onChange={(e) => updateBulkRow(i, "text2", e.target.value)}
                      className="w-32"
                      data-testid={`input-bulk-orderid-${i}`}
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

              <Button onClick={sendBulkCalls} disabled={sendingBulk || !apiKey.trim()} className="w-full sm:w-auto" data-testid="button-send-bulk">
                {sendingBulk ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Send className="w-4 h-4 mr-2" />}
                Send {bulkRows.filter((r) => r.callerId.trim()).length} Calls
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
                    <th className="py-2 pr-4 font-medium">Order ID</th>
                    <th className="py-2 pr-4 font-medium">Status</th>
                    <th className="py-2 pr-4 font-medium">Response</th>
                    <th className="py-2 font-medium"></th>
                  </tr>
                </thead>
                <tbody>
                  {callHistory.map((call, i) => (
                    <tr key={i} className="border-b last:border-0" data-testid={`row-call-${i}`}>
                      <td className="py-2 pr-4 font-mono" data-testid={`text-call-phone-${i}`}>{call.callerId}</td>
                      <td className="py-2 pr-4 font-mono text-muted-foreground" data-testid={`text-call-id-${i}`}>{call.callId || "—"}</td>
                      <td className="py-2 pr-4" data-testid={`text-call-amount-${i}`}>{call.amount || "—"}</td>
                      <td className="py-2 pr-4" data-testid={`text-call-order-${i}`}>{call.text2 || "—"}</td>
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
