import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import RefreshLoader from "@/components/refresh-loader";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import {
  ChevronDown,
  ChevronUp,
  Download,
  FileText,
  Headset,
  History,
  Image as ImageIcon,
  Loader2,
  Lock,
  Paperclip,
  Pencil,
  Send,
  Unlock,
  UserRound,
  X,
} from "lucide-react";

interface SupportMessage {
  id: number;
  userId: number;
  senderRole: "user" | "admin";
  message: string;
  attachmentName: string | null;
  attachmentMimeType: string | null;
  attachmentData: string | null;
  createdAt: string;
  editedBy: number | null;
  editedAt: string | null;
  editedByName: string | null;
  userFullName: string;
  userPhone: string;
}

interface SupportMessageEditAudit {
  id: number;
  messageId: number;
  previousMessage: string;
  editedBy: number | null;
  editedAt: string;
  editedByName: string | null;
}

interface Conversation {
  userId: number;
  userFullName: string;
  userPhone: string;
  isClosed: boolean;
  closedAt: string | null;
  unreadCount: number;
  messages: SupportMessage[];
}

type ConversationFilter = "pending" | "open" | "closed" | "all";

const MAX_ATTACHMENT_SIZE = 5 * 1024 * 1024;
const ACCEPTED_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "application/pdf",
  "application/zip",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "text/plain",
].join(",");

function formatDate(dateString: string) {
  return new Date(dateString).toLocaleString("fr-FR", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function editorLabel(
  editedBy: number | null,
  editedByName: string | null,
  editedAt: string | null,
) {
  if (!editedAt) return null;
  if (editedByName) return `par ${editedByName}`;
  if (editedBy === null) return "par un administrateur supprimé";
  return "par un administrateur dont le compte est introuvable";
}

function latestMessage(conversation: Conversation) {
  return conversation.messages.reduce<SupportMessage | undefined>((latest, message) => {
    if (!latest) return message;

    const messageTime = new Date(message.createdAt).getTime();
    const latestTime = new Date(latest.createdAt).getTime();
    return messageTime > latestTime || (messageTime === latestTime && message.id > latest.id)
      ? message
      : latest;
  }, undefined);
}

function isPendingConversation(conversation: Conversation) {
  return !conversation.isClosed && latestMessage(conversation)?.senderRole === "user";
}

function readFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Impossible de lire ce fichier"));
    reader.readAsDataURL(file);
  });
}

function Attachment({ message }: { message: SupportMessage }) {
  if (!message.attachmentData) return null;
  if (message.attachmentMimeType?.startsWith("image/")) {
    return (
      <a href={message.attachmentData} target="_blank" rel="noreferrer">
        <img
          src={message.attachmentData}
          alt={message.attachmentName || "Image jointe"}
          className="mt-2 max-h-48 max-w-full rounded-lg object-cover"
        />
      </a>
    );
  }

  return (
    <a
      href={message.attachmentData}
      download={message.attachmentName || "piece-jointe"}
      className="mt-2 flex max-w-xs items-center gap-2 rounded-lg bg-muted px-3 py-2 text-xs"
    >
      <FileText className="h-4 w-4 shrink-0" />
      <span className="min-w-0 flex-1 truncate">{message.attachmentName || "Pièce jointe"}</span>
      <Download className="h-4 w-4 shrink-0" />
    </a>
  );
}

