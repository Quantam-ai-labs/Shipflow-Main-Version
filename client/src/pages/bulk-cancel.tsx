import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  AlertTriangle,
  Ban,
  CheckCircle,
  XCircle,
  Loader2,
  ArrowLeft,
  Clock,
  RefreshCw,
  Search,
  PlayCircle,
} from "lucide-react";
import { Link } from "wouter";
import type { CancellationJob } from "@shared/schema";
import { formatPkDateTime } from "@/lib/dateFormat";

type PreviewResult = {
  matched: Array<{
    id: string;
    orderNumber: string;
    courierName: string | null;
    courierTracking: string | null;
    workflowStatus: string;
    shopifyOrderId: string | null;
    totalAmount: string | null;
    customerName: string | null;
    cancelledAt: string | null;
    canCancelCourier: boolean;
    canCancelShopify: boolean;
  }>;
  notFound: string[];
};

type JobWithItems = CancellationJob & {
  items: Array<{
    id: string;
    orderId: string | null;
    trackingNumber: string | null;
    shopifyOrderId: string | null;
    orderNumber: string | null;
    action: string;
    status: string;
    errorMessage: string | null;
    courierResponse: any;
  }>;
};

function statusBadge(status: string) {
  switch (status) {
    case "QUEUED":
      return <Badge variant="secondary" data-testid={`badge-status-${status}`}><Clock className="w-3 h-3 mr-1" />Queued</Badge>;
    case "RUNNING":
      return <Badge variant="default" data-testid={`badge-status-${status}`}><Loader2 className="w-3 h-3 mr-1 animate-spin" />Running</Badge>;
    case "COMPLETED":
      return <Badge variant="default" className="bg-green-600 border-green-700" data-testid={`badge-status-${status}`}><CheckCircle className="w-3 h-3 mr-1" />Completed</Badge>;
    case "PARTIAL":
      return <Badge variant="default" className="bg-amber-600 border-amber-700" data-testid={`badge-status-${status}`}><AlertTriangle className="w-3 h-3 mr-1" />Partial</Badge>;
    case "FAILED":
      return <Badge variant="destructive" data-testid={`badge-status-${status}`}><XCircle className="w-3 h-3 mr-1" />Failed</Badge>;
    default:
      return <Badge variant="secondary">{status}</Badge>;
  }
}

function itemStatusBadge(status: string) {
  switch (status) {
    case "SUCCESS":
      return <Badge variant="default" className="bg-green-600 border-green-700"><CheckCircle className="w-3 h-3 mr-1" />Success</Badge>;
    case "FAILED":
      return <Badge variant="destructive"><XCircle className="w-3 h-3 mr-1" />Failed</Badge>;
    case "SKIPPED":
      return <Badge variant="secondary">Skipped</Badge>;
    case "PENDING":
      return <Badge variant="secondary"><Clock className="w-3 h-3 mr-1" />Pending</Badge>;
    default:
      return <Badge variant="secondary">{status}</Badge>;
  }
}

