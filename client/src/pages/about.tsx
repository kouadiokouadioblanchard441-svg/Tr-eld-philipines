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
      <div
        className="flex-1 overflow-y-auto px-5 py-6"
        style={{ color: "#fff", fontSize: 14, lineHeight: "1.75" }}
      >
        <div className="space-y-6">
          <section>
            <h2 className="mb-2 text-lg font-bold text-white">Qui sommes-nous ?</h2>
            <p>
              HSBC est une entreprise qui développe des services numériques simples, accessibles et
              orientés vers les besoins quotidiens de ses utilisateurs. Notre plateforme rassemble les
              services financiers, l&apos;investissement et les solutions de mobilité connectée dans un
              même espace.
            </p>
          </section>

          <section>
            <h2 className="mb-2 text-lg font-bold text-white">Notre mission</h2>
            <p>
              Notre mission est de rendre les opérations plus claires et plus faciles à utiliser,
              tout en proposant une expérience fiable sur mobile. Nous travaillons à créer une relation
              durable avec chaque utilisateur grâce à des services transparents et à une assistance
              accessible.
            </p>
          </section>

          <section>
            <h2 className="mb-2 text-lg font-bold text-white">Nos services</h2>
            <ul className="list-disc space-y-2 pl-5 marker:text-white">
              <li>Dépôts et retraits avec un suivi clair des opérations.</li>
              <li>Solutions d&apos;investissement et suivi des gains depuis le compte utilisateur.</li>
              <li>Programme de parrainage et gestion des récompenses disponibles sur la plateforme.</li>
              <li>Historique des transactions, commandes et activités du compte.</li>
              <li>Assistance client accessible depuis l&apos;application.</li>
            </ul>
          </section>

          <section>
            <h2 className="mb-2 text-lg font-bold text-white">Mobilité connectée</h2>
            <p>
              HSBC développe également des solutions liées à la recharge et à la mobilité connectée.
              Nous cherchons à faciliter l&apos;accès à des services modernes, pratiques et adaptés aux
              particuliers comme aux entreprises, dans les espaces intérieurs et extérieurs.
            </p>
          </section>

          <section>
            <h2 className="mb-2 text-lg font-bold text-white">Sécurité et accompagnement</h2>
            <p>
              La protection des comptes, la clarté des informations et la vérification des opérations
              font partie de nos priorités. Notre équipe reste disponible pour accompagner les
              utilisateurs et répondre à leurs questions via le canal de service client configuré dans
              l&apos;application.
            </p>
          </section>

          <section>
            <h2 className="mb-2 text-lg font-bold text-white">Notre engagement</h2>
            <p>
              Nous améliorons continuellement la plateforme afin de proposer une navigation plus
              fluide, des informations utiles et des services adaptés à l&apos;évolution des usages.
              La confiance et la satisfaction de nos utilisateurs sont au centre de chaque amélioration.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
