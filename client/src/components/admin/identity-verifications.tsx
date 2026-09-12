import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { BadgeCheck, Check, Clock3, Eye, ImageIcon, Loader2, Search, Share2, X } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import RefreshLoader from "@/components/refresh-loader";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { IdentityVerification, User } from "@shared/schema";

type SafeUser = Omit<User, "password" | "adminPin">;

type IdentityVerificationWithUser = IdentityVerification & {
  user: SafeUser;
};

type StatusFilter = "all" | "pending" | "approved" | "rejected";

const statusLabels: Record<StatusFilter, string> = {
  all: "Toutes",
  pending: "En attente",
  approved: "Approuvées",
  rejected: "Rejetées",
};

function formatDate(value: string | Date) {
  return new Date(value).toLocaleString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

async function saveIdentityImage(dataUrl: string, label: string) {
  const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) return;

  const [, mimeType, base64Data] = match;
  const byteCharacters = window.atob(base64Data);
  const byteArray = new Uint8Array(byteCharacters.length);
  for (let index = 0; index < byteCharacters.length; index += 1) {
    byteArray[index] = byteCharacters.charCodeAt(index);
  }

  const extension = mimeType === "image/jpeg" ? "jpg" : mimeType.split("/")[1] || "bin";
  const safeLabel = label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const blob = new Blob([byteArray], { type: mimeType });
  const file = new File([blob], `${safeLabel || "image-identite"}.${extension}`, { type: mimeType });

  if (navigator.share && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({
        title: label,
        files: [file],
      });
      return;
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
    }
  }

  const imageUrl = URL.createObjectURL(blob);
  window.open(imageUrl, "_blank", "noopener,noreferrer");
  window.setTimeout(() => URL.revokeObjectURL(imageUrl), 60_000);
}

