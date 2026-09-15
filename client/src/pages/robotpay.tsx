import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, CheckCircle, ChevronRight, Copy, ImageIcon, Loader2, Phone, ShieldCheck, Upload } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { getCountryByCode, type ApiCountry } from "@/lib/countries";
import type { PaymentNumber } from "@shared/schema";
import RefreshLoader from "@/components/refresh-loader";
import DepositAmountDisplay from "@/components/deposit-amount-display";

type Provider = "ashtech" | "westpay" | "sendavapay" | "manual";
type AutomaticProvider = Exclude<Provider, "manual">;
type Operator = { id?: string; name?: string; code?: string; requiresOtp?: boolean; status?: string };
type ProviderInfo = {
  provider: Provider;
  name: string;
  providers?: Array<{ provider: AutomaticProvider; name: string }>;
};

const normalizeOperatorName = (name: string) =>
  name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");

function Stepper({ step }: { step: number }) {
  return (
    <div className="flex items-center justify-between mb-7">
      {["Numéro de téléphone", "Détails de confirmation", "Paiement terminé"].map((label, i) => (
        <div key={label} className="flex items-center flex-1 last:flex-none">
          <div className={`flex flex-col items-center text-center ${i <= step ? "text-[#FF0000]" : "text-gray-400"}`}>
            <div className={`w-10 h-10 rounded-full border-2 flex items-center justify-center font-bold ${i <= step ? "border-[#FF0000] bg-[#EAEAEA]" : "border-gray-300 bg-white"}`}>
              {i < step ? <Check className="w-5 h-5" /> : i + 1}
            </div>
            <span className="text-[11px] leading-tight mt-1 w-24">{label}</span>
          </div>
          {i < 2 && <div className={`h-px flex-1 mx-1 mt-[-18px] ${i < step ? "bg-[#FF0000]" : "bg-gray-300"}`} />}
        </div>
      ))}
    </div>
  );
}

