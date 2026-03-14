import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  CheckCircle2, XCircle, AlertTriangle, Loader2, Rocket, Activity, Image, Video,
  FileText, Search, ChevronDown, RefreshCw, ExternalLink, Info, Upload, History,
  Zap, Globe, Target, DollarSign, MapPin, X,
} from "lucide-react";

type CreativeMode = "UPLOAD_IMAGE" | "UPLOAD_VIDEO" | "EXISTING_POST";
type PublishMode = "VALIDATE" | "DRAFT" | "PUBLISH";

interface MetaPage { id: string; name: string; }
interface MetaPixel { id: string; name: string; }
interface MetaIgAccount { id: string; name?: string; username?: string; profile_picture_url?: string; pageName?: string; }
interface MetaPost { id: string; message?: string; fullPicture?: string; createdTime?: string; type?: string; likes?: number; comments?: number; shares?: number; source?: string; permalinkUrl?: string; }
interface LaunchJob { id: string; adName: string; mode: string; publishMode: string; status: string; createdAt: string; metaCampaignId?: string; metaAdsetId?: string; metaAdId?: string; errorMessage?: string; }

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

type PostSourceFilter = "all" | "facebook" | "instagram" | "library";

const ASIAN_COUNTRIES: { code: string; name: string }[] = [
  { code: "AF", name: "Afghanistan" },
  { code: "AM", name: "Armenia" },
  { code: "AZ", name: "Azerbaijan" },
  { code: "BH", name: "Bahrain" },
  { code: "BD", name: "Bangladesh" },
  { code: "BT", name: "Bhutan" },
  { code: "BN", name: "Brunei" },
  { code: "KH", name: "Cambodia" },
  { code: "CN", name: "China" },
  { code: "CY", name: "Cyprus" },
  { code: "GE", name: "Georgia" },
  { code: "IN", name: "India" },
  { code: "ID", name: "Indonesia" },
  { code: "IR", name: "Iran" },
  { code: "IQ", name: "Iraq" },
  { code: "IL", name: "Israel" },
  { code: "JP", name: "Japan" },
  { code: "JO", name: "Jordan" },
  { code: "KZ", name: "Kazakhstan" },
  { code: "KW", name: "Kuwait" },
  { code: "KG", name: "Kyrgyzstan" },
  { code: "LA", name: "Laos" },
  { code: "LB", name: "Lebanon" },
  { code: "MY", name: "Malaysia" },
  { code: "MV", name: "Maldives" },
  { code: "MN", name: "Mongolia" },
  { code: "MM", name: "Myanmar" },
  { code: "NP", name: "Nepal" },
  { code: "KP", name: "North Korea" },
  { code: "OM", name: "Oman" },
  { code: "PK", name: "Pakistan" },
  { code: "PS", name: "Palestine" },
  { code: "PH", name: "Philippines" },
  { code: "QA", name: "Qatar" },
  { code: "SA", name: "Saudi Arabia" },
  { code: "SG", name: "Singapore" },
  { code: "KR", name: "South Korea" },
  { code: "LK", name: "Sri Lanka" },
  { code: "SY", name: "Syria" },
  { code: "TW", name: "Taiwan" },
  { code: "TJ", name: "Tajikistan" },
  { code: "TH", name: "Thailand" },
  { code: "TL", name: "Timor-Leste" },
  { code: "TR", name: "Turkey" },
  { code: "TM", name: "Turkmenistan" },
  { code: "AE", name: "UAE" },
  { code: "UZ", name: "Uzbekistan" },
  { code: "VN", name: "Vietnam" },
  { code: "YE", name: "Yemen" },
];

const PAKISTAN_CITIES: { key: string; name: string }[] = [
  { key: "2514815", name: "Karachi" },
  { key: "2514801", name: "Lahore" },
  { key: "2514772", name: "Islamabad" },
  { key: "2514832", name: "Rawalpindi" },
  { key: "2514757", name: "Faisalabad" },
  { key: "2514816", name: "Multan" },
  { key: "2514825", name: "Peshawar" },
  { key: "2514830", name: "Quetta" },
  { key: "2514762", name: "Gujranwala" },
  { key: "2514839", name: "Sialkot" },
  { key: "2514769", name: "Hyderabad" },
  { key: "2514735", name: "Bahawalpur" },
  { key: "2514836", name: "Sargodha" },
  { key: "2514726", name: "Abbottabad" },
  { key: "2514812", name: "Mardan" },
  { key: "2514842", name: "Sukkur" },
  { key: "2514800", name: "Larkana" },
  { key: "2514838", name: "Sheikhupura" },
  { key: "2514831", name: "Rahim Yar Khan" },
  { key: "2514775", name: "Jhang" },
  { key: "2514751", name: "Dera Ghazi Khan" },
  { key: "2514763", name: "Gujrat" },
  { key: "2514835", name: "Sahiwal" },
  { key: "2514847", name: "Wah Cantonment" },
  { key: "2514814", name: "Mirpur" },
  { key: "2514819", name: "Okara" },
  { key: "2514743", name: "Chiniot" },
  { key: "2514777", name: "Kamoke" },
  { key: "2514764", name: "Hafizabad" },
  { key: "2514833", name: "Sadiqabad" },
  { key: "2514741", name: "Burewala" },
  { key: "2514783", name: "Kohat" },
  { key: "2514779", name: "Khanewal" },
  { key: "2514750", name: "Dera Ismail Khan" },
  { key: "2514817", name: "Muzaffargarh" },
  { key: "2514728", name: "Attock" },
  { key: "2514846", name: "Vehari" },
  { key: "2514813", name: "Mianwali" },
  { key: "2514776", name: "Jhelum" },
  { key: "2514774", name: "Jaranwala" },
  { key: "2514780", name: "Khairpur" },
  { key: "2514742", name: "Chakwal" },
  { key: "2514778", name: "Kasur" },
  { key: "2514749", name: "Daska" },
  { key: "2514758", name: "Gojra" },
  { key: "2514811", name: "Mandi Bahauddin" },
  { key: "2514843", name: "Tando Adam" },
  { key: "2514818", name: "Nawabshah" },
  { key: "2514784", name: "Kotri" },
  { key: "2514844", name: "Swabi" },
  { key: "2514737", name: "Bannu" },
  { key: "2514820", name: "Nowshera" },
];

const glassCard = "relative rounded-2xl border border-white/20 dark:border-white/[0.08] bg-white/60 dark:bg-white/[0.04] backdrop-blur-xl";
const glassCardHover = `${glassCard} transition-all duration-300`;
const glassInner = "rounded-xl border border-black/[0.04] dark:border-white/[0.06] bg-white/40 dark:bg-white/[0.03] backdrop-blur-sm";