export default function AdminSupportChat() {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isExpanded, setIsExpanded] = useState(false);
  const [conversationFilter, setConversationFilter] = useState<ConversationFilter>("all");
  const [selectedUserId, setSelectedUserId] = useState<number | null>(null);
  const [message, setMessage] = useState("");
  const [attachment, setAttachment] = useState<{ name: string; data: string } | null>(null);
  const [editingMessageId, setEditingMessageId] = useState<number | null>(null);
  const [editingMessage, setEditingMessage] = useState("");
  const [editError, setEditError] = useState<string | null>(null);
  const [historyMessageId, setHistoryMessageId] = useState<number | null>(null);

  const { data: conversations = [], isLoading } = useQuery<Conversation[]>({
    queryKey: ["/api/admin/support/conversations"],
    refetchInterval: 5000,
  });

  const { data: editHistory = [], isLoading: isHistoryLoading, isError: isHistoryError } = useQuery<SupportMessageEditAudit[]>({
    queryKey: ["/api/admin/support/messages", historyMessageId, "history"],
    enabled: historyMessageId !== null,
    queryFn: async () => {
      const response = await apiRequest("GET", `/api/admin/support/messages/${historyMessageId}/history`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "Impossible de charger l'historique");
      return data;
    },
  });

  const pendingConversations = conversations.filter(isPendingConversation);
  const openConversations = conversations.filter((conversation) =>
    !conversation.isClosed && !isPendingConversation(conversation)
  );
  const closedConversations = conversations.filter((conversation) => conversation.isClosed);
  const totalUnreadCount = conversations.reduce((total, conversation) => total + conversation.unreadCount, 0);
  const unreadConversationCount = conversations.filter((conversation) => conversation.unreadCount > 0).length;
  const filteredConversations = conversationFilter === "pending"
    ? pendingConversations
    : conversationFilter === "open"
      ? openConversations
      : conversationFilter === "closed"
        ? closedConversations
        : conversations;

  useEffect(() => {
    if (selectedUserId !== null && !filteredConversations.some((item) => item.userId === selectedUserId)) {
      setSelectedUserId(null);
    }
  }, [filteredConversations, selectedUserId]);

  const selectedConversation = filteredConversations.find((item) => item.userId === selectedUserId);

  const statusMutation = useMutation({
    mutationFn: async ({ userId, isClosed }: { userId: number; isClosed: boolean }) => {
      const response = await apiRequest("PATCH", `/api/admin/support/conversations/${userId}`, { isClosed });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "Impossible de modifier le statut du chat");
      return data;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/support/conversations"] });
      toast({ title: variables.isClosed ? "Chat fermé" : "Chat rouvert" });
    },
    onError: (error: Error) => {
      toast({ title: "Erreur", description: error.message, variant: "destructive" });
    },
  });

  const markReadMutation = useMutation({
    mutationFn: async (userId: number) => {
      const response = await apiRequest("POST", `/api/admin/support/conversations/${userId}/read`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "Impossible de marquer la conversation comme lue");
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/support/conversations"] });
    },
    onError: (error: Error) => {
      toast({ title: "Erreur", description: error.message, variant: "destructive" });
    },
  });

  const replyMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/admin/support/messages", {
        userId: selectedUserId,
        message,
        attachmentName: attachment?.name || null,
        attachmentData: attachment?.data || null,
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "Impossible d'envoyer la réponse");
      return data;
    },
    onSuccess: () => {
      setMessage("");
      setAttachment(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
       queryClient.invalidateQueries({ queryKey: ["/api/admin/support/conversations"] });
      toast({ title: "Réponse envoyée" });
    },
    onError: (error: Error) => {
      toast({ title: "Erreur", description: error.message, variant: "destructive" });
    },
  });

  const editMutation = useMutation({
    mutationFn: async ({ messageId, message }: { messageId: number; message: string }) => {
      const response = await apiRequest("PATCH", `/api/admin/support/messages/${messageId}`, { message });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "Impossible de modifier le message");
      return data;
    },
    onSuccess: () => {
      setEditingMessageId(null);
      setEditingMessage("");
      setEditError(null);
      queryClient.invalidateQueries({ queryKey: ["/api/admin/support/conversations"] });
      toast({ title: "Message modifié" });
    },
    onError: (error: Error) => {
      setEditError(error.message);
    },
  });

  const handleFile = async (file: File | undefined) => {
    if (!file) return;
    if (!ACCEPTED_TYPES.split(",").includes(file.type)) {
      toast({ title: "Fichier non pris en charge", description: "Choisissez une image, un PDF ou un document autorisé.", variant: "destructive" });
      return;
    }
    if (file.size > MAX_ATTACHMENT_SIZE) {
      toast({ title: "Fichier trop volumineux", description: "La pièce jointe doit faire au maximum 5 Mo.", variant: "destructive" });
      return;
    }
    try {
      setAttachment({ name: file.name, data: await readFile(file) });
    } catch (error) {
      toast({
        title: "Erreur",
        description: error instanceof Error ? error.message : "Impossible de lire ce fichier",
        variant: "destructive",
      });
    }
  };

  const sendReply = (event: React.FormEvent) => {
    event.preventDefault();
    if (selectedUserId === null || (!message.trim() && !attachment)) return;
    replyMutation.mutate();
  };

  const startEditing = (item: SupportMessage) => {
    setEditingMessageId(item.id);
    setEditingMessage(item.message);
    setEditError(null);
  };

  const cancelEditing = () => {
    setEditingMessageId(null);
    setEditingMessage("");
    setEditError(null);
  };

  const saveEditing = (event: React.FormEvent) => {
    event.preventDefault();
    if (editingMessageId === null || !editingMessage.trim() || editMutation.isPending) return;
    editMutation.mutate({
      messageId: editingMessageId,
      message: editingMessage,
    });
  };

  const selectConversation = (conversation: Conversation) => {
    setSelectedUserId(conversation.userId);
    if (conversation.unreadCount > 0) {
      markReadMutation.mutate(conversation.userId);
    }
  };

  return (
    <>
    <div className="space-y-4" data-testid="admin-support-section">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-3">
          <CardTitle className="min-w-0 flex-1">
            <button
              type="button"
              className="flex w-full items-center gap-2 text-left"
              onClick={() => setIsExpanded((expanded) => !expanded)}
              aria-expanded={isExpanded}
              aria-controls="admin-support-content"
              data-testid="button-toggle-support-chat"
            >
              <Headset className="h-5 w-5 shrink-0 text-primary" />
              <span className="min-w-0">
                <span className="block">Mon gestionnaire — Service client</span>
                <span className="mt-1 block text-xs font-normal text-muted-foreground">
                  {conversations.length > 0
                    ? `${conversations.length} utilisateur${conversations.length > 1 ? "s" : ""} dans la messagerie`
                    : "Aucune conversation"}
                </span>
              {totalUnreadCount > 0 && (
                <span
                  className="inline-flex min-w-5 items-center justify-center rounded-full bg-red-600 px-1.5 py-0.5 text-xs font-bold leading-none text-white"
                  aria-label={`${totalUnreadCount} message${totalUnreadCount > 1 ? "s" : ""} non lu${totalUnreadCount > 1 ? "s" : ""}`}
                  data-testid="badge-support-unread-total"
                >
                  {totalUnreadCount > 99 ? "99+" : totalUnreadCount}
                </span>
              )}
              </span>
              {isExpanded ? (
                <ChevronUp className="ml-auto h-5 w-5 shrink-0 text-muted-foreground" />
              ) : (
                <ChevronDown className="ml-auto h-5 w-5 shrink-0 text-muted-foreground" />
              )}
            </button>
          </CardTitle>
          <Button
            type="button"
            variant={isExpanded ? "outline" : "default"}
            size="sm"
            onClick={() => setIsExpanded((expanded) => !expanded)}
            aria-expanded={isExpanded}
            aria-controls="admin-support-content"
            data-testid="button-view-all-support"
          >
            {isExpanded ? "Réduire" : "Voir tout"}
          </Button>
        </CardHeader>
        {isExpanded && <CardContent id="admin-support-content" className="p-0">
          {isLoading ? (
            <RefreshLoader />
          ) : conversations.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 px-5 py-16 text-center text-muted-foreground">
               <Headset className="h-10 w-10 text-primary" />
               Aucun utilisateur disponible.
            </div>
          ) : (
            <div>
              <div className="flex flex-wrap items-center gap-2 border-b px-4 py-3">
                {([
                  { value: "pending", label: "En attente", count: pendingConversations.length },
                  { value: "open", label: "En cours", count: openConversations.length },
                  { value: "closed", label: "Fermées", count: closedConversations.length },
                  { value: "all", label: "Toutes", count: conversations.length },
                ] as Array<{ value: ConversationFilter; label: string; count: number }>).map((filter) => (
                  <button
                    key={filter.value}
                    type="button"
                    onClick={() => setConversationFilter(filter.value)}
                    className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                      conversationFilter === filter.value
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border bg-background text-muted-foreground hover:bg-muted"
                    }`}
                    aria-pressed={conversationFilter === filter.value}
                    data-testid={`button-support-filter-${filter.value}`}
                  >
                    {filter.label} ({filter.count})
                    {filter.value === "pending" && unreadConversationCount > 0 && (
                      <span className="ml-1 inline-flex min-w-4 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-bold leading-4 text-white">
                        {unreadConversationCount > 99 ? "99+" : unreadConversationCount}
                      </span>
                    )}
                  </button>
                ))}
              </div>

              <div className="grid min-h-[520px] md:grid-cols-[230px_minmax(0,1fr)]">
              <aside className="border-b md:border-b-0 md:border-r">
                <div className="max-h-[260px] overflow-y-auto md:max-h-[520px]">
                  {filteredConversations.length === 0 ? (
                    <div className="px-4 py-10 text-center text-sm text-muted-foreground">
                      {conversationFilter === "pending"
                        ? "Aucun nouveau message en attente."
                        : conversationFilter === "closed"
                          ? "Aucune conversation fermée."
                          : "Aucune conversation dans cette vue."}
                    </div>
                  ) : filteredConversations.map((conversation) => {
                    const last = latestMessage(conversation);
                    return (
                      <button
                        type="button"
                        key={conversation.userId}
                        className={`w-full border-b px-3 py-3 text-left transition-colors hover:bg-muted ${selectedUserId === conversation.userId ? "bg-primary/10" : ""}`}
                         onClick={() => selectConversation(conversation)}
                        data-testid={`button-support-user-${conversation.userId}`}
                      >
                         <span className="flex items-center gap-2">
                           <UserRound className="h-4 w-4 shrink-0 text-primary" />
                           <span className={`truncate text-sm ${conversation.unreadCount > 0 ? "font-bold" : "font-medium"}`}>
                             {conversation.userFullName || conversation.userPhone}
                           </span>
                           {conversation.unreadCount > 0 && (
                             <span
                               className="ml-auto inline-flex min-w-5 shrink-0 items-center justify-center rounded-full bg-red-600 px-1.5 py-0.5 text-[10px] font-bold leading-4 text-white"
                               aria-label={`${conversation.unreadCount} message${conversation.unreadCount > 1 ? "s" : ""} non lu${conversation.unreadCount > 1 ? "s" : ""}`}
                               data-testid={`badge-support-unread-${conversation.userId}`}
                             >
                               {conversation.unreadCount > 99 ? "99+" : conversation.unreadCount}
                             </span>
                           )}
                        </span>
                         <span className="mt-1 block truncate pl-6 text-xs text-muted-foreground">
                           {conversation.isClosed ? "Chat fermé" : last?.message || last?.attachmentName || "Aucune conversation"}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </aside>

              <section className="flex min-w-0 flex-col">
                {selectedConversation ? (
                  <>
                     <div className="flex items-center justify-between gap-3 border-b px-4 py-3">
                       <div className="min-w-0">
                         <p className="truncate font-semibold">{selectedConversation.userFullName}</p>
                         <p className="truncate text-xs text-muted-foreground">{selectedConversation.userPhone}</p>
                         <span className={`mt-1 inline-flex items-center gap-1 text-xs ${selectedConversation.isClosed ? "text-destructive" : "text-emerald-600"}`}>
                           {selectedConversation.isClosed ? <Lock className="h-3 w-3" /> : <Unlock className="h-3 w-3" />}
                           {selectedConversation.isClosed ? "Chat fermé" : "Chat ouvert"}
                         </span>
                       </div>
                       <Button
                         type="button"
                         variant={selectedConversation.isClosed ? "default" : "outline"}
                         size="sm"
                         disabled={statusMutation.isPending}
                         onClick={() => statusMutation.mutate({
                           userId: selectedConversation.userId,
                           isClosed: !selectedConversation.isClosed,
                         })}
                         aria-label={selectedConversation.isClosed ? "Rouvrir le chat" : "Fermer le chat"}
                       >
                         {statusMutation.isPending ? (
                           <Loader2 className="h-4 w-4 animate-spin" />
                         ) : selectedConversation.isClosed ? (
                           <>
                             <Unlock className="mr-1 h-4 w-4" />
                             Rouvrir
                           </>
                         ) : (
                           <>
                             <Lock className="mr-1 h-4 w-4" />
                             Fermer
                           </>
                         )}
                       </Button>
                    </div>
                    <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto bg-muted/20 p-4">
                       {selectedConversation.messages.length === 0 ? (
                         <div className="flex flex-1 items-center justify-center text-center text-sm text-muted-foreground">
                           Aucun message. Vous pouvez écrire à cet utilisateur.
                         </div>
                       ) : (
                         selectedConversation.messages.map((item) => (
                           <div key={item.id} className={`flex ${item.senderRole === "admin" ? "justify-end" : "justify-start"}`}>
                             <div className={`max-w-[85%] rounded-xl px-3 py-2 text-sm ${item.senderRole === "admin" ? "bg-primary text-primary-foreground" : "bg-background shadow-sm"}`}>
                                {editingMessageId === item.id ? (
                                  <form onSubmit={saveEditing} className="min-w-[220px] space-y-2">
                                    <Textarea
                                      value={editingMessage}
                                      onChange={(event) => setEditingMessage(event.target.value)}
                                      rows={3}
                                      maxLength={5000}
                                      autoFocus
                                      className="resize-none bg-background text-foreground"
                                      aria-label="Modifier le message"
                                      data-testid={`input-edit-support-message-${item.id}`}
                                    />
                                     {editError && (
                                       <p role="alert" className="text-xs text-destructive">
                                         {editError}
                                       </p>
                                     )}
                                    <div className="flex justify-end gap-2">
                                      <Button type="button" variant="ghost" size="sm" onClick={cancelEditing} disabled={editMutation.isPending}>
                                        Annuler
                                      </Button>
                                      <Button type="submit" size="sm" disabled={editMutation.isPending || !editingMessage.trim()}>
                                        {editMutation.isPending ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : null}
                                        Enregistrer
                                      </Button>
                                    </div>
                                  </form>
                                ) : (
                                  item.message && <p className="whitespace-pre-wrap break-words">{item.message}</p>
                                )}
                               <Attachment message={item} />
                                <div className="mt-1 flex flex-col items-end gap-0.5 text-[10px] opacity-65">
                                  <span>Envoyé le {formatDate(item.createdAt)}</span>
                                  {item.editedAt && (
                                    <span>
                                      Modifié le {formatDate(item.editedAt)}
                                       {editorLabel(item.editedBy, item.editedByName, item.editedAt)}
                                    </span>
                                  )}
                                  <div className="flex items-center gap-2">
                                  {item.senderRole === "admin" && editingMessageId !== item.id && (
                                    <>
                                      <button
                                        type="button"
                                        onClick={() => startEditing(item)}
                                        className="inline-flex items-center gap-1 rounded px-1 py-0.5 transition-colors hover:bg-black/10"
                                        aria-label="Modifier le message"
                                        data-testid={`button-edit-support-message-${item.id}`}
                                      >
                                        <Pencil className="h-3 w-3" />
                                        Modifier
                                      </button>
                                      {item.editedAt && (
                                        <button
                                          type="button"
                                          onClick={() => setHistoryMessageId(item.id)}
                                          className="inline-flex items-center gap-1 rounded px-1 py-0.5 transition-colors hover:bg-black/10"
                                          aria-label="Voir l'historique des modifications"
                                          data-testid={`button-view-support-history-${item.id}`}
                                        >
                                          <History className="h-3 w-3" />
                                          Historique
                                        </button>
                                      )}
                                    </>
                                  )}
                                  </div>
                                </div>
                             </div>
                          </div>
                         ))
                       )}
                    </div>
                     {selectedConversation.isClosed ? (
                       <div className="border-t bg-muted/30 p-3 text-center text-sm text-muted-foreground">
                         Ce chat est fermé pour cet utilisateur. Rouvrez-le pour répondre.
                       </div>
                     ) : (
                       <form onSubmit={sendReply} className="border-t p-3">
                         {attachment && (
                           <div className="mb-2 flex items-center gap-2 rounded-lg bg-muted px-3 py-2 text-xs">
                             <Paperclip className="h-4 w-4 text-primary" />
                             <span className="min-w-0 flex-1 truncate">{attachment.name}</span>
                             <button type="button" onClick={() => setAttachment(null)} aria-label="Retirer la pièce jointe">
                               <X className="h-4 w-4" />
                             </button>
                           </div>
                         )}
                         <div className="flex items-end gap-2">
                           <input
                             ref={fileInputRef}
                             type="file"
                             accept={ACCEPTED_TYPES}
                             className="hidden"
                             onChange={(event) => {
                               void handleFile(event.target.files?.[0]);
                               event.target.value = "";
                             }}
                           />
                           <Button type="button" variant="outline" size="icon" onClick={() => fileInputRef.current?.click()} aria-label="Joindre une image ou un fichier">
                             <Paperclip className="h-4 w-4" />
                           </Button>
                           <Textarea
                             value={message}
                             onChange={(event) => setMessage(event.target.value)}
                             placeholder="Répondre à l'utilisateur..."
                             rows={2}
                             className="min-h-10 resize-none"
                             data-testid="input-admin-support-message"
                           />
                           <Button type="submit" size="icon" disabled={replyMutation.isPending || (!message.trim() && !attachment)} aria-label="Envoyer la réponse">
                             {replyMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                           </Button>
                         </div>
                       </form>
                     )}
                  </>
                ) : (
                  <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
                    Cliquez sur un utilisateur dans la liste pour ouvrir sa discussion.
                  </div>
                )}
              </section>
              </div>
            </div>
          )}
        </CardContent>}
      </Card>
    </div>
    <Dialog open={historyMessageId !== null} onOpenChange={(open) => { if (!open) setHistoryMessageId(null); }}>
      <DialogContent className="max-h-[80vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Historique des modifications</DialogTitle>
        </DialogHeader>
        {isHistoryLoading ? (
          <RefreshLoader />
        ) : isHistoryError ? (
          <p className="text-sm text-destructive">Impossible de charger l'historique.</p>
        ) : editHistory.length === 0 ? (
          <p className="text-sm text-muted-foreground">Aucune modification enregistrée pour ce message.</p>
        ) : (
          <div className="space-y-3">
            {editHistory.map((edit) => (
              <div key={edit.id} className="rounded-lg border p-3">
                <p className="whitespace-pre-wrap break-words text-sm">{edit.previousMessage}</p>
                <p className="mt-2 text-xs text-muted-foreground">
                  Modifié le {formatDate(edit.editedAt)}
                   {editorLabel(edit.editedBy, edit.editedByName, edit.editedAt)}
                </p>
              </div>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
    </>
  );
}
