import { useAuth } from "@/lib/auth";
import { useLocation } from "wouter";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  ChevronRight,
  CreditCard,
  BadgeCheck,
  Check,
  Copy,
  Download,
  Gift,
  Headset,
  Info,
  Loader2,
  LockKeyhole,
  Newspaper,
  ShoppingBag,
  Shield,
  Target,
  UserRoundPlus,
  type LucideIcon,
} from "lucide-react";
import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { ADMIN_PATH } from "@/lib/admin-path";
import rechargeButtonImage from "@assets/20260124_173540_1787507650481.png";
import exchangeButtonImage from "@assets/20260124_173432_1787507650509_echanger.png";
import hsbcLogo from "@assets/IMG_20260911_192520_526_1789155009576.jpg";

const accent = "#FF0000";
const accentDark = "#C00000";
const PUBLIC_ID_MIN = 10000;
const PUBLIC_ID_RANGE = 90000;
const PUBLIC_ID_MULTIPLIER = 7919;
const PUBLIC_ID_OFFSET = 66644;

function getPublicUserId(internalId: number): string {
  return String(
    ((internalId * PUBLIC_ID_MULTIPLIER + PUBLIC_ID_OFFSET) % PUBLIC_ID_RANGE) + PUBLIC_ID_MIN,
  );
}

type AccountMenuItem = {
  label: string;
  icon: LucideIcon;
  href?: string;
  value?: string;
  testId: string;
};

