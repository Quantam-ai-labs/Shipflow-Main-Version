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
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Loader2, Rocket, ArrowRight, ArrowLeft, CheckCircle2, AlertCircle, ImageIcon, Film, Plus, Trash2, Search, X, CalendarIcon, Eye, FileText, ThumbsUp, MessageCircle, Share2, ExternalLink, ChevronDown, ChevronUp, Copy, Layers } from "lucide-react";
import { SiFacebook, SiInstagram } from "react-icons/si";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";

type Step = "campaign" | "adsets" | "review";
type AdFormat = "single_image" | "video" | "carousel" | "existing_post";
type BudgetType = "daily" | "lifetime";
type BudgetLevel = "adset" | "campaign";

interface ExistingPost {
  id: string;
  message: string;
  fullPicture: string;
  createdTime: string;
  type: string;
  statusType?: string;
  permalinkUrl: string;
  likes: number;
  comments: number;
  shares: number;
  source: "facebook" | "instagram" | "partner";
}

interface GeoLocation {
  key: string;
  name: string;
  type: string;
  country_code: string;
  region: string;
}

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

interface AdState {
  id: string;
  name: string;
  format: AdFormat;
  primaryText: string;
  headline: string;
  description: string;
  linkUrl: string;
  imageUrl: string;
  videoId: string;
  thumbnailUrl: string;
  callToAction: string;
  carouselCards: CarouselCard[];
  selectedPost: ExistingPost | null;
}

interface AdSetState {
  id: string;
  name: string;
  dailyBudget: string;
  lifetimeBudget: string;
  budgetType: BudgetType;
  minAge: string;
  maxAge: string;
  gender: string;
  allPakistan: boolean;
  selectedGeoLocations: GeoLocation[];
  interests: Interest[];
  selectedPlacements: string[];
  autoPlacement: boolean;
  advantagePlusAudience: boolean;
  selectedAudiences: { id: string; name: string }[];
  excludedAudiences: { id: string; name: string }[];
  optimizationGoal: string;
  bidStrategy: string;
  bidAmount: string;
  startDate?: Date;
  startTime: string;
  endDate?: Date;
  endTime: string;
  ads: AdState[];
  isExpanded: boolean;
}

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

const CONVERSION_EVENTS = [
  { value: "PURCHASE", label: "Purchase" },
  { value: "ADD_TO_CART", label: "Add to Cart" },
  { value: "INITIATE_CHECKOUT", label: "Initiate Checkout" },
  { value: "LEAD", label: "Lead" },
  { value: "COMPLETE_REGISTRATION", label: "Complete Registration" },
  { value: "SEARCH", label: "Search" },
  { value: "VIEW_CONTENT", label: "View Content" },
  { value: "CONTACT", label: "Contact" },
  { value: "SUBSCRIBE", label: "Subscribe" },
];

const OPTIMIZATION_GOALS = [
  { value: "OFFSITE_CONVERSIONS", label: "Conversions (Offsite)" },
  { value: "LINK_CLICKS", label: "Link Clicks" },
  { value: "LANDING_PAGE_VIEWS", label: "Landing Page Views" },
  { value: "IMPRESSIONS", label: "Impressions" },
  { value: "REACH", label: "Reach" },
  { value: "POST_ENGAGEMENT", label: "Post Engagement" },
  { value: "VIDEO_VIEWS", label: "Video Views (ThruPlay)" },
  { value: "LEAD_GENERATION", label: "Lead Generation" },
];

const PK_CITIES: { name: string; key: string; province: string }[] = [
  { name: "Karachi", key: "2514980", province: "Sindh" },
  { name: "Lahore", key: "2514964", province: "Punjab" },
  { name: "Islamabad", key: "2514937", province: "Federal" },
  { name: "Rawalpindi", key: "2514997", province: "Punjab" },
  { name: "Faisalabad", key: "2514927", province: "Punjab" },
  { name: "Multan", key: "2514977", province: "Punjab" },
  { name: "Peshawar", key: "2514988", province: "KPK" },
  { name: "Quetta", key: "2514994", province: "Balochistan" },
  { name: "Sialkot", key: "2515008", province: "Punjab" },
  { name: "Gujranwala", key: "2514932", province: "Punjab" },
  { name: "Hyderabad", key: "2514935", province: "Sindh" },
  { name: "Bahawalpur", key: "2514906", province: "Punjab" },
  { name: "Sargodha", key: "2515002", province: "Punjab" },
  { name: "Abbottabad", key: "2514901", province: "KPK" },
  { name: "Mardan", key: "2514973", province: "KPK" },
  { name: "Sukkur", key: "2515014", province: "Sindh" },
  { name: "Larkana", key: "2514966", province: "Sindh" },
  { name: "Nawabshah", key: "2514982", province: "Sindh" },
  { name: "Mirpur Khas", key: "2514975", province: "Sindh" },
  { name: "Jacobabad", key: "2514942", province: "Sindh" },
  { name: "Shikarpur", key: "2515006", province: "Sindh" },
  { name: "Khairpur", key: "2514953", province: "Sindh" },
  { name: "Gujrat", key: "2514933", province: "Punjab" },
  { name: "Sahiwal", key: "2515000", province: "Punjab" },
  { name: "Jhang", key: "2514944", province: "Punjab" },
  { name: "Rahim Yar Khan", key: "2514996", province: "Punjab" },
  { name: "Sheikhupura", key: "2515005", province: "Punjab" },
  { name: "Kasur", key: "2514949", province: "Punjab" },
  { name: "Jhelum", key: "2514945", province: "Punjab" },
  { name: "Dera Ghazi Khan", key: "2514921", province: "Punjab" },
  { name: "Okara", key: "2514984", province: "Punjab" },
  { name: "Chiniot", key: "2514917", province: "Punjab" },
  { name: "Khanewal", key: "2514952", province: "Punjab" },
  { name: "Hafizabad", key: "2514934", province: "Punjab" },
  { name: "Mandi Bahauddin", key: "2514972", province: "Punjab" },
  { name: "Toba Tek Singh", key: "2515017", province: "Punjab" },
  { name: "Vehari", key: "2515020", province: "Punjab" },
  { name: "Muzaffargarh", key: "2514979", province: "Punjab" },
  { name: "Layyah", key: "2514967", province: "Punjab" },
  { name: "Swat", key: "2515015", province: "KPK" },
  { name: "Kohat", key: "2514959", province: "KPK" },
  { name: "Dera Ismail Khan", key: "2514922", province: "KPK" },
  { name: "Bannu", key: "2514907", province: "KPK" },
  { name: "Mansehra", key: "2514974", province: "KPK" },
  { name: "Charsadda", key: "2514916", province: "KPK" },
  { name: "Nowshera", key: "2514983", province: "KPK" },
  { name: "Swabi", key: "2515013", province: "KPK" },
  { name: "Mingora", key: "2787834", province: "KPK" },
  { name: "Turbat", key: "2515018", province: "Balochistan" },
  { name: "Khuzdar", key: "2514955", province: "Balochistan" },
  { name: "Hub", key: "2753551", province: "Balochistan" },
  { name: "Chaman", key: "2514915", province: "Balochistan" },
  { name: "Gwadar", key: "2514931", province: "Balochistan" },
  { name: "Muzaffarabad", key: "2514978", province: "AJK" },
  { name: "Mirpur", key: "2514976", province: "AJK" },
  { name: "Gilgit", key: "2514929", province: "GB" },
  { name: "Skardu", key: "2515009", province: "GB" },
];

const PK_PROVINCES = [
  { name: "Punjab", label: "Punjab" },
  { name: "Sindh", label: "Sindh" },
  { name: "KPK", label: "Khyber Pakhtunkhwa" },
  { name: "Balochistan", label: "Balochistan" },
  { name: "Federal", label: "Federal Capital" },
  { name: "AJK", label: "Azad Kashmir" },
  { name: "GB", label: "Gilgit-Baltistan" },
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

const MEDIA_LIMITS = {
  image: { maxSizeMB: 30, minWidth: 600, recommendedWidth: 1080, recommendedHeight: 1080, validRatios: ["1:1", "4:5", "9:16", "16:9", "1.91:1"], validFormats: ["jpg", "jpeg", "png", "webp", "gif"] },
  video: { maxSizeMB: 4096, maxLengthSec: 240, minWidth: 500, validFormats: ["mp4", "mov"] },
};

const TIME_OPTIONS = Array.from({ length: 24 }, (_, h) => {
  const hh = h.toString().padStart(2, "0");
  return [
    { value: `${hh}:00`, label: `${hh}:00` },
    { value: `${hh}:30`, label: `${hh}:30` },
  ];
}).flat();

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

function createDefaultAd(adSetName: string, adIdx: number): AdState {
  return {
    id: uid(),
    name: `${adSetName} - Ad ${adIdx}`,
    format: "single_image",
    primaryText: "",
    headline: "",
    description: "",
    linkUrl: "",
    imageUrl: "",
    videoId: "",
    thumbnailUrl: "",
    callToAction: "SHOP_NOW",
    carouselCards: [
      { id: uid(), imageUrl: "", headline: "", description: "", linkUrl: "" },
      { id: uid(), imageUrl: "", headline: "", description: "", linkUrl: "" },
    ],
    selectedPost: null,
  };
}

function createDefaultAdSet(campaignName: string, adSetIdx: number): AdSetState {
  const name = `${campaignName || "Campaign"} - Ad Set ${adSetIdx}`;
  return {
    id: uid(),
    name,
    dailyBudget: "500",
    lifetimeBudget: "5000",
    budgetType: "daily",
    minAge: "18",
    maxAge: "65",
    gender: "all",
    allPakistan: false,
    selectedGeoLocations: [
      { key: "2211096", name: "Karachi", type: "city", country_code: "PK", region: "Sindh" },
      { key: "2211177", name: "Lahore", type: "city", country_code: "PK", region: "Punjab" },
    ],
    interests: [],
    selectedPlacements: [],
    autoPlacement: true,
    advantagePlusAudience: false,
    selectedAudiences: [],
    excludedAudiences: [],
    optimizationGoal: "",
    bidStrategy: "LOWEST_COST_WITHOUT_CAP",
    bidAmount: "",
    startTime: "00:00",
    endTime: "23:59",
    ads: [createDefaultAd(name, 1)],
    isExpanded: true,
  };
}

function validateMediaUrl(url: string, type: "image" | "video"): string[] {
  const warnings: string[] = [];
  if (!url) return warnings;
  const ext = url.split("?")[0].split(".").pop()?.toLowerCase() || "";
  const limits = type === "image" ? MEDIA_LIMITS.image : MEDIA_LIMITS.video;
  if (ext && !limits.validFormats.includes(ext) && !url.startsWith("data:")) {
    warnings.push(`${type === "image" ? "Image" : "Video"} should be ${limits.validFormats.join(", ").toUpperCase()} format`);
  }
  return warnings;
}

function AdPreview({ primaryText, headline, imageUrl, thumbnailUrl, linkUrl, callToAction, pageName, format: adFormat, carouselCards }: {
  primaryText: string; headline?: string; imageUrl?: string; thumbnailUrl?: string; linkUrl: string; callToAction: string; pageName?: string; format?: AdFormat; carouselCards?: CarouselCard[];
}) {
  const ctaLabel = CTA_OPTIONS.find(c => c.value === callToAction)?.label || "Shop Now";
  let domain = "yourstore.com";
  try { if (linkUrl) domain = new URL(linkUrl).hostname.replace("www.", ""); } catch {};
  const previewImage = adFormat === "video" ? (thumbnailUrl || imageUrl) : imageUrl;
  const isCarousel = adFormat === "carousel" && carouselCards && carouselCards.length >= 2;
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
      {isCarousel ? (
        <div className="flex overflow-x-auto gap-0.5 snap-x snap-mandatory">
          {carouselCards!.filter(c => c.imageUrl).map((card, idx) => (
            <div key={card.id || idx} className="snap-start shrink-0 w-48 border-r last:border-r-0">
              <img src={card.imageUrl} alt={card.headline || `Card ${idx + 1}`} className="w-48 h-48 object-cover" />
              <div className="p-2">
                {card.headline && <p className="text-xs font-semibold truncate">{card.headline}</p>}
                {card.description && <p className="text-[10px] text-muted-foreground truncate">{card.description}</p>}
              </div>
            </div>
          ))}
        </div>
      ) : adFormat === "video" ? (
        <div className="relative">
          {previewImage ? (
            <img src={previewImage} alt="Video thumbnail" className="w-full aspect-video object-cover" />
          ) : (
            <div className="w-full aspect-video bg-muted flex items-center justify-center">
              <Film className="w-12 h-12 text-muted-foreground/30" />
            </div>
          )}
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-12 h-12 rounded-full bg-black/50 flex items-center justify-center">
              <div className="w-0 h-0 border-t-[8px] border-t-transparent border-l-[14px] border-l-white border-b-[8px] border-b-transparent ml-1" />
            </div>
          </div>
        </div>
      ) : previewImage ? (
        <img src={previewImage} alt="Ad" className="w-full aspect-square object-cover" />
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

function PostListItem({ post, onSelect }: { post: ExistingPost; onSelect: (p: ExistingPost) => void }) {
  return (
    <button
      onClick={() => onSelect(post)}
      className="w-full flex items-start gap-3 p-3 border rounded-lg text-left hover:bg-muted/50 transition-colors"
      data-testid={`post-item-${post.id}`}
    >
      {post.fullPicture ? (
        <img src={post.fullPicture} alt="" className="w-16 h-16 rounded object-cover shrink-0" />
      ) : (
        <div className="w-16 h-16 rounded bg-muted flex items-center justify-center shrink-0">
          <FileText className="w-6 h-6 text-muted-foreground/40" />
        </div>
      )}
      <div className="flex-1 min-w-0">
        <p className="text-sm line-clamp-2">{post.message || "(No text)"}</p>
        <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground flex-wrap">
          <span className="capitalize font-medium">{post.type}</span>
          <span>·</span>
          <span>{post.createdTime ? format(new Date(post.createdTime), "dd MMM yyyy HH:mm") : ""}</span>
        </div>
        <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
          <span className="flex items-center gap-0.5"><ThumbsUp className="w-3 h-3" /> {post.likes}</span>
          <span className="flex items-center gap-0.5"><MessageCircle className="w-3 h-3" /> {post.comments}</span>
          {post.shares > 0 && <span className="flex items-center gap-0.5"><Share2 className="w-3 h-3" /> {post.shares}</span>}
          <span className="font-mono text-[10px] ml-auto">{post.id}</span>
        </div>
      </div>
    </button>
  );
}

function PostList({ posts, loading, onSelect, emptyMsg }: { posts: ExistingPost[]; loading: boolean; onSelect: (p: ExistingPost) => void; emptyMsg: string }) {
  if (loading) return <div className="flex items-center justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>;
  if (!posts.length) return <p className="text-sm text-muted-foreground text-center py-8">{emptyMsg}</p>;
  return (
    <div className="space-y-2 max-h-[400px] overflow-y-auto pr-1">
      {posts.map(p => <PostListItem key={p.id} post={p} onSelect={onSelect} />)}
    </div>
  );
}

function PostPickerDialog({
  open, onOpenChange, searchQuery, onSearchChange,
  fbPosts, igPosts, partnerPosts, mediaLibrary,
  fbLoading, igLoading, partnerLoading,
  onSelectPost, onSelectMedia,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  searchQuery: string;
  onSearchChange: (v: string) => void;
  fbPosts: ExistingPost[];
  igPosts: ExistingPost[];
  partnerPosts: ExistingPost[];
  mediaLibrary: any[];
  fbLoading: boolean;
  igLoading: boolean;
  partnerLoading: boolean;
  onSelectPost: (post: ExistingPost) => void;
  onSelectMedia: (media: any) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col" data-testid="post-picker-dialog">
        <DialogHeader>
          <DialogTitle>Select Existing Post</DialogTitle>
        </DialogHeader>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search by text or post ID..."
            className="pl-9"
            value={searchQuery}
            onChange={e => onSearchChange(e.target.value)}
            data-testid="input-post-search"
          />
          {searchQuery && (
            <button onClick={() => onSearchChange("")} className="absolute right-3 top-1/2 -translate-y-1/2">
              <X className="w-4 h-4 text-muted-foreground" />
            </button>
          )}
        </div>
        <Tabs defaultValue="facebook" className="flex-1 overflow-hidden flex flex-col">
          <TabsList className="w-full grid grid-cols-4">
            <TabsTrigger value="facebook" className="gap-1 text-xs" data-testid="tab-facebook">
              <SiFacebook className="w-3.5 h-3.5" /> Facebook
            </TabsTrigger>
            <TabsTrigger value="instagram" className="gap-1 text-xs" data-testid="tab-instagram">
              <SiInstagram className="w-3.5 h-3.5" /> Instagram
            </TabsTrigger>
            <TabsTrigger value="partner" className="gap-1 text-xs" data-testid="tab-partner">
              <Share2 className="w-3.5 h-3.5" /> Partner
            </TabsTrigger>
            <TabsTrigger value="media" className="gap-1 text-xs" data-testid="tab-media-library">
              <ImageIcon className="w-3.5 h-3.5" /> Media Library
            </TabsTrigger>
          </TabsList>
          <TabsContent value="facebook" className="flex-1 overflow-auto mt-3">
            <PostList posts={fbPosts} loading={fbLoading} onSelect={onSelectPost} emptyMsg="No Facebook page posts found. Make sure your Facebook page is connected." />
          </TabsContent>
          <TabsContent value="instagram" className="flex-1 overflow-auto mt-3">
            <PostList posts={igPosts} loading={igLoading} onSelect={onSelectPost} emptyMsg="No Instagram posts found. Make sure your Instagram account is connected." />
          </TabsContent>
          <TabsContent value="partner" className="flex-1 overflow-auto mt-3">
            <PostList posts={partnerPosts} loading={partnerLoading} onSelect={onSelectPost} emptyMsg="No partner/branded content posts found." />
          </TabsContent>
          <TabsContent value="media" className="flex-1 overflow-auto mt-3">
            {mediaLibrary.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">No media in your library. Upload media via the <a href="/meta/media-library" className="text-primary underline">Media Library</a>.</p>
            ) : (
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                {mediaLibrary.map((m: any) => (
                  <button
                    key={m.id}
                    onClick={() => onSelectMedia(m)}
                    className="group relative rounded-lg border overflow-hidden aspect-square hover:border-primary transition-colors"
                    data-testid={`media-lib-item-${m.id}`}
                  >
                    {m.type === "video" ? (
                      <div className="w-full h-full bg-muted flex items-center justify-center">
                        <Film className="w-8 h-8 text-muted-foreground/40" />
                      </div>
                    ) : (
                      <img src={m.url} alt={m.name} className="w-full h-full object-cover" />
                    )}
                    <div className="absolute bottom-0 inset-x-0 bg-black/60 text-white text-[10px] px-1.5 py-1 truncate opacity-0 group-hover:opacity-100 transition-opacity">
                      {m.name}
                    </div>
                    <Badge variant="secondary" className="absolute top-1 right-1 text-[9px] px-1 py-0">{m.type}</Badge>
                  </button>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
        <div className="flex justify-end pt-2 border-t">
          <Button variant="outline" onClick={() => onOpenChange(false)} data-testid="button-cancel-post-picker">Cancel</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function buildTargetingPayload(adSet: AdSetState) {
  const targeting: any = {
    geo_locations: adSet.allPakistan
      ? { countries: ["PK"] }
      : (() => {
          const geo: any = {};
          const valid = adSet.selectedGeoLocations.filter(loc => loc.key);
          const cities = valid.filter(loc => loc.type === "city" || !loc.type);
          const regions = valid.filter(loc => loc.type === "region" || loc.type === "subcity" || loc.type === "neighborhood");
          const zips = valid.filter(loc => loc.type === "zip");
          if (cities.length > 0) geo.cities = cities.map(loc => ({ key: loc.key, name: loc.name, country: loc.country_code || "PK" }));
          if (regions.length > 0) geo.regions = regions.map(loc => ({ key: loc.key, name: loc.name }));
          if (zips.length > 0) geo.zips = zips.map(loc => ({ key: loc.key }));
          return geo;
        })(),
    age_min: parseInt(adSet.minAge),
    age_max: parseInt(adSet.maxAge),
  };
  if (adSet.gender !== "all") targeting.genders = adSet.gender === "male" ? [1] : [2];
  if (adSet.interests.length > 0) {
    targeting.flexible_spec = [{ interests: adSet.interests.map(i => ({ id: i.id, name: i.name })) }];
  }
  if (adSet.selectedAudiences.length > 0) {
    targeting.custom_audiences = adSet.selectedAudiences.map(a => ({ id: a.id, name: a.name }));
  }
  if (adSet.excludedAudiences.length > 0) {
    targeting.excluded_custom_audiences = adSet.excludedAudiences.map(a => ({ id: a.id, name: a.name }));
  }
  if (!adSet.autoPlacement && adSet.selectedPlacements.length > 0) {
    const platforms = Array.from(new Set(adSet.selectedPlacements.map(id => PLACEMENTS.find(p => p.id === id)?.platform).filter(Boolean)));
    targeting.publisher_platforms = platforms;
    const fbPositions = adSet.selectedPlacements.filter(id => PLACEMENTS.find(p => p.id === id)?.platform === "facebook").map(id => PLACEMENTS.find(p => p.id === id)?.position).filter(Boolean);
    const igPositions = adSet.selectedPlacements.filter(id => PLACEMENTS.find(p => p.id === id)?.platform === "instagram").map(id => PLACEMENTS.find(p => p.id === id)?.position).filter(Boolean);
    const anPositions = adSet.selectedPlacements.filter(id => PLACEMENTS.find(p => p.id === id)?.platform === "audience_network").map(id => PLACEMENTS.find(p => p.id === id)?.position).filter(Boolean);
    if (fbPositions.length) targeting.facebook_positions = fbPositions;
    if (igPositions.length) targeting.instagram_positions = igPositions;
    if (anPositions.length) targeting.audience_network_positions = anPositions;
  }
  return targeting;
}

function buildAdCreativePayload(ad: AdState) {
  const creative: any = { format: ad.format };
  if (ad.format === "existing_post" && ad.selectedPost) {
    creative.existingPostId = ad.selectedPost.id;
    creative.existingPostSource = ad.selectedPost.source;
    if (ad.linkUrl) {
      creative.linkUrl = ad.linkUrl;
      creative.callToAction = ad.callToAction;
    }
  } else {
    creative.primaryText = ad.primaryText;
    creative.headline = ad.headline || undefined;
    creative.description = ad.description || undefined;
    creative.linkUrl = ad.linkUrl;
    creative.callToAction = ad.callToAction;
    if (ad.format === "single_image") {
      creative.imageUrl = ad.imageUrl || undefined;
    } else if (ad.format === "video") {
      creative.videoId = ad.videoId || undefined;
      creative.thumbnailUrl = ad.thumbnailUrl || undefined;
    } else if (ad.format === "carousel") {
      creative.carouselCards = ad.carouselCards.filter(c => c.imageUrl).map(c => ({
        imageUrl: c.imageUrl || undefined,
        headline: c.headline || undefined,
        description: c.description || undefined,
        linkUrl: c.linkUrl && isValidUrl(c.linkUrl) ? c.linkUrl : ad.linkUrl,
      }));
    }
  }
  return creative;
}

function isValidUrl(url: string): boolean {
  try { return !!url.trim() && !!new URL(url); } catch { return false; }
}

function isAdValid(ad: AdState): boolean {
  if (ad.format === "existing_post") return !!ad.selectedPost;
  if (!ad.primaryText.trim() || !isValidUrl(ad.linkUrl)) return false;
  if (ad.format === "video") return !!ad.videoId.trim();
  if (ad.format === "carousel") {
    const cardsWithImages = ad.carouselCards.filter(c => c.imageUrl);
    if (cardsWithImages.length < 2) return false;
    return cardsWithImages.every(c => isValidUrl(c.linkUrl) || isValidUrl(ad.linkUrl));
  }
  return true;
}

function isAdSetValid(adSet: AdSetState, budgetLevel: BudgetLevel): boolean {
  const hasLocation = adSet.allPakistan || adSet.selectedGeoLocations.length > 0;
  if (!hasLocation || !adSet.name.trim()) return false;
  if (budgetLevel === "adset") {
    const budgetValue = adSet.budgetType === "daily" ? adSet.dailyBudget : adSet.lifetimeBudget;
    const budgetMin = adSet.budgetType === "daily" ? 100 : 1000;
    if (parseFloat(budgetValue) < budgetMin) return false;
  }
  return adSet.ads.length > 0 && adSet.ads.every(isAdValid);
}

export default function MetaAdLauncher() {
  const { toast } = useToast();
  const [step, setStep] = useState<Step>("campaign");

  const [campaignName, setCampaignName] = useState("");
  const [objective, setObjective] = useState("OUTCOME_SALES");
  const [budgetType, setBudgetType] = useState<BudgetType>("daily");
  const [budgetLevel, setBudgetLevel] = useState<BudgetLevel>("adset");
  const [dailyBudget, setDailyBudget] = useState("500");
  const [lifetimeBudget, setLifetimeBudget] = useState("5000");
  const [spendingLimit, setSpendingLimit] = useState("");
  const [bidStrategy, setBidStrategy] = useState("LOWEST_COST_WITHOUT_CAP");
  const [bidAmount, setBidAmount] = useState("");
  const [selectedPixelId, setSelectedPixelId] = useState("");
  const [conversionEvent, setConversionEvent] = useState("PURCHASE");

  const [adSets, setAdSets] = useState<AdSetState[]>(() => [createDefaultAdSet("", 1)]);

  const [launchResult, setLaunchResult] = useState<any>(null);

  const [showPostPicker, setShowPostPicker] = useState(false);
  const [postSearchQuery, setPostSearchQuery] = useState("");
  const [activePostPickerTarget, setActivePostPickerTarget] = useState<{ adSetIdx: number; adIdx: number } | null>(null);

  const { data: oauthStatus } = useQuery<any>({ queryKey: ["/api/meta/oauth/status"] });
  const { data: pagesData } = useQuery<any>({ queryKey: ["/api/meta/pages"], enabled: !!oauthStatus?.connected });
  const { data: pixelsData } = useQuery<any>({ queryKey: ["/api/meta/pixels"], enabled: !!oauthStatus?.connected });
  const { data: mediaData } = useQuery<any>({ queryKey: ["/api/meta/media-library"], enabled: !!oauthStatus?.connected });
  const { data: audiencesData } = useQuery<{ audiences: { id: string; metaAudienceId: string | null; name: string; audienceType: string }[] }>({
    queryKey: ["/api/meta/audiences"],
    enabled: !!oauthStatus?.connected,
  });

  const [postSearchDebounce, setPostSearchDebounce] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setPostSearchDebounce(postSearchQuery), 300);
    return () => clearTimeout(t);
  }, [postSearchQuery]);

  const { data: fbPostsData, isLoading: fbPostsLoading } = useQuery<{ posts: ExistingPost[] }>({
    queryKey: ["/api/meta/page-posts", postSearchDebounce],
    queryFn: async () => {
      const url = postSearchDebounce ? `/api/meta/page-posts?includeVideos=true&search=${encodeURIComponent(postSearchDebounce)}` : `/api/meta/page-posts?includeVideos=true`;
      const res = await fetch(url, { credentials: "include" });
      return res.json();
    },
    enabled: showPostPicker && !!oauthStatus?.connected,
  });

  const { data: igPostsData, isLoading: igPostsLoading } = useQuery<{ posts: ExistingPost[] }>({
    queryKey: ["/api/meta/ig-media", postSearchDebounce],
    queryFn: async () => {
      const url = postSearchDebounce ? `/api/meta/ig-media?search=${encodeURIComponent(postSearchDebounce)}` : `/api/meta/ig-media`;
      const res = await fetch(url, { credentials: "include" });
      return res.json();
    },
    enabled: showPostPicker && !!oauthStatus?.connected,
  });

  const { data: partnerPostsData, isLoading: partnerPostsLoading } = useQuery<{ posts: ExistingPost[] }>({
    queryKey: ["/api/meta/branded-content-posts", postSearchDebounce],
    queryFn: async () => {
      const url = postSearchDebounce ? `/api/meta/branded-content-posts?search=${encodeURIComponent(postSearchDebounce)}` : `/api/meta/branded-content-posts`;
      const res = await fetch(url, { credentials: "include" });
      return res.json();
    },
    enabled: showPostPicker && !!oauthStatus?.connected,
  });

  const pageId = oauthStatus?.pageId || pagesData?.pages?.[0]?.id || "";
  const pageName = oauthStatus?.pageName || pagesData?.pages?.[0]?.name || "";
  const availablePixels: { id: string; name: string }[] = pixelsData?.pixels || [];
  const effectivePixelId = selectedPixelId || oauthStatus?.pixelId || availablePixels[0]?.id || "";

  useEffect(() => {
    if (!selectedPixelId && effectivePixelId) {
      setSelectedPixelId(effectivePixelId);
    }
  }, [effectivePixelId]);

  const conversionGoals = ["OFFSITE_CONVERSIONS", "LEAD_GENERATION"];
  const hasPixel = selectedPixelId && selectedPixelId !== "none";

  const budgetValue = budgetType === "daily" ? dailyBudget : lifetimeBudget;
  const budgetMin = budgetType === "daily" ? 100 : 1000;
  const budgetWarning = parseFloat(budgetValue) < budgetMin ? `Minimum ${budgetType} budget is PKR ${budgetMin}` : "";

  const needsBidAmount = bidStrategy === "COST_CAP" || bidStrategy === "BID_CAP";
  const canProceedFromCampaign = campaignName.trim() &&
    (budgetLevel === "adset" || (parseFloat(budgetValue) >= budgetMin && (!needsBidAmount || (bidAmount && parseFloat(bidAmount) > 0))));

  const totalAds = adSets.reduce((sum, as2) => sum + as2.ads.length, 0);
  const canProceedFromAdSets = adSets.length > 0 && adSets.every(as2 => isAdSetValid(as2, budgetLevel));

  const updateAdSet = useCallback((adSetId: string, updates: Partial<AdSetState>) => {
    setAdSets(prev => prev.map(as2 => as2.id === adSetId ? { ...as2, ...updates } : as2));
  }, []);

  const updateAd = useCallback((adSetId: string, adId: string, updates: Partial<AdState>) => {
    setAdSets(prev => prev.map(as2 =>
      as2.id === adSetId ? { ...as2, ads: as2.ads.map(ad => ad.id === adId ? { ...ad, ...updates } : ad) } : as2
    ));
  }, []);

  const addAdSet = useCallback(() => {
    if (adSets.length >= 10) return;
    setAdSets(prev => {
      const newAS = createDefaultAdSet(campaignName, prev.length + 1);
      return [...prev.map(as2 => ({ ...as2, isExpanded: false })), newAS];
    });
  }, [adSets.length, campaignName]);

  const removeAdSet = useCallback((id: string) => {
    if (adSets.length <= 1) return;
    setAdSets(prev => prev.filter(as2 => as2.id !== id));
  }, [adSets.length]);

  const duplicateAdSet = useCallback((sourceId: string) => {
    if (adSets.length >= 10) return;
    setAdSets(prev => {
      const source = prev.find(as2 => as2.id === sourceId);
      if (!source) return prev;
      const clone: AdSetState = {
        ...source,
        id: uid(),
        name: `${source.name} (Copy)`,
        isExpanded: true,
        ads: source.ads.map(ad => ({ ...ad, id: uid(), name: `${ad.name} (Copy)`, carouselCards: ad.carouselCards.map(c => ({ ...c, id: uid() })) })),
      };
      return [...prev.map(as2 => ({ ...as2, isExpanded: false })), clone];
    });
  }, [adSets.length]);

  const addAd = useCallback((adSetId: string) => {
    setAdSets(prev => prev.map(as2 => {
      if (as2.id !== adSetId || as2.ads.length >= 10) return as2;
      return { ...as2, ads: [...as2.ads, createDefaultAd(as2.name, as2.ads.length + 1)] };
    }));
  }, []);

  const removeAd = useCallback((adSetId: string, adId: string) => {
    setAdSets(prev => prev.map(as2 => {
      if (as2.id !== adSetId || as2.ads.length <= 1) return as2;
      return { ...as2, ads: as2.ads.filter(ad => ad.id !== adId) };
    }));
  }, []);

  const launchMutation = useMutation({
    mutationFn: async () => {
      const payload: any = {
        campaignName,
        objective,
        budgetLevel,
        pageId,
        pixelId: hasPixel ? selectedPixelId : undefined,
        conversionEvent: hasPixel ? conversionEvent : undefined,
        status: "PAUSED",
        adSets: adSets.map(as2 => {
          const targeting = buildTargetingPayload(as2);
          let startTimeISO: string | undefined;
          let endTimeISO: string | undefined;
          if (as2.startDate) {
            const [sh, sm] = as2.startTime.split(":").map(Number);
            const sd = new Date(as2.startDate);
            sd.setHours(sh, sm, 0, 0);
            startTimeISO = sd.toISOString();
          }
          if (as2.endDate) {
            const [eh, em] = as2.endTime.split(":").map(Number);
            const ed = new Date(as2.endDate);
            ed.setHours(eh, em, 0, 0);
            endTimeISO = ed.toISOString();
          }
          return {
            name: as2.name,
            targeting,
            optimizationGoal: as2.optimizationGoal || undefined,
            useAdvantageAudience: as2.advantagePlusAudience || undefined,
            dailyBudget: budgetLevel === "adset" ? (as2.budgetType === "daily" ? as2.dailyBudget : undefined) : undefined,
            lifetimeBudget: budgetLevel === "adset" ? (as2.budgetType === "lifetime" ? as2.lifetimeBudget : undefined) : undefined,
            budgetType: budgetLevel === "adset" ? as2.budgetType : undefined,
            bidStrategy: as2.bidStrategy !== "LOWEST_COST_WITHOUT_CAP" ? as2.bidStrategy : undefined,
            bidAmount: as2.bidAmount || undefined,
            startTime: startTimeISO,
            endTime: endTimeISO,
            ads: as2.ads.map(ad => ({
              name: ad.name,
              creative: buildAdCreativePayload(ad),
            })),
          };
        }),
      };
      if (budgetLevel === "campaign") {
        payload.budgetType = budgetType;
        payload.dailyBudget = budgetType === "daily" ? dailyBudget : undefined;
        payload.lifetimeBudget = budgetType === "lifetime" ? lifetimeBudget : undefined;
        payload.spendingLimit = spendingLimit || undefined;
        payload.bidStrategy = bidStrategy !== "LOWEST_COST_WITHOUT_CAP" ? bidStrategy : undefined;
        payload.bidAmount = bidAmount || undefined;
      }

      const res = await fetch("/api/meta/launch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        const s = data.step ? `[${data.step}] ` : "";
        throw new Error(`${s}${data.error || "Unknown error"}`);
      }
      return data;
    },
    onSuccess: (data) => {
      setLaunchResult(data);
      const msg = data.failedAds > 0
        ? `Campaign "${campaignName}" created. ${data.succeededAds}/${data.totalAds} ads succeeded, ${data.failedAds} failed.`
        : `Campaign "${campaignName}" created with ${data.totalAds} ad(s) in PAUSED state.`;
      toast({ title: "Campaign Launched!", description: msg });
      queryClient.invalidateQueries({ queryKey: ["/api/meta/launch-jobs"] });
    },
    onError: (error: any) => {
      const msg = error.message || "Unknown error";
      const stepMatch = msg.match(/^\[(.+?)\]\s*/);
      const stepLabel = stepMatch ? stepMatch[1] : undefined;
      const cleanMsg = stepMatch ? msg.replace(stepMatch[0], "") : msg;
      toast({ title: stepLabel ? `Launch Failed at ${stepLabel}` : "Launch Failed", description: cleanMsg, variant: "destructive" });
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
    { key: "adsets", label: "Ad Sets & Ads" },
    { key: "review", label: "Review & Launch" },
  ];
  const currentIdx = steps.findIndex(s => s.key === step);

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
            <CardDescription>Configure your campaign name, objective, budget, pixel and schedule</CardDescription>
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
                <Label>Budget Level</Label>
                <Select value={budgetLevel} onValueChange={(v) => setBudgetLevel(v as BudgetLevel)}>
                  <SelectTrigger data-testid="select-budget-level"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="adset">Ad Set Budget (ABO)</SelectItem>
                    <SelectItem value="campaign">Campaign Budget (CBO)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <Separator />
            <h3 className="font-medium text-sm">Pixel & Conversion Tracking</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Facebook Pixel</Label>
                {availablePixels.length > 0 ? (
                  <Select value={selectedPixelId} onValueChange={setSelectedPixelId}>
                    <SelectTrigger data-testid="select-pixel"><SelectValue placeholder="Select pixel" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">No Pixel</SelectItem>
                      {availablePixels.map(p => <SelectItem key={p.id} value={p.id}>{p.name || p.id}</SelectItem>)}
                    </SelectContent>
                  </Select>
                ) : (
                  <div className="text-sm text-muted-foreground border rounded-md p-2">
                    {selectedPixelId ? `Pixel: ${selectedPixelId}` : "No pixels found. Set up a pixel in Facebook Business Manager."}
                  </div>
                )}
              </div>
              {selectedPixelId && selectedPixelId !== "none" && (
                <div className="space-y-1.5">
                  <Label>Conversion Event</Label>
                  <Select value={conversionEvent} onValueChange={setConversionEvent}>
                    <SelectTrigger data-testid="select-conversion-event"><SelectValue /></SelectTrigger>
                    <SelectContent>{CONVERSION_EVENTS.map(e => <SelectItem key={e.value} value={e.value}>{e.label}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              )}
            </div>

            {budgetLevel === "campaign" && (
              <>
                <Separator />
                <h3 className="font-medium text-sm">Campaign Budget (CBO)</h3>
                <p className="text-xs text-muted-foreground">CBO: Meta distributes budget across ad sets automatically for best results.</p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
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
                    <Label htmlFor="spending-limit">Spending Limit (PKR)</Label>
                    <Input id="spending-limit" type="number" placeholder="No limit" value={spendingLimit} onChange={e => setSpendingLimit(e.target.value)} data-testid="input-spending-limit" />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label>Bid Strategy</Label>
                    <Select value={bidStrategy} onValueChange={setBidStrategy}>
                      <SelectTrigger data-testid="select-bid-strategy"><SelectValue /></SelectTrigger>
                      <SelectContent>{BID_STRATEGIES.map(b => <SelectItem key={b.value} value={b.value}>{b.label}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  {needsBidAmount && (
                    <div className="space-y-1.5">
                      <Label htmlFor="bid-amount">{bidStrategy === "COST_CAP" ? "Cost Cap" : "Bid Cap"} (PKR) *</Label>
                      <Input id="bid-amount" type="number" placeholder="e.g. 50" value={bidAmount} onChange={e => setBidAmount(e.target.value)} data-testid="input-bid-amount" />
                    </div>
                  )}
                </div>
              </>
            )}

            {pageId && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <SiFacebook className="w-4 h-4 text-[#1877F2]" />
                <span>Page: <strong>{pageName || pageId}</strong></span>
              </div>
            )}

            <div className="flex justify-end pt-2">
              <Button onClick={() => setStep("adsets")} disabled={!canProceedFromCampaign} data-testid="button-next-adsets">
                Next: Ad Sets & Ads <ArrowRight className="w-4 h-4 ml-1" />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {step === "adsets" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-semibold">Ad Sets & Ads</h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                {adSets.length} ad set{adSets.length !== 1 ? "s" : ""}, {totalAds} ad{totalAds !== 1 ? "s" : ""} total
              </p>
            </div>
            <Button variant="outline" size="sm" onClick={addAdSet} disabled={adSets.length >= 10} data-testid="button-add-adset">
              <Plus className="w-3.5 h-3.5 mr-1" /> Add Ad Set
            </Button>
          </div>

          {adSets.map((adSet, asIdx) => (
            <AdSetPanel
              key={adSet.id}
              adSet={adSet}
              adSetIdx={asIdx}
              budgetLevel={budgetLevel}
              objective={objective}
              hasPixel={!!hasPixel}
              conversionGoals={conversionGoals}
              audiencesData={audiencesData}
              mediaData={mediaData}
              pageName={pageName}
              onUpdate={(updates) => updateAdSet(adSet.id, updates)}
              onUpdateAd={(adId, updates) => updateAd(adSet.id, adId, updates)}
              onRemove={() => removeAdSet(adSet.id)}
              onDuplicate={() => duplicateAdSet(adSet.id)}
              onAddAd={() => addAd(adSet.id)}
              onRemoveAd={(adId) => removeAd(adSet.id, adId)}
              canRemove={adSets.length > 1}
              canAdd={adSets.length < 10}
              onOpenPostPicker={(adIdx) => {
                setActivePostPickerTarget({ adSetIdx: asIdx, adIdx });
                setShowPostPicker(true);
              }}
            />
          ))}

          <PostPickerDialog
            open={showPostPicker}
            onOpenChange={setShowPostPicker}
            searchQuery={postSearchQuery}
            onSearchChange={setPostSearchQuery}
            fbPosts={fbPostsData?.posts || []}
            igPosts={igPostsData?.posts || []}
            partnerPosts={partnerPostsData?.posts || []}
            mediaLibrary={mediaData?.media || []}
            fbLoading={fbPostsLoading}
            igLoading={igPostsLoading}
            partnerLoading={partnerPostsLoading}
            onSelectPost={(post) => {
              if (activePostPickerTarget) {
                const as2 = adSets[activePostPickerTarget.adSetIdx];
                if (as2) {
                  const ad = as2.ads[activePostPickerTarget.adIdx];
                  if (ad) updateAd(as2.id, ad.id, { selectedPost: post });
                }
              }
              setShowPostPicker(false);
            }}
            onSelectMedia={(media) => {
              if (activePostPickerTarget) {
                const as2 = adSets[activePostPickerTarget.adSetIdx];
                if (as2) {
                  const ad = as2.ads[activePostPickerTarget.adIdx];
                  if (ad) {
                    if (media.type === "video") {
                      updateAd(as2.id, ad.id, { format: "video", videoId: media.metaMediaHash || "", selectedPost: null });
                    } else {
                      updateAd(as2.id, ad.id, { format: "single_image", imageUrl: media.url, selectedPost: null });
                    }
                  }
                }
              }
              setShowPostPicker(false);
            }}
          />

          <div className="flex justify-between pt-2">
            <Button variant="outline" onClick={() => setStep("campaign")} data-testid="button-back-campaign"><ArrowLeft className="w-4 h-4 mr-1" /> Back</Button>
            <Button onClick={() => setStep("review")} disabled={!canProceedFromAdSets} data-testid="button-next-review">
              Next: Review <ArrowRight className="w-4 h-4 ml-1" />
            </Button>
          </div>
        </div>
      )}

      {step === "review" && (
        <Card data-testid="card-review-step">
          <CardHeader>
            <CardTitle className="text-base">Review & Launch</CardTitle>
            <CardDescription>Review your campaign structure before launching. All ads are created in <strong>PAUSED</strong> state.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-3">
              <h3 className="font-medium text-sm">Campaign</h3>
              <div className="space-y-1 text-sm">
                <div className="flex justify-between"><span className="text-muted-foreground">Name</span><span className="font-medium" data-testid="review-campaign-name">{campaignName}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Objective</span><span>{OBJECTIVES.find(o => o.value === objective)?.label}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Budget Level</span><Badge variant="outline">{budgetLevel === "campaign" ? "CBO" : "ABO"}</Badge></div>
                {budgetLevel === "campaign" && (
                  <div className="flex justify-between"><span className="text-muted-foreground">Campaign Budget</span><span>PKR {budgetValue}/{budgetType === "daily" ? "day" : "total"}</span></div>
                )}
                {selectedPixelId && selectedPixelId !== "none" && (
                  <>
                    <div className="flex justify-between"><span className="text-muted-foreground">Pixel</span><span className="font-mono text-xs">{availablePixels.find(p => p.id === selectedPixelId)?.name || selectedPixelId}</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">Conv. Event</span><span>{CONVERSION_EVENTS.find(e => e.value === conversionEvent)?.label}</span></div>
                  </>
                )}
                <div className="flex justify-between"><span className="text-muted-foreground">Ad Sets</span><span>{adSets.length}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Total Ads</span><span>{totalAds}</span></div>
              </div>
            </div>

            <Separator />

            {adSets.map((adSet, asIdx) => (
              <div key={adSet.id} className="border rounded-lg p-4 space-y-3" data-testid={`review-adset-${asIdx}`}>
                <div className="flex items-center gap-2">
                  <Layers className="w-4 h-4 text-primary" />
                  <h4 className="font-medium text-sm">{adSet.name}</h4>
                  <Badge variant="outline" className="text-xs ml-auto">{adSet.ads.length} ad{adSet.ads.length !== 1 ? "s" : ""}</Badge>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                  <div className="space-y-1">
                    <div className="flex justify-between"><span className="text-muted-foreground">Age</span><span>{adSet.minAge} - {adSet.maxAge}</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">Gender</span><span className="capitalize">{adSet.gender}</span></div>
                    <div><span className="text-muted-foreground">Location: </span><span>{adSet.allPakistan ? "All Pakistan" : `${adSet.selectedGeoLocations.length} locations`}</span></div>
                    {!adSet.allPakistan && adSet.selectedGeoLocations.length > 0 && (
                      <div className="text-xs text-muted-foreground pl-2">{adSet.selectedGeoLocations.map(g => g.name).join(", ")}</div>
                    )}
                    {adSet.interests.length > 0 && <div><span className="text-muted-foreground">Interests: </span><span className="text-xs">{adSet.interests.map(i => i.name).join(", ")}</span></div>}
                    {adSet.advantagePlusAudience && <Badge variant="secondary" className="text-xs">Advantage+ On</Badge>}
                    <div className="flex justify-between"><span className="text-muted-foreground">Placements</span><span>{adSet.autoPlacement ? "Automatic" : `${adSet.selectedPlacements.length} selected`}</span></div>
                    {budgetLevel === "adset" && (
                      <div className="flex justify-between"><span className="text-muted-foreground">Budget</span><span>PKR {adSet.budgetType === "daily" ? adSet.dailyBudget : adSet.lifetimeBudget}/{adSet.budgetType === "daily" ? "day" : "total"}</span></div>
                    )}
                  </div>
                  <div className="space-y-2">
                    {adSet.ads.map((ad, adIdx) => (
                      <div key={ad.id} className="border rounded p-2 space-y-1" data-testid={`review-ad-${asIdx}-${adIdx}`}>
                        <p className="text-xs font-medium">{ad.name}</p>
                        <div className="flex justify-between text-xs">
                          <span className="text-muted-foreground">Format</span>
                          <Badge variant="outline" className="text-[10px]">{ad.format === "existing_post" ? "Existing Post" : ad.format === "single_image" ? "Image" : ad.format === "video" ? "Video" : "Carousel"}</Badge>
                        </div>
                        {ad.format === "existing_post" && ad.selectedPost ? (
                          <p className="text-[10px] text-muted-foreground truncate">Post: {ad.selectedPost.message || ad.selectedPost.id}</p>
                        ) : (
                          <>
                            <p className="text-[10px] text-muted-foreground truncate">{ad.primaryText || "(No text)"}</p>
                            {ad.headline && <p className="text-[10px] font-medium truncate">{ad.headline}</p>}
                          </>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ))}

            <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg p-3 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <p className="text-xs text-amber-700 dark:text-amber-400">
                Your campaign ({adSets.length} ad set{adSets.length !== 1 ? "s" : ""}, {totalAds} ad{totalAds !== 1 ? "s" : ""}) will be created in <strong>PAUSED</strong> state. You can review and activate it from Facebook Ads Manager.
              </p>
            </div>

            {!launchResult && (
              <div className="flex justify-between pt-2">
                <Button variant="outline" onClick={() => setStep("adsets")} data-testid="button-back-adsets"><ArrowLeft className="w-4 h-4 mr-1" /> Back</Button>
                <Button onClick={() => launchMutation.mutate()} disabled={launchMutation.isPending} className="gap-2" data-testid="button-launch-ad">
                  {launchMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Rocket className="w-4 h-4" />}
                  Launch Campaign ({totalAds} ad{totalAds !== 1 ? "s" : ""})
                </Button>
              </div>
            )}

            {launchResult && (
              <div className="space-y-3 pt-2" data-testid="launch-result-panel">
                <div className={`rounded-lg p-3 flex items-start gap-2 ${launchResult.failedAds > 0 ? "bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800" : "bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800"}`}>
                  {launchResult.failedAds > 0 ? <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" /> : <CheckCircle2 className="w-5 h-5 text-green-600 shrink-0 mt-0.5" />}
                  <div>
                    <p className="text-sm font-medium" data-testid="text-launch-summary">
                      {launchResult.failedAds > 0
                        ? `Partial success: ${launchResult.succeededAds}/${launchResult.totalAds} ads created, ${launchResult.failedAds} failed`
                        : `All ${launchResult.totalAds} ad(s) created successfully in PAUSED state`}
                    </p>
                    {launchResult.campaignId && <p className="text-xs text-muted-foreground mt-1">Campaign ID: <span className="font-mono">{launchResult.campaignId}</span></p>}
                  </div>
                </div>

                {launchResult.adSets?.map((adSetResult: any, asIdx: number) => (
                  <Collapsible key={asIdx} defaultOpen={!!adSetResult.error || adSetResult.ads?.some((a: any) => a.error)}>
                    <div className="border rounded-lg p-3 space-y-2" data-testid={`result-adset-${asIdx}`}>
                      <CollapsibleTrigger className="flex items-center gap-2 w-full text-left">
                        <Layers className="w-4 h-4 text-primary" />
                        <span className="text-sm font-medium">{adSetResult.name || `Ad Set ${asIdx + 1}`}</span>
                        {adSetResult.adSetId ? (
                          <Badge variant="outline" className="text-xs text-green-600 ml-auto" data-testid={`badge-adset-status-${asIdx}`}>
                            <CheckCircle2 className="w-3 h-3 mr-1" /> Created
                          </Badge>
                        ) : (
                          <Badge variant="destructive" className="text-xs ml-auto" data-testid={`badge-adset-status-${asIdx}`}>
                            <AlertCircle className="w-3 h-3 mr-1" /> Failed
                          </Badge>
                        )}
                        <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />
                      </CollapsibleTrigger>
                      <CollapsibleContent className="space-y-2">
                        {adSetResult.error && (
                          <p className="text-xs text-destructive bg-destructive/10 rounded p-2" data-testid={`text-adset-error-${asIdx}`}>
                            {adSetResult.step && <span className="font-medium">[{adSetResult.step}] </span>}
                            {adSetResult.error}
                          </p>
                        )}
                        {adSetResult.ads?.map((adResult: any, adIdx: number) => (
                          <div key={adIdx} className="ml-4 border rounded p-2 flex items-center justify-between gap-2" data-testid={`result-ad-${asIdx}-${adIdx}`}>
                            <span className="text-xs">{adResult.name || `Ad ${adIdx + 1}`}</span>
                            {adResult.adId ? (
                              <Badge variant="outline" className="text-[10px] text-green-600">
                                <CheckCircle2 className="w-3 h-3 mr-1" /> Created
                              </Badge>
                            ) : (
                              <div className="flex flex-col items-end gap-1">
                                <Badge variant="destructive" className="text-[10px]">
                                  <AlertCircle className="w-3 h-3 mr-1" /> Failed
                                </Badge>
                                {adResult.error && (
                                  <span className="text-[10px] text-destructive max-w-[300px] truncate" title={adResult.error}>
                                    {adResult.step && `[${adResult.step}] `}{adResult.error}
                                  </span>
                                )}
                              </div>
                            )}
                          </div>
                        ))}
                      </CollapsibleContent>
                    </div>
                  </Collapsible>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function AdSetPanel({
  adSet, adSetIdx, budgetLevel, objective, hasPixel, conversionGoals, audiencesData, mediaData, pageName,
  onUpdate, onUpdateAd, onRemove, onDuplicate, onAddAd, onRemoveAd, canRemove, canAdd, onOpenPostPicker,
}: {
  adSet: AdSetState;
  adSetIdx: number;
  budgetLevel: BudgetLevel;
  objective: string;
  hasPixel: boolean;
  conversionGoals: string[];
  audiencesData: any;
  mediaData: any;
  pageName: string;
  onUpdate: (updates: Partial<AdSetState>) => void;
  onUpdateAd: (adId: string, updates: Partial<AdState>) => void;
  onRemove: () => void;
  onDuplicate: () => void;
  onAddAd: () => void;
  onRemoveAd: (adId: string) => void;
  canRemove: boolean;
  canAdd: boolean;
  onOpenPostPicker: (adIdx: number) => void;
}) {
  const [cityFilter, setCityFilter] = useState("");
  const [geoSearchQuery, setGeoSearchQuery] = useState("");
  const [geoSearchResults, setGeoSearchResults] = useState<GeoLocation[]>([]);
  const [interestSearch, setInterestSearch] = useState("");
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

  useEffect(() => {
    if (!geoSearchQuery || geoSearchQuery.length < 2) { setGeoSearchResults([]); return; }
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/meta/targeting-search?type=adgeolocation&q=${encodeURIComponent(geoSearchQuery)}`);
        if (!res.ok) return;
        const data = await res.json();
        setGeoSearchResults((data.data || []).map((item: any) => ({
          key: item.key || item.id || item.name,
          name: item.name,
          type: item.type || "city",
          country_code: item.country_code || "PK",
          region: item.region || "",
        })));
      } catch { setGeoSearchResults([]); }
    }, 400);
    return () => clearTimeout(timer);
  }, [geoSearchQuery]);

  const asBudgetValue = adSet.budgetType === "daily" ? adSet.dailyBudget : adSet.lifetimeBudget;
  const asBudgetMin = adSet.budgetType === "daily" ? 100 : 1000;
  const asBudgetWarning = budgetLevel === "adset" && parseFloat(asBudgetValue) < asBudgetMin ? `Minimum ${adSet.budgetType} budget is PKR ${asBudgetMin}` : "";

  const validAdSets = isAdSetValid(adSet, budgetLevel);
  const adCount = adSet.ads.length;

  return (
    <Card className={`transition-all ${!validAdSets && !adSet.isExpanded ? "border-amber-400" : ""}`} data-testid={`adset-panel-${adSetIdx}`}>
      <button
        className="w-full text-left p-4 flex items-center gap-3 hover:bg-muted/30 transition-colors"
        onClick={() => onUpdate({ isExpanded: !adSet.isExpanded })}
        data-testid={`adset-toggle-${adSetIdx}`}
      >
        <Layers className="w-4 h-4 text-primary shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold truncate">{adSet.name || `Ad Set ${adSetIdx + 1}`}</p>
          <p className="text-xs text-muted-foreground">
            {adCount} ad{adCount !== 1 ? "s" : ""} · {adSet.allPakistan ? "All Pakistan" : `${adSet.selectedGeoLocations.length} locations`}
            {budgetLevel === "adset" && ` · PKR ${asBudgetValue}/${adSet.budgetType === "daily" ? "day" : "total"}`}
          </p>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {!validAdSets && <AlertCircle className="w-3.5 h-3.5 text-amber-500" />}
          {adSet.isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </div>
      </button>

      {adSet.isExpanded && (
        <CardContent className="border-t pt-4 space-y-4">
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex-1 min-w-[200px] space-y-1.5">
              <Label>Ad Set Name</Label>
              <Input value={adSet.name} onChange={e => onUpdate({ name: e.target.value })} placeholder="Ad Set Name" data-testid={`input-adset-name-${adSetIdx}`} />
            </div>
            <div className="flex gap-1 pt-5">
              <Button variant="ghost" size="sm" onClick={onDuplicate} disabled={!canAdd} title="Duplicate" data-testid={`button-duplicate-adset-${adSetIdx}`}>
                <Copy className="w-3.5 h-3.5" />
              </Button>
              <Button variant="ghost" size="sm" onClick={onRemove} disabled={!canRemove} title="Remove" data-testid={`button-remove-adset-${adSetIdx}`}>
                <Trash2 className="w-3.5 h-3.5 text-destructive" />
              </Button>
            </div>
          </div>

          {budgetLevel === "adset" && (
            <>
              <Separator />
              <h4 className="font-medium text-xs uppercase text-muted-foreground tracking-wider">Budget</h4>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Budget Type</Label>
                  <Select value={adSet.budgetType} onValueChange={(v) => onUpdate({ budgetType: v as BudgetType })}>
                    <SelectTrigger className="h-8 text-xs" data-testid={`select-adset-budget-type-${adSetIdx}`}><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="daily">Daily</SelectItem>
                      <SelectItem value="lifetime">Lifetime</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">{adSet.budgetType === "daily" ? "Daily" : "Lifetime"} Budget (PKR)</Label>
                  <Input type="number" className="h-8 text-xs" min={asBudgetMin}
                    value={adSet.budgetType === "daily" ? adSet.dailyBudget : adSet.lifetimeBudget}
                    onChange={e => adSet.budgetType === "daily" ? onUpdate({ dailyBudget: e.target.value }) : onUpdate({ lifetimeBudget: e.target.value })}
                    data-testid={`input-adset-budget-${adSetIdx}`}
                  />
                  {asBudgetWarning && <p className="text-xs text-destructive">{asBudgetWarning}</p>}
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Bid Strategy</Label>
                  <Select value={adSet.bidStrategy} onValueChange={(v) => onUpdate({ bidStrategy: v })}>
                    <SelectTrigger className="h-8 text-xs" data-testid={`select-adset-bid-${adSetIdx}`}><SelectValue /></SelectTrigger>
                    <SelectContent>{BID_STRATEGIES.map(b => <SelectItem key={b.value} value={b.value}>{b.label}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              </div>
              {(adSet.bidStrategy === "COST_CAP" || adSet.bidStrategy === "BID_CAP") && (
                <div className="space-y-1.5">
                  <Label className="text-xs">{adSet.bidStrategy === "COST_CAP" ? "Cost Cap" : "Bid Cap"} (PKR)</Label>
                  <Input type="number" className="h-8 text-xs" placeholder="e.g. 50" value={adSet.bidAmount} onChange={e => onUpdate({ bidAmount: e.target.value })} data-testid={`input-adset-bidamt-${adSetIdx}`} />
                </div>
              )}
            </>
          )}

          <Separator />
          <h4 className="font-medium text-xs uppercase text-muted-foreground tracking-wider">Targeting</h4>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Min Age</Label>
              <Input type="number" min="13" max="65" className="h-8 text-xs" value={adSet.minAge} onChange={e => onUpdate({ minAge: e.target.value })} data-testid={`input-adset-minage-${adSetIdx}`} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Max Age</Label>
              <Input type="number" min="13" max="65" className="h-8 text-xs" value={adSet.maxAge} onChange={e => onUpdate({ maxAge: e.target.value })} data-testid={`input-adset-maxage-${adSetIdx}`} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Gender</Label>
              <Select value={adSet.gender} onValueChange={(v) => onUpdate({ gender: v })}>
                <SelectTrigger className="h-8 text-xs" data-testid={`select-adset-gender-${adSetIdx}`}><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="male">Male</SelectItem>
                  <SelectItem value="female">Female</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs">Location</Label>
              <div className="flex items-center gap-2">
                <Switch checked={adSet.allPakistan} onCheckedChange={(v) => { onUpdate({ allPakistan: v, selectedGeoLocations: v ? [] : adSet.selectedGeoLocations }); }} data-testid={`switch-allpak-${adSetIdx}`} />
                <span className="text-xs font-medium">{adSet.allPakistan ? "All Pakistan" : "Select Cities"}</span>
              </div>
            </div>
            {adSet.allPakistan ? (
              <div className="bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 rounded-lg p-2">
                <p className="text-xs text-green-700 dark:text-green-400">Targeting all of Pakistan.</p>
              </div>
            ) : (
              <>
                <div className="flex flex-wrap gap-1">
                  {PK_PROVINCES.map(prov => {
                    const provinceCityObjs = PK_CITIES.filter(c => c.province === prov.name).map(c => ({ key: c.key, name: c.name, type: "city" as const, country_code: "PK", region: c.province }));
                    const allSelected = provinceCityObjs.every(c => adSet.selectedGeoLocations.some(g => g.name === c.name));
                    return (
                      <Badge key={prov.name} variant={allSelected ? "default" : "outline"} className="cursor-pointer select-none text-[10px]"
                        onClick={() => {
                          const provinceCityNames = provinceCityObjs.map(c => c.name);
                          if (allSelected) onUpdate({ selectedGeoLocations: adSet.selectedGeoLocations.filter(g => !provinceCityNames.includes(g.name)) });
                          else onUpdate({ selectedGeoLocations: [...adSet.selectedGeoLocations.filter(g => !provinceCityNames.includes(g.name)), ...provinceCityObjs] });
                        }}
                        data-testid={`badge-prov-${prov.name.toLowerCase()}-${adSetIdx}`}
                      >{prov.label}</Badge>
                    );
                  })}
                </div>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                  <Input placeholder="Search cities..." value={geoSearchQuery || cityFilter}
                    onChange={e => { setGeoSearchQuery(e.target.value); setCityFilter(e.target.value); }}
                    className="pl-8 h-7 text-xs" data-testid={`input-city-${adSetIdx}`}
                  />
                </div>
                {geoSearchResults.length > 0 && (
                  <div className="border rounded p-1.5 space-y-1 bg-muted/30">
                    <p className="text-[10px] font-medium text-muted-foreground">Meta Location Results</p>
                    <div className="flex flex-wrap gap-1">
                      {geoSearchResults.filter(r => !adSet.selectedGeoLocations.some(g => g.key === r.key)).map(r => (
                        <Badge key={r.key} variant="outline" className="cursor-pointer text-[10px] border-dashed"
                          onClick={() => { onUpdate({ selectedGeoLocations: [...adSet.selectedGeoLocations, r] }); setGeoSearchQuery(""); setGeoSearchResults([]); }}
                        >{r.name}{r.region ? `, ${r.region}` : ""}</Badge>
                      ))}
                    </div>
                  </div>
                )}
                <div className="flex flex-wrap gap-1 max-h-32 overflow-y-auto">
                  {PK_CITIES
                    .filter(c => !cityFilter || c.name.toLowerCase().includes(cityFilter.toLowerCase()))
                    .map(({ name: cityName, key: cityKey, province }) => {
                      const isSelected = adSet.selectedGeoLocations.some(g => g.key === cityKey);
                      return (
                        <Badge key={cityKey} variant={isSelected ? "default" : "outline"} className="cursor-pointer select-none text-[10px]"
                          onClick={() => onUpdate({ selectedGeoLocations: isSelected
                            ? adSet.selectedGeoLocations.filter(g => g.key !== cityKey)
                            : [...adSet.selectedGeoLocations, { key: cityKey, name: cityName, type: "city", country_code: "PK", region: province }]
                          })}
                        >{cityName}</Badge>
                      );
                    })}
                </div>
                <p className="text-[10px] text-muted-foreground">{adSet.selectedGeoLocations.length} locations selected</p>
              </>
            )}
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs">Advantage+ Audience</Label>
              <Switch checked={adSet.advantagePlusAudience} onCheckedChange={(v) => onUpdate({ advantagePlusAudience: v })} data-testid={`switch-adv-${adSetIdx}`} />
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-xs">Interest Targeting</Label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              <Input placeholder="Search interests..." value={interestSearch} onChange={e => setInterestSearch(e.target.value)}
                className="pl-8 h-7 text-xs" data-testid={`input-interest-${adSetIdx}`}
              />
            </div>
            {interestSearch.length >= 2 && (
              <div className="border rounded max-h-32 overflow-y-auto">
                {interestLoading ? (
                  <div className="p-2 text-xs text-muted-foreground flex items-center gap-1"><Loader2 className="w-3 h-3 animate-spin" /> Searching...</div>
                ) : (interestResults?.data || []).length === 0 ? (
                  <div className="p-2 text-xs text-muted-foreground">No interests found</div>
                ) : (
                  (interestResults?.data || []).map((item) => (
                    <button key={item.id} className="w-full px-2 py-1.5 text-left text-xs hover:bg-muted flex items-center justify-between"
                      onClick={() => { if (!adSet.interests.find(i => i.id === item.id)) onUpdate({ interests: [...adSet.interests, item] }); setInterestSearch(""); }}>
                      <span>{item.name}</span>
                      {item.audience_size && <span className="text-[10px] text-muted-foreground">{(item.audience_size / 1000000).toFixed(1)}M</span>}
                    </button>
                  ))
                )}
              </div>
            )}
            {adSet.interests.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {adSet.interests.map(i => (
                  <Badge key={i.id} variant="secondary" className="gap-0.5 text-[10px]">
                    {i.name}
                    <X className="w-2.5 h-2.5 cursor-pointer" onClick={() => onUpdate({ interests: adSet.interests.filter(x => x.id !== i.id) })} />
                  </Badge>
                ))}
              </div>
            )}
          </div>

          {(audiencesData?.audiences?.length ?? 0) > 0 && (
            <>
              <div className="space-y-1.5">
                <Label className="text-xs">Custom Audiences (Include)</Label>
                <div className="flex flex-wrap gap-1">
                  {audiencesData?.audiences?.filter((a: any) => a.metaAudienceId).map((a: any) => {
                    const isSelected = adSet.selectedAudiences.some(s => s.id === a.metaAudienceId);
                    return (
                      <Badge key={a.id} variant={isSelected ? "default" : "outline"} className="cursor-pointer text-[10px]"
                        onClick={() => {
                          if (isSelected) onUpdate({ selectedAudiences: adSet.selectedAudiences.filter(s => s.id !== a.metaAudienceId) });
                          else {
                            onUpdate({ selectedAudiences: [...adSet.selectedAudiences, { id: a.metaAudienceId!, name: a.name }], excludedAudiences: adSet.excludedAudiences.filter(s => s.id !== a.metaAudienceId) });
                          }
                        }}
                      >{a.name}</Badge>
                    );
                  })}
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Custom Audiences (Exclude)</Label>
                <div className="flex flex-wrap gap-1">
                  {audiencesData?.audiences?.filter((a: any) => a.metaAudienceId).map((a: any) => {
                    const isExcluded = adSet.excludedAudiences.some(s => s.id === a.metaAudienceId);
                    return (
                      <Badge key={a.id} variant={isExcluded ? "destructive" : "outline"} className="cursor-pointer text-[10px]"
                        onClick={() => {
                          if (isExcluded) onUpdate({ excludedAudiences: adSet.excludedAudiences.filter(s => s.id !== a.metaAudienceId) });
                          else onUpdate({ excludedAudiences: [...adSet.excludedAudiences, { id: a.metaAudienceId!, name: a.name }], selectedAudiences: adSet.selectedAudiences.filter(s => s.id !== a.metaAudienceId) });
                        }}
                      >{a.name}</Badge>
                    );
                  })}
                </div>
              </div>
            </>
          )}

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs">Placements</Label>
              <div className="flex items-center gap-2">
                <Switch checked={adSet.autoPlacement} onCheckedChange={(v) => onUpdate({ autoPlacement: v })} data-testid={`switch-placement-${adSetIdx}`} />
                <span className="text-xs text-muted-foreground">{adSet.autoPlacement ? "Auto" : "Manual"}</span>
              </div>
            </div>
            {!adSet.autoPlacement && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                {PLACEMENTS.map(p => (
                  <label key={p.id} className="flex items-center gap-1.5 p-1.5 rounded border cursor-pointer hover:bg-muted/50 text-xs">
                    <Checkbox
                      checked={adSet.selectedPlacements.includes(p.id)}
                      onCheckedChange={(checked) => {
                        onUpdate({ selectedPlacements: checked ? [...adSet.selectedPlacements, p.id] : adSet.selectedPlacements.filter(x => x !== p.id) });
                      }}
                    />
                    {p.platform === "instagram" ? <SiInstagram className="w-3 h-3 text-pink-500" /> : <SiFacebook className="w-3 h-3 text-[#1877F2]" />}
                    {p.label}
                  </label>
                ))}
              </div>
            )}
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Optimization Goal</Label>
            <Select value={adSet.optimizationGoal || (() => {
              const m: Record<string, string> = { OUTCOME_SALES: hasPixel ? "OFFSITE_CONVERSIONS" : "LINK_CLICKS", OUTCOME_LEADS: hasPixel ? "LEAD_GENERATION" : "LINK_CLICKS", OUTCOME_ENGAGEMENT: "POST_ENGAGEMENT", OUTCOME_AWARENESS: "REACH", OUTCOME_TRAFFIC: "LANDING_PAGE_VIEWS" };
              return m[objective] || (hasPixel ? "OFFSITE_CONVERSIONS" : "LINK_CLICKS");
            })()} onValueChange={(v) => onUpdate({ optimizationGoal: v })}>
              <SelectTrigger className="h-8 text-xs" data-testid={`select-optgoal-${adSetIdx}`}><SelectValue /></SelectTrigger>
              <SelectContent>{OPTIMIZATION_GOALS.filter(o => hasPixel || !conversionGoals.includes(o.value)).map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
            </Select>
          </div>

          <Separator />
          <h4 className="font-medium text-xs uppercase text-muted-foreground tracking-wider">Schedule (Optional)</h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Start Date</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className="w-full justify-start text-left text-xs h-8" data-testid={`btn-start-${adSetIdx}`}>
                    <CalendarIcon className="mr-1.5 h-3.5 w-3.5" />
                    {adSet.startDate ? format(adSet.startDate, "PPP") : "Not set"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0"><Calendar mode="single" selected={adSet.startDate} onSelect={(d) => onUpdate({ startDate: d })} initialFocus /></PopoverContent>
              </Popover>
              {adSet.startDate && (
                <Select value={adSet.startTime} onValueChange={(v) => onUpdate({ startTime: v })}>
                  <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>{TIME_OPTIONS.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
                </Select>
              )}
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">End Date</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className="w-full justify-start text-left text-xs h-8" data-testid={`btn-end-${adSetIdx}`}>
                    <CalendarIcon className="mr-1.5 h-3.5 w-3.5" />
                    {adSet.endDate ? format(adSet.endDate, "PPP") : "No end date"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0"><Calendar mode="single" selected={adSet.endDate} onSelect={(d) => onUpdate({ endDate: d })} initialFocus /></PopoverContent>
              </Popover>
              {adSet.endDate && (
                <Select value={adSet.endTime} onValueChange={(v) => onUpdate({ endTime: v })}>
                  <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>{TIME_OPTIONS.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
                </Select>
              )}
            </div>
          </div>

          <Separator />
          <div className="flex items-center justify-between">
            <h4 className="font-medium text-xs uppercase text-muted-foreground tracking-wider">Ads ({adSet.ads.length})</h4>
            <Button variant="outline" size="sm" className="h-7 text-xs" onClick={onAddAd} disabled={adSet.ads.length >= 10} data-testid={`btn-add-ad-${adSetIdx}`}>
              <Plus className="w-3 h-3 mr-1" /> Add Ad
            </Button>
          </div>

          {adSet.ads.map((ad, adIdx) => (
            <AdCard
              key={ad.id}
              ad={ad}
              adIdx={adIdx}
              adSetIdx={adSetIdx}
              mediaData={mediaData}
              pageName={pageName}
              canRemove={adSet.ads.length > 1}
              onUpdate={(updates) => onUpdateAd(ad.id, updates)}
              onRemove={() => onRemoveAd(ad.id)}
              onOpenPostPicker={() => onOpenPostPicker(adIdx)}
            />
          ))}
        </CardContent>
      )}
    </Card>
  );
}

function AdCard({
  ad, adIdx, adSetIdx, mediaData, pageName, canRemove,
  onUpdate, onRemove, onOpenPostPicker,
}: {
  ad: AdState;
  adIdx: number;
  adSetIdx: number;
  mediaData: any;
  pageName: string;
  canRemove: boolean;
  onUpdate: (updates: Partial<AdState>) => void;
  onRemove: () => void;
  onOpenPostPicker: () => void;
}) {
  const [showPreview, setShowPreview] = useState(false);
  const valid = isAdValid(ad);

  return (
    <div className={`border rounded-lg p-3 space-y-3 ${!valid ? "border-amber-300" : ""}`} data-testid={`ad-card-${adSetIdx}-${adIdx}`}>
      <div className="flex items-center gap-2">
        <div className="flex-1 min-w-0">
          <Input value={ad.name} onChange={e => onUpdate({ name: e.target.value })} className="h-7 text-xs font-medium" placeholder="Ad Name" data-testid={`input-ad-name-${adSetIdx}-${adIdx}`} />
        </div>
        <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => setShowPreview(!showPreview)} title="Preview" data-testid={`btn-preview-${adSetIdx}-${adIdx}`}>
          <Eye className="w-3.5 h-3.5" />
        </Button>
        <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={onRemove} disabled={!canRemove} title="Remove" data-testid={`btn-remove-ad-${adSetIdx}-${adIdx}`}>
          <Trash2 className="w-3.5 h-3.5 text-destructive" />
        </Button>
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs">Ad Format</Label>
        <div className="flex gap-1.5 flex-wrap">
          {([
            { value: "single_image" as AdFormat, label: "Image", icon: ImageIcon },
            { value: "video" as AdFormat, label: "Video", icon: Film },
            { value: "carousel" as AdFormat, label: "Carousel", icon: Plus },
            { value: "existing_post" as AdFormat, label: "Existing Post", icon: FileText },
          ]).map(f => (
            <Button key={f.value} variant={ad.format === f.value ? "default" : "outline"} size="sm" className="gap-1 text-xs h-7 px-2"
              onClick={() => { onUpdate({ format: f.value }); if (f.value === "existing_post" && !ad.selectedPost) onOpenPostPicker(); }}
              data-testid={`btn-format-${f.value}-${adSetIdx}-${adIdx}`}
            >
              <f.icon className="w-3 h-3" /> {f.label}
            </Button>
          ))}
        </div>
      </div>

      {ad.format === "existing_post" && (
        <div className="space-y-2">
          {ad.selectedPost ? (
            <div className="border rounded p-2 flex items-start gap-2">
              {ad.selectedPost.fullPicture && <img src={ad.selectedPost.fullPicture} alt="" className="w-12 h-12 rounded object-cover shrink-0" />}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1 mb-0.5">
                  {ad.selectedPost.source === "facebook" && <SiFacebook className="w-3 h-3 text-[#1877F2]" />}
                  {ad.selectedPost.source === "instagram" && <SiInstagram className="w-3 h-3 text-[#E4405F]" />}
                  <span className="text-[10px] text-muted-foreground capitalize">{ad.selectedPost.source}</span>
                </div>
                <p className="text-xs line-clamp-1">{ad.selectedPost.message || "(No text)"}</p>
                <p className="text-[9px] text-muted-foreground font-mono">ID: {ad.selectedPost.id}</p>
              </div>
              <div className="flex gap-1 shrink-0">
                <Button variant="outline" size="sm" className="h-6 text-[10px] px-1.5" onClick={onOpenPostPicker}>Change</Button>
                <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => onUpdate({ selectedPost: null })}><X className="w-3 h-3" /></Button>
              </div>
            </div>
          ) : (
            <Button variant="outline" className="w-full h-14 border-dashed gap-1.5 text-xs" onClick={onOpenPostPicker} data-testid={`btn-pick-post-${adSetIdx}-${adIdx}`}>
              <Search className="w-3.5 h-3.5" /> Select an Existing Post
            </Button>
          )}
          {ad.selectedPost && (
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label className="text-[10px]">CTA Link (optional)</Label>
                <Input type="url" className="h-7 text-xs" placeholder="https://yourstore.com" value={ad.linkUrl} onChange={e => onUpdate({ linkUrl: e.target.value })} data-testid={`input-eplink-${adSetIdx}-${adIdx}`} />
              </div>
              <div className="space-y-1">
                <Label className="text-[10px]">CTA</Label>
                <Select value={ad.callToAction} onValueChange={(v) => onUpdate({ callToAction: v })}>
                  <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>{CTA_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
          )}
        </div>
      )}

      {ad.format !== "existing_post" && (
        <>
          <div className="space-y-1">
            <Label className="text-xs">Primary Text *</Label>
            <Textarea rows={2} className="text-xs min-h-[50px]" placeholder="Write your ad copy..." value={ad.primaryText} onChange={e => onUpdate({ primaryText: e.target.value })} data-testid={`textarea-text-${adSetIdx}-${adIdx}`} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label className="text-xs">Headline</Label>
              <Input className="h-7 text-xs" placeholder="e.g. 50% Off" value={ad.headline} onChange={e => onUpdate({ headline: e.target.value })} data-testid={`input-headline-${adSetIdx}-${adIdx}`} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Description</Label>
              <Input className="h-7 text-xs" placeholder="e.g. Free delivery" value={ad.description} onChange={e => onUpdate({ description: e.target.value })} data-testid={`input-desc-${adSetIdx}-${adIdx}`} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label className="text-xs">Landing Page URL *</Label>
              <Input type="url" className="h-7 text-xs" placeholder="https://yourstore.com" value={ad.linkUrl} onChange={e => onUpdate({ linkUrl: e.target.value })} data-testid={`input-url-${adSetIdx}-${adIdx}`} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Call to Action</Label>
              <Select value={ad.callToAction} onValueChange={(v) => onUpdate({ callToAction: v })}>
                <SelectTrigger className="h-7 text-xs" data-testid={`select-cta-${adSetIdx}-${adIdx}`}><SelectValue /></SelectTrigger>
                <SelectContent>{CTA_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
        </>
      )}

      {ad.format === "single_image" && (
        <div className="space-y-1">
          <Label className="text-xs">Image URL</Label>
          <Input type="url" className="h-7 text-xs" placeholder="https://example.com/image.jpg" value={ad.imageUrl} onChange={e => onUpdate({ imageUrl: e.target.value })} data-testid={`input-imgurl-${adSetIdx}-${adIdx}`} />
          {mediaData?.media?.length > 0 && (
            <div className="flex gap-1.5 overflow-x-auto pb-1 mt-1">
              {mediaData.media.filter((m: any) => m.type === "image").slice(0, 6).map((m: any) => (
                <button key={m.id} onClick={() => onUpdate({ imageUrl: m.url })} className={`shrink-0 w-10 h-10 rounded border-2 overflow-hidden ${ad.imageUrl === m.url ? "border-primary" : "border-transparent hover:border-muted-foreground/30"}`}>
                  <img src={m.url} alt={m.name} className="w-full h-full object-cover" />
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {ad.format === "video" && (
        <div className="space-y-2">
          <div className="space-y-1">
            <Label className="text-xs">Video ID</Label>
            <Input className="h-7 text-xs" placeholder="Meta Video ID" value={ad.videoId} onChange={e => onUpdate({ videoId: e.target.value })} data-testid={`input-vid-${adSetIdx}-${adIdx}`} />
            {mediaData?.media?.length > 0 && (
              <div className="flex gap-1.5 overflow-x-auto pb-1 mt-1">
                {mediaData.media.filter((m: any) => m.type === "video").slice(0, 6).map((m: any) => (
                  <button key={m.id} onClick={() => onUpdate({ videoId: m.metaMediaHash || "" })} className={`shrink-0 px-2 py-1 rounded border text-[10px] ${ad.videoId === m.metaMediaHash ? "border-primary bg-primary/10" : "border-muted"}`}>
                    <Film className="w-3 h-3 mx-auto mb-0.5" />{m.name}
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Thumbnail URL</Label>
            <Input type="url" className="h-7 text-xs" placeholder="https://example.com/thumb.jpg" value={ad.thumbnailUrl} onChange={e => onUpdate({ thumbnailUrl: e.target.value })} data-testid={`input-thumb-${adSetIdx}-${adIdx}`} />
          </div>
        </div>
      )}

      {ad.format === "carousel" && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label className="text-xs">Carousel Cards ({ad.carouselCards.length})</Label>
            <Button variant="outline" size="sm" className="h-6 text-[10px] px-1.5"
              onClick={() => onUpdate({ carouselCards: [...ad.carouselCards, { id: uid(), imageUrl: "", headline: "", description: "", linkUrl: "" }] })}
              disabled={ad.carouselCards.length >= 10}
            ><Plus className="w-2.5 h-2.5 mr-0.5" /> Card</Button>
          </div>
          {ad.carouselCards.map((card, cIdx) => (
            <div key={card.id} className="border rounded p-2 space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-medium">Card {cIdx + 1}</span>
                <Button variant="ghost" size="sm" className="h-5 w-5 p-0"
                  onClick={() => { if (ad.carouselCards.length > 2) onUpdate({ carouselCards: ad.carouselCards.filter(c => c.id !== card.id) }); }}
                  disabled={ad.carouselCards.length <= 2}
                ><Trash2 className="w-2.5 h-2.5" /></Button>
              </div>
              <Input placeholder="Image URL" className="h-6 text-[10px]" value={card.imageUrl}
                onChange={e => onUpdate({ carouselCards: ad.carouselCards.map(c => c.id === card.id ? { ...c, imageUrl: e.target.value } : c) })}
              />
              <div className="grid grid-cols-2 gap-1">
                <Input placeholder="Headline" className="h-6 text-[10px]" value={card.headline}
                  onChange={e => onUpdate({ carouselCards: ad.carouselCards.map(c => c.id === card.id ? { ...c, headline: e.target.value } : c) })}
                />
                <Input placeholder="Card URL" className="h-6 text-[10px]" value={card.linkUrl}
                  onChange={e => onUpdate({ carouselCards: ad.carouselCards.map(c => c.id === card.id ? { ...c, linkUrl: e.target.value } : c) })}
                />
              </div>
            </div>
          ))}
        </div>
      )}

      {showPreview && ad.format !== "existing_post" && (
        <>
          <Separator />
          <AdPreview primaryText={ad.primaryText} headline={ad.headline} imageUrl={ad.imageUrl} thumbnailUrl={ad.thumbnailUrl}
            linkUrl={ad.linkUrl} callToAction={ad.callToAction} pageName={pageName} format={ad.format} carouselCards={ad.carouselCards} />
        </>
      )}
      {showPreview && ad.format === "existing_post" && ad.selectedPost && (
        <>
          <Separator />
          <div className="border rounded-lg overflow-hidden bg-white dark:bg-zinc-900 max-w-xs mx-auto shadow-sm">
            <div className="p-2 flex items-center gap-2">
              <div className="w-6 h-6 rounded-full bg-blue-500 flex items-center justify-center text-white text-[10px] font-bold">{(pageName || "P")[0]}</div>
              <div>
                <p className="text-xs font-semibold">{pageName || "Your Page"}</p>
                <p className="text-[9px] text-muted-foreground">Sponsored</p>
              </div>
            </div>
            <div className="px-2 pb-1"><p className="text-xs">{ad.selectedPost.message || "(No text)"}</p></div>
            {ad.selectedPost.fullPicture && <img src={ad.selectedPost.fullPicture} alt="Post" className="w-full aspect-square object-cover" />}
          </div>
        </>
      )}
    </div>
  );
}
