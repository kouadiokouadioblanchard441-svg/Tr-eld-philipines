import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { ChevronLeft } from "lucide-react";
import { SiWhatsapp } from "react-icons/si";
import emptyIllustration from "@assets/illustration-8_1784762965573.png";
import { getCountryByCode } from "@/lib/countries";
import RefreshLoader from "@/components/refresh-loader";

interface TeamMember {
  id: number;
  phone: string;
  country: string;
  createdAt: string;
  totalRevenue: number;
  vipLevel: number;
}

interface TeamDetails {
  level1: TeamMember[];
  level2: TeamMember[];
  level3: TeamMember[];
}

const WHATSAPP_MESSAGE = "Bonjour, je suis votre parrain au sein de HSBC. J’ai vu que votre compte n’est pas encore actif. Puis-je savoir si vous avez une difficulté ou si vous avez besoin d’informations ?";

function getInitialLevel(): 1 | 2 | 3 {
  const level = Number(new URLSearchParams(window.location.search).get("level"));
  return level === 2 || level === 3 ? level : 1;
}

function maskPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.length <= 6) return digits;
  return `${digits.slice(0, 3)}****${digits.slice(-3)}`;
}

function formatAmount(amount: number): string {
  return `${Number(amount || 0).toLocaleString("fr-FR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })} GPB`;
}

function getWhatsAppNumber(member: TeamMember): string {
  const phone = member.phone.replace(/\D/g, "");
  const prefix = getCountryByCode(member.country)?.phonePrefix || "";

  if (prefix && phone.startsWith(prefix)) return phone;
  return `${prefix}${phone.replace(/^0+/, "")}`;
}