export default function AccountPage() {
  const { user, logout } = useAuth();
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const [showPinModal, setShowPinModal] = useState(false);
  const [adminPin, setAdminPin] = useState("");
  const [showWithdrawalVerification, setShowWithdrawalVerification] = useState(false);
  const [invitationCodeCopied, setInvitationCodeCopied] = useState(false);

  const { data: identityVerificationData } = useQuery<{
    verification: { status: string } | null;
  }>({
    queryKey: ["/api/identity-verification"],
    enabled: Boolean(user),
  });
  const { data: teamStats } = useQuery<{
    teamSize: number;
    teamDepositsYesterday: number;
    teamDepositsToday: number;
    teamDepositsTotal: number;
  }>({
    queryKey: ["/api/team/stats"],
    enabled: Boolean(user),
  });

  const verifyPinMutation = useMutation({
    mutationFn: async (pin: string) => {
      const res = await apiRequest("POST", "/api/admin/verify-pin", { pin });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message || "Code PIN incorrect");
      }
      return res.json();
    },
    onSuccess: () => {
      setShowPinModal(false);
      setAdminPin("");
      navigate(ADMIN_PATH);
    },
    onError: (error: Error) => toast({ title: error.message, variant: "destructive" }),
  });

  if (!user) return null;

  const balance = Number.parseFloat(user.balance || "0");
  const earnings = Number.parseFloat(user.totalEarnings || "0");
  const phoneDigits = user.phone.replace(/\D/g, "");
  const displayName = phoneDigits || String(user.id);
  const displayId = getPublicUserId(user.id);
  const profileAvatar = user.avatarUrl || "/avatar-fallback.svg";
  const formatAmount = (amount: number) => amount.toLocaleString("fr-FR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  const invitationCode = user.referralCode || String(displayId);

  const menuItems: AccountMenuItem[] = [
    { label: "Paramètres du mot de passe", icon: LockKeyhole, href: "/change-password", testId: "button-change-password" },
    { label: "Inviter d'autres", icon: UserRoundPlus, href: "/team", testId: "button-invite-team" },
    { label: "Informations de carte bancaire", icon: CreditCard, href: "/wallet", testId: "button-wallet" },
    { label: "Vérification d'identité", icon: BadgeCheck, href: "/identity-verification", testId: "button-identity-verification" },
    { label: "Commandes", icon: ShoppingBag, href: "/orders", testId: "button-orders" },
    { label: "Mission", icon: Target, href: "/mission", testId: "button-mission" },
    { label: "Actualités", icon: Newspaper, href: "/news", testId: "button-news" },
    { label: "Mon gestionnaire", icon: Headset, href: "/manager", testId: "button-manager" },
    { label: "Code cadeau", icon: Gift, href: "/gift-code", testId: "button-gift-code" },
    { label: "À propos de nous", icon: Info, href: "/about", testId: "button-about" },
  ];

  const handleLogout = async () => {
    await logout();
    navigate("/login");
  };

  const handleCopyInvitationCode = async () => {
    try {
      await navigator.clipboard.writeText(invitationCode);
      setInvitationCodeCopied(true);
      toast({ title: "Code copié", description: "Le code d'invitation a été copié." });
      window.setTimeout(() => setInvitationCodeCopied(false), 1800);
    } catch {
      toast({
        title: "Copie impossible",
        description: "Copiez le code d'invitation manuellement.",
        variant: "destructive",
      });
    }
  };

  const handleAdminClick = () => {
    if (user.isAdminPasswordRequired === false) {
      navigate(ADMIN_PATH);
      return;
    }
    setShowPinModal(true);
  };

  const handleWithdrawalClick = () => {
    if (identityVerificationData?.verification?.status === "approved") {
      navigate("/withdrawal");
      return;
    }
    setShowWithdrawalVerification(true);
  };

  return (
    <main className="account-reference">
      <style>{`
        .account-reference {
          min-height: calc(100dvh - 59px);
          padding-bottom: calc(59px + env(safe-area-inset-bottom));
          background: #EAEAEA;
          color: #202020;
          font-family: Arial, Helvetica, sans-serif;
        }
        .account-reference *,
        .account-reference *::before,
        .account-reference *::after {
          box-sizing: border-box;
        }
        .account-reference .account-screen {
          position: relative;
          width: 100%;
          max-width: 500px;
          min-height: calc(100dvh - 59px);
          margin: 0 auto;
          overflow: hidden;
          background: #EAEAEA;
        }
        .account-reference .account-top {
           padding: 0 19px 0;
         }
         .account-reference .account-header-bar {
           display: flex;
           height: 74px;
           align-items: center;
            justify-content: space-between;
           margin: 0 -19px;
           padding: 0 18px;
           background: #D9D9D9;
         }
          .account-reference .site-logo-circle {
            display: grid;
            width: 46px;
            height: 46px;
            place-items: center;
            overflow: hidden;
            border: 2px solid ${accent};
            border-radius: 50%;
            background: #fff;
            box-shadow: 0 2px 6px rgba(91, 0, 0, .2);
          }
          .account-reference .site-logo-circle img {
            width: 100%;
            height: 100%;
            object-fit: contain;
          }
         .account-reference .profile-download {
           display: grid;
           width: 46px;
           height: 46px;
           place-items: center;
           border: 0;
           padding: 0;
           background: transparent;
           color: ${accent};
           transition: transform .12s ease;
         }
         .account-reference .profile-download svg {
           width: 33px;
           height: 33px;
           stroke-width: 2.8;
         }
         .account-reference .profile-download:active {
           transform: scale(.9);
        }
        .account-reference .profile-header {
          display: flex;
           position: relative;
           isolation: isolate;
           min-height: 242px;
          align-items: center;
           margin-top: 18px;
           overflow: hidden;
           border: 2px solid ${accentDark};
           border-radius: 18px;
           padding: 19px;
            background:
              radial-gradient(circle at 83% 22%, rgba(255, 0, 0, .08), transparent 38%),
              linear-gradient(135deg, #F8F8F8 0%, #EAEAEA 54%, #D9D9D9 100%);
         }
         .account-reference .profile-header::before {
           position: absolute;
           z-index: 0;
           inset: 0;
           content: "";
           background-image:
             url("/burkina-coat-of-arms.png"),
             url("/burkina-faso-flag.jpg"),
             url("/burkina-crossed-flags.png"),
             url("/burkina-flag-elements.jpg");
           background-position:
             center center,
             left -52px center,
             right -50px -64px,
             right -76px bottom -90px;
           background-repeat: no-repeat;
           background-size:
             215px auto,
             145px auto,
             150px auto,
             205px auto;
           opacity: .15;
           mix-blend-mode: multiply;
           pointer-events: none;
        }
        .account-reference .profile-logo {
           position: relative;
           z-index: 1;
           width: min(42%, 210px);
           height: auto;
           aspect-ratio: 1;
          flex: 0 0 auto;
            border: 4px solid rgba(255, 255, 255, .9);
           border-radius: 50%;
          object-fit: cover;
           object-position: center;
           background: #fff;
            box-shadow: 0 3px 9px rgba(91, 0, 0, .28);
        }
        .account-reference .profile-details {
           position: relative;
           z-index: 1;
          min-width: 0;
           margin-left: 17px;
        }
        .account-reference .profile-name {
          overflow: hidden;
          margin: 0;
           color: #171717;
           font-size: clamp(22px, 5vw, 28px);
          font-weight: 700;
          letter-spacing: -.5px;
          line-height: 1.05;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .account-reference .profile-id {
          display: inline-flex;
           min-height: 24px;
          align-items: center;
           gap: 6px;
           margin-top: 8px;
           border: 0;
           padding: 0;
           background: transparent;
           color: #777;
           cursor: pointer;
           font-size: clamp(16px, 3.8vw, 21px);
           font-weight: 400;
           line-height: 1.15;
           text-align: left;
           font-family: inherit;
         }
         .account-reference .profile-id svg {
           width: 16px;
           height: 16px;
           flex: 0 0 auto;
        }
         .account-reference .profile-brand {
           margin: 14px 0 0;
            color: ${accent};
           font-size: clamp(19px, 4.5vw, 27px);
           font-weight: 700;
           line-height: 1;
         }
        .account-reference .profile-settings {
          display: grid;
           width: 0;
           height: 0;
          flex: 0 0 auto;
          place-items: center;
           margin-left: 0;
           border: 0;
           padding: 0;
           background: transparent;
           color: transparent;
           pointer-events: none;
        }
         .account-reference .profile-settings svg { display: none; }
         .account-reference .balance-overview {
          display: flex;
           min-height: 198px;
          align-items: center;
          justify-content: space-between;
           gap: 12px;
           margin-top: 27px;
          overflow: hidden;
           border-radius: 9px;
           padding: 22px 20px;
           background: linear-gradient(135deg, #EAEAEA 0%, #D9D9D9 100%);
           box-shadow: 0 2px 7px rgba(139, 0, 0, .12);
         }
         .account-reference .summary-metrics {
           display: grid;
           min-width: 0;
           flex: 1;
           grid-template-columns: repeat(2, minmax(0, 1fr));
           gap: 10px;
           text-align: center;
         }
         .account-reference .summary-metric {
           min-width: 0;
         }
         .account-reference .summary-metric-value {
           margin: 0 0 14px;
           color: #111;
           font-size: clamp(20px, 5vw, 26px);
           font-weight: 700;
           line-height: 1;
         }
         .account-reference .summary-metric-label {
           margin: 0;
           color: #252525;
           font-size: clamp(13px, 3.3vw, 17px);
           font-weight: 400;
           line-height: 1.18;
        }
         .account-reference .balance-quick-actions {
           display: flex;
           width: min(46%, 225px);
           flex: 0 0 min(46%, 225px);
           flex-direction: column;
           gap: 10px;
           margin: 0;
         }
         .account-reference .balance-quick-action {
           display: block;
           min-width: 0;
           overflow: hidden;
           border: 0;
           border-radius: 24px;
           padding: 0;
           background: transparent;
           line-height: 0;
           transition: transform .12s ease, filter .12s ease;
         }
         .account-reference .balance-quick-action img {
           display: block;
           width: 100%;
           height: auto;
           aspect-ratio: 3.63;
           object-fit: fill;
         }
         .account-reference .team-stats {
           display: grid;
           grid-template-columns: repeat(2, minmax(0, 1fr));
           gap: 16px;
           margin-top: 27px;
         }
         .account-reference .team-stat {
           display: flex;
           min-height: 116px;
           align-items: center;
           justify-content: center;
           flex-direction: column;
           border-radius: 9px;
           padding: 14px 10px;
           background: #F7F7F7;
           text-align: center;
           box-shadow: 0 1px 3px rgba(0, 0, 0, .04);
         }
         .account-reference .team-stat-value {
          margin: 0 0 12px;
           color: #111;
           font-size: clamp(24px, 6vw, 31px);
           font-weight: 700;
          line-height: 1;
        }
         .account-reference .team-stat-label {
           max-width: 100%;
           margin: 0;
           color: #181818;
           font-size: clamp(14px, 3.7vw, 18px);
           font-weight: 400;
           line-height: 1.18;
         }
         .account-reference .balance-quick-action:hover { filter: brightness(1.03); }
         .account-reference .balance-quick-action:active { transform: scale(.98); }
        .account-reference .balance-quick-action:focus-visible,
         .account-reference .profile-download:focus-visible,
        .account-reference .account-row:focus-visible,
        .account-reference .contact-float:focus-visible {
           outline: 3px solid ${accentDark};
          outline-offset: 2px;
        }
        .account-reference .account-menu {
           margin-top: 30px;
          border-top: 1px solid #ebe7e0;
          background: #EAEAEA;
        }
        .account-reference .account-row {
          display: flex;
          width: 100%;
          height: 64px;
          align-items: center;
          border: 0;
          border-bottom: 1px solid #ebe7e0;
          padding: 0 20px;
          background: transparent;
          color: #292929;
          text-align: left;
          transition: background-color .12s ease;
        }
        .account-reference .account-row:hover {
           background: #effcfd;
        }
        .account-reference .account-row:active {
           background: #dff6f8;
        }
        .account-reference .account-row-icon {
          width: 22px;
          height: 22px;
          flex: 0 0 auto;
          color: #000;
          stroke-width: 2.35;
        }
        .account-reference .account-row-label {
          min-width: 0;
          flex: 1;
          margin-left: 16px;
          overflow: hidden;
          color: #282828;
          font-size: 16px;
          font-weight: 400;
          line-height: 1;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .account-reference .account-row-value {
          margin-right: 7px;
          color: #414141;
          font-size: 14px;
          font-weight: 400;
          line-height: 1;
        }
        .account-reference .account-row-chevron {
          width: 21px;
          height: 21px;
          flex: 0 0 auto;
          color: #8f8f8f;
          stroke-width: 2.1;
        }
        .account-reference .account-maintenance {
           padding: 16px 20px 24px;
        }
        .account-reference .account-admin {
          width: 100%;
          min-height: 48px;
          border-radius: 8px;
          font-size: 15px;
          font-weight: 700;
        }
        .account-reference .account-admin {
          border: 0;
           background: ${accent};
          color: #fff;
        }
        .account-reference .contact-float {
          position: fixed;
          right: max(-14px, calc((100vw - 500px) / 2 - 14px));
          bottom: 86px;
          z-index: 40;
          display: flex;
          width: 146px;
          height: 56px;
          align-items: center;
          border: 0;
          border-radius: 28px 0 0 28px;
          padding: 0 12px 0 4px;
           background: linear-gradient(105deg, ${accent} 0%, #ff4d4d 49%, ${accentDark} 100%);
          color: #fff;
           box-shadow: 0 3px 10px rgba(0, 126, 149, .28);
          transition: transform .12s ease, filter .12s ease;
        }
        .account-reference .contact-float:hover {
          filter: brightness(1.04);
        }
        .account-reference .contact-float:active {
          transform: translateX(-3px) scale(.98);
        }
        .account-reference .contact-float img {
          width: 48px;
          height: 48px;
          flex: 0 0 auto;
          object-fit: contain;
          object-position: center;
        }
        .account-reference .contact-float span {
          flex: 1;
          margin-left: 3px;
          color: #fff;
          font-size: 15px;
          font-weight: 700;
          line-height: 17px;
          text-align: center;
        }
        @media (max-width: 380px) {
           .account-reference .account-top { padding-right: 14px; padding-left: 14px; }
           .account-reference .account-header-bar { margin-right: -14px; margin-left: -14px; }
           .account-reference .profile-header { min-height: 190px; padding: 12px; }
           .account-reference .profile-details { margin-left: 12px; }
           .account-reference .profile-name { font-size: 21px; }
           .account-reference .profile-id { font-size: 14px; }
           .account-reference .balance-overview { min-height: 174px; padding-right: 12px; padding-left: 12px; }
           .account-reference .balance-quick-actions { width: 44%; flex-basis: 44%; }
           .account-reference .team-stats { gap: 10px; }
           .account-reference .team-stat { min-height: 104px; padding-right: 6px; padding-left: 6px; }
          .account-reference .account-row { padding-right: 16px; padding-left: 16px; }
        }
      `}</style>

      <div className="account-screen">
        <section className="account-top" aria-label="Informations du compte">
          <div className="account-header-bar">
            <div className="site-logo-circle" aria-label="Logo HSBC">
              <img src={hsbcLogo} alt="HSBC" />
            </div>
            <button type="button" className="profile-download" onClick={handleLogout} aria-label="Se déconnecter" data-testid="button-account-logout">
              <Download aria-hidden="true" />
            </button>
          </div>
          <header className="profile-header">
            <img className="profile-logo" src={profileAvatar} alt="Avatar du profil HSBC" />
            <div className="profile-details">
              <p className="profile-name">{displayName}</p>
               <button
                 type="button"
                 className="profile-id"
                 onClick={handleCopyInvitationCode}
                 aria-label="Copier le code d'invitation"
                 title="Copier le code d'invitation"
                 data-testid="button-copy-invitation-code"
               >
                 {invitationCodeCopied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
                 <span>Code d'invitation : {invitationCode}</span>
               </button>
              <p className="profile-brand">HSBC</p>
            </div>
          </header>

          <section className="balance-overview" aria-label="Solde et actions rapides">
            <div className="summary-metrics">
              <div className="summary-metric">
                <p className="summary-metric-value">{formatAmount(earnings)}</p>
                <p className="summary-metric-label">Revenus (GPB)</p>
              </div>
              <div className="summary-metric">
                <p className="summary-metric-value">{formatAmount(balance)}</p>
                <p className="summary-metric-label">Solde (GPB)</p>
              </div>
            </div>
            <section className="balance-quick-actions" aria-label="Actions rapides">
              <button type="button" className="balance-quick-action" onClick={() => navigate("/deposit")} aria-label="Recharger" data-testid="button-quick-recharge">
                <img src={rechargeButtonImage} alt="Recharger" />
              </button>
              <button type="button" className="balance-quick-action" onClick={handleWithdrawalClick} aria-label="Échanger" data-testid="button-quick-withdraw">
                <img src={exchangeButtonImage} alt="Échanger" />
              </button>
            </section>
          </section>

          <section className="team-stats" aria-label="Statistiques de l'équipe">
            <article className="team-stat">
              <p className="team-stat-value">{formatAmount(teamStats?.teamDepositsYesterday || 0)}</p>
              <p className="team-stat-label">Dépôt de l'équipe (hier)</p>
            </article>
            <article className="team-stat">
              <p className="team-stat-value">{formatAmount(teamStats?.teamDepositsToday || 0)}</p>
              <p className="team-stat-label">Dépôt de l'équipe (aujourd'hui)</p>
            </article>
            <article className="team-stat">
              <p className="team-stat-value">{teamStats?.teamSize || 0}</p>
              <p className="team-stat-label">Taille de l'équipe</p>
            </article>
            <article className="team-stat">
              <p className="team-stat-value">{formatAmount(teamStats?.teamDepositsTotal || 0)}</p>
              <p className="team-stat-label">Dépôt de l'équipe (total)</p>
            </article>
          </section>
        </section>

        <nav className="account-menu" aria-label="Options du compte">
          {menuItems.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.testId}
                type="button"
                className="account-row"
               onClick={() => item.href && navigate(item.href)}
                data-testid={item.testId}
              >
                <Icon className="account-row-icon" aria-hidden="true" />
                <span className="account-row-label">{item.label}</span>
                {item.value && <span className="account-row-value">{item.value}</span>}
                <ChevronRight className="account-row-chevron" aria-hidden="true" />
              </button>
            );
          })}
        </nav>

        {user.isAdmin && (
          <div className="account-maintenance">
            <button type="button" className="account-admin" onClick={handleAdminClick} data-testid="button-admin">
              <Shield className="mr-2 inline h-4 w-4" />
              Panel Admin
            </button>
          </div>
        )}
      </div>

      <Dialog open={showPinModal} onOpenChange={setShowPinModal}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-center">Code d'accès administrateur</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-center text-sm text-muted-foreground">Entrez votre code PIN pour accéder au panneau d'administration</p>
            <Input
              type="password"
              value={adminPin}
              onChange={(event) => setAdminPin(event.target.value)}
              placeholder="Code PIN"
              className="text-center text-2xl tracking-widest"
              maxLength={8}
              data-testid="input-admin-pin"
            />
            <Button
              onClick={() => {
                if (adminPin.length < 4) {
                  toast({ title: "Le code PIN doit contenir au moins 4 caractères", variant: "destructive" });
                  return;
                }
                verifyPinMutation.mutate(adminPin);
              }}
              disabled={verifyPinMutation.isPending || adminPin.length < 4}
               className="w-full bg-[#FF0000] hover:bg-[#C00000]"
              data-testid="button-verify-pin"
            >
              {verifyPinMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Confirmer
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={showWithdrawalVerification} onOpenChange={setShowWithdrawalVerification}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-center">Vérification d'identité requise</DialogTitle>
            <DialogDescription className="text-center">
              Pour effectuer un retrait, vous devez d'abord vérifier votre identité en envoyant vos documents officiels.
            </DialogDescription>
          </DialogHeader>
          <div className="flex gap-3 pt-2">
            <Button
              type="button"
              variant="outline"
              className="flex-1"
              onClick={() => setShowWithdrawalVerification(false)}
              data-testid="button-cancel-withdrawal-verification"
            >
              Annuler
            </Button>
            <Button
              type="button"
              className="flex-1 bg-[#FF0000] hover:bg-[#C00000]"
              onClick={() => {
                setShowWithdrawalVerification(false);
                navigate("/identity-verification");
              }}
              data-testid="button-start-withdrawal-verification"
            >
              Vérifier
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </main>
  );
}