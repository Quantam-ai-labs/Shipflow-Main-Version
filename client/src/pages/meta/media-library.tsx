import { useState, useRef } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Loader2, Plus, Trash2, Upload, ImageIcon, Film, Search, Download, ThumbsUp, MessageCircle, Share2, Calendar, Hash, AlertCircle } from "lucide-react";
import { SiFacebook, SiInstagram, SiMeta } from "react-icons/si";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";

type LibraryTab = "local" | "ad-account" | "facebook" | "instagram";

export default function MetaMediaLibrary() {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState<LibraryTab>("local");
  const [searchQuery, setSearchQuery] = useState("");
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [addMode, setAddMode] = useState<"url" | "upload">("url");
  const [newName, setNewName] = useState("");
  const [newUrl, setNewUrl] = useState("");
  const [newTags, setNewTags] = useState("");
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadValidationErrors, setUploadValidationErrors] = useState<string[]>([]);

  const { data: localData, isLoading: localLoading } = useQuery<any>({
    queryKey: ["/api/meta/media-library"],
  });

  const { data: adImagesData, isLoading: adImagesLoading } = useQuery<any>({
    queryKey: ["/api/meta/ad-account-images"],
    queryFn: async () => {
      const res = await fetch("/api/meta/ad-account-images", { credentials: "include" });
      if (!res.ok) return { images: [], _error: true, errorMessage: "Failed to connect to Meta API" };
      return res.json();
    },
    enabled: activeTab === "ad-account",
  });

  const { data: adVideosData, isLoading: adVideosLoading } = useQuery<any>({
    queryKey: ["/api/meta/ad-account-videos"],
    queryFn: async () => {
      const res = await fetch("/api/meta/ad-account-videos", { credentials: "include" });
      if (!res.ok) return { videos: [], _error: true, errorMessage: "Failed to connect to Meta API" };
      return res.json();
    },
    enabled: activeTab === "ad-account",
  });

  const { data: fbPostsData, isLoading: fbPostsLoading } = useQuery<any>({
    queryKey: ["/api/meta/page-posts", "includeVideos"],
    queryFn: async () => {
      const res = await fetch("/api/meta/page-posts?includeVideos=true", { credentials: "include" });
      if (!res.ok) return { posts: [], _error: true, errorMessage: "Failed to connect to Meta API" };
      return res.json();
    },
    enabled: activeTab === "facebook",
  });

  const { data: igMediaData, isLoading: igMediaLoading } = useQuery<any>({
    queryKey: ["/api/meta/ig-media", "library"],
    queryFn: async () => {
      const res = await fetch("/api/meta/ig-media", { credentials: "include" });
      if (!res.ok) return { posts: [], _error: true, errorMessage: "Failed to connect to Meta API" };
      return res.json();
    },
    enabled: activeTab === "instagram",
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

  const validateUploadFile = (file: File): string[] => {
    const errors: string[] = [];
    const isVideo = file.type.startsWith("video/");
    const ext = file.name.split(".").pop()?.toLowerCase() || "";
    if (isVideo) {
      if (!["mp4", "mov"].includes(ext)) errors.push(`Video format .${ext} not supported. Use MP4 or MOV.`);
      if (file.size > 4096 * 1024 * 1024) errors.push(`Video file size ${(file.size / 1024 / 1024).toFixed(0)}MB exceeds 4GB limit.`);
    } else {
      if (!["jpg", "jpeg", "png", "webp", "gif"].includes(ext)) errors.push(`Image format .${ext} not supported. Use JPG, PNG, WebP, or GIF.`);
      if (file.size > 30 * 1024 * 1024) errors.push(`Image file size ${(file.size / 1024 / 1024).toFixed(1)}MB exceeds 30MB limit.`);
    }
    return errors;
  };

  const fileUploadMutation = useMutation({
    mutationFn: async () => {
      if (!uploadFile) throw new Error("No file selected");
      const validationErrors = validateUploadFile(uploadFile);
      if (validationErrors.length > 0) throw new Error(validationErrors.join("; "));
      const reader = new FileReader();
      const base64 = await new Promise<string>((resolve, reject) => {
        reader.onload = () => {
          const result = reader.result as string;
          const base64Data = result.split(",")[1];
          resolve(base64Data);
        };
        reader.onerror = reject;
        reader.readAsDataURL(uploadFile);
      });
      const isVideo = uploadFile.type.startsWith("video/");
      const res = await apiRequest("POST", "/api/meta/media-library/upload", {
        name: newName || uploadFile.name,
        type: isVideo ? "video" : "image",
        data: base64,
        mimeType: uploadFile.type,
        fileSize: uploadFile.size,
      });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Media Uploaded", description: "File has been uploaded to Meta and added to your library." });
      queryClient.invalidateQueries({ queryKey: ["/api/meta/media-library"] });
      setShowAddDialog(false);
      setNewName("");
      setUploadFile(null);
    },
    onError: (error: any) => {
      toast({ title: "Upload Failed", description: error.message, variant: "destructive" });
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

  const saveToLibraryMutation = useMutation({
    mutationFn: async (item: { name: string; type: "image" | "video"; url: string; width?: number; height?: number; tags?: string[] }) => {
      const res = await apiRequest("POST", "/api/meta/media-library", {
        name: item.name,
        type: item.type,
        url: item.url,
        width: item.width,
        height: item.height,
        tags: item.tags || ["imported"],
      });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Saved to Library", description: "Media has been added to your local library." });
      queryClient.invalidateQueries({ queryKey: ["/api/meta/media-library"] });
    },
    onError: (error: any) => {
      toast({ title: "Save Failed", description: error.message, variant: "destructive" });
    },
  });

  const media = localData?.media || [];
  const adImages = adImagesData?.images || [];
  const adVideos = adVideosData?.videos || [];
  const fbPosts = fbPostsData?.posts || [];
  const igMedia = igMediaData?.posts || [];

  const filterBySearch = (items: any[], fields: string[]) => {
    if (!searchQuery.trim()) return items;
    const q = searchQuery.toLowerCase();
    return items.filter((item: any) => fields.some(f => (item[f] || "").toString().toLowerCase().includes(q)));
  };

  const filteredMedia = filterBySearch(media, ["name", "tags"]);
  const filteredAdImages = filterBySearch(adImages, ["name", "hash"]);
  const filteredAdVideos = filterBySearch(adVideos, ["title"]);
  const filteredFbPosts = filterBySearch(fbPosts, ["message"]);
  const filteredIgMedia = filterBySearch(igMedia, ["message"]);

  const renderSkeleton = () => (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
      {Array.from({ length: 8 }).map((_, i) => (
        <Skeleton key={i} className="aspect-square rounded-lg" />
      ))}
    </div>
  );

  const renderEmptyState = (icon: any, title: string, description: string) => {
    const Icon = icon;
    return (
      <Card>
        <CardContent className="p-8 text-center space-y-3">
          <Icon className="w-12 h-12 text-muted-foreground/50 mx-auto" />
          <h2 className="font-semibold" data-testid="text-empty-title">{title}</h2>
          <p className="text-sm text-muted-foreground">{description}</p>
        </CardContent>
      </Card>
    );
  };

  return (
    <div className="p-4 md:p-6 max-w-[1100px] mx-auto space-y-4" data-testid="meta-media-library-page">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-page-title">Media Library</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Browse and manage media from your local library, Meta Ad Account, Facebook Page, and Instagram
          </p>
        </div>
        {activeTab === "local" && (
          <Button onClick={() => setShowAddDialog(true)} data-testid="button-add-media">
            <Plus className="w-4 h-4 mr-1" /> Add Media
          </Button>
        )}
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="Search media..."
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          className="pl-9"
          data-testid="input-search-media"
        />
      </div>

      <Tabs value={activeTab} onValueChange={(v) => { setActiveTab(v as LibraryTab); setSearchQuery(""); }}>
        <TabsList className="w-full grid grid-cols-4">
          <TabsTrigger value="local" className="gap-1.5 text-xs sm:text-sm" data-testid="tab-local">
            <ImageIcon className="w-3.5 h-3.5 hidden sm:block" /> Local Library
          </TabsTrigger>
          <TabsTrigger value="ad-account" className="gap-1.5 text-xs sm:text-sm" data-testid="tab-ad-account">
            <SiMeta className="w-3.5 h-3.5 hidden sm:block" /> Ad Account
          </TabsTrigger>
          <TabsTrigger value="facebook" className="gap-1.5 text-xs sm:text-sm" data-testid="tab-facebook">
            <SiFacebook className="w-3.5 h-3.5 hidden sm:block" /> Facebook
          </TabsTrigger>
          <TabsTrigger value="instagram" className="gap-1.5 text-xs sm:text-sm" data-testid="tab-instagram">
            <SiInstagram className="w-3.5 h-3.5 hidden sm:block" /> Instagram
          </TabsTrigger>
        </TabsList>

        <TabsContent value="local" className="mt-4">
          {localLoading ? renderSkeleton() : filteredMedia.length === 0 ? (
            searchQuery ? renderEmptyState(Search, "No Results", "No media matches your search.") : (
              <Card>
                <CardContent className="p-8 text-center space-y-3">
                  <ImageIcon className="w-12 h-12 text-muted-foreground/50 mx-auto" />
                  <h2 className="font-semibold">No Media Yet</h2>
                  <p className="text-sm text-muted-foreground">Add images to use in your ad creatives.</p>
                  <Button onClick={() => setShowAddDialog(true)} data-testid="button-add-first-media">
                    <Plus className="w-4 h-4 mr-1" /> Add Your First Image
                  </Button>
                </CardContent>
              </Card>
            )
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
              {filteredMedia.map((m: any) => (
                <Card key={m.id} className="overflow-hidden group" data-testid={`media-card-${m.id}`}>
                  <div className="aspect-square relative">
                    {m.type === "video" ? (
                      <div className="w-full h-full bg-muted flex items-center justify-center">
                        <Film className="w-10 h-10 text-muted-foreground" />
                      </div>
                    ) : (
                      <img
                        src={m.url}
                        alt={m.name}
                        className="w-full h-full object-cover"
                        onError={(e) => {
                          (e.target as HTMLImageElement).src = "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyMDAiIGhlaWdodD0iMjAwIj48cmVjdCB3aWR0aD0iMjAwIiBoZWlnaHQ9IjIwMCIgZmlsbD0iI2YwZjBmMCIvPjx0ZXh0IHg9IjUwJSIgeT0iNTAlIiBkb21pbmFudC1iYXNlbGluZT0ibWlkZGxlIiB0ZXh0LWFuY2hvcj0ibWlkZGxlIiBmaWxsPSIjOTk5IiBmb250LXNpemU9IjE0Ij5JbWFnZTwvdGV4dD48L3N2Zz4=";
                        }}
                      />
                    )}
                    {m.type === "video" && (
                      <div className="absolute top-2 left-2">
                        <Badge variant="secondary" className="text-[10px] h-4 gap-0.5">
                          <Film className="w-2.5 h-2.5" /> Video
                        </Badge>
                      </div>
                    )}
                    <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                      {!m.metaMediaHash && !m.metaMediaId && m.type !== "video" && (
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
                      {(m.metaMediaHash || m.metaMediaId) && (
                        <Badge variant="secondary" className="text-[10px] h-4">Meta ✓</Badge>
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
        </TabsContent>

        <TabsContent value="ad-account" className="mt-4 space-y-6">
          {(adImagesLoading || adVideosLoading) ? renderSkeleton() : (
            <>
              {filteredAdImages.length > 0 && (
                <div className="space-y-2">
                  <h3 className="text-sm font-medium flex items-center gap-1.5">
                    <ImageIcon className="w-4 h-4" /> Images ({filteredAdImages.length})
                  </h3>
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                    {filteredAdImages.map((img: any) => (
                      <Card key={img.hash} className="overflow-hidden group" data-testid={`ad-image-${img.hash}`}>
                        <div className="aspect-square relative">
                          <img src={img.url} alt={img.name} className="w-full h-full object-cover" onError={(e) => {
                            (e.target as HTMLImageElement).style.display = "none";
                          }} />
                          <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                            <Button
                              variant="secondary"
                              size="sm"
                              className="gap-1"
                              onClick={() => saveToLibraryMutation.mutate({ name: img.name || `Image ${img.hash.slice(0, 8)}`, type: "image", url: img.url, width: img.width, height: img.height, tags: ["ad-account"] })}
                              disabled={saveToLibraryMutation.isPending}
                              data-testid={`button-save-ad-image-${img.hash}`}
                            >
                              <Download className="w-3 h-3" /> Save
                            </Button>
                          </div>
                        </div>
                        <CardContent className="p-2.5 space-y-1">
                          <p className="text-xs font-medium truncate">{img.name || "Untitled"}</p>
                          <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                            {img.width > 0 && <span>{img.width}x{img.height}</span>}
                            <span className="flex items-center gap-0.5"><Hash className="w-2.5 h-2.5" />{img.hash.slice(0, 8)}</span>
                          </div>
                          {img.createdTime && (
                            <p className="text-[10px] text-muted-foreground flex items-center gap-1">
                              <Calendar className="w-2.5 h-2.5" /> {format(new Date(img.createdTime), "dd MMM yyyy")}
                            </p>
                          )}
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </div>
              )}

              {filteredAdVideos.length > 0 && (
                <div className="space-y-2">
                  <h3 className="text-sm font-medium flex items-center gap-1.5">
                    <Film className="w-4 h-4" /> Videos ({filteredAdVideos.length})
                  </h3>
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                    {filteredAdVideos.map((vid: any) => (
                      <Card key={vid.id} className="overflow-hidden group" data-testid={`ad-video-${vid.id}`}>
                        <div className="aspect-square relative">
                          {vid.picture ? (
                            <img src={vid.picture} alt={vid.title} className="w-full h-full object-cover" />
                          ) : (
                            <div className="w-full h-full bg-muted flex items-center justify-center">
                              <Film className="w-8 h-8 text-muted-foreground" />
                            </div>
                          )}
                          <div className="absolute top-2 left-2">
                            <Badge variant="secondary" className="text-[10px] h-4 gap-0.5">
                              <Film className="w-2.5 h-2.5" /> Video
                            </Badge>
                          </div>
                          {vid.duration > 0 && (
                            <div className="absolute bottom-2 right-2">
                              <Badge variant="secondary" className="text-[10px] h-4">{Math.round(vid.duration)}s</Badge>
                            </div>
                          )}
                          <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                            <Button
                              variant="secondary"
                              size="sm"
                              className="gap-1"
                              onClick={() => saveToLibraryMutation.mutate({ name: vid.title || `Video ${vid.id}`, type: "video", url: vid.source || vid.picture, tags: ["ad-account"] })}
                              disabled={saveToLibraryMutation.isPending}
                              data-testid={`button-save-ad-video-${vid.id}`}
                            >
                              <Download className="w-3 h-3" /> Save
                            </Button>
                          </div>
                        </div>
                        <CardContent className="p-2.5">
                          <p className="text-xs font-medium truncate">{vid.title || "Untitled Video"}</p>
                          {vid.createdTime && (
                            <p className="text-[10px] text-muted-foreground flex items-center gap-1 mt-0.5">
                              <Calendar className="w-2.5 h-2.5" /> {format(new Date(vid.createdTime), "dd MMM yyyy")}
                            </p>
                          )}
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </div>
              )}

              {filteredAdImages.length === 0 && filteredAdVideos.length === 0 && (
                searchQuery
                  ? renderEmptyState(Search, "No Results", "No ad account media matches your search.")
                  : (adImagesData?._error || adVideosData?._error)
                    ? renderEmptyState(AlertCircle, "Failed to Load Ad Media", adImagesData?.errorMessage || adVideosData?.errorMessage || "Could not fetch media from your Meta Ad Account. Please check your connection in Meta Settings.")
                    : renderEmptyState(SiMeta, "No Ad Account Media", "No images or videos found in your Meta Ad Account.")
              )}
            </>
          )}
        </TabsContent>

        <TabsContent value="facebook" className="mt-4">
          {fbPostsLoading ? renderSkeleton() : filteredFbPosts.length === 0 ? (
            searchQuery
              ? renderEmptyState(Search, "No Results", "No Facebook posts match your search.")
              : fbPostsData?._notConnected
                ? renderEmptyState(SiFacebook, "No Facebook Page Connected", "Connect your Facebook Page in Meta Settings to see your posts here.")
                : fbPostsData?._error
                  ? renderEmptyState(AlertCircle, "Failed to Load Facebook Posts", fbPostsData.errorMessage || "Could not fetch posts from your Facebook Page. Please check your connection in Meta Settings.")
                  : renderEmptyState(SiFacebook, "No Facebook Posts", "No posts found on your connected Facebook Page.")
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
              {filteredFbPosts.map((post: any) => (
                <Card key={post.id} className="overflow-hidden group" data-testid={`fb-post-${post.id}`}>
                  <div className="aspect-square relative">
                    {post.fullPicture ? (
                      <img src={post.fullPicture} alt={post.message} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full bg-muted flex items-center justify-center">
                        <SiFacebook className="w-8 h-8 text-[#1877F2]/30" />
                      </div>
                    )}
                    {post.type === "video" && (
                      <div className="absolute top-2 left-2">
                        <Badge variant="secondary" className="text-[10px] h-4 gap-0.5">
                          <Film className="w-2.5 h-2.5" /> Video
                        </Badge>
                      </div>
                    )}
                    <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                      {(post.fullPicture || post.videoSource) && (
                        <Button
                          variant="secondary"
                          size="sm"
                          className="gap-1"
                          onClick={() => saveToLibraryMutation.mutate({
                            name: (post.message || "Facebook post").slice(0, 80),
                            type: post.type === "video" ? "video" : "image",
                            url: post.type === "video" ? (post.videoSource || post.fullPicture) : post.fullPicture,
                            tags: ["facebook"],
                          })}
                          disabled={saveToLibraryMutation.isPending}
                          data-testid={`button-save-fb-${post.id}`}
                        >
                          <Download className="w-3 h-3" /> Save
                        </Button>
                      )}
                    </div>
                  </div>
                  <CardContent className="p-2.5 space-y-1">
                    <p className="text-xs line-clamp-2">{post.message || "(No text)"}</p>
                    <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                      <span className="flex items-center gap-0.5"><ThumbsUp className="w-2.5 h-2.5" /> {post.likes}</span>
                      <span className="flex items-center gap-0.5"><MessageCircle className="w-2.5 h-2.5" /> {post.comments}</span>
                      {post.shares > 0 && <span className="flex items-center gap-0.5"><Share2 className="w-2.5 h-2.5" /> {post.shares}</span>}
                    </div>
                    {post.createdTime && (
                      <p className="text-[10px] text-muted-foreground flex items-center gap-1">
                        <Calendar className="w-2.5 h-2.5" /> {format(new Date(post.createdTime), "dd MMM yyyy")}
                      </p>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="instagram" className="mt-4">
          {igMediaLoading ? renderSkeleton() : filteredIgMedia.length === 0 ? (
            searchQuery
              ? renderEmptyState(Search, "No Results", "No Instagram media matches your search.")
              : igMediaData?._notConnected
                ? renderEmptyState(SiInstagram, "No Instagram Account Connected", "Connect your Instagram account in Meta Settings to see your media here.")
                : igMediaData?._error
                  ? renderEmptyState(AlertCircle, "Failed to Load Instagram Media", igMediaData.errorMessage || "Could not fetch media from your Instagram account. Please check your connection in Meta Settings.")
                  : renderEmptyState(SiInstagram, "No Instagram Media", "No posts found on your connected Instagram account.")
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
              {filteredIgMedia.map((item: any) => (
                <Card key={item.id} className="overflow-hidden group" data-testid={`ig-media-${item.id}`}>
                  <div className="aspect-square relative">
                    {item.fullPicture ? (
                      <img src={item.fullPicture} alt={item.message} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full bg-muted flex items-center justify-center">
                        <SiInstagram className="w-8 h-8 text-[#E4405F]/30" />
                      </div>
                    )}
                    {item.type === "video" && (
                      <div className="absolute top-2 left-2">
                        <Badge variant="secondary" className="text-[10px] h-4 gap-0.5">
                          <Film className="w-2.5 h-2.5" /> Video
                        </Badge>
                      </div>
                    )}
                    <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                      {(item.fullPicture || item.mediaUrl) && (
                        <Button
                          variant="secondary"
                          size="sm"
                          className="gap-1"
                          onClick={() => saveToLibraryMutation.mutate({
                            name: (item.message || "Instagram post").slice(0, 80),
                            type: item.type === "video" ? "video" : "image",
                            url: item.type === "video" ? (item.mediaUrl || item.fullPicture) : (item.fullPicture || item.mediaUrl),
                            tags: ["instagram"],
                          })}
                          disabled={saveToLibraryMutation.isPending}
                          data-testid={`button-save-ig-${item.id}`}
                        >
                          <Download className="w-3 h-3" /> Save
                        </Button>
                      )}
                    </div>
                  </div>
                  <CardContent className="p-2.5 space-y-1">
                    <p className="text-xs line-clamp-2">{item.message || "(No caption)"}</p>
                    <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                      <span className="flex items-center gap-0.5"><ThumbsUp className="w-2.5 h-2.5" /> {item.likes}</span>
                      <span className="flex items-center gap-0.5"><MessageCircle className="w-2.5 h-2.5" /> {item.comments}</span>
                    </div>
                    {item.createdTime && (
                      <p className="text-[10px] text-muted-foreground flex items-center gap-1">
                        <Calendar className="w-2.5 h-2.5" /> {format(new Date(item.createdTime), "dd MMM yyyy")}
                      </p>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Media</DialogTitle>
          </DialogHeader>
          <Tabs value={addMode} onValueChange={(v) => setAddMode(v as "url" | "upload")}>
            <TabsList className="w-full">
              <TabsTrigger value="url" className="flex-1" data-testid="tab-url">From URL</TabsTrigger>
              <TabsTrigger value="upload" className="flex-1" data-testid="tab-upload">Upload File</TabsTrigger>
            </TabsList>
            <TabsContent value="url" className="space-y-4 mt-4">
              <div className="space-y-1.5">
                <Label htmlFor="media-name">Name</Label>
                <Input id="media-name" placeholder="e.g. Summer Banner" value={newName} onChange={e => setNewName(e.target.value)} data-testid="input-media-name" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="media-url">Image URL</Label>
                <Input id="media-url" type="url" placeholder="https://example.com/image.jpg" value={newUrl} onChange={e => setNewUrl(e.target.value)} data-testid="input-media-url" />
              </div>
              {newUrl && (
                <div className="border rounded overflow-hidden max-h-48">
                  <img src={newUrl} alt="Preview" className="w-full h-full object-contain" />
                </div>
              )}
              <div className="space-y-1.5">
                <Label htmlFor="media-tags">Tags (comma separated)</Label>
                <Input id="media-tags" placeholder="e.g. summer, banner, sale" value={newTags} onChange={e => setNewTags(e.target.value)} data-testid="input-media-tags" />
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setShowAddDialog(false)} data-testid="button-cancel-add">Cancel</Button>
                <Button onClick={() => addMutation.mutate()} disabled={!newName.trim() || !newUrl.trim() || addMutation.isPending} data-testid="button-save-media">
                  {addMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Plus className="w-4 h-4 mr-1" />}
                  Add
                </Button>
              </DialogFooter>
            </TabsContent>
            <TabsContent value="upload" className="space-y-4 mt-4">
              <div className="space-y-1.5">
                <Label htmlFor="upload-name">Name (optional)</Label>
                <Input id="upload-name" placeholder="Auto-detected from filename" value={newName} onChange={e => setNewName(e.target.value)} data-testid="input-upload-name" />
              </div>
              <div className="space-y-1.5">
                <Label>File (image or video)</Label>
                <div
                  className="border-2 border-dashed rounded-lg p-6 text-center cursor-pointer hover:bg-muted/50 transition-colors"
                  onClick={() => fileInputRef.current?.click()}
                  data-testid="dropzone-upload"
                >
                  {uploadFile ? (
                    <div className="space-y-1">
                      {uploadFile.type.startsWith("video/") ? (
                        <Film className="w-8 h-8 mx-auto text-muted-foreground" />
                      ) : (
                        <ImageIcon className="w-8 h-8 mx-auto text-muted-foreground" />
                      )}
                      <p className="text-sm font-medium">{uploadFile.name}</p>
                      <p className="text-xs text-muted-foreground">{(uploadFile.size / 1024 / 1024).toFixed(2)} MB</p>
                    </div>
                  ) : (
                    <div className="space-y-1">
                      <Upload className="w-8 h-8 mx-auto text-muted-foreground" />
                      <p className="text-sm text-muted-foreground">Click to select an image or video</p>
                      <p className="text-xs text-muted-foreground">JPG, PNG, MP4, MOV up to 30MB</p>
                    </div>
                  )}
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*,video/*"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) {
                        setUploadFile(file);
                        const errors = validateUploadFile(file);
                        if (file.type.startsWith("video/") && errors.length === 0) {
                          const video = document.createElement("video");
                          video.preload = "metadata";
                          video.onloadedmetadata = () => {
                            const durErrors: string[] = [];
                            if (video.duration > 240) durErrors.push(`Video duration ${Math.round(video.duration)}s exceeds maximum 240s (4 minutes).`);
                            if (video.videoWidth < 500) durErrors.push(`Video width ${video.videoWidth}px below minimum 500px.`);
                            URL.revokeObjectURL(video.src);
                            setUploadValidationErrors([...errors, ...durErrors]);
                          };
                          video.onerror = () => setUploadValidationErrors(errors);
                          video.src = URL.createObjectURL(file);
                        } else if (!file.type.startsWith("video/") && errors.length === 0) {
                          const img = new window.Image();
                          img.onload = () => {
                            const dimErrors: string[] = [];
                            if (img.naturalWidth < 600) dimErrors.push(`Image width ${img.naturalWidth}px below minimum 600px.`);
                            const ratio = img.naturalWidth / img.naturalHeight;
                            const validRanges = [
                              { min: 0.95, max: 1.05 },
                              { min: 0.75, max: 0.85 },
                              { min: 0.52, max: 0.62 },
                              { min: 1.7, max: 1.85 },
                              { min: 1.85, max: 1.97 },
                            ];
                            if (!validRanges.some(r => ratio >= r.min && ratio <= r.max)) {
                              dimErrors.push(`Aspect ratio ${ratio.toFixed(2)} may not be optimal. Use 1:1, 4:5, 9:16, 16:9, or 1.91:1.`);
                            }
                            setUploadValidationErrors([...errors, ...dimErrors]);
                          };
                          img.src = URL.createObjectURL(file);
                        } else {
                          setUploadValidationErrors(errors);
                        }
                      }
                    }}
                    data-testid="input-file-upload"
                  />
                </div>
              </div>
              {uploadValidationErrors.length > 0 && (
                <div className="space-y-1 p-2 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded">
                  {uploadValidationErrors.map((err, i) => (
                    <p key={i} className="text-xs text-red-600 dark:text-red-400">{err}</p>
                  ))}
                </div>
              )}
              <DialogFooter>
                <Button variant="outline" onClick={() => setShowAddDialog(false)} data-testid="button-cancel-upload">Cancel</Button>
                <Button
                  onClick={() => fileUploadMutation.mutate()}
                  disabled={!uploadFile || fileUploadMutation.isPending || uploadValidationErrors.length > 0}
                  data-testid="button-upload-media"
                >
                  {fileUploadMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Upload className="w-4 h-4 mr-1" />}
                  Upload to Meta
                </Button>
              </DialogFooter>
            </TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>
    </div>
  );
}
