import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Loader2, Plus, Trash2, Upload, ImageIcon, ExternalLink } from "lucide-react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

export default function MetaMediaLibrary() {
  const { toast } = useToast();
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [newName, setNewName] = useState("");
  const [newUrl, setNewUrl] = useState("");
  const [newTags, setNewTags] = useState("");

  const { data, isLoading } = useQuery<any>({
    queryKey: ["/api/meta/media-library"],
  });

  const addMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/meta/media-library", {
        name: newName,
        type: "image",
        url: newUrl,
        tags: newTags ? newTags.split(",").map(t => t.trim()).filter(Boolean) : [],
      });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Media Added", description: "Image has been added to your library." });
      queryClient.invalidateQueries({ queryKey: ["/api/meta/media-library"] });
      setShowAddDialog(false);
      setNewName("");
      setNewUrl("");
      setNewTags("");
    },
    onError: (error: any) => {
      toast({ title: "Failed", description: error.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("DELETE", `/api/meta/media-library/${id}`);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Deleted", description: "Media removed from library." });
      queryClient.invalidateQueries({ queryKey: ["/api/meta/media-library"] });
    },
  });

  const uploadToMetaMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("POST", `/api/meta/media-library/${id}/upload-to-meta`);
      return res.json();
    },
    onSuccess: (data) => {
      toast({ title: "Uploaded to Meta", description: `Image hash: ${data.hash}` });
      queryClient.invalidateQueries({ queryKey: ["/api/meta/media-library"] });
    },
    onError: (error: any) => {
      toast({ title: "Upload Failed", description: error.message, variant: "destructive" });
    },
  });

  const media = data?.media || [];

  return (
    <div className="p-4 md:p-6 max-w-[1100px] mx-auto space-y-6" data-testid="meta-media-library-page">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-page-title">Media Library</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Manage images and videos for your Facebook ads
          </p>
        </div>
        <Button onClick={() => setShowAddDialog(true)} data-testid="button-add-media">
          <Plus className="w-4 h-4 mr-1" /> Add Media
        </Button>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="aspect-square rounded-lg" />
          ))}
        </div>
      ) : media.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center space-y-3">
            <ImageIcon className="w-12 h-12 text-muted-foreground/50 mx-auto" />
            <h2 className="font-semibold">No Media Yet</h2>
            <p className="text-sm text-muted-foreground">
              Add images to use in your ad creatives.
            </p>
            <Button onClick={() => setShowAddDialog(true)} data-testid="button-add-first-media">
              <Plus className="w-4 h-4 mr-1" /> Add Your First Image
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
          {media.map((m: any) => (
            <Card key={m.id} className="overflow-hidden group" data-testid={`media-card-${m.id}`}>
              <div className="aspect-square relative">
                <img
                  src={m.url}
                  alt={m.name}
                  className="w-full h-full object-cover"
                  onError={(e) => {
                    (e.target as HTMLImageElement).src = "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyMDAiIGhlaWdodD0iMjAwIj48cmVjdCB3aWR0aD0iMjAwIiBoZWlnaHQ9IjIwMCIgZmlsbD0iI2YwZjBmMCIvPjx0ZXh0IHg9IjUwJSIgeT0iNTAlIiBkb21pbmFudC1iYXNlbGluZT0ibWlkZGxlIiB0ZXh0LWFuY2hvcj0ibWlkZGxlIiBmaWxsPSIjOTk5IiBmb250LXNpemU9IjE0Ij5JbWFnZTwvdGV4dD48L3N2Zz4=";
                  }}
                />
                <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                  {!m.metaMediaHash && (
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => uploadToMetaMutation.mutate(m.id)}
                      disabled={uploadToMetaMutation.isPending}
                      data-testid={`button-upload-meta-${m.id}`}
                    >
                      {uploadToMetaMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Upload className="w-3 h-3" />}
                    </Button>
                  )}
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => deleteMutation.mutate(m.id)}
                    disabled={deleteMutation.isPending}
                    data-testid={`button-delete-media-${m.id}`}
                  >
                    <Trash2 className="w-3 h-3" />
                  </Button>
                </div>
              </div>
              <CardContent className="p-2.5">
                <p className="text-xs font-medium truncate" data-testid={`text-media-name-${m.id}`}>{m.name}</p>
                <div className="flex items-center gap-1 mt-1">
                  {m.metaMediaHash && (
                    <Badge variant="secondary" className="text-[10px] h-4">
                      Meta ✓
                    </Badge>
                  )}
                  {m.tags?.map((tag: string) => (
                    <Badge key={tag} variant="outline" className="text-[10px] h-4">{tag}</Badge>
                  ))}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Media</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="media-name">Name</Label>
              <Input
                id="media-name"
                placeholder="e.g. Summer Banner"
                value={newName}
                onChange={e => setNewName(e.target.value)}
                data-testid="input-media-name"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="media-url">Image URL</Label>
              <Input
                id="media-url"
                type="url"
                placeholder="https://example.com/image.jpg"
                value={newUrl}
                onChange={e => setNewUrl(e.target.value)}
                data-testid="input-media-url"
              />
            </div>
            {newUrl && (
              <div className="border rounded overflow-hidden max-h-48">
                <img src={newUrl} alt="Preview" className="w-full h-full object-contain" />
              </div>
            )}
            <div className="space-y-1.5">
              <Label htmlFor="media-tags">Tags (comma separated)</Label>
              <Input
                id="media-tags"
                placeholder="e.g. summer, banner, sale"
                value={newTags}
                onChange={e => setNewTags(e.target.value)}
                data-testid="input-media-tags"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddDialog(false)} data-testid="button-cancel-add">
              Cancel
            </Button>
            <Button
              onClick={() => addMutation.mutate()}
              disabled={!newName.trim() || !newUrl.trim() || addMutation.isPending}
              data-testid="button-save-media"
            >
              {addMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Plus className="w-4 h-4 mr-1" />}
              Add
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
