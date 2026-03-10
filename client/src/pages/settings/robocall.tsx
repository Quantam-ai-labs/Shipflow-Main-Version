import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Phone, Key, CheckCircle2, Save, RefreshCw, Eye, EyeOff } from "lucide-react";

export default function SettingsRobocall() {
  const { toast } = useToast();
  const [email, setEmail] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [initialized, setInitialized] = useState(false);

  const { data, isLoading } = useQuery<{ email: string; apiKey: string; configured: boolean }>({
    queryKey: ["/api/robocall/settings"],
  });

  if (data && !initialized) {
    setEmail(data.email || "");
    setApiKey(data.apiKey || "");
    setInitialized(true);
  }

  const saveMutation = useMutation({
    mutationFn: async (body: { email: string; apiKey: string }) => {
      const res = await apiRequest("PUT", "/api/robocall/settings", body);
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/robocall/settings"] });
      toast({
        title: "RoboCall Configured",
        description: `Credentials verified and saved. Balance: PKR ${data.balance}`,
      });
    },
    onError: (err: any) => {
      toast({ title: "Failed", description: err.message, variant: "destructive" });
    },
  });

  const checkBalanceMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/robocall/balance", { apiKey, email });
      return res.json();
    },
    onSuccess: (data) => {
      const sms = data.sms;
      if (sms && sms.remaining_balance !== undefined) {
        toast({ title: "Balance", description: `PKR ${sms.remaining_balance}` });
      } else {
        toast({ title: "Error", description: sms?.response || "Could not fetch balance.", variant: "destructive" });
      }
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const handleSave = () => {
    if (!email.trim() || !apiKey.trim()) {
      toast({ title: "Missing fields", description: "Both email and API key are required.", variant: "destructive" });
      return;
    }
    saveMutation.mutate({ email: email.trim(), apiKey: apiKey.trim() });
  };

  return (
    <div className="max-w-3xl space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Phone className="w-5 h-5" />
            RoboCall / IVR Settings
            {data?.configured && (
              <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300 ml-2" data-testid="badge-robocall-configured">
                <CheckCircle2 className="w-3 h-3 mr-1" /> Configured
              </Badge>
            )}
          </CardTitle>
          <CardDescription>
            Configure your BrandedSMS Pakistan credentials for automated IVR/DTMF confirmation calls.
            Once configured, you can send bulk IVR calls directly from the Pipeline.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="rc-email">BrandedSMS Email</Label>
            <Input
              id="rc-email"
              type="email"
              placeholder="your-account@email.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              data-testid="input-robocall-email"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="rc-apikey">API Key</Label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Input
                  id="rc-apikey"
                  type={showKey ? "text" : "password"}
                  placeholder="Enter your BrandedSMS API key"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  data-testid="input-robocall-apikey"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7 p-0"
                  onClick={() => setShowKey(!showKey)}
                  data-testid="button-toggle-key-visibility"
                >
                  {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </Button>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3 pt-2">
            <Button
              onClick={handleSave}
              disabled={saveMutation.isPending || !email.trim() || !apiKey.trim()}
              data-testid="button-save-robocall"
            >
              <Save className="w-4 h-4 mr-2" />
              {saveMutation.isPending ? "Verifying & Saving..." : "Verify & Save"}
            </Button>
            {data?.configured && (
              <Button
                variant="outline"
                onClick={() => checkBalanceMutation.mutate()}
                disabled={checkBalanceMutation.isPending}
                data-testid="button-check-robocall-balance"
              >
                <RefreshCw className={`w-4 h-4 mr-2 ${checkBalanceMutation.isPending ? "animate-spin" : ""}`} />
                Check Balance
              </Button>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            Get your API key from <a href="https://app.brandedsmspakistan.com" target="_blank" rel="noopener noreferrer" className="underline text-primary">app.brandedsmspakistan.com</a>.
            Credentials are verified before saving.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
