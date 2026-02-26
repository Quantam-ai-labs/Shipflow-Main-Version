import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { format } from "date-fns";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
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
  DollarSign,
  Truck,
  CheckCircle,
  Clock,
  AlertTriangle,
  Plus,
  Pencil,
  Trash2,
  Loader2,
} from "lucide-react";
import type { CourierDue } from "@shared/schema";

const COURIERS = ["Leopards", "PostEx", "TCS", "Other"] as const;
const TYPES = ["payable", "receivable"] as const;
const STATUSES = ["pending", "partial", "paid", "overdue"] as const;

const dueFormSchema = z.object({
  courierName: z.string().min(1, "Courier is required"),
  type: z.enum(["payable", "receivable"], { required_error: "Type is required" }),
  amount: z.string().min(1, "Amount is required").refine((v) => !isNaN(Number(v)) && Number(v) > 0, "Must be a positive number"),
  description: z.string().optional(),
  reference: z.string().optional(),
  dueDate: z.string().optional(),
  status: z.enum(["pending", "partial", "paid", "overdue"]).default("pending"),
  date: z.string().min(1, "Date is required"),
  notes: z.string().optional(),
});

type DueFormValues = z.infer<typeof dueFormSchema>;

function formatPKR(amount: string | number): string {
  const num = typeof amount === "string" ? parseFloat(amount) : amount;
  if (isNaN(num)) return "PKR 0";
  return `PKR ${num.toLocaleString("en-PK", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

interface DueSummary {
  totalPayable: number;
  totalReceivable: number;
  totalSettled: number;
  totalOverdue: number;
}

const STATUS_BADGE_CLASSES: Record<string, string> = {
  pending: "bg-amber-500/10 text-amber-600 border-amber-500/20",
  partial: "bg-blue-500/10 text-blue-600 border-blue-500/20",
  paid: "bg-green-500/10 text-green-600 border-green-500/20",
  overdue: "bg-red-500/10 text-red-600 border-red-500/20",
};

const TYPE_BADGE_CLASSES: Record<string, string> = {
  payable: "bg-red-500/10 text-red-600 border-red-500/20",
  receivable: "bg-green-500/10 text-green-600 border-green-500/20",
};

export default function CourierDuesPage() {
  const { toast } = useToast();
  const [courierFilter, setCourierFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingDue, setEditingDue] = useState<CourierDue | null>(null);
  const [deleteDue, setDeleteDue] = useState<CourierDue | null>(null);

  const buildQueryUrl = () => {
    const params = new URLSearchParams();
    if (courierFilter && courierFilter !== "all") params.set("courierName", courierFilter);
    if (statusFilter && statusFilter !== "all") params.set("status", statusFilter);
    const qs = params.toString();
    return `/api/courier-dues${qs ? `?${qs}` : ""}`;
  };

  const { data: dues, isLoading } = useQuery<CourierDue[]>({
    queryKey: [buildQueryUrl()],
  });

  const { data: summary } = useQuery<DueSummary>({
    queryKey: ["/api/courier-dues/summary"],
  });

  const form = useForm<DueFormValues>({
    resolver: zodResolver(dueFormSchema),
    defaultValues: {
      courierName: "",
      type: "payable",
      amount: "",
      description: "",
      reference: "",
      dueDate: "",
      status: "pending",
      date: format(new Date(), "yyyy-MM-dd"),
      notes: "",
    },
  });

  const createMutation = useMutation({
    mutationFn: (data: DueFormValues) =>
      apiRequest("POST", "/api/courier-dues", {
        ...data,
        amount: data.amount,
        date: new Date(data.date).toISOString(),
        dueDate: data.dueDate ? new Date(data.dueDate).toISOString() : null,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ predicate: (q) => String(q.queryKey[0]).startsWith("/api/courier-dues") });
      toast({ title: "Due created", description: "Courier due has been added successfully." });
      closeDialog();
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: DueFormValues }) =>
      apiRequest("PUT", `/api/courier-dues/${id}`, {
        ...data,
        amount: data.amount,
        date: new Date(data.date).toISOString(),
        dueDate: data.dueDate ? new Date(data.dueDate).toISOString() : null,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ predicate: (q) => String(q.queryKey[0]).startsWith("/api/courier-dues") });
      toast({ title: "Due updated", description: "Courier due has been updated successfully." });
      closeDialog();
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/courier-dues/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ predicate: (q) => String(q.queryKey[0]).startsWith("/api/courier-dues") });
      toast({ title: "Due deleted", description: "Courier due has been removed." });
      setDeleteDue(null);
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const markPaidMutation = useMutation({
    mutationFn: (id: string) =>
      apiRequest("PUT", `/api/courier-dues/${id}`, {
        status: "paid",
        paidDate: new Date().toISOString(),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ predicate: (q) => String(q.queryKey[0]).startsWith("/api/courier-dues") });
      toast({ title: "Marked as paid", description: "Courier due has been marked as paid." });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const openAddDialog = () => {
    setEditingDue(null);
    form.reset({
      courierName: "",
      type: "payable",
      amount: "",
      description: "",
      reference: "",
      dueDate: "",
      status: "pending",
      date: format(new Date(), "yyyy-MM-dd"),
      notes: "",
    });
    setDialogOpen(true);
  };

  const openEditDialog = (due: CourierDue) => {
    setEditingDue(due);
    form.reset({
      courierName: due.courierName,
      type: due.type as "payable" | "receivable",
      amount: String(due.amount),
      description: due.description || "",
      reference: due.reference || "",
      dueDate: due.dueDate ? format(new Date(due.dueDate), "yyyy-MM-dd") : "",
      status: due.status as "pending" | "partial" | "paid" | "overdue",
      date: due.date ? format(new Date(due.date), "yyyy-MM-dd") : "",
      notes: due.notes || "",
    });
    setDialogOpen(true);
  };

  const closeDialog = () => {
    setDialogOpen(false);
    setEditingDue(null);
    form.reset();
  };

  const onSubmit = (values: DueFormValues) => {
    if (editingDue) {
      updateMutation.mutate({ id: editingDue.id, data: values });
    } else {
      createMutation.mutate(values);
    }
  };

  const isMutating = createMutation.isPending || updateMutation.isPending;

  const filteredDues = (dues || []).filter((d) => {
    if (typeFilter !== "all" && d.type !== typeFilter) return false;
    return true;
  });

  return (
    <div className="space-y-4 max-w-[1400px] mx-auto">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-courier-dues-title">Courier Dues</h1>
          <p className="text-sm text-muted-foreground">
            Track payables and receivables with courier partners
          </p>
        </div>
        <Button onClick={openAddDialog} data-testid="button-add-due">
          <Plus className="w-4 h-4 mr-2" />
          Add Due
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Payable</CardTitle>
            <DollarSign className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold" data-testid="text-total-payable">
              {summary ? formatPKR(summary.totalPayable) : <Skeleton className="h-8 w-32" />}
            </p>
            <p className="text-xs text-muted-foreground mt-1">Pending + Partial</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Receivable</CardTitle>
            <Truck className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold" data-testid="text-total-receivable">
              {summary ? formatPKR(summary.totalReceivable) : <Skeleton className="h-8 w-32" />}
            </p>
            <p className="text-xs text-muted-foreground mt-1">Pending + Partial</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Settled</CardTitle>
            <CheckCircle className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold" data-testid="text-total-settled">
              {summary ? formatPKR(summary.totalSettled) : <Skeleton className="h-8 w-32" />}
            </p>
            <p className="text-xs text-muted-foreground mt-1">Paid total</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Overdue</CardTitle>
            <AlertTriangle className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold" data-testid="text-total-overdue">
              {summary ? formatPKR(summary.totalOverdue) : <Skeleton className="h-8 w-32" />}
            </p>
            <p className="text-xs text-muted-foreground mt-1">Past due date</p>
          </CardContent>
        </Card>
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <Select value={courierFilter} onValueChange={setCourierFilter}>
          <SelectTrigger className="w-[150px]" data-testid="select-courier-filter">
            <SelectValue placeholder="Courier" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Couriers</SelectItem>
            {COURIERS.map((c) => (
              <SelectItem key={c} value={c}>{c}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[140px]" data-testid="select-status-filter">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="partial">Partial</SelectItem>
            <SelectItem value="paid">Paid</SelectItem>
            <SelectItem value="overdue">Overdue</SelectItem>
          </SelectContent>
        </Select>
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-[150px]" data-testid="select-type-filter">
            <SelectValue placeholder="Type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            <SelectItem value="payable">Payable</SelectItem>
            <SelectItem value="receivable">Receivable</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-4 space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : filteredDues.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 px-4 text-center" data-testid="empty-state">
              <Clock className="w-12 h-12 text-muted-foreground mb-3" />
              <h3 className="font-semibold text-lg mb-1">No courier dues found</h3>
              <p className="text-sm text-muted-foreground mb-4">
                {courierFilter !== "all" || statusFilter !== "all" || typeFilter !== "all"
                  ? "Try adjusting your filters"
                  : "Add your first courier due to get started"}
              </p>
              {courierFilter === "all" && statusFilter === "all" && typeFilter === "all" && (
                <Button onClick={openAddDialog} data-testid="button-add-due-empty">
                  <Plus className="w-4 h-4 mr-2" />
                  Add Due
                </Button>
              )}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Courier</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Due Date</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredDues.map((due) => (
                  <TableRow key={due.id} data-testid={`row-due-${due.id}`}>
                    <TableCell className="text-sm" data-testid={`text-date-${due.id}`}>
                      {due.date ? format(new Date(due.date), "dd MMM yyyy") : "-"}
                    </TableCell>
                    <TableCell className="text-sm font-medium" data-testid={`text-courier-${due.id}`}>
                      {due.courierName}
                    </TableCell>
                    <TableCell>
                      <Badge
                        className={TYPE_BADGE_CLASSES[due.type] || ""}
                        data-testid={`badge-type-${due.id}`}
                      >
                        {due.type === "payable" ? "Payable" : "Receivable"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm max-w-[200px] truncate" data-testid={`text-description-${due.id}`}>
                      {due.description || "-"}
                    </TableCell>
                    <TableCell className="text-sm font-medium" data-testid={`text-amount-${due.id}`}>
                      {formatPKR(due.amount)}
                    </TableCell>
                    <TableCell className="text-sm" data-testid={`text-due-date-${due.id}`}>
                      {due.dueDate ? format(new Date(due.dueDate), "dd MMM yyyy") : "-"}
                    </TableCell>
                    <TableCell>
                      <Badge
                        className={STATUS_BADGE_CLASSES[due.status] || ""}
                        data-testid={`badge-status-${due.id}`}
                      >
                        {due.status.charAt(0).toUpperCase() + due.status.slice(1)}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        {due.status !== "paid" && (
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => markPaidMutation.mutate(due.id)}
                            disabled={markPaidMutation.isPending}
                            data-testid={`button-mark-paid-${due.id}`}
                          >
                            <CheckCircle className="w-4 h-4" />
                          </Button>
                        )}
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => openEditDialog(due)}
                          data-testid={`button-edit-${due.id}`}
                        >
                          <Pencil className="w-4 h-4" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => setDeleteDue(due)}
                          data-testid={`button-delete-${due.id}`}
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
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle data-testid="text-dialog-title">
              {editingDue ? "Edit Courier Due" : "Add Courier Due"}
            </DialogTitle>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="courierName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Courier</FormLabel>
                      <Select value={field.value} onValueChange={field.onChange}>
                        <FormControl>
                          <SelectTrigger data-testid="select-form-courier">
                            <SelectValue placeholder="Select courier" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {COURIERS.map((c) => (
                            <SelectItem key={c} value={c}>{c}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="type"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Type</FormLabel>
                      <Select value={field.value} onValueChange={field.onChange}>
                        <FormControl>
                          <SelectTrigger data-testid="select-form-type">
                            <SelectValue placeholder="Select type" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="payable">Payable</SelectItem>
                          <SelectItem value="receivable">Receivable</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="amount"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Amount (PKR)</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          step="0.01"
                          placeholder="0.00"
                          {...field}
                          data-testid="input-form-amount"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="status"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Status</FormLabel>
                      <Select value={field.value} onValueChange={field.onChange}>
                        <FormControl>
                          <SelectTrigger data-testid="select-form-status">
                            <SelectValue placeholder="Select status" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="pending">Pending</SelectItem>
                          <SelectItem value="partial">Partial</SelectItem>
                          <SelectItem value="paid">Paid</SelectItem>
                          <SelectItem value="overdue">Overdue</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <FormField
                control={form.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Description</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="Brief description"
                        {...field}
                        data-testid="input-form-description"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="date"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Date</FormLabel>
                      <FormControl>
                        <Input type="date" {...field} data-testid="input-form-date" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="dueDate"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Due Date</FormLabel>
                      <FormControl>
                        <Input type="date" {...field} data-testid="input-form-due-date" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <FormField
                control={form.control}
                name="reference"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Reference</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="Invoice or reference number"
                        {...field}
                        data-testid="input-form-reference"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="notes"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Notes</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="Additional notes"
                        className="resize-none"
                        {...field}
                        data-testid="input-form-notes"
                      />
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
                  {editingDue ? "Update" : "Create"}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteDue} onOpenChange={(open) => { if (!open) setDeleteDue(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Courier Due</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this courier due
              {deleteDue?.description ? ` "${deleteDue.description}"` : ""}?
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteDue && deleteMutation.mutate(deleteDue.id)}
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
