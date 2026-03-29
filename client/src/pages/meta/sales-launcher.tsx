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
  Zap, Globe, Target, DollarSign, MapPin, X, Plus, Trash2, Copy, Layers, ChevronRight,
} from "lucide-react";

type CreativeMode = "UPLOAD_IMAGE" | "UPLOAD_VIDEO" | "EXISTING_POST";
type PublishMode = "VALIDATE" | "DRAFT" | "PUBLISH";
type PostSourceFilter = "all" | "facebook" | "instagram" | "library";

interface MetaPage { id: string; name: string; }
interface MetaPixel { id: string; name: string; }
interface MetaIgAccount { id: string; name?: string; username?: string; profile_picture_url?: string; pageName?: string; }
interface MetaPost { id: string; message?: string; fullPicture?: string; createdTime?: string; type?: string; likes?: number; comments?: number; shares?: number; source?: string; permalinkUrl?: string; }

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

interface CreatedEntitySummary {
  adsetId: string;
  ads: { creativeId: string; adId: string }[];
}

interface LaunchResult {
  success: boolean;
  jobId: string;
  stages: LaunchStage[];
  campaignId?: string;
  adsetId?: string;
  creativeId?: string;
  adId?: string;
  createdEntities?: CreatedEntitySummary[];
  validationIssues?: ValidationIssue[];
  error?: string;
  errorStage?: string;
  rawError?: Record<string, unknown>;
}

interface AdConfig {
  id: string;
  mode: CreativeMode;
  imageUrl: string;
  imageHash: string;
  imagePreview: string;
  imageUploading: boolean;
  videoUrl: string;
  videoId: string;
  videoStatus: string;
  videoUploading: boolean;
  selectedPostId: string;
  selectedPostSource: "facebook" | "instagram";
  selectedPostPreview: MetaPost | null;
  primaryText: string;
  headline: string;
  description: string;
  cta: string;
  destinationUrl: string;
}

