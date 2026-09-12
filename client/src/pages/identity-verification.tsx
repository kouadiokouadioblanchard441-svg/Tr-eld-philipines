import { useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { useMutation, useQuery } from "@tanstack/react-query";
import { ArrowLeft, Check, CircleCheck, Folder, Loader2 } from "lucide-react";
import RefreshLoader from "@/components/refresh-loader";
import { useAuth } from "@/lib/auth";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

type UploadSlot = "front" | "back" | "selfie";

type UploadValue = {
  dataUrl: string;
  fileName: string;
};

type IdentityVerification = {
  id: number;
  fullName: string;
  idNumber: string;
  idFront: string;
  idBack: string;
  selfie: string;
  status: string;
  createdAt: string;
  updatedAt: string;
};

const MAX_FILE_SIZE = 3 * 1024 * 1024;

const uploadCards: Array<{ key: UploadSlot; label: string; testId: string }> = [
  { key: "front", label: "Recto de la carte", testId: "upload-id-front" },
  { key: "back", label: "Verso de la carte", testId: "upload-id-back" },
  { key: "selfie", label: "Photo avec la carte", testId: "upload-id-selfie" },
];

function readImage(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Impossible de lire cette image"));
    reader.readAsDataURL(file);
  });
}

export default function IdentityVerificationPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const [fullName, setFullName] = useState(user?.fullName || "");
  const [idNumber, setIdNumber] = useState("");
  const [submittedStatus, setSubmittedStatus] = useState<string | null>(null);
  const [documents, setDocuments] = useState<Record<UploadSlot, UploadValue | null>>({
    front: null,
    back: null,
    selfie: null,
  });

  const frontInputRef = useRef<HTMLInputElement>(null);
  const backInputRef = useRef<HTMLInputElement>(null);
  const selfieInputRef = useRef<HTMLInputElement>(null);
  const inputRefs = { front: frontInputRef, back: backInputRef, selfie: selfieInputRef };

  const { data: verificationData, isLoading } = useQuery<{ verification: IdentityVerification | null }>({
    queryKey: ["/api/identity-verification"],
    enabled: Boolean(user),
    refetchOnMount: "always",
  });

  useEffect(() => {
    const verification = verificationData?.verification;
    if (!verification) return;

    setFullName(verification.fullName);
    setIdNumber(verification.idNumber);
    setDocuments({
      front: { dataUrl: verification.idFront, fileName: "Recto de la carte" },
      back: { dataUrl: verification.idBack, fileName: "Verso de la carte" },
      selfie: { dataUrl: verification.selfie, fileName: "Photo avec la carte" },
    });
  }, [verificationData]);

  const submitMutation = useMutation({
    mutationFn: async () => {
      const front = documents.front?.dataUrl;
      const back = documents.back?.dataUrl;
      const selfie = documents.selfie?.dataUrl;

      if (!fullName.trim()) throw new Error("Veuillez renseigner votre nom complet");
      if (!idNumber.trim()) throw new Error("Veuillez renseigner le numéro de la carte");
      if (!front || !back || !selfie) throw new Error("Veuillez ajouter les trois photos demandées");

      const response = await apiRequest("POST", "/api/identity-verification", {
        fullName: fullName.trim(),
        idNumber: idNumber.trim(),
        idFront: front,
        idBack: back,
        selfie,
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message || "Envoi impossible");
      return result;
    },
    onSuccess: () => {
      setSubmittedStatus("pending");
      toast({
        title: "Vérification envoyée",
        description: "Vos informations ont été transmises avec succès.",
      });
    },
    onError: (error: Error) => {
      toast({ title: "Erreur", description: error.message, variant: "destructive" });
    },
  });

  const handleFileChange = async (slot: UploadSlot, file: File | undefined) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast({ title: "Format non pris en charge", description: "Veuillez sélectionner une image.", variant: "destructive" });
      return;
    }
    if (file.size > MAX_FILE_SIZE) {
      toast({ title: "Image trop lourde", description: "Chaque image doit faire au maximum 3 Mo.", variant: "destructive" });
      return;
    }

    try {
      const dataUrl = await readImage(file);
      setDocuments((current) => ({
        ...current,
        [slot]: { dataUrl, fileName: file.name },
      }));
    } catch (error) {
      toast({
        title: "Erreur",
        description: error instanceof Error ? error.message : "Impossible de lire cette image",
        variant: "destructive",
      });
    }
  };

  const renderUploadCard = (card: (typeof uploadCards)[number]) => {
    const selected = documents[card.key];
    const inputRef = inputRefs[card.key];

    return (
      <div
        key={card.key}
        className={`identity-upload-card${selected ? " has-image" : ""}`}
        onClick={() => inputRef.current?.click()}
        role="button"
        tabIndex={0}
        data-testid={card.testId}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") inputRef.current?.click();
        }}
      >
        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="identity-file-input"
          onChange={(event) => {
            void handleFileChange(card.key, event.target.files?.[0]);
            event.target.value = "";
          }}
        />
        {selected ? (
          <>
            <img className="identity-upload-preview" src={selected.dataUrl} alt={card.label} />
            <span className="identity-upload-selected">
              <Check aria-hidden="true" />
              {card.label}
            </span>
          </>
        ) : (
          <span className="identity-upload-placeholder">
            <Folder aria-hidden="true" />
            <span>{card.label}</span>
          </span>
        )}
      </div>
    );
  };

  if (!user) return null;

  if (isLoading || !verificationData) {
    return <RefreshLoader />;
  }

  const verificationStatus = submittedStatus || verificationData?.verification?.status;

  if (verificationStatus === "pending") {
    return (
      <main className="identity-pending">
        <style>{`
          .identity-pending {
            position: relative;
            min-height: 100dvh;
            display: grid;
            place-items: center;
            overflow: hidden;
            background: #fff;
            font-family: Impact, Haettenschweiler, "Arial Narrow Bold", sans-serif;
          }
          .identity-pending-back,
          .identity-approved-back {
            position: fixed;
            top: 22px;
            left: 20px;
            z-index: 1;
            display: inline-flex;
            align-items: center;
            gap: 7px;
            border: 0;
            padding: 8px 10px;
            background: transparent;
            color: #303030;
            font-family: Arial, Helvetica, sans-serif;
            font-size: 15px;
            font-weight: 600;
            cursor: pointer;
          }
          .identity-pending-back svg,
          .identity-approved-back svg {
            width: 21px;
            height: 21px;
          }
          .identity-pending-stamp {
            display: flex;
            width: min(76.69vw, 533px);
            aspect-ratio: 533 / 214;
            align-items: center;
            border: 3px solid #ed1c16;
            border-radius: 7px;
            padding: 14px 24px;
            color: #ed1c16;
          }
          .identity-pending-stamp h1 {
            margin: 0;
            color: #ed1c16;
            font-family: Impact, Haettenschweiler, "Arial Narrow Bold", sans-serif;
            font-size: clamp(34px, 11.5vw, 79px);
            font-weight: 900;
            letter-spacing: -1.5px;
            line-height: .94;
            text-align: left;
            text-transform: uppercase;
          }
          @media (max-width: 380px) {
            .identity-pending-stamp {
              width: 86vw;
              padding-right: 17px;
              padding-left: 17px;
            }
            .identity-pending-stamp h1 {
              font-size: clamp(31px, 11.5vw, 48px);
            }
          }
        `}</style>
        <button
          type="button"
          className="identity-pending-back"
          onClick={() => navigate("/account")}
          aria-label="Retour à Mon compte"
          data-testid="button-identity-back-pending"
        >
          <ArrowLeft aria-hidden="true" />
          <span>Mon compte</span>
        </button>
        <div className="identity-pending-stamp" role="status" aria-label="Vérification en attente">
          <h1>Vérification<br />en attente</h1>
        </div>
      </main>
    );
  }

  if (verificationStatus === "approved") {
    return (
      <main className="identity-approved">
        <style>{`
          .identity-approved {
            position: relative;
            min-height: 100dvh;
            display: flex;
            align-items: center;
            justify-content: center;
            overflow: hidden;
            background: #fff;
            color: #111;
            font-family: Arial, Helvetica, sans-serif;
            text-align: center;
          }
          .identity-approved-back {
            color: #303030;
          }
          .identity-approved *,
          .identity-approved *::before,
          .identity-approved *::after {
            box-sizing: border-box;
          }
          .identity-approved-content {
            display: flex;
            flex-direction: column;
            align-items: center;
            width: 100%;
            padding: 24px;
          }
          .identity-approved-circle {
            display: grid;
            width: 100px;
            height: 100px;
            place-items: center;
            border-radius: 50%;
            background: #5bd978;
          }
          .identity-approved-circle svg {
            width: 54px;
            height: 54px;
            color: #124c3a;
            stroke-width: 2.4;
          }
          .identity-approved-title {
            margin: 15px 0 0;
            color: #111;
            font-size: 23px;
            font-weight: 700;
            line-height: 1.2;
          }
          .identity-approved-message {
            margin: 7px 0 0;
            color: #505050;
            font-size: 16px;
            font-weight: 400;
            line-height: 1.35;
          }
        `}</style>
        <button
          type="button"
          className="identity-approved-back"
          onClick={() => navigate("/account")}
          aria-label="Retour à Mon compte"
          data-testid="button-identity-back-approved"
        >
          <ArrowLeft aria-hidden="true" />
          <span>Mon compte</span>
        </button>
        <div className="identity-approved-content" data-testid="identity-approved-state">
          <div className="identity-approved-circle" aria-label="Vérification approuvée">
            <CircleCheck aria-hidden="true" />
          </div>
          <h1 className="identity-approved-title">Approuvé</h1>
          <p className="identity-approved-message">Votre vérification d'identité a été approuvée.</p>
        </div>
      </main>
    );
  }

  return (
    <main className="identity-reference">
      <style>{`
        .identity-reference {
          min-height: 100dvh;
          background: #f6f6f6;
          color: #343434;
          font-family: Arial, Helvetica, sans-serif;
        }
        .identity-reference *,
        .identity-reference *::before,
        .identity-reference *::after {
          box-sizing: border-box;
        }
        .identity-reference .identity-screen {
          position: relative;
          width: 100%;
          max-width: 500px;
          min-height: 100dvh;
          margin: 0 auto;
          padding: 74px 0 48px;
          background: #f6f6f6;
        }
        .identity-reference .identity-header {
          display: flex;
          height: 55px;
          align-items: center;
          padding: 0 29px 0 76px;
        }
        .identity-reference .identity-back {
          position: fixed;
          top: 22px;
          left: 20px;
          z-index: 10;
          display: grid;
          width: 36px;
          height: 36px;
          place-items: center;
          border: 0;
          padding: 0;
          background: transparent;
          color: #303030;
          cursor: pointer;
        }
        .identity-reference .identity-back svg {
          width: 31px;
          height: 31px;
          stroke-width: 1.9;
        }
        .identity-reference .identity-title {
          margin: 0;
          color: #181818;
          font-size: 22px;
          font-weight: 400;
          line-height: 1;
        }
        .identity-reference .identity-form-card {
          margin: 19px 22px 0;
          border-radius: 13px;
          padding: 25px 23px 26px;
          background: #fff;
          box-shadow: 0 1px 9px rgba(0, 0, 0, .035);
        }
        .identity-reference .identity-field + .identity-field {
          margin-top: 22px;
        }
        .identity-reference .identity-label,
        .identity-reference .identity-proof-label {
          display: block;
          color: #3b3b3b;
          font-size: 20px;
          font-weight: 700;
          line-height: 1.1;
        }
        .identity-reference .identity-required {
          color: #d94758;
          font-weight: 700;
        }
        .identity-reference .identity-input {
          display: block;
          width: 100%;
          height: 51px;
          margin-top: 10px;
          border: 0;
          border-bottom: 1px solid #eeeeee;
          border-radius: 0;
          outline: 0;
          padding: 0;
          background: transparent;
          color: #333;
          font: inherit;
          font-size: 20px;
          font-weight: 400;
        }
        .identity-reference .identity-input::placeholder {
          color: #878787;
          opacity: 1;
        }
        .identity-reference .identity-input:focus {
          border-bottom-color: #188be8;
        }
        .identity-reference .identity-proof-label {
          margin-top: 26px;
        }
        .identity-reference .identity-upload-list {
          display: grid;
          gap: 12px;
          margin-top: 20px;
        }
        .identity-reference .identity-upload-card {
          position: relative;
          display: flex;
          width: 100%;
          height: 118px;
          align-items: center;
          justify-content: center;
          overflow: hidden;
          border: 2px dashed #d0d0d0;
          border-radius: 13px;
          background: #fff;
          cursor: pointer;
          transition: border-color .12s ease, background-color .12s ease, transform .12s ease;
        }
        .identity-reference .identity-upload-card:hover {
          border-color: #aeb4bb;
          background: #fcfcfc;
        }
        .identity-reference .identity-upload-card:active {
          transform: scale(.99);
        }
        .identity-reference .identity-upload-card:focus-visible {
          outline: 3px solid rgba(24, 139, 232, .28);
          outline-offset: 2px;
        }
        .identity-reference .identity-file-input {
          display: none;
        }
        .identity-reference .identity-upload-placeholder {
          display: inline-flex;
          align-items: center;
          gap: 14px;
          color: #b2b5bb;
          font-size: 18px;
          font-weight: 400;
          line-height: 1;
        }
        .identity-reference .identity-upload-placeholder svg {
          width: 29px;
          height: 29px;
          fill: #aeb3bb;
          color: #aeb3bb;
          stroke-width: 1.3;
        }
        .identity-reference .identity-upload-preview {
          width: 100%;
          height: 100%;
          object-fit: contain;
          background: #f7f7f7;
        }
        .identity-reference .identity-upload-selected {
          position: absolute;
          right: 8px;
          bottom: 8px;
          display: inline-flex;
          align-items: center;
          gap: 4px;
          border-radius: 12px;
          padding: 5px 8px;
          background: rgba(24, 139, 232, .92);
          color: #fff;
          font-size: 11px;
          font-weight: 700;
        }
        .identity-reference .identity-upload-selected svg {
          width: 13px;
          height: 13px;
        }
        .identity-reference .identity-submit {
          display: flex;
          width: 74%;
          max-width: 307px;
          min-width: 250px;
          height: 52px;
          align-items: center;
          justify-content: center;
          margin: 22px auto 0;
          border: 0;
          border-radius: 28px;
          background: #188be8;
          box-shadow: 0 2px 3px rgba(19, 112, 197, .18);
          color: #fff;
          font-size: 18px;
          font-weight: 700;
          line-height: 1;
          cursor: pointer;
          transition: filter .12s ease, transform .12s ease;
        }
        .identity-reference .identity-submit:hover {
          filter: brightness(1.03);
        }
        .identity-reference .identity-submit:active {
          transform: scale(.98);
        }
        .identity-reference .identity-submit:disabled {
          cursor: wait;
          opacity: .72;
        }
        @media (max-width: 380px) {
          .identity-reference .identity-screen {
            padding-top: 42px;
          }
          .identity-reference .identity-header {
            padding-right: 22px;
            padding-left: 68px;
          }
          .identity-reference .identity-title {
            font-size: 20px;
          }
          .identity-reference .identity-form-card {
            margin-right: 16px;
            margin-left: 16px;
            padding-right: 18px;
            padding-left: 18px;
          }
          .identity-reference .identity-label,
          .identity-reference .identity-proof-label {
            font-size: 18px;
          }
          .identity-reference .identity-input {
            font-size: 18px;
          }
          .identity-reference .identity-upload-placeholder {
            font-size: 16px;
          }
        }
      `}</style>

      <div className="identity-screen">
        <header className="identity-header">
          <button
            type="button"
            className="identity-back"
            onClick={() => navigate("/account")}
            aria-label="Retour"
            data-testid="button-identity-back"
          >
            <ArrowLeft aria-hidden="true" />
          </button>
          <h1 className="identity-title">Vérification d'identité</h1>
        </header>

        <form
          onSubmit={(event) => {
            event.preventDefault();
            submitMutation.mutate();
          }}
        >
          <section className="identity-form-card" aria-label="Informations d'identité">
            <div className="identity-field">
              <label className="identity-label" htmlFor="identity-full-name">
                <span className="identity-required">*</span> Nom complet
              </label>
              <input
                id="identity-full-name"
                className="identity-input"
                value={fullName}
                onChange={(event) => setFullName(event.target.value)}
                placeholder="Veuillez entrer votre nom complet"
                autoComplete="name"
                required
                data-testid="input-identity-full-name"
              />
            </div>

            <div className="identity-field">
              <label className="identity-label" htmlFor="identity-card-number">
                <span className="identity-required">*</span> Numéro de la carte
              </label>
              <input
                id="identity-card-number"
                className="identity-input"
                value={idNumber}
                onChange={(event) => setIdNumber(event.target.value)}
                placeholder="Veuillez entrer le numéro de la carte"
                autoComplete="off"
                required
                data-testid="input-identity-card-number"
              />
            </div>

            <p className="identity-proof-label">
              <span className="identity-required">*</span> Preuves d'identité
            </p>

            <div className="identity-upload-list">
              {uploadCards.map(renderUploadCard)}
            </div>
          </section>

          <button
            type="submit"
            className="identity-submit"
            disabled={isLoading || submitMutation.isPending}
            data-testid="button-submit-identity"
          >
            {submitMutation.isPending ? <Loader2 className="animate-spin" aria-label="Envoi en cours" /> : "Envoyer"}
          </button>
        </form>
      </div>
    </main>
  );
}