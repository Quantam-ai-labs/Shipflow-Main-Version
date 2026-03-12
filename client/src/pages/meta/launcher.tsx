import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Loader2, Rocket, ArrowRight, ArrowLeft, CheckCircle2, AlertCircle, ImageIcon, Film, Plus, Trash2, Search, X, CalendarIcon, Eye } from "lucide-react";
import { SiFacebook, SiInstagram } from "react-icons/si";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";

type Step = "campaign" | "targeting" | "creative" | "review";
type AdFormat = "single_image" | "video" | "carousel";
type BudgetType = "daily" | "lifetime";

const OBJECTIVES = [
  { value: "OUTCOME_SALES", label: "Sales (Conversions)" },
  { value: "OUTCOME_LEADS", label: "Leads" },
  { value: "OUTCOME_TRAFFIC", label: "Traffic" },
  { value: "OUTCOME_AWARENESS", label: "Awareness" },
  { value: "OUTCOME_ENGAGEMENT", label: "Engagement" },
];

const CTA_OPTIONS = [
  { value: "SHOP_NOW", label: "Shop Now" },
  { value: "LEARN_MORE", label: "Learn More" },
  { value: "BUY_NOW", label: "Buy Now" },
  { value: "ORDER_NOW", label: "Order Now" },
  { value: "GET_OFFER", label: "Get Offer" },
  { value: "SIGN_UP", label: "Sign Up" },
  { value: "CONTACT_US", label: "Contact Us" },
  { value: "SEND_MESSAGE", label: "Send Message" },
];

const BID_STRATEGIES = [
  { value: "LOWEST_COST_WITHOUT_CAP", label: "Lowest Cost (Auto)" },
  { value: "COST_CAP", label: "Cost Cap" },
  { value: "BID_CAP", label: "Bid Cap" },
];

const PK_CITIES: { name: string; key: string }[] = [
  { name: "Karachi", key: "2514980" },
  { name: "Lahore", key: "2514964" },
  { name: "Islamabad", key: "2514937" },
  { name: "Rawalpindi", key: "2514997" },
  { name: "Faisalabad", key: "2514927" },
  { name: "Multan", key: "2514977" },
  { name: "Peshawar", key: "2514988" },
  { name: "Quetta", key: "2514994" },
  { name: "Sialkot", key: "2515008" },
  { name: "Gujranwala", key: "2514932" },
  { name: "Hyderabad", key: "2514935" },
  { name: "Bahawalpur", key: "2514906" },
  { name: "Sargodha", key: "2515002" },
  { name: "Abbottabad", key: "2514901" },
  { name: "Mardan", key: "2514973" },
];

const PLACEMENTS = [
  { id: "facebook_feed", label: "Facebook Feed", platform: "facebook", position: "feed" },
  { id: "facebook_stories", label: "Facebook Stories", platform: "facebook", position: "story" },
  { id: "facebook_reels", label: "Facebook Reels", platform: "facebook", position: "facebook_reels" },
  { id: "instagram_feed", label: "Instagram Feed", platform: "instagram", position: "stream" },
  { id: "instagram_stories", label: "Instagram Stories", platform: "instagram", position: "story" },
  { id: "instagram_reels", label: "Instagram Reels", platform: "instagram", position: "reels" },
  { id: "audience_network", label: "Audience Network", platform: "audience_network", position: "classic" },
];

interface Interest {
  id: string;
  name: string;
  audience_size?: number;
}

interface CarouselCard {
  id: string;
  imageUrl: string;
  headline: string;
  description: string;
  linkUrl: string;
}

const MEDIA_LIMITS = {
  image: { maxSizeMB: 30, recommendedWidth: 1080, recommendedHeight: 1080, aspectRatios: ["1:1", "4:5", "9:16"] },
  video: { maxSizeMB: 4000, maxLengthSec: 240 },
};

function validateMediaUrl(url: string, type: "image" | "video"): string[] {
  const warnings: string[] = [];
  if (!url) return warnings;
  const ext = url.split(".").pop()?.toLowerCase() || "";
  if (type === "image" && !["jpg", "jpeg", "png", "webp", "gif"].includes(ext) && !url.startsWith("data:")) {
    warnings.push("Image should be JPG, PNG, WebP, or GIF format");
  }
  if (type === "video" && !["mp4", "mov", "avi", "mkv"].includes(ext) && !url.startsWith("data:")) {
    warnings.push("Video should be MP4 or MOV format");
  }
  return warnings;
}

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