export default function BulkCancel() {
  const { toast } = useToast();
  const [view, setView] = useState<"create" | "detail">("create");
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);

  const [inputType, setInputType] = useState("ORDER_IDS");
  const [jobType, setJobType] = useState("COURIER_CANCEL");
  const [inputText, setInputText] = useState("");
  const [previewData, setPreviewData] = useState<PreviewResult | null>(null);
  const [showPreview, setShowPreview] = useState(false);

  const { data: jobsData, isLoading: jobsLoading } = useQuery<{ jobs: CancellationJob[]; total: number }>({
    queryKey: ["/api/cancellation-jobs"],
  });

  const { data: jobDetail, isLoading: detailLoading } = useQuery<JobWithItems>({
    queryKey: ["/api/cancellation-jobs", selectedJobId],
    enabled: !!selectedJobId && view === "detail",
    refetchInterval: (query) => {
      const data = query.state.data as JobWithItems | undefined;
      if (data && (data.status === "QUEUED" || data.status === "RUNNING")) return 2000;
      return false;
    },
  });

  const previewMutation = useMutation({
    mutationFn: async () => {
      const identifiers = inputText.split("\n").map(l => l.trim()).filter(Boolean);
      const res = await apiRequest("POST", "/api/cancellation-jobs/preview", {
        inputType,
        jobType,
        identifiers,
      });
      return res.json();
    },
    onSuccess: (data: PreviewResult) => {
      setPreviewData(data);
      setShowPreview(true);
    },
    onError: (err: any) => {
      toast({ title: "Preview failed", description: err.message, variant: "destructive" });
    },
  });

  const createJobMutation = useMutation({
    mutationFn: async () => {
      const identifiers = inputText.split("\n").map(l => l.trim()).filter(Boolean);
      const res = await apiRequest("POST", "/api/cancellation-jobs", {
        inputType,
        jobType,
        identifiers,
      });
      return res.json();
    },
    onSuccess: (data: any) => {
      toast({ title: "Job created", description: `Cancellation job started with ${data.job?.totalCount || 0} items.` });
      setShowPreview(false);
      setPreviewData(null);
      setInputText("");
      queryClient.invalidateQueries({ queryKey: ["/api/cancellation-jobs"] });
      setSelectedJobId(data.job?.id);
      setView("detail");
    },
    onError: (err: any) => {
      toast({ title: "Failed to create job", description: err.message, variant: "destructive" });
    },
  });

  const identifierCount = inputText.split("\n").map(l => l.trim()).filter(Boolean).length;

  if (view === "detail" && selectedJobId) {
    return (
      <div className="space-y-6 max-w-5xl">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={() => { setView("create"); setSelectedJobId(null); }} data-testid="button-back-to-list">
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold" data-testid="text-job-detail-title">Cancellation Job</h1>
            <p className="text-sm text-muted-foreground">{selectedJobId}</p>
          </div>
        </div>

        {detailLoading ? (
          <Card><CardContent className="p-6"><Skeleton className="h-40 w-full" /></CardContent></Card>
        ) : jobDetail ? (
          <>
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <CardTitle className="text-lg">Job Summary</CardTitle>
                  {statusBadge(jobDetail.status)}
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div>
                    <p className="text-sm text-muted-foreground">Type</p>
                    <p className="font-medium" data-testid="text-job-type">{jobDetail.jobType.replace("_", " ")}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Input</p>
                    <p className="font-medium">{jobDetail.inputType.replace("_", " ")}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Total</p>
                    <p className="font-medium" data-testid="text-job-total">{jobDetail.totalCount}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Created</p>
                    <p className="font-medium">{formatPkDateTime(jobDetail.createdAt)}</p>
                  </div>
                </div>
                <Separator className="my-4" />
                <div className="grid grid-cols-3 gap-4">
                  <div className="text-center">
                    <p className="text-2xl font-bold text-green-600" data-testid="text-success-count">{jobDetail.successCount || 0}</p>
                    <p className="text-sm text-muted-foreground">Successful</p>
                  </div>
                  <div className="text-center">
                    <p className="text-2xl font-bold text-destructive" data-testid="text-failed-count">{jobDetail.failedCount || 0}</p>
                    <p className="text-sm text-muted-foreground">Failed</p>
                  </div>
                  <div className="text-center">
                    <p className="text-2xl font-bold text-muted-foreground" data-testid="text-skipped-count">{jobDetail.skippedCount || 0}</p>
                    <p className="text-sm text-muted-foreground">Skipped</p>
                  </div>
                </div>
                {jobDetail.lastError && (
                  <div className="mt-4 p-3 bg-destructive/10 rounded-md text-sm text-destructive">
                    {jobDetail.lastError}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Items ({jobDetail.items?.length || 0})</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Order</TableHead>
                        <TableHead>Tracking</TableHead>
                        <TableHead>Action</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Error</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {jobDetail.items?.map((item) => (
                        <TableRow key={item.id} data-testid={`row-job-item-${item.id}`}>
                          <TableCell className="font-medium">{item.orderNumber || item.orderId || "-"}</TableCell>
                          <TableCell className="text-muted-foreground">{item.trackingNumber || "-"}</TableCell>
                          <TableCell>
                            <Badge variant="outline">{item.action === "COURIER_CANCEL" ? "Courier" : "Shopify"}</Badge>
                          </TableCell>
                          <TableCell>{itemStatusBadge(item.status)}</TableCell>
                          <TableCell className="text-sm text-destructive max-w-[200px] truncate">{item.errorMessage || "-"}</TableCell>
                        </TableRow>
                      ))}
                      {(!jobDetail.items || jobDetail.items.length === 0) && (
                        <TableRow>
                          <TableCell colSpan={5} className="text-center text-muted-foreground py-8">No items</TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </>
        ) : (
          <Card><CardContent className="p-6 text-center text-muted-foreground">Job not found</CardContent></Card>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-5xl">
      <div>
        <h1 className="text-2xl font-bold" data-testid="text-bulk-cancel-title">Bulk Cancellation</h1>
        <p className="text-muted-foreground">Cancel multiple orders at once by pasting order numbers, tracking numbers, or order IDs.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>New Cancellation Job</CardTitle>
              <CardDescription>Paste identifiers (one per line) and select the cancellation type.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Identifier Type</Label>
                  <Select value={inputType} onValueChange={setInputType} data-testid="select-input-type">
                    <SelectTrigger data-testid="trigger-input-type">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ORDER_IDS">Order IDs</SelectItem>
                      <SelectItem value="SHOPIFY_NAMES">Order Numbers</SelectItem>
                      <SelectItem value="TRACKING_NUMBERS">Tracking Numbers</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Cancel Action</Label>
                  <Select value={jobType} onValueChange={setJobType} data-testid="select-job-type">
                    <SelectTrigger data-testid="trigger-job-type">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="COURIER_CANCEL">Cancel Courier AWB</SelectItem>
                      <SelectItem value="SHOPIFY_CANCEL">Cancel on Shopify</SelectItem>
                      <SelectItem value="BOTH">Cancel Both</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2">
                <Label>Identifiers (one per line)</Label>
                <Textarea
                  value={inputText}
                  onChange={(e) => { setInputText(e.target.value); setShowPreview(false); setPreviewData(null); }}
                  placeholder={"Paste identifiers here, one per line...\ne.g.\n#1001\n#1002\n#1003"}
                  rows={8}
                  data-testid="textarea-identifiers"
                />
                <p className="text-xs text-muted-foreground">{identifierCount} identifier{identifierCount !== 1 ? "s" : ""} entered</p>
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                <Button
                  onClick={() => previewMutation.mutate()}
                  disabled={identifierCount === 0 || previewMutation.isPending}
                  variant="outline"
                  data-testid="button-preview"
                >
                  {previewMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Search className="w-4 h-4 mr-2" />}
                  Preview
                </Button>
                {showPreview && previewData && previewData.matched.length > 0 && (
                  <Button
                    onClick={() => createJobMutation.mutate()}
                    disabled={createJobMutation.isPending}
                    variant="destructive"
                    data-testid="button-start-job"
                  >
                    {createJobMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <PlayCircle className="w-4 h-4 mr-2" />}
                    Start Cancellation ({previewData.matched.length} orders)
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>

          {showPreview && previewData && (
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <CardTitle className="text-lg">Preview Results</CardTitle>
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge variant="default" className="bg-green-600 border-green-700">{previewData.matched.length} matched</Badge>
                    {previewData.notFound.length > 0 && (
                      <Badge variant="destructive">{previewData.notFound.length} not found</Badge>
                    )}
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                {previewData.matched.length > 0 && (
                  <div className="overflow-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Order</TableHead>
                          <TableHead>Customer</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Courier</TableHead>
                          <TableHead>Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {previewData.matched.map((order) => (
                          <TableRow key={order.id} data-testid={`row-preview-${order.id}`}>
                            <TableCell className="font-medium">{order.orderNumber || order.id}</TableCell>
                            <TableCell className="text-muted-foreground">{order.customerName || "-"}</TableCell>
                            <TableCell><Badge variant="outline">{order.workflowStatus}</Badge></TableCell>
                            <TableCell className="text-muted-foreground">{order.courierName || "-"} {order.courierTracking ? `(${order.courierTracking})` : ""}</TableCell>
                            <TableCell>
                              <div className="flex items-center gap-1 flex-wrap">
                                {order.canCancelCourier && <Badge variant="secondary">AWB</Badge>}
                                {order.canCancelShopify && <Badge variant="secondary">Shopify</Badge>}
                                {!order.canCancelCourier && !order.canCancelShopify && (
                                  <span className="text-xs text-muted-foreground">No action</span>
                                )}
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
                {previewData.notFound.length > 0 && (
                  <div className="p-4 border-t">
                    <p className="text-sm font-medium text-destructive mb-2">Not Found ({previewData.notFound.length}):</p>
                    <p className="text-sm text-muted-foreground">{previewData.notFound.join(", ")}</p>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between gap-2">
                <CardTitle className="text-lg">Recent Jobs</CardTitle>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => queryClient.invalidateQueries({ queryKey: ["/api/cancellation-jobs"] })}
                  data-testid="button-refresh-jobs"
                >
                  <RefreshCw className="w-4 h-4" />
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {jobsLoading ? (
                <div className="space-y-3">
                  <Skeleton className="h-16 w-full" />
                  <Skeleton className="h-16 w-full" />
                </div>
              ) : jobsData?.jobs && jobsData.jobs.length > 0 ? (
                <div className="space-y-2">
                  {jobsData.jobs.map((job) => (
                    <div
                      key={job.id}
                      className="p-3 border rounded-md cursor-pointer hover-elevate"
                      onClick={() => { setSelectedJobId(job.id); setView("detail"); }}
                      data-testid={`card-job-${job.id}`}
                    >
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <span className="text-sm font-medium">{job.jobType.replace("_", " ")}</span>
                        {statusBadge(job.status)}
                      </div>
                      <div className="flex items-center gap-3 text-xs text-muted-foreground">
                        <span>{job.totalCount} items</span>
                        {(job.successCount || 0) > 0 && <span className="text-green-600">{job.successCount} ok</span>}
                        {(job.failedCount || 0) > 0 && <span className="text-destructive">{job.failedCount} fail</span>}
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">
                        {formatPkDateTime(job.createdAt)}
                      </p>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-6 text-muted-foreground">
                  <Ban className="w-8 h-8 mx-auto mb-2 opacity-40" />
                  <p className="text-sm">No cancellation jobs yet</p>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">How it works</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-muted-foreground">
              <div className="flex gap-2">
                <span className="font-bold text-foreground">1.</span>
                <span>Paste order numbers, tracking numbers, or IDs (one per line)</span>
              </div>
              <div className="flex gap-2">
                <span className="font-bold text-foreground">2.</span>
                <span>Click Preview to see which orders match and what actions are available</span>
              </div>
              <div className="flex gap-2">
                <span className="font-bold text-foreground">3.</span>
                <span>Click Start to run the cancellation job in the background</span>
              </div>
              <div className="flex gap-2">
                <span className="font-bold text-foreground">4.</span>
                <span>Monitor progress in the Recent Jobs panel</span>
              </div>
              <Separator />
              <div className="space-y-1">
                <p className="font-medium text-foreground">Cancel Actions:</p>
                <p><strong>Courier AWB</strong> - Cancels the AWB with the courier and resets order to Pending</p>
                <p><strong>Shopify</strong> - Cancels the order on Shopify (irreversible)</p>
                <p><strong>Both</strong> - Cancels courier AWB first, then Shopify order</p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
