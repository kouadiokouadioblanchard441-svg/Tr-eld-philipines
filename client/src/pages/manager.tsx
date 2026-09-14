import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/lib/auth";
import { useLocation } from "wouter";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import RefreshLoader from "@/components/refresh-loader";
import {
  ChevronLeft,
  CheckCheck,
  Download,
  FileText,
  Image as ImageIcon,
  Loader2,
  MoreHorizontal,
  Paperclip,
  Send,
  Smile,
  X,
} from "lucide-react";
import herveAvatar from "@assets/generated_images/herve-chat-avatar-3d.png";

interface SupportMessage {
  id: number;
  userId: number;
  senderRole: "user" | "admin";
  message: string;
  attachmentName: string | null;
  attachmentMimeType: string | null;
  attachmentData: string | null;
  createdAt: string;
}

interface SupportConversationStatus {
  isClosed: boolean;
  closedAt: string | null;
}

const MAX_ATTACHMENT_SIZE = 5 * 1024 * 1024;
const IMAGE_ACCEPTED_TYPES = "image/*";
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
const FILE_ACCEPTED_TYPES = [
  "application/pdf",
  "application/zip",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "text/plain",
].join(",");

function formatMessageDate(dateString: string) {
  return new Date(dateString).toLocaleTimeString("fr-FR", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function isExchangeSeparator(message: string) {
  return message.trimStart().startsWith("Échange terminé");
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
      <a href={message.attachmentData} target="_blank" rel="noreferrer" className="manager-image-link">
        <img
          src={message.attachmentData}
          alt={message.attachmentName || "Image jointe"}
          className="manager-attachment-image"
        />
      </a>
    );
  }

  return (
    <a
      href={message.attachmentData}
      download={message.attachmentName || "piece-jointe"}
      className="manager-file-link"
    >
      <FileText aria-hidden="true" />
      <span>{message.attachmentName || "Pièce jointe"}</span>
      <Download aria-hidden="true" />
    </a>
  );
}

