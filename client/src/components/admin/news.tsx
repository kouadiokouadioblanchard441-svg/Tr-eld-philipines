import { useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import RefreshLoader from "@/components/refresh-loader";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Eye, EyeOff, Heart, ImagePlus, Loader2, Newspaper, Pencil, Send, Trash2, X } from "lucide-react";

interface NewsPost {
  id: number;
  title: string;
  content: string;
  imageUrl: string | null;
  isPublished: boolean;
  createdAt: string;
  likesCount: number;
  viewsCount: number;
}

const MAX_IMAGE_SIZE = 3 * 1024 * 1024;
const MIN_NEWS_WORDS = 1206;

function countWords(value: string): number {
  return value.trim() ? value.trim().split(/\s+/).length : 0;
}

function readImage(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Impossible de lire cette image"));
    reader.readAsDataURL(file);
  });
}

function formatDate(dateString: string) {
  return new Date(dateString).toLocaleString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function AdminNews() {
  const { toast } = useToast();
  const imageInputRef = useRef<HTMLInputElement>(null);
  const editImageInputRef = useRef<HTMLInputElement>(null);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [viewsCount, setViewsCount] = useState("0");
  const [likesCount, setLikesCount] = useState("0");
  const [editingPost, setEditingPost] = useState<NewsPost | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editContent, setEditContent] = useState("");
  const [editImageUrl, setEditImageUrl] = useState<string | null>(null);
  const [editIsPublished, setEditIsPublished] = useState(true);
  const [editViewsCount, setEditViewsCount] = useState("0");
  const [editLikesCount, setEditLikesCount] = useState("0");

  const { data: posts = [], isLoading } = useQuery<NewsPost[]>({
    queryKey: ["/api/admin/news"],
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/admin/news", {
        title,
        content,
        imageUrl,
        viewsCount: Number(viewsCount),
        likesCount: Number(likesCount),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "Impossible de publier l'annonce");
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/news"] });
      queryClient.invalidateQueries({ queryKey: ["/api/news"] });
      setTitle("");
      setContent("");
      setImageUrl(null);
      setViewsCount("0");
      setLikesCount("0");
      if (imageInputRef.current) imageInputRef.current.value = "";
      toast({ title: "Publication réussie", description: "L'annonce est maintenant visible par les utilisateurs." });
    },
    onError: (error: Error) => {
      toast({ title: "Erreur", description: error.message, variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (data: {
      id: number;
      title: string;
      content: string;
      imageUrl: string | null;
      isPublished: boolean;
      viewsCount: number;
      likesCount: number;
    }) => {
      const { id, ...payload } = data;
      const response = await apiRequest("PATCH", `/api/admin/news/${id}`, payload);
      const result = await response.json();
      if (!response.ok) throw new Error(result.message || "Impossible de modifier l'annonce");
      return result;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/news"] });
      queryClient.invalidateQueries({ queryKey: ["/api/news"] });
      setEditingPost(null);
      toast({
        title: "Annonce mise à jour",
        description: variables.isPublished ? "L'annonce est visible par les utilisateurs." : "L'annonce est maintenant en brouillon.",
      });
    },
    onError: (error: Error) => {
      toast({ title: "Erreur", description: error.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const response = await apiRequest("DELETE", `/api/admin/news/${id}`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "Impossible de supprimer l'annonce");
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/news"] });
      queryClient.invalidateQueries({ queryKey: ["/api/news"] });
      toast({ title: "Annonce supprimée" });
    },
    onError: (error: Error) => {
      toast({ title: "Erreur", description: error.message, variant: "destructive" });
    },
  });

  const handleImageChange = async (file: File | undefined, setImage: (image: string) => void) => {
    if (!file) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      toast({ title: "Format non pris en charge", description: "Utilisez une image JPG, PNG ou WebP.", variant: "destructive" });
      return;
    }
    if (file.size > MAX_IMAGE_SIZE) {
      toast({ title: "Image trop lourde", description: "L'image doit faire au maximum 3 Mo.", variant: "destructive" });
      return;
    }
    try {
      setImage(await readImage(file));
    } catch (error) {
      toast({
        title: "Erreur",
        description: error instanceof Error ? error.message : "Impossible de lire cette image",
        variant: "destructive",
      });
    }
  };

  const openEditPost = (post: NewsPost) => {
    setEditingPost(post);
    setEditTitle(post.title);
    setEditContent(post.content);
    setEditImageUrl(post.imageUrl);
    setEditIsPublished(post.isPublished);
    setEditViewsCount(String(post.viewsCount));
    setEditLikesCount(String(post.likesCount));
  };

  const saveEdit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!editingPost) return;
    if (!editContent.trim()) {
      toast({ title: "Contenu obligatoire", description: "Ajoutez un texte avant d'enregistrer.", variant: "destructive" });
      return;
    }
    if (countWords(editContent) < MIN_NEWS_WORDS) {
      toast({
        title: "Article trop court",
        description: `Le contenu doit comporter au moins ${MIN_NEWS_WORDS} mots.`,
        variant: "destructive",
      });
      return;
    }
    const nextViewsCount = Number(editViewsCount);
    const nextLikesCount = Number(editLikesCount);
    if (
      !Number.isInteger(nextViewsCount) ||
      nextViewsCount < 0 ||
      !Number.isInteger(nextLikesCount) ||
      nextLikesCount < 0
    ) {
      toast({ title: "Compteurs invalides", description: "Les vues et les j'aime doivent être des nombres entiers positifs ou nuls.", variant: "destructive" });
      return;
    }
    updateMutation.mutate({
      id: editingPost.id,
      title: editTitle,
      content: editContent,
      imageUrl: editImageUrl,
      isPublished: editIsPublished,
      viewsCount: nextViewsCount,
      likesCount: nextLikesCount,
    });
  };

  const togglePublication = (post: NewsPost) => {
    updateMutation.mutate({
      id: post.id,
      title: post.title,
      content: post.content,
      imageUrl: post.imageUrl,
      isPublished: !post.isPublished,
      viewsCount: post.viewsCount,
      likesCount: post.likesCount,
    });
  };

  const publish = (event: React.FormEvent) => {
    event.preventDefault();
    if (!content.trim()) {
      toast({ title: "Contenu obligatoire", description: "Ajoutez un texte avant de publier.", variant: "destructive" });
      return;
    }
    if (countWords(content) < MIN_NEWS_WORDS) {
      toast({
        title: "Article trop court",
        description: `Le contenu doit comporter au moins ${MIN_NEWS_WORDS} mots.`,
        variant: "destructive",
      });
      return;
    }
    createMutation.mutate();
  };

  return (
    <div className="space-y-5" data-testid="admin-news-section">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Newspaper className="h-5 w-5 text-primary" />
            Publier une actualité
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={publish} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="news-title">Titre (facultatif)</Label>
              <Input
                id="news-title"
                value={title}
                maxLength={120}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="Titre de l'annonce"
                data-testid="input-news-title"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="news-content">Texte de l'annonce</Label>
              <Textarea
                id="news-content"
                value={content}
                maxLength={20000}
                onChange={(event) => setContent(event.target.value)}
                placeholder="Écrivez votre annonce ici..."
                rows={6}
                data-testid="input-news-content"
              />
              <p className={`text-xs ${countWords(content) >= MIN_NEWS_WORDS ? "text-emerald-600" : "text-muted-foreground"}`}>
                {countWords(content)} / {MIN_NEWS_WORDS} mots minimum
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="news-views-count">Nombre de vues</Label>
                <Input
                  id="news-views-count"
                  type="number"
                  min="0"
                  step="1"
                  value={viewsCount}
                  onChange={(event) => setViewsCount(event.target.value)}
                  data-testid="input-news-views-count"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="news-likes-count">Nombre de j'aime</Label>
                <Input
                  id="news-likes-count"
                  type="number"
                  min="0"
                  step="1"
                  value={likesCount}
                  onChange={(event) => setLikesCount(event.target.value)}
                  data-testid="input-news-likes-count"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Image (facultative)</Label>
              <input
                ref={imageInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                onChange={(event) => {
                  void handleImageChange(event.target.files?.[0], setImageUrl);
                  event.target.value = "";
                }}
                data-testid="input-news-image"
              />
              {imageUrl ? (
                <div className="relative overflow-hidden rounded-lg border">
                  <img src={imageUrl} alt="Aperçu de l'annonce" className="max-h-56 w-full object-cover" />
                  <button
                    type="button"
                    className="absolute right-2 top-2 rounded-full bg-black/65 p-1.5 text-white"
                    onClick={() => setImageUrl(null)}
                    aria-label="Supprimer l'image"
                    data-testid="button-remove-news-image"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ) : (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => imageInputRef.current?.click()}
                  data-testid="button-add-news-image"
                >
                  <ImagePlus className="mr-2 h-4 w-4" />
                  Ajouter une image
                </Button>
              )}
              <div className="space-y-2">
                <Label htmlFor="news-image-url">URL de l'image</Label>
                <Input
                  id="news-image-url"
                  type="url"
                  value={imageUrl?.startsWith("data:") ? "" : imageUrl ?? ""}
                  onChange={(event) => setImageUrl(event.target.value.trim() || null)}
                  placeholder="https://images.unsplash.com/..."
                  data-testid="input-news-image-url"
                />
              </div>
              <p className="text-xs text-muted-foreground">JPG, PNG ou WebP, 3 Mo maximum, ou URL HTTPS publique.</p>
            </div>

            <Button type="submit" className="w-full" disabled={createMutation.isPending} data-testid="button-publish-news">
              {createMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
              Publier l'annonce
            </Button>
          </form>
        </CardContent>
      </Card>

      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Publications</h2>
        <span className="text-sm text-muted-foreground">{posts.length} annonce{posts.length > 1 ? "s" : ""}</span>
      </div>

      {isLoading ? (
        <RefreshLoader />
      ) : posts.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">
            Aucune annonce.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {posts.map((post) => (
            <Card key={post.id} data-testid={`admin-news-card-${post.id}`}>
              {post.imageUrl && (
                <img src={post.imageUrl} alt={post.title || "Annonce"} className="max-h-48 w-full rounded-t-xl object-cover" />
              )}
              <CardContent className="space-y-3 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      {post.title && <p className="font-semibold">{post.title}</p>}
                      <Badge variant={post.isPublished ? "default" : "secondary"} className="text-xs">
                        {post.isPublished ? "Publiée" : "Brouillon"}
                      </Badge>
                    </div>
                    <p className="mt-1 whitespace-pre-wrap break-words text-sm text-muted-foreground">{post.content}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => openEditPost(post)}
                      aria-label="Modifier l'annonce"
                      data-testid={`button-edit-news-${post.id}`}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="text-red-500"
                      onClick={() => {
                        if (window.confirm("Supprimer cette annonce ?")) deleteMutation.mutate(post.id);
                      }}
                      disabled={deleteMutation.isPending}
                      aria-label="Supprimer l'annonce"
                      data-testid={`button-delete-news-${post.id}`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    type="button"
                    variant={post.isPublished ? "outline" : "default"}
                    size="sm"
                    onClick={() => togglePublication(post)}
                    disabled={updateMutation.isPending}
                    data-testid={`button-toggle-news-${post.id}`}
                  >
                    {post.isPublished ? <EyeOff className="mr-2 h-4 w-4" /> : <Eye className="mr-2 h-4 w-4" />}
                    {post.isPublished ? "Mettre en brouillon" : "Publier"}
                  </Button>
                </div>
                <div className="flex items-center justify-between border-t pt-3 text-xs text-muted-foreground">
                  <span>{formatDate(post.createdAt)}</span>
                  <div className="flex items-center gap-3">
                    <span className="inline-flex items-center gap-1"><Eye className="h-3.5 w-3.5" />{post.viewsCount}</span>
                    <span className="inline-flex items-center gap-1"><Heart className="h-3.5 w-3.5" />{post.likesCount}</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog
        open={Boolean(editingPost)}
        onOpenChange={(open) => {
          if (!open && !updateMutation.isPending) setEditingPost(null);
        }}
      >
        <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Modifier l'actualité</DialogTitle>
          </DialogHeader>
          <form onSubmit={saveEdit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="edit-news-title">Titre (facultatif)</Label>
              <Input
                id="edit-news-title"
                value={editTitle}
                maxLength={120}
                onChange={(event) => setEditTitle(event.target.value)}
                placeholder="Titre de l'annonce"
                data-testid="input-edit-news-title"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-news-content">Texte de l'annonce</Label>
              <Textarea
                id="edit-news-content"
                value={editContent}
                maxLength={20000}
                onChange={(event) => setEditContent(event.target.value)}
                placeholder="Écrivez votre annonce ici..."
                rows={7}
                data-testid="input-edit-news-content"
              />
              <p className={`text-xs ${countWords(editContent) >= MIN_NEWS_WORDS ? "text-emerald-600" : "text-muted-foreground"}`}>
                {countWords(editContent)} / {MIN_NEWS_WORDS} mots minimum
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="edit-news-views-count">Nombre de vues</Label>
                <Input
                  id="edit-news-views-count"
                  type="number"
                  min="0"
                  step="1"
                  value={editViewsCount}
                  onChange={(event) => setEditViewsCount(event.target.value)}
                  data-testid="input-edit-news-views-count"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-news-likes-count">Nombre de j'aime</Label>
                <Input
                  id="edit-news-likes-count"
                  type="number"
                  min="0"
                  step="1"
                  value={editLikesCount}
                  onChange={(event) => setEditLikesCount(event.target.value)}
                  data-testid="input-edit-news-likes-count"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Image (facultative)</Label>
              <input
                ref={editImageInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                onChange={(event) => {
                  void handleImageChange(event.target.files?.[0], setEditImageUrl);
                  event.target.value = "";
                }}
                data-testid="input-edit-news-image"
              />
              {editImageUrl ? (
                <div className="relative overflow-hidden rounded-lg border">
                  <img src={editImageUrl} alt="Aperçu de l'annonce" className="max-h-56 w-full object-cover" />
                  <button
                    type="button"
                    className="absolute right-2 top-2 rounded-full bg-black/65 p-1.5 text-white"
                    onClick={() => setEditImageUrl(null)}
                    aria-label="Supprimer l'image"
                    data-testid="button-remove-edit-news-image"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ) : (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => editImageInputRef.current?.click()}
                  data-testid="button-add-edit-news-image"
                >
                  <ImagePlus className="mr-2 h-4 w-4" />
                  Ajouter une image
                </Button>
              )}
              <div className="space-y-2">
                <Label htmlFor="edit-news-image-url">URL de l'image</Label>
                <Input
                  id="edit-news-image-url"
                  type="url"
                  value={editImageUrl?.startsWith("data:") ? "" : editImageUrl ?? ""}
                  onChange={(event) => setEditImageUrl(event.target.value.trim() || null)}
                  placeholder="https://images.unsplash.com/..."
                  data-testid="input-edit-news-image-url"
                />
              </div>
              <p className="text-xs text-muted-foreground">JPG, PNG ou WebP, 3 Mo maximum, ou URL HTTPS publique.</p>
            </div>
            <div className="flex items-center justify-between rounded-lg border p-3">
              <div>
                <p className="text-sm font-medium">Visibilité</p>
                <p className="text-xs text-muted-foreground">
                  {editIsPublished ? "Les utilisateurs voient cette actualité." : "Cette actualité reste masquée."}
                </p>
              </div>
              <Button
                type="button"
                variant={editIsPublished ? "outline" : "default"}
                size="sm"
                onClick={() => setEditIsPublished((published) => !published)}
                data-testid="button-edit-news-publication-status"
              >
                {editIsPublished ? <EyeOff className="mr-2 h-4 w-4" /> : <Eye className="mr-2 h-4 w-4" />}
                {editIsPublished ? "Dépublier" : "Publier"}
              </Button>
            </div>
            <DialogFooter>
              <Button type="submit" disabled={updateMutation.isPending} data-testid="button-save-news">
                {updateMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Enregistrer
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}