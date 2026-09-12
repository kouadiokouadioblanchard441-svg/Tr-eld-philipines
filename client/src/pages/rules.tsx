import { ChevronLeft } from "lucide-react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";

export default function RulesPage() {
  const { data: settings } = useQuery<Record<string, string>>({
    queryKey: ["/api/settings"],
  });

  const signupBonus = settings?.signupBonus || "2040";
  const minDeposit = settings?.minDeposit || "12240";
  const minWithdrawal = settings?.minWithdrawal || "6120";
  const withdrawalFees = settings?.withdrawalFees || "18";
  const withdrawalStartHour = settings?.withdrawalStartHour || "9";
  const withdrawalEndHour = settings?.withdrawalEndHour || "17";
  const maxWithdrawalsPerDay = settings?.maxWithdrawalsPerDay || "1";
  const lv1 = settings?.level1Commission || "15";
  const lv2 = settings?.level2Commission || "2";
  const lv3 = settings?.level3Commission || "1";

  return (
    <div className="flex flex-col min-h-full" style={{ background: "#111" }}>
      <header className="flex items-center px-4 py-3" style={{ background: "#111", borderBottom: "1px solid #222" }}>
        <Link href="/account">
          <button className="p-1" data-testid="button-back">
            <ChevronLeft className="w-6 h-6 text-white" />
          </button>
        </Link>
        <h1 className="flex-1 text-center text-base font-semibold text-white pr-6">Règles de la plateforme</h1>
      </header>

      <div className="flex-1 overflow-y-auto px-5 py-5 space-y-5" style={{ color: "#d4d4d4", fontSize: 13.5, lineHeight: "1.75" }}>
        <section className="space-y-2">
          <h2 className="text-[15px] font-bold text-[#FF0000] border-l-2 border-[#FF0000] pl-2">1. Investissement</h2>
          <ul className="list-disc pl-5 space-y-1">
            <li>Chaque utilisateur peut posséder plusieurs produits d'investissement en même temps.</li>
            <li>Les gains sont générés quotidiennement et crédités sur votre solde toutes les 24 heures.</li>
            <li>Le cycle d'investissement standard est de 80 jours, sauf indication contraire pour les produits spéciaux.</li>
          </ul>
        </section>

        <section className="space-y-2">
          <h2 className="text-[15px] font-bold text-[#FF0000] border-l-2 border-[#FF0000] pl-2">2. Dépôts et retraits</h2>
          <ul className="list-disc pl-5 space-y-1">
            <li>Le montant minimum du dépôt est de {parseInt(minDeposit).toLocaleString()} GPB.</li>
            <li>Le montant minimum du retrait est de {parseInt(minWithdrawal).toLocaleString()} GPB.</li>
            <li>Les frais de retrait sont fixés à {withdrawalFees}% pour couvrir les coûts de transaction et de maintenance.</li>
            <li>Les retraits sont traités entre {withdrawalStartHour}:00 et {withdrawalEndHour}:00 les jours ouvrables.</li>
            <li>Limite de {maxWithdrawalsPerDay} retrait(s) par utilisateur et par jour.</li>
          </ul>
        </section>

        <section className="space-y-2">
          <h2 className="text-[15px] font-bold text-[#FF0000] border-l-2 border-[#FF0000] pl-2">3. Système de parrainage</h2>
          <ul className="list-disc pl-5 space-y-1">
            <li>Commission de niveau 1 : {lv1}% sur le PREMIER investissement du filleul.</li>
            <li>Commission de niveau 2 : {lv2}% sur le PREMIER investissement du filleul.</li>
            <li>Commission de niveau 3 : {lv3}% sur le PREMIER investissement du filleul.</li>
            <li>Toute activité frauduleuse ou création de plusieurs comptes pour manipuler le système entraînera la suspension du compte.</li>
          </ul>
        </section>

        <section className="space-y-2">
          <h2 className="text-[15px] font-bold text-[#FF0000] border-l-2 border-[#FF0000] pl-2">4. Bonus d'inscription</h2>
          <ul className="list-disc pl-5 space-y-1">
            <li>Chaque nouveau membre reçoit un bonus d'inscription de {parseInt(signupBonus).toLocaleString()} GPB.</li>
          </ul>
        </section>

        <section className="space-y-2">
          <h2 className="text-[15px] font-bold text-[#FF0000] border-l-2 border-[#FF0000] pl-2">5. Security</h2>
          <ul className="list-disc pl-5 space-y-1">
            <li>Vous êtes responsable de la sécurité de votre mot de passe.</li>
            <li>Ne partagez jamais vos identifiants de connexion avec des tiers.</li>
            <li>Le service client officiel ne vous demandera jamais votre mot de passe.</li>
          </ul>
        </section>
      </div>
    </div>
  );
}