function StatusIcon({ status }: { status: string }) {
  switch (status) {
    case "pass":
    case "success":
      return <CheckCircle2 className="h-4 w-4 text-emerald-500" />;
    case "fail":
    case "failed":
      return <XCircle className="h-4 w-4 text-red-500" />;
    case "warn":
      return <AlertTriangle className="h-4 w-4 text-amber-500" />;
    case "running":
      return <Loader2 className="h-4 w-4 text-blue-500 animate-spin" />;
    default:
      return <div className="h-4 w-4 rounded-full border-2 border-black/10 dark:border-white/10" />;
  }
}

const STAGE_LABELS: Record<string, string> = {
  normalize: "Normalizing Input",
  validate: "Validating Fields",
  diagnostics: "Running Diagnostics",
  media_validation: "Validating Media",
  media_upload: "Uploading Media",
  media_readiness: "Checking Video Readiness",
  payload_preflight: "Payload Preflight Check",
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

function getDefaultBudget(currency: string): string {
  return currency === "PKR" ? "2800" : "10";
}

export default function SalesLauncher() {
  const { toast } = useToast();
  const [adName, setAdName] = useState("");
  const [mode, setMode] = useState<CreativeMode>("UPLOAD_IMAGE");
  const [destinationUrl, setDestinationUrl] = useState("");
  const [primaryText, setPrimaryText] = useState("");
  const [headline, setHeadline] = useState("");
  const [description, setDescription] = useState("");
  const [cta, setCta] = useState("SHOP_NOW");
  const [dailyBudget, setDailyBudget] = useState("10");
  const [budgetLevel, setBudgetLevel] = useState<"CBO" | "ABO">("CBO");
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
  const [launchStages, setLaunchStages] = useState<LaunchStage[]>([]);
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [showRawError, setShowRawError] = useState(false);
  const [budgetInitialized, setBudgetInitialized] = useState(false);
  const [targetCountries, setTargetCountries] = useState<string[]>(["PK"]);
  const [targetCities, setTargetCities] = useState<{ key: string; name: string }[]>([]);
  const [postSourceFilter, setPostSourceFilter] = useState<PostSourceFilter>("all");
  const [countrySearch, setCountrySearch] = useState("");
  const [citySearch, setCitySearch] = useState("");

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
    if (pages.length > 0 && !selectedPageId) {
      setSelectedPageId(pages[0].id);
    }
  }, [pages, selectedPageId]);

  useEffect(() => {
    if (pixels.length > 0 && !selectedPixelId) {
      setSelectedPixelId(pixels[0].id);
    }
  }, [pixels, selectedPixelId]);

  useEffect(() => {
    if (igAccounts.length > 0 && !selectedIgAccountId) {
      setSelectedIgAccountId(igAccounts[0].id);
    }
  }, [igAccounts, selectedIgAccountId]);

  const fbPostSearchParams = new URLSearchParams();
  if (postSearch) fbPostSearchParams.set("search", postSearch);
  fbPostSearchParams.set("includeVideos", "true");
  const fbPostsQuery = useQuery<any>({
    queryKey: [`/api/meta/page-posts?${fbPostSearchParams.toString()}`],
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
  const adImagesQuery = useQuery<any>({
    queryKey: ["/api/meta/ad-account-images"],
    enabled: isConnected && mode === "EXISTING_POST",
  });
  const adVideosQuery = useQuery<any>({
    queryKey: ["/api/meta/ad-account-videos"],
    enabled: isConnected && mode === "EXISTING_POST",
  });
  const fbPosts: MetaPost[] = fbPostsQuery.data?.posts || [];
  const fbPostsError = fbPostsQuery.data?._error === true;
  const fbPostsErrorMsg = fbPostsQuery.data?.errorMessage || "Could not load Facebook posts";
  const igPosts: MetaPost[] = igPostsQuery.data?.posts || [];
  const libraryImages: MetaPost[] = (adImagesQuery.data?.images || []).map((img: any) => ({
    id: `lib_img_${img.hash}`,
    message: img.name || "Ad Image",
    fullPicture: img.url || "",
    createdTime: img.createdTime,
    type: "image",
    source: "library",
  }));
  const libraryVideos: MetaPost[] = (adVideosQuery.data?.videos || []).map((v: any) => ({
    id: `lib_vid_${v.id}`,
    message: v.title || "Ad Video",
    fullPicture: v.picture || "",
    createdTime: v.createdTime,
    type: "video",
    source: "library",
  }));
  const allPosts: MetaPost[] = [...fbPosts, ...igPosts, ...libraryImages, ...libraryVideos].sort((a, b) => {
    const ta = a.createdTime ? new Date(a.createdTime).getTime() : 0;
    const tb = b.createdTime ? new Date(b.createdTime).getTime() : 0;
    return tb - ta;
  });
  const posts: MetaPost[] = postSourceFilter === "all"
    ? allPosts
    : allPosts.filter(p => p.source === postSourceFilter);
  const postsLoading = fbPostsQuery.isLoading || igPostsQuery.isLoading || adImagesQuery.isLoading || adVideosQuery.isLoading;
  const sourceCount = {
    all: allPosts.length,
    facebook: allPosts.filter(p => p.source === "facebook").length,
    instagram: allPosts.filter(p => p.source === "instagram").length,
    library: allPosts.filter(p => p.source === "library").length,
  };

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
        if (!budgetInitialized) {
          setDailyBudget(getDefaultBudget(data.adAccountCurrency));
          setBudgetInitialized(true);
        }
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

  const TERMINAL_STATUSES = ["launched", "draft", "validated", "failed", "partial"];

  const pollJobStatus = async (jobId: string) => {
    const pollInterval = 1500;
    const maxPolls = 120;

    for (let i = 0; i < maxPolls; i++) {
      try {
        const res = await fetch(`/api/meta/sales/launch-jobs/${jobId}`, { credentials: "include" });
        if (!res.ok) break;
        const data = await res.json();
        const job = data.job;
        if (!job) break;

        const resultJson = job.resultJson as { stages?: LaunchStage[] } | null;
        const stages = resultJson?.stages || [];
        setLaunchStages(stages);

        if (TERMINAL_STATUSES.includes(job.status)) {
          const finalStages = stages;
          const lastStage = finalStages[finalStages.length - 1];
          const success = job.status === "launched" || job.status === "draft" || job.status === "validated";

          const result: LaunchResult = {
            success,
            jobId: job.id,
            stages: finalStages,
            campaignId: job.metaCampaignId || undefined,
            adsetId: job.metaAdsetId || undefined,
            creativeId: job.metaCreativeId || undefined,
            adId: job.metaAdId || undefined,
            error: job.errorMessage || undefined,
            errorStage: !success ? lastStage?.stage : undefined,
          };

          setLaunchResult(result);
          setActiveJobId(null);
          queryClient.invalidateQueries({ queryKey: ["/api/meta/sales/launch-jobs"] });

          if (success) {
            toast({ title: job.status === "validated" ? "Validation passed!" : "Ad launched successfully!" });
          } else {
            toast({
              title: `Failed at: ${STAGE_LABELS[lastStage?.stage || ""] || lastStage?.stage || "unknown"}`,
              description: job.errorMessage,
              variant: "destructive",
            });
          }
          return;
        }
      } catch {
        break;
      }
      await new Promise(resolve => setTimeout(resolve, pollInterval));
    }

    setActiveJobId(null);
    toast({ title: "Launch timed out", description: "The launch is still running in the background. Check recent launches for status.", variant: "destructive" });
  };

  const launchMutation = useMutation({
    mutationFn: async () => {
      const body: Record<string, unknown> = {
        adName,
        mode,
        adAccountId: metaStatus?.adAccountId || "",
        pageId: selectedPageId,
        pixelId: selectedPixelId && selectedPixelId !== "none" ? selectedPixelId : null,
        dailyBudget: parseFloat(dailyBudget) || 500,
        currency: accountCurrency,
        budgetLevel,
        startMode,
        startTime: startMode === "SCHEDULED" ? startTime : null,
        publishMode,
        targetCountries: targetCountries.length > 0 ? targetCountries : ["PK"],
        targetCities: targetCities.length > 0 ? targetCities : undefined,
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
        if (destinationUrl.trim()) {
          body.destinationUrl = destinationUrl;
        }
      }

      const res = await apiRequest("POST", "/api/meta/sales/launch", body);
      return res.json();
    },
    onSuccess: (data: { jobId: string }) => {
      setLaunchResult(null);
      setLaunchStages([{ stage: "normalize", status: "running" }]);
      setActiveJobId(data.jobId);
      pollJobStatus(data.jobId);
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
      ? [
          { label: "Post selected", ok: !!selectedPostId },
        ]
      : [
          { label: "Destination URL", ok: !!destinationUrl.trim() },
          { label: "Primary text", ok: !!primaryText.trim() },
          ...(mode === "UPLOAD_IMAGE" ? [{ label: "Image uploaded", ok: !!imageHash }] : []),
          ...(mode === "UPLOAD_VIDEO" ? [{ label: "Video ready", ok: videoStatus === "ready" }] : []),
        ]),
  ];
  const allValid = validationChecklist.every(c => c.ok);
  const validCount = validationChecklist.filter(c => c.ok).length;

  if (!isConnected) {
    return (
      <div className="p-4 md:p-6 max-w-[880px] mx-auto space-y-6" data-testid="sales-launcher-page">
        <h1 className="text-2xl font-semibold tracking-tight" data-testid="text-page-title">Sales Launcher</h1>
        <div className={`${glassCard} p-8 text-center space-y-4`}>
          <div className="w-16 h-16 rounded-2xl bg-amber-50 dark:bg-amber-500/10 flex items-center justify-center mx-auto">
            <AlertTriangle className="h-8 w-8 text-amber-500" />
          </div>
          <p className="text-lg font-medium">Meta Not Connected</p>
          <p className="text-muted-foreground text-sm max-w-md mx-auto">Connect your Meta account in Settings &gt; Marketing to use the Sales Launcher.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 max-w-[880px] mx-auto space-y-5" data-testid="sales-launcher-page">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight" data-testid="text-page-title">Sales Launcher</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Launch SALES campaigns with geo-targeted audiences</p>
        </div>
        <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200/60 dark:border-emerald-500/20">
          <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
          <span className="text-xs font-medium text-emerald-700 dark:text-emerald-400">{metaStatus?.businessName || "Connected"}</span>
        </div>
      </div>

      {/* SECTION A: Connection & Diagnostics */}
      <div className={glassCard} data-testid="section-diagnostics">
        <div className="px-5 pt-4 pb-3">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-blue-50 dark:bg-blue-500/10 flex items-center justify-center">
              <Globe className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <h2 className="text-sm font-semibold">Connection & Diagnostics</h2>
              <p className="text-xs text-muted-foreground">Verify your Meta account is ready to launch ads</p>
            </div>
          </div>
        </div>
        <div className="px-5 pb-5 space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3 text-sm">
            <div>
              <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Ad Account</span>
              <p className="font-medium text-xs truncate mt-1">{metaStatus?.adAccountId || "—"}</p>
            </div>
            <div>
              <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Page</span>
              <Select value={selectedPageId} onValueChange={setSelectedPageId}>
                <SelectTrigger className="h-8 text-xs mt-1 bg-white/50 dark:bg-white/[0.06] border-black/[0.08] dark:border-white/[0.08]" data-testid="select-page">
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
              <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Instagram</span>
              <Select value={selectedIgAccountId} onValueChange={setSelectedIgAccountId}>
                <SelectTrigger className="h-8 text-xs mt-1 bg-white/50 dark:bg-white/[0.06] border-black/[0.08] dark:border-white/[0.08]" data-testid="select-ig-account">
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
              <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Pixel</span>
              <Select value={selectedPixelId} onValueChange={setSelectedPixelId}>
                <SelectTrigger className="h-8 text-xs mt-1 bg-white/50 dark:bg-white/[0.06] border-black/[0.08] dark:border-white/[0.08]" data-testid="select-pixel">
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
                className="w-full h-8 text-xs bg-white/50 dark:bg-white/[0.06] border-black/[0.08] dark:border-white/[0.08] hover:bg-white/80 dark:hover:bg-white/[0.1] transition-all"
                data-testid="button-run-diagnostics"
              >
                {diagnosticsMutation.isPending ? <Loader2 className="h-3 w-3 mr-1.5 animate-spin" /> : <RefreshCw className="h-3 w-3 mr-1.5" />}
                Diagnostics
              </Button>
            </div>
          </div>

          {diagnosticsResult && (
            <div className={`${glassInner} p-3 space-y-1.5`} data-testid="diagnostics-results">
              {diagnosticsResult.checks.map((check, i) => (
                <div key={i} className="flex items-center gap-2 text-sm">
                  <StatusIcon status={check.status} />
                  <span className="font-medium w-28 text-xs">{check.name}</span>
                  <span className="text-muted-foreground text-xs">{check.message}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* SECTION B: Sales Ad Configuration */}
      <div className={glassCard} data-testid="section-form">
        <div className="px-5 pt-4 pb-3">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-violet-50 dark:bg-violet-500/10 flex items-center justify-center">
              <Target className="h-3.5 w-3.5 text-violet-600 dark:text-violet-400" />
            </div>
            <div>
              <h2 className="text-sm font-semibold">Sales Ad Configuration</h2>
              <p className="text-xs text-muted-foreground">SALES objective · Pakistan broad · Automatic placements</p>
            </div>
          </div>
        </div>
        <div className="px-5 pb-5 space-y-4">
          <div>
            <Label htmlFor="adName" className="text-xs font-medium">Campaign / Ad Name</Label>
            <Input
              id="adName"
              value={adName}
              onChange={e => setAdName(e.target.value)}
              placeholder="e.g. Summer Sale Campaign"
              className="mt-1 bg-white/50 dark:bg-white/[0.06] border-black/[0.08] dark:border-white/[0.08] focus:ring-2 focus:ring-blue-500/20 transition-all"
              data-testid="input-ad-name"
            />
          </div>

          {/* Creative Mode Tabs */}
          <div>
            <Label className="text-xs font-medium">Creative Source</Label>
            <Tabs value={mode} onValueChange={v => setMode(v as CreativeMode)} className="mt-1.5">
              <TabsList className="grid w-full grid-cols-3 bg-black/[0.04] dark:bg-white/[0.06] p-0.5 rounded-xl">
                <TabsTrigger value="UPLOAD_IMAGE" data-testid="tab-upload-image" className="gap-1.5 text-xs rounded-[10px] data-[state=active]:bg-white dark:data-[state=active]:bg-white/[0.12] data-[state=active]:shadow-sm transition-all">
                  <Image className="h-3 w-3" /> Image
                </TabsTrigger>
                <TabsTrigger value="UPLOAD_VIDEO" data-testid="tab-upload-video" className="gap-1.5 text-xs rounded-[10px] data-[state=active]:bg-white dark:data-[state=active]:bg-white/[0.12] data-[state=active]:shadow-sm transition-all">
                  <Video className="h-3 w-3" /> Video
                </TabsTrigger>
                <TabsTrigger value="EXISTING_POST" data-testid="tab-existing-post" className="gap-1.5 text-xs rounded-[10px] data-[state=active]:bg-white dark:data-[state=active]:bg-white/[0.12] data-[state=active]:shadow-sm transition-all">
                  <FileText className="h-3 w-3" /> Post
                </TabsTrigger>
              </TabsList>

              <TabsContent value="UPLOAD_IMAGE" className="space-y-3 mt-3">
                <div>
                  <div className="flex flex-col gap-2">
                    <div
                      className={`${glassInner} p-5 text-center cursor-pointer hover:bg-white/60 dark:hover:bg-white/[0.06] transition-all`}
                      onClick={() => document.getElementById("imageFileInput")?.click()}
                      data-testid="dropzone-image"
                    >
                      <div className="w-10 h-10 rounded-xl bg-blue-50 dark:bg-blue-500/10 flex items-center justify-center mx-auto mb-2">
                        <Upload className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                      </div>
                      <p className="text-xs font-medium">Click to upload an image</p>
                      <p className="text-[10px] text-muted-foreground mt-0.5">JPG, PNG, or WebP (max 30MB)</p>
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
                            className="bg-white/50 dark:bg-white/[0.06] border-black/[0.08] dark:border-white/[0.08]"
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
                    <div className="mt-2 flex items-center gap-2 text-xs text-blue-600">
                      <Loader2 className="h-3 w-3 animate-spin" /> Uploading image to Meta...
                    </div>
                  )}
                  {imageHash && (
                    <div className="mt-2 flex items-center gap-2 text-xs text-emerald-600">
                      <CheckCircle2 className="h-3 w-3" />
                      Image uploaded (hash: {imageHash.substring(0, 12)}...)
                      <Button variant="ghost" size="sm" className="h-6 text-[10px] ml-auto" onClick={() => { setImageHash(""); setImagePreview(""); setImageUrl(""); }} data-testid="button-remove-image">Remove</Button>
                    </div>
                  )}
                  {imagePreview && (
                    <img src={imagePreview} alt="Preview" className="mt-2 rounded-xl max-h-48 object-contain" data-testid="img-preview" />
                  )}
                </div>
              </TabsContent>

              <TabsContent value="UPLOAD_VIDEO" className="space-y-3 mt-3">
                <div>
                  <div className="flex flex-col gap-2">
                    <div
                      className={`${glassInner} p-5 text-center cursor-pointer hover:bg-white/60 dark:hover:bg-white/[0.06] transition-all`}
                      onClick={() => document.getElementById("videoFileInput")?.click()}
                      data-testid="dropzone-video"
                    >
                      <div className="w-10 h-10 rounded-xl bg-violet-50 dark:bg-violet-500/10 flex items-center justify-center mx-auto mb-2">
                        <Upload className="h-4 w-4 text-violet-600 dark:text-violet-400" />
                      </div>
                      <p className="text-xs font-medium">Click to upload a video</p>
                      <p className="text-[10px] text-muted-foreground mt-0.5">MP4, MOV, or AVI (max 100MB)</p>
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
                            className="bg-white/50 dark:bg-white/[0.06] border-black/[0.08] dark:border-white/[0.08]"
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
                    <div className="mt-2 flex items-center gap-2 text-xs text-blue-600">
                      <Loader2 className="h-3 w-3 animate-spin" /> Uploading video to Meta...
                    </div>
                  )}
                  {videoId && (
                    <div className="mt-2 flex items-center gap-2 text-xs">
                      <StatusIcon status={videoStatus === "ready" ? "pass" : videoStatus === "timeout" ? "fail" : "running"} />
                      Video ID: {videoId} — Status: {videoStatus || "pending"}
                      <Button variant="ghost" size="sm" className="h-6 text-[10px] ml-auto" onClick={() => { setVideoId(""); setVideoStatus(""); setVideoUrl(""); }} data-testid="button-remove-video">Remove</Button>
                    </div>
                  )}
                </div>
              </TabsContent>

              <TabsContent value="EXISTING_POST" className="space-y-3 mt-3">
                <div className={`${glassInner} flex items-start gap-2 p-3 text-xs`}>
                  <Info className="h-3.5 w-3.5 text-muted-foreground mt-0.5 shrink-0" />
                  <span className="text-muted-foreground">
                    Existing post ads run <strong>as-is</strong>. Copy, URL, and CTA cannot be edited for this mode.
                  </span>
                </div>
                <div>
                  <Label className="text-xs font-medium">Search Posts</Label>
                  <div className="flex gap-2 mt-1">
                    <Input
                      value={postSearch}
                      onChange={e => setPostSearch(e.target.value)}
                      placeholder="Search by text..."
                      className="bg-white/50 dark:bg-white/[0.06] border-black/[0.08] dark:border-white/[0.08]"
                      data-testid="input-post-search"
                    />
                    <Button size="sm" variant="outline" disabled={postsLoading} className="bg-white/50 dark:bg-white/[0.06] border-black/[0.08] dark:border-white/[0.08]">
                      <Search className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
                <div className="flex gap-1.5 flex-wrap" data-testid="post-source-filters">
                  {(["all", "facebook", "instagram", "library"] as PostSourceFilter[]).map(src => (
                    <button
                      key={src}
                      onClick={() => setPostSourceFilter(src)}
                      className={`px-2.5 py-1 rounded-lg text-[10px] font-medium transition-all ${
                        postSourceFilter === src
                          ? "bg-blue-100 dark:bg-blue-500/15 text-blue-700 dark:text-blue-300 ring-1 ring-blue-300/50"
                          : "bg-black/[0.03] dark:bg-white/[0.06] text-muted-foreground hover:bg-black/[0.06] dark:hover:bg-white/[0.1]"
                      }`}
                      data-testid={`filter-${src}`}
                    >
                      {src === "all" ? "All" : src === "facebook" ? "Facebook" : src === "instagram" ? "Instagram" : "Media Library"}
                      <span className="ml-1 opacity-60">{sourceCount[src]}</span>
                    </button>
                  ))}
                </div>
                {fbPostsError && (
                  <div className="flex items-center gap-2 text-xs text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-500/10 rounded-lg px-3 py-2">
                    <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                    <span>Facebook posts could not be loaded: {fbPostsErrorMsg}</span>
                  </div>
                )}
                {postsLoading && (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Loader2 className="h-3 w-3 animate-spin" /> Loading posts...
                  </div>
                )}
                <div className="max-h-64 overflow-y-auto space-y-1.5" data-testid="post-list">
                  {posts.map((post: MetaPost) => (
                    <div
                      key={post.id}
                      className={`flex gap-3 p-2.5 rounded-xl transition-all ${
                        post.source === "library"
                          ? `${glassInner} opacity-60 cursor-default`
                          : selectedPostId === post.id
                            ? "bg-blue-50/80 dark:bg-blue-500/10 border border-blue-200/60 dark:border-blue-500/20 ring-1 ring-blue-500/20 cursor-pointer"
                            : `${glassInner} hover:bg-white/60 dark:hover:bg-white/[0.06] cursor-pointer`
                      }`}
                      title={post.source === "library" ? "Library assets cannot be used as existing posts — use Upload mode instead" : undefined}
                      onClick={() => {
                        if (post.source === "library") return;
                        setSelectedPostId(post.id);
                        setSelectedPostSource(post.source === "instagram" ? "instagram" : "facebook");
                        setSelectedPostPreview(post);
                      }}
                      data-testid={`post-item-${post.id}`}
                    >
                      {post.fullPicture && (
                        <img src={post.fullPicture} alt="" className="w-14 h-14 rounded-lg object-cover shrink-0" />
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <span className={`text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-md ${
                            post.source === "instagram" ? "bg-pink-100 dark:bg-pink-500/10 text-pink-600 dark:text-pink-400"
                            : post.source === "library" ? "bg-purple-100 dark:bg-purple-500/10 text-purple-600 dark:text-purple-400"
                            : "bg-blue-100 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400"
                          }`}>
                            {post.source === "instagram" ? "IG" : post.source === "library" ? "LIB" : "FB"}
                          </span>
                          {post.type && (
                            <span className="text-[8px] uppercase tracking-wider text-muted-foreground bg-black/[0.04] dark:bg-white/[0.06] px-1 py-0.5 rounded">
                              {post.type}
                            </span>
                          )}
                          <p className="text-xs truncate">{post.message || "(No text)"}</p>
                        </div>
                        <p className="text-[10px] text-muted-foreground mt-0.5">
                          {post.createdTime ? new Date(post.createdTime).toLocaleDateString("en-PK") : ""} · {post.type || "post"}
                          {(post.likes || 0) > 0 && ` · ${post.likes} likes`}
                        </p>
                      </div>
                      {post.source === "library" && (
                        <span className="text-[8px] text-muted-foreground self-center shrink-0">View only</span>
                      )}
                      {selectedPostId === post.id && post.source !== "library" && <CheckCircle2 className="h-4 w-4 text-blue-500 shrink-0 self-center" />}
                    </div>
                  ))}
                </div>
              </TabsContent>
            </Tabs>
          </div>

          {/* Ad Copy Fields */}
          <div className="space-y-3">
            <div>
              <Label htmlFor="destinationUrl" className="text-xs font-medium">
                Destination URL
                {isExistingPost && <span className="text-[10px] text-muted-foreground ml-2">(required for conversion tracking)</span>}
              </Label>
              <Input
                id="destinationUrl"
                value={destinationUrl}
                onChange={e => setDestinationUrl(e.target.value)}
                placeholder="https://yourstore.com/product"
                className="mt-1 bg-white/50 dark:bg-white/[0.06] border-black/[0.08] dark:border-white/[0.08] focus:ring-2 focus:ring-blue-500/20 transition-all"
                data-testid="input-destination-url"
              />
            </div>
            <div>
              <Label htmlFor="primaryText" className="text-xs font-medium">
                Primary Text
                {isExistingPost && <span className="text-[10px] text-muted-foreground ml-2">(not applicable)</span>}
              </Label>
              <Textarea
                id="primaryText"
                value={isExistingPost ? "" : primaryText}
                onChange={e => setPrimaryText(e.target.value)}
                placeholder="Your main ad copy..."
                disabled={isExistingPost}
                rows={3}
                className="mt-1 bg-white/50 dark:bg-white/[0.06] border-black/[0.08] dark:border-white/[0.08] focus:ring-2 focus:ring-blue-500/20 transition-all resize-none"
                data-testid="input-primary-text"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="headline" className="text-xs font-medium">
                  Headline {isExistingPost && <span className="text-[10px] text-muted-foreground">(n/a)</span>}
                </Label>
                <Input
                  id="headline"
                  value={isExistingPost ? "" : headline}
                  onChange={e => setHeadline(e.target.value)}
                  placeholder="Short headline"
                  disabled={isExistingPost}
                  className="mt-1 bg-white/50 dark:bg-white/[0.06] border-black/[0.08] dark:border-white/[0.08]"
                  data-testid="input-headline"
                />
              </div>
              <div>
                <Label htmlFor="description" className="text-xs font-medium">
                  Description {isExistingPost && <span className="text-[10px] text-muted-foreground">(n/a)</span>}
                </Label>
                <Input
                  id="description"
                  value={isExistingPost ? "" : description}
                  onChange={e => setDescription(e.target.value)}
                  placeholder="Optional description"
                  disabled={isExistingPost}
                  className="mt-1 bg-white/50 dark:bg-white/[0.06] border-black/[0.08] dark:border-white/[0.08]"
                  data-testid="input-description"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs font-medium">
                  Call to Action {isExistingPost && <span className="text-[10px] text-muted-foreground">(n/a)</span>}
                </Label>
                <Select value={isExistingPost ? "" : cta} onValueChange={setCta} disabled={isExistingPost}>
                  <SelectTrigger className="mt-1 bg-white/50 dark:bg-white/[0.06] border-black/[0.08] dark:border-white/[0.08]" data-testid="select-cta">
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
                <Label htmlFor="dailyBudget" className="text-xs font-medium flex items-center gap-1">
                  <DollarSign className="h-3 w-3" />
                  Daily Budget ({accountCurrency})
                </Label>
                <Input
                  id="dailyBudget"
                  type="number"
                  value={dailyBudget}
                  onChange={e => setDailyBudget(e.target.value)}
                  min="1"
                  className="mt-1 bg-white/50 dark:bg-white/[0.06] border-black/[0.08] dark:border-white/[0.08]"
                  data-testid="input-daily-budget"
                />
              </div>
            </div>
            <div>
              <Label className="text-xs font-medium">Budget Optimization</Label>
              <Select value={budgetLevel} onValueChange={v => setBudgetLevel(v as "CBO" | "ABO")}>
                <SelectTrigger className="mt-1 bg-white/50 dark:bg-white/[0.06] border-black/[0.08] dark:border-white/[0.08]" data-testid="select-budget-level">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="CBO">Campaign Budget Optimization (CBO)</SelectItem>
                  <SelectItem value="ABO">Ad Set Budget (ABO)</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-[10px] text-muted-foreground mt-1.5">
                {budgetLevel === "CBO"
                  ? "Meta distributes your budget across ad sets automatically"
                  : "You control the budget for each ad set individually"}
              </p>
            </div>
          </div>

          {/* Publish Mode */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs font-medium">Publish Mode</Label>
              <Select value={publishMode} onValueChange={v => setPublishMode(v as PublishMode)}>
                <SelectTrigger className="mt-1 bg-white/50 dark:bg-white/[0.06] border-black/[0.08] dark:border-white/[0.08]" data-testid="select-publish-mode">
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
              <Label className="text-xs font-medium">Start</Label>
              <Select value={startMode} onValueChange={v => setStartMode(v as "NOW" | "SCHEDULED")}>
                <SelectTrigger className="mt-1 bg-white/50 dark:bg-white/[0.06] border-black/[0.08] dark:border-white/[0.08]" data-testid="select-start-mode">
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
                  className="mt-2 bg-white/50 dark:bg-white/[0.06] border-black/[0.08] dark:border-white/[0.08]"
                  data-testid="input-start-time"
                />
              )}
            </div>
          </div>
        </div>
      </div>

      {/* SECTION: Geo Targeting */}
      <div className={glassCard} data-testid="section-targeting">
        <div className="px-5 pt-4 pb-3">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-orange-50 dark:bg-orange-500/10 flex items-center justify-center">
              <MapPin className="h-3.5 w-3.5 text-orange-600 dark:text-orange-400" />
            </div>
            <div>
              <h2 className="text-sm font-semibold">Geo Targeting</h2>
              <p className="text-xs text-muted-foreground">Select countries and cities to target</p>
            </div>
          </div>
        </div>
        <div className="px-5 pb-5 space-y-4">
          <div>
            <Label className="text-xs font-medium">Countries</Label>
            <div className="flex flex-wrap gap-1.5 mt-1.5 mb-2">
              {targetCountries.map(code => {
                const c = ASIAN_COUNTRIES.find(a => a.code === code);
                return (
                  <span key={code} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-blue-50 dark:bg-blue-500/10 text-blue-700 dark:text-blue-300 text-[10px] font-medium" data-testid={`country-tag-${code}`}>
                    {c?.name || code}
                    <button onClick={() => setTargetCountries(prev => prev.filter(cc => cc !== code))} className="hover:text-red-500 transition-colors" data-testid={`remove-country-${code}`}>
                      <X className="h-2.5 w-2.5" />
                    </button>
                  </span>
                );
              })}
            </div>
            <div className="relative">
              <Input
                placeholder="Search countries..."
                value={countrySearch}
                onChange={e => setCountrySearch(e.target.value)}
                className="h-8 text-xs bg-white/50 dark:bg-white/[0.06] border-black/[0.08] dark:border-white/[0.08]"
                data-testid="input-country-search"
              />
              {countrySearch.trim() && (
                <div className={`absolute top-full left-0 right-0 mt-1 z-20 ${glassCard} max-h-40 overflow-y-auto py-1 shadow-lg`}>
                  {ASIAN_COUNTRIES
                    .filter(c => !targetCountries.includes(c.code) && c.name.toLowerCase().includes(countrySearch.toLowerCase()))
                    .map(c => (
                      <button
                        key={c.code}
                        className="w-full text-left px-3 py-1.5 text-xs hover:bg-blue-50 dark:hover:bg-blue-500/10 transition-colors"
                        onClick={() => { setTargetCountries(prev => [...prev, c.code]); setCountrySearch(""); }}
                        data-testid={`add-country-${c.code}`}
                      >
                        {c.name} ({c.code})
                      </button>
                    ))}
                </div>
              )}
            </div>
          </div>

          {targetCountries.includes("PK") && (
            <div>
              <Label className="text-xs font-medium">Pakistan Cities <span className="text-muted-foreground font-normal">(optional — leave empty for all of Pakistan)</span></Label>
              <div className="flex flex-wrap gap-1.5 mt-1.5 mb-2">
                {targetCities.map(city => (
                  <span key={city.key} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-orange-50 dark:bg-orange-500/10 text-orange-700 dark:text-orange-300 text-[10px] font-medium" data-testid={`city-tag-${city.key}`}>
                    {city.name}
                    <button onClick={() => setTargetCities(prev => prev.filter(c => c.key !== city.key))} className="hover:text-red-500 transition-colors" data-testid={`remove-city-${city.key}`}>
                      <X className="h-2.5 w-2.5" />
                    </button>
                  </span>
                ))}
              </div>
              <div className="relative">
                <Input
                  placeholder="Search Pakistan cities..."
                  value={citySearch}
                  onChange={e => setCitySearch(e.target.value)}
                  className="h-8 text-xs bg-white/50 dark:bg-white/[0.06] border-black/[0.08] dark:border-white/[0.08]"
                  data-testid="input-city-search"
                />
                {citySearch.trim() && (
                  <div className={`absolute top-full left-0 right-0 mt-1 z-20 ${glassCard} max-h-40 overflow-y-auto py-1 shadow-lg`}>
                    {PAKISTAN_CITIES
                      .filter(c => !targetCities.some(tc => tc.key === c.key) && c.name.toLowerCase().includes(citySearch.toLowerCase()))
                      .map(c => (
                        <button
                          key={c.key}
                          className="w-full text-left px-3 py-1.5 text-xs hover:bg-orange-50 dark:hover:bg-orange-500/10 transition-colors"
                          onClick={() => { setTargetCities(prev => [...prev, c]); setCitySearch(""); }}
                          data-testid={`add-city-${c.key}`}
                        >
                          {c.name}
                        </button>
                      ))}
                  </div>
                )}
              </div>
              {targetCities.length > 0 && (
                <p className="text-[10px] text-amber-600 dark:text-amber-400 mt-1.5 flex items-center gap-1">
                  <AlertTriangle className="h-3 w-3" />
                  When cities are selected, targeting narrows to those cities only (not all of Pakistan)
                </p>
              )}
            </div>
          )}

          <div className={`${glassInner} p-3 text-xs text-muted-foreground`}>
            <span className="font-medium text-foreground">Targeting: </span>
            {targetCities.length > 0
              ? `${targetCities.map(c => c.name).join(", ")}${targetCountries.filter(c => c !== "PK").length > 0 ? ` + ${targetCountries.filter(c => c !== "PK").map(code => ASIAN_COUNTRIES.find(a => a.code === code)?.name || code).join(", ")}` : ""}`
              : targetCountries.map(code => ASIAN_COUNTRIES.find(a => a.code === code)?.name || code).join(", ")}
          </div>
        </div>
      </div>

      {/* SECTION C: Pre-Launch Checklist + Button */}
      <div className={glassCard} data-testid="section-validation">
        <div className="px-5 pt-4 pb-3">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-emerald-50 dark:bg-emerald-500/10 flex items-center justify-center">
              <Zap className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
            </div>
            <div className="flex-1">
              <h2 className="text-sm font-semibold">Pre-Launch Checklist</h2>
            </div>
            <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${allValid ? "bg-emerald-100 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400" : "bg-amber-100 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400"}`}>
              {validCount}/{validationChecklist.length}
            </span>
          </div>
        </div>
        <div className="px-5 pb-5">
          <div className="grid grid-cols-2 gap-1.5 mb-4">
            {validationChecklist.map((item, i) => (
              <div key={i} className="flex items-center gap-2 text-xs py-1">
                <StatusIcon status={item.ok ? "pass" : "fail"} />
                <span className={item.ok ? "text-foreground" : "text-muted-foreground"}>{item.label}</span>
              </div>
            ))}
          </div>
          <Button
            onClick={() => launchMutation.mutate()}
            disabled={!allValid || launchMutation.isPending || !!activeJobId}
            className="w-full h-11 text-sm font-medium bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white border-0 rounded-xl shadow-[0_0_20px_rgba(59,130,246,0.3)] hover:shadow-[0_0_30px_rgba(59,130,246,0.4)] transition-all duration-300 disabled:opacity-50 disabled:shadow-none"
            data-testid="button-launch"
          >
            {launchMutation.isPending || activeJobId ? (
              <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> {activeJobId ? "Launching..." : "Submitting..."}</>
            ) : (
              <><Rocket className="h-4 w-4 mr-2" /> {publishMode === "VALIDATE" ? "Validate" : publishMode === "DRAFT" ? "Create Draft" : "Launch Live"}</>
            )}
          </Button>
        </div>
      </div>

      {/* SECTION D: Real-time Launch Progress */}
      {activeJobId && !launchResult && launchStages.length > 0 && (
        <div className={`${glassCard} border-blue-200/60 dark:border-blue-500/20`} data-testid="section-progress">
          <div className="px-5 pt-4 pb-3">
            <div className="flex items-center gap-2">
              <Loader2 className="h-4 w-4 text-blue-500 animate-spin" />
              <h2 className="text-sm font-semibold">Launch in Progress</h2>
            </div>
            <p className="text-[10px] text-muted-foreground mt-0.5 ml-6">Stages update in real-time</p>
          </div>
          <div className="px-5 pb-5">
            <div className="space-y-1.5">
              {launchStages.map((stage, i) => (
                <div key={i} className="flex items-center gap-2 text-xs py-1" data-testid={`progress-stage-${stage.stage}`}>
                  <StatusIcon status={stage.status} />
                  <span className="font-medium w-40">{STAGE_LABELS[stage.stage] || stage.stage}</span>
                  {stage.message && <span className="text-muted-foreground truncate">{stage.message}</span>}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Launch Result (Final) */}
      {launchResult && (
        <div className={`${glassCard} ${launchResult.success ? "border-emerald-200/60 dark:border-emerald-500/20" : "border-red-200/60 dark:border-red-500/20"}`} data-testid="section-result">
          <div className="px-5 pt-4 pb-3">
            <div className="flex items-center gap-2">
              {launchResult.success ? (
                <><CheckCircle2 className="h-4 w-4 text-emerald-500" /> <h2 className="text-sm font-semibold">Launch {publishMode === "VALIDATE" ? "Validation" : ""} Successful</h2></>
              ) : (
                <><XCircle className="h-4 w-4 text-red-500" /> <h2 className="text-sm font-semibold">Launch Failed</h2></>
              )}
            </div>
          </div>
          <div className="px-5 pb-5 space-y-3">
            <div className="space-y-1.5">
              {launchResult.stages.map((stage, i) => (
                <div key={i} className="flex items-center gap-2 text-xs">
                  <StatusIcon status={stage.status} />
                  <span className="font-medium w-40">{STAGE_LABELS[stage.stage] || stage.stage}</span>
                  {stage.message && <span className="text-muted-foreground truncate">{stage.message}</span>}
                </div>
              ))}
            </div>

            {launchResult.validationIssues && launchResult.validationIssues.length > 0 && (
              <div className={`${glassInner} p-3 space-y-2`}>
                <p className="text-xs font-semibold text-red-600">Validation Issues:</p>
                {launchResult.validationIssues.map((issue, i) => (
                  <div key={i} className="text-xs pl-2 border-l-2 border-red-200 dark:border-red-500/30 space-y-0.5">
                    <p className="font-medium">{issue.message}</p>
                    <p className="text-muted-foreground text-[10px]">Fix: {issue.fixSuggestion}</p>
                  </div>
                ))}
              </div>
            )}

            {launchResult.success && launchResult.campaignId && (
              <div className={`${glassInner} grid grid-cols-2 gap-2 text-xs p-3`}>
                <div><span className="text-muted-foreground">Campaign:</span> <span className="font-mono text-[10px]">{launchResult.campaignId}</span></div>
                <div><span className="text-muted-foreground">Ad Set:</span> <span className="font-mono text-[10px]">{launchResult.adsetId}</span></div>
                <div><span className="text-muted-foreground">Creative:</span> <span className="font-mono text-[10px]">{launchResult.creativeId}</span></div>
                <div><span className="text-muted-foreground">Ad:</span> <span className="font-mono text-[10px]">{launchResult.adId}</span></div>
              </div>
            )}

            {!launchResult.success && launchResult.error && (
              <div className={`${glassInner} border-red-200/60 dark:border-red-500/20 p-3 space-y-2`}>
                <p className="text-xs font-semibold text-red-600">
                  Failed at: {STAGE_LABELS[launchResult.errorStage || ""] || launchResult.errorStage}
                </p>
                <p className="text-xs">{launchResult.error}</p>
                {launchResult.rawError && (
                  <Collapsible open={showRawError} onOpenChange={setShowRawError}>
                    <CollapsibleTrigger asChild>
                      <Button variant="ghost" size="sm" className="gap-1 text-[10px] h-6" data-testid="button-show-raw-error">
                        <ChevronDown className={`h-3 w-3 transition-transform duration-200 ${showRawError ? "rotate-180" : ""}`} />
                        Raw Meta Error
                      </Button>
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <pre className="mt-2 p-2 bg-black/[0.03] dark:bg-white/[0.03] text-[10px] rounded-lg overflow-x-auto max-h-48 font-mono">
                        {JSON.stringify(launchResult.rawError, null, 2)}
                      </pre>
                    </CollapsibleContent>
                  </Collapsible>
                )}
              </div>
            )}
          </div>
        </div>
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
  const [historyOpen, setHistoryOpen] = useState(false);

  if (jobs.length === 0) return null;

  return (
    <Collapsible open={historyOpen} onOpenChange={setHistoryOpen}>
      <div className={glassCard} data-testid="section-launch-history">
        <CollapsibleTrigger asChild>
          <div className="px-5 py-3.5 cursor-pointer hover:bg-white/40 dark:hover:bg-white/[0.03] transition-all rounded-2xl">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-gray-100 dark:bg-white/[0.06] flex items-center justify-center">
                <History className="h-3.5 w-3.5 text-gray-600 dark:text-gray-400" />
              </div>
              <h2 className="text-sm font-semibold flex-1">Launch History</h2>
              <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-gray-100 dark:bg-white/[0.06] text-muted-foreground">
                {jobs.length}
              </span>
              <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform duration-200 ${historyOpen ? "rotate-180" : ""}`} />
            </div>
          </div>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="px-5 pb-4 space-y-1.5">
            {jobs.slice(0, 20).map((job: LaunchJob) => (
              <Collapsible key={job.id} open={expandedJob === job.id} onOpenChange={open => setExpandedJob(open ? job.id : null)}>
                <CollapsibleTrigger asChild>
                  <div className={`flex items-center gap-2 text-xs p-2.5 rounded-xl cursor-pointer transition-all ${glassInner} hover:bg-white/60 dark:hover:bg-white/[0.06]`} data-testid={`job-row-${job.id}`}>
                    <StatusIcon status={job.status === "launched" || job.status === "validated" || job.status === "draft" ? "success" : job.status === "failed" ? "fail" : "running"} />
                    <span className="font-medium flex-1 truncate">{job.campaignName}</span>
                    <span className={`text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-md bg-black/[0.04] dark:bg-white/[0.06]`}>
                      {job.mode || job.launchType}
                    </span>
                    <span className={`text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-md ${
                      job.status === "launched" ? "bg-emerald-100 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400" :
                      job.status === "failed" ? "bg-red-100 dark:bg-red-500/10 text-red-700 dark:text-red-400" :
                      "bg-gray-100 dark:bg-white/[0.06] text-muted-foreground"
                    }`}>
                      {job.status}
                    </span>
                    <span className="text-[10px] text-muted-foreground">
                      {job.createdAt ? new Date(job.createdAt).toLocaleDateString("en-PK") : ""}
                    </span>
                    <ChevronDown className={`h-3 w-3 text-muted-foreground transition-transform duration-200 ${expandedJob === job.id ? "rotate-180" : ""}`} />
                  </div>
                </CollapsibleTrigger>
                <CollapsibleContent className={`${glassInner} p-3 mt-1 text-xs space-y-1.5`}>
                  {job.metaCampaignId && <p><span className="text-muted-foreground">Campaign:</span> <span className="font-mono text-[10px]">{job.metaCampaignId}</span></p>}
                  {job.metaAdsetId && <p><span className="text-muted-foreground">Ad Set:</span> <span className="font-mono text-[10px]">{job.metaAdsetId}</span></p>}
                  {job.metaCreativeId && <p><span className="text-muted-foreground">Creative:</span> <span className="font-mono text-[10px]">{job.metaCreativeId}</span></p>}
                  {job.metaAdId && <p><span className="text-muted-foreground">Ad:</span> <span className="font-mono text-[10px]">{job.metaAdId}</span></p>}
                  {job.errorMessage && <p className="text-red-500"><span className="text-muted-foreground">Error:</span> {job.errorMessage}</p>}
                  {job.currentStage && <p><span className="text-muted-foreground">Last Stage:</span> {job.currentStage}</p>}
                </CollapsibleContent>
              </Collapsible>
            ))}
          </div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
}
