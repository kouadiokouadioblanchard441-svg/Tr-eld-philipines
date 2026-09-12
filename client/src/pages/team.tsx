import { useState } from "react";
import { useAuth } from "@/lib/auth";
import { useQuery } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";
import { Check, ChevronLeft, Copy } from "lucide-react";
import invitationBackground from "@assets/IMG_20260829_070949_225_1789183699129.jpg";
import teamAIllustration from "@assets/IMG_20260829_070945_923_1789180402051.jpg";
import teamBIllustration from "@assets/IMG_20260829_070932_828_1789180402097.jpg";
import teamCIllustration from "@assets/IMG_20260829_070953_545_1789180402143.jpg";

interface TeamStats {
  level1Count: number;
  level2Count: number;
  level3Count: number;
  totalCommission: number;
  level1Commission: number;
  level2Commission: number;
  level3Commission: number;
  teamSize: number;
  teamDepositsToday: number;
  teamDepositsTotal: number;
  teamWithdrawalsToday: number;
  teamWithdrawalsTotal: number;
  teamRegistrationsToday: number;
}

type CopyTarget = "code" | "link" | null;

export default function TeamPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const [copiedTarget, setCopiedTarget] = useState<CopyTarget>(null);

  const { data: stats } = useQuery<TeamStats>({
    queryKey: ["/api/team/stats"],
  });

  const { data: settings } = useQuery<Record<string, string>>({
    queryKey: ["/api/settings"],
  });

  if (!user) return null;

  const invitationCode = user.referralCode;
  const referralLink = new URL(
    `/invitation?code=${encodeURIComponent(invitationCode)}`,
    window.location.origin,
  ).toString();

  const totalPeople = stats?.teamSize ?? (
    (stats?.level1Count || 0) + (stats?.level2Count || 0) + (stats?.level3Count || 0)
  );
  const lv1Rate = settings?.level1Commission || "—";
  const lv2Rate = settings?.level2Commission || "—";
  const lv3Rate = settings?.level3Commission || "—";

  const formatNumber = (value: number, fractionDigits = 0) =>
    Number(value || 0).toLocaleString("fr-FR", {
      minimumFractionDigits: fractionDigits,
      maximumFractionDigits: fractionDigits,
    });

  const copyValue = async (value: string, target: Exclude<CopyTarget, null>) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedTarget(target);
      toast({
        title: target === "code" ? "Code copié" : "Lien copié",
        description: target === "code"
          ? "Le code d'invitation a été copié."
          : "Le lien d'invitation a été copié.",
      });
      window.setTimeout(() => setCopiedTarget(null), 1800);
    } catch {
      toast({
        title: "Copie impossible",
        description: "Veuillez copier le contenu manuellement.",
        variant: "destructive",
      });
    }
  };

  const summary = [
    {
      value: formatNumber(totalPeople),
      label: <>Nombre total de<br />membres de l'équipe</>,
    },
    {
      value: formatNumber(stats?.teamDepositsTotal || 0),
      label: <>Montant total des<br />dépôts de l'équipe</>,
    },
    {
      value: formatNumber(stats?.teamWithdrawalsTotal || 0, 2),
      label: <>Montant total des<br />retraits de l'équipe</>,
    },
    {
      value: formatNumber(stats?.teamRegistrationsToday || 0),
      label: <>Nouvelles inscriptions<br />d'aujourd'hui</>,
    },
    {
      value: formatNumber(stats?.teamDepositsToday || 0),
      label: <>Montant des dépôts<br />de l'équipe aujourd'hui</>,
    },
    {
      value: formatNumber(stats?.teamWithdrawalsToday || 0),
      label: <>Montant des retraits<br />de l'équipe aujourd'hui</>,
    },
  ];

  const levels = [
    { label: "équipe A", levelNumber: 1, illustration: teamAIllustration, count: stats?.level1Count || 0, rate: lv1Rate },
    { label: "équipe B", levelNumber: 2, illustration: teamBIllustration, count: stats?.level2Count || 0, rate: lv2Rate },
    { label: "équipe C", levelNumber: 3, illustration: teamCIllustration, count: stats?.level3Count || 0, rate: lv3Rate },
  ];

  return (
    <main className="team-reference-page">
      <style>{`
        .team-reference-page {
          min-height: 100dvh;
          overflow-x: hidden;
          background: #f1f1f1;
          color: #111;
          font-family: Arial, Helvetica, sans-serif;
        }
        .team-reference-page *,
        .team-reference-page *::before,
        .team-reference-page *::after {
          box-sizing: border-box;
        }
        .team-reference-page .team-screen {
          width: 100%;
          max-width: 515px;
          min-height: 100dvh;
          margin: 0 auto;
          padding-bottom: 16px;
          background: #f1f1f1;
        }
        .team-reference-page .team-header {
          position: relative;
          display: flex;
          height: 68px;
          align-items: center;
          padding: 0 17px;
          background: #d9d9d9;
        }
        .team-reference-page .team-title {
          position: absolute;
          top: 50%;
          left: 50%;
          margin: 0;
          color: #161616;
          font-size: 20px;
          font-weight: 700;
          letter-spacing: .4px;
          line-height: 1;
          transform: translate(-50%, -50%);
        }
        .team-reference-page .back-button {
          display: inline-flex;
          width: 40px;
          height: 42px;
          align-items: center;
          justify-content: flex-start;
          border: 0;
          padding: 0;
          background: transparent;
          color: #252525;
          cursor: pointer;
        }
        .team-reference-page .back-button svg {
          width: 28px;
          height: 28px;
          stroke-width: 1.9;
        }
        .team-reference-page .invite-card {
          display: flex;
          min-height: 162px;
          flex-direction: column;
          justify-content: space-between;
          margin: 2px 10px 16px;
          padding: 15px 20px 14px;
          border: 2px solid #e00000;
          border-radius: 13px;
          background-image:
            linear-gradient(105deg, rgba(255,255,255,.9) 0%, rgba(255,255,255,.78) 48%, rgba(255,236,236,.76) 100%),
            url(${invitationBackground});
          background-position: center;
          background-size: cover;
          box-shadow: inset 0 0 18px rgba(224, 0, 0, .1);
        }
        .team-reference-page .invite-block {
          min-width: 0;
        }
        .team-reference-page .invite-label {
          margin: 0 0 5px;
          color: #262626;
          font-size: 16px;
          font-weight: 400;
          line-height: 1.1;
        }
        .team-reference-page .invite-value-row {
          display: flex;
          min-width: 0;
          align-items: center;
          gap: 14px;
        }
        .team-reference-page .invite-value {
          min-width: 0;
          color: #101010;
          font-size: clamp(19px, 4.6vw, 22px);
          font-weight: 700;
          line-height: 1.15;
          overflow-wrap: anywhere;
        }
        .team-reference-page .copy-icon {
          display: inline-flex;
          width: 30px;
          height: 30px;
          flex: 0 0 auto;
          align-items: center;
          justify-content: center;
          border: 0;
          padding: 0;
          background: transparent;
          color: #2e2e2e;
          cursor: pointer;
        }
        .team-reference-page .copy-icon svg {
          width: 25px;
          height: 25px;
          stroke-width: 1.5;
        }
        .team-reference-page .link-value {
          display: block;
          max-width: calc(100% - 38px);
          overflow: hidden;
          color: #101010;
          font-size: clamp(16px, 4.2vw, 20px);
          font-weight: 700;
          line-height: 1.15;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .team-reference-page .summary-card {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          margin: 0 20px 32px;
          border: 1px solid #cfcfcf;
          border-radius: 10px;
          background: #fff;
          overflow: hidden;
        }
        .team-reference-page .summary-item {
          display: flex;
          min-height: 114px;
          flex-direction: column;
          align-items: center;
          justify-content: flex-start;
          padding: 19px 5px 10px;
          text-align: center;
        }
        .team-reference-page .summary-item:nth-child(n + 4) {
          padding-top: 3px;
          padding-bottom: 15px;
        }
        .team-reference-page .summary-value {
          min-height: 25px;
          margin: 0 0 10px;
          color: #090909;
          font-size: clamp(19px, 4.4vw, 22px);
          font-weight: 700;
          line-height: 1.05;
        }
        .team-reference-page .summary-label {
          margin: 0;
          color: #4a4651;
          font-size: clamp(15px, 3.8vw, 18px);
          font-weight: 400;
          line-height: 1.08;
        }
        .team-reference-page .team-card {
          margin: 0 20px 12px;
          overflow: hidden;
          border: 1px solid #cfcfcf;
          border-radius: 6px;
          background: #fff;
        }
        .team-reference-page .team-card-header {
          display: flex;
          height: 55px;
          align-items: center;
          gap: 11px;
          padding: 0 19px;
          background: linear-gradient(90deg, #e00000 0%, #b90000 100%);
          color: #fff;
        }
        .team-reference-page .team-card-header svg {
          width: 28px;
          height: 28px;
          stroke-width: 1.7;
        }
        .team-reference-page .team-card-illustration {
          display: block;
          width: 34px;
          height: 34px;
          flex: 0 0 auto;
          object-fit: contain;
          mix-blend-mode: screen;
        }
        .team-reference-page .team-card-header h2 {
          margin: 0;
          font-size: clamp(20px, 5vw, 23px);
          font-weight: 700;
          line-height: 1;
        }
        .team-reference-page .team-card-body {
          display: grid;
          min-height: 103px;
          grid-template-columns: 1fr 1fr;
        }
        .team-reference-page .team-card-stat {
          display: flex;
          min-width: 0;
          flex-direction: column;
          align-items: center;
          justify-content: flex-start;
          padding: 12px 10px 10px;
          text-align: center;
        }
        .team-reference-page .team-card-stat + .team-card-stat {
          border-left: 1px solid #d7d8ce;
        }
        .team-reference-page .team-card-stat strong {
          color: #111;
          font-size: clamp(20px, 5vw, 23px);
          font-weight: 700;
          line-height: 1;
        }
        .team-reference-page .team-card-stat span {
          max-width: 190px;
          margin-top: 16px;
          color: #111;
          font-size: clamp(15px, 3.8vw, 18px);
          font-weight: 400;
          line-height: 1.1;
        }
        .team-reference-page .team-card:active,
        .team-reference-page .copy-icon:active,
        .team-reference-page .back-button:active {
          transform: scale(.99);
        }
        @media (max-width: 360px) {
          .team-reference-page .invite-card {
            margin-right: 10px;
            margin-left: 10px;
            padding-right: 16px;
            padding-left: 16px;
          }
          .team-reference-page .summary-card {
            margin-right: 14px;
            margin-left: 14px;
          }
          .team-reference-page .team-card {
            margin-right: 14px;
            margin-left: 14px;
          }
          .team-reference-page .summary-label,
          .team-reference-page .team-card-stat span {
            font-size: 14px;
          }
        }
      `}</style>

      <div className="team-screen">
        <header className="team-header">
          <button
            type="button"
            className="back-button"
            onClick={() => navigate("/")}
            aria-label="Retour à l'accueil"
            data-testid="button-team-back"
          >
            <ChevronLeft aria-hidden="true" />
          </button>
          <h1 className="team-title">ÉQUIPE</h1>
        </header>

        <section className="invite-card" aria-label="Invitation">
          <div className="invite-block">
            <p className="invite-label">Code d'invitation</p>
            <div className="invite-value-row">
              <strong className="invite-value">{invitationCode}</strong>
              <button
                type="button"
                className="copy-icon"
                onClick={() => copyValue(invitationCode, "code")}
                aria-label="Copier le code d'invitation"
                title="Copier le code d'invitation"
                data-testid="button-copy-team-code"
              >
                {copiedTarget === "code" ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
              </button>
            </div>
          </div>

          <div className="invite-block">
            <p className="invite-label">Copier le lien d'invitation</p>
            <div className="invite-value-row">
              <strong className="link-value" title={referralLink}>{referralLink}</strong>
              <button
                type="button"
                className="copy-icon"
                onClick={() => copyValue(referralLink, "link")}
                aria-label="Copier le lien d'invitation"
                title="Copier le lien d'invitation"
                data-testid="button-copy-team-link"
              >
                {copiedTarget === "link" ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
              </button>
            </div>
          </div>
        </section>

        <section className="summary-card" aria-label="Résumé de l'équipe">
          {summary.map((item, index) => (
            <article className="summary-item" key={index}>
              <p className="summary-value">{item.value}</p>
              <p className="summary-label">{item.label}</p>
            </article>
          ))}
        </section>

        {levels.map((level) => (
          <article
            className="team-card"
            key={level.label}
            role="button"
            tabIndex={0}
            onClick={() => navigate(`/team-details?level=${level.levelNumber}`)}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                navigate(`/team-details?level=${level.levelNumber}`);
              }
            }}
            aria-label={`Voir les membres de ${level.label}`}
          >
            <header className="team-card-header">
              <img className="team-card-illustration" src={level.illustration} alt="" aria-hidden="true" />
              <h2>{level.label}</h2>
            </header>
            <div className="team-card-body">
              <div className="team-card-stat">
                <strong>{formatNumber(level.count)}</strong>
                <span>Nombre total de membres</span>
              </div>
              <div className="team-card-stat">
                <strong>{level.rate}%</strong>
                <span>Avantages de l'équipe</span>
              </div>
            </div>
          </article>
        ))}
      </div>
    </main>
  );
}