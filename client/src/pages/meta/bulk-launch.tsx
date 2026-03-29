import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Loader2, Plus, Trash2, Rocket, CheckCircle2, XCircle, Clock, Image as ImageIcon, Type, Grid3X3, FolderOpen, RotateCw } from "lucide-react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface Creative {
  id: string;
  imageUrl: string;
  label: string;
}

interface CopyVariant {
  id: string;
  primaryText: string;
  headline: string;
}

interface CombinationRow {
  creativeId: string;
  copyId: string;
  selected: boolean;
}

function uid() {
  return Math.random().toString(36).slice(2);
}

export default function MetaBulkLaunch() {
  const { toast } = useToast();

  const [campaignName, setCampaignName] = useState("");
  const [dailyBudget, setDailyBudget] = useState("500");
  const [linkUrl, setLinkUrl] = useState("");

  const [creatives, setCreatives] = useState<Creative[]>([
    { id: uid(), imageUrl: "", label: "Creative 1" },
  ]);
  const [copyVariants, setCopyVariants] = useState<CopyVariant[]>([
    { id: uid(), primaryText: "", headline: "" },
  ]);
  const [combinations, setCombinations] = useState<CombinationRow[]>([]);
  const [showMatrix, setShowMatrix] = useState(false);

  const [mediaPickerOpen, setMediaPickerOpen] = useState(false);
  const [mediaPickerTarget, setMediaPickerTarget] = useState<string | null>(null);

  const { data: oauthStatus } = useQuery<any>({
    queryKey: ["/api/meta/oauth/status"],
  });

  const { data: jobsData, isLoading: jobsLoading } = useQuery<any>({
    queryKey: ["/api/meta/launch-jobs"],
  });

  const { data: mediaData } = useQuery<{ media: { id: string; name: string; url: string; type: string; metaMediaHash?: string }[] }>({
    queryKey: ["/api/meta/media-library"],
  });

  const mediaImages = (mediaData?.media || []).filter(m => m.type === "image");

  const pageId = oauthStatus?.pageId || "";
  const pixelId = oauthStatus?.pixelId || "";

  const openMediaPicker = (creativeId: string) => {
    setMediaPickerTarget(creativeId);
    setMediaPickerOpen(true);
  };

  const selectMediaForCreative = (mediaUrl: string, mediaName: string) => {
    if (mediaPickerTarget) {
      setCreatives(prev => prev.map(c => c.id === mediaPickerTarget ? { ...c, imageUrl: mediaUrl, label: c.label || mediaName } : c));
    }
    setMediaPickerOpen(false);
    setMediaPickerTarget(null);
  };

  const addCreative = () => {
    setCreatives(prev => [...prev, { id: uid(), imageUrl: "", label: `Creative ${prev.length + 1}` }]);
  };

  const removeCreative = (id: string) => {
    if (creatives.length <= 1) return;
    setCreatives(prev => prev.filter(c => c.id !== id));
  };

  const updateCreative = (id: string, field: keyof Creative, value: string) => {
    setCreatives(prev => prev.map(c => c.id === id ? { ...c, [field]: value } : c));
  };

  const addCopyVariant = () => {
    setCopyVariants(prev => [...prev, { id: uid(), primaryText: "", headline: "" }]);
  };

  const removeCopyVariant = (id: string) => {
    if (copyVariants.length <= 1) return;
    setCopyVariants(prev => prev.filter(c => c.id !== id));
  };

  const updateCopyVariant = (id: string, field: keyof CopyVariant, value: string) => {
    setCopyVariants(prev => prev.map(c => c.id === id ? { ...c, [field]: value } : c));
  };

  const validCreatives = creatives.filter(c => c.imageUrl.trim());
  const validCopy = copyVariants.filter(c => c.primaryText.trim());

  const generateCombinations = () => {
    const combos: CombinationRow[] = [];
    for (const cr of validCreatives) {
      for (const cp of validCopy) {
        combos.push({ creativeId: cr.id, copyId: cp.id, selected: true });
      }
    }
    setCombinations(combos);
    setShowMatrix(true);
  };

  const toggleCombination = (creativeId: string, copyId: string) => {
    setCombinations(prev =>
      prev.map(c =>
        c.creativeId === creativeId && c.copyId === copyId
          ? { ...c, selected: !c.selected }
          : c
      )
    );
  };

  const selectAll = () => setCombinations(prev => prev.map(c => ({ ...c, selected: true })));
  const deselectAll = () => setCombinations(prev => prev.map(c => ({ ...c, selected: false })));

  const selectedCombos = combinations.filter(c => c.selected);

  const bulkLaunchMutation = useMutation({
    mutationFn: async () => {
      const ads = selectedCombos.map((combo, idx) => {
        const creative = creatives.find(c => c.id === combo.creativeId)!;
        const copy = copyVariants.find(c => c.id === combo.copyId)!;
        return {
          campaignName: `${campaignName} - ${creative.label} × ${copy.headline || `Copy ${idx + 1}`}`,
          objective: "OUTCOME_SALES",
          dailyBudget,
          targeting: {
            geo_locations: { countries: ["PK"] },
            age_min: 18,
            age_max: 65,
          },
          creative: {
            primaryText: copy.primaryText,
            headline: copy.headline || undefined,
            linkUrl,
            imageUrl: creative.imageUrl,
            callToAction: "SHOP_NOW",
          },
          pageId,
          pixelId: pixelId || undefined,
        };
      });

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

  const [retryingJobId, setRetryingJobId] = useState<string | null>(null);
  const retryMutation = useMutation({
    mutationFn: async (jobId: string) => {
      setRetryingJobId(jobId);
      const res = await apiRequest("POST", `/api/meta/bulk-launch/${jobId}/retry-failed`, {});
      return res.json();
    },
    onSuccess: (data) => {
      toast({ title: "Retry Complete", description: `${data.succeeded} of ${data.retried} failed items retried successfully.` });
      queryClient.invalidateQueries({ queryKey: ["/api/meta/launch-jobs"] });
      setRetryingJobId(null);
    },
    onError: (error: any) => {
      toast({ title: "Retry Failed", description: error.message, variant: "destructive" });
      setRetryingJobId(null);
    },
  });

  const recentJobs = (jobsData?.jobs || []).slice(0, 20);

  return (
    <div className="p-4 md:p-6 max-w-[1200px] mx-auto space-y-6" data-testid="meta-bulk-launch-page">
      <div>
        <h1 className="text-2xl font-bold" data-testid="text-page-title">Bulk Ad Launcher</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Create N creatives × M copy variations to generate a combination matrix of ads.
        </p>
      </div>

      <Card data-testid="card-campaign-settings">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Campaign Settings</CardTitle>
          <CardDescription>Shared settings across all generated ads</CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="campaign-name">Campaign Name Prefix</Label>
            <Input
              id="campaign-name"
              placeholder="e.g. Summer Sale"
              value={campaignName}
              onChange={e => setCampaignName(e.target.value)}
              data-testid="input-campaign-name"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="daily-budget">Daily Budget (PKR)</Label>
            <Input
              id="daily-budget"
              type="number"
              value={dailyBudget}
              onChange={e => setDailyBudget(e.target.value)}
              data-testid="input-daily-budget"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="link-url">Landing Page URL</Label>
            <Input
              id="link-url"
              placeholder="https://yourshop.com/product"
              value={linkUrl}
              onChange={e => setLinkUrl(e.target.value)}
              data-testid="input-link-url"
            />
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card data-testid="card-creatives">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ImageIcon className="w-4 h-4 text-muted-foreground" />
                <CardTitle className="text-base">Creatives ({creatives.length})</CardTitle>
              </div>
              <Button variant="outline" size="sm" onClick={addCreative} data-testid="button-add-creative">
                <Plus className="w-3.5 h-3.5 mr-1" /> Add
              </Button>
            </div>
            <CardDescription>Add images from your Media Library or paste URLs</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {creatives.map((cr, idx) => (
              <div key={cr.id} className="flex gap-2 items-start" data-testid={`creative-row-${cr.id}`}>
                <div className="flex-1 space-y-1.5">
                  <Input
                    placeholder={`Label (e.g. Product Shot ${idx + 1})`}
                    value={cr.label}
                    onChange={e => updateCreative(cr.id, "label", e.target.value)}
                    className="text-xs h-8"
                    data-testid={`input-creative-label-${cr.id}`}
                  />
                  <div className="flex gap-1.5">
                    <Input
                      placeholder="https://...image.jpg"
                      value={cr.imageUrl}
                      onChange={e => updateCreative(cr.id, "imageUrl", e.target.value)}
                      className="text-xs h-8 flex-1"
                      data-testid={`input-creative-url-${cr.id}`}
                    />
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 px-2 text-xs shrink-0"
                      onClick={() => openMediaPicker(cr.id)}
                      data-testid={`button-pick-media-${cr.id}`}
                    >
                      <FolderOpen className="w-3.5 h-3.5 mr-1" />
                      Library
                    </Button>
                  </div>
                </div>
                {cr.imageUrl && (
                  <div className="w-16 h-16 border rounded overflow-hidden flex-shrink-0">
                    <img src={cr.imageUrl} alt={cr.label} className="w-full h-full object-cover" />
                  </div>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => removeCreative(cr.id)}
                  disabled={creatives.length <= 1}
                  className="mt-1"
                  data-testid={`button-remove-creative-${cr.id}`}
                >
                  <Trash2 className="w-3.5 h-3.5 text-muted-foreground" />
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card data-testid="card-copy-variants">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Type className="w-4 h-4 text-muted-foreground" />
                <CardTitle className="text-base">Ad Copy Variants ({copyVariants.length})</CardTitle>
              </div>
              <Button variant="outline" size="sm" onClick={addCopyVariant} data-testid="button-add-copy">
                <Plus className="w-3.5 h-3.5 mr-1" /> Add
              </Button>
            </div>
            <CardDescription>Write different text variations for your ads</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {copyVariants.map((cp, idx) => (
              <div key={cp.id} className="flex gap-2 items-start" data-testid={`copy-row-${cp.id}`}>
                <div className="flex-1 space-y-1.5">
                  <Input
                    placeholder={`Headline ${idx + 1}`}
                    value={cp.headline}
                    onChange={e => updateCopyVariant(cp.id, "headline", e.target.value)}
                    className="text-xs h-8"
                    data-testid={`input-copy-headline-${cp.id}`}
                  />
                  <Textarea
                    placeholder="Primary text / ad body..."
                    value={cp.primaryText}
                    onChange={e => updateCopyVariant(cp.id, "primaryText", e.target.value)}
                    className="text-xs min-h-[60px]"
                    data-testid={`input-copy-text-${cp.id}`}
                  />
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => removeCopyVariant(cp.id)}
                  disabled={copyVariants.length <= 1}
                  className="mt-1"
                  data-testid={`button-remove-copy-${cp.id}`}
                >
                  <Trash2 className="w-3.5 h-3.5 text-muted-foreground" />
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <div className="flex justify-center">
        <Button
          size="lg"
          variant="outline"
          onClick={generateCombinations}
          disabled={validCreatives.length === 0 || validCopy.length === 0}
          className="gap-2"
          data-testid="button-generate-matrix"
        >
          <Grid3X3 className="w-4 h-4" />
          Generate {validCreatives.length} × {validCopy.length} = {validCreatives.length * validCopy.length} Combinations
        </Button>
      </div>

      {showMatrix && combinations.length > 0 && (
        <Card data-testid="card-combination-matrix">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base">Combination Matrix</CardTitle>
                <CardDescription>
                  {selectedCombos.length} of {combinations.length} combinations selected
                </CardDescription>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={selectAll} data-testid="button-select-all">
                  Select All
                </Button>
                <Button variant="outline" size="sm" onClick={deselectAll} data-testid="button-deselect-all">
                  Deselect All
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-white/[0.04] border-b border-white/[0.06]">
                    <TableHead className="w-10"></TableHead>
                    <TableHead className="text-white/40 text-xs uppercase tracking-wider">Creative</TableHead>
                    <TableHead className="text-white/40 text-xs uppercase tracking-wider">Headline</TableHead>
                    <TableHead className="text-white/40 text-xs uppercase tracking-wider">Primary Text</TableHead>
                    <TableHead className="text-white/40 text-xs uppercase tracking-wider">Preview</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {combinations.map((combo) => {
                    const creative = creatives.find(c => c.id === combo.creativeId);
                    const copy = copyVariants.find(c => c.id === combo.copyId);
                    if (!creative || !copy) return null;
                    const key = `${combo.creativeId}-${combo.copyId}`;
                    return (
                      <TableRow
                        key={key}
                        className={`border-b border-white/[0.04] hover:bg-blue-500/[0.06] ${!combo.selected ? "opacity-40" : ""}`}
                        data-testid={`row-combo-${key}`}
                      >
                        <TableCell>
                          <Checkbox
                            checked={combo.selected}
                            onCheckedChange={() => toggleCombination(combo.creativeId, combo.copyId)}
                            data-testid={`checkbox-combo-${key}`}
                          />
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            {creative.imageUrl && (
                              <img src={creative.imageUrl} alt="" className="w-8 h-8 rounded object-cover" />
                            )}
                            <span className="text-xs font-medium">{creative.label}</span>
                          </div>
                        </TableCell>
                        <TableCell className="text-xs">{copy.headline || "—"}</TableCell>
                        <TableCell className="text-xs max-w-[200px] truncate">{copy.primaryText}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-[10px]">
                            {creative.label} × {copy.headline || "Copy"}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>

            <Separator className="my-4" />

            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground">
                {selectedCombos.length} ad{selectedCombos.length !== 1 ? "s" : ""} will be created under campaign "{campaignName || "Untitled"}"
              </p>
              <Button
                onClick={() => bulkLaunchMutation.mutate()}
                disabled={
                  selectedCombos.length === 0 ||
                  bulkLaunchMutation.isPending ||
                  !pageId ||
                  !campaignName.trim() ||
                  !linkUrl.trim()
                }
                className="gap-2"
                data-testid="button-bulk-launch"
              >
                {bulkLaunchMutation.isPending ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Rocket className="w-4 h-4" />
                )}
                Launch {selectedCombos.length} Ads (Paused)
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

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
              No launch jobs yet. Create your first bulk launch above.
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
                  <TableHead>Actions</TableHead>
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
                            ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                            : job.status === "failed"
                            ? "bg-red-500/10 text-red-400 border border-red-500/20"
                            : job.status === "launching"
                            ? "bg-blue-500/10 text-blue-400 border border-blue-500/20"
                            : "bg-muted text-muted-foreground"
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
                    <TableCell>
                      {(job.status === "failed" || job.status === "partial") && (
                        <Button variant="outline" size="sm" className="h-7 text-xs gap-1"
                          onClick={() => retryMutation.mutate(job.id)}
                          disabled={retryingJobId === job.id}
                          data-testid={`button-retry-${job.id}`}
                        >
                          {retryingJobId === job.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <RotateCw className="w-3 h-3" />}
                          Retry Failed
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={mediaPickerOpen} onOpenChange={setMediaPickerOpen}>
        <DialogContent className="max-w-2xl max-h-[70vh] overflow-y-auto" data-testid="dialog-media-picker">
          <DialogHeader>
            <DialogTitle>Select from Media Library</DialogTitle>
          </DialogHeader>
          {mediaImages.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">
              <ImageIcon className="w-8 h-8 mx-auto mb-2 opacity-40" />
              <p>No images in your media library yet.</p>
              <p className="text-xs mt-1">Upload images in the Media Library page first.</p>
            </div>
          ) : (
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
              {mediaImages.map((media) => (
                <button
                  key={media.id}
                  className="group relative border rounded-lg overflow-hidden hover:ring-2 hover:ring-primary transition-all aspect-square"
                  onClick={() => selectMediaForCreative(media.url, media.name)}
                  data-testid={`media-pick-${media.id}`}
                >
                  <img src={media.url} alt={media.name} className="w-full h-full object-cover" />
                  <div className="absolute inset-x-0 bottom-0 bg-black/60 px-1.5 py-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <p className="text-[10px] text-white truncate">{media.name}</p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
