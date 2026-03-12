import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, Plus, Trash2, Rocket, CheckCircle2, XCircle, Clock } from "lucide-react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface BulkAdRow {
  id: string;
  campaignName: string;
  dailyBudget: string;
  primaryText: string;
  headline: string;
  linkUrl: string;
  imageUrl: string;
}

function createEmptyRow(): BulkAdRow {
  return {
    id: Math.random().toString(36).slice(2),
    campaignName: "",
    dailyBudget: "500",
    primaryText: "",
    headline: "",
    linkUrl: "",
    imageUrl: "",
  };
}

export default function MetaBulkLaunch() {
  const { toast } = useToast();
  const [rows, setRows] = useState<BulkAdRow[]>([createEmptyRow(), createEmptyRow()]);

  const { data: oauthStatus } = useQuery<any>({
    queryKey: ["/api/meta/oauth/status"],
  });

  const { data: jobsData, isLoading: jobsLoading } = useQuery<any>({
    queryKey: ["/api/meta/launch-jobs"],
  });

  const pageId = oauthStatus?.pageId || "";
  const pixelId = oauthStatus?.pixelId || "";

  const updateRow = (id: string, field: keyof BulkAdRow, value: string) => {
    setRows(prev => prev.map(r => r.id === id ? { ...r, [field]: value } : r));
  };

  const addRow = () => setRows(prev => [...prev, createEmptyRow()]);

  const removeRow = (id: string) => {
    if (rows.length <= 1) return;
    setRows(prev => prev.filter(r => r.id !== id));
  };

  const validRows = rows.filter(r =>
    r.campaignName.trim() && r.dailyBudget && r.primaryText.trim() && r.linkUrl.trim()
  );

  const bulkLaunchMutation = useMutation({
    mutationFn: async () => {
      const ads = validRows.map(r => ({
        campaignName: r.campaignName,
        objective: "OUTCOME_SALES",
        dailyBudget: r.dailyBudget,
        targeting: {
          geo_locations: { countries: ["PK"] },
          age_min: 18,
          age_max: 65,
        },
        creative: {
          primaryText: r.primaryText,
          headline: r.headline || undefined,
          linkUrl: r.linkUrl,
          imageUrl: r.imageUrl || undefined,
          callToAction: "SHOP_NOW",
        },
        pageId,
        pixelId: pixelId || undefined,
      }));

      const res = await apiRequest("POST", "/api/meta/bulk-launch", { ads });
      return res.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Bulk Launch Complete",
        description: `${data.succeeded} of ${data.total} ads launched successfully.`,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/meta/launch-jobs"] });
    },
    onError: (error: any) => {
      toast({ title: "Bulk Launch Failed", description: error.message, variant: "destructive" });
    },
  });

  const recentJobs = (jobsData?.jobs || []).slice(0, 20);

  return (
    <div className="p-4 md:p-6 max-w-[1200px] mx-auto space-y-6" data-testid="meta-bulk-launch-page">
      <div>
        <h1 className="text-2xl font-bold" data-testid="text-page-title">Bulk Ad Launcher</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Create multiple Facebook ads at once. All ads use Pakistan targeting with Sales objective.
        </p>
      </div>

      <Card data-testid="card-bulk-ads">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Ad Configurations</CardTitle>
            <Button variant="outline" size="sm" onClick={addRow} data-testid="button-add-row">
              <Plus className="w-3.5 h-3.5 mr-1" /> Add Row
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="min-w-[180px]">Campaign Name</TableHead>
                  <TableHead className="min-w-[100px]">Budget (PKR)</TableHead>
                  <TableHead className="min-w-[200px]">Primary Text</TableHead>
                  <TableHead className="min-w-[150px]">Headline</TableHead>
                  <TableHead className="min-w-[200px]">Link URL</TableHead>
                  <TableHead className="min-w-[200px]">Image URL</TableHead>
                  <TableHead className="w-[50px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell>
                      <Input
                        value={row.campaignName}
                        onChange={e => updateRow(row.id, "campaignName", e.target.value)}
                        placeholder="Campaign name"
                        className="text-xs h-8"
                        data-testid={`input-bulk-name-${row.id}`}
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        type="number"
                        value={row.dailyBudget}
                        onChange={e => updateRow(row.id, "dailyBudget", e.target.value)}
                        className="text-xs h-8 w-20"
                        data-testid={`input-bulk-budget-${row.id}`}
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        value={row.primaryText}
                        onChange={e => updateRow(row.id, "primaryText", e.target.value)}
                        placeholder="Ad copy"
                        className="text-xs h-8"
                        data-testid={`input-bulk-text-${row.id}`}
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        value={row.headline}
                        onChange={e => updateRow(row.id, "headline", e.target.value)}
                        placeholder="Headline"
                        className="text-xs h-8"
                        data-testid={`input-bulk-headline-${row.id}`}
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        value={row.linkUrl}
                        onChange={e => updateRow(row.id, "linkUrl", e.target.value)}
                        placeholder="https://..."
                        className="text-xs h-8"
                        data-testid={`input-bulk-url-${row.id}`}
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        value={row.imageUrl}
                        onChange={e => updateRow(row.id, "imageUrl", e.target.value)}
                        placeholder="https://...jpg"
                        className="text-xs h-8"
                        data-testid={`input-bulk-image-${row.id}`}
                      />
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => removeRow(row.id)}
                        disabled={rows.length <= 1}
                        data-testid={`button-remove-row-${row.id}`}
                      >
                        <Trash2 className="w-3.5 h-3.5 text-muted-foreground" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <div className="flex items-center justify-between mt-4 pt-4 border-t">
            <p className="text-xs text-muted-foreground">
              {validRows.length} of {rows.length} ads ready to launch
            </p>
            <Button
              onClick={() => bulkLaunchMutation.mutate()}
              disabled={validRows.length === 0 || bulkLaunchMutation.isPending || !pageId}
              className="gap-2"
              data-testid="button-bulk-launch"
            >
              {bulkLaunchMutation.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Rocket className="w-4 h-4" />
              )}
              Launch {validRows.length} Ads (Paused)
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card data-testid="card-launch-history">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Recent Launch Jobs</CardTitle>
          <CardDescription>Track the status of your ad launches</CardDescription>
        </CardHeader>
        <CardContent>
          {jobsLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="h-10 bg-muted rounded animate-pulse" />
              ))}
            </div>
          ) : recentJobs.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              No launch jobs yet. Create your first ad above.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Campaign</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Budget</TableHead>
                  <TableHead>Created</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recentJobs.map((job: any) => (
                  <TableRow key={job.id} data-testid={`row-job-${job.id}`}>
                    <TableCell className="font-medium text-sm">{job.campaignName}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-xs">{job.launchType}</Badge>
                    </TableCell>
                    <TableCell>
                      <Badge
                        className={`text-xs ${
                          job.status === "launched"
                            ? "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300"
                            : job.status === "failed"
                            ? "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300"
                            : job.status === "launching"
                            ? "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300"
                            : "bg-gray-100 text-gray-700"
                        }`}
                        data-testid={`badge-job-status-${job.id}`}
                      >
                        {job.status === "launched" && <CheckCircle2 className="w-3 h-3 mr-1" />}
                        {job.status === "failed" && <XCircle className="w-3 h-3 mr-1" />}
                        {job.status === "pending" && <Clock className="w-3 h-3 mr-1" />}
                        {job.status === "launching" && <Loader2 className="w-3 h-3 mr-1 animate-spin" />}
                        {job.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm">PKR {job.dailyBudget}/day</TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {new Date(job.createdAt).toLocaleString("en-PK", { timeZone: "Asia/Karachi" })}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
