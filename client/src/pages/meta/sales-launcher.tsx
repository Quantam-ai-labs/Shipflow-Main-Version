import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  CheckCircle2, XCircle, AlertTriangle, Loader2, Rocket, Activity, Image, Video,
  FileText, Search, ChevronDown, RefreshCw, ExternalLink, Info, Upload,
} from "lucide-react";

type CreativeMode = "UPLOAD_IMAGE" | "UPLOAD_VIDEO" | "EXISTING_POST";
type PublishMode = "VALIDATE" | "DRAFT" | "PUBLISH";

interface MetaPage { id: string; name: string; }
interface MetaPixel { id: string; name: string; }
interface MetaIgAccount { id: string; name?: string; username?: string; profile_picture_url?: string; pageName?: string; }
interface MetaPost { id: string; message?: string; fullPicture?: string; createdTime?: string; type?: string; likes?: number; comments?: number; shares?: number; source?: string; permalinkUrl?: string; }
interface LaunchJob { id: number; adName: string; mode: string; publishMode: string; status: string; createdAt: string; metaCampaignId?: string; metaAdsetId?: string; metaAdId?: string; errorMessage?: string; }

interface DiagnosticCheck {
  name: string;
  status: "pass" | "fail" | "warn" | "skip";
  message: string;
}

interface ValidationIssue {
  code: string;
  field: string;
  stage: string;
  message: string;
  fixSuggestion: string;
}

interface LaunchStage {
  stage: string;
  status: "pending" | "running" | "success" | "failed" | "skipped";
  message?: string;
  data?: Record<string, unknown>;
}

interface LaunchResult {
  success: boolean;
  jobId: string;
  stages: LaunchStage[];
  campaignId?: string;
  adsetId?: string;
  creativeId?: string;
  adId?: string;
  validationIssues?: ValidationIssue[];
  error?: string;
  errorStage?: string;
  rawError?: Record<string, unknown>;
}

const CTA_OPTIONS = [
  { value: "SHOP_NOW", label: "Shop Now" },
  { value: "LEARN_MORE", label: "Learn More" },
  { value: "SIGN_UP", label: "Sign Up" },
  { value: "BUY_NOW", label: "Buy Now" },
  { value: "ORDER_NOW", label: "Order Now" },
  { value: "GET_OFFER", label: "Get Offer" },
  { value: "CONTACT_US", label: "Contact Us" },
  { value: "BOOK_NOW", label: "Book Now" },
  { value: "SEND_MESSAGE", label: "Send Message" },
  { value: "WHATSAPP_MESSAGE", label: "WhatsApp Message" },
];

function StatusIcon({ status }: { status: string }) {
  switch (status) {
    case "pass":
    case "success":
      return <CheckCircle2 className="h-4 w-4 text-green-600" />;
    case "fail":
    case "failed":
      return <XCircle className="h-4 w-4 text-red-600" />;
    case "warn":
      return <AlertTriangle className="h-4 w-4 text-yellow-600" />;
    case "running":
      return <Loader2 className="h-4 w-4 text-blue-600 animate-spin" />;
    default:
      return <div className="h-4 w-4 rounded-full border-2 border-muted" />;
  }
}

const STAGE_LABELS: Record<string, string> = {
  normalize: "Normalizing Input",
  validate: "Validating Fields",
  diagnostics: "Running Diagnostics",
  media_validation: "Validating Media",
  media_upload: "Uploading Media",
  media_readiness: "Checking Video Readiness",
  campaign: "Creating Campaign",
  adset: "Creating Ad Set",
  creative: "Creating Creative",
  ad: "Creating Ad",
  publish: "Publishing Live",
  publish_campaign: "Publishing Campaign",
  publish_adset: "Publishing Ad Set",
  publish_ad: "Publishing Ad",
  complete: "Complete",
};

