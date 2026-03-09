import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { MessageCircle, CheckCircle2, XCircle, Users, Wifi, WifiOff, Clock } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

interface DashboardStats {
  messagesSent: number;
  delivered: number;
  failed: number;
  activeConversations: number;
  connected: boolean;
  recentActivity: Array<{
    id: string;
    orderNumber: string;
    customerName: string;
    phone: string | null;
    status: string;
    success: boolean;
    error?: string;
    createdAt: string;
  }>;
}

const STATUS_LABELS: Record<string, string> = {
  NEW: "New Order",
  BOOKED: "Booked",
  FULFILLED: "Shipped",
  DELIVERED: "Delivered",
  PENDING: "Pending",
  HOLD: "On Hold",
  RETURN: "Returned",
  CANCELLED: "Cancelled",
};

export default function SupportDashboardPage() {
  const { data: stats, isLoading } = useQuery<DashboardStats>({
    queryKey: ["/api/support/dashboard-stats"],
  });

  return (
    <div className="p-4 space-y-4 max-w-6xl mx-auto">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold tracking-tight" data-testid="text-page-title">WhatsApp Dashboard</h1>
          <p className="text-muted-foreground text-xs mt-0.5">Monitor automated notifications and conversations</p>
        </div>
        {isLoading ? (
          <Skeleton className="h-7 w-32" />
        ) : (
          <Badge
            variant={stats?.connected ? "default" : "secondary"}
            className="gap-1.5"
            data-testid="status-connection"
          >
            {stats?.connected ? <Wifi className="w-3 h-3" /> : <WifiOff className="w-3 h-3" />}
            {stats?.connected ? "Connected" : "Not Connected"}
          </Badge>
        )}
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard
          title="Messages Sent"
          subtitle="Last 30 days"
          value={stats?.messagesSent}
          icon={<MessageCircle className="w-5 h-5 text-muted-foreground" />}
          isLoading={isLoading}
          testId="stat-messages-sent"
        />
        <StatCard
          title="Delivered"
          subtitle="Successfully sent"
          value={stats?.delivered}
          icon={<CheckCircle2 className="w-5 h-5 text-muted-foreground" />}
          isLoading={isLoading}
          testId="stat-delivered"
        />
        <StatCard
          title="Failed"
          subtitle="Send errors"
          value={stats?.failed}
          icon={<XCircle className="w-5 h-5 text-muted-foreground" />}
          isLoading={isLoading}
          testId="stat-failed"
        />
        <StatCard
          title="Active Conversations"
          subtitle="All time contacts"
          value={stats?.activeConversations}
          icon={<Users className="w-5 h-5 text-muted-foreground" />}
          isLoading={isLoading}
          testId="stat-conversations"
        />
      </div>

      <Card>
        <CardHeader className="pb-2 px-4 pt-4">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Clock className="w-3.5 h-3.5 text-muted-foreground" />
            Recent Activity
          </CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4">
          {isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-8 w-full" />
              ))}
            </div>
          ) : !stats?.recentActivity?.length ? (
            <div className="text-center py-8 text-muted-foreground text-xs">
              No activity yet. WhatsApp notifications will appear here once sent.
            </div>
          ) : (
            <div className="divide-y">
              {stats.recentActivity.map((item) => (
                <div key={item.id} className="py-2 flex items-center justify-between gap-3" data-testid={`row-activity-${item.id}`}>
                  <div className="flex items-center gap-2 min-w-0">
                    {item.success ? (
                      <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0" />
                    ) : (
                      <XCircle className="w-4 h-4 text-red-500 shrink-0" />
                    )}
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate" data-testid={`text-order-${item.id}`}>
                        #{item.orderNumber} — {item.customerName}
                      </p>
                      {item.error && (
                        <p className="text-xs text-red-500 truncate">{item.error}</p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-3 shrink-0 text-right">
                    {item.status && (
                      <Badge variant="outline" className="text-xs hidden sm:inline-flex">
                        {STATUS_LABELS[item.status] ?? item.status}
                      </Badge>
                    )}
                    {item.phone && (
                      <span className="text-xs text-muted-foreground hidden md:block">+{item.phone}</span>
                    )}
                    <span className="text-xs text-muted-foreground whitespace-nowrap">
                      {formatDistanceToNow(new Date(item.createdAt), { addSuffix: true })}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function StatCard({
  title,
  subtitle,
  value,
  icon,
  isLoading,
  testId,
}: {
  title: string;
  subtitle: string;
  value: number | undefined;
  icon: React.ReactNode;
  isLoading: boolean;
  testId: string;
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="text-xs text-muted-foreground">{title}</p>
            {isLoading ? (
              <Skeleton className="h-6 w-14 mt-1" />
            ) : (
              <p className="text-2xl font-bold mt-0.5" data-testid={testId}>{value ?? 0}</p>
            )}
            <p className="text-[10px] text-muted-foreground mt-0.5">{subtitle}</p>
          </div>
          <div className="p-1.5 bg-muted rounded-md">{icon}</div>
        </div>
      </CardContent>
    </Card>
  );
}
