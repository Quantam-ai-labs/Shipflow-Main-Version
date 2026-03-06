import { useState, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { formatPkDate, formatPkDateTime24 } from "@/lib/dateFormat";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Alert, AlertDescription,
} from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import {
  Plus, Trash2, Upload, FileSpreadsheet, RotateCcw, AlertTriangle,
  CheckCircle, XCircle, Lock, LockOpen, Loader2, Download,
} from "lucide-react";
import * as XLSX from "xlsx";

interface PreviewRow {
  row: number;
  entityType: string;
  entityName: string;
  entityId: string | null;
  balanceType: string;
  amount: number;
  willCreate: boolean;
}

interface ParseError {
  row: number;
  message: string;
}

interface BatchLine {
  id: string;
  entityType: string;
  entityId: string;
  entityName: string;
  balanceType: string;
  amount: string;
}

interface Batch {
  id: string;
  batchNumber: string;
  openingDate: string;
  status: string;
  reversalOf: string | null;
  reversalReason: string | null;
  createdBy: string | null;
  createdAt: string;
  lines: BatchLine[];
}

interface ManualLine {
  entityType: string;
  entityName: string;
  balanceType: string;
  amount: string;
}

export default function OpeningBalancesPage() {
  const { toast } = useToast();
  const { user } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [manualDate, setManualDate] = useState(new Date().toISOString().split("T")[0]);
  const [manualLines, setManualLines] = useState<ManualLine[]>([
    { entityType: "ACCOUNT", entityName: "", balanceType: "INCREASE", amount: "" },
  ]);

  const [importDate, setImportDate] = useState(new Date().toISOString().split("T")[0]);
  const [importFileName, setImportFileName] = useState("");
  const [parsedRows, setParsedRows] = useState<any[]>([]);
  const [previewData, setPreviewData] = useState<{ validRows: PreviewRow[]; errors: ParseError[] } | null>(null);
  const [showPreview, setShowPreview] = useState(false);

  const [reverseDialogOpen, setReverseDialogOpen] = useState(false);
  const [reverseTarget, setReverseTarget] = useState<Batch | null>(null);
  const [reverseReason, setReverseReason] = useState("");

  const [unlockDialogOpen, setUnlockDialogOpen] = useState(false);
  const [unlockPassword, setUnlockPassword] = useState("");
  const [unlockError, setUnlockError] = useState("");

  const { data: lockStatus } = useQuery<{ locked: boolean; unlocked: boolean }>({
    queryKey: ["/api/accounting/opening-balances/lock-status"],
  });

  const { data: batches = [], isLoading: batchesLoading } = useQuery<Batch[]>({
    queryKey: ["/api/accounting/opening-balances"],
  });

  const isLocked = lockStatus?.locked === true;
  const isManuallyUnlocked = lockStatus?.unlocked === true;

  const isAdmin = user?.isMerchantOwner || user?.teamRole === "admin" || user?.teamRole === "manager";

  const unlockMutation = useMutation({
    mutationFn: async (password: string) => {
      const res = await apiRequest("POST", "/api/accounting/opening-balances/unlock", { password });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message || "Failed to unlock");
      }
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Unlocked", description: "Opening balances are now unlocked." });
      queryClient.invalidateQueries({ queryKey: ["/api/accounting/opening-balances/lock-status"] });
      setUnlockDialogOpen(false);
      setUnlockPassword("");
      setUnlockError("");
    },
    onError: (e: any) => {
      setUnlockError(e.message || "Incorrect password");
    },
  });

  const lockMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/accounting/opening-balances/lock", {});
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Locked", description: "Opening balances have been locked." });
      queryClient.invalidateQueries({ queryKey: ["/api/accounting/opening-balances/lock-status"] });
    },
    onError: (e: any) => {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    },
  });

  const parseMutation = useMutation({
    mutationFn: async (rows: any[]) => {
      const res = await apiRequest("POST", "/api/accounting/opening-balances/parse", { rows });
      return res.json();
    },
    onSuccess: (data) => {
      setPreviewData(data);
      setShowPreview(true);
    },
    onError: (e: any) => {
      toast({ title: "Parse Error", description: e.message, variant: "destructive" });
    },
  });

  const postBatchMutation = useMutation({
    mutationFn: async (payload: { openingDate: string; lines: any[] }) => {
      const res = await apiRequest("POST", "/api/accounting/opening-balances", payload);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Success", description: "Opening balance batch posted successfully." });
      queryClient.invalidateQueries({ queryKey: ["/api/accounting/opening-balances"] });
      queryClient.invalidateQueries({ queryKey: ["/api/accounting/opening-balances/lock-status"] });
      setManualLines([{ entityType: "ACCOUNT", entityName: "", balanceType: "INCREASE", amount: "" }]);
      setParsedRows([]);
      setPreviewData(null);
      setShowPreview(false);
      setImportFileName("");
    },
    onError: (e: any) => {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    },
  });

  const reverseMutation = useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason: string }) => {
      const res = await apiRequest("POST", `/api/accounting/opening-balances/${id}/reverse`, { reason });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Reversed", description: "Batch has been reversed successfully." });
      queryClient.invalidateQueries({ queryKey: ["/api/accounting/opening-balances"] });
      queryClient.invalidateQueries({ queryKey: ["/api/accounting/opening-balances/lock-status"] });
      setReverseDialogOpen(false);
      setReverseTarget(null);
      setReverseReason("");
    },
    onError: (e: any) => {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    },
  });

  function addManualLine() {
    setManualLines([...manualLines, { entityType: "ACCOUNT", entityName: "", balanceType: "INCREASE", amount: "" }]);
  }

  function removeManualLine(idx: number) {
    setManualLines(manualLines.filter((_, i) => i !== idx));
  }

  function updateManualLine(idx: number, field: keyof ManualLine, value: string) {
    const updated = [...manualLines];
    updated[idx] = { ...updated[idx], [field]: value };
    if (field === "entityType") {
      updated[idx].balanceType = value === "ACCOUNT" ? "INCREASE" : "RECEIVABLE";
    }
    setManualLines(updated);
  }

  function handleManualSubmit() {
    const invalidLines = manualLines.filter(l => !l.entityName.trim() || !l.amount || parseFloat(l.amount) <= 0);
    if (invalidLines.length > 0) {
      toast({ title: "Validation Error", description: "All lines must have entity name and positive amount.", variant: "destructive" });
      return;
    }
    const rows = manualLines.map(l => ({
      entity_type: l.entityType,
      entity_name: l.entityName.trim(),
      balance_type: l.balanceType,
      amount: l.amount,
    }));
    parseMutation.mutate(rows);
  }

  function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      toast({ title: "File too large", description: "Maximum file size is 5MB.", variant: "destructive" });
      return;
    }
    const ext = file.name.split(".").pop()?.toLowerCase();
    if (!["csv", "xlsx"].includes(ext || "")) {
      toast({ title: "Invalid file", description: "Only .csv and .xlsx files are supported.", variant: "destructive" });
      return;
    }
    setImportFileName(file.name);

    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const data = ev.target?.result;
        let rows: any[] = [];

        if (ext === "csv") {
          const text = data as string;
          const lines = text.split(/\r?\n/).filter(l => l.trim());
          if (lines.length < 2) {
            toast({ title: "Empty file", description: "File must have headers and at least one data row.", variant: "destructive" });
            return;
          }
          const headers = lines[0].split(",").map(h => h.trim().toLowerCase().replace(/['"]/g, ""));
          const requiredCols = ["entity_type", "entity_name", "balance_type", "amount"];
          const missing = requiredCols.filter(c => !headers.includes(c));
          if (missing.length > 0) {
            toast({ title: "Missing columns", description: `Required columns missing: ${missing.join(", ")}`, variant: "destructive" });
            return;
          }
          for (let i = 1; i < lines.length; i++) {
            const vals = lines[i].split(",").map(v => v.trim().replace(/^["']|["']$/g, ""));
            const row: any = {};
            headers.forEach((h, j) => { row[h] = vals[j] || ""; });
            rows.push(row);
          }
        } else {
          const workbook = XLSX.read(data, { type: "array" });
          let sheetName = workbook.SheetNames.find(s => s.toLowerCase() === "openingbalances") || workbook.SheetNames[0];
          const sheet = workbook.Sheets[sheetName];
          const jsonData = XLSX.utils.sheet_to_json(sheet, { defval: "" });
          const requiredCols = ["entity_type", "entity_name", "balance_type", "amount"];
          if (jsonData.length === 0) {
            toast({ title: "Empty file", description: "No data rows found.", variant: "destructive" });
            return;
          }
          const firstRow = jsonData[0] as any;
          const actualHeaders = Object.keys(firstRow).map(k => k.toLowerCase().trim());
          const missing = requiredCols.filter(c => !actualHeaders.some(h => h === c));
          if (missing.length > 0) {
            toast({ title: "Missing columns", description: `Required columns missing: ${missing.join(", ")}`, variant: "destructive" });
            return;
          }
          rows = jsonData.map((r: any) => {
            const normalized: any = {};
            Object.keys(r).forEach(k => { normalized[k.toLowerCase().trim()] = r[k]; });
            return normalized;
          });
        }

        setParsedRows(rows);
        parseMutation.mutate(rows);
      } catch (err: any) {
        toast({ title: "Parse Error", description: err.message || "Failed to parse file.", variant: "destructive" });
      }
    };

    if (ext === "csv") {
      reader.readAsText(file);
    } else {
      reader.readAsArrayBuffer(file);
    }
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function handlePostBatch(date: string, validRows: PreviewRow[]) {
    const lines = validRows.map(r => ({
      entityType: r.entityType,
      entityName: r.entityName,
      entityId: r.entityId,
      balanceType: r.balanceType,
      amount: r.amount.toString(),
    }));
    postBatchMutation.mutate({ openingDate: new Date(date).toISOString(), lines });
  }

  function downloadTemplate() {
    const ws = XLSX.utils.aoa_to_sheet([
      ["entity_type", "entity_name", "balance_type", "amount"],
      ["ACCOUNT", "Cash Register", "INCREASE", "50000"],
      ["ACCOUNT", "Bank Account", "INCREASE", "150000"],
      ["PARTY", "Customer ABC", "RECEIVABLE", "25000"],
      ["PARTY", "Supplier XYZ", "PAYABLE", "10000"],
    ]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "OpeningBalances");
    XLSX.writeFile(wb, "opening_balances_template.xlsx");
  }

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold" data-testid="text-page-title">Opening Balances</h1>
        <div className="flex items-center gap-2">
          {isManuallyUnlocked ? (
            <>
              <Badge className="gap-1 bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300 border-green-200 dark:border-green-700" data-testid="badge-unlocked">
                <LockOpen className="h-3 w-3" /> Unlocked
              </Badge>
              {isAdmin && (
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1 text-xs"
                  onClick={() => lockMutation.mutate()}
                  disabled={lockMutation.isPending}
                  data-testid="button-relock"
                >
                  {lockMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Lock className="h-3 w-3" />}
                  Re-lock
                </Button>
              )}
            </>
          ) : lockStatus !== undefined && (lockStatus.locked) ? (
            <>
              <Badge variant="secondary" className="gap-1" data-testid="badge-locked">
                <Lock className="h-3 w-3" /> Locked
              </Badge>
              {isAdmin && (
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1 text-xs"
                  onClick={() => { setUnlockPassword(""); setUnlockError(""); setUnlockDialogOpen(true); }}
                  data-testid="button-unlock"
                >
                  <LockOpen className="h-3 w-3" /> Unlock
                </Button>
              )}
            </>
          ) : null}
        </div>
      </div>

      {(isLocked || isManuallyUnlocked) && (
        <Alert data-testid="alert-lock-status" className={isManuallyUnlocked ? "border-green-200 dark:border-green-700 bg-green-50 dark:bg-green-950/30" : ""}>
          {isManuallyUnlocked ? <LockOpen className="h-4 w-4 text-green-600 dark:text-green-400" /> : <AlertTriangle className="h-4 w-4" />}
          <AlertDescription className={isManuallyUnlocked ? "text-green-700 dark:text-green-300" : ""}>
            {isManuallyUnlocked
              ? "System is temporarily unlocked. You can post new opening balances. Re-lock when done to protect your financial records."
              : "System is locked because transactions have been recorded. You can view existing batches and reverse them, but cannot post new opening balances."
            }
          </AlertDescription>
        </Alert>
      )}

      <Dialog open={unlockDialogOpen} onOpenChange={(open) => { setUnlockDialogOpen(open); if (!open) { setUnlockPassword(""); setUnlockError(""); } }}>
        <DialogContent className="max-w-sm" data-testid="dialog-unlock">
          <DialogHeader>
            <DialogTitle>Unlock Opening Balances</DialogTitle>
            <DialogDescription>
              Enter your account password to temporarily override the lock. This allows posting new opening balances.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1">
              <Label htmlFor="unlock-password">Account Password</Label>
              <Input
                id="unlock-password"
                type="password"
                placeholder="Enter your password"
                value={unlockPassword}
                onChange={(e) => { setUnlockPassword(e.target.value); setUnlockError(""); }}
                onKeyDown={(e) => { if (e.key === "Enter" && unlockPassword) unlockMutation.mutate(unlockPassword); }}
                data-testid="input-unlock-password"
              />
            </div>
            {unlockError && (
              <p className="text-sm text-destructive" data-testid="text-unlock-error">{unlockError}</p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setUnlockDialogOpen(false)} data-testid="button-cancel-unlock">
              Cancel
            </Button>
            <Button
              onClick={() => unlockMutation.mutate(unlockPassword)}
              disabled={!unlockPassword || unlockMutation.isPending}
              data-testid="button-confirm-unlock"
            >
              {unlockMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Unlock
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Tabs defaultValue="manual" data-testid="tabs-opening-balances">
        <TabsList>
          <TabsTrigger value="manual" data-testid="tab-manual">Create Manually</TabsTrigger>
          <TabsTrigger value="import" data-testid="tab-import">Bulk Import</TabsTrigger>
          <TabsTrigger value="logs" data-testid="tab-logs">Opening Balance Logs</TabsTrigger>
        </TabsList>

        <TabsContent value="manual" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Manual Opening Balance Entry</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="max-w-xs">
                <Label>Opening Balance Date</Label>
                <Input
                  type="date"
                  value={manualDate}
                  onChange={(e) => setManualDate(e.target.value)}
                  data-testid="input-manual-date"
                  disabled={isLocked}
                />
              </div>

              {manualLines.map((line, idx) => (
                <div key={idx} className="flex items-end gap-3 flex-wrap border rounded-lg p-3" data-testid={`manual-line-${idx}`}>
                  <div className="w-36">
                    <Label className="text-xs">Entity Type</Label>
                    <Select
                      value={line.entityType}
                      onValueChange={(v) => updateManualLine(idx, "entityType", v)}
                      disabled={isLocked}
                    >
                      <SelectTrigger data-testid={`select-entity-type-${idx}`}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="ACCOUNT">Account</SelectItem>
                        <SelectItem value="PARTY">Party</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="flex-1 min-w-[180px]">
                    <Label className="text-xs">Entity Name</Label>
                    <Input
                      placeholder={line.entityType === "ACCOUNT" ? "e.g. Cash Register" : "e.g. Customer ABC"}
                      value={line.entityName}
                      onChange={(e) => updateManualLine(idx, "entityName", e.target.value)}
                      data-testid={`input-entity-name-${idx}`}
                      disabled={isLocked}
                    />
                  </div>

                  <div className="w-40">
                    <Label className="text-xs">Balance Type</Label>
                    <Select
                      value={line.balanceType}
                      onValueChange={(v) => updateManualLine(idx, "balanceType", v)}
                      disabled={isLocked}
                    >
                      <SelectTrigger data-testid={`select-balance-type-${idx}`}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {line.entityType === "ACCOUNT" ? (
                          <>
                            <SelectItem value="INCREASE">Increase</SelectItem>
                            <SelectItem value="DECREASE">Decrease</SelectItem>
                          </>
                        ) : (
                          <>
                            <SelectItem value="RECEIVABLE">Receivable</SelectItem>
                            <SelectItem value="PAYABLE">Payable</SelectItem>
                          </>
                        )}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="w-36">
                    <Label className="text-xs">Amount</Label>
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      placeholder="0.00"
                      value={line.amount}
                      onChange={(e) => updateManualLine(idx, "amount", e.target.value)}
                      data-testid={`input-amount-${idx}`}
                      disabled={isLocked}
                    />
                  </div>

                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => removeManualLine(idx)}
                    disabled={manualLines.length <= 1 || isLocked}
                    data-testid={`button-remove-line-${idx}`}
                  >
                    <Trash2 className="h-4 w-4 text-red-500" />
                  </Button>
                </div>
              ))}

              <div className="flex gap-3">
                <Button variant="outline" onClick={addManualLine} disabled={isLocked} data-testid="button-add-line">
                  <Plus className="h-4 w-4 mr-1" /> Add Line
                </Button>
                <Button
                  onClick={handleManualSubmit}
                  disabled={isLocked || parseMutation.isPending}
                  data-testid="button-preview-manual"
                >
                  Preview & Post
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="import" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Bulk Import (CSV / Excel)</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="max-w-xs">
                <Label>Opening Balance Date</Label>
                <Input
                  type="date"
                  value={importDate}
                  onChange={(e) => setImportDate(e.target.value)}
                  data-testid="input-import-date"
                  disabled={isLocked}
                />
              </div>

              <div className="flex items-center gap-3">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv,.xlsx"
                  onChange={handleFileUpload}
                  className="hidden"
                  disabled={isLocked}
                />
                <Button
                  variant="outline"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isLocked || parseMutation.isPending}
                  data-testid="button-upload-file"
                >
                  <Upload className="h-4 w-4 mr-1" /> Upload File
                </Button>
                <Button variant="ghost" onClick={downloadTemplate} data-testid="button-download-template">
                  <Download className="h-4 w-4 mr-1" /> Download Template
                </Button>
                {importFileName && (
                  <span className="text-sm text-muted-foreground flex items-center gap-1">
                    <FileSpreadsheet className="h-4 w-4" /> {importFileName}
                  </span>
                )}
              </div>

              <div className="text-sm text-muted-foreground space-y-1">
                <p>Required columns: <code>entity_type</code>, <code>entity_name</code>, <code>balance_type</code>, <code>amount</code></p>
                <p>Supported: .csv (comma-separated, UTF-8) and .xlsx (sheet named "OpeningBalances" or first sheet)</p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="logs" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Opening Balance Logs</CardTitle>
            </CardHeader>
            <CardContent>
              {batchesLoading ? (
                <div className="space-y-2">
                  <Skeleton className="h-8 w-full" />
                  <Skeleton className="h-8 w-full" />
                </div>
              ) : batches.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4 text-center">No opening balance batches yet.</p>
              ) : (
                <div className="space-y-4">
                  {batches.map((batch) => (
                    <Card key={batch.id} className="border" data-testid={`batch-card-${batch.id}`}>
                      <CardContent className="pt-4 space-y-3">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <span className="font-semibold" data-testid={`text-batch-number-${batch.id}`}>{batch.batchNumber}</span>
                            <Badge
                              variant={batch.status === "POSTED" ? "default" : "secondary"}
                              data-testid={`badge-batch-status-${batch.id}`}
                            >
                              {batch.status}
                            </Badge>
                            {batch.reversalOf && (
                              <span className="text-xs text-muted-foreground">
                                (Reversal of batch)
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-sm text-muted-foreground">
                              {batch.openingDate ? formatPkDate(batch.openingDate) : ""}
                            </span>
                            {batch.status === "POSTED" && !batch.reversalOf && (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => { setReverseTarget(batch); setReverseDialogOpen(true); }}
                                data-testid={`button-reverse-${batch.id}`}
                              >
                                <RotateCcw className="h-3 w-3 mr-1" /> Reverse
                              </Button>
                            )}
                          </div>
                        </div>

                        {batch.reversalReason && (
                          <p className="text-sm text-muted-foreground">Reason: {batch.reversalReason}</p>
                        )}

                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Type</TableHead>
                              <TableHead>Name</TableHead>
                              <TableHead>Balance Type</TableHead>
                              <TableHead className="text-right">Amount</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {batch.lines.map((line) => (
                              <TableRow key={line.id}>
                                <TableCell>
                                  <Badge variant="outline">{line.entityType}</Badge>
                                </TableCell>
                                <TableCell>{line.entityName}</TableCell>
                                <TableCell>{line.balanceType}</TableCell>
                                <TableCell className="text-right font-mono">
                                  Rs. {parseFloat(line.amount).toLocaleString()}
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>

                        <div className="text-xs text-muted-foreground">
                          Posted: {batch.createdAt ? formatPkDateTime24(batch.createdAt) : ""}
                          {" · "}{batch.lines.length} line(s)
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {showPreview && previewData && (
        <Dialog open={showPreview} onOpenChange={setShowPreview}>
          <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Preview Opening Balance Batch</DialogTitle>
              <DialogDescription>
                Review the entries below before posting.
              </DialogDescription>
            </DialogHeader>

            <div className="flex gap-4 text-sm">
              <div className="flex items-center gap-1">
                <CheckCircle className="h-4 w-4 text-green-600" />
                <span>{previewData.validRows.length} valid</span>
              </div>
              {previewData.errors.length > 0 && (
                <div className="flex items-center gap-1">
                  <XCircle className="h-4 w-4 text-red-600" />
                  <span>{previewData.errors.length} error(s)</span>
                </div>
              )}
            </div>

            {previewData.errors.length > 0 && (
              <Alert variant="destructive">
                <AlertDescription>
                  <ul className="text-sm space-y-1">
                    {previewData.errors.map((err, i) => (
                      <li key={i}>Row {err.row}: {err.message}</li>
                    ))}
                  </ul>
                </AlertDescription>
              </Alert>
            )}

            {previewData.validRows.length > 0 && (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>#</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Balance Type</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead>Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {previewData.validRows.map((row, i) => (
                    <TableRow key={i}>
                      <TableCell>{row.row}</TableCell>
                      <TableCell><Badge variant="outline">{row.entityType}</Badge></TableCell>
                      <TableCell>{row.entityName}</TableCell>
                      <TableCell>{row.balanceType}</TableCell>
                      <TableCell className="text-right font-mono">Rs. {row.amount.toLocaleString()}</TableCell>
                      <TableCell>
                        {row.willCreate ? (
                          <Badge variant="secondary" className="text-xs">Will Create</Badge>
                        ) : (
                          <Badge variant="outline" className="text-xs">Existing</Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}

            <DialogFooter>
              <Button variant="outline" onClick={() => setShowPreview(false)}>Cancel</Button>
              <Button
                onClick={() => {
                  const dateToUse = parsedRows.length > 0 ? importDate : manualDate;
                  handlePostBatch(dateToUse, previewData.validRows);
                }}
                disabled={previewData.validRows.length === 0 || postBatchMutation.isPending}
                data-testid="button-post-batch"
              >
                {postBatchMutation.isPending ? "Posting..." : `Post Opening Balance Batch (${previewData.validRows.length} lines)`}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      <Dialog open={reverseDialogOpen} onOpenChange={setReverseDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reverse Opening Balance Batch</DialogTitle>
            <DialogDescription>
              This will create a reversal batch that undoes all balance changes from batch {reverseTarget?.batchNumber}.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label>Reason for reversal</Label>
            <Textarea
              placeholder="Enter reason..."
              value={reverseReason}
              onChange={(e) => setReverseReason(e.target.value)}
              data-testid="input-reversal-reason"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReverseDialogOpen(false)}>Cancel</Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (reverseTarget) {
                  reverseMutation.mutate({ id: reverseTarget.id, reason: reverseReason });
                }
              }}
              disabled={reverseMutation.isPending}
              data-testid="button-confirm-reverse"
            >
              {reverseMutation.isPending ? "Reversing..." : "Reverse Batch"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
