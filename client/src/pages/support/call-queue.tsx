import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
  RefreshCw,
  Clock,
  CheckCircle2,
  XCircle,
  SkipForward,
  ListOrdered,
  Send,
} from "lucide-react";

interface QueueEntry {
  id: string;
  orderId: string;
  orderNumber: string;
  customerName: string;
  phone: string;
  amount: string;
  status: string;
  reason: string;
  queuedAt: string;
  scheduledAt: string | null;
  attemptCount: number;
  maxAttempts: number;
  lastCallResult: string | null;
  waResponseArrived: boolean;
}

const STATUS_BADGE: Record<string, { label: string; className: string }> = {
  waiting: { label: "Waiting", className: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300" },
  sending: { label: "Sending", className: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300" },
  completed: { label: "Completed", className: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300" },
  processed: { label: "Processed", className: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-300" },
  failed: { label: "Failed", className: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300" },
  skipped: { label: "Skipped", className: "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300" },
  exhausted: { label: "Exhausted", className: "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-300" },
};

function formatDate(dateStr: string | null) {
  if (!dateStr) return "-";
  try {
    return new Date(dateStr).toLocaleString();
  } catch {
    return dateStr;
  }
}

export default function CallQueuePage() {
  const { data, isLoading, refetch, isFetching } = useQuery<{ entries: QueueEntry[] }>({
    queryKey: ["/api/robocall/queue"],
    refetchInterval: 30000,
  });

  const entries = data?.entries || [];

  const counts = {
    waiting: entries.filter((e) => e.status === "waiting").length,
    sending: entries.filter((e) => e.status === "sending").length,
    completed: entries.filter((e) => e.status === "completed").length,
    failed: entries.filter((e) => e.status === "failed").length,
    skipped: entries.filter((e) => e.status === "skipped").length,
    exhausted: entries.filter((e) => e.status === "exhausted").length,
  };

  return (
    <div className="space-y-6 max-w-7xl">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-page-title">Call Queue</h1>
          <p className="text-muted-foreground mt-1" data-testid="text-page-description">
            Monitor robocall queue entries and their statuses.
          </p>
        </div>
        <Button
          variant="outline"
          onClick={() => refetch()}
          disabled={isFetching}
          data-testid="button-refresh-queue"
        >
          <RefreshCw className={`w-4 h-4 mr-2 ${isFetching ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <Card data-testid="card-count-waiting">
          <CardHeader className="flex flex-row items-center justify-between gap-1 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Waiting</CardTitle>
            <Clock className="w-4 h-4 text-yellow-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-count-waiting">{isLoading ? <Skeleton className="h-8 w-12" /> : counts.waiting}</div>
          </CardContent>
        </Card>
        <Card data-testid="card-count-sending">
          <CardHeader className="flex flex-row items-center justify-between gap-1 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Sending</CardTitle>
            <Send className="w-4 h-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-count-sending">{isLoading ? <Skeleton className="h-8 w-12" /> : counts.sending}</div>
          </CardContent>
        </Card>
        <Card data-testid="card-count-completed">
          <CardHeader className="flex flex-row items-center justify-between gap-1 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Completed</CardTitle>
            <CheckCircle2 className="w-4 h-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-count-completed">{isLoading ? <Skeleton className="h-8 w-12" /> : counts.completed}</div>
          </CardContent>
        </Card>
        <Card data-testid="card-count-failed">
          <CardHeader className="flex flex-row items-center justify-between gap-1 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Failed</CardTitle>
            <XCircle className="w-4 h-4 text-red-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-count-failed">{isLoading ? <Skeleton className="h-8 w-12" /> : counts.failed}</div>
          </CardContent>
        </Card>
        <Card data-testid="card-count-skipped">
          <CardHeader className="flex flex-row items-center justify-between gap-1 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Skipped</CardTitle>
            <SkipForward className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-count-skipped">{isLoading ? <Skeleton className="h-8 w-12" /> : counts.skipped}</div>
          </CardContent>
        </Card>
        <Card data-testid="card-count-exhausted">
          <CardHeader className="flex flex-row items-center justify-between gap-1 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Exhausted</CardTitle>
            <XCircle className="w-4 h-4 text-orange-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-count-exhausted">{isLoading ? <Skeleton className="h-8 w-12" /> : counts.exhausted}</div>
          </CardContent>
        </Card>
      </div>

      <Card data-testid="card-queue-table">
        <CardHeader className="flex flex-row items-center justify-between gap-1 space-y-0">
          <CardTitle className="flex items-center gap-2 text-lg">
            <ListOrdered className="w-5 h-5" />
            Queue Entries
          </CardTitle>
          <Badge variant="secondary" data-testid="badge-total-count">{entries.length} total</Badge>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : entries.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground" data-testid="text-empty-queue">
              No queue entries found.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Order #</TableHead>
                    <TableHead>Customer Name</TableHead>
                    <TableHead>Phone</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Reason</TableHead>
                    <TableHead>Queued At</TableHead>
                    <TableHead>Scheduled At</TableHead>
                    <TableHead>Attempts</TableHead>
                    <TableHead>Last Result</TableHead>
                    <TableHead>WA Response</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {entries.map((entry, index) => {
                    const statusInfo = STATUS_BADGE[entry.status] || { label: entry.status, className: "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300" };
                    return (
                      <TableRow key={entry.id || index} data-testid={`row-queue-entry-${index}`}>
                        <TableCell className="font-medium" data-testid={`text-order-number-${index}`}>{entry.orderNumber}</TableCell>
                        <TableCell data-testid={`text-customer-name-${index}`}>{entry.customerName}</TableCell>
                        <TableCell data-testid={`text-phone-${index}`}>{entry.phone}</TableCell>
                        <TableCell data-testid={`text-amount-${index}`}>{entry.amount}</TableCell>
                        <TableCell>
                          <Badge className={statusInfo.className} data-testid={`badge-status-${index}`}>
                            {statusInfo.label}
                          </Badge>
                        </TableCell>
                        <TableCell className="max-w-[200px] truncate" data-testid={`text-reason-${index}`}>{entry.reason || "-"}</TableCell>
                        <TableCell className="whitespace-nowrap" data-testid={`text-queued-at-${index}`}>{formatDate(entry.queuedAt)}</TableCell>
                        <TableCell className="whitespace-nowrap" data-testid={`text-scheduled-at-${index}`}>{formatDate(entry.scheduledAt)}</TableCell>
                        <TableCell data-testid={`text-attempts-${index}`}>{entry.attemptCount}/{entry.maxAttempts || 3}</TableCell>
                        <TableCell data-testid={`text-last-result-${index}`}>
                          {entry.lastCallResult ? (
                            <span className="text-sm">{entry.lastCallResult}</span>
                          ) : (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </TableCell>
                        <TableCell data-testid={`text-wa-response-${index}`}>
                          {entry.waResponseArrived ? (
                            <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300">Yes</Badge>
                          ) : (
                            <span className="text-muted-foreground">No</span>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}