export default function RobotPayPage() {
  const [, navigate] = useLocation();
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const params = useMemo(() => new URLSearchParams(window.location.search), []);
  const amount = Number(params.get("amount") || 0);
  const country = (params.get("country") || "").toUpperCase();
  // 0 = operator, 1 = phone, 2 = confirmation, 3 = success
  const [step, setStep] = useState(0);
  const [phone, setPhone] = useState("");
  const [operator, setOperator] = useState<Operator | null>(null);
  const [manualMode, setManualMode] = useState(false);
  const [selectedAutomaticProvider, setSelectedAutomaticProvider] = useState<AutomaticProvider | null>(null);
  const [selectedPaymentNumber, setSelectedPaymentNumber] = useState<PaymentNumber | null>(null);
  const [depositId, setDepositId] = useState<number | null>(null);
  const [transactionReference] = useState(() => `deposit-${Math.floor(10000 + Math.random() * 90000)}`);
  const [paymentToken, setPaymentToken] = useState("");
  const [otpToken, setOtpToken] = useState("");
  const [otp, setOtp] = useState("");
  const [ashtechOtp, setAshtechOtp] = useState("");
  const [ashtechOtpRequired, setAshtechOtpRequired] = useState(false);
  const [ussd, setUssd] = useState("");
  const [message, setMessage] = useState("");
  const [redirectUrl, setRedirectUrl] = useState("");
  const [status, setStatus] = useState("pending");
  const [copiedPaymentNumber, setCopiedPaymentNumber] = useState(false);
  const [screenshot, setScreenshot] = useState("");
  const [screenshotName, setScreenshotName] = useState("");
  const manualFileInputRef = useRef<HTMLInputElement>(null);

  const { data: countries = [], isLoading: countriesLoading } = useQuery<ApiCountry[]>({ queryKey: ["/api/countries"] });
  const { data: platformSettings = {} } = useQuery<Record<string, string>>({
    queryKey: ["/api/settings"],
  });
  const { data: providerInfo } = useQuery<ProviderInfo>({
    queryKey: ["/api/deposit/provider", country],
    queryFn: async () => (await fetch(`/api/deposit/provider/${country}`, { credentials: "include" })).json(),
    enabled: !!country,
  });
  const automaticProviders = providerInfo?.providers ||
    (providerInfo && providerInfo.provider !== "manual" ? [{ provider: providerInfo.provider, name: providerInfo.name } as { provider: AutomaticProvider; name: string }] : []);
  const provider = manualMode ? "manual" : selectedAutomaticProvider || providerInfo?.provider || "manual";
  const countryInfo = getCountryByCode(country, countries);
  const depositConversionRate = Number(platformSettings.depositConversionRate);
  const safeDepositConversionRate = Number.isFinite(depositConversionRate) && depositConversionRate > 0
    ? depositConversionRate
    : 0;
  const convertedAmount = safeDepositConversionRate > 0
    ? Math.round(amount * safeDepositConversionRate)
    : 0;
  const phonePrefix = countryInfo?.phonePrefix || "";
  const paymentPhone = phone.trim().startsWith("+")
    ? phone.trim()
    : phonePrefix
      ? `+${phonePrefix}${phone.replace(/\D/g, "")}`
      : phone.trim();

  const { data: sendavaData, isLoading: sendavaLoading } = useQuery<{ success: boolean; data: Operator[] }>({
    queryKey: ["/api/sendavapay/operators", country],
    queryFn: async () => (await fetch(`/api/sendavapay/operators/${country}`, { credentials: "include" })).json(),
    enabled: provider === "sendavapay" && !!country,
  });
  const { data: paymentNumbers = [], isLoading: paymentNumbersLoading } = useQuery<PaymentNumber[]>({
    queryKey: ["/api/payment-numbers", country],
    queryFn: async () => {
      const res = await fetch(`/api/payment-numbers?country=${encodeURIComponent(country)}`, { credentials: "include" });
      if (!res.ok) throw new Error("Unable to load payment numbers");
      return res.json();
    },
    enabled: !!country,
  });
  const { data: ashtechData, isLoading: ashtechLoading } = useQuery<any[]>({
    queryKey: ["/api/ashtechpay/countries"],
    queryFn: async () => (await fetch("/api/ashtechpay/countries", { credentials: "include" })).json(),
    enabled: provider === "ashtech",
  });
  const operators: Operator[] = provider === "ashtech"
    ? ((ashtechData || []).find(c => c.code?.toUpperCase() === country)?.operators || []).map((x: any) => typeof x === "string" ? { name: x, id: x } : x)
    : (sendavaData?.data || []).filter((x: Operator) => x.status === "online");
  const configuredPaymentOperators: Operator[] = paymentNumbers.map((paymentNumber) => ({
    id: `payment-number-${paymentNumber.id}`,
    name: paymentNumber.operatorName,
  }));
  const countryOperators: Operator[] = (countryInfo?.paymentMethods || []).map((name) => ({
    id: `country-operator-${normalizeOperatorName(name)}`,
    name,
  }));
  const operatorOptions: Operator[] = provider === "manual"
    ? countryOperators
    : provider === "sendavapay"
      ? [...operators, ...configuredPaymentOperators]
      : operators;
  const uniqueOperatorOptions = operatorOptions.filter((op, index, list) => {
    const key = normalizeOperatorName(op.name || op.code || "");
    return list.findIndex((candidate) => normalizeOperatorName(candidate.name || candidate.code || "") === key) === index;
  });
  const paymentNumberForOperator = (selectedOperator: Operator) => {
    const selectedName = normalizeOperatorName(selectedOperator.name || selectedOperator.code || "");
    return paymentNumbers.find((paymentNumber) => {
      const configuredName = normalizeOperatorName(paymentNumber.operatorName);
      return configuredName === selectedName ||
        configuredName.includes(selectedName) ||
        selectedName.includes(configuredName);
    });
  };
  const loadingOperators = sendavaLoading || ashtechLoading || paymentNumbersLoading || countriesLoading || !providerInfo;

  const sendavaMutation = useMutation({
    mutationFn: async () => {
       if (!operator?.id) throw new Error("Select an operator");
      const created = await apiRequest("POST", "/api/sendavapay/create", {
        amount, country, operatorId: operator.id, operatorName: operator.name, payerPhone: paymentPhone,
      });
       if (!created.ok) throw new Error((await created.json()).message || "Unable to create deposit");
      const data = await created.json();
      setDepositId(data.depositId); setPaymentToken(data.paymentToken);
      const initiated = await apiRequest("POST", "/api/sendavapay/initiate", {
        paymentToken: data.paymentToken, payerCountry: country, operatorId: operator.id,
        depositId: data.depositId, payerPhone: paymentPhone,
      });
      if (!initiated.ok) throw new Error((await initiated.json()).message || "Initiation impossible");
      return initiated.json();
    },
    onSuccess: (data) => {
      setMessage(data.message || "");
      if (data.requiresOtp && data.otpToken) { setOtpToken(data.otpToken); setUssd(data.ussdCode || ""); setStep(2); }
      else if (data.requiresRedirect && data.redirectUrl) { setRedirectUrl(data.redirectUrl); setStep(2); }
      else { setStep(2); setStatus("processing"); }
    },
     onError: (e: any) => toast({ title: "Payment error", description: e.message, variant: "destructive" }),
  });
  const manualDepositMutation = useMutation({
    mutationFn: async () => {
       if (!selectedPaymentNumber) throw new Error("Select a payment number");
      const res = await apiRequest("POST", "/api/deposits", {
        amount,
        accountName: user?.fullName || "",
        accountNumber: paymentPhone,
        paymentMethod: selectedPaymentNumber.operatorName,
        country,
        paymentNumberId: selectedPaymentNumber.id,
        channelName: `${selectedPaymentNumber.operatorName} - ${selectedPaymentNumber.phone}`,
        screenshot,
      });
       if (!res.ok) throw new Error((await res.json()).message || "Unable to send deposit");
      return res.json();
    },
    onSuccess: (data) => {
      setDepositId(data.deposit?.id || null);
      setStatus("pending");
      setStep(2);
    },
    onError: (e: any) => toast({ title: "Deposit error", description: e.message, variant: "destructive" }),
  });
  const ashtechMutation = useMutation({
    mutationFn: async (otpCode?: string) => {
       if (!operator?.name) throw new Error("Select an operator");
      const res = await apiRequest("POST", "/api/ashtechpay/collect", {
        amount, country, operator: operator.name, phone: phone.replace(/\D/g, ""),
        depositId: depositId || undefined, otp: otpCode || undefined,
      });
      if (!res.ok) throw new Error((await res.json()).message || "Initiation impossible");
      return res.json();
    },
    onSuccess: (data) => {
       setAshtechOtpRequired(false);
      setDepositId(data.depositId); setMessage(data.message || ""); setUssd(data.ussdCode || "");
      if (data.waveUrl) setRedirectUrl(data.waveUrl);
      setStep(2); setStatus(data.status || "processing");
    },
    onError: (e: any) => {
      if (e.data?.requiresOtp) {
        setDepositId(e.data.depositId || depositId);
        setAshtechOtpRequired(true);
        setUssd(e.data.ussdCode || "");
        setMessage(e.message || "Dial the indicated code, then enter your OTP.");
        setStep(2);
        return;
      }
      toast({ title: "Erreur de paiement", description: e.message, variant: "destructive" });
    },
  });
  const westpayMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/deposits", {
        amount, accountName: user?.fullName || "", accountNumber: paymentPhone,
        paymentMethod: "WestPay", country, useWestpay: true,
      });
      if (!res.ok) throw new Error((await res.json()).message || "WestPay unavailable");
      return res.json();
    },
    onSuccess: (data) => {
      if (data.westpayUrl) {
        window.location.assign(data.westpayUrl);
      }
    },
    onError: (e: any) => toast({ title: "WestPay error", description: e.message, variant: "destructive" }),
  });

  const westpayAutoStarted = useRef(false);
  useEffect(() => {
    if (
      providerInfo?.provider !== "westpay" ||
      westpayAutoStarted.current ||
      westpayMutation.isPending
    ) return;

    westpayAutoStarted.current = true;
    westpayMutation.mutate();
  }, [providerInfo?.provider, westpayMutation.isPending]);

  useEffect(() => {
    if (step !== 2 || !depositId || status === "approved" || provider === "westpay" || provider === "manual") return;
    const timer = setInterval(async () => {
      const url = provider === "ashtech" ? `/api/deposits/${depositId}/ashtechpay-status` : `/api/deposits/${depositId}/sendavapay-status`;
      const res = await fetch(url, { credentials: "include" });
      const data = await res.json();
      setStatus(data.status);
      if (data.status === "approved") { setStep(3); clearInterval(timer); queryClient.invalidateQueries({ queryKey: ["/api/deposits/history"] }); }
      if (data.status === "rejected") { clearInterval(timer); toast({ title: "Payment declined", variant: "destructive" }); }
    }, 5000);
    return () => clearInterval(timer);
  }, [step, depositId, status, provider]);

  const submitPhone = () => {
    if (!phone.trim()) { toast({ title: "Numéro requis", description: "Saisissez le numéro Mobile Money utilisé.", variant: "destructive" }); return; }
    if (provider === "manual") {
      if (!selectedPaymentNumber) {
        toast({ title: "Numéro de paiement requis", description: "Sélectionnez le numéro destinataire.", variant: "destructive" });
        return;
      }
      if (!screenshot) {
        toast({ title: "Capture requise", description: "Ajoutez une capture de votre paiement.", variant: "destructive" });
        return;
      }
      manualDepositMutation.mutate();
      return;
    }
    if (provider === "westpay") {
      westpayMutation.mutate();
      return;
    }
    if (!operator) { toast({ title: "Operator required", description: "Select your operator.", variant: "destructive" }); return; }
    if (provider === "ashtech") ashtechMutation.mutate(undefined);
    else sendavaMutation.mutate();
  };
  const submitOtp = async () => {
    if (provider === "ashtech") {
      if (!ashtechOtp.trim()) return;
      ashtechMutation.mutate(ashtechOtp.trim());
      return;
    }
    const res = await apiRequest("POST", "/api/sendavapay/submit-otp", { otpToken, otp });
    if (!res.ok) { toast({ title: "OTP invalide", variant: "destructive" }); return; }
    setStep(2); setStatus("processing");
  };
  const busy = sendavaMutation.isPending || ashtechMutation.isPending || westpayMutation.isPending || manualDepositMutation.isPending;

  const copyPaymentPhone = async (paymentNumber: PaymentNumber) => {
    try {
      await navigator.clipboard.writeText(paymentNumber.phone);
      setCopiedPaymentNumber(true);
      setTimeout(() => setCopiedPaymentNumber(false), 2000);
      toast({ title: "Number copied", description: paymentNumber.phone });
    } catch {
      toast({ title: "Payment number", description: `Copy ${paymentNumber.phone} manually` });
    }
  };

  const handleManualFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      toast({ title: "File too large", description: "The screenshot must not exceed 5 MB.", variant: "destructive" });
      return;
    }
    setScreenshotName(file.name);
    const reader = new FileReader();
    reader.onload = () => setScreenshot(String(reader.result || ""));
    reader.readAsDataURL(file);
  };

   if (!amount || !country) return <div className="min-h-screen flex items-center justify-center p-6 text-center">Invalid deposit data.</div>;
  return (
     <main className="min-h-screen bg-[#FF0000] p-3 sm:p-6">
      <div className="max-w-xl mx-auto">
        <div className="text-white px-5 pt-4 pb-6">
            <p className="text-xl">Montant à envoyer :</p>
           {safeDepositConversionRate > 0 ? (
             <DepositAmountDisplay
               amount={convertedAmount}
               className="mt-1"
               amountClassName="text-4xl font-bold text-white"
               buttonClassName="text-white hover:bg-white/10"
               testId="button-copy-robotpay-amount-header"
             />
           ) : (
             <p className="text-xl font-semibold">Calcul en cours...</p>
           )}
           <p className="mt-1 text-sm text-white/80">
             Crédit prévu sur votre solde : {amount.toLocaleString("fr-FR")} GPB
           </p>
        </div>
        <section className={step === 0 ? "space-y-5" : "rounded-xl bg-white p-5 shadow-xl sm:p-8"}>
          {step > 0 && <Stepper step={Math.max(0, Math.min(2, step - 1))} />}
           {step === 0 && (
             <div className="space-y-5">
                <p className="px-1 text-xl text-white">
                   {provider === "manual" ? "Select your operator:" : "Select the payment method:"}
                </p>
                {provider === "westpay" ? (
                  loadingOperators ? <RefreshLoader /> : (
                   <button onClick={() => setStep(1)} className="flex w-full items-center justify-between rounded-lg border-2 border-gray-100 bg-white px-4 py-4 text-left shadow-sm">
                     <span className="text-lg font-semibold text-[#8B0000]">{providerInfo?.name || "WestPay"}</span>
                     <ChevronRight className="text-gray-400" />
                   </button>
                 )
               ) : (
                    loadingOperators ? <RefreshLoader /> : uniqueOperatorOptions.length === 0 ? <p className="rounded-lg bg-white p-4 text-center text-gray-600">No operator is available at the moment.</p> : (
                     <div className="space-y-3">{uniqueOperatorOptions.map((op, i) => <button key={`${op.id || op.name}-${i}`} onClick={() => {
                      const configuredNumber = paymentNumberForOperator(op);
                      setOperator(op);
                      setSelectedPaymentNumber(configuredNumber || null);
                       setManualMode(provider === "manual" || Boolean(configuredNumber));
                      setStep(1);
                    }} className={`w-full flex items-center justify-between rounded-lg px-4 py-4 border-2 text-left ${operator === op ? "border-[#FF0000] bg-[#EAEAEA]" : "border-gray-100 bg-white shadow-sm"}`}><span className="font-semibold text-lg text-[#8B0000]">{op.name || op.code}</span><ChevronRight className="text-gray-400" /></button>)}</div>
                 )
                )}
                {provider !== "manual" && automaticProviders.filter((item) => item.provider !== provider).map((item) => (
                  <button
                    key={item.provider}
                    type="button"
                    onClick={() => {
                      setSelectedAutomaticProvider(item.provider);
                      setManualMode(false);
                      setOperator(null);
                    }}
                    className="w-full rounded-lg border border-white/70 bg-white/15 px-4 py-3 text-left text-white"
                  >
                     <span className="block font-semibold">Use {item.name}</span>
                     <span className="block text-xs opacity-90">Secure automatic payment.</span>
                  </button>
                ))}
             </div>
           )}
          {step === 1 && (
            <div className="space-y-5">
                {provider === "manual" ? (
                  selectedPaymentNumber ? (
                  <div className="space-y-3 rounded-xl border border-[#FF0000] bg-[#EAEAEA] p-4">
                   <div>
                      <p className="text-xs text-gray-500">Recipient number</p>
                     <p className="font-semibold text-[#8B0000]">{selectedPaymentNumber.operatorName}</p>
                     <p className="text-lg font-bold text-gray-900">{selectedPaymentNumber.phone}</p>
                     <p className="text-xs text-gray-600">{selectedPaymentNumber.ownerName}</p>
                   </div>
                   <button
                     type="button"
                     onClick={() => copyPaymentPhone(selectedPaymentNumber)}
                     className="flex w-full items-center justify-center gap-2 rounded-lg border border-[#FF0000] bg-white px-3 py-2 text-sm font-semibold text-[#FF0000]"
                   >
                     {copiedPaymentNumber ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                      {copiedPaymentNumber ? "Number copied" : "Copy number"}
                   </button>
                 </div>
                  ) : (
                  <div className="rounded-xl border border-orange-200 bg-orange-50 p-4 text-sm text-orange-800">
                    <p className="font-semibold">{operator?.name || "Opérateur sélectionné"}</p>
                    <p className="mt-1">Ce moyen de paiement est activé, mais aucun numéro destinataire n’est encore configuré par l’administrateur.</p>
                  </div>
                  )
                ) : (
                 <>
                    <div className="bg-[#ffe0a0] px-3 py-2 text-sm leading-tight text-[#e65b28]">Select the same option as your transfer method.</div>
                    <p className="text-sm font-semibold">Choose the transfer method</p>
                   <div className="flex items-center gap-2 text-gray-700">
                     <span className="h-4 w-4 rounded-full border-[4px] border-[#1686e8] ring-1 ring-[#1686e8]" />
                     <span>{provider === "westpay" ? providerInfo?.name || "WestPay" : operator?.name || operator?.code}</span>
                   </div>
                 </>
               )}
               <label className="block text-sm font-semibold">
                  {provider === "manual" ? "Votre numéro de paiement :" : "Saisissez votre numéro de téléphone :"}
               </label>
              <div className="flex items-center rounded-lg border border-gray-300 px-3">
                <Phone className="h-4 w-4 text-gray-400" />
                <span className="shrink-0 border-r border-gray-200 pr-2 text-gray-600">+{phonePrefix}</span>
                <input value={phone} onChange={e => setPhone(e.target.value.replace(/\D/g, "").slice(0, 12))} type="tel" inputMode="numeric" placeholder="Phone number" className="w-full px-3 py-3 outline-none" />
              </div>
               {provider === "manual" && (
                 <div>
                    <p className="mb-2 text-sm font-semibold">Payment screenshot <span className="text-red-500">*</span></p>
                   <input ref={manualFileInputRef} type="file" accept="image/jpeg,image/png,image/webp,image/gif" onChange={handleManualFileChange} className="hidden" />
                   <button
                     type="button"
                     onClick={() => manualFileInputRef.current?.click()}
                     className={`flex w-full flex-col items-center gap-2 rounded-xl border-2 border-dashed px-4 py-6 text-sm ${screenshot ? "border-[#FF0000] bg-[#EAEAEA] text-[#C00000]" : "border-gray-300 bg-gray-50 text-gray-600"}`}
                   >
                     {screenshot ? <CheckCircle className="h-7 w-7" /> : <ImageIcon className="h-7 w-7" />}
                      <span className="font-medium">{screenshot ? screenshotName : "Ajouter une capture"}</span>
                       <span className="text-xs">JPG, PNG, WEBP ou GIF — 5 Mo maximum</span>
                   </button>
                 </div>
               )}
              <div className="flex items-center justify-center gap-5 pt-3">
                  <button onClick={() => setStep(0)} className="w-[43%] rounded-md bg-[#78b9df] py-3 font-semibold text-white shadow-sm">&lt; Retour</button>
                   <button onClick={submitPhone} disabled={busy || !phone.trim() || (provider === "manual" && !screenshot)} className="w-[43%] rounded-md bg-[#078ee8] py-3 font-semibold text-white shadow-sm disabled:opacity-50">{busy ? <Loader2 className="mx-auto h-5 w-5 animate-spin" /> : provider === "manual" ? <span className="flex items-center justify-center gap-1"><Upload className="h-4 w-4" /> Envoyer</span> : "Suivant >"}</button>
              </div>
            </div>
          )}
          {step === 2 && (
            <div className="space-y-5 text-center">
               {provider === "manual" ? <><CheckCircle className="mx-auto h-16 w-16 text-[#FF0000]" /><p className="font-semibold text-lg">Demande de dépôt envoyée</p><p className="text-sm text-gray-500">Votre capture sera vérifiée par un administrateur ou un banquier. Votre solde sera crédité après approbation.</p></> : redirectUrl ? <><p className="text-gray-700">{message || "Ouvrez la page sécurisée pour terminer votre paiement."}</p><a href={redirectUrl} target="_blank" rel="noreferrer" className="block rounded-lg bg-[#FF0000] text-white py-3 font-semibold">Ouvrir la page de paiement</a></> : (otpToken || ashtechOtpRequired) ? <>{ussd && <p className="rounded-lg border border-orange-200 bg-orange-50 px-3 py-3 text-center font-mono text-xl font-bold tracking-widest text-[#FF0000]">{ussd}</p>}<p className="text-sm text-gray-600">{ussd ? "Composez ce code sur votre téléphone pour recevoir l'OTP, puis saisissez-le ci-dessous." : "Un code OTP vous a été envoyé. Saisissez-le ci-dessous."}</p><input value={provider === "ashtech" ? ashtechOtp : otp} onChange={e => provider === "ashtech" ? setAshtechOtp(e.target.value.replace(/\D/g, "")) : setOtp(e.target.value)} inputMode="numeric" placeholder="Saisissez le code OTP" className="w-full border rounded-lg p-3 text-center text-xl" /><button onClick={submitOtp} disabled={busy} className="w-full rounded-lg bg-[#FF0000] py-3 font-semibold text-white disabled:opacity-50">Confirmer</button></> : <><ShieldCheck className="mx-auto h-16 w-16 animate-pulse text-[#FF0000]" /><p className="font-semibold text-lg">Paiement en attente de confirmation</p><p className="text-sm text-gray-500">Confirmez la demande sur votre téléphone. Cette page se met à jour automatiquement.</p></>}
            </div>
          )}
          {step === 3 && <div className="text-center space-y-5 py-5"><div className="text-left border-b pb-3 text-xl text-gray-700">ROBOTPAY - {countryInfo?.name || country}</div><p className="text-left text-2xl text-gray-900">{amount.toLocaleString("fr-FR")} GPB</p><Check className="w-24 h-24 mx-auto rounded-full p-4 bg-[#FF0000] text-white" /><h2 className="text-xl text-gray-600">Votre paiement a été approuvé</h2><p className="text-sm text-gray-500">Votre compte a été crédité de <strong>{amount.toLocaleString("fr-FR")} GPB</strong>.</p><div className="text-left rounded bg-gray-200 p-3 text-sm leading-7 text-gray-700"><b>Payeur :</b> {phone}<br /><b>ID de transaction :</b> {transactionReference}<br /><b>Date du paiement :</b> {new Date().toLocaleString("fr-FR")}</div><p className="pt-12 text-gray-500">Sécurisé par <b className="text-[#8B0000]">ROBOTPAY</b></p><button onClick={() => navigate("/")} className="text-lg text-[#FF0000]">Retour au site</button></div>}
        </section>
      </div>
    </main>
  );
}