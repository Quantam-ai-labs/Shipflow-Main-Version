import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Wifi, WifiOff, Eye, EyeOff, FlaskConical, Save } from "lucide-react";

interface ConnectionData {
  waPhoneNumberId: string;
  waAccessToken: string;
  waWabaId: string;
  connected: boolean;
}

export default function SupportConnectionPage() {
  const { toast } = useToast();
  const [showToken, setShowToken] = useState(false);
  const [form, setForm] = useState({ waPhoneNumberId: "", waAccessToken: "", waWabaId: "" });
  const [loaded, setLoaded] = useState(false);
  const [testing, setTesting] = useState(false);

  const { data, isLoading } = useQuery<ConnectionData>({
    queryKey: ["/api/support/connection"],
    refetchOnWindowFocus: false,
  });

  if (data && !loaded) {
    setForm({
      waPhoneNumberId: data.waPhoneNumberId || "",
      waAccessToken: data.waAccessToken || "",
      waWabaId: data.waWabaId || "",
    });
    setLoaded(true);
  }

  const saveMutation = useMutation({
    mutationFn: async (values: typeof form) =>
      apiRequest("PUT", "/api/support/connection", values),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/support/connection"] });
      queryClient.invalidateQueries({ queryKey: ["/api/support/dashboard-stats"] });
      toast({ title: "Saved", description: "WhatsApp credentials updated successfully." });
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const handleTest = async () => {
    const phoneId = form.waPhoneNumberId.trim();
    const token = form.waAccessToken.trim();
    if (!phoneId || !token || token === "••••••••") {
      toast({ title: "Missing credentials", description: "Enter Phone Number ID and Access Token to test.", variant: "destructive" });
      return;
    }
    setTesting(true);
    try {
      const resp = await fetch(`https://graph.facebook.com/v22.0/${phoneId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const body = await resp.json() as any;
      if (resp.ok && body.id) {
        toast({ title: "Connection successful", description: `Phone: ${body.display_phone_number || phoneId}` });
      } else {
        toast({ title: "Connection failed", description: body.error?.message || "Invalid credentials", variant: "destructive" });
      }
    } catch (e: any) {
      toast({ title: "Connection failed", description: e.message, variant: "destructive" });
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="p-6 space-y-6 max-w-2xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight" data-testid="text-page-title">WhatsApp Connection</h1>
          <p className="text-muted-foreground text-sm mt-1">Configure your Meta WhatsApp Business API credentials</p>
        </div>
        {isLoading ? (
          <Skeleton className="h-7 w-28" />
        ) : (
          <Badge
            variant={data?.connected ? "default" : "secondary"}
            className={data?.connected ? "bg-green-500 hover:bg-green-600 text-white gap-1.5" : "gap-1.5"}
            data-testid="status-connection"
          >
            {data?.connected ? <Wifi className="w-3 h-3" /> : <WifiOff className="w-3 h-3" />}
            {data?.connected ? "Connected" : "Not Connected"}
          </Badge>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">API Credentials</CardTitle>
          <CardDescription>
            Get these values from the <a href="https://developers.facebook.com/apps/" target="_blank" rel="noopener noreferrer" className="text-primary underline">Meta Developer Portal</a> under your WhatsApp Business app.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {isLoading ? (
            <div className="space-y-4">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : (
            <>
              <div className="space-y-2">
                <Label htmlFor="phoneNumberId">Phone Number ID</Label>
                <Input
                  id="phoneNumberId"
                  placeholder="e.g. 123456789012345"
                  value={form.waPhoneNumberId}
                  onChange={(e) => setForm(f => ({ ...f, waPhoneNumberId: e.target.value }))}
                  data-testid="input-phone-number-id"
                />
                <p className="text-xs text-muted-foreground">Found in WhatsApp → Getting Started → Phone Number ID</p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="accessToken">Access Token</Label>
                <div className="relative">
                  <Input
                    id="accessToken"
                    type={showToken ? "text" : "password"}
                    placeholder="Enter your permanent access token"
                    value={form.waAccessToken}
                    onChange={(e) => setForm(f => ({ ...f, waAccessToken: e.target.value }))}
                    className="pr-10"
                    data-testid="input-access-token"
                  />
                  <button
                    type="button"
                    onClick={() => setShowToken(v => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    data-testid="button-toggle-token"
                  >
                    {showToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                <p className="text-xs text-muted-foreground">Use a permanent (system user) token for production use</p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="wabaId">WhatsApp Business Account ID</Label>
                <Input
                  id="wabaId"
                  placeholder="e.g. 987654321098765"
                  value={form.waWabaId}
                  onChange={(e) => setForm(f => ({ ...f, waWabaId: e.target.value }))}
                  data-testid="input-waba-id"
                />
                <p className="text-xs text-muted-foreground">Found in the WhatsApp Business Manager → Account Info</p>
              </div>

              <div className="flex gap-3 pt-2">
                <Button
                  variant="outline"
                  onClick={handleTest}
                  disabled={testing}
                  data-testid="button-test-connection"
                >
                  <FlaskConical className="w-4 h-4 mr-2" />
                  {testing ? "Testing..." : "Test Connection"}
                </Button>
                <Button
                  onClick={() => saveMutation.mutate(form)}
                  disabled={saveMutation.isPending}
                  data-testid="button-save-credentials"
                >
                  <Save className="w-4 h-4 mr-2" />
                  {saveMutation.isPending ? "Saving..." : "Save Credentials"}
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Webhook Configuration</CardTitle>
          <CardDescription>
            Configure this URL in Meta Developer Portal → Webhooks to receive incoming messages.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Webhook URL</Label>
            <div className="flex items-center gap-2">
              <code className="flex-1 text-sm bg-muted px-3 py-2 rounded-md break-all font-mono" data-testid="text-webhook-url">
                {window.location.origin}/webhooks/whatsapp
              </code>
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Subscribe to Fields</Label>
            <div className="flex gap-2 flex-wrap">
              <Badge variant="secondary">messages</Badge>
              <Badge variant="secondary">message_deliveries</Badge>
              <Badge variant="secondary">message_reads</Badge>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
