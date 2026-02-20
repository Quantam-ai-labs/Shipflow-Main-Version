import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

interface AccountingSettingsData {
  id: string;
  merchantId: string;
  advancedMode: boolean;
  defaultCurrency: string;
  financialYearStart?: number;
}

const months = [
  { value: "1", label: "January" },
  { value: "2", label: "February" },
  { value: "3", label: "March" },
  { value: "4", label: "April" },
  { value: "5", label: "May" },
  { value: "6", label: "June" },
  { value: "7", label: "July" },
  { value: "8", label: "August" },
  { value: "9", label: "September" },
  { value: "10", label: "October" },
  { value: "11", label: "November" },
  { value: "12", label: "December" },
];

function PageSkeleton() {
  return (
    <div className="space-y-6" data-testid="settings-skeleton">
      <Skeleton className="h-8 w-48" />
      <Card>
        <CardContent className="p-6 space-y-6">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-32" />
        </CardContent>
      </Card>
    </div>
  );
}

export default function AccountingSettings() {
  const { toast } = useToast();
  const [advancedMode, setAdvancedMode] = useState(false);
  const [financialYearStart, setFinancialYearStart] = useState("7");
  const [currency, setCurrency] = useState("PKR");

  const { data, isLoading } = useQuery<AccountingSettingsData>({
    queryKey: ["/api/accounting/settings"],
  });

  useEffect(() => {
    if (data) {
      setAdvancedMode(data.advancedMode || false);
      setFinancialYearStart(String(data.financialYearStart || 7));
      setCurrency(data.defaultCurrency || "PKR");
    }
  }, [data]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("PUT", "/api/accounting/settings", {
        advancedMode,
        financialYearStart: parseInt(financialYearStart),
        defaultCurrency: currency,
      });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Settings saved successfully" });
      queryClient.invalidateQueries({ queryKey: ["/api/accounting/settings"] });
    },
    onError: (e: Error) => {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    },
  });

  if (isLoading) return <PageSkeleton />;

  return (
    <div className="space-y-6" data-testid="accounting-settings">
      <div>
        <h1 className="text-3xl font-bold tracking-tight" data-testid="text-page-title">
          Accounting Preferences
        </h1>
        <p className="text-muted-foreground mt-2">Configure your accounting module</p>
      </div>

      <Card data-testid="card-settings">
        <CardHeader>
          <CardTitle className="text-lg">Settings</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <Label htmlFor="advanced-mode" className="text-base font-medium">Advanced Mode</Label>
              <p className="text-sm text-muted-foreground">
                Show advanced features like ledger, trial balance, and detailed reports
              </p>
            </div>
            <Switch
              id="advanced-mode"
              checked={advancedMode}
              onCheckedChange={setAdvancedMode}
              data-testid="switch-advanced-mode"
            />
          </div>

          <div className="space-y-2">
            <Label>Financial Year Start Month</Label>
            <Select value={financialYearStart} onValueChange={setFinancialYearStart}>
              <SelectTrigger className="w-full max-w-xs" data-testid="select-financial-year">
                <SelectValue placeholder="Select month" />
              </SelectTrigger>
              <SelectContent>
                {months.map((m) => (
                  <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Default Currency</Label>
            <p className="text-sm text-muted-foreground" data-testid="text-currency">
              {currency}
            </p>
          </div>

          <Button
            onClick={() => saveMutation.mutate()}
            disabled={saveMutation.isPending}
            data-testid="button-save-settings"
          >
            {saveMutation.isPending ? "Saving..." : "Save Settings"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
