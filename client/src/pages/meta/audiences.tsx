import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Slider } from "@/components/ui/slider";
import { Users, Plus, Trash2, Loader2, Copy, Globe, Mail, Phone } from "lucide-react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface Audience {
  id: string;
  metaAudienceId: string | null;
  name: string;
  description: string | null;
  audienceType: string;
  subtype: string | null;
  approximateCount: number | null;
  status: string | null;
  retentionDays: number | null;
  lookalikeSpec: any;
  createdAt: string;
}

export default function MetaAudiences() {
  const { toast } = useToast();
  const [createDialog, setCreateDialog] = useState(false);
  const [lookalikeDialog, setLookalikeDialog] = useState(false);
  const [audienceType, setAudienceType] = useState<"customer_list" | "website">("customer_list");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [emailList, setEmailList] = useState("");
  const [phoneList, setPhoneList] = useState("");
  const [retentionDays, setRetentionDays] = useState("30");
  const [pixelId, setPixelId] = useState("");
  const [lookalikeSource, setLookalikeSource] = useState("");
  const [lookalikeCountry, setLookalikeCountry] = useState("PK");
  const [lookalikeRatio, setLookalikeRatio] = useState([1]);
  const [lookalikeName, setLookalikeName] = useState("");

  const { data, isLoading } = useQuery<{ audiences: Audience[] }>({
    queryKey: ["/api/meta/audiences"],
  });

  const { data: pixelsData } = useQuery<any[]>({
    queryKey: ["/api/meta/pixels"],
  });

  const createMutation = useMutation({
    mutationFn: async (body: any) => {
      const res = await apiRequest("POST", "/api/meta/audiences", body);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Audience Created" });
      queryClient.invalidateQueries({ queryKey: ["/api/meta/audiences"] });
      resetForm();
      setCreateDialog(false);
    },
    onError: (error: any) => {
      toast({ title: "Failed to Create Audience", description: error.message, variant: "destructive" });
    },
  });

  const lookalikeMutation = useMutation({
    mutationFn: async (body: any) => {
      const res = await apiRequest("POST", "/api/meta/audiences/lookalike", body);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Lookalike Audience Created" });
      queryClient.invalidateQueries({ queryKey: ["/api/meta/audiences"] });
      setLookalikeDialog(false);
      setLookalikeName("");
      setLookalikeSource("");
    },
    onError: (error: any) => {
      toast({ title: "Failed to Create Lookalike", description: error.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("DELETE", `/api/meta/audiences/${id}`);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Audience Deleted" });
      queryClient.invalidateQueries({ queryKey: ["/api/meta/audiences"] });
    },
    onError: (error: any) => {
      toast({ title: "Delete Failed", description: error.message, variant: "destructive" });
    },
  });

  const audiences = data?.audiences || [];
  const customAudiences = audiences.filter(a => a.audienceType !== "lookalike");

  const resetForm = () => {
    setName("");
    setDescription("");
    setEmailList("");
    setPhoneList("");
    setRetentionDays("30");
    setPixelId("");
    setAudienceType("customer_list");
  };

  const handleCreate = () => {
    const emails = emailList.split(/[,\n]/).map(e => e.trim()).filter(Boolean);
    const phones = phoneList.split(/[,\n]/).map(p => p.trim()).filter(Boolean);

    createMutation.mutate({
      name,
      description: description || undefined,
      audienceType,
      emails: emails.length > 0 ? emails : undefined,
      phones: phones.length > 0 ? phones : undefined,
      pixelId: pixelId || undefined,
      retentionDays: parseInt(retentionDays) || undefined,
    });
  };

  const getTypeBadge = (type: string) => {
    switch (type) {
      case "customer_list":
        return <Badge variant="secondary" className="text-xs"><Mail className="w-3 h-3 mr-1" />Customer List</Badge>;
      case "website":
        return <Badge variant="secondary" className="text-xs"><Globe className="w-3 h-3 mr-1" />Website Visitors</Badge>;
      case "lookalike":
        return <Badge className="bg-violet-500/10 text-violet-400 border border-violet-500/20 text-xs"><Copy className="w-3 h-3 mr-1" />Lookalike</Badge>;
      default:
        return <Badge variant="outline" className="text-xs">{type}</Badge>;
    }
  };

  return (
    <div className="space-y-6 max-w-5xl" data-testid="page-meta-audiences">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-semibold" data-testid="text-page-title">Custom Audiences</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Create and manage Custom Audiences and Lookalike Audiences for your ad targeting.
          </p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => setLookalikeDialog(true)} disabled={customAudiences.length === 0} data-testid="button-create-lookalike">
            <Copy className="w-3.5 h-3.5 mr-1.5" />Lookalike
          </Button>
          <Button size="sm" onClick={() => setCreateDialog(true)} data-testid="button-create-audience">
            <Plus className="w-3.5 h-3.5 mr-1.5" />Create Audience
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map(i => <Skeleton key={i} className="h-20 w-full rounded-lg" />)}
        </div>
      ) : audiences.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <Users className="w-10 h-10 text-muted-foreground mb-3" />
            <CardTitle className="text-base mb-1" data-testid="text-empty-state">No Audiences Yet</CardTitle>
            <CardDescription>
              Create a Custom Audience from your customer emails or website visitors to improve ad targeting.
            </CardDescription>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {audiences.map((audience) => (
            <Card key={audience.id} className="hover:bg-muted/30 transition-colors" data-testid={`card-audience-${audience.id}`}>
              <CardContent className="flex items-center justify-between py-4 px-5 gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-medium text-sm truncate" data-testid={`text-audience-name-${audience.id}`}>{audience.name}</p>
                    {getTypeBadge(audience.audienceType)}
                    {audience.status && (
                      <Badge variant="outline" className="text-xs">{audience.status}</Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                    {audience.description && <span className="truncate max-w-[300px]">{audience.description}</span>}
                    {audience.approximateCount && <span>{audience.approximateCount.toLocaleString()} users</span>}
                    {audience.retentionDays && <span>{audience.retentionDays}d retention</span>}
                    {audience.lookalikeSpec && <span>{(audience.lookalikeSpec as any).ratio * 100}% - {(audience.lookalikeSpec as any).country}</span>}
                    <span>{new Date(audience.createdAt).toLocaleDateString()}</span>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                  onClick={() => deleteMutation.mutate(audience.id)}
                  disabled={deleteMutation.isPending}
                  data-testid={`button-delete-audience-${audience.id}`}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={createDialog} onOpenChange={setCreateDialog}>
        <DialogContent className="max-w-lg" data-testid="dialog-create-audience">
          <DialogHeader>
            <DialogTitle>Create Custom Audience</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label>Audience Name</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. High Value Customers" data-testid="input-audience-name" />
            </div>
            <div>
              <Label>Description (optional)</Label>
              <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Brief description" data-testid="input-audience-description" />
            </div>
            <div>
              <Label>Source Type</Label>
              <Select value={audienceType} onValueChange={(v) => setAudienceType(v as "customer_list" | "website")}>
                <SelectTrigger data-testid="select-audience-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="customer_list">Customer List (Emails/Phones)</SelectItem>
                  <SelectItem value="website">Website Visitors (Pixel)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {audienceType === "customer_list" && (
              <>
                <div>
                  <Label>Emails (one per line or comma-separated)</Label>
                  <Textarea value={emailList} onChange={(e) => setEmailList(e.target.value)} placeholder="email1@example.com&#10;email2@example.com" rows={4} data-testid="input-email-list" />
                </div>
                <div>
                  <Label>Phone Numbers (optional, one per line)</Label>
                  <Textarea value={phoneList} onChange={(e) => setPhoneList(e.target.value)} placeholder="+923001234567&#10;+923009876543" rows={3} data-testid="input-phone-list" />
                </div>
              </>
            )}

            {audienceType === "website" && (
              <>
                <div>
                  <Label>Pixel ID</Label>
                  <Input value={pixelId} onChange={(e) => setPixelId(e.target.value)} placeholder="Your Facebook Pixel ID" data-testid="input-pixel-id" />
                </div>
                <div>
                  <Label>Retention (days): {retentionDays}</Label>
                  <Input type="number" value={retentionDays} onChange={(e) => setRetentionDays(e.target.value)} min={1} max={180} data-testid="input-retention-days" />
                </div>
              </>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateDialog(false)} data-testid="button-cancel-audience">Cancel</Button>
            <Button onClick={handleCreate} disabled={!name || createMutation.isPending} data-testid="button-save-audience">
              {createMutation.isPending && <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />}
              Create Audience
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={lookalikeDialog} onOpenChange={setLookalikeDialog}>
        <DialogContent data-testid="dialog-create-lookalike">
          <DialogHeader>
            <DialogTitle>Create Lookalike Audience</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label>Name</Label>
              <Input value={lookalikeName} onChange={(e) => setLookalikeName(e.target.value)} placeholder="e.g. Lookalike - Top Buyers PK 1%" data-testid="input-lookalike-name" />
            </div>
            <div>
              <Label>Source Audience</Label>
              <Select value={lookalikeSource} onValueChange={setLookalikeSource}>
                <SelectTrigger data-testid="select-lookalike-source">
                  <SelectValue placeholder="Select source audience" />
                </SelectTrigger>
                <SelectContent>
                  {customAudiences.map(a => (
                    <SelectItem key={a.id} value={a.metaAudienceId || a.id}>{a.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Country</Label>
              <Select value={lookalikeCountry} onValueChange={setLookalikeCountry}>
                <SelectTrigger data-testid="select-lookalike-country">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="PK">Pakistan</SelectItem>
                  <SelectItem value="IN">India</SelectItem>
                  <SelectItem value="AE">UAE</SelectItem>
                  <SelectItem value="SA">Saudi Arabia</SelectItem>
                  <SelectItem value="US">United States</SelectItem>
                  <SelectItem value="GB">United Kingdom</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Audience Size: {lookalikeRatio[0]}%</Label>
              <Slider
                value={lookalikeRatio}
                onValueChange={setLookalikeRatio}
                min={1}
                max={20}
                step={1}
                className="mt-2"
                data-testid="slider-lookalike-ratio"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Smaller percentages are more similar to your source audience.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setLookalikeDialog(false)} data-testid="button-cancel-lookalike">Cancel</Button>
            <Button
              onClick={() => {
                lookalikeMutation.mutate({
                  name: lookalikeName,
                  sourceAudienceId: lookalikeSource,
                  country: lookalikeCountry,
                  ratio: lookalikeRatio[0] / 100,
                });
              }}
              disabled={!lookalikeName || !lookalikeSource || lookalikeMutation.isPending}
              data-testid="button-save-lookalike"
            >
              {lookalikeMutation.isPending && <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />}
              Create Lookalike
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
