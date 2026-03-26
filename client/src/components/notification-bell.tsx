import { Bell, CheckCheck, Check, Trash2 } from "lucide-react";
import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { formatDistanceToNow } from "date-fns";

interface Notification {
  id: string;
  merchantId: string;
  type: string;
  category: string;
  resolvable: boolean;
  title: string;
  message: string;
  orderId: string | null;
  orderNumber: string | null;
  read: boolean;
  resolvedAt: string | null;
  resolvedByUserId: string | null;
  resolvedByName: string | null;
  createdAt: string;
}

const NOTIFICATION_KEYS = ["/api/notifications", "/api/notifications/unread-count"];

function invalidateNotifications() {
  NOTIFICATION_KEYS.forEach(k => queryClient.invalidateQueries({ queryKey: [k] }));
}

function EmptyState({ label }: { label: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-10 px-4 text-center">
      <Bell className="h-8 w-8 text-muted-foreground/40 mb-2" />
      <p className="text-sm text-muted-foreground">No {label} notifications</p>
    </div>
  );
}

function NotificationItem({ n, onResolve, resolving }: {
  n: Notification;
  onResolve: (id: string) => void;
  resolving: boolean;
}) {
  const markReadMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", `/api/notifications/${n.id}/read`);
    },
    onSuccess: invalidateNotifications,
  });

  return (
    <div
      key={n.id}
      data-testid={`notification-item-${n.id}`}
      className={`px-4 py-3 border-b last:border-b-0 transition-colors ${
        !n.read ? "bg-muted/50 hover:bg-muted/70" : "hover:bg-muted/30"
      }`}
      onClick={() => {
        if (!n.read) markReadMutation.mutate();
      }}
    >
      <div className="flex items-start gap-2">
        {!n.read && (
          <span className="mt-1.5 h-2 w-2 rounded-full bg-primary shrink-0" />
        )}
        <div className={`flex-1 min-w-0 ${!n.read ? "" : "pl-4"}`}>
          <p className="text-sm font-medium leading-snug">{n.title}</p>
          <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">{n.message}</p>
          <p className="text-[11px] text-muted-foreground mt-1">
            {formatDistanceToNow(new Date(n.createdAt), { addSuffix: true })}
          </p>
        </div>
        {n.resolvable && !n.resolvedAt && (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 shrink-0 text-green-600 hover:text-green-700 hover:bg-green-50 dark:hover:bg-green-950"
                  data-testid={`notification-resolve-btn-${n.id}`}
                  disabled={resolving}
                  onClick={(e) => {
                    e.stopPropagation();
                    onResolve(n.id);
                  }}
                >
                  <Check className="h-3.5 w-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="left">Mark as resolved</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}
      </div>
    </div>
  );
}

function TabNotifications({ category, label, notifications, resolvingId, onResolve }: {
  category: string;
  label: string;
  notifications: Notification[];
  resolvingId: string | null;
  onResolve: (id: string) => void;
}) {
  const filtered = notifications.filter(n => n.category === category);
  if (filtered.length === 0) return <EmptyState label={label} />;
  return (
    <div className="max-h-72 overflow-y-auto">
      {filtered.map(n => (
        <NotificationItem
          key={n.id}
          n={n}
          onResolve={onResolve}
          resolving={resolvingId === n.id}
        />
      ))}
    </div>
  );
}

export function NotificationBell() {
  const [resolvingId, setResolvingId] = useState<string | null>(null);

  const { data: countData } = useQuery<{ count: number }>({
    queryKey: ["/api/notifications/unread-count"],
    refetchInterval: 30000,
  });

  const { data: listData, isLoading } = useQuery<{ notifications: Notification[] }>({
    queryKey: ["/api/notifications"],
  });

  const markAllReadMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", "/api/notifications/mark-all-read");
    },
    onSuccess: invalidateNotifications,
  });

  const clearAllMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("DELETE", "/api/notifications/clear-all");
    },
    onSuccess: invalidateNotifications,
  });

  const resolveMutation = useMutation({
    mutationFn: async (id: string) => {
      setResolvingId(id);
      await apiRequest("POST", `/api/notifications/${id}/resolve`);
    },
    onSuccess: () => {
      setResolvingId(null);
      invalidateNotifications();
    },
    onError: () => setResolvingId(null),
  });

  const unreadCount = countData?.count ?? 0;
  const notifications = listData?.notifications ?? [];

  const countByCategory = (cat: string) =>
    notifications.filter(n => n.category === cat && !n.read).length;

  function TabLabel({ label, cat }: { label: string; cat: string }) {
    const cnt = countByCategory(cat);
    return (
      <span className="flex items-center gap-1">
        {label}
        {cnt > 0 && (
          <span className="inline-flex items-center justify-center h-4 min-w-[16px] px-1 rounded-full bg-destructive text-destructive-foreground text-[9px] font-bold">
            {cnt}
          </span>
        )}
      </span>
    );
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative"
          data-testid="notification-bell-button"
        >
          <Bell className="h-4 w-4" />
          {unreadCount > 0 && (
            <span
              className="absolute -top-0.5 -right-0.5 flex items-center justify-center min-w-[18px] h-[18px] rounded-full bg-destructive text-destructive-foreground text-[10px] font-semibold px-1"
              data-testid="badge-notification-count"
            >
              {unreadCount > 99 ? "99+" : unreadCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>

      <PopoverContent align="end" className="w-96 p-0">
        <div className="flex items-center justify-between gap-2 px-4 py-3 border-b">
          <h4 className="text-sm font-semibold">Notifications</h4>
          <div className="flex items-center gap-1">
            {unreadCount > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => markAllReadMutation.mutate()}
                disabled={markAllReadMutation.isPending}
                data-testid="notification-mark-all-read-btn"
                className="text-xs h-7 px-2"
              >
                <CheckCheck className="h-3.5 w-3.5 mr-1" />
                Mark all read
              </Button>
            )}
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-muted-foreground hover:text-destructive"
                    onClick={() => clearAllMutation.mutate()}
                    disabled={clearAllMutation.isPending}
                    data-testid="notification-clear-all-btn"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Clear non-resolvable notifications</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        </div>

        {isLoading ? (
          <div className="p-6 text-center text-sm text-muted-foreground">Loading…</div>
        ) : (
          <Tabs defaultValue="confirmation">
            <TabsList className="w-full rounded-none border-b bg-transparent h-9 px-2">
              <TabsTrigger value="confirmation" className="flex-1 text-xs" data-testid="notification-tab-confirmation">
                <TabLabel label="Confirmation" cat="confirmation" />
              </TabsTrigger>
              <TabsTrigger value="chat" className="flex-1 text-xs" data-testid="notification-tab-chat">
                <TabLabel label="Chat" cat="chat" />
              </TabsTrigger>
              <TabsTrigger value="other" className="flex-1 text-xs" data-testid="notification-tab-other">
                <TabLabel label="Other" cat="other" />
              </TabsTrigger>
            </TabsList>

            <TabsContent value="confirmation" className="mt-0">
              <TabNotifications
                category="confirmation"
                label="confirmation"
                notifications={notifications}
                resolvingId={resolvingId}
                onResolve={(id) => resolveMutation.mutate(id)}
              />
            </TabsContent>

            <TabsContent value="chat" className="mt-0">
              <TabNotifications
                category="chat"
                label="chat"
                notifications={notifications}
                resolvingId={resolvingId}
                onResolve={(id) => resolveMutation.mutate(id)}
              />
            </TabsContent>

            <TabsContent value="other" className="mt-0">
              <TabNotifications
                category="other"
                label="other"
                notifications={notifications}
                resolvingId={resolvingId}
                onResolve={(id) => resolveMutation.mutate(id)}
              />
            </TabsContent>
          </Tabs>
        )}
      </PopoverContent>
    </Popover>
  );
}