interface AdSetConfig {
  id: string;
  targetCountries: string[];
  targetCities: { key: string; name: string }[];
  dailyBudget: string;
  ads: AdConfig[];
  isExpanded: boolean;
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

function getStageName(stage: string): string {
  if (STAGE_LABELS[stage]) return STAGE_LABELS[stage];
  if (stage.startsWith("adset_")) return `Creating Ad Set ${parseInt(stage.split("_")[1]) + 1}`;
  if (stage.startsWith("creative_")) {
    const parts = stage.split("_");
    return `Creative (Set ${parseInt(parts[1]) + 1}, Ad ${parseInt(parts[2]) + 1})`;
  }
  if (stage.startsWith("ad_")) {
    const parts = stage.split("_");
    if (parts.length === 3) return `Ad (Set ${parseInt(parts[1]) + 1}, Ad ${parseInt(parts[2]) + 1})`;
  }
  if (stage.startsWith("publish_adset_")) return `Publishing Ad Set ${parseInt(stage.split("_")[2]) + 1}`;
  if (stage.startsWith("publish_ad_")) {
    const parts = stage.split("_");
    if (parts.length === 4) return `Publishing Ad (Set ${parseInt(parts[2]) + 1}, Ad ${parseInt(parts[3]) + 1})`;
  }
  return stage;
}

function getDefaultBudget(currency: string): string {
  return currency === "PKR" ? "2800" : "10";
}

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

function createDefaultAd(): AdConfig {
  return {
    id: uid(),
    mode: "UPLOAD_IMAGE",
    imageUrl: "", imageHash: "", imagePreview: "", imageUploading: false,
    videoUrl: "", videoId: "", videoStatus: "", videoUploading: false,
    selectedPostId: "", selectedPostSource: "facebook", selectedPostPreview: null,
    primaryText: "", headline: "", description: "", cta: "SHOP_NOW", destinationUrl: "",
  };
}

function createDefaultAdSet(currency: string): AdSetConfig {
  return {
    id: uid(),
    targetCountries: ["PK"],
    targetCities: [],
    dailyBudget: getDefaultBudget(currency),
    ads: [createDefaultAd()],
    isExpanded: true,
  };
}

export default function SalesLauncher() {
  const { toast } = useToast();

  const [adName, setAdName] = useState("");
  const [dailyBudget, setDailyBudget] = useState("10");
  const [budgetLevel, setBudgetLevel] = useState<"CBO" | "ABO">("CBO");
  const [publishMode, setPublishMode] = useState<PublishMode>("VALIDATE");
  const [startMode, setStartMode] = useState<"NOW" | "SCHEDULED">("NOW");
  const [startTime, setStartTime] = useState("");
  const [accountCurrency, setAccountCurrency] = useState("USD");
  const [budgetInitialized, setBudgetInitialized] = useState(false);

  const [adSets, setAdSets] = useState<AdSetConfig[]>([createDefaultAdSet("USD")]);

  const [diagnosticsResult, setDiagnosticsResult] = useState<{ passed: boolean; checks: DiagnosticCheck[]; adAccountCurrency?: string } | null>(null);
  const [launchResult, setLaunchResult] = useState<LaunchResult | null>(null);
  const [launchStages, setLaunchStages] = useState<LaunchStage[]>([]);
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [showRawError, setShowRawError] = useState(false);

  const [postSearch, setPostSearch] = useState("");
  const [postSourceFilter, setPostSourceFilter] = useState<PostSourceFilter>("all");
  const [countrySearch, setCountrySearch] = useState("");
  const [citySearch, setCitySearch] = useState("");

  const metaStatusQuery = useQuery<{ connected: boolean; adAccountId?: string; adAccountCurrency?: string; businessName?: string }>({ queryKey: ["/api/meta/oauth/status"] });
  const metaStatus = metaStatusQuery.data;
  const isConnected = metaStatus?.connected === true;

  const pagesQuery = useQuery<{ pages: MetaPage[] }>({ queryKey: ["/api/meta/pages"], enabled: isConnected });
  const pages = pagesQuery.data?.pages || [];
  const [selectedPageId, setSelectedPageId] = useState("");

  const pixelsQuery = useQuery<{ pixels: MetaPixel[] }>({ queryKey: ["/api/meta/pixels"], enabled: isConnected });
  const pixels = pixelsQuery.data?.pixels || [];
  const [selectedPixelId, setSelectedPixelId] = useState("");

  const igAccountsQuery = useQuery<{ instagramAccounts: MetaIgAccount[] }>({ queryKey: ["/api/meta/instagram-accounts"], enabled: isConnected });
  const igAccounts: MetaIgAccount[] = igAccountsQuery.data?.instagramAccounts || [];
  const [selectedIgAccountId, setSelectedIgAccountId] = useState("");

  useEffect(() => { if (pages.length > 0 && !selectedPageId) setSelectedPageId(pages[0].id); }, [pages, selectedPageId]);
  useEffect(() => { if (pixels.length > 0 && !selectedPixelId) setSelectedPixelId(pixels[0].id); }, [pixels, selectedPixelId]);
  useEffect(() => { if (igAccounts.length > 0 && !selectedIgAccountId) setSelectedIgAccountId(igAccounts[0].id); }, [igAccounts, selectedIgAccountId]);

  const anyAdUsesExistingPost = adSets.some(s => s.ads.some(a => a.mode === "EXISTING_POST"));

  const fbPostSearchParams = new URLSearchParams();
  if (postSearch) fbPostSearchParams.set("search", postSearch);
  fbPostSearchParams.set("includeVideos", "true");
  const fbPostsQuery = useQuery<{ posts: MetaPost[] }>({
    queryKey: [`/api/meta/page-posts?${fbPostSearchParams.toString()}`],
    enabled: isConnected && anyAdUsesExistingPost,
  });
  const igQueryParams = new URLSearchParams();
  if (postSearch) igQueryParams.set("search", postSearch);
  if (selectedIgAccountId && selectedIgAccountId !== "none") igQueryParams.set("igAccountId", selectedIgAccountId);
  const igQueryString = igQueryParams.toString() ? `?${igQueryParams.toString()}` : "";
  const igPostsQuery = useQuery<{ posts: MetaPost[] }>({
    queryKey: [`/api/meta/ig-media${igQueryString}`],
    enabled: isConnected && anyAdUsesExistingPost && !!selectedIgAccountId && selectedIgAccountId !== "none",
  });
  const adImagesQuery = useQuery<{ images: { hash: string; name?: string; url?: string; createdTime?: string }[] }>({
    queryKey: ["/api/meta/ad-account-images"],
    enabled: isConnected && anyAdUsesExistingPost,
  });
  const adVideosQuery = useQuery<{ videos: { id: string; title?: string; picture?: string; createdTime?: string }[] }>({
    queryKey: ["/api/meta/ad-account-videos"],
    enabled: isConnected && anyAdUsesExistingPost,
  });
  const fbPosts: MetaPost[] = fbPostsQuery.data?.posts || [];
  const igPosts: MetaPost[] = igPostsQuery.data?.posts || [];
  const libraryImages: MetaPost[] = (adImagesQuery.data?.images || []).map((img) => ({
    id: `lib_img_${img.hash}`, message: img.name || "Ad Image", fullPicture: img.url || "",
    createdTime: img.createdTime, type: "image", source: "library",
  }));
  const libraryVideos: MetaPost[] = (adVideosQuery.data?.videos || []).map((v) => ({
    id: `lib_vid_${v.id}`, message: v.title || "Ad Video", fullPicture: v.picture || "",
    createdTime: v.createdTime, type: "video", source: "library",
  }));
  const allPosts: MetaPost[] = [...fbPosts, ...igPosts, ...libraryImages, ...libraryVideos].sort((a, b) => {
    const ta = a.createdTime ? new Date(a.createdTime).getTime() : 0;
    const tb = b.createdTime ? new Date(b.createdTime).getTime() : 0;
    return tb - ta;
  });
  const posts: MetaPost[] = postSourceFilter === "all" ? allPosts : allPosts.filter(p => p.source === postSourceFilter);
  const postsLoading = fbPostsQuery.isLoading || igPostsQuery.isLoading || adImagesQuery.isLoading || adVideosQuery.isLoading;
  const sourceCount = {
    all: allPosts.length,
    facebook: allPosts.filter(p => p.source === "facebook").length,
    instagram: allPosts.filter(p => p.source === "instagram").length,
    library: allPosts.filter(p => p.source === "library").length,
  };

  const updateAdSet = (idx: number, updates: Partial<AdSetConfig>) => {
    setAdSets(prev => prev.map((s, i) => i === idx ? { ...s, ...updates } : s));
  };

  const updateAd = (adSetIdx: number, adIdx: number, updates: Partial<AdConfig>) => {
    setAdSets(prev => prev.map((s, si) =>
      si === adSetIdx
        ? { ...s, ads: s.ads.map((a, ai) => ai === adIdx ? { ...a, ...updates } : a) }
        : s
    ));
  };

  const addAdSet = () => {
    if (adSets.length >= 10) return;
    setAdSets(prev => {
      const newSets = prev.map(s => ({ ...s, isExpanded: false }));
      return [...newSets, createDefaultAdSet(accountCurrency)];
    });
  };

  const removeAdSet = (idx: number) => {
    if (adSets.length <= 1) return;
    setAdSets(prev => prev.filter((_, i) => i !== idx));
  };

  const duplicateAdSet = (idx: number) => {
    if (adSets.length >= 10) return;
    setAdSets(prev => {
      const source = prev[idx];
      const dup: AdSetConfig = {
        ...JSON.parse(JSON.stringify(source)),
        id: uid(),
        isExpanded: true,
        ads: source.ads.map(a => ({ ...JSON.parse(JSON.stringify(a)), id: uid(), imageUploading: false, videoUploading: false })),
      };
      const next = prev.map(s => ({ ...s, isExpanded: false }));
      next.splice(idx + 1, 0, dup);
      return next;
    });
  };

  const addAd = (adSetIdx: number) => {
    const adSet = adSets[adSetIdx];
    if (adSet.ads.length >= 10) return;
    updateAdSet(adSetIdx, { ads: [...adSet.ads, createDefaultAd()] });
  };

  const removeAd = (adSetIdx: number, adIdx: number) => {
    const adSet = adSets[adSetIdx];
    if (adSet.ads.length <= 1) return;
    updateAdSet(adSetIdx, { ads: adSet.ads.filter((_, i) => i !== adIdx) });
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
          const defaultBudget = getDefaultBudget(data.adAccountCurrency);
          setDailyBudget(defaultBudget);
          setAdSets(prev => prev.map(s => ({ ...s, dailyBudget: defaultBudget })));
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

  const handleUploadImage = async (adSetIdx: number, adIdx: number, payload: { type: "url"; url: string } | { type: "file"; base64: string; filename: string }) => {
    updateAd(adSetIdx, adIdx, { imageUploading: true });
    try {
      const body = payload.type === "url" ? { imageUrl: payload.url } : { imageBase64: payload.base64, filename: payload.filename };
      const res = await apiRequest("POST", "/api/meta/sales/upload-image", body);
      const data = await res.json();
      updateAd(adSetIdx, adIdx, { imageHash: data.imageHash, imageUploading: false });
      if (data.imageUrl) updateAd(adSetIdx, adIdx, { imagePreview: data.imageUrl });
      toast({ title: "Image uploaded to Meta" });
    } catch (err: unknown) {
      updateAd(adSetIdx, adIdx, { imageUploading: false });
      toast({ title: "Image upload failed", description: err instanceof Error ? err.message : String(err), variant: "destructive" });
    }
  };

  const handleUploadVideo = async (adSetIdx: number, adIdx: number, payload: { type: "url"; url: string } | { type: "file"; base64: string; filename: string }) => {
    updateAd(adSetIdx, adIdx, { videoUploading: true });
    try {
      const body = payload.type === "url" ? { videoUrl: payload.url } : { videoBase64: payload.base64, filename: payload.filename };
      const res = await apiRequest("POST", "/api/meta/sales/upload-video", body);
      const data = await res.json();
      updateAd(adSetIdx, adIdx, { videoId: data.videoId, videoStatus: "processing", videoUploading: false });
      toast({ title: "Video uploaded, processing..." });
      pollVideoStatus(adSetIdx, adIdx, data.videoId);
    } catch (err: unknown) {
      updateAd(adSetIdx, adIdx, { videoUploading: false });
      toast({ title: "Video upload failed", description: err instanceof Error ? err.message : String(err), variant: "destructive" });
    }
  };

  async function pollVideoStatus(adSetIdx: number, adIdx: number, vid: string) {
    for (let i = 0; i < 30; i++) {
      await new Promise(r => setTimeout(r, 5000));
      try {
        const res = await fetch(`/api/meta/sales/video-status/${vid}`, { credentials: "include" });
        const data = await res.json();
        if (data.ready) {
          updateAd(adSetIdx, adIdx, { videoStatus: "ready" });
          toast({ title: "Video is ready for launch" });
          return;
        }
        updateAd(adSetIdx, adIdx, { videoStatus: data.status || "processing" });
      } catch { break; }
    }
    updateAd(adSetIdx, adIdx, { videoStatus: "timeout" });
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
        const resultJson = job.resultJson as { stages?: LaunchStage[]; createdEntities?: CreatedEntitySummary[] } | null;
        const stages = resultJson?.stages || [];
        setLaunchStages(stages);
        if (TERMINAL_STATUSES.includes(job.status)) {
          const lastStage = stages[stages.length - 1];
          const success = job.status === "launched" || job.status === "draft" || job.status === "validated";
          setLaunchResult({
            success,
            jobId: job.id,
            stages,
            campaignId: job.metaCampaignId || undefined,
            adsetId: job.metaAdsetId || undefined,
            creativeId: job.metaCreativeId || undefined,
            adId: job.metaAdId || undefined,
            createdEntities: resultJson?.createdEntities || undefined,
            error: job.errorMessage || undefined,
            errorStage: !success ? lastStage?.stage : undefined,
          });
          setActiveJobId(null);
          queryClient.invalidateQueries({ queryKey: ["/api/meta/sales/launch-jobs"] });
          if (success) {
            toast({ title: job.status === "validated" ? "Validation passed!" : "Ad launched successfully!" });
          } else {
            toast({ title: `Failed at: ${getStageName(lastStage?.stage || "")}`, description: job.errorMessage, variant: "destructive" });
          }
          return;
        }
      } catch { break; }
      await new Promise(resolve => setTimeout(resolve, pollInterval));
    }
    setActiveJobId(null);
    toast({ title: "Launch timed out", description: "The launch is still running in the background.", variant: "destructive" });
  };