function AdPreview({ primaryText, headline, imageUrl, linkUrl, callToAction, pageName }: {
  primaryText: string; headline?: string; imageUrl?: string; linkUrl: string; callToAction: string; pageName?: string;
}) {
  const ctaLabel = CTA_OPTIONS.find(c => c.value === callToAction)?.label || "Shop Now";
  let domain = "yourstore.com";
  try { if (linkUrl) domain = new URL(linkUrl).hostname.replace("www.", ""); } catch {};
  return (
    <div className="border rounded-lg overflow-hidden bg-white dark:bg-zinc-900 max-w-sm mx-auto shadow-sm" data-testid="ad-preview">
      <div className="p-3 flex items-center gap-2">
        <div className="w-8 h-8 rounded-full bg-blue-500 flex items-center justify-center text-white text-xs font-bold">
          {(pageName || "P")[0]}
        </div>
        <div>
          <p className="text-sm font-semibold">{pageName || "Your Page"}</p>
          <p className="text-[10px] text-muted-foreground">Sponsored</p>
        </div>
      </div>
      <div className="px-3 pb-2">
        <p className="text-sm whitespace-pre-wrap">{primaryText || "Your ad text will appear here..."}</p>
      </div>
      {imageUrl ? (
        <img src={imageUrl} alt="Ad" className="w-full aspect-square object-cover" />
      ) : (
        <div className="w-full aspect-square bg-muted flex items-center justify-center">
          <ImageIcon className="w-12 h-12 text-muted-foreground/30" />
        </div>
      )}
      <div className="p-3 border-t">
        <p className="text-[10px] text-muted-foreground uppercase">{domain}</p>
        {headline && <p className="text-sm font-semibold mt-0.5">{headline}</p>}
        <Button size="sm" className="w-full mt-2 text-xs h-8" data-testid="preview-cta">
          {ctaLabel}
        </Button>
      </div>
    </div>
  );
}

