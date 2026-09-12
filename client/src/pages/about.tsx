import { ChevronLeft } from "lucide-react";
import { Link } from "wouter";

export default function AboutPage() {
  return (
    <div className="flex flex-col min-h-full" style={{ background: "#111" }}>

      {/* Header */}
      <header className="flex items-center px-4 py-3" style={{ background: "#111", borderBottom: "1px solid #222" }}>
        <Link href="/account">
          <button className="p-1" data-testid="button-back">
            <ChevronLeft className="w-6 h-6 text-white" />
          </button>
        </Link>
        <h1 className="flex-1 text-center text-base font-semibold text-white pr-6">À propos de nous</h1>
      </header>

      {/* Body */}
      <div className="flex-1 overflow-y-auto px-5 py-5 space-y-5" style={{ color: "#d4d4d4", fontSize: 13.5, lineHeight: "1.75" }}>

        <p>
          HSBC est une entreprise de premier plan, avec l'un des plus grands réseaux de stations de recharge connectées du pays.
        </p>

        <p>
          HSBC développe des solutions de recharge connectées pour les particuliers et les entreprises.
        </p>

        <p>
          Nos solutions s'adaptent aux espaces intérieurs et extérieurs, notamment aux sols, murs, terrasses, salles de bains et espaces de vie.
        </p>

        <p>
          La disponibilité du réseau, la facilité d'utilisation et la satisfaction des utilisateurs sont au cœur de l'engagement de HSBC.
        </p>

      </div>
    </div>
  );
}
