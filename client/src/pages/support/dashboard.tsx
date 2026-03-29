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
    <div className="p-6 space-y-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight" data-testid="text-page-title">WhatsApp Dashboard</h1>
          <p className="text-muted-foreground text-sm mt-1">Monitor automated notifications and conversations</p>
        </div>
        {isLoading ? (
          <Skeleton className="h-7 w-32" />
        ) : (
          <span
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${
              stats?.connected
                ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                : "bg-white/[0.06] text-white/40 border-white/10"
            }`}
            data-testid="status-connection"
          >
            {stats?.connected ? <Wifi className="w-3 h-3" /> : <WifiOff className="w-3 h-3" />}
            {stats?.connected ? "Connected" : "Not Connected"}
          </span>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Messages Sent"
          subtitle="Last 30 days"
          value={stats?.messagesSent}
          icon={<MessageCircle className="w-5 h-5 text-blue-400" />}
          iconBg="bg-blue-500/10"
          isLoading={isLoading}
          testId="stat-messages-sent"
        />
        <StatCard
          title="Delivered"
          subtitle="Successfully sent"
          value={stats?.delivered}
          icon={<CheckCircle2 className="w-5 h-5 text-emerald-400" />}
          iconBg="bg-emerald-500/10"
          isLoading={isLoading}
          testId="stat-delivered"
        />
        <StatCard
          title="Failed"
          subtitle="Send errors"
          value={stats?.failed}
          icon={<XCircle className="w-5 h-5 text-red-400" />}
          iconBg="bg-red-500/10"
          isLoading={isLoading}
          testId="stat-failed"
        />
        <StatCard
          title="Active Conversations"
          subtitle="All time contacts"
          value={stats?.activeConversations}
          icon={<Users className="w-5 h-5 text-violet-400" />}
          iconBg="bg-violet-500/10"
          isLoading={isLoading}
          testId="stat-conversations"
        />
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <Clock className="w-4 h-4 text-blue-400" />
            Recent Activity
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : !stats?.recentActivity?.length ? (
            <div className="text-center py-10 text-muted-foreground text-sm">
              No activity yet. WhatsApp notifications will appear here once sent.
            </div>
          ) : (
            <div className="divide-y divide-white/[0.06]">
              {stats.recentActivity.map((item) => (
                <div key={item.id} className="py-3 flex items-center justify-between gap-4 hover:bg-blue-500/[0.06] -mx-2 px-2 rounded-md transition-colors" data-testid={`row-activity-${item.id}`}>
                  <div className="flex items-center gap-3 min-w-0">
                    {item.success ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                    ) : (
                      <XCircle className="w-4 h-4 text-red-400 shrink-0" />
                    )}
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate" data-testid={`text-order-${item.id}`}>
                        #{item.orderNumber} — {item.customerName}
                      </p>
                      {item.error && (
                        <p className="text-xs text-red-400 truncate">{item.error}</p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-3 shrink-0 text-right">
                    {item.status && (
                      <span className="text-xs hidden sm:inline-flex px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/20">
                        {STATUS_LABELS[item.status] ?? item.status}
                      </span>
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
  iconBg,
  isLoading,
  testId,
}: {
  title: string;
  subtitle: string;
  value: number | undefined;
  icon: React.ReactNode;
  iconBg: string;
  isLoading: boolean;
  testId: string;
}) {
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-sm text-muted-foreground">{title}</p>
            {isLoading ? (
              <Skeleton className="h-8 w-16 mt-1" />
            ) : (
              <p className="text-3xl font-bold mt-1" data-testid={testId}>{value ?? 0}</p>
            )}
            <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>
          </div>
          <div className={`p-2 ${iconBg} rounded-md`}>{icon}</div>
        </div>
      </CardContent>
    </Card>
  );
}