export default function AdminIdentityVerifications() {
  const { toast } = useToast();
  const [filter, setFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("pending");
  const [preview, setPreview] = useState<{ src: string; label: string } | null>(null);
  const [processingId, setProcessingId] = useState<number | null>(null);

  const { data: verifications = [], isLoading } = useQuery<IdentityVerificationWithUser[]>({
    queryKey: ["/api/admin/identity-verifications"],
    queryFn: async () => {
      const response = await fetch("/api/admin/identity-verifications?status=all", {
        credentials: "include",
      });
      if (!response.ok) throw new Error("Impossible de charger les vérifications");
      return response.json();
    },
    refetchInterval: 30000,
  });

  const processMutation = useMutation({
    mutationFn: async ({ id, status }: { id: number; status: "approved" | "rejected" }) => {
      setProcessingId(id);
      const response = await apiRequest("PATCH", `/api/admin/identity-verifications/${id}/status`, { status });
      return response.json();
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/identity-verifications"] });
      toast({
        title: variables.status === "approved" ? "Vérification approuvée" : "Vérification rejetée",
        description: "Le statut de l'utilisateur a été mis à jour.",
      });
    },
    onError: (error: Error) => {
      toast({ title: "Erreur", description: error.message, variant: "destructive" });
    },
    onSettled: () => setProcessingId(null),
  });

  const pendingCount = verifications.filter((item) => item.status === "pending").length;
  const filteredVerifications = useMemo(() => {
    const normalizedFilter = filter.trim().toLowerCase();
    return verifications.filter((verification) => {
      const matchesStatus = statusFilter === "all" || verification.status === statusFilter;
      const matchesSearch = !normalizedFilter || [
        verification.fullName,
        verification.idNumber,
        verification.user.phone,
        verification.user.country,
        String(verification.user.id),
      ].some((value) => String(value).toLowerCase().includes(normalizedFilter));
      return matchesStatus && matchesSearch;
    });
  }, [filter, statusFilter, verifications]);

  return (
    <div className="space-y-4">
      {pendingCount > 0 && (
        <div className="flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 dark:border-amber-800 dark:bg-amber-950">
          <Clock3 className="h-4 w-4 text-amber-600" />
          <p className="text-sm font-medium text-amber-700 dark:text-amber-300">
            {pendingCount} vérification{pendingCount > 1 ? "s" : ""} en attente de validation
          </p>
        </div>
      )}

      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          className="pl-10"
          placeholder="Rechercher par nom, téléphone ou numéro de carte..."
          value={filter}
          onChange={(event) => setFilter(event.target.value)}
          data-testid="input-search-identity-verifications"
        />
      </div>

      <div className="flex gap-2 overflow-x-auto">
        {(["pending", "approved", "rejected", "all"] as StatusFilter[]).map((status) => (
          <Button
            key={status}
            size="sm"
            className="whitespace-nowrap"
            variant={statusFilter === status ? "default" : "outline"}
            onClick={() => setStatusFilter(status)}
            data-testid={`button-filter-identity-${status}`}
          >
            {statusLabels[status]}{status === "pending" && pendingCount > 0 ? ` (${pendingCount})` : ""}
          </Button>
        ))}
      </div>

      <div className="space-y-4">
        {isLoading ? (
          <RefreshLoader />
        ) : filteredVerifications.length > 0 ? (
          filteredVerifications.map((verification) => {
            const isProcessing = processingId === verification.id;
            const status = verification.status as StatusFilter;

            return (
              <Card key={verification.id} className={status === "pending" ? "border-amber-300 dark:border-amber-700" : ""}>
                <CardContent className="space-y-4 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <BadgeCheck className="h-5 w-5 text-primary" />
                        <p className="font-semibold text-foreground">{verification.fullName}</p>
                      </div>
                      <p className="mt-1 text-sm text-muted-foreground">
                        Utilisateur #{verification.user.id} · {verification.user.phone} · {verification.user.country}
                      </p>
                    </div>
                    <Badge variant={status === "approved" ? "default" : status === "rejected" ? "destructive" : "secondary"}>
                      {statusLabels[status] || verification.status}
                    </Badge>
                  </div>

                  <div className="grid grid-cols-1 gap-2 rounded-xl bg-secondary/50 p-3 text-sm sm:grid-cols-2">
                    <div>
                      <p className="text-xs text-muted-foreground">Nom transmis</p>
                      <p className="font-medium">{verification.fullName}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Numéro de carte</p>
                      <p className="font-medium">{verification.idNumber}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Téléphone du compte</p>
                      <p className="font-medium">{verification.user.phone}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Pays</p>
                      <p className="font-medium">{verification.user.country}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Référence utilisateur</p>
                      <p className="font-medium">#{verification.user.id}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Soumise / mise à jour</p>
                      <p className="font-medium">{formatDate(verification.updatedAt)}</p>
                    </div>
                  </div>

                  <div>
                    <div className="mb-2 flex items-center gap-1.5">
                      <ImageIcon className="h-4 w-4 text-muted-foreground" />
                      <p className="text-sm font-medium text-foreground">Documents d'identité</p>
                    </div>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                       {[
                        { label: "Recto de la carte", src: verification.idFront },
                        { label: "Verso de la carte", src: verification.idBack },
                        { label: "Photo avec la carte", src: verification.selfie },
                      ].map((document) => (
                         <div
                          key={document.label}
                           className="overflow-hidden rounded-xl border border-border bg-muted"
                        >
                           <button
                             type="button"
                             className="group relative block h-44 w-full overflow-hidden bg-muted text-left"
                             onClick={() => setPreview(document)}
                             data-testid={`button-preview-identity-${verification.id}-${document.label}`}
                           >
                             <img
                               src={document.src}
                               alt={document.label}
                               className="h-full w-full object-contain transition-transform group-hover:scale-[1.02]"
                             />
                             <span className="absolute inset-x-0 bottom-0 flex items-center justify-between bg-black/65 px-2 py-1.5 text-xs font-medium text-white">
                               {document.label}
                               <Eye className="h-3.5 w-3.5" />
                             </span>
                           </button>
                           <button
                             type="button"
                             className="flex w-full items-center justify-center gap-1.5 border-t bg-background px-2 py-2 text-xs font-medium text-primary hover:bg-primary/5"
                             onClick={() => void saveIdentityImage(document.src, document.label)}
                             data-testid={`button-download-identity-${verification.id}-${document.label}`}
                           >
                             <Share2 className="h-3.5 w-3.5" />
                             Enregistrer dans la galerie
                           </button>
                         </div>
                      ))}
                    </div>
                  </div>

                  {status === "pending" && (
                    <div className="flex flex-col gap-2 sm:flex-row">
                      <Button
                        className="flex-1"
                        disabled={isProcessing}
                        onClick={() => processMutation.mutate({ id: verification.id, status: "approved" })}
                        data-testid={`button-approve-identity-${verification.id}`}
                      >
                        {isProcessing ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Check className="mr-2 h-4 w-4" /> Approuver</>}
                      </Button>
                      <Button
                        variant="destructive"
                        className="flex-1"
                        disabled={isProcessing}
                        onClick={() => processMutation.mutate({ id: verification.id, status: "rejected" })}
                        data-testid={`button-reject-identity-${verification.id}`}
                      >
                        <X className="mr-2 h-4 w-4" /> Rejeter
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })
        ) : (
          <div className="py-12 text-center text-muted-foreground">
            Aucune vérification d'identité trouvée
          </div>
        )}
      </div>

      <Dialog open={Boolean(preview)} onOpenChange={(open) => !open && setPreview(null)}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>{preview?.label || "Document d'identité"}</DialogTitle>
          </DialogHeader>
          {preview && (
            <div className="flex max-h-[75vh] items-center justify-center overflow-auto rounded-xl bg-muted p-2">
              <img src={preview.src} alt={preview.label} className="max-h-[70vh] max-w-full object-contain" />
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}