export default function SalesLauncher() {
  const { toast } = useToast();
  const [adName, setAdName] = useState("");
  const [mode, setMode] = useState<CreativeMode>("UPLOAD_IMAGE");
  const [destinationUrl, setDestinationUrl] = useState("");
  const [primaryText, setPrimaryText] = useState("");
  const [headline, setHeadline] = useState("");
  const [description, setDescription] = useState("");
  const [cta, setCta] = useState("SHOP_NOW");
  const [dailyBudget, setDailyBudget] = useState("500");
  const [publishMode, setPublishMode] = useState<PublishMode>("VALIDATE");
  const [startMode, setStartMode] = useState<"NOW" | "SCHEDULED">("NOW");
  const [startTime, setStartTime] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [imageHash, setImageHash] = useState("");
  const [imagePreview, setImagePreview] = useState("");
  const [videoUrl, setVideoUrl] = useState("");
  const [videoId, setVideoId] = useState("");
  const [videoStatus, setVideoStatus] = useState<string>("");
  const [selectedPostId, setSelectedPostId] = useState("");
  const [selectedPostSource, setSelectedPostSource] = useState<"facebook" | "instagram">("facebook");
  const [selectedPostPreview, setSelectedPostPreview] = useState<any>(null);
  const [postSearch, setPostSearch] = useState("");
  const [diagnosticsResult, setDiagnosticsResult] = useState<{ passed: boolean; checks: DiagnosticCheck[]; adAccountCurrency?: string } | null>(null);
  const [accountCurrency, setAccountCurrency] = useState("USD");
  const [launchResult, setLaunchResult] = useState<LaunchResult | null>(null);
  const [showRawError, setShowRawError] = useState(false);

  const metaStatusQuery = useQuery<any>({ queryKey: ["/api/meta/oauth/status"] });
  const metaStatus = metaStatusQuery.data;
  const isConnected = metaStatus?.connected === true;

  const pagesQuery = useQuery<any>({
    queryKey: ["/api/meta/pages"],
    enabled: isConnected,
  });
  const pages = pagesQuery.data?.pages || [];
  const [selectedPageId, setSelectedPageId] = useState("");

  const pixelsQuery = useQuery<any>({
    queryKey: ["/api/meta/pixels"],
    enabled: isConnected,
  });
  const pixels = pixelsQuery.data?.pixels || [];
  const [selectedPixelId, setSelectedPixelId] = useState("");

  const igAccountsQuery = useQuery<any>({
    queryKey: ["/api/meta/instagram-accounts"],
    enabled: isConnected,
  });
  const igAccounts: MetaIgAccount[] = igAccountsQuery.data?.instagramAccounts || [];
  const [selectedIgAccountId, setSelectedIgAccountId] = useState("");

  useEffect(() => {
    if (igAccounts.length > 0 && !selectedIgAccountId) {
      setSelectedIgAccountId(igAccounts[0].id);
    }
  }, [igAccounts, selectedIgAccountId]);

  const postSearchParam = postSearch ? `?search=${encodeURIComponent(postSearch)}` : "";
  const fbPostsQuery = useQuery<any>({
    queryKey: [`/api/meta/page-posts${postSearchParam}`],
    enabled: isConnected && mode === "EXISTING_POST",
  });
  const igQueryParams = new URLSearchParams();
  if (postSearch) igQueryParams.set("search", postSearch);
  if (selectedIgAccountId && selectedIgAccountId !== "none") igQueryParams.set("igAccountId", selectedIgAccountId);
  const igQueryString = igQueryParams.toString() ? `?${igQueryParams.toString()}` : "";
  const igPostsQuery = useQuery<any>({
    queryKey: [`/api/meta/ig-media${igQueryString}`],
    enabled: isConnected && mode === "EXISTING_POST" && !!selectedIgAccountId && selectedIgAccountId !== "none",
  });
  const fbPosts: MetaPost[] = fbPostsQuery.data?.posts || [];
  const igPosts: MetaPost[] = igPostsQuery.data?.posts || [];
  const posts: MetaPost[] = [...fbPosts, ...igPosts].sort((a, b) => {
    const ta = a.createdTime ? new Date(a.createdTime).getTime() : 0;
    const tb = b.createdTime ? new Date(b.createdTime).getTime() : 0;
    return tb - ta;
  });
  const postsLoading = fbPostsQuery.isLoading || igPostsQuery.isLoading;

  const diagnosticsMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/meta/sales/diagnostics", {
        pageId: selectedPageId,
        pixelId: selectedPixelId && selectedPixelId !== "none" ? selectedPixelId : null,
      });
      return res.json();
    },
    onSuccess: (data) => {
      setDiagnosticsResult(data);
      if (data.adAccountCurrency) {
        setAccountCurrency(data.adAccountCurrency);
      }
      toast({
        title: data.passed ? "Diagnostics passed" : "Diagnostics found issues",
        variant: data.passed ? "default" : "destructive",
      });
    },
    onError: (err: Error) => {
      toast({ title: "Diagnostics failed", description: err.message, variant: "destructive" });
    },
  });

  const uploadImageMutation = useMutation({
    mutationFn: async (payload: { type: "url"; url: string } | { type: "file"; base64: string; filename: string }) => {
      if (payload.type === "url") {
        const res = await apiRequest("POST", "/api/meta/sales/upload-image", { imageUrl: payload.url });
        return res.json();
      } else {
        const res = await apiRequest("POST", "/api/meta/sales/upload-image", { imageBase64: payload.base64, filename: payload.filename });
        return res.json();
      }
    },
    onSuccess: (data) => {
      setImageHash(data.imageHash);
      if (!imagePreview && data.imageUrl) setImagePreview(data.imageUrl);
      toast({ title: "Image uploaded to Meta" });
    },
    onError: (err: Error) => {
      toast({ title: "Image upload failed", description: err.message, variant: "destructive" });
    },
  });

  const uploadVideoMutation = useMutation({
    mutationFn: async (payload: { type: "url"; url: string } | { type: "file"; base64: string; filename: string }) => {
      if (payload.type === "url") {
        const res = await apiRequest("POST", "/api/meta/sales/upload-video", { videoUrl: payload.url });
        return res.json();
      } else {
        const res = await apiRequest("POST", "/api/meta/sales/upload-video", { videoBase64: payload.base64, filename: payload.filename });
        return res.json();
      }
    },
    onSuccess: (data) => {
      setVideoId(data.videoId);
      setVideoStatus("processing");
      toast({ title: "Video uploaded, processing..." });
      pollVideoStatus(data.videoId);
    },
    onError: (err: Error) => {
      toast({ title: "Video upload failed", description: err.message, variant: "destructive" });
    },
  });

  async function pollVideoStatus(vid: string) {
    for (let i = 0; i < 30; i++) {
      await new Promise(r => setTimeout(r, 5000));
      try {
        const res = await fetch(`/api/meta/sales/video-status/${vid}`, { credentials: "include" });
        const data = await res.json();
        if (data.ready) {
          setVideoStatus("ready");
          toast({ title: "Video is ready for launch" });
          return;
        }
        setVideoStatus(data.status || "processing");
      } catch {
        break;
      }
    }
    setVideoStatus("timeout");
    toast({ title: "Video processing timed out", variant: "destructive" });
  }

  const launchMutation = useMutation({
    mutationFn: async () => {
      const body: Record<string, unknown> = {
        adName,
        mode,
        adAccountId: metaStatus?.adAccountId || "",
        pageId: selectedPageId,
        instagramAccountId: selectedIgAccountId && selectedIgAccountId !== "none" ? selectedIgAccountId : null,
        pixelId: selectedPixelId && selectedPixelId !== "none" ? selectedPixelId : null,
        dailyBudget: parseFloat(dailyBudget) || 500,
        currency: accountCurrency,
        startMode,
        startTime: startMode === "SCHEDULED" ? startTime : null,
        publishMode,
      };

      if (mode === "UPLOAD_IMAGE") {
        body.imageHash = imageHash;
        body.imageUrl = imageUrl;
        body.destinationUrl = destinationUrl;
        body.primaryText = primaryText;
        body.headline = headline;
        body.description = description;
        body.cta = cta;
      } else if (mode === "UPLOAD_VIDEO") {
        body.videoId = videoId;
        body.videoUrl = videoUrl;
        body.destinationUrl = destinationUrl;
        body.primaryText = primaryText;
        body.headline = headline;
        body.description = description;
        body.cta = cta;
      } else {
        body.existingPostId = selectedPostId;
        body.existingPostSource = selectedPostSource;
      }

      const res = await apiRequest("POST", "/api/meta/sales/launch", body);
      return res.json();
    },
    onSuccess: (data: LaunchResult) => {
      setLaunchResult(data);
      queryClient.invalidateQueries({ queryKey: ["/api/meta/sales/launch-jobs"] });
      if (data.success) {
        toast({ title: publishMode === "VALIDATE" ? "Validation passed!" : "Ad launched successfully!" });
      } else {
        toast({
          title: `Failed at: ${STAGE_LABELS[data.errorStage || ""] || data.errorStage}`,
          description: data.error,
          variant: "destructive",
        });
      }
    },
    onError: (err: Error) => {
      toast({ title: "Launch error", description: err.message, variant: "destructive" });
    },
  });

  const isExistingPost = mode === "EXISTING_POST";

  const diagnosticsPassed = diagnosticsResult?.passed === true;

  const validationChecklist = [
    { label: "Meta connected", ok: isConnected },
    { label: "Ad account selected", ok: !!metaStatus?.adAccountId },
    { label: "Page selected", ok: !!selectedPageId },
    { label: "Diagnostics passed", ok: diagnosticsPassed },
    { label: "Campaign name", ok: !!adName.trim() },
    { label: "Daily budget valid", ok: parseFloat(dailyBudget) >= 1 },
    ...(isExistingPost
      ? [{ label: "Post selected", ok: !!selectedPostId }]
      : [
          { label: "Destination URL", ok: !!destinationUrl.trim() },
          { label: "Primary text", ok: !!primaryText.trim() },
          ...(mode === "UPLOAD_IMAGE" ? [{ label: "Image uploaded", ok: !!imageHash }] : []),
          ...(mode === "UPLOAD_VIDEO" ? [{ label: "Video ready", ok: videoStatus === "ready" }] : []),
        ]),
  ];
  const allValid = validationChecklist.every(c => c.ok);

  if (!isConnected) {
    return (
      <div className="p-4 md:p-6 max-w-[900px] mx-auto space-y-6" data-testid="sales-launcher-page">
        <h1 className="text-2xl font-bold" data-testid="text-page-title">Sales Launcher</h1>
        <Card>
          <CardContent className="p-6 text-center space-y-4">
            <AlertTriangle className="h-12 w-12 text-yellow-500 mx-auto" />
            <p className="text-lg font-medium">Meta Not Connected</p>
            <p className="text-muted-foreground">Connect your Meta account in Settings &gt; Marketing to use the Sales Launcher.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 max-w-[900px] mx-auto space-y-6" data-testid="sales-launcher-page">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-page-title">Sales Launcher</h1>
          <p className="text-sm text-muted-foreground">Launch SALES campaigns with broad Pakistan targeting</p>
        </div>
        <Badge variant="outline" className="gap-1">
          <Activity className="h-3 w-3" />
          {metaStatus?.businessName || "Connected"}
        </Badge>
      </div>

      {/* SECTION A: Diagnostics */}
      <Card data-testid="section-diagnostics">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Connection & Diagnostics</CardTitle>
          <CardDescription>Verify your Meta account is ready to launch ads</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3 text-sm">
            <div>
              <span className="text-muted-foreground">Ad Account</span>
              <p className="font-medium truncate">{metaStatus?.adAccountId || "—"}</p>
            </div>
            <div>
              <span className="text-muted-foreground">Page</span>
              <Select value={selectedPageId} onValueChange={setSelectedPageId}>
                <SelectTrigger className="h-8 text-xs mt-0.5" data-testid="select-page">
                  <SelectValue placeholder="Select page" />
                </SelectTrigger>
                <SelectContent>
                  {pages.map((p: MetaPage) => (
                    <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <span className="text-muted-foreground">Instagram</span>
              <Select value={selectedIgAccountId} onValueChange={setSelectedIgAccountId}>
                <SelectTrigger className="h-8 text-xs mt-0.5" data-testid="select-ig-account">
                  <SelectValue placeholder="None (optional)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No Instagram</SelectItem>
                  {igAccounts.map((ig: MetaIgAccount) => (
                    <SelectItem key={ig.id} value={ig.id}>
                      {ig.username ? `@${ig.username}` : ig.name || ig.id}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <span className="text-muted-foreground">Pixel</span>
              <Select value={selectedPixelId} onValueChange={setSelectedPixelId}>
                <SelectTrigger className="h-8 text-xs mt-0.5" data-testid="select-pixel">
                  <SelectValue placeholder="None (optional)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No pixel</SelectItem>
                  {pixels.map((p: MetaPixel) => (
                    <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-end">
              <Button
                size="sm"
                variant="outline"
                onClick={() => diagnosticsMutation.mutate()}
                disabled={diagnosticsMutation.isPending}
                data-testid="button-run-diagnostics"
              >
                {diagnosticsMutation.isPending ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <RefreshCw className="h-3 w-3 mr-1" />}
                Run Diagnostics
              </Button>
            </div>
          </div>

          {diagnosticsResult && (
            <div className="border rounded-md p-3 space-y-2" data-testid="diagnostics-results">
              {diagnosticsResult.checks.map((check, i) => (
                <div key={i} className="flex items-center gap-2 text-sm">
                  <StatusIcon status={check.status} />
                  <span className="font-medium w-28">{check.name}</span>
                  <span className="text-muted-foreground">{check.message}</span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* SECTION B: Launch Form */}
      <Card data-testid="section-form">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Sales Ad Configuration</CardTitle>
          <CardDescription>Only SALES objective • Pakistan broad targeting • Automatic placements</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div>
            <Label htmlFor="adName">Campaign / Ad Name</Label>
            <Input
              id="adName"
              value={adName}
              onChange={e => setAdName(e.target.value)}
              placeholder="e.g. Summer Sale Campaign"
              data-testid="input-ad-name"
            />
          </div>

          {/* Creative Mode Tabs */}
          <div>
            <Label>Creative Source</Label>
            <Tabs value={mode} onValueChange={v => setMode(v as CreativeMode)} className="mt-1">
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="UPLOAD_IMAGE" data-testid="tab-upload-image" className="gap-1 text-xs">
                  <Image className="h-3 w-3" /> Upload Image
                </TabsTrigger>
                <TabsTrigger value="UPLOAD_VIDEO" data-testid="tab-upload-video" className="gap-1 text-xs">
                  <Video className="h-3 w-3" /> Upload Video
                </TabsTrigger>
                <TabsTrigger value="EXISTING_POST" data-testid="tab-existing-post" className="gap-1 text-xs">
                  <FileText className="h-3 w-3" /> Existing Post
                </TabsTrigger>
              </TabsList>

              <TabsContent value="UPLOAD_IMAGE" className="space-y-3 mt-3">
                <div>
                  <Label>Upload Image</Label>
                  <div className="flex flex-col gap-2">
                    <div
                      className="border-2 border-dashed rounded-md p-4 text-center cursor-pointer hover:bg-muted/50 transition-colors"
                      onClick={() => document.getElementById("imageFileInput")?.click()}
                      data-testid="dropzone-image"
                    >
                      <Upload className="h-6 w-6 mx-auto text-muted-foreground mb-1" />
                      <p className="text-sm text-muted-foreground">Click to select an image file</p>
                      <p className="text-xs text-muted-foreground mt-1">JPG, PNG, or WebP (max 30MB)</p>
                    </div>
                    <input
                      id="imageFileInput"
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      className="hidden"
                      data-testid="input-image-file"
                      onChange={async (e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        if (file.size > 30 * 1024 * 1024) {
                          toast({ title: "File too large", description: "Image must be under 30MB.", variant: "destructive" });
                          return;
                        }
                        const preview = URL.createObjectURL(file);
                        setImagePreview(preview);
                        const reader = new FileReader();
                        reader.onload = () => {
                          const base64 = (reader.result as string).split(",")[1];
                          uploadImageMutation.mutate({ type: "file", base64, filename: file.name });
                        };
                        reader.readAsDataURL(file);
                      }}
                    />
                    <Collapsible>
                      <CollapsibleTrigger asChild>
                        <Button variant="ghost" size="sm" className="text-xs gap-1 h-7" data-testid="toggle-image-url">
                          <ExternalLink className="h-3 w-3" /> Or use image URL
                        </Button>
                      </CollapsibleTrigger>
                      <CollapsibleContent className="mt-1">
                        <div className="flex gap-2">
                          <Input
                            id="imageUrl"
                            value={imageUrl}
                            onChange={e => setImageUrl(e.target.value)}
                            placeholder="https://example.com/image.jpg"
                            data-testid="input-image-url"
                          />
                          <Button
                            size="sm"
                            onClick={() => uploadImageMutation.mutate({ type: "url", url: imageUrl })}
                            disabled={!imageUrl || uploadImageMutation.isPending}
                            data-testid="button-upload-image-url"
                          >
                            {uploadImageMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : "Upload"}
                          </Button>
                        </div>
                      </CollapsibleContent>
                    </Collapsible>
                  </div>
                  {uploadImageMutation.isPending && (
                    <div className="mt-2 flex items-center gap-2 text-sm text-blue-600">
                      <Loader2 className="h-3 w-3 animate-spin" /> Uploading image to Meta...
                    </div>
                  )}
                  {imageHash && (
                    <div className="mt-2 flex items-center gap-2 text-sm text-green-600">
                      <CheckCircle2 className="h-3 w-3" />
                      Image uploaded (hash: {imageHash.substring(0, 12)}...)
                      <Button variant="ghost" size="sm" className="h-6 text-xs ml-auto" onClick={() => { setImageHash(""); setImagePreview(""); setImageUrl(""); }} data-testid="button-remove-image">Remove</Button>
                    </div>
                  )}
                  {imagePreview && (
                    <img src={imagePreview} alt="Preview" className="mt-2 rounded-md max-h-48 object-contain" data-testid="img-preview" />
                  )}
                </div>
              </TabsContent>

              <TabsContent value="UPLOAD_VIDEO" className="space-y-3 mt-3">
                <div>
                  <Label>Upload Video</Label>
                  <div className="flex flex-col gap-2">
                    <div
                      className="border-2 border-dashed rounded-md p-4 text-center cursor-pointer hover:bg-muted/50 transition-colors"
                      onClick={() => document.getElementById("videoFileInput")?.click()}
                      data-testid="dropzone-video"
                    >
                      <Upload className="h-6 w-6 mx-auto text-muted-foreground mb-1" />
                      <p className="text-sm text-muted-foreground">Click to select a video file</p>
                      <p className="text-xs text-muted-foreground mt-1">MP4, MOV, or AVI (max 100MB)</p>
                    </div>
                    <input
                      id="videoFileInput"
                      type="file"
                      accept="video/mp4,video/quicktime,video/x-msvideo"
                      className="hidden"
                      data-testid="input-video-file"
                      onChange={async (e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        if (file.size > 100 * 1024 * 1024) {
                          toast({ title: "File too large", description: "Video must be under 100MB for file upload. Use the URL option for larger files.", variant: "destructive" });
                          return;
                        }
                        const reader = new FileReader();
                        reader.onload = () => {
                          const base64 = (reader.result as string).split(",")[1];
                          uploadVideoMutation.mutate({ type: "file", base64, filename: file.name });
                        };
                        reader.readAsDataURL(file);
                      }}
                    />
                    <Collapsible>
                      <CollapsibleTrigger asChild>
                        <Button variant="ghost" size="sm" className="text-xs gap-1 h-7" data-testid="toggle-video-url">
                          <ExternalLink className="h-3 w-3" /> Or use video URL
                        </Button>
                      </CollapsibleTrigger>
                      <CollapsibleContent className="mt-1">
                        <div className="flex gap-2">
                          <Input
                            id="videoUrl"
                            value={videoUrl}
                            onChange={e => setVideoUrl(e.target.value)}
                            placeholder="https://example.com/video.mp4"
                            data-testid="input-video-url"
                          />
                          <Button
                            size="sm"
                            onClick={() => uploadVideoMutation.mutate({ type: "url", url: videoUrl })}
                            disabled={!videoUrl || uploadVideoMutation.isPending}
                            data-testid="button-upload-video-url"
                          >
                            {uploadVideoMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : "Upload"}
                          </Button>
                        </div>
                      </CollapsibleContent>
                    </Collapsible>
                  </div>
                  {uploadVideoMutation.isPending && (
                    <div className="mt-2 flex items-center gap-2 text-sm text-blue-600">
                      <Loader2 className="h-3 w-3 animate-spin" /> Uploading video to Meta...
                    </div>
                  )}
                  {videoId && (
                    <div className="mt-2 flex items-center gap-2 text-sm">
                      <StatusIcon status={videoStatus === "ready" ? "pass" : videoStatus === "timeout" ? "fail" : "running"} />
                      Video ID: {videoId} — Status: {videoStatus || "pending"}
                      <Button variant="ghost" size="sm" className="h-6 text-xs ml-auto" onClick={() => { setVideoId(""); setVideoStatus(""); setVideoUrl(""); }} data-testid="button-remove-video">Remove</Button>
                    </div>
                  )}
                </div>
              </TabsContent>

              <TabsContent value="EXISTING_POST" className="space-y-3 mt-3">
                <div className="flex items-start gap-2 p-3 bg-muted/50 border rounded-md text-sm">
                  <Info className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                  <span className="text-muted-foreground">
                    Existing post ads run <strong>as-is</strong>. Copy, URL, and CTA cannot be edited for this mode.
                    The post content will be used exactly as it appears on your page.
                  </span>
                </div>
                <div>
                  <Label>Search Posts</Label>
                  <div className="flex gap-2">
                    <Input
                      value={postSearch}
                      onChange={e => setPostSearch(e.target.value)}
                      placeholder="Search by text..."
                      data-testid="input-post-search"
                    />
                    <Button size="sm" variant="outline" disabled={postsLoading}>
                      <Search className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
                {postsLoading && (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="h-3 w-3 animate-spin" /> Loading posts...
                  </div>
                )}
                <div className="max-h-64 overflow-y-auto space-y-2" data-testid="post-list">
                  {posts.map((post: MetaPost) => (
                    <div
                      key={post.id}
                      className={`flex gap-3 p-2 border rounded-md cursor-pointer hover:bg-muted/50 transition-colors ${selectedPostId === post.id ? "ring-2 ring-primary bg-muted/30" : ""}`}
                      onClick={() => {
                        setSelectedPostId(post.id);
                        setSelectedPostSource(post.source === "instagram" ? "instagram" : "facebook");
                        setSelectedPostPreview(post);
                      }}
                      data-testid={`post-item-${post.id}`}
                    >
                      {post.fullPicture && (
                        <img src={post.fullPicture} alt="" className="w-16 h-16 rounded object-cover shrink-0" />
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${post.source === "instagram" ? "border-pink-400 text-pink-600" : "border-blue-400 text-blue-600"}`}>
                            {post.source === "instagram" ? "IG" : "FB"}
                          </Badge>
                          <p className="text-sm truncate">{post.message || "(No text)"}</p>
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {post.createdTime ? new Date(post.createdTime).toLocaleDateString("en-PK") : ""} · {post.type || "post"}
                          {(post.likes || 0) > 0 && ` · ${post.likes} likes`}
                        </p>
                      </div>
                      {selectedPostId === post.id && <CheckCircle2 className="h-4 w-4 text-primary shrink-0 self-center" />}
                    </div>
                  ))}
                </div>
              </TabsContent>
            </Tabs>
          </div>

          {/* Ad Copy Fields — disabled for existing post */}
          <div className="space-y-3">
            <div>
              <Label htmlFor="destinationUrl">
                Destination URL
                {isExistingPost && <span className="text-xs text-muted-foreground ml-2">(not applicable for existing posts)</span>}
              </Label>
              <Input
                id="destinationUrl"
                value={isExistingPost ? "" : destinationUrl}
                onChange={e => setDestinationUrl(e.target.value)}
                placeholder="https://yourstore.com/product"
                disabled={isExistingPost}
                data-testid="input-destination-url"
              />
            </div>
            <div>
              <Label htmlFor="primaryText">
                Primary Text
                {isExistingPost && <span className="text-xs text-muted-foreground ml-2">(not applicable)</span>}
              </Label>
              <Textarea
                id="primaryText"
                value={isExistingPost ? "" : primaryText}
                onChange={e => setPrimaryText(e.target.value)}
                placeholder="Your main ad copy..."
                disabled={isExistingPost}
                rows={3}
                data-testid="input-primary-text"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="headline">
                  Headline {isExistingPost && <span className="text-xs text-muted-foreground">(n/a)</span>}
                </Label>
                <Input
                  id="headline"
                  value={isExistingPost ? "" : headline}
                  onChange={e => setHeadline(e.target.value)}
                  placeholder="Short headline"
                  disabled={isExistingPost}
                  data-testid="input-headline"
                />
              </div>
              <div>
                <Label htmlFor="description">
                  Description {isExistingPost && <span className="text-xs text-muted-foreground">(n/a)</span>}
                </Label>
                <Input
                  id="description"
                  value={isExistingPost ? "" : description}
                  onChange={e => setDescription(e.target.value)}
                  placeholder="Optional description"
                  disabled={isExistingPost}
                  data-testid="input-description"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>
                  Call to Action {isExistingPost && <span className="text-xs text-muted-foreground">(n/a)</span>}
                </Label>
                <Select value={isExistingPost ? "" : cta} onValueChange={setCta} disabled={isExistingPost}>
                  <SelectTrigger data-testid="select-cta">
                    <SelectValue placeholder="Select CTA" />
                  </SelectTrigger>
                  <SelectContent>
                    {CTA_OPTIONS.map(opt => (
                      <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="dailyBudget">Daily Budget ({accountCurrency})</Label>
                <Input
                  id="dailyBudget"
                  type="number"
                  value={dailyBudget}
                  onChange={e => setDailyBudget(e.target.value)}
                  min="1"
                  data-testid="input-daily-budget"
                />
              </div>
            </div>
          </div>

          {/* Publish Mode */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Publish Mode</Label>
              <Select value={publishMode} onValueChange={v => setPublishMode(v as PublishMode)}>
                <SelectTrigger data-testid="select-publish-mode">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="VALIDATE">Validate Only</SelectItem>
                  <SelectItem value="DRAFT">Create as Draft (Paused)</SelectItem>
                  <SelectItem value="PUBLISH">Publish Live</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Start</Label>
              <Select value={startMode} onValueChange={v => setStartMode(v as "NOW" | "SCHEDULED")}>
                <SelectTrigger data-testid="select-start-mode">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="NOW">Start Now</SelectItem>
                  <SelectItem value="SCHEDULED">Schedule Start</SelectItem>
                </SelectContent>
              </Select>
              {startMode === "SCHEDULED" && (
                <Input
                  type="datetime-local"
                  value={startTime}
                  onChange={e => setStartTime(e.target.value)}
                  className="mt-2"
                  data-testid="input-start-time"
                />
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* SECTION C: Validation Checklist */}
      <Card data-testid="section-validation">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Pre-Launch Checklist</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-2">
            {validationChecklist.map((item, i) => (
              <div key={i} className="flex items-center gap-2 text-sm">
                <StatusIcon status={item.ok ? "pass" : "fail"} />
                <span className={item.ok ? "" : "text-muted-foreground"}>{item.label}</span>
              </div>
            ))}
          </div>
          <div className="mt-4">
            <Button
              onClick={() => launchMutation.mutate()}
              disabled={!allValid || launchMutation.isPending}
              className="w-full"
              data-testid="button-launch"
            >
              {launchMutation.isPending ? (
                <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Launching...</>
              ) : (
                <><Rocket className="h-4 w-4 mr-2" /> {publishMode === "VALIDATE" ? "Validate" : publishMode === "DRAFT" ? "Create Draft" : "Launch Live"}</>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* SECTION D: Launch Result */}
      {launchResult && (
        <Card data-testid="section-result">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              {launchResult.success ? (
                <><CheckCircle2 className="h-5 w-5 text-green-600" /> Launch {publishMode === "VALIDATE" ? "Validation" : ""} Successful</>
              ) : (
                <><XCircle className="h-5 w-5 text-red-600" /> Launch Failed</>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Stage Progress */}
            <div className="space-y-2">
              {launchResult.stages.map((stage, i) => (
                <div key={i} className="flex items-center gap-2 text-sm">
                  <StatusIcon status={stage.status} />
                  <span className="font-medium w-40">{STAGE_LABELS[stage.stage] || stage.stage}</span>
                  {stage.message && <span className="text-muted-foreground truncate">{stage.message}</span>}
                </div>
              ))}
            </div>

            {/* Validation Issues */}
            {launchResult.validationIssues && launchResult.validationIssues.length > 0 && (
              <div className="border rounded-md p-3 space-y-2">
                <p className="text-sm font-medium text-red-600">Validation Issues:</p>
                {launchResult.validationIssues.map((issue, i) => (
                  <div key={i} className="text-sm pl-2 border-l-2 border-red-200 space-y-0.5">
                    <p className="font-medium">{issue.message}</p>
                    <p className="text-muted-foreground text-xs">Fix: {issue.fixSuggestion}</p>
                  </div>
                ))}
              </div>
            )}

            {/* Success IDs */}
            {launchResult.success && launchResult.campaignId && (
              <div className="grid grid-cols-2 gap-2 text-sm border rounded-md p-3">
                <div><span className="text-muted-foreground">Campaign ID:</span> <span className="font-mono">{launchResult.campaignId}</span></div>
                <div><span className="text-muted-foreground">Ad Set ID:</span> <span className="font-mono">{launchResult.adsetId}</span></div>
                <div><span className="text-muted-foreground">Creative ID:</span> <span className="font-mono">{launchResult.creativeId}</span></div>
                <div><span className="text-muted-foreground">Ad ID:</span> <span className="font-mono">{launchResult.adId}</span></div>
              </div>
            )}

            {/* Error Details */}
            {!launchResult.success && launchResult.error && (
              <div className="border border-red-200 rounded-md p-3 space-y-2">
                <p className="text-sm font-medium text-red-600">
                  Failed at: {STAGE_LABELS[launchResult.errorStage || ""] || launchResult.errorStage}
                </p>
                <p className="text-sm">{launchResult.error}</p>
                {launchResult.rawError && (
                  <Collapsible open={showRawError} onOpenChange={setShowRawError}>
                    <CollapsibleTrigger asChild>
                      <Button variant="ghost" size="sm" className="gap-1 text-xs h-7" data-testid="button-show-raw-error">
                        <ChevronDown className={`h-3 w-3 transition-transform ${showRawError ? "rotate-180" : ""}`} />
                        Raw Meta Error
                      </Button>
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <pre className="mt-2 p-2 bg-muted text-xs rounded overflow-x-auto max-h-48">
                        {JSON.stringify(launchResult.rawError, null, 2)}
                      </pre>
                    </CollapsibleContent>
                  </Collapsible>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Launch History */}
      <LaunchJobHistory />
    </div>
  );
}

function LaunchJobHistory() {
  const jobsQuery = useQuery<any[]>({ queryKey: ["/api/meta/sales/launch-jobs"] });
  const jobs = jobsQuery.data || [];
  const [expandedJob, setExpandedJob] = useState<string | null>(null);

  if (jobs.length === 0) return null;

  return (
    <Card data-testid="section-launch-history">
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Launch History</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {jobs.slice(0, 20).map((job: LaunchJob) => (
            <Collapsible key={job.id} open={expandedJob === job.id} onOpenChange={open => setExpandedJob(open ? job.id : null)}>
              <CollapsibleTrigger asChild>
                <div className="flex items-center gap-2 text-sm p-2 border rounded-md cursor-pointer hover:bg-muted/50" data-testid={`job-row-${job.id}`}>
                  <StatusIcon status={job.status === "launched" || job.status === "validated" || job.status === "draft" ? "success" : job.status === "failed" ? "fail" : "running"} />
                  <span className="font-medium flex-1 truncate">{job.campaignName}</span>
                  <Badge variant="outline" className="text-xs">{job.mode || job.launchType}</Badge>
                  <Badge variant={job.status === "launched" ? "default" : job.status === "failed" ? "destructive" : "secondary"} className="text-xs">
                    {job.status}
                  </Badge>
                  <span className="text-xs text-muted-foreground">
                    {job.createdAt ? new Date(job.createdAt).toLocaleDateString("en-PK") : ""}
                  </span>
                  <ChevronDown className={`h-3 w-3 transition-transform ${expandedJob === job.id ? "rotate-180" : ""}`} />
                </div>
              </CollapsibleTrigger>
              <CollapsibleContent className="p-3 border rounded-md mt-1 bg-muted/20 text-sm space-y-2">
                {job.metaCampaignId && <p><span className="text-muted-foreground">Campaign:</span> {job.metaCampaignId}</p>}
                {job.metaAdsetId && <p><span className="text-muted-foreground">Ad Set:</span> {job.metaAdsetId}</p>}
                {job.metaCreativeId && <p><span className="text-muted-foreground">Creative:</span> {job.metaCreativeId}</p>}
                {job.metaAdId && <p><span className="text-muted-foreground">Ad:</span> {job.metaAdId}</p>}
                {job.errorMessage && <p className="text-red-600"><span className="text-muted-foreground">Error:</span> {job.errorMessage}</p>}
                {job.currentStage && <p><span className="text-muted-foreground">Last Stage:</span> {job.currentStage}</p>}
              </CollapsibleContent>
            </Collapsible>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