  const launchMutation = useMutation({
    mutationFn: async () => {
      const body: Record<string, unknown> = {
        adName,
        adAccountId: metaStatus?.adAccountId || "",
        pageId: selectedPageId,
        pixelId: selectedPixelId && selectedPixelId !== "none" ? selectedPixelId : null,
        dailyBudget: parseFloat(dailyBudget) || 500,
        currency: accountCurrency,
        budgetLevel,
        startMode,
        startTime: startMode === "SCHEDULED" ? startTime : null,
        publishMode,
        instagramActorId: selectedIgAccountId && selectedIgAccountId !== "none" ? selectedIgAccountId : undefined,
        adSets: adSets.map(adSet => ({
          targetCountries: adSet.targetCountries.length > 0 ? adSet.targetCountries : ["PK"],
          targetCities: adSet.targetCities.length > 0 ? adSet.targetCities : undefined,
          dailyBudget: budgetLevel === "ABO" ? parseFloat(adSet.dailyBudget) || 500 : undefined,
          ads: adSet.ads.map(ad => ({
            mode: ad.mode,
            imageHash: ad.mode === "UPLOAD_IMAGE" ? ad.imageHash : undefined,
            imageUrl: ad.mode === "UPLOAD_IMAGE" ? ad.imageUrl : undefined,
            videoId: ad.mode === "UPLOAD_VIDEO" ? ad.videoId : undefined,
            videoUrl: ad.mode === "UPLOAD_VIDEO" ? ad.videoUrl : undefined,
            existingPostId: ad.mode === "EXISTING_POST" ? ad.selectedPostId : undefined,
            existingPostSource: ad.mode === "EXISTING_POST" ? ad.selectedPostSource : undefined,
            destinationUrl: ad.destinationUrl,
            primaryText: ad.mode !== "EXISTING_POST" ? ad.primaryText : undefined,
            headline: ad.mode !== "EXISTING_POST" ? ad.headline : undefined,
            description: ad.mode !== "EXISTING_POST" ? ad.description : undefined,
            cta: ad.mode !== "EXISTING_POST" ? ad.cta : undefined,
          })),
        })),
      };
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

  const diagnosticsPassed = diagnosticsResult?.passed === true;
  const totalAds = adSets.reduce((sum, s) => sum + s.ads.length, 0);

  const campaignChecks = [
    { label: "Meta connected", ok: isConnected },
    { label: "Ad account selected", ok: !!metaStatus?.adAccountId },
    { label: "Page selected", ok: !!selectedPageId },
    { label: "Diagnostics passed", ok: diagnosticsPassed },
    { label: "Campaign name", ok: !!adName.trim() },
    ...(budgetLevel === "CBO" ? [{ label: "CBO budget valid", ok: parseFloat(dailyBudget) >= 1 }] : []),
  ];

  const adSetAdChecks = adSets.flatMap((adSet, si) => {
    const setChecks = [
      { label: `Set ${si + 1}: has targeting`, ok: adSet.targetCountries.length > 0 },
      ...(budgetLevel === "ABO" ? [{ label: `Set ${si + 1}: budget valid`, ok: parseFloat(adSet.dailyBudget) >= 1 }] : []),
    ];
    const adChecks = adSet.ads.flatMap((ad, ai) => {
      const isPost = ad.mode === "EXISTING_POST";
      const prefix = adSets.length > 1 || adSet.ads.length > 1 ? `S${si + 1}A${ai + 1}` : "";
      return [
        { label: `${prefix} Destination URL`.trim(), ok: !!ad.destinationUrl.trim() },
        ...(isPost ? [{ label: `${prefix} Post selected`.trim(), ok: !!ad.selectedPostId }] : []),
        ...(!isPost ? [{ label: `${prefix} Primary text`.trim(), ok: !!ad.primaryText.trim() }] : []),
        ...(ad.mode === "UPLOAD_IMAGE" && !isPost ? [{ label: `${prefix} Image uploaded`.trim(), ok: !!ad.imageHash }] : []),
        ...(ad.mode === "UPLOAD_VIDEO" && !isPost ? [{ label: `${prefix} Video ready`.trim(), ok: ad.videoStatus === "ready" }] : []),
      ];
    });
    return [...setChecks, ...adChecks];
  });

  const validationChecklist = [...campaignChecks, ...adSetAdChecks];
  const allValid = validationChecklist.every(c => c.ok);
  const validCount = validationChecklist.filter(c => c.ok).length;

  if (!isConnected) {
    return (
      <div className="p-4 md:p-6 max-w-[880px] mx-auto space-y-6" data-testid="sales-launcher-page">
        <h1 className="text-2xl font-semibold tracking-tight" data-testid="text-page-title">Sales Launcher</h1>
        <div className={`${glassCard} p-8 text-center space-y-4`}>
          <div className="w-16 h-16 rounded-2xl bg-amber-500/10 flex items-center justify-center mx-auto">
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
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight" data-testid="text-page-title">Sales Launcher</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Launch SALES campaigns with geo-targeted audiences</p>
        </div>
        <div className="flex items-center gap-2">
          {totalAds > 1 && (
            <span className="text-xs text-muted-foreground">{adSets.length} ad set{adSets.length > 1 ? "s" : ""} · {totalAds} ad{totalAds > 1 ? "s" : ""}</span>
          )}
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/20">
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-xs font-medium text-emerald-400">{metaStatus?.businessName || "Connected"}</span>
          </div>
        </div>
      </div>

      {/* SECTION A: Connection & Diagnostics */}
      <div className={glassCard} data-testid="section-diagnostics">
        <div className="px-5 pt-4 pb-3">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-blue-500/10 flex items-center justify-center">
              <Globe className="h-3.5 w-3.5 text-blue-400" />
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

      {/* Campaign Settings */}
      <div className={glassCard} data-testid="section-campaign">
        <div className="px-5 pt-4 pb-3">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-violet-500/10 flex items-center justify-center">
              <Target className="h-3.5 w-3.5 text-violet-400" />
            </div>
            <div>
              <h2 className="text-sm font-semibold">Campaign Settings</h2>
              <p className="text-xs text-muted-foreground">SALES objective · Automatic placements</p>
            </div>
          </div>
        </div>
        <div className="px-5 pb-5 space-y-4">
          <div>
            <Label htmlFor="adName" className="text-xs font-medium">Campaign Name</Label>
            <Input
              id="adName"
              value={adName}
              onChange={e => setAdName(e.target.value)}
              placeholder="e.g. Summer Sale Campaign"
              className="mt-1 bg-white/50 dark:bg-white/[0.06] border-black/[0.08] dark:border-white/[0.08] focus:ring-2 focus:ring-blue-500/20 transition-all"
              data-testid="input-ad-name"
            />
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div>
              <Label className="text-xs font-medium">Budget Optimization</Label>
              <Select value={budgetLevel} onValueChange={v => setBudgetLevel(v as "CBO" | "ABO")}>
                <SelectTrigger className="mt-1 bg-white/50 dark:bg-white/[0.06] border-black/[0.08] dark:border-white/[0.08]" data-testid="select-budget-level">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="CBO">CBO (Campaign)</SelectItem>
                  <SelectItem value="ABO">ABO (Ad Set)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {budgetLevel === "CBO" && (
              <div>
                <Label htmlFor="dailyBudget" className="text-xs font-medium flex items-center gap-1">
                  <DollarSign className="h-3 w-3" /> Daily Budget ({accountCurrency})
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
            )}
            <div>
              <Label className="text-xs font-medium">Publish Mode</Label>
              <Select value={publishMode} onValueChange={v => setPublishMode(v as PublishMode)}>
                <SelectTrigger className="mt-1 bg-white/50 dark:bg-white/[0.06] border-black/[0.08] dark:border-white/[0.08]" data-testid="select-publish-mode">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="VALIDATE">Validate Only</SelectItem>
                  <SelectItem value="DRAFT">Create as Draft</SelectItem>
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
                <Input type="datetime-local" value={startTime} onChange={e => setStartTime(e.target.value)} className="mt-2 bg-white/50 dark:bg-white/[0.06] border-black/[0.08] dark:border-white/[0.08]" data-testid="input-start-time" />
              )}
            </div>
          </div>
          <p className="text-[10px] text-muted-foreground">
            {budgetLevel === "CBO"
              ? "Meta distributes your budget across ad sets automatically"
              : "You control the budget for each ad set individually"}
          </p>
        </div>
      </div>

      {/* Ad Sets Section */}
      <div className="space-y-3" data-testid="section-adsets">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-indigo-500/10 flex items-center justify-center">
              <Layers className="h-3.5 w-3.5 text-indigo-400" />
            </div>
            <h2 className="text-sm font-semibold">Ad Sets & Ads</h2>
            <Badge variant="secondary" className="text-[10px]">{adSets.length} set{adSets.length > 1 ? "s" : ""} · {totalAds} ad{totalAds > 1 ? "s" : ""}</Badge>
          </div>
          <Button size="sm" variant="outline" onClick={addAdSet} disabled={adSets.length >= 10}
            className="h-7 text-xs gap-1 bg-white/50 dark:bg-white/[0.06] border-black/[0.08] dark:border-white/[0.08]"
            data-testid="button-add-adset"
          >
            <Plus className="h-3 w-3" /> Add Ad Set
          </Button>
        </div>

        {adSets.map((adSet, si) => (
          <div key={adSet.id} className={glassCard} data-testid={`adset-panel-${si}`}>
            <div
              className="px-5 py-3 flex items-center gap-2 cursor-pointer hover:bg-white/40 dark:hover:bg-white/[0.03] transition-all rounded-t-2xl"
              onClick={() => updateAdSet(si, { isExpanded: !adSet.isExpanded })}
            >
              <ChevronRight className={`h-3.5 w-3.5 text-muted-foreground transition-transform duration-200 ${adSet.isExpanded ? "rotate-90" : ""}`} />
              <span className="text-sm font-semibold flex-1">Ad Set {si + 1}</span>
              <span className="text-[10px] text-muted-foreground">
                {adSet.ads.length} ad{adSet.ads.length > 1 ? "s" : ""} · {adSet.targetCountries.map(c => ASIAN_COUNTRIES.find(a => a.code === c)?.name || c).join(", ")}
              </span>
              <div className="flex items-center gap-1 ml-2" onClick={e => e.stopPropagation()}>
                <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={() => duplicateAdSet(si)} disabled={adSets.length >= 10} data-testid={`button-duplicate-adset-${si}`}>
                  <Copy className="h-3 w-3" />
                </Button>
                {adSets.length > 1 && (
                  <Button size="sm" variant="ghost" className="h-6 w-6 p-0 text-red-500 hover:text-red-600" onClick={() => removeAdSet(si)} data-testid={`button-remove-adset-${si}`}>
                    <Trash2 className="h-3 w-3" />
                  </Button>
                )}
              </div>
            </div>

            {adSet.isExpanded && (
              <div className="px-5 pb-5 space-y-4 border-t border-black/[0.04] dark:border-white/[0.06] pt-4">
                {/* Geo Targeting */}
                <div className={`${glassInner} p-4 space-y-3`}>
                  <div className="flex items-center gap-1.5">
                    <MapPin className="h-3.5 w-3.5 text-orange-500" />
                    <span className="text-xs font-semibold">Geo Targeting</span>
                  </div>
                  <div>
                    <Label className="text-[10px] font-medium text-muted-foreground">Countries</Label>
                    <div className="flex flex-wrap gap-1 mt-1 mb-1.5">
                      {adSet.targetCountries.map(code => {
                        const c = ASIAN_COUNTRIES.find(a => a.code === code);
                        return (
                          <span key={code} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-blue-500/10 text-blue-400 text-[10px] font-medium" data-testid={`country-tag-${si}-${code}`}>
                            {c?.name || code}
                            <button onClick={() => updateAdSet(si, { targetCountries: adSet.targetCountries.filter(cc => cc !== code) })} className="hover:text-red-500"><X className="h-2.5 w-2.5" /></button>
                          </span>
                        );
                      })}
                    </div>
                    <div className="relative">
                      <Input placeholder="Search countries..." value={countrySearch} onChange={e => setCountrySearch(e.target.value)}
                        className="h-7 text-[10px] bg-white/50 dark:bg-white/[0.06] border-black/[0.08] dark:border-white/[0.08]" data-testid={`input-country-search-${si}`} />
                      {countrySearch.trim() && (
                        <div className={`absolute top-full left-0 right-0 mt-1 z-20 ${glassCard} max-h-32 overflow-y-auto py-1 shadow-lg`}>
                          {ASIAN_COUNTRIES
                            .filter(c => !adSet.targetCountries.includes(c.code) && c.name.toLowerCase().includes(countrySearch.toLowerCase()))
                            .map(c => (
                              <button key={c.code} className="w-full text-left px-3 py-1 text-[10px] hover:bg-blue-50 dark:hover:bg-blue-500/10"
                                onClick={() => { updateAdSet(si, { targetCountries: [...adSet.targetCountries, c.code] }); setCountrySearch(""); }}
                                data-testid={`add-country-${si}-${c.code}`}
                              >{c.name} ({c.code})</button>
                            ))}
                        </div>
                      )}
                    </div>
                  </div>
                  {adSet.targetCountries.includes("PK") && (
                    <div>
                      <Label className="text-[10px] font-medium text-muted-foreground">Pakistan Cities <span className="font-normal">(optional)</span></Label>
                      <div className="flex flex-wrap gap-1 mt-1 mb-1.5">
                        {adSet.targetCities.map(city => (
                          <span key={city.key} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-orange-500/10 text-orange-400 text-[10px] font-medium" data-testid={`city-tag-${si}-${city.key}`}>
                            {city.name}
                            <button onClick={() => updateAdSet(si, { targetCities: adSet.targetCities.filter(c => c.key !== city.key) })} className="hover:text-red-500"><X className="h-2.5 w-2.5" /></button>
                          </span>
                        ))}
                      </div>
                      <div className="relative">
                        <Input placeholder="Search cities..." value={citySearch} onChange={e => setCitySearch(e.target.value)}
                          className="h-7 text-[10px] bg-white/50 dark:bg-white/[0.06] border-black/[0.08] dark:border-white/[0.08]" data-testid={`input-city-search-${si}`} />
                        {citySearch.trim() && (
                          <div className={`absolute top-full left-0 right-0 mt-1 z-20 ${glassCard} max-h-32 overflow-y-auto py-1 shadow-lg`}>
                            {PAKISTAN_CITIES
                              .filter(c => !adSet.targetCities.some(tc => tc.key === c.key) && c.name.toLowerCase().includes(citySearch.toLowerCase()))
                              .map(c => (
                                <button key={c.key} className="w-full text-left px-3 py-1 text-[10px] hover:bg-orange-50 dark:hover:bg-orange-500/10"
                                  onClick={() => { updateAdSet(si, { targetCities: [...adSet.targetCities, c] }); setCitySearch(""); }}
                                  data-testid={`add-city-${si}-${c.key}`}
                                >{c.name}</button>
                              ))}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                {/* ABO Budget */}
                {budgetLevel === "ABO" && (
                  <div className="flex items-center gap-3">
                    <Label className="text-xs font-medium flex items-center gap-1 shrink-0">
                      <DollarSign className="h-3 w-3" /> Ad Set Budget ({accountCurrency})
                    </Label>
                    <Input type="number" value={adSet.dailyBudget} onChange={e => updateAdSet(si, { dailyBudget: e.target.value })}
                      min="1" className="w-32 h-8 text-xs bg-white/50 dark:bg-white/[0.06] border-black/[0.08] dark:border-white/[0.08]"
                      data-testid={`input-adset-budget-${si}`} />
                  </div>
                )}

                {/* Ads within this ad set */}
                <div className="space-y-3">
                  {adSet.ads.map((ad, ai) => (
                    <div key={ad.id} className={`${glassInner} p-4 space-y-3`} data-testid={`ad-panel-${si}-${ai}`}>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0">Ad {ai + 1}</Badge>
                        <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                          {ad.mode === "UPLOAD_IMAGE" ? "Image" : ad.mode === "UPLOAD_VIDEO" ? "Video" : "Post"}
                        </Badge>
                        <div className="flex-1" />
                        {adSet.ads.length > 1 && (
                          <Button size="sm" variant="ghost" className="h-5 w-5 p-0 text-red-500 hover:text-red-600" onClick={() => removeAd(si, ai)} data-testid={`button-remove-ad-${si}-${ai}`}>
                            <X className="h-3 w-3" />
                          </Button>
                        )}
                      </div>

                      {/* Creative Source Tabs */}
                      <Tabs value={ad.mode} onValueChange={v => updateAd(si, ai, { mode: v as CreativeMode })}>
                        <TabsList className="grid w-full grid-cols-3 bg-black/[0.04] dark:bg-white/[0.06] p-0.5 rounded-xl">
                          <TabsTrigger value="UPLOAD_IMAGE" data-testid={`tab-upload-image-${si}-${ai}`} className="gap-1 text-[10px] rounded-[10px] data-[state=active]:bg-white dark:data-[state=active]:bg-white/[0.12] data-[state=active]:shadow-sm">
                            <Image className="h-3 w-3" /> Image
                          </TabsTrigger>
                          <TabsTrigger value="UPLOAD_VIDEO" data-testid={`tab-upload-video-${si}-${ai}`} className="gap-1 text-[10px] rounded-[10px] data-[state=active]:bg-white dark:data-[state=active]:bg-white/[0.12] data-[state=active]:shadow-sm">
                            <Video className="h-3 w-3" /> Video
                          </TabsTrigger>
                          <TabsTrigger value="EXISTING_POST" data-testid={`tab-existing-post-${si}-${ai}`} className="gap-1 text-[10px] rounded-[10px] data-[state=active]:bg-white dark:data-[state=active]:bg-white/[0.12] data-[state=active]:shadow-sm">
                            <FileText className="h-3 w-3" /> Post
                          </TabsTrigger>
                        </TabsList>

                        <TabsContent value="UPLOAD_IMAGE" className="space-y-2 mt-2">
                          <div
                            className="p-4 text-center cursor-pointer rounded-lg border border-dashed border-black/10 dark:border-white/10 hover:bg-white/60 dark:hover:bg-white/[0.06] transition-all"
                            onClick={() => document.getElementById(`imageFileInput_${ad.id}`)?.click()}
                            data-testid={`dropzone-image-${si}-${ai}`}
                          >
                            <Upload className="h-4 w-4 text-blue-500 mx-auto mb-1" />
                            <p className="text-[10px] font-medium">Click to upload image</p>
                            <p className="text-[9px] text-muted-foreground">JPG, PNG, WebP (max 30MB)</p>
                          </div>
                          <input id={`imageFileInput_${ad.id}`} type="file" accept="image/jpeg,image/png,image/webp" className="hidden"
                            data-testid={`input-image-file-${si}-${ai}`}
                            onChange={async (e) => {
                              const file = e.target.files?.[0];
                              if (!file) return;
                              if (file.size > 30 * 1024 * 1024) { toast({ title: "File too large", description: "Max 30MB.", variant: "destructive" }); return; }
                              const preview = URL.createObjectURL(file);
                              updateAd(si, ai, { imagePreview: preview });
                              const reader = new FileReader();
                              reader.onload = () => {
                                const base64 = (reader.result as string).split(",")[1];
                                handleUploadImage(si, ai, { type: "file", base64, filename: file.name });
                              };
                              reader.readAsDataURL(file);
                            }}
                          />
                          <Collapsible>
                            <CollapsibleTrigger asChild>
                              <Button variant="ghost" size="sm" className="text-[10px] gap-1 h-6"><ExternalLink className="h-2.5 w-2.5" /> Or use URL</Button>
                            </CollapsibleTrigger>
                            <CollapsibleContent className="mt-1">
                              <div className="flex gap-1.5">
                                <Input value={ad.imageUrl} onChange={e => updateAd(si, ai, { imageUrl: e.target.value })}
                                  placeholder="https://..." className="h-7 text-[10px] bg-white/50 dark:bg-white/[0.06] border-black/[0.08] dark:border-white/[0.08]" data-testid={`input-image-url-${si}-${ai}`} />
                                <Button size="sm" className="h-7 text-[10px]" onClick={() => handleUploadImage(si, ai, { type: "url", url: ad.imageUrl })}
                                  disabled={!ad.imageUrl || ad.imageUploading} data-testid={`button-upload-image-url-${si}-${ai}`}>Upload</Button>
                              </div>
                            </CollapsibleContent>
                          </Collapsible>
                          {ad.imageUploading && <div className="flex items-center gap-1.5 text-[10px] text-blue-600"><Loader2 className="h-3 w-3 animate-spin" /> Uploading...</div>}
                          {ad.imageHash && (
                            <div className="flex items-center gap-1.5 text-[10px] text-emerald-600">
                              <CheckCircle2 className="h-3 w-3" /> Uploaded (hash: {ad.imageHash.substring(0, 12)}...)
                              <Button variant="ghost" size="sm" className="h-5 text-[9px] ml-auto" onClick={() => updateAd(si, ai, { imageHash: "", imagePreview: "", imageUrl: "" })} data-testid={`button-remove-image-${si}-${ai}`}>Remove</Button>
                            </div>
                          )}
                          {ad.imagePreview && <img src={ad.imagePreview} alt="Preview" className="rounded-lg max-h-32 object-contain" data-testid={`img-preview-${si}-${ai}`} />}
                        </TabsContent>

                        <TabsContent value="UPLOAD_VIDEO" className="space-y-2 mt-2">
                          <div
                            className="p-4 text-center cursor-pointer rounded-lg border border-dashed border-black/10 dark:border-white/10 hover:bg-white/60 dark:hover:bg-white/[0.06] transition-all"
                            onClick={() => document.getElementById(`videoFileInput_${ad.id}`)?.click()}
                            data-testid={`dropzone-video-${si}-${ai}`}
                          >
                            <Upload className="h-4 w-4 text-violet-500 mx-auto mb-1" />
                            <p className="text-[10px] font-medium">Click to upload video</p>
                            <p className="text-[9px] text-muted-foreground">MP4, MOV (max 100MB)</p>
                          </div>
                          <input id={`videoFileInput_${ad.id}`} type="file" accept="video/mp4,video/quicktime" className="hidden"
                            data-testid={`input-video-file-${si}-${ai}`}
                            onChange={async (e) => {
                              const file = e.target.files?.[0];
                              if (!file) return;
                              if (file.size > 100 * 1024 * 1024) { toast({ title: "File too large", description: "Max 100MB.", variant: "destructive" }); return; }
                              const reader = new FileReader();
                              reader.onload = () => {
                                const base64 = (reader.result as string).split(",")[1];
                                handleUploadVideo(si, ai, { type: "file", base64, filename: file.name });
                              };
                              reader.readAsDataURL(file);
                            }}
                          />
                          <Collapsible>
                            <CollapsibleTrigger asChild>
                              <Button variant="ghost" size="sm" className="text-[10px] gap-1 h-6"><ExternalLink className="h-2.5 w-2.5" /> Or use URL</Button>
                            </CollapsibleTrigger>
                            <CollapsibleContent className="mt-1">
                              <div className="flex gap-1.5">
                                <Input value={ad.videoUrl} onChange={e => updateAd(si, ai, { videoUrl: e.target.value })}
                                  placeholder="https://..." className="h-7 text-[10px] bg-white/50 dark:bg-white/[0.06] border-black/[0.08] dark:border-white/[0.08]" data-testid={`input-video-url-${si}-${ai}`} />
                                <Button size="sm" className="h-7 text-[10px]" onClick={() => handleUploadVideo(si, ai, { type: "url", url: ad.videoUrl })}
                                  disabled={!ad.videoUrl || ad.videoUploading} data-testid={`button-upload-video-url-${si}-${ai}`}>Upload</Button>
                              </div>
                            </CollapsibleContent>
                          </Collapsible>
                          {ad.videoUploading && <div className="flex items-center gap-1.5 text-[10px] text-blue-600"><Loader2 className="h-3 w-3 animate-spin" /> Uploading...</div>}
                          {ad.videoId && (
                            <div className="flex items-center gap-1.5 text-[10px]">
                              <StatusIcon status={ad.videoStatus === "ready" ? "pass" : ad.videoStatus === "timeout" ? "fail" : "running"} />
                              Video: {ad.videoId} — {ad.videoStatus || "pending"}
                              <Button variant="ghost" size="sm" className="h-5 text-[9px] ml-auto" onClick={() => updateAd(si, ai, { videoId: "", videoStatus: "", videoUrl: "" })} data-testid={`button-remove-video-${si}-${ai}`}>Remove</Button>
                            </div>
                          )}
                        </TabsContent>

                        <TabsContent value="EXISTING_POST" className="space-y-2 mt-2">
                          <div className="flex items-start gap-1.5 text-[10px] text-muted-foreground p-2 rounded-lg bg-black/[0.02] dark:bg-white/[0.02]">
                            <Info className="h-3 w-3 mt-0.5 shrink-0" />
                            Existing post ads run as-is. Copy and CTA cannot be edited.
                          </div>
                          <div className="flex gap-1.5">
                            <Input value={postSearch} onChange={e => setPostSearch(e.target.value)} placeholder="Search posts..."
                              className="h-7 text-[10px] bg-white/50 dark:bg-white/[0.06] border-black/[0.08] dark:border-white/[0.08]" data-testid={`input-post-search-${si}-${ai}`} />
                          </div>
                          <div className="flex gap-1 flex-wrap" data-testid={`post-source-filters-${si}-${ai}`}>
                            {(["all", "facebook", "instagram", "library"] as PostSourceFilter[]).map(src => (
                              <button key={src} onClick={() => setPostSourceFilter(src)}
                                className={`px-2 py-0.5 rounded-md text-[9px] font-medium transition-all ${
                                  postSourceFilter === src
                                    ? "bg-blue-500/15 text-blue-300 ring-1 ring-blue-300/50"
                                    : "bg-black/[0.03] dark:bg-white/[0.06] text-muted-foreground hover:bg-black/[0.06]"
                                }`} data-testid={`filter-${src}-${si}-${ai}`}
                              >{src} ({sourceCount[src]})</button>
                            ))}
                          </div>
                          <div className="max-h-48 overflow-y-auto space-y-1">
                            {postsLoading ? (
                              <div className="flex justify-center py-4"><Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /></div>
                            ) : posts.length === 0 ? (
                              <p className="text-[10px] text-muted-foreground text-center py-4">No posts found</p>
                            ) : posts.slice(0, 30).map(post => (
                              <div
                                key={post.id}
                                onClick={() => {
                                  if (post.source === "library") return;
                                  updateAd(si, ai, {
                                    selectedPostId: post.id,
                                    selectedPostSource: (post.source === "instagram" ? "instagram" : "facebook") as "facebook" | "instagram",
                                    selectedPostPreview: post,
                                  });
                                }}
                                className={`flex items-center gap-2 p-2 rounded-lg cursor-pointer text-[10px] transition-all ${
                                  ad.selectedPostId === post.id ? "bg-blue-500/10 ring-1 ring-blue-300/50" : "hover:bg-white/[0.03]"
                                } ${post.source === "library" ? "opacity-60" : ""}`}
                                data-testid={`post-item-${si}-${ai}-${post.id}`}
                              >
                                {post.fullPicture ? (
                                  <img src={post.fullPicture} alt="" className="w-10 h-10 rounded object-cover shrink-0" />
                                ) : (
                                  <div className="w-10 h-10 rounded bg-muted flex items-center justify-center shrink-0"><FileText className="w-4 h-4 text-muted-foreground/40" /></div>
                                )}
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-1">
                                    {post.source && <span className="text-[8px] uppercase tracking-wider text-muted-foreground bg-black/[0.04] dark:bg-white/[0.06] px-1 py-0.5 rounded">{post.source}</span>}
                                    <p className="truncate">{post.message || "(No text)"}</p>
                                  </div>
                                  <p className="text-muted-foreground mt-0.5">
                                    {post.createdTime ? new Date(post.createdTime).toLocaleDateString("en-PK") : ""}
                                    {(post.likes || 0) > 0 && ` · ${post.likes} likes`}
                                  </p>
                                </div>
                                {ad.selectedPostId === post.id && post.source !== "library" && <CheckCircle2 className="h-3.5 w-3.5 text-blue-500 shrink-0" />}
                              </div>
                            ))}
                          </div>
                          {ad.selectedPostId && (
                            <div className="flex items-center gap-1.5 text-[10px] text-emerald-600">
                              <CheckCircle2 className="h-3 w-3" /> Post selected: {ad.selectedPostId}
                              <Button variant="ghost" size="sm" className="h-5 text-[9px] ml-auto"
                                onClick={() => updateAd(si, ai, { selectedPostId: "", selectedPostPreview: null })}
                                data-testid={`button-clear-post-${si}-${ai}`}>Clear</Button>
                            </div>
                          )}
                        </TabsContent>
                      </Tabs>

                      {/* Ad Copy Fields */}
                      <div className="space-y-2">
                        <div>
                          <Label className="text-[10px] font-medium">Destination URL</Label>
                          <Input value={ad.destinationUrl} onChange={e => updateAd(si, ai, { destinationUrl: e.target.value })}
                            placeholder="https://yourstore.com/product"
                            className="mt-0.5 h-8 text-xs bg-white/50 dark:bg-white/[0.06] border-black/[0.08] dark:border-white/[0.08]"
                            data-testid={`input-destination-url-${si}-${ai}`} />
                        </div>
                        {ad.mode !== "EXISTING_POST" && (
                          <>
                            <div>
                              <Label className="text-[10px] font-medium">Primary Text</Label>
                              <Textarea value={ad.primaryText} onChange={e => updateAd(si, ai, { primaryText: e.target.value })}
                                placeholder="Your main ad copy..." rows={2}
                                className="mt-0.5 text-xs bg-white/50 dark:bg-white/[0.06] border-black/[0.08] dark:border-white/[0.08] resize-none"
                                data-testid={`input-primary-text-${si}-${ai}`} />
                            </div>
                            <div className="grid grid-cols-2 gap-2">
                              <div>
                                <Label className="text-[10px] font-medium">Headline</Label>
                                <Input value={ad.headline} onChange={e => updateAd(si, ai, { headline: e.target.value })}
                                  placeholder="Short headline"
                                  className="mt-0.5 h-7 text-[10px] bg-white/50 dark:bg-white/[0.06] border-black/[0.08] dark:border-white/[0.08]"
                                  data-testid={`input-headline-${si}-${ai}`} />
                              </div>
                              <div>
                                <Label className="text-[10px] font-medium">Description</Label>
                                <Input value={ad.description} onChange={e => updateAd(si, ai, { description: e.target.value })}
                                  placeholder="Optional"
                                  className="mt-0.5 h-7 text-[10px] bg-white/50 dark:bg-white/[0.06] border-black/[0.08] dark:border-white/[0.08]"
                                  data-testid={`input-description-${si}-${ai}`} />
                              </div>
                            </div>
                            <div>
                              <Label className="text-[10px] font-medium">Call to Action</Label>
                              <Select value={ad.cta} onValueChange={v => updateAd(si, ai, { cta: v })}>
                                <SelectTrigger className="mt-0.5 h-7 text-[10px] bg-white/50 dark:bg-white/[0.06] border-black/[0.08] dark:border-white/[0.08]" data-testid={`select-cta-${si}-${ai}`}>
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  {CTA_OPTIONS.map(opt => <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>)}
                                </SelectContent>
                              </Select>
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                  ))}

                  <Button size="sm" variant="outline" onClick={() => addAd(si)} disabled={adSet.ads.length >= 10}
                    className="w-full h-7 text-[10px] gap-1 border-dashed border-black/10 dark:border-white/10"
                    data-testid={`button-add-ad-${si}`}
                  >
                    <Plus className="h-3 w-3" /> Add Ad to Set {si + 1}
                  </Button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* SECTION C: Pre-Launch Checklist + Button */}
      <div className={glassCard} data-testid="section-validation">
        <div className="px-5 pt-4 pb-3">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-emerald-500/10 flex items-center justify-center">
              <Zap className="h-3.5 w-3.5 text-emerald-400" />
            </div>
            <div className="flex-1">
              <h2 className="text-sm font-semibold">Pre-Launch Checklist</h2>
            </div>
            <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${allValid ? "bg-emerald-500/10 text-emerald-400" : "bg-amber-500/10 text-amber-400"}`}>
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
              <><Rocket className="h-4 w-4 mr-2" /> {publishMode === "VALIDATE" ? "Validate" : publishMode === "DRAFT" ? "Create Draft" : "Launch Live"} ({totalAds} ad{totalAds > 1 ? "s" : ""})</>
            )}
          </Button>
        </div>
      </div>

      {/* SECTION D: Real-time Launch Progress */}
      {activeJobId && !launchResult && launchStages.length > 0 && (
        <div className={`${glassCard} border-blue-500/20`} data-testid="section-progress">
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
                  <span className="font-medium w-48">{getStageName(stage.stage)}</span>
                  {stage.message && <span className="text-muted-foreground truncate">{stage.message}</span>}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Launch Result */}
      {launchResult && (
        <div className={`${glassCard} ${launchResult.success ? "border-emerald-500/20" : "border-red-500/20"}`} data-testid="section-result">
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
                  <span className="font-medium w-48">{getStageName(stage.stage)}</span>
                  {stage.message && <span className="text-muted-foreground truncate">{stage.message}</span>}
                </div>
              ))}
            </div>

            {launchResult.validationIssues && launchResult.validationIssues.length > 0 && (
              <div className={`${glassInner} p-3 space-y-2`}>
                <p className="text-xs font-semibold text-red-600">Validation Issues:</p>
                {launchResult.validationIssues.map((issue, i) => (
                  <div key={i} className="text-xs pl-2 border-l-2 border-red-500/30 space-y-0.5">
                    <p className="font-medium">{issue.message}</p>
                    <p className="text-muted-foreground text-[10px]">Fix: {issue.fixSuggestion}</p>
                  </div>
                ))}
              </div>
            )}

            {launchResult.success && launchResult.campaignId && (
              <div className={`${glassInner} space-y-2 text-xs p-3`}>
                <div><span className="text-muted-foreground">Campaign:</span> <span className="font-mono text-[10px]">{launchResult.campaignId}</span></div>
                {launchResult.createdEntities && launchResult.createdEntities.length > 0 ? (
                  launchResult.createdEntities.map((entity, si) => (
                    <div key={entity.adsetId} className="space-y-0.5">
                      <div><span className="text-muted-foreground">Ad Set {si + 1}:</span> <span className="font-mono text-[10px]">{entity.adsetId}</span></div>
                      {entity.ads.map((ad, ai) => (
                        <div key={ad.adId} className="pl-3">
                          <span className="text-muted-foreground">Ad {ai + 1}:</span> <span className="font-mono text-[10px]">{ad.adId}</span>
                        </div>
                      ))}
                    </div>
                  ))
                ) : (
                  <>
                    {launchResult.adsetId && <div><span className="text-muted-foreground">Ad Set:</span> <span className="font-mono text-[10px]">{launchResult.adsetId}</span></div>}
                    {launchResult.creativeId && <div><span className="text-muted-foreground">Creative:</span> <span className="font-mono text-[10px]">{launchResult.creativeId}</span></div>}
                    {launchResult.adId && <div><span className="text-muted-foreground">Ad:</span> <span className="font-mono text-[10px]">{launchResult.adId}</span></div>}
                  </>
                )}
              </div>
            )}

            {!launchResult.success && launchResult.error && (
              <div className={`${glassInner} border-red-500/20 p-3 space-y-2`}>
                <p className="text-xs font-semibold text-red-600">
                  Failed at: {getStageName(launchResult.errorStage || "")}
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

      <LaunchJobHistory />
    </div>
  );
}

interface LaunchJobRecord {
  id: string;
  status: string;
  campaignName?: string;
  adName?: string;
  metaCampaignId?: string;
  metaAdsetId?: string;
  metaAdId?: string;
  errorMessage?: string;
  createdAt?: string;
  resultJson?: { createdEntities?: CreatedEntitySummary[] } | null;
}

function LaunchJobHistory() {
  const jobsQuery = useQuery<LaunchJobRecord[]>({ queryKey: ["/api/meta/sales/launch-jobs"] });
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
              <div className="w-7 h-7 rounded-lg bg-muted flex items-center justify-center">
                <History className="h-3.5 w-3.5 text-muted-foreground" />
              </div>
              <h2 className="text-sm font-semibold flex-1">Launch History</h2>
              <Badge variant="secondary" className="text-[10px]">{jobs.length}</Badge>
              <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform duration-200 ${historyOpen ? "rotate-180" : ""}`} />
            </div>
          </div>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="px-5 pb-5 space-y-2">
            {jobs.slice(0, 10).map((job) => {
              const entities = job.resultJson?.createdEntities;
              return (
                <div key={job.id} className={`${glassInner} p-3 cursor-pointer hover:bg-white/50 dark:hover:bg-white/[0.05] transition-all`}
                  onClick={() => setExpandedJob(expandedJob === job.id ? null : job.id)} data-testid={`history-job-${job.id}`}>
                  <div className="flex items-center gap-2 text-xs">
                    <StatusIcon status={job.status === "launched" || job.status === "draft" || job.status === "validated" ? "success" : job.status === "running" ? "running" : "failed"} />
                    <span className="font-medium flex-1 truncate">{job.campaignName || job.adName || "Unnamed"}</span>
                    <Badge variant="outline" className="text-[9px] uppercase">{job.status}</Badge>
                    <span className="text-[10px] text-muted-foreground">{job.createdAt ? new Date(job.createdAt).toLocaleDateString("en-PK") : ""}</span>
                  </div>
                  {expandedJob === job.id && (
                    <div className="mt-2 space-y-1 text-[10px]">
                      {job.metaCampaignId && <div className="text-muted-foreground">Campaign: <span className="font-mono">{job.metaCampaignId}</span></div>}
                      {entities && entities.length > 0 ? (
                        entities.map((entity, si) => (
                          <div key={entity.adsetId} className="space-y-0.5">
                            <div className="text-muted-foreground">Ad Set {si + 1}: <span className="font-mono">{entity.adsetId}</span></div>
                            {entity.ads.map((ad, ai) => (
                              <div key={ad.adId} className="text-muted-foreground pl-3">Ad {ai + 1}: <span className="font-mono">{ad.adId}</span></div>
                            ))}
                          </div>
                        ))
                      ) : (
                        <>
                          {job.metaAdsetId && <div className="text-muted-foreground">Ad Set: <span className="font-mono">{job.metaAdsetId}</span></div>}
                          {job.metaAdId && <div className="text-muted-foreground">Ad: <span className="font-mono">{job.metaAdId}</span></div>}
                        </>
                      )}
                      {job.errorMessage && <div className="text-red-600">{job.errorMessage}</div>}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
}