export default function MetaAdLauncher() {
  const { toast } = useToast();
  const [step, setStep] = useState<Step>("campaign");

  const [campaignName, setCampaignName] = useState("");
  const [objective, setObjective] = useState("OUTCOME_SALES");
  const [budgetType, setBudgetType] = useState<BudgetType>("daily");
  const [dailyBudget, setDailyBudget] = useState("500");
  const [lifetimeBudget, setLifetimeBudget] = useState("5000");
  const [bidStrategy, setBidStrategy] = useState("LOWEST_COST_WITHOUT_CAP");
  const [bidAmount, setBidAmount] = useState("");
  const [startDate, setStartDate] = useState<Date | undefined>(undefined);
  const [endDate, setEndDate] = useState<Date | undefined>(undefined);

  const [minAge, setMinAge] = useState("18");
  const [maxAge, setMaxAge] = useState("65");
  const [gender, setGender] = useState("all");
  const [selectedCities, setSelectedCities] = useState<string[]>(["Karachi", "Lahore"]);
  const [interests, setInterests] = useState<Interest[]>([]);
  const [interestSearch, setInterestSearch] = useState("");
  const [selectedPlacements, setSelectedPlacements] = useState<string[]>([]);
  const [autoPlacement, setAutoPlacement] = useState(true);

  const [adFormat, setAdFormat] = useState<AdFormat>("single_image");
  const [primaryText, setPrimaryText] = useState("");
  const [headline, setHeadline] = useState("");
  const [description, setDescription] = useState("");
  const [linkUrl, setLinkUrl] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [videoId, setVideoId] = useState("");
  const [thumbnailUrl, setThumbnailUrl] = useState("");
  const [callToAction, setCallToAction] = useState("SHOP_NOW");
  const [carouselCards, setCarouselCards] = useState<CarouselCard[]>([
    { id: uid(), imageUrl: "", headline: "", description: "", linkUrl: "" },
    { id: uid(), imageUrl: "", headline: "", description: "", linkUrl: "" },
  ]);
  const [showPreview, setShowPreview] = useState(false);

  const { data: oauthStatus } = useQuery<any>({ queryKey: ["/api/meta/oauth/status"] });
  const { data: pagesData } = useQuery<any>({ queryKey: ["/api/meta/pages"], enabled: !!oauthStatus?.connected });
  const { data: pixelsData } = useQuery<any>({ queryKey: ["/api/meta/pixels"], enabled: !!oauthStatus?.connected });
  const { data: mediaData } = useQuery<any>({ queryKey: ["/api/meta/media-library"], enabled: !!oauthStatus?.connected });

  const [interestDebounce, setInterestDebounce] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setInterestDebounce(interestSearch), 300);
    return () => clearTimeout(t);
  }, [interestSearch]);

  const { data: interestResults, isLoading: interestLoading } = useQuery<{ data: Interest[] }>({
    queryKey: ["/api/meta/targeting-search", interestDebounce],
    queryFn: async () => {
      if (!interestDebounce || interestDebounce.length < 2) return { data: [] };
      const res = await fetch(`/api/meta/targeting-search?q=${encodeURIComponent(interestDebounce)}&type=adinterest`, { credentials: "include" });
      return res.json();
    },
    enabled: interestDebounce.length >= 2,
  });

  const pageId = oauthStatus?.pageId || pagesData?.pages?.[0]?.id || "";
  const pixelId = oauthStatus?.pixelId || pixelsData?.pixels?.[0]?.id || "";
  const pageName = oauthStatus?.pageName || pagesData?.pages?.[0]?.name || "";

  const mediaWarnings = adFormat === "single_image" ? validateMediaUrl(imageUrl, "image") : [];
  const budgetValue = budgetType === "daily" ? dailyBudget : lifetimeBudget;
  const budgetMin = budgetType === "daily" ? 100 : 1000;
  const budgetWarning = parseFloat(budgetValue) < budgetMin ? `Minimum ${budgetType} budget is PKR ${budgetMin}` : "";

  const launchMutation = useMutation({
    mutationFn: async () => {
      const targeting: any = {
        geo_locations: {
          countries: ["PK"],
          cities: selectedCities.map(cityName => {
            const cityData = PK_CITIES.find(c => c.name === cityName);
            return { key: cityData?.key || "", name: cityName, country: "PK" };
          }),
        },
        age_min: parseInt(minAge),
        age_max: parseInt(maxAge),
      };
      if (gender !== "all") targeting.genders = gender === "male" ? [1] : [2];
      if (interests.length > 0) {
        targeting.flexible_spec = [{ interests: interests.map(i => ({ id: i.id, name: i.name })) }];
      }
      if (!autoPlacement && selectedPlacements.length > 0) {
        const platforms = [...new Set(selectedPlacements.map(id => PLACEMENTS.find(p => p.id === id)?.platform).filter(Boolean))];
        targeting.publisher_platforms = platforms;
        const fbPositions = selectedPlacements.filter(id => PLACEMENTS.find(p => p.id === id)?.platform === "facebook").map(id => PLACEMENTS.find(p => p.id === id)?.position).filter(Boolean);
        const igPositions = selectedPlacements.filter(id => PLACEMENTS.find(p => p.id === id)?.platform === "instagram").map(id => PLACEMENTS.find(p => p.id === id)?.position).filter(Boolean);
        if (fbPositions.length) targeting.facebook_positions = fbPositions;
        if (igPositions.length) targeting.instagram_positions = igPositions;
      }

      const creative: any = {
        format: adFormat,
        primaryText,
        headline: headline || undefined,
        description: description || undefined,
        linkUrl,
        callToAction,
      };
      if (adFormat === "single_image") {
        creative.imageUrl = imageUrl || undefined;
      } else if (adFormat === "video") {
        creative.videoId = videoId || undefined;
        creative.thumbnailUrl = thumbnailUrl || undefined;
      } else if (adFormat === "carousel") {
        creative.carouselCards = carouselCards.filter(c => c.imageUrl || c.linkUrl).map(c => ({
          imageUrl: c.imageUrl || undefined,
          headline: c.headline || undefined,
          description: c.description || undefined,
          linkUrl: c.linkUrl || linkUrl,
        }));
      }

      const payload: any = {
        campaignName, objective,
        dailyBudget: budgetType === "daily" ? dailyBudget : "500",
        budgetType,
        targeting, creative, pageId,
        pixelId: pixelId || undefined,
        status: "PAUSED",
      };
      if (budgetType === "lifetime") payload.lifetimeBudget = lifetimeBudget;
      if (bidStrategy !== "LOWEST_COST_WITHOUT_CAP") {
        payload.bidStrategy = bidStrategy;
        if (bidAmount) payload.bidAmount = bidAmount;
      }
      if (startDate) payload.startTime = startDate.toISOString();
      if (endDate) payload.endTime = endDate.toISOString();

      const res = await apiRequest("POST", "/api/meta/launch", payload);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Ad Launched Successfully!", description: `Campaign "${campaignName}" created in PAUSED state.` });
      queryClient.invalidateQueries({ queryKey: ["/api/meta/launch-jobs"] });
    },
    onError: (error: any) => {
      toast({ title: "Launch Failed", description: error.message, variant: "destructive" });
    },
  });

  if (!oauthStatus?.connected && !oauthStatus?.hasToken) {
    return (
      <div className="p-4 md:p-6 max-w-[900px] mx-auto space-y-6" data-testid="meta-launcher-page">
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-page-title">Ad Launcher</h1>
          <p className="text-sm text-muted-foreground mt-1">Create and launch Facebook/Meta ads directly from 1SOL.AI</p>
        </div>
        <Card>
          <CardContent className="p-8 text-center space-y-4">
            <SiFacebook className="w-12 h-12 text-[#1877F2] mx-auto" />
            <h2 className="text-lg font-semibold">Connect Your Facebook Account</h2>
            <p className="text-sm text-muted-foreground max-w-md mx-auto">
              You need to connect your Facebook account before you can create ads. Go to Settings &gt; Marketing to connect via OAuth or enter your credentials.
            </p>
            <Button asChild data-testid="button-go-to-settings"><a href="/settings?tab=marketing">Go to Settings</a></Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const steps: { key: Step; label: string }[] = [
    { key: "campaign", label: "Campaign" },
    { key: "targeting", label: "Targeting" },
    { key: "creative", label: "Creative" },
    { key: "review", label: "Review & Launch" },
  ];
  const currentIdx = steps.findIndex(s => s.key === step);
  const needsBidAmount = bidStrategy === "COST_CAP" || bidStrategy === "BID_CAP";
  const canProceedFromCampaign = campaignName.trim() && parseFloat(budgetValue) >= budgetMin && (!needsBidAmount || (bidAmount && parseFloat(bidAmount) > 0));
  const canProceedFromTargeting = selectedCities.length > 0;
  let isValidUrl = false;
  try { isValidUrl = !!linkUrl.trim() && !!new URL(linkUrl); } catch {}
  const canProceedFromCreative = primaryText.trim() && isValidUrl && (
    adFormat === "single_image" ||
    adFormat === "video" && videoId.trim() ||
    adFormat === "carousel" && carouselCards.filter(c => c.imageUrl).length >= 2
  );

  const addCarouselCard = () => setCarouselCards(prev => [...prev, { id: uid(), imageUrl: "", headline: "", description: "", linkUrl: "" }]);
  const removeCarouselCard = (id: string) => { if (carouselCards.length > 2) setCarouselCards(prev => prev.filter(c => c.id !== id)); };
  const updateCarouselCard = (id: string, field: keyof CarouselCard, value: string) => setCarouselCards(prev => prev.map(c => c.id === id ? { ...c, [field]: value } : c));
  const addInterest = (interest: Interest) => { if (!interests.find(i => i.id === interest.id)) setInterests(prev => [...prev, interest]); setInterestSearch(""); };
  const removeInterest = (id: string) => setInterests(prev => prev.filter(i => i.id !== id));

  return (
    <div className="p-4 md:p-6 max-w-[900px] mx-auto space-y-6" data-testid="meta-launcher-page">
      <div>
        <h1 className="text-2xl font-bold" data-testid="text-page-title">Ad Launcher</h1>
        <p className="text-sm text-muted-foreground mt-1">Create and launch Facebook/Meta ads directly from 1SOL.AI</p>
      </div>

      <div className="flex items-center gap-2 overflow-x-auto pb-2">
        {steps.map((s, idx) => (
          <div key={s.key} className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => idx <= currentIdx && setStep(s.key)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                s.key === step ? "bg-primary text-primary-foreground"
                  : idx < currentIdx ? "bg-primary/10 text-primary cursor-pointer"
                  : "bg-muted text-muted-foreground"
              }`}
              data-testid={`step-${s.key}`}
            >
              {idx < currentIdx ? <CheckCircle2 className="w-3.5 h-3.5" /> : <span className="w-5 h-5 rounded-full bg-current/20 text-xs flex items-center justify-center font-bold">{idx + 1}</span>}
              {s.label}
            </button>
            {idx < steps.length - 1 && <ArrowRight className="w-4 h-4 text-muted-foreground shrink-0" />}
          </div>
        ))}
      </div>

      {step === "campaign" && (
        <Card data-testid="card-campaign-step">
          <CardHeader>
            <CardTitle className="text-base">Campaign Setup</CardTitle>
            <CardDescription>Configure your campaign name, objective, budget and schedule</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="campaign-name">Campaign Name</Label>
              <Input id="campaign-name" placeholder="e.g. Summer Sale - Karachi" value={campaignName} onChange={e => setCampaignName(e.target.value)} data-testid="input-campaign-name" />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Objective</Label>
                <Select value={objective} onValueChange={setObjective}>
                  <SelectTrigger data-testid="select-objective"><SelectValue /></SelectTrigger>
                  <SelectContent>{OBJECTIVES.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Budget Type</Label>
                <Select value={budgetType} onValueChange={(v) => setBudgetType(v as BudgetType)}>
                  <SelectTrigger data-testid="select-budget-type"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="daily">Daily Budget</SelectItem>
                    <SelectItem value="lifetime">Lifetime Budget</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="budget-amount">{budgetType === "daily" ? "Daily" : "Lifetime"} Budget (PKR)</Label>
                <Input
                  id="budget-amount" type="number" min={budgetMin}
                  value={budgetType === "daily" ? dailyBudget : lifetimeBudget}
                  onChange={e => budgetType === "daily" ? setDailyBudget(e.target.value) : setLifetimeBudget(e.target.value)}
                  data-testid="input-budget-amount"
                />
                {budgetWarning && <p className="text-xs text-destructive">{budgetWarning}</p>}
              </div>
              <div className="space-y-1.5">
                <Label>Bid Strategy</Label>
                <Select value={bidStrategy} onValueChange={setBidStrategy}>
                  <SelectTrigger data-testid="select-bid-strategy"><SelectValue /></SelectTrigger>
                  <SelectContent>{BID_STRATEGIES.map(b => <SelectItem key={b.value} value={b.value}>{b.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>

            {(bidStrategy === "COST_CAP" || bidStrategy === "BID_CAP") && (
              <div className="space-y-1.5">
                <Label htmlFor="bid-amount">{bidStrategy === "COST_CAP" ? "Cost Cap" : "Bid Cap"} (PKR) *</Label>
                <Input id="bid-amount" type="number" placeholder="e.g. 50" value={bidAmount} onChange={e => setBidAmount(e.target.value)} data-testid="input-bid-amount" />
                {(!bidAmount || parseFloat(bidAmount) <= 0) && <p className="text-xs text-destructive">Required when using {bidStrategy === "COST_CAP" ? "Cost Cap" : "Bid Cap"} strategy</p>}
              </div>
            )}

            <Separator />
            <h3 className="font-medium text-sm">Schedule (Optional)</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Start Date</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="w-full justify-start text-left font-normal" data-testid="button-start-date">
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {startDate ? format(startDate, "PPP") : "Not set (start immediately)"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0"><Calendar mode="single" selected={startDate} onSelect={setStartDate} initialFocus /></PopoverContent>
                </Popover>
              </div>
              <div className="space-y-1.5">
                <Label>End Date</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="w-full justify-start text-left font-normal" data-testid="button-end-date">
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {endDate ? format(endDate, "PPP") : "No end date"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0"><Calendar mode="single" selected={endDate} onSelect={setEndDate} initialFocus /></PopoverContent>
                </Popover>
              </div>
            </div>

            {pageId && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <SiFacebook className="w-4 h-4 text-[#1877F2]" />
                <span>Page: <strong>{pageName || pageId}</strong></span>
              </div>
            )}

            <div className="flex justify-end pt-2">
              <Button onClick={() => setStep("targeting")} disabled={!canProceedFromCampaign} data-testid="button-next-targeting">
                Next: Targeting <ArrowRight className="w-4 h-4 ml-1" />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {step === "targeting" && (
        <Card data-testid="card-targeting-step">
          <CardHeader>
            <CardTitle className="text-base">Audience Targeting</CardTitle>
            <CardDescription>Define who should see your ads in Pakistan</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="space-y-1.5">
                <Label>Min Age</Label>
                <Input type="number" min="13" max="65" value={minAge} onChange={e => setMinAge(e.target.value)} data-testid="input-min-age" />
              </div>
              <div className="space-y-1.5">
                <Label>Max Age</Label>
                <Input type="number" min="13" max="65" value={maxAge} onChange={e => setMaxAge(e.target.value)} data-testid="input-max-age" />
              </div>
              <div className="space-y-1.5">
                <Label>Gender</Label>
                <Select value={gender} onValueChange={setGender}>
                  <SelectTrigger data-testid="select-gender"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All</SelectItem>
                    <SelectItem value="male">Male</SelectItem>
                    <SelectItem value="female">Female</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Target Cities</Label>
              <div className="flex flex-wrap gap-2">
                {PK_CITIES.map(({ name: cityName }) => {
                  const isSelected = selectedCities.includes(cityName);
                  return (
                    <Badge key={cityName} variant={isSelected ? "default" : "outline"} className="cursor-pointer select-none"
                      onClick={() => setSelectedCities(prev => isSelected ? prev.filter(c => c !== cityName) : [...prev, cityName])}
                      data-testid={`badge-city-${cityName.toLowerCase()}`}
                    >{cityName}</Badge>
                  );
                })}
              </div>
              <p className="text-xs text-muted-foreground">{selectedCities.length} cities selected</p>
            </div>

            <Separator />

            <div className="space-y-2">
              <Label>Interest Targeting</Label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Search interests (e.g. Online shopping, Fashion...)"
                  value={interestSearch} onChange={e => setInterestSearch(e.target.value)}
                  className="pl-9" data-testid="input-interest-search"
                />
              </div>
              {interestSearch.length >= 2 && (
                <div className="border rounded-md max-h-40 overflow-y-auto">
                  {interestLoading ? (
                    <div className="p-3 text-sm text-muted-foreground flex items-center gap-2"><Loader2 className="w-3 h-3 animate-spin" /> Searching...</div>
                  ) : (interestResults?.data || []).length === 0 ? (
                    <div className="p-3 text-sm text-muted-foreground">No interests found</div>
                  ) : (
                    (interestResults?.data || []).map((item) => (
                      <button key={item.id} className="w-full px-3 py-2 text-left text-sm hover:bg-muted flex items-center justify-between"
                        onClick={() => addInterest(item)} data-testid={`interest-option-${item.id}`}>
                        <span>{item.name}</span>
                        {item.audience_size && <span className="text-xs text-muted-foreground">{(item.audience_size / 1000000).toFixed(1)}M</span>}
                      </button>
                    ))
                  )}
                </div>
              )}
              {interests.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {interests.map(i => (
                    <Badge key={i.id} variant="secondary" className="gap-1" data-testid={`interest-tag-${i.id}`}>
                      {i.name}
                      <X className="w-3 h-3 cursor-pointer" onClick={() => removeInterest(i.id)} />
                    </Badge>
                  ))}
                </div>
              )}
            </div>

            <Separator />

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Placements</Label>
                <div className="flex items-center gap-2">
                  <Switch checked={autoPlacement} onCheckedChange={setAutoPlacement} data-testid="switch-auto-placement" />
                  <span className="text-sm text-muted-foreground">{autoPlacement ? "Automatic" : "Manual"}</span>
                </div>
              </div>
              {!autoPlacement && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {PLACEMENTS.map(p => (
                    <label key={p.id} className="flex items-center gap-2 p-2 rounded border cursor-pointer hover:bg-muted/50">
                      <Checkbox
                        checked={selectedPlacements.includes(p.id)}
                        onCheckedChange={(checked) => {
                          setSelectedPlacements(prev => checked ? [...prev, p.id] : prev.filter(x => x !== p.id));
                        }}
                        data-testid={`checkbox-placement-${p.id}`}
                      />
                      {p.platform === "instagram" ? <SiInstagram className="w-3.5 h-3.5 text-pink-500" /> : <SiFacebook className="w-3.5 h-3.5 text-[#1877F2]" />}
                      <span className="text-sm">{p.label}</span>
                    </label>
                  ))}
                </div>
              )}
            </div>

            <div className="flex justify-between pt-2">
              <Button variant="outline" onClick={() => setStep("campaign")} data-testid="button-back-campaign"><ArrowLeft className="w-4 h-4 mr-1" /> Back</Button>
              <Button onClick={() => setStep("creative")} disabled={!canProceedFromTargeting} data-testid="button-next-creative">
                Next: Creative <ArrowRight className="w-4 h-4 ml-1" />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {step === "creative" && (
        <Card data-testid="card-creative-step">
          <CardHeader>
            <CardTitle className="text-base">Ad Creative</CardTitle>
            <CardDescription>Design your ad copy and select media</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label>Ad Format</Label>
              <div className="flex gap-2">
                {([
                  { value: "single_image" as AdFormat, label: "Single Image", icon: ImageIcon },
                  { value: "video" as AdFormat, label: "Video", icon: Film },
                  { value: "carousel" as AdFormat, label: "Carousel", icon: Plus },
                ]).map(f => (
                  <Button key={f.value} variant={adFormat === f.value ? "default" : "outline"} size="sm" className="gap-1.5"
                    onClick={() => setAdFormat(f.value)} data-testid={`button-format-${f.value}`}>
                    <f.icon className="w-3.5 h-3.5" /> {f.label}
                  </Button>
                ))}
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="primary-text">Primary Text *</Label>
              <Textarea id="primary-text" placeholder="Write your ad copy here..." rows={3} value={primaryText} onChange={e => setPrimaryText(e.target.value)} data-testid="textarea-primary-text" />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="headline">Headline</Label>
                <Input id="headline" placeholder="e.g. 50% Off Summer Collection" value={headline} onChange={e => setHeadline(e.target.value)} data-testid="input-headline" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ad-description">Description</Label>
                <Input id="ad-description" placeholder="e.g. Free delivery nationwide" value={description} onChange={e => setDescription(e.target.value)} data-testid="input-description" />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="link-url">Landing Page URL *</Label>
                <Input id="link-url" type="url" placeholder="https://yourstore.com/collection" value={linkUrl} onChange={e => setLinkUrl(e.target.value)} data-testid="input-link-url" />
              </div>
              <div className="space-y-1.5">
                <Label>Call to Action</Label>
                <Select value={callToAction} onValueChange={setCallToAction}>
                  <SelectTrigger data-testid="select-cta"><SelectValue /></SelectTrigger>
                  <SelectContent>{CTA_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>

            {adFormat === "single_image" && (
              <div className="space-y-1.5">
                <Label htmlFor="image-url">Image URL</Label>
                <Input id="image-url" type="url" placeholder="https://example.com/ad-image.jpg" value={imageUrl} onChange={e => setImageUrl(e.target.value)} data-testid="input-image-url" />
                {mediaWarnings.length > 0 && (
                  <div className="space-y-1">{mediaWarnings.map((w, i) => <p key={i} className="text-xs text-amber-600 flex items-center gap-1"><AlertCircle className="w-3 h-3" />{w}</p>)}</div>
                )}
                <p className="text-xs text-muted-foreground">Recommended: 1080×1080px (1:1), 1080×1350px (4:5), or 1080×1920px (9:16). Max {MEDIA_LIMITS.image.maxSizeMB}MB.</p>
                {mediaData?.media?.length > 0 && (
                  <div className="mt-2">
                    <p className="text-xs text-muted-foreground mb-1.5">Or select from Media Library:</p>
                    <div className="flex gap-2 overflow-x-auto pb-1">
                      {mediaData.media.filter((m: any) => m.type === "image").slice(0, 8).map((m: any) => (
                        <button key={m.id} onClick={() => setImageUrl(m.url)} className={`shrink-0 w-16 h-16 rounded border-2 overflow-hidden transition-colors ${imageUrl === m.url ? "border-primary" : "border-transparent hover:border-muted-foreground/30"}`} data-testid={`media-select-${m.id}`}>
                          <img src={m.url} alt={m.name} className="w-full h-full object-cover" />
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {adFormat === "video" && (
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <Label htmlFor="video-id">Video ID (from Media Library upload)</Label>
                  <Input id="video-id" placeholder="Meta Video ID" value={videoId} onChange={e => setVideoId(e.target.value)} data-testid="input-video-id" />
                  <p className="text-xs text-muted-foreground">Upload a video in the Media Library first, then paste the Meta Video ID here. Max {MEDIA_LIMITS.video.maxLengthSec}s, {MEDIA_LIMITS.video.maxSizeMB / 1000}GB.</p>
                  {mediaData?.media?.length > 0 && (
                    <div className="mt-2">
                      <p className="text-xs text-muted-foreground mb-1.5">Videos from Media Library:</p>
                      <div className="flex gap-2 overflow-x-auto pb-1">
                        {mediaData.media.filter((m: any) => m.type === "video").slice(0, 8).map((m: any) => (
                          <button key={m.id} onClick={() => setVideoId(m.metaMediaHash || "")} className={`shrink-0 px-3 py-2 rounded border-2 text-xs font-medium transition-colors ${videoId === m.metaMediaHash ? "border-primary bg-primary/10" : "border-muted hover:border-muted-foreground/30"}`} data-testid={`video-select-${m.id}`}>
                            <Film className="w-4 h-4 mx-auto mb-1" />
                            {m.name}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="thumbnail-url">Thumbnail URL (optional)</Label>
                  <Input id="thumbnail-url" type="url" placeholder="https://example.com/thumbnail.jpg" value={thumbnailUrl} onChange={e => setThumbnailUrl(e.target.value)} data-testid="input-thumbnail-url" />
                </div>
              </div>
            )}

            {adFormat === "carousel" && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label>Carousel Cards ({carouselCards.length})</Label>
                  <Button variant="outline" size="sm" onClick={addCarouselCard} disabled={carouselCards.length >= 10} data-testid="button-add-carousel-card">
                    <Plus className="w-3.5 h-3.5 mr-1" /> Add Card
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">Minimum 2 cards, maximum 10. Each card needs an image and uses the main landing URL if no URL specified.</p>
                {carouselCards.map((card, idx) => (
                  <div key={card.id} className="border rounded-lg p-3 space-y-2" data-testid={`carousel-card-${card.id}`}>
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium">Card {idx + 1}</span>
                      <Button variant="ghost" size="sm" onClick={() => removeCarouselCard(card.id)} disabled={carouselCards.length <= 2} data-testid={`button-remove-card-${card.id}`}>
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    </div>
                    <Input placeholder="Image URL" value={card.imageUrl} onChange={e => updateCarouselCard(card.id, "imageUrl", e.target.value)} className="text-xs h-8" data-testid={`input-card-image-${card.id}`} />
                    <div className="grid grid-cols-2 gap-2">
                      <Input placeholder="Card Headline" value={card.headline} onChange={e => updateCarouselCard(card.id, "headline", e.target.value)} className="text-xs h-8" data-testid={`input-card-headline-${card.id}`} />
                      <Input placeholder="Card URL (optional)" value={card.linkUrl} onChange={e => updateCarouselCard(card.id, "linkUrl", e.target.value)} className="text-xs h-8" data-testid={`input-card-url-${card.id}`} />
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="flex justify-between pt-2">
              <Button variant="outline" onClick={() => setStep("targeting")} data-testid="button-back-targeting"><ArrowLeft className="w-4 h-4 mr-1" /> Back</Button>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setShowPreview(!showPreview)} data-testid="button-toggle-preview">
                  <Eye className="w-4 h-4 mr-1" /> {showPreview ? "Hide" : "Show"} Preview
                </Button>
                <Button onClick={() => setStep("review")} disabled={!canProceedFromCreative} data-testid="button-next-review">
                  Next: Review <ArrowRight className="w-4 h-4 ml-1" />
                </Button>
              </div>
            </div>

            {showPreview && (
              <>
                <Separator />
                <h3 className="font-medium text-sm text-center">Ad Preview</h3>
                <AdPreview primaryText={primaryText} headline={headline} imageUrl={adFormat === "single_image" ? imageUrl : carouselCards[0]?.imageUrl || ""} linkUrl={linkUrl} callToAction={callToAction} pageName={pageName} />
              </>
            )}
          </CardContent>
        </Card>
      )}

      {step === "review" && (
        <Card data-testid="card-review-step">
          <CardHeader>
            <CardTitle className="text-base">Review & Launch</CardTitle>
            <CardDescription>Review your ad configuration before launching. Ads are created in <strong>PAUSED</strong> state.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-3">
                <h3 className="font-medium text-sm">Campaign</h3>
                <div className="space-y-1 text-sm">
                  <div className="flex justify-between"><span className="text-muted-foreground">Name</span><span className="font-medium" data-testid="review-campaign-name">{campaignName}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Objective</span><span>{OBJECTIVES.find(o => o.value === objective)?.label}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Budget</span><span>PKR {budgetValue}/{budgetType === "daily" ? "day" : "total"}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Bid Strategy</span><span>{BID_STRATEGIES.find(b => b.value === bidStrategy)?.label}</span></div>
                  {startDate && <div className="flex justify-between"><span className="text-muted-foreground">Start</span><span>{format(startDate, "PPP")}</span></div>}
                  {endDate && <div className="flex justify-between"><span className="text-muted-foreground">End</span><span>{format(endDate, "PPP")}</span></div>}
                </div>

                <Separator />

                <h3 className="font-medium text-sm">Targeting</h3>
                <div className="space-y-1 text-sm">
                  <div className="flex justify-between"><span className="text-muted-foreground">Age</span><span>{minAge} - {maxAge}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Gender</span><span className="capitalize">{gender}</span></div>
                  <div><span className="text-muted-foreground">Cities: </span><span>{selectedCities.join(", ")}</span></div>
                  {interests.length > 0 && <div><span className="text-muted-foreground">Interests: </span><span>{interests.map(i => i.name).join(", ")}</span></div>}
                  <div className="flex justify-between"><span className="text-muted-foreground">Placements</span><span>{autoPlacement ? "Automatic" : `${selectedPlacements.length} selected`}</span></div>
                </div>
              </div>

              <div className="space-y-3">
                <h3 className="font-medium text-sm">Creative</h3>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between"><span className="text-muted-foreground">Format</span><Badge variant="outline">{adFormat === "single_image" ? "Image" : adFormat === "video" ? "Video" : "Carousel"}</Badge></div>
                  <div><span className="text-muted-foreground block">Primary Text</span><p className="mt-0.5">{primaryText}</p></div>
                  {headline && <div><span className="text-muted-foreground block">Headline</span><p className="mt-0.5 font-medium">{headline}</p></div>}
                  <div className="flex justify-between"><span className="text-muted-foreground">CTA</span><span>{CTA_OPTIONS.find(c => c.value === callToAction)?.label}</span></div>
                  <div><span className="text-muted-foreground block">URL</span><a href={linkUrl} target="_blank" rel="noreferrer" className="text-primary text-xs break-all">{linkUrl}</a></div>
                  {adFormat === "single_image" && imageUrl && <div className="mt-2"><img src={imageUrl} alt="Ad preview" className="rounded border max-h-32 object-cover" /></div>}
                  {adFormat === "carousel" && <p className="text-xs text-muted-foreground">{carouselCards.filter(c => c.imageUrl).length} carousel cards</p>}
                </div>
              </div>
            </div>

            <Separator />

            <AdPreview primaryText={primaryText} headline={headline} imageUrl={adFormat === "single_image" ? imageUrl : carouselCards[0]?.imageUrl || ""} linkUrl={linkUrl} callToAction={callToAction} pageName={pageName} />

            <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg p-3 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <p className="text-xs text-amber-700 dark:text-amber-400">
                Your ad will be created in <strong>PAUSED</strong> state. You can review and activate it directly from Facebook Ads Manager.
              </p>
            </div>

            <div className="flex justify-between pt-2">
              <Button variant="outline" onClick={() => setStep("creative")} data-testid="button-back-creative"><ArrowLeft className="w-4 h-4 mr-1" /> Back</Button>
              <Button onClick={() => launchMutation.mutate()} disabled={launchMutation.isPending} className="gap-2" data-testid="button-launch-ad">
                {launchMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Rocket className="w-4 h-4" />}
                Launch Ad (Paused)
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
