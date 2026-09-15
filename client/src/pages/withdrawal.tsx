import { useState } from "react";
import { useAuth } from "@/lib/auth";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Loader2, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLocation } from "wouter";
import RefreshLoader from "@/components/refresh-loader";

import withdrawalReference from "@assets/IMG_20260823_162842_425_1787503826320.jpg";
import hsbcLogo from "@assets/IMG_20260911_192520_526_1789155009576.jpg";

export default function WithdrawalPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [, navigate] = useLocation();
  const [amount, setAmount] = useState<number | "">("");
  const [withdrawalPhone, setWithdrawalPhone] = useState("");

  const { data: identityVerificationData, isLoading: identityVerificationLoading } = useQuery<{
    verification: { status: string } | null;
  }>({
    queryKey: ["/api/identity-verification"],
    enabled: Boolean(user),
  });
  const { data: platformSettings, isLoading: platformSettingsLoading } = useQuery<Record<string, string>>({
    queryKey: ["/api/settings"],
  });

  const configuredConversionRate = Number(platformSettings?.withdrawalConversionRate);
  const conversionRate = Number.isFinite(configuredConversionRate) ? configuredConversionRate : 0;
  const configuredMinWithdrawal = Number(platformSettings?.minWithdrawal);
  const minWithdrawal = Number.isFinite(configuredMinWithdrawal) ? configuredMinWithdrawal : Number.POSITIVE_INFINITY;
  const configuredWithdrawalFee = Number(platformSettings?.withdrawalFees);
  const withdrawalFee = Number.isFinite(configuredWithdrawalFee) ? configuredWithdrawalFee : 0;
  const convertedAmount = amount ? Math.round(Number(amount) * conversionRate) : 0;
  const feeAmount = Math.round(convertedAmount * withdrawalFee / 100);
  const netAmount = convertedAmount - feeAmount;
  const earningsBalance = Number.parseFloat(user?.earningsBalance || "0");

  const withdrawMutation = useMutation({
    mutationFn: async (data: { amount: number; phone: string }) => {
      const response = await apiRequest("POST", "/api/support/withdrawal-request", data);
      const result = await response.json();
      if (!response.ok) throw new Error(result.message || "Impossible d'envoyer la demande de retrait");
      return result;
    },
    onSuccess: () => {
      toast({ title: "Demande envoyée", description: "Votre demande a été envoyée dans le Chat interne." });
      setAmount("");
      setWithdrawalPhone("");
      queryClient.invalidateQueries({ queryKey: ["/api/support/messages"] });
      queryClient.invalidateQueries({ queryKey: ["/api/support/conversation"] });
      navigate("/manager");
    },
    onError: (error: Error) => {
      toast({ title: "Erreur", description: error.message, variant: "destructive" });
    },
  });

  const handleSubmit = () => {
    if (!Number.isFinite(configuredConversionRate) || !Number.isFinite(configuredMinWithdrawal) ||
        !Number.isFinite(configuredWithdrawalFee)) {
      toast({ title: "Configuration indisponible", description: "Les réglages de retrait doivent être configurés par l'administrateur.", variant: "destructive" });
      return;
    }
    if (!/^\+\d{8,15}$/.test(withdrawalPhone.trim())) {
      toast({ title: "Numéro de retrait invalide", description: "Saisissez le numéro avec son indicatif, par exemple +226059546345.", variant: "destructive" });
      return;
    }
    if (!amount || Number(amount) <= 0) {
      toast({ title: "Montant invalide", description: "Saisissez un montant de retrait supérieur à zéro.", variant: "destructive" });
      return;
    }
    if (Number(amount) < minWithdrawal) {
      toast({
        title: "Montant insuffisant",
        description: `Le minimum de retrait est de ${minWithdrawal.toLocaleString("fr-FR")} GPB.`,
        variant: "destructive",
      });
      return;
    }
    if (Number(amount) > earningsBalance) {
      toast({
        title: "Gains insuffisants",
        description: `Votre solde de gains disponibles est de ${earningsBalance.toLocaleString("fr-FR")} GPB.`,
        variant: "destructive",
      });
      return;
    }
    withdrawMutation.mutate({ amount: Number(amount), phone: withdrawalPhone.trim() });
  };

  if (identityVerificationLoading || platformSettingsLoading) {
    return <RefreshLoader />;
  }

  if (!user) return null;

  if (identityVerificationData?.verification?.status !== "approved") {
    return (
      <main className="min-h-screen bg-white px-5 py-12 text-center">
        <div className="mx-auto flex max-w-sm flex-col items-center gap-4">
          <ShieldCheck className="h-14 w-14 text-[#FF0000]" aria-hidden="true" />
          <h1 className="text-2xl font-semibold text-slate-900">Vérification d'identité requise</h1>
          <p className="text-sm leading-6 text-slate-600">
            Vous devez faire approuver votre identité avant de pouvoir effectuer un retrait.
          </p>
          <Button
            type="button"
            className="w-full bg-[#FF0000] hover:bg-[#C00000]"
            onClick={() => navigate("/identity-verification")}
            data-testid="button-go-to-identity-from-withdrawal"
          >
            Vérifier mon identité
          </Button>
          <Button type="button" variant="ghost" onClick={() => navigate("/account")}>
            Retour au compte
          </Button>
        </div>
      </main>
    );
  }

  return (
    <main className="withdrawal-reference min-h-screen">
      <style>{`
        .withdrawal-reference {
          container-type: inline-size;
          overflow-x: hidden;
          background: #EAEAEA;
          color: #262626;
          font-family: Arial, Helvetica, sans-serif;
        }
        .withdrawal-reference .withdrawal-screen {
          container-type: inline-size;
          width: 100%;
          max-width: 512px;
          min-height: 100dvh;
          margin: 0 auto;
          background: #EAEAEA;
        }
        .withdrawal-reference .withdrawal-hero {
          position: relative;
          height: 112px;
          overflow: hidden;
          background-image: url("${withdrawalReference}");
          background-position: 0 -21.6797cqw;
          background-repeat: no-repeat;
          background-size: 100cqw auto;
        }
         .withdrawal-reference .withdrawal-hero::before {
           position: absolute;
           z-index: 1;
           inset: 0;
           background: #FF0000;
           content: "";
           mix-blend-mode: hue;
           pointer-events: none;
         }
        .withdrawal-reference .hero-hotspot {
          position: absolute;
          z-index: 2;
          border: 0;
          background: transparent;
          -webkit-tap-highlight-color: transparent;
        }
        .withdrawal-reference .hero-hotspot:focus-visible {
          outline: 2px solid #fff;
          outline-offset: -2px;
        }
        .withdrawal-reference .hero-back {
          top: 18px;
          left: 17px;
          width: 51px;
          height: 53px;
        }
        .withdrawal-reference .hero-history {
          top: 17px;
          right: 12px;
          width: 48px;
          height: 51px;
        }
        .withdrawal-reference .withdrawal-panel {
          position: relative;
          z-index: 1;
          min-height: 779px;
          margin-top: -1px;
          padding-bottom: 40px;
          border-radius: 25px 25px 0 0;
          background: #EAEAEA;
        }
        .withdrawal-reference .balance-summary {
          position: relative;
          height: 194px;
        }
        .withdrawal-reference .balance-brand {
          position: absolute;
          top: 73px;
           left: 34px;
           width: 82px;
           height: 42px;
           object-fit: contain;
        }
        .withdrawal-reference .balance-label {
          position: absolute;
          top: 53px;
           left: 130px;
          margin: 0;
          color: #929292;
          font-size: 21px;
          font-weight: 400;
          line-height: 1.2;
        }
        .withdrawal-reference .balance-value {
          position: absolute;
          top: 87px;
           left: 130px;
          margin: 0;
          color: #171717;
          font-size: 51px;
          font-weight: 400;
          letter-spacing: -1.8px;
          line-height: .95;
          white-space: nowrap;
        }
        .withdrawal-reference .phone-section,
        .withdrawal-reference .amount-section {
          margin: 0 21px;
        }
        .withdrawal-reference .field-label {
          margin: 0;
          color: #8c8c8c;
          font-size: 21px;
          font-weight: 400;
          line-height: 1.2;
        }
        .withdrawal-reference .phone-field {
          display: flex;
          width: 100%;
          height: 61px;
          align-items: center;
          margin-top: 16px;
          border: 1px solid #9d9d9d;
          border-radius: 10px;
          background: #EAEAEA;
          color: #4b4b4b;
          text-align: left;
        }
        .withdrawal-reference .phone-field input {
          width: 100%;
          height: 100%;
          border: 0;
          outline: 0;
          padding: 0 16px;
          color: #4e4e4e;
          background: transparent;
          font-size: 19px;
          letter-spacing: 1px;
        }
        .withdrawal-reference .phone-field input::placeholder {
          color: #969696;
          opacity: 1;
        }
        .withdrawal-reference .amount-section {
          margin-top: 27px;
        }
        .withdrawal-reference .amount-field {
          display: flex;
          height: 53px;
          align-items: center;
          margin-top: 15px;
          border: 1px solid #9d9d9d;
          background: #EAEAEA;
        }
        .withdrawal-reference .amount-currency {
          flex: 0 0 auto;
          padding-left: 19px;
          color: #409b81;
          font-size: 28px;
          line-height: 1;
        }
        .withdrawal-reference .amount-field input {
          width: 100%;
          min-width: 0;
          height: 100%;
          border: 0;
          outline: 0;
          padding: 0 8px;
          color: #4c4c4c;
          background: transparent;
          font-size: 20px;
        }
        .withdrawal-reference .amount-field input::placeholder {
          color: #969696;
          opacity: 1;
        }
        .withdrawal-reference .amount-details {
          display: flex;
          justify-content: space-between;
          margin: 13px 10px 0;
          color: #3f3f3f;
          font-size: 15px;
          line-height: 1.2;
        }
        .withdrawal-reference .confirm {
          display: block;
          width: 317px;
          max-width: calc(100% - 42px);
          height: 64px;
          margin: 26px auto 0;
          border: 0;
          border-radius: 34px;
          background: #2bb087;
          color: #fff;
          font-size: 24px;
          font-weight: 400;
          line-height: 1;
          transition: transform 120ms ease, filter 120ms ease;
        }
        .withdrawal-reference .confirm:active,
        .withdrawal-reference .phone-field:active {
          transform: scale(.98);
          filter: brightness(.96);
        }
        .withdrawal-reference .instructions {
          margin: 14px 21px 0;
          color: #3d3d3d;
          font-size: 16px;
          line-height: 1.48;
        }
        .withdrawal-reference .instructions p {
          margin: 0;
        }
        @media (max-width: 360px) {
          .withdrawal-reference .balance-summary { height: 164px; }
         .withdrawal-reference .balance-brand { left: 28px; transform: scale(.82); transform-origin: top left; }
          .withdrawal-reference .balance-label,
          .withdrawal-reference .balance-value { left: 105px; }
          .withdrawal-reference .balance-value { font-size: 42px; }
          .withdrawal-reference .phone-section,
          .withdrawal-reference .amount-section { margin-right: 16px; margin-left: 16px; }
          .withdrawal-reference .field-label { font-size: 18px; }
          .withdrawal-reference .phone-field input,
          .withdrawal-reference .amount-field input { font-size: 17px; }
          .withdrawal-reference .amount-currency { padding-left: 14px; font-size: 24px; }
          .withdrawal-reference .instructions { margin-right: 16px; margin-left: 16px; font-size: 14px; }
        }
      `}</style>

      <div className="withdrawal-screen">
        <section className="withdrawal-hero" aria-label="Retrait">
          <button type="button" className="hero-hotspot hero-back" onClick={() => navigate("/account")} aria-label="Retour" />
          <button type="button" className="hero-hotspot hero-history" onClick={() => navigate("/history")} aria-label="Historique des retraits" />
        </section>

        <section className="withdrawal-panel">
          <section className="balance-summary" aria-label="Solde de gains disponibles">
            <img className="balance-brand" src={hsbcLogo} alt="HSBC" />
            <p className="balance-label">Gains disponibles</p>
            <p className="balance-value" data-testid="text-balance">GPB {Math.round(earningsBalance).toLocaleString("fr-FR")}</p>
          </section>

          <section className="phone-section" aria-label="Numéro de retrait">
            <p className="field-label">Numéro de retrait</p>
            <label className="phone-field">
              <input
                type="tel"
                inputMode="tel"
                value={withdrawalPhone}
                onChange={(event) => setWithdrawalPhone(event.target.value)}
                placeholder="+226059546345"
                data-testid="input-withdrawal-phone"
                aria-label="Numéro de retrait"
              />
            </label>
          </section>

          <section className="amount-section" aria-label="Montant du retrait">
            <p className="field-label">Montant du retrait</p>
            <label className="amount-field">
              <span className="amount-currency">GPB</span>
              <input
                type="number"
                inputMode="numeric"
                value={amount}
                onChange={(event) => setAmount(event.target.value ? Number(event.target.value) : "")}
                placeholder="Saisissez le montant du retrait"
                data-testid="input-withdrawal-amount"
                aria-label="Montant du retrait"
              />
            </label>
            <div className="amount-details">
              <span>Vous aurez : {convertedAmount.toLocaleString("fr-FR")} F XOF</span>
              <span>Taux : 1 GPB = {conversionRate.toLocaleString("fr-FR")} F XOF</span>
            </div>
            <div className="amount-details">
              <span>Frais : {withdrawalFee}% ({feeAmount.toLocaleString("fr-FR")} F XOF)</span>
              <strong>Net : {netAmount.toLocaleString("fr-FR")} F XOF</strong>
            </div>
          </section>

          <button
            type="button"
            className="confirm"
            onClick={handleSubmit}
            disabled={withdrawMutation.isPending}
            data-testid="button-submit-withdrawal"
          >
             {withdrawMutation.isPending ? <Loader2 className="mx-auto h-6 w-6 animate-spin" /> : "Soumettre ma demande"}
          </button>

          <section className="instructions" aria-label="Instructions de retrait">
            <p>1. Le minimum de retrait est de {minWithdrawal.toLocaleString("fr-FR")} GPB.</p>
            <p>2. Le montant saisi en GPB est converti automatiquement en francs CFA (XOF).</p>
            <p>3. Les frais de retrait représentent {withdrawalFee}% du montant converti.</p>
            <p>4. Votre demande sera envoyée dans le Chat interne pour être prise en charge par le marchand.</p>
          </section>
        </section>
      </div>
    </main>
  );
}