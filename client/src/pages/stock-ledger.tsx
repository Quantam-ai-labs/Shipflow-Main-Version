import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { formatPkDate } from "@/lib/dateFormat";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Package,
  ArrowDownLeft,
  ArrowUpRight,
  RotateCcw,
  Plus,
  Pencil,
  Trash2,
  Loader2,
  Calendar,
  Filter,
  Download,
} from "lucide-react";
import { exportCsvWithDate } from "@/lib/exportCsv";
import type { StockLedgerEntry } from "@shared/schema";

const TYPE_BADGE_STYLES: Record<string, string> = {
  incoming: "bg-green-500/10 text-green-600 border-green-500/20",
  outgoing: "bg-blue-500/10 text-blue-600 border-blue-500/20",
  return: "bg-amber-500/10 text-amber-600 border-amber-500/20",
};

const TYPE_LABELS: Record<string, string> = {
  incoming: "Incoming",
  outgoing: "Outgoing",
  return: "Return",
};

function formatPKR(amount: string | number): string {
  const num = typeof amount === "string" ? parseFloat(amount) : amount;
  if (isNaN(num)) return "PKR 0";
  return `PKR ${num.toLocaleString("en-PK", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

const stockLedgerFormSchema = z.object({
  type: z.enum(["incoming", "outgoing", "return"], { required_error: "Type is required" }),
  productName: z.string().min(1, "Product name is required"),
  sku: z.string().optional(),
  quantity: z.string().min(1, "Quantity is required").refine((v) => !isNaN(Number(v)) && Number(v) > 0 && Number.isInteger(Number(v)), "Must be a positive integer"),
  unitPrice: z.string().min(1, "Unit price is required").refine((v) => !isNaN(Number(v)) && Number(v) >= 0, "Must be a non-negative number"),
  supplier: z.string().optional(),
  reference: z.string().optional(),
  date: z.string().min(1, "Date is required"),
  notes: z.string().optional(),
});

type StockLedgerFormValues = z.infer<typeof stockLedgerFormSchema>;

interface StockSummary {
  incoming: { totalQuantity: number; totalValue: number };
  outgoing: { totalQuantity: number; totalValue: number };
  return: { totalQuantity: number; totalValue: number };
}

export default function StockLedgerPage() {
  const { toast } = useToast();
  const [typeFilter, setTypeFilter] = useState("all");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingEntry, setEditingEntry] = useState<StockLedgerEntry | null>(null);
  const [deleteEntry, setDeleteEntry] = useState<StockLedgerEntry | null>(null);

  const buildQueryUrl = () => {
    const params = new URLSearchParams();
    if (typeFilter && typeFilter !== "all") params.set("type", typeFilter);
    if (startDate) params.set("startDate", startDate);
    if (endDate) params.set("endDate", endDate);
    const qs = params.toString();
    return `/api/stock-ledger${qs ? `?${qs}` : ""}`;
  };

  const buildSummaryUrl = () => {
    const params = new URLSearchParams();
    if (startDate) params.set("startDate", startDate);
    if (endDate) params.set("endDate", endDate);
    const qs = params.toString();
    return `/api/stock-ledger/summary${qs ? `?${qs}` : ""}`;
  };

  const { data: entries, isLoading } = useQuery<StockLedgerEntry[]>({
    queryKey: [buildQueryUrl()],
  });

  const { data: summary } = useQuery<StockSummary>({
    queryKey: [buildSummaryUrl()],
  });

  const form = useForm<StockLedgerFormValues>({
    resolver: zodResolver(stockLedgerFormSchema),
    defaultValues: {
      type: "incoming",
      productName: "",
      sku: "",
      quantity: "",
      unitPrice: "",
      supplier: "",
      reference: "",
      date: format(new Date(), "yyyy-MM-dd"),
      notes: "",
    },
  });

  const watchQuantity = form.watch("quantity");
  const watchUnitPrice = form.watch("unitPrice");

  const calculatedTotal = (() => {
    const qty = Number(watchQuantity);
    const price = Number(watchUnitPrice);
    if (!isNaN(qty) && !isNaN(price) && qty > 0 && price >= 0) {
      return qty * price;
    }
    return 0;
  })();

  const createMutation = useMutation({
    mutationFn: (data: StockLedgerFormValues) =>
      apiRequest("POST", "/api/stock-ledger", {
        ...data,
        quantity: Number(data.quantity),
        unitPrice: data.unitPrice,
        totalValue: String(Number(data.quantity) * Number(data.unitPrice)),
        date: new Date(data.date).toISOString(),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ predicate: (q) => String(q.queryKey[0]).startsWith("/api/stock-ledger") });
      toast({ title: "Entry created", description: "Stock ledger entry has been added." });
      closeDialog();
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: StockLedgerFormValues }) =>
      apiRequest("PUT", `/api/stock-ledger/${id}`, {
        ...data,
        quantity: Number(data.quantity),
        unitPrice: data.unitPrice,
        totalValue: String(Number(data.quantity) * Number(data.unitPrice)),
        date: new Date(data.date).toISOString(),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ predicate: (q) => String(q.queryKey[0]).startsWith("/api/stock-ledger") });
      toast({ title: "Entry updated", description: "Stock ledger entry has been updated." });
      closeDialog();
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/stock-ledger/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ predicate: (q) => String(q.queryKey[0]).startsWith("/api/stock-ledger") });
      toast({ title: "Entry deleted", description: "Stock ledger entry has been removed." });
      setDeleteEntry(null);
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const openAddDialog = () => {
    setEditingEntry(null);
    form.reset({
      type: "incoming",
      productName: "",
      sku: "",
      quantity: "",
      unitPrice: "",
      supplier: "",
      reference: "",
      date: format(new Date(), "yyyy-MM-dd"),
      notes: "",
    });
    setDialogOpen(true);
  };

  const openEditDialog = (entry: StockLedgerEntry) => {
    setEditingEntry(entry);
    form.reset({
      type: entry.type as "incoming" | "outgoing" | "return",
      productName: entry.productName,
      sku: entry.sku || "",
      quantity: String(entry.quantity),
      unitPrice: String(entry.unitPrice),
      supplier: entry.supplier || "",
      reference: entry.reference || "",
      date: entry.date ? format(new Date(entry.date), "yyyy-MM-dd") : "",
      notes: entry.notes || "",
    });
    setDialogOpen(true);
  };

  const closeDialog = () => {
    setDialogOpen(false);
    setEditingEntry(null);
    form.reset();
  };

  const onSubmit = (values: StockLedgerFormValues) => {
    if (editingEntry) {
      updateMutation.mutate({ id: editingEntry.id, data: values });
    } else {
      createMutation.mutate(values);
    }
  };

  const isMutating = createMutation.isPending || updateMutation.isPending;

  const incomingSummary = summary?.incoming || { totalQuantity: 0, totalValue: 0 };
  const outgoingSummary = summary?.outgoing || { totalQuantity: 0, totalValue: 0 };
  const returnSummary = summary?.return || { totalQuantity: 0, totalValue: 0 };
  const netQty = incomingSummary.totalQuantity - outgoingSummary.totalQuantity - returnSummary.totalQuantity;
  const netValue = incomingSummary.totalValue - outgoingSummary.totalValue - returnSummary.totalValue;

  return (
    <div className="space-y-4 max-w-[1400px] mx-auto">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-stock-ledger-title">Stock Ledger</h1>
          <p className="text-sm text-muted-foreground">
            Track incoming, outgoing, and returned stock
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button
            variant="outline"
            onClick={() => {
              if (!entries || entries.length === 0) return;
              const headers = ["Date", "Product", "SKU", "Type", "Quantity", "Unit Price", "Total Value", "Supplier"];
              const rows = entries.map((entry) => [
                formatPkDate(entry.date),
                entry.productName,
                entry.sku || "",
                TYPE_LABELS[entry.type] || entry.type,
                String(entry.quantity),
                String(entry.unitPrice),
                String(entry.totalValue),
                entry.supplier || "",
              ]);
              exportCsvWithDate("stock-ledger", headers, rows);
            }}
            disabled={!entries || entries.length === 0}
            data-testid="button-export-stock-ledger"
          >
            <Download className="w-4 h-4 mr-2" />
            Export
          </Button>
          <Button onClick={openAddDialog} data-testid="button-add-entry">
            <Plus className="w-4 h-4 mr-2" />
            Add Entry
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Incoming Stock</CardTitle>
            <ArrowDownLeft className="w-4 h-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold" data-testid="text-incoming-value">
              {summary ? formatPKR(incomingSummary.totalValue) : <Skeleton className="h-8 w-32" />}
            </p>
            <p className="text-xs text-muted-foreground" data-testid="text-incoming-qty">
              {summary ? `${incomingSummary.totalQuantity.toLocaleString()} units` : ""}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Outgoing Stock</CardTitle>
            <ArrowUpRight className="w-4 h-4 text-blue-600" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold" data-testid="text-outgoing-value">
              {summary ? formatPKR(outgoingSummary.totalValue) : <Skeleton className="h-8 w-32" />}
            </p>
            <p className="text-xs text-muted-foreground" data-testid="text-outgoing-qty">
              {summary ? `${outgoingSummary.totalQuantity.toLocaleString()} units` : ""}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Returns</CardTitle>
            <RotateCcw className="w-4 h-4 text-amber-600" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold" data-testid="text-return-value">
              {summary ? formatPKR(returnSummary.totalValue) : <Skeleton className="h-8 w-32" />}
            </p>
            <p className="text-xs text-muted-foreground" data-testid="text-return-qty">
              {summary ? `${returnSummary.totalQuantity.toLocaleString()} units` : ""}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Net Stock</CardTitle>
            <Package className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold" data-testid="text-net-value">
              {summary ? formatPKR(netValue) : <Skeleton className="h-8 w-32" />}
            </p>
            <p className="text-xs text-muted-foreground" data-testid="text-net-qty">
              {summary ? `${netQty.toLocaleString()} units` : ""}
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-muted-foreground" />
        </div>
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-[160px]" data-testid="select-type-filter">
            <SelectValue placeholder="Type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            <SelectItem value="incoming">Incoming</SelectItem>
            <SelectItem value="outgoing">Outgoing</SelectItem>
            <SelectItem value="return">Return</SelectItem>
          </SelectContent>
        </Select>
        <div className="flex items-center gap-2">
          <Calendar className="w-4 h-4 text-muted-foreground" />
          <Input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="w-[160px]"
            data-testid="input-start-date"
          />
          <span className="text-sm text-muted-foreground">to</span>
          <Input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="w-[160px]"
            data-testid="input-end-date"
          />
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-4 space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : !entries || entries.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 px-4 text-center" data-testid="empty-state-stock-ledger">
              <Package className="w-12 h-12 text-muted-foreground mb-3" />
              <h3 className="font-semibold text-lg mb-1">No stock entries found</h3>
              <p className="text-sm text-muted-foreground mb-4">
                {typeFilter !== "all" || startDate || endDate
                  ? "Try adjusting your filters"
                  : "Add your first stock entry to get started"}
              </p>
              {typeFilter === "all" && !startDate && !endDate && (
                <Button onClick={openAddDialog} data-testid="button-add-entry-empty">
                  <Plus className="w-4 h-4 mr-2" />
                  Add Entry
                </Button>
              )}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Product Name</TableHead>
                  <TableHead>SKU</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Qty</TableHead>
                  <TableHead>Unit Price</TableHead>
                  <TableHead>Total Value</TableHead>
                  <TableHead>Supplier</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {entries.map((entry) => (
                  <TableRow key={entry.id} data-testid={`row-entry-${entry.id}`}>
                    <TableCell className="text-sm" data-testid={`text-entry-date-${entry.id}`}>
                      {formatPkDate(entry.date)}
                    </TableCell>
                    <TableCell>
                      <p className="font-medium" data-testid={`text-entry-product-${entry.id}`}>{entry.productName}</p>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground" data-testid={`text-entry-sku-${entry.id}`}>
                      {entry.sku || "-"}
                    </TableCell>
                    <TableCell>
                      <Badge className={TYPE_BADGE_STYLES[entry.type] || ""} data-testid={`badge-entry-type-${entry.id}`}>
                        {TYPE_LABELS[entry.type] || entry.type}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm" data-testid={`text-entry-qty-${entry.id}`}>
                      {entry.quantity.toLocaleString()}
                    </TableCell>
                    <TableCell className="text-sm" data-testid={`text-entry-unit-price-${entry.id}`}>
                      {formatPKR(entry.unitPrice)}
                    </TableCell>
                    <TableCell className="font-medium" data-testid={`text-entry-total-${entry.id}`}>
                      {formatPKR(entry.totalValue)}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground" data-testid={`text-entry-supplier-${entry.id}`}>
                      {entry.supplier || "-"}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => openEditDialog(entry)}
                          data-testid={`button-edit-entry-${entry.id}`}
                        >
                          <Pencil className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setDeleteEntry(entry)}
                          data-testid={`button-delete-entry-${entry.id}`}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={(open) => { if (!open) closeDialog(); }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle data-testid="text-dialog-title">
              {editingEntry ? "Edit Stock Entry" : "Add Stock Entry"}
            </DialogTitle>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="type"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Type</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger data-testid="select-entry-type">
                          <SelectValue placeholder="Select type" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="incoming">Incoming</SelectItem>
                        <SelectItem value="outgoing">Outgoing</SelectItem>
                        <SelectItem value="return">Return</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="productName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Product Name</FormLabel>
                    <FormControl>
                      <Input placeholder="Enter product name" {...field} data-testid="input-product-name" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="sku"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>SKU</FormLabel>
                      <FormControl>
                        <Input placeholder="Optional SKU" {...field} data-testid="input-sku" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="date"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Date</FormLabel>
                      <FormControl>
                        <Input type="date" {...field} data-testid="input-entry-date" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="quantity"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Quantity</FormLabel>
                      <FormControl>
                        <Input type="number" step="1" min="1" placeholder="0" {...field} data-testid="input-quantity" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="unitPrice"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Unit Price (PKR)</FormLabel>
                      <FormControl>
                        <Input type="number" step="0.01" min="0" placeholder="0.00" {...field} data-testid="input-unit-price" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              {calculatedTotal > 0 && (
                <div className="rounded-md bg-muted p-3">
                  <p className="text-sm text-muted-foreground">Total Value</p>
                  <p className="text-lg font-bold" data-testid="text-calculated-total">{formatPKR(calculatedTotal)}</p>
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="supplier"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Supplier</FormLabel>
                      <FormControl>
                        <Input placeholder="Supplier name" {...field} data-testid="input-supplier" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="reference"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Reference</FormLabel>
                      <FormControl>
                        <Input placeholder="Invoice/PO number" {...field} data-testid="input-reference" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={form.control}
                name="notes"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Notes</FormLabel>
                    <FormControl>
                      <Textarea placeholder="Optional notes" {...field} data-testid="input-notes" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <DialogFooter>
                <Button type="button" variant="outline" onClick={closeDialog} data-testid="button-cancel">
                  Cancel
                </Button>
                <Button type="submit" disabled={isMutating} data-testid="button-submit">
                  {isMutating && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  {editingEntry ? "Update" : "Add Entry"}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteEntry} onOpenChange={(open) => { if (!open) setDeleteEntry(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Stock Entry</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete the entry for "{deleteEntry?.productName}"? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteEntry && deleteMutation.mutate(deleteEntry.id)}
              data-testid="button-confirm-delete"
            >
              {deleteMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