export default function TeamDetailsPage() {
  const [, navigate] = useLocation();
  const [activeLevel] = useState<1 | 2 | 3>(getInitialLevel);

  const { data: team, isLoading } = useQuery<TeamDetails>({
    queryKey: ["/api/team/details"],
  });

  const levelData = {
    1: { title: "équipe A", members: team?.level1 || [] },
    2: { title: "équipe B", members: team?.level2 || [] },
    3: { title: "équipe C", members: team?.level3 || [] },
  }[activeLevel];

  return (
    <main className="team-details-reference">
      <style>{`
        .team-details-reference {
          min-height: 100dvh;
          background: #f1f1f1;
          color: #161616;
          font-family: Arial, Helvetica, sans-serif;
        }
        .team-details-reference *,
        .team-details-reference *::before,
        .team-details-reference *::after {
          box-sizing: border-box;
        }
        .team-details-reference .team-details-screen {
          width: 100%;
          max-width: 515px;
          min-height: 100dvh;
          margin: 0 auto;
          background: #f1f1f1;
        }
        .team-details-reference .team-details-header {
          display: flex;
          height: 68px;
          align-items: center;
          border-bottom: 1px solid #c8c8c8;
          padding: 0 16px;
          background: #d9d9d9;
        }
        .team-details-reference .team-details-back {
          display: inline-flex;
          width: 40px;
          height: 42px;
          align-items: center;
          justify-content: flex-start;
          border: 0;
          padding: 0;
          background: transparent;
          color: #111;
          cursor: pointer;
        }
        .team-details-reference .team-details-back svg {
          width: 28px;
          height: 28px;
          stroke-width: 1.9;
        }
        .team-details-reference .team-details-title {
          flex: 1;
          margin: 0 40px 0 0;
          color: #111;
          font-size: 21px;
          font-weight: 500;
          line-height: 1;
          text-align: center;
          text-transform: lowercase;
        }
        .team-details-reference .team-details-columns,
        .team-details-reference .team-member-row {
          display: grid;
          grid-template-columns: minmax(0, 1.35fr) minmax(0, 1fr) minmax(48px, .7fr) 48px;
          align-items: center;
          column-gap: 8px;
        }
        .team-details-reference .team-details-columns {
          min-height: 62px;
          border-bottom: 1px solid #ececec;
          padding: 0 12px;
          background: #fff;
          color: #262626;
          font-size: 16px;
          font-weight: 400;
        }
        .team-details-reference .team-details-columns span:nth-child(2),
        .team-details-reference .team-details-columns span:nth-child(3) {
          text-align: center;
        }
        .team-details-reference .team-details-columns span:last-child {
          text-align: center;
        }
        .team-details-reference .team-member-row {
          min-height: 68px;
          border-bottom: 1px solid #e4e4e4;
          padding: 0 12px;
          background: #fff;
        }
        .team-details-reference .team-member-username {
          min-width: 0;
          overflow: hidden;
          color: #202020;
          font-size: 14px;
          font-weight: 400;
          line-height: 1.15;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .team-details-reference .team-member-revenue,
        .team-details-reference .team-member-vip {
          color: #202020;
          font-size: 14px;
          line-height: 1.15;
          text-align: center;
          white-space: nowrap;
        }
        .team-details-reference .team-member-vip {
          font-weight: 600;
        }
        .team-details-reference .team-whatsapp {
          display: inline-flex;
          width: 40px;
          height: 40px;
          align-items: center;
          justify-content: center;
          border: 0;
          border-radius: 10px;
          background: #25d366;
          color: #fff;
          cursor: pointer;
          text-decoration: none;
          transition: transform .12s ease, filter .12s ease;
        }
        .team-details-reference .team-whatsapp svg {
          width: 23px;
          height: 23px;
        }
        .team-details-reference .team-whatsapp:hover {
          filter: brightness(.96);
        }
        .team-details-reference .team-whatsapp:active {
          transform: scale(.94);
        }
        .team-details-reference .team-whatsapp:focus-visible,
        .team-details-reference .team-details-back:focus-visible {
          outline: 3px solid #111;
          outline-offset: 2px;
        }
        .team-details-reference .team-details-empty {
          display: flex;
          min-height: calc(100dvh - 130px);
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 8px;
          padding: 28px 20px 80px;
          text-align: center;
        }
        .team-details-reference .team-details-empty img {
          width: 170px;
          height: 170px;
          object-fit: contain;
          opacity: .88;
        }
        .team-details-reference .team-details-empty p {
          margin: 0;
          color: #4b4b4b;
          font-size: 15px;
        }
        .team-details-reference .team-details-empty small {
          color: #777;
          font-size: 13px;
        }
        @media (max-width: 380px) {
          .team-details-reference .team-details-columns,
          .team-details-reference .team-member-row {
            grid-template-columns: minmax(0, 1.25fr) minmax(0, 1fr) minmax(44px, .65fr) 44px;
            column-gap: 5px;
            padding-right: 8px;
            padding-left: 8px;
          }
          .team-details-reference .team-details-columns {
            font-size: 14px;
          }
          .team-details-reference .team-member-username,
          .team-details-reference .team-member-revenue,
          .team-details-reference .team-member-vip {
            font-size: 12px;
          }
          .team-details-reference .team-whatsapp {
            width: 36px;
            height: 36px;
          }
        }
      `}</style>

      <div className="team-details-screen">
        <header className="team-details-header">
          <button
            type="button"
            className="team-details-back"
            onClick={() => navigate("/team")}
            aria-label="Retour à l'équipe"
            data-testid="button-back-team"
          >
            <ChevronLeft aria-hidden="true" />
          </button>
          <h1 className="team-details-title" data-testid="text-page-title">
            {levelData.title}
          </h1>
        </header>

        <div className="team-details-columns" aria-label="Colonnes des membres">
          <span>username</span>
          <span>Revenu total</span>
          <span>VIP</span>
          <span>Contact</span>
        </div>

        {isLoading ? (
          <div className="team-details-empty">
            <RefreshLoader />
          </div>
        ) : levelData.members.length === 0 ? (
          <div className="team-details-empty">
            <img src={emptyIllustration} alt="Aucun membre" />
            <p>Aucun membre dans {levelData.title}</p>
            <small>Invitez de nouveaux membres pour développer votre équipe.</small>
          </div>
        ) : (
          levelData.members.map((member) => {
            const whatsappNumber = getWhatsAppNumber(member);
            const whatsappUrl = `https://wa.me/${whatsappNumber}?text=${encodeURIComponent(WHATSAPP_MESSAGE)}`;

            return (
              <div className="team-member-row" key={member.id} data-testid={`team-member-${member.id}`}>
                <span className="team-member-username" data-testid={`text-member-phone-${member.id}`}>
                  {maskPhone(member.phone)}
                </span>
                <span className="team-member-revenue" data-testid={`text-member-revenue-${member.id}`}>
                  {formatAmount(member.totalRevenue)}
                </span>
                <span className="team-member-vip" data-testid={`text-member-vip-${member.id}`}>
                  {member.vipLevel > 0 ? `VIP ${member.vipLevel}` : "—"}
                </span>
                <a
                  className="team-whatsapp"
                  href={whatsappUrl}
                  target="_blank"
                  rel="noreferrer"
                  aria-label={`Contacter ${maskPhone(member.phone)} sur WhatsApp`}
                  title="Contacter sur WhatsApp"
                  data-testid={`button-whatsapp-${member.id}`}
                >
                  <SiWhatsapp aria-hidden="true" />
                </a>
              </div>
            );
          })
        )}
      </div>
    </main>
  );
}