export default function ManagerPage() {
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const imageInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [message, setMessage] = useState("");
  const [attachment, setAttachment] = useState<{
    name: string;
    mimeType: string;
    data: string;
  } | null>(null);

  const { data: messages = [], isLoading } = useQuery<SupportMessage[]>({
    queryKey: ["/api/support/messages"],
    refetchInterval: 5000,
  });
  const { data: conversationStatus } = useQuery<SupportConversationStatus>({
    queryKey: ["/api/support/conversation"],
    refetchInterval: 5000,
  });
  const { data: withdrawalRequestStatus, isLoading: withdrawalRequestStatusLoading } = useQuery<{
    hasRequest: boolean;
  }>({
    queryKey: ["/api/support/withdrawal-request/status"],
    refetchInterval: 5000,
  });
  const isChatClosed = conversationStatus?.isClosed ?? false;
  const latestWithdrawalIndex = messages.reduce(
    (latestIndex, item, index) =>
      item.senderRole === "user" && item.message.includes("Numéro de retrait :") ? index : latestIndex,
    -1,
  );
  const withdrawalFinished = latestWithdrawalIndex >= 0 && messages
    .slice(latestWithdrawalIndex + 1)
    .some((item) => item.senderRole === "admin" && item.message.includes("Votre retrait a été validé et effectué."));

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const hadActiveWithdrawalRequest = useRef(false);
  useEffect(() => {
    if (withdrawalRequestStatusLoading || withdrawalRequestStatus === undefined) return;
    if (withdrawalRequestStatus.hasRequest) {
      hadActiveWithdrawalRequest.current = true;
      return;
    }
    if (hadActiveWithdrawalRequest.current) {
      toast({
        title: "Retrait terminé",
        description: "Cette conversation est maintenant fermée.",
      });
      navigate("/account");
    }
  }, [navigate, toast, withdrawalRequestStatus, withdrawalRequestStatusLoading]);

  const sendMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/support/messages", {
        message,
        attachmentName: attachment?.name || null,
        attachmentData: attachment?.data || null,
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "Impossible d'envoyer le message");
      return data;
    },
    onSuccess: () => {
      setMessage("");
      setAttachment(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      queryClient.invalidateQueries({ queryKey: ["/api/support/messages"] });
    },
    onError: (error: Error) => {
      toast({ title: "Erreur", description: error.message, variant: "destructive" });
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
      setAttachment({ name: file.name, mimeType: file.type, data: await readFile(file) });
    } catch (error) {
      toast({
        title: "Erreur",
        description: error instanceof Error ? error.message : "Impossible de lire ce fichier",
        variant: "destructive",
      });
    }
  };

  const sendMessage = (event: React.FormEvent) => {
    event.preventDefault();
    if ((!message.trim() && !attachment) || sendMutation.isPending) return;
    sendMutation.mutate();
  };

  if (!user) return null;

  if (!withdrawalRequestStatusLoading && withdrawalRequestStatus?.hasRequest === false) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-white px-5 text-center">
        <div className="mx-auto flex max-w-sm flex-col items-center gap-4">
          <h1 className="text-2xl font-semibold text-slate-900">Aucune demande de retrait en cours</h1>
          <p className="text-sm leading-6 text-slate-600">
            Mon gestionnaire est accessible après l'envoi d'une demande de retrait.
          </p>
          <button
            type="button"
            className="w-full rounded-lg bg-[#FF0000] px-5 py-3 font-semibold text-white hover:bg-[#C00000]"
            onClick={() => navigate("/withdrawal")}
            data-testid="button-manager-start-withdrawal"
          >
            Commencer un retrait
          </button>
          <button
            type="button"
            className="text-sm text-slate-500 underline"
            onClick={() => navigate("/account")}
          >
            Retour au compte
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="manager-page">
      <style>{`
        .manager-page {
          width: 100%;
          height: 100dvh;
          min-height: 100dvh;
          overflow: hidden;
          background: #f4f5f5;
          color: #111;
          font-family: Arial, Helvetica, sans-serif;
        }
        .manager-page .manager-screen {
          display: flex;
          width: 100%;
          max-width: 520px;
          height: 100dvh;
          min-height: 100dvh;
          margin: 0 auto;
          flex-direction: column;
          background: #f4f5f5;
        }
        .manager-page .manager-header {
          display: flex;
          height: 65px;
          flex: 0 0 65px;
          align-items: center;
          gap: 9px;
          border-bottom: 1px solid #e7e7e7;
          padding: 0 15px 0 12px;
          background: #fff;
        }
        .manager-page .manager-back,
        .manager-page .manager-header-menu {
          display: grid;
          width: 34px;
          height: 42px;
          flex: 0 0 34px;
          place-items: center;
          border: 0;
          background: transparent;
          color: #111;
        }
        .manager-page .manager-back svg {
          width: 23px;
          height: 23px;
          stroke-width: 2.2;
        }
        .manager-page .manager-header-menu {
          margin-left: auto;
        }
        .manager-page .manager-header-menu svg {
          width: 23px;
          height: 23px;
          stroke-width: 2.8;
        }
        .manager-page .manager-avatar {
          display: grid;
          width: 38px;
          height: 38px;
          flex: 0 0 38px;
          place-items: center;
          overflow: hidden;
          border-radius: 50%;
          background: #e9e9e9;
        }
        .manager-page .manager-avatar img {
          width: 100%;
          height: 100%;
          object-fit: cover;
          object-position: center;
        }
        .manager-page .manager-message-avatar {
          width: 28px;
          height: 28px;
          flex: 0 0 28px;
          align-self: flex-end;
          margin: 0 6px 2px 0;
          overflow: hidden;
          border-radius: 50%;
          background: #dce8e8;
          box-shadow: 0 1px 2px rgba(0, 0, 0, .12);
        }
        .manager-page .manager-message-avatar img {
          width: 100%;
          height: 100%;
          object-fit: cover;
          object-position: center;
        }
        .manager-page .manager-heading {
          min-width: 0;
        }
        .manager-page .manager-title {
          margin: 0;
          color: #141414;
          font-size: 16px;
          font-weight: 700;
          line-height: 1.1;
        }
        .manager-page .manager-status {
          display: block;
          margin-top: 5px;
          color: #9b9b9b;
          font-size: 12px;
          line-height: 1;
        }
        .manager-page .manager-status::before {
          display: inline-block;
          width: 6px;
          height: 6px;
          margin: 0 5px 1px 0;
          border-radius: 50%;
          background: #bcbcbc;
          content: "";
        }
        .manager-page .manager-messages {
          display: flex;
          min-height: 0;
          flex: 1;
          flex-direction: column;
          gap: 6px;
          overflow-x: hidden;
          overflow-y: auto;
          padding: 10px 15px 12px;
          background-color: #f4f5f5;
          background-image: url("data:image/svg+xml,%3Csvg width='84' height='84' viewBox='0 0 84 84' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' stroke='%23e7e9e9' stroke-width='1.2' opacity='.58'%3E%3Cpath d='M11 19c6-5 12 2 8 7-4 5-11 2-9-3m53-9c6 2 8 10 2 12-6 2-10-4-6-8m-4 48c6-4 13 3 8 8-4 4-11 1-9-4M16 65c4-5 11-2 10 4-1 5-8 6-11 2m37-53 5 5m-2-5-5 5M29 42c7-3 12 5 6 9-5 3-11-2-8-7'/%3E%3Ccircle cx='40' cy='18' r='2'/%3E%3Ccircle cx='69' cy='50' r='3'/%3E%3Cpath d='m71 25 5 5-5 5-5-5z'/%3E%3C/g%3E%3C/svg%3E");
        }
        .manager-page .manager-welcome {
          align-self: center;
          margin: 1px 0 5px;
          color: #a0a0a0;
          font-size: 10px;
          text-align: center;
        }
        .manager-page .manager-exchange-divider {
          display: flex;
          align-items: center;
          gap: 10px;
          width: 100%;
          padding: 12px 4px;
          color: #858585;
          font-size: 11px;
          font-weight: 700;
          letter-spacing: .02em;
          text-align: center;
        }
        .manager-page .manager-exchange-divider span:last-child {
          display: block;
          height: 1px;
          flex: 1;
          background: #cfd3d3;
        }
        .manager-page .manager-empty {
          display: flex;
          min-height: 120px;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          color: #888;
          font-size: 12px;
          text-align: center;
        }
        .manager-page .manager-row {
          display: flex;
          width: 100%;
        }
        .manager-page .manager-row.user {
          justify-content: flex-end;
        }
        .manager-page .manager-row.admin {
          justify-content: flex-start;
        }
        .manager-page .manager-bubble {
          max-width: 84%;
          border-radius: 16px;
          padding: 9px 12px 6px;
          box-shadow: 0 1px 1px rgba(0, 0, 0, .025);
        }
        .manager-page .manager-row.user .manager-bubble {
          border-bottom-right-radius: 5px;
          background: #dedede;
          color: #171717;
        }
        .manager-page .manager-row.admin .manager-bubble {
          border-bottom-left-radius: 5px;
          background: #fff;
          color: #171717;
        }
        .manager-page .manager-text {
          margin: 0;
          font-size: 15px;
          line-height: 1.35;
          white-space: pre-wrap;
          overflow-wrap: anywhere;
        }
        .manager-page .manager-time {
          display: inline-block;
          margin: 5px 0 0 9px;
          color: #999;
          font-size: 10px;
          line-height: 1;
        }
        .manager-page .manager-row.user .manager-time {
          float: right;
        }
        .manager-page .manager-checks {
          width: 14px;
          height: 14px;
          margin: 4px 0 0 3px;
          float: right;
          color: #8f8f8f;
          stroke-width: 2;
        }
        .manager-page .manager-attachment-image {
          display: block;
          max-width: 230px;
          max-height: 230px;
          border-radius: 9px;
          object-fit: cover;
        }
        .manager-page .manager-file-link {
          display: flex;
          max-width: 245px;
          align-items: center;
          gap: 8px;
          border-radius: 9px;
          padding: 9px 10px;
          background: #f0f0f0;
          color: inherit;
          font-size: 12px;
          text-decoration: none;
        }
        .manager-page .manager-file-link svg {
          width: 17px;
          height: 17px;
          flex: 0 0 auto;
        }
        .manager-page .manager-file-link span {
          min-width: 0;
          flex: 1;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .manager-page .manager-composer {
          position: relative;
          z-index: 2;
          flex: 0 0 auto;
          padding: 9px 15px 17px;
          background: #f4f5f5;
        }
        .manager-page .manager-closed-state {
          display: flex;
          min-height: 60px;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 4px;
          border: 1px solid #e1e4e4;
          border-radius: 12px;
          padding: 10px 14px;
          background: #fff;
          color: #7b8181;
          text-align: center;
        }
        .manager-page .manager-closed-state strong {
          color: #4f5656;
          font-size: 13px;
          font-weight: 700;
        }
        .manager-page .manager-closed-state span {
          font-size: 12px;
        }
        .manager-page .manager-new-withdrawal-button {
          margin-top: 7px;
          border: 0;
          border-radius: 999px;
          padding: 8px 14px;
          background: #FF0000;
          color: #fff;
          font-size: 12px;
          font-weight: 700;
        }
        .manager-page .manager-selected-file {
          display: flex;
          align-items: center;
          gap: 7px;
          margin: 0 0 8px 46px;
          border-radius: 8px;
          padding: 7px 9px;
          background: #fff;
          color: #555;
          font-size: 12px;
        }
        .manager-page .manager-selected-file span {
          min-width: 0;
          flex: 1;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .manager-page .manager-remove-file {
          display: grid;
          width: 24px;
          height: 24px;
          place-items: center;
          border: 0;
          border-radius: 50%;
          background: transparent;
          color: #555;
        }
        .manager-page .manager-input-row {
          display: flex;
          align-items: center;
          gap: 9px;
        }
        .manager-page .manager-icon-button {
          display: grid;
          width: 38px;
          height: 38px;
          flex: 0 0 38px;
          place-items: center;
          border: 0;
          border-radius: 50%;
          background: #fff;
          color: #111;
        }
        .manager-page .manager-icon-button svg {
          width: 24px;
          height: 24px;
          stroke-width: 1.9;
        }
        .manager-page .manager-input-shell {
          display: flex;
          min-width: 0;
          min-height: 44px;
          flex: 1;
          align-items: center;
          border-radius: 23px;
          padding: 0 8px 0 14px;
          background: #fff;
        }
        .manager-page .manager-textarea {
          min-height: 22px;
          max-height: 105px;
          flex: 1;
          resize: none;
          border: 0;
          padding: 10px 0;
          outline: none;
          color: #272727;
          font: inherit;
          font-size: 15px;
          line-height: 1.35;
        }
        .manager-page .manager-textarea::placeholder {
          color: #9a9a9a;
        }
        .manager-page .manager-action-button {
          display: grid;
          width: 34px;
          height: 34px;
          flex: 0 0 34px;
          place-items: center;
          border: 0;
          border-radius: 50%;
          background: transparent;
          color: #151515;
        }
        .manager-page .manager-action-button svg {
          width: 24px;
          height: 24px;
        }
        .manager-page .manager-action-button.send {
          color: #FF0000;
        }
        @media (min-width: 700px) {
          .manager-page .manager-screen {
            box-shadow: 0 0 24px rgba(0, 0, 0, .08);
          }
        }
      `}</style>

      <div className="manager-screen">
        <header className="manager-header">
          <button
            type="button"
            className="manager-back"
            onClick={() => navigate("/account")}
            aria-label="Retour à Mon compte"
            data-testid="button-manager-back"
          >
            <ChevronLeft aria-hidden="true" />
          </button>
          <div className="manager-avatar" aria-hidden="true">
            <img src={herveAvatar} alt="" />
          </div>
          <div className="manager-heading">
            <h1 className="manager-title">Hervé</h1>
           <span className="manager-status">
             {isChatClosed ? "Conversation fermée" : "Compte professionnel"}
           </span>
           {withdrawalFinished && (
             <span
               className="inline-flex items-center rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-semibold text-emerald-700"
               role="status"
               data-testid="badge-withdrawal-finished"
             >
               Votre retrait est terminé
             </span>
           )}
          </div>
          <button type="button" className="manager-header-menu" aria-label="Options de la conversation">
            <MoreHorizontal aria-hidden="true" />
          </button>
        </header>

        <section className="manager-messages" aria-label="Conversation avec le service client">
          <span className="manager-welcome">Vos échanges avec le service client sont privés.</span>
          {isLoading ? (
            <RefreshLoader />
          ) : (
            <>
              <div className="manager-row admin">
                <div className="manager-message-avatar" aria-hidden="true">
                  <img src={herveAvatar} alt="" />
                </div>
                <article className="manager-bubble">
                  <p className="manager-text">Bonjour, je suis Hervé, votre gestionnaire. Comment puis-je vous aider ?</p>
                  <time className="manager-time">14:20</time>
                </article>
              </div>
              {messages.map((item) => (
                isExchangeSeparator(item.message) ? (
                  <div className="manager-exchange-divider" key={item.id} role="separator">
                    <span>Échange terminé</span>
                    <span aria-hidden="true" />
                  </div>
                ) : (
                <div className={`manager-row ${item.senderRole}`} key={item.id}>
                  {item.senderRole === "admin" && (
                    <div className="manager-message-avatar" aria-hidden="true">
                      <img src={herveAvatar} alt="" />
                    </div>
                  )}
                  <article className="manager-bubble">
                    {item.message && <p className="manager-text">{item.message}</p>}
                    <Attachment message={item} />
                    <time className="manager-time">{formatMessageDate(item.createdAt)}</time>
                    {item.senderRole === "user" && <CheckCheck className="manager-checks" aria-label="Envoyé" />}
                  </article>
                </div>
                )
              ))}
            </>
          )}
          <div ref={messagesEndRef} />
        </section>

        {isChatClosed ? (
          <div className="manager-composer">
            <div className="manager-closed-state" role="status">
              <strong>Cette conversation est fermée</strong>
              <span>Pour ouvrir un nouvel échange, lancez un nouveau retrait.</span>
              <button
                type="button"
                className="manager-new-withdrawal-button"
                onClick={() => navigate("/withdrawal")}
                data-testid="button-start-new-withdrawal"
              >
                Ouvrir un nouveau retrait
              </button>
            </div>
          </div>
        ) : (
          <form className="manager-composer" onSubmit={sendMessage}>
            {attachment && (
              <div className="manager-selected-file">
                {attachment.mimeType.startsWith("image/") ? <ImageIcon aria-hidden="true" /> : <FileText aria-hidden="true" />}
                <span>{attachment.name}</span>
                <button
                  type="button"
                  className="manager-remove-file"
                  onClick={() => setAttachment(null)}
                  aria-label="Retirer la pièce jointe"
                  data-testid="button-remove-manager-file"
                >
                  <X aria-hidden="true" />
                </button>
              </div>
            )}
            <div className="manager-input-row">
              <input
                ref={imageInputRef}
                type="file"
                accept={IMAGE_ACCEPTED_TYPES}
                className="hidden"
                onChange={(event) => {
                  void handleFile(event.target.files?.[0]);
                  event.target.value = "";
                }}
                data-testid="input-manager-image"
              />
              <input
                ref={fileInputRef}
                type="file"
                accept={FILE_ACCEPTED_TYPES}
                className="hidden"
                onChange={(event) => {
                  void handleFile(event.target.files?.[0]);
                  event.target.value = "";
                }}
                data-testid="input-manager-file"
              />
              <button
                type="button"
                className="manager-icon-button"
                onClick={() => imageInputRef.current?.click()}
                aria-label="Choisir une image dans la galerie"
                data-testid="button-manager-image"
              >
                <ImageIcon aria-hidden="true" />
              </button>
              <button
                type="button"
                className="manager-icon-button"
                onClick={() => fileInputRef.current?.click()}
                aria-label="Ajouter un fichier"
                data-testid="button-manager-file"
              >
                <Paperclip aria-hidden="true" />
              </button>
              <div className="manager-input-shell">
                <textarea
                  className="manager-textarea"
                  value={message}
                  onChange={(event) => setMessage(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && !event.shiftKey) {
                      event.preventDefault();
                      if ((message.trim() || attachment) && !sendMutation.isPending) sendMutation.mutate();
                    }
                  }}
                  placeholder="Saisissez votre message ici"
                  rows={1}
                  aria-label="Message"
                  data-testid="input-manager-message"
                />
                <button
                  type={message.trim() || attachment ? "submit" : "button"}
                  className={`manager-action-button ${message.trim() || attachment ? "send" : ""}`}
                  disabled={sendMutation.isPending}
                  aria-label={message.trim() || attachment ? "Envoyer le message" : "Emoji"}
                  data-testid="button-manager-send"
                >
                  {sendMutation.isPending ? <Loader2 className="animate-spin" aria-hidden="true" /> : message.trim() || attachment ? <Send aria-hidden="true" /> : <Smile aria-hidden="true" />}
                </button>
              </div>
            </div>
          </form>
        )}
      </div>
    </main>
  );
}