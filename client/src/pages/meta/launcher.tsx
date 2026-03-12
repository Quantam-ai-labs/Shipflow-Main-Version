import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Loader2, Rocket, ArrowRight, ArrowLeft, CheckCircle2, AlertCircle, ImageIcon } from "lucide-react";
import { SiFacebook } from "react-icons/si";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

type Step = "campaign" | "targeting" | "creative" | "review";

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

export default function MetaAdLauncher() {
  const { toast } = useToast();
  const [step, setStep] = useState<Step>("campaign");

  const [campaignName, setCampaignName] = useState("");
  const [objective, setObjective] = useState("OUTCOME_SALES");
  const [dailyBudget, setDailyBudget] = useState("500");

  const [minAge, setMinAge] = useState("18");
  const [maxAge, setMaxAge] = useState("65");
  const [gender, setGender] = useState("all");
  const [selectedCities, setSelectedCities] = useState<string[]>(["Karachi", "Lahore"]);

  const [primaryText, setPrimaryText] = useState("");
  const [headline, setHeadline] = useState("");
  const [description, setDescription] = useState("");
  const [linkUrl, setLinkUrl] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [callToAction, setCallToAction] = useState("SHOP_NOW");

  const { data: oauthStatus } = useQuery<any>({
    queryKey: ["/api/meta/oauth/status"],
  });

  const { data: pagesData } = useQuery<any>({
    queryKey: ["/api/meta/pages"],
    enabled: !!oauthStatus?.connected,
  });

  const { data: pixelsData } = useQuery<any>({
    queryKey: ["/api/meta/pixels"],
    enabled: !!oauthStatus?.connected,
  });

  const { data: mediaData } = useQuery<any>({
    queryKey: ["/api/meta/media-library"],
    enabled: !!oauthStatus?.connected,
  });

  const pageId = oauthStatus?.pageId || pagesData?.pages?.[0]?.id || "";
  const pixelId = oauthStatus?.pixelId || pixelsData?.pixels?.[0]?.id || "";

  const launchMutation = useMutation({
    mutationFn: async () => {
      const targeting: any = {
        geo_locations: {
          countries: ["PK"],
          cities: selectedCities.map(cityName => {
            const cityData = PK_CITIES.find(c => c.name === cityName);
            return {
              key: cityData?.key || "",
              name: cityName,
              country: "PK",
            };
          }),
        },
        age_min: parseInt(minAge),
        age_max: parseInt(maxAge),
      };

      if (gender !== "all") {
        targeting.genders = gender === "male" ? [1] : [2];
      }

      const res = await apiRequest("POST", "/api/meta/launch", {
        campaignName,
        objective,
        dailyBudget,
        targeting,
        creative: {
          primaryText,
          headline: headline || undefined,
          description: description || undefined,
          linkUrl,
          imageUrl: imageUrl || undefined,
          callToAction,
        },
        pageId,
        pixelId: pixelId || undefined,
        status: "PAUSED",
      });
      return res.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Ad Launched Successfully!",
        description: `Campaign "${campaignName}" created in PAUSED state. Go to Facebook Ads Manager to activate it.`,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/meta/launch-jobs"] });
    },
    onError: (error: any) => {
      toast({
        title: "Launch Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  if (!oauthStatus?.connected && !oauthStatus?.hasToken) {
    return (
      <div className="p-4 md:p-6 max-w-[900px] mx-auto space-y-6" data-testid="meta-launcher-page">
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-page-title">Ad Launcher</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Create and launch Facebook/Meta ads directly from 1SOL.AI
          </p>
        </div>
        <Card>
          <CardContent className="p-8 text-center space-y-4">
            <SiFacebook className="w-12 h-12 text-[#1877F2] mx-auto" />
            <h2 className="text-lg font-semibold">Connect Your Facebook Account</h2>
            <p className="text-sm text-muted-foreground max-w-md mx-auto">
              You need to connect your Facebook account before you can create ads.
              Go to Settings &gt; Marketing to connect via OAuth or enter your credentials.
            </p>
            <Button asChild data-testid="button-go-to-settings">
              <a href="/settings?tab=marketing">Go to Settings</a>
            </Button>
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

  const canProceedFromCampaign = campaignName.trim() && dailyBudget;
  const canProceedFromTargeting = selectedCities.length > 0;
  const canProceedFromCreative = primaryText.trim() && linkUrl.trim();

  return (
    <div className="p-4 md:p-6 max-w-[900px] mx-auto space-y-6" data-testid="meta-launcher-page">
      <div>
        <h1 className="text-2xl font-bold" data-testid="text-page-title">Ad Launcher</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Create and launch Facebook/Meta ads directly from 1SOL.AI
        </p>
      </div>

      <div className="flex items-center gap-2 overflow-x-auto pb-2">
        {steps.map((s, idx) => (
          <div key={s.key} className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => idx <= currentIdx && setStep(s.key)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                s.key === step
                  ? "bg-primary text-primary-foreground"
                  : idx < currentIdx
                  ? "bg-primary/10 text-primary cursor-pointer"
                  : "bg-muted text-muted-foreground"
              }`}
              data-testid={`step-${s.key}`}
            >
              {idx < currentIdx ? (
                <CheckCircle2 className="w-3.5 h-3.5" />
              ) : (
                <span className="w-5 h-5 rounded-full bg-current/20 text-xs flex items-center justify-center font-bold">{idx + 1}</span>
              )}
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
            <CardDescription>Configure your campaign name, objective and budget</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="campaign-name">Campaign Name</Label>
              <Input
                id="campaign-name"
                placeholder="e.g. Summer Sale - Karachi"
                value={campaignName}
                onChange={e => setCampaignName(e.target.value)}
                data-testid="input-campaign-name"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Objective</Label>
                <Select value={objective} onValueChange={setObjective}>
                  <SelectTrigger data-testid="select-objective">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {OBJECTIVES.map(o => (
                      <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="daily-budget">Daily Budget (PKR)</Label>
                <Input
                  id="daily-budget"
                  type="number"
                  min="100"
                  value={dailyBudget}
                  onChange={e => setDailyBudget(e.target.value)}
                  data-testid="input-daily-budget"
                />
              </div>
            </div>

            {pageId && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <SiFacebook className="w-4 h-4 text-[#1877F2]" />
                <span>Page: <strong>{oauthStatus?.pageName || pageId}</strong></span>
              </div>
            )}

            <div className="flex justify-end pt-2">
              <Button
                onClick={() => setStep("targeting")}
                disabled={!canProceedFromCampaign}
                data-testid="button-next-targeting"
              >
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
                <Input
                  type="number"
                  min="13"
                  max="65"
                  value={minAge}
                  onChange={e => setMinAge(e.target.value)}
                  data-testid="input-min-age"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Max Age</Label>
                <Input
                  type="number"
                  min="13"
                  max="65"
                  value={maxAge}
                  onChange={e => setMaxAge(e.target.value)}
                  data-testid="input-max-age"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Gender</Label>
                <Select value={gender} onValueChange={setGender}>
                  <SelectTrigger data-testid="select-gender">
                    <SelectValue />
                  </SelectTrigger>
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
                    <Badge
                      key={cityName}
                      variant={isSelected ? "default" : "outline"}
                      className="cursor-pointer select-none"
                      onClick={() => {
                        setSelectedCities(prev =>
                          isSelected ? prev.filter(c => c !== cityName) : [...prev, cityName]
                        );
                      }}
                      data-testid={`badge-city-${cityName.toLowerCase()}`}
                    >
                      {cityName}
                    </Badge>
                  );
                })}
              </div>
              <p className="text-xs text-muted-foreground">
                {selectedCities.length} cities selected
              </p>
            </div>

            <div className="flex justify-between pt-2">
              <Button variant="outline" onClick={() => setStep("campaign")} data-testid="button-back-campaign">
                <ArrowLeft className="w-4 h-4 mr-1" /> Back
              </Button>
              <Button
                onClick={() => setStep("creative")}
                disabled={!canProceedFromTargeting}
                data-testid="button-next-creative"
              >
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
              <Label htmlFor="primary-text">Primary Text *</Label>
              <Textarea
                id="primary-text"
                placeholder="Write your ad copy here..."
                rows={3}
                value={primaryText}
                onChange={e => setPrimaryText(e.target.value)}
                data-testid="textarea-primary-text"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="headline">Headline</Label>
                <Input
                  id="headline"
                  placeholder="e.g. 50% Off Summer Collection"
                  value={headline}
                  onChange={e => setHeadline(e.target.value)}
                  data-testid="input-headline"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ad-description">Description</Label>
                <Input
                  id="ad-description"
                  placeholder="e.g. Free delivery nationwide"
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  data-testid="input-description"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="link-url">Landing Page URL *</Label>
                <Input
                  id="link-url"
                  type="url"
                  placeholder="https://yourstore.com/collection"
                  value={linkUrl}
                  onChange={e => setLinkUrl(e.target.value)}
                  data-testid="input-link-url"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Call to Action</Label>
                <Select value={callToAction} onValueChange={setCallToAction}>
                  <SelectTrigger data-testid="select-cta">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CTA_OPTIONS.map(o => (
                      <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="image-url">Image URL</Label>
              <Input
                id="image-url"
                type="url"
                placeholder="https://example.com/ad-image.jpg"
                value={imageUrl}
                onChange={e => setImageUrl(e.target.value)}
                data-testid="input-image-url"
              />
              {mediaData?.media?.length > 0 && (
                <div className="mt-2">
                  <p className="text-xs text-muted-foreground mb-1.5">Or select from Media Library:</p>
                  <div className="flex gap-2 overflow-x-auto pb-1">
                    {mediaData.media.slice(0, 8).map((m: any) => (
                      <button
                        key={m.id}
                        onClick={() => setImageUrl(m.url)}
                        className={`shrink-0 w-16 h-16 rounded border-2 overflow-hidden transition-colors ${
                          imageUrl === m.url ? "border-primary" : "border-transparent hover:border-muted-foreground/30"
                        }`}
                        data-testid={`media-select-${m.id}`}
                      >
                        <img src={m.url} alt={m.name} className="w-full h-full object-cover" />
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="flex justify-between pt-2">
              <Button variant="outline" onClick={() => setStep("targeting")} data-testid="button-back-targeting">
                <ArrowLeft className="w-4 h-4 mr-1" /> Back
              </Button>
              <Button
                onClick={() => setStep("review")}
                disabled={!canProceedFromCreative}
                data-testid="button-next-review"
              >
                Next: Review <ArrowRight className="w-4 h-4 ml-1" />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {step === "review" && (
        <Card data-testid="card-review-step">
          <CardHeader>
            <CardTitle className="text-base">Review & Launch</CardTitle>
            <CardDescription>
              Review your ad configuration before launching. Ads are created in <strong>PAUSED</strong> state — activate them from Facebook Ads Manager when ready.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-3">
                <h3 className="font-medium text-sm">Campaign</h3>
                <div className="space-y-1 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Name</span>
                    <span className="font-medium" data-testid="review-campaign-name">{campaignName}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Objective</span>
                    <span>{OBJECTIVES.find(o => o.value === objective)?.label}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Daily Budget</span>
                    <span>PKR {dailyBudget}</span>
                  </div>
                </div>

                <Separator />

                <h3 className="font-medium text-sm">Targeting</h3>
                <div className="space-y-1 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Age</span>
                    <span>{minAge} - {maxAge}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Gender</span>
                    <span className="capitalize">{gender}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Cities: </span>
                    <span>{selectedCities.join(", ")}</span>
                  </div>
                </div>
              </div>

              <div className="space-y-3">
                <h3 className="font-medium text-sm">Creative</h3>
                <div className="space-y-2 text-sm">
                  <div>
                    <span className="text-muted-foreground block">Primary Text</span>
                    <p className="mt-0.5">{primaryText}</p>
                  </div>
                  {headline && (
                    <div>
                      <span className="text-muted-foreground block">Headline</span>
                      <p className="mt-0.5 font-medium">{headline}</p>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">CTA</span>
                    <span>{CTA_OPTIONS.find(c => c.value === callToAction)?.label}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground block">URL</span>
                    <a href={linkUrl} target="_blank" rel="noreferrer" className="text-primary text-xs break-all">{linkUrl}</a>
                  </div>
                  {imageUrl && (
                    <div className="mt-2">
                      <img src={imageUrl} alt="Ad preview" className="rounded border max-h-32 object-cover" />
                    </div>
                  )}
                </div>
              </div>
            </div>

            <Separator />

            <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg p-3 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <p className="text-xs text-amber-700 dark:text-amber-400">
                Your ad will be created in <strong>PAUSED</strong> state. You can review and activate it directly from Facebook Ads Manager. Meta may take a few minutes to review your ad before it can go live.
              </p>
            </div>

            <div className="flex justify-between pt-2">
              <Button variant="outline" onClick={() => setStep("creative")} data-testid="button-back-creative">
                <ArrowLeft className="w-4 h-4 mr-1" /> Back
              </Button>
              <Button
                onClick={() => launchMutation.mutate()}
                disabled={launchMutation.isPending}
                className="gap-2"
                data-testid="button-launch-ad"
              >
                {launchMutation.isPending ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Rocket className="w-4 h-4" />
                )}
                Launch Ad (Paused)
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
