import { useState, useRef, useEffect } from "react";
import { useAuth } from "@/lib/auth";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  ChevronLeft, Info, Copy, CheckCircle, Upload, Phone, Loader2,
  ImageIcon, ArrowRight, Zap, RefreshCw, ExternalLink, History,
} from "lucide-react";
import { Link, useLocation } from "wouter";
import { DISPLAY_CURRENCY, type ApiCountry } from "@/lib/countries";
import type { PaymentNumber } from "@shared/schema";
import rechargeReference from "@assets/arton10164-710af_1789486316780.jpg";
import RefreshLoader from "@/components/refresh-loader";
import DepositAmountDisplay from "@/components/deposit-amount-display";

const TELD_PRIMARY = "#00ABB7";
const TELD_PRIMARY_DARK = "#008895";
const TELD_GRADIENT = `linear-gradient(112deg, ${TELD_PRIMARY} 0%, ${TELD_PRIMARY_DARK} 100%)`;

type Step =
  | "amount"
  | "select"
  | "form"
  | "sv-operator"
  | "sv-waiting"
  | "sv-otp"
  | "sv-redirect"
  | "westpay"
  | "ashtech-operator"
  | "ashtech-otp"
  | "ashtech-redirect"
  | "ashtech-waiting";

interface SvOperator {
  id: string;
  name: string;
  requiresOtp: boolean;
  status: string;
}

interface AshtechCountry {
  code: string;
  name: string;
  currency: string;
  operators: (string | { name?: string; code?: string; id?: string })[];
}

export default function DepositPage() {
  const { user, refreshUser } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [, navigate] = useLocation();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState<Step>("amount");
  const [selectedNumber, setSelectedNumber] = useState<PaymentNumber | null>(null);
  const [copiedId, setCopiedId] = useState<number | null>(null);

  const [amount, setAmount] = useState<number | "">("");
  const [depositCountry, setDepositCountry] = useState(user?.country || "");
  const [senderPhone, setSenderPhone] = useState(user?.phone || "");
  const [screenshot, setScreenshot] = useState<string>("");
  const [screenshotName, setScreenshotName] = useState("");
  const [paymentMessage, setPaymentMessage] = useState("");
  const [reference, setReference] = useState("");

  // SendavaPay state
  const [svCountry, setSvCountry] = useState(user?.country || "");
  const [svPhone, setSvPhone] = useState("");
  const [svOperator, setSvOperator] = useState<SvOperator | null>(null);
  const [svDepositId, setSvDepositId] = useState<number | null>(null);
  const [svPaymentToken, setSvPaymentToken] = useState<string>("");
  const [svOtpToken, setSvOtpToken] = useState<string>("");
  const [svOtp, setSvOtp] = useState<string>("");
  const [svUssdCode, setSvUssdCode] = useState<string>("");
  const [svOtpMessage, setSvOtpMessage] = useState<string>("");
  const [svRedirectUrl, setSvRedirectUrl] = useState<string>("");
  const [svStatus, setSvStatus] = useState<string>("");
  const [svPolling, setSvPolling] = useState(false);

  // AshtechPay state
  const [ashtechCountry, setAshtechCountry] = useState(user?.country || "");
  const [ashtechPhone, setAshtechPhone] = useState("");
  const [ashtechOperator, setAshtechOperator] = useState("");
  const [ashtechDepositId, setAshtechDepositId] = useState<number | null>(null);
  const [ashtechOtp, setAshtechOtp] = useState("");
  const [ashtechUssdCode, setAshtechUssdCode] = useState("");
  const [ashtechMessage, setAshtechMessage] = useState("");
  const [ashtechWaveUrl, setAshtechWaveUrl] = useState("");
  const [ashtechStatus, setAshtechStatus] = useState("");
  const [ashtechPolling, setAshtechPolling] = useState(false);

  const country = depositCountry;

  const { data: apiCountries = [] } = useQuery<ApiCountry[]>({
    queryKey: ["/api/countries"],
  });

  const countryInfo = apiCountries.find(c => c.code === country && c.isActive);
  const currency = DISPLAY_CURRENCY;

  const { data: platformSettings, isLoading: platformSettingsLoading } = useQuery<Record<string, string>>({
    queryKey: ["/api/settings"],
  });
  const configuredMinDeposit = Number(platformSettings?.minDeposit);
  const MIN_DEPOSIT = Number.isFinite(configuredMinDeposit) ? configuredMinDeposit : Number.POSITIVE_INFINITY;
  const configuredDepositRate = Number(platformSettings?.depositConversionRate);
  const DEPOSIT_CONVERSION_RATE = Number.isFinite(configuredDepositRate) ? configuredDepositRate : 0;
  const convertedDepositAmount = amount ? Math.round(Number(amount) * DEPOSIT_CONVERSION_RATE) : 0;
  const sendavapayEnabled = platformSettings?.sendavapayEnabled === "true";
  const sendavapayChannelName = platformSettings?.sendavapayChannelName || "";
  const westpayEnabled = platformSettings?.westpayEnabled === "true";
  const westpayChannelName = platformSettings?.westpayChannelName || "";
  const westpayCountries = platformSettings?.westpayCountries || "";
  const westpayAvailable = westpayEnabled && (
    !westpayCountries || westpayCountries.split(",").map(c => c.trim()).includes(country)
  );
  const ashtechEnabled = platformSettings?.ashtechEnabled === "true";
  const ashtechChannelName = platformSettings?.ashtechChannelName || "";
  const ashtechCountriesSetting = platformSettings?.ashtechCountries || "";
  const ashtechCountryAllowed = !ashtechCountriesSetting ||
    ashtechCountriesSetting.split(",").map(c => c.trim().toUpperCase()).includes(country.toUpperCase());
  const ashtechAvailable = ashtechEnabled && ashtechCountryAllowed;

  const activeDepositCountries = apiCountries.filter(c => c.isActive) as Array<{ code: string; name: string; currency: string }>;
  const ashtechConfiguredCountryCodes = ashtechCountriesSetting
    ? ashtechCountriesSetting.split(",").map(c => c.trim().toUpperCase()).filter(Boolean)
    : null;

  const { data: paymentNumbersList = [], isLoading: numbersLoading } = useQuery<PaymentNumber[]>({
    queryKey: ["/api/payment-numbers", country],
    queryFn: async () => {
      const res = await fetch(`/api/payment-numbers?country=${country}`, { credentials: "include" });
      if (!res.ok) throw new Error("Erreur");
      return res.json();
    },
    enabled: !!country,
  });

  // SendavaPay: load operators for selected country
  const { data: svOperatorsData, isLoading: svOperatorsLoading } = useQuery<{ success: boolean; data: SvOperator[] }>({
    queryKey: ["/api/sendavapay/operators", svCountry],
    queryFn: async () => {
      const res = await fetch(`/api/sendavapay/operators/${svCountry}`, { credentials: "include" });
      if (!res.ok) throw new Error("Erreur");
      return res.json();
    },
    enabled: step === "sv-operator" && !!svCountry,
  });
  const svOperators = (svOperatorsData?.data || []).filter(op => op.status === "online");

  const { data: ashtechCountries = [], isLoading: ashtechCountriesLoading } = useQuery<AshtechCountry[]>({
    queryKey: ["/api/ashtechpay/countries"],
    queryFn: async () => {
      const res = await fetch("/api/ashtechpay/countries", { credentials: "include" });
      if (!res.ok) throw new Error("Unable to load operators");
      return res.json();
    },
    enabled: step === "ashtech-operator" && ashtechAvailable,
  });
  const availableAshtechCountries = ashtechCountries.filter(c =>
    activeDepositCountries.some(active => active.code.toUpperCase() === c.code.toUpperCase()) &&
    (!ashtechConfiguredCountryCodes || ashtechConfiguredCountryCodes.includes(c.code.toUpperCase()))
  );
  const selectedAshtechCountry = availableAshtechCountries.find(c => c.code === ashtechCountry);
  const ashtechOperators = selectedAshtechCountry?.operators || [];

  // Poll deposit status
  useEffect(() => {
    if (step !== "sv-waiting" || !svDepositId || !svPolling) return;
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/deposits/${svDepositId}/sendavapay-status`, { credentials: "include" });
        const data = await res.json();
        setSvStatus(data.status);
        if (data.status === "approved") {
          clearInterval(interval);
          setSvPolling(false);
          toast({ title: "Paiement confirmé !", description: "Votre solde a été crédité." });
          refreshUser();
          queryClient.invalidateQueries({ queryKey: ["/api/deposits/history"] });
          // reset
          setStep("amount");
          setAmount("");
          setSvOperator(null);
          setSvDepositId(null);
          setSvPaymentToken("");
          setSvOtpToken("");
          setSvOtp("");
          setSvStatus("");
        } else if (data.status === "rejected") {
          clearInterval(interval);
          setSvPolling(false);
          toast({ title: "Échec du paiement", description: "Le paiement a été refusé ou annulé.", variant: "destructive" });
          setStep("sv-operator");
        }
      } catch (e) {
        // ignore polling errors
      }
    }, 5000);
    return () => clearInterval(interval);
  }, [step, svDepositId, svPolling]);

  useEffect(() => {
    if (step !== "ashtech-waiting" || !ashtechDepositId || !ashtechPolling) return;
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/deposits/${ashtechDepositId}/ashtechpay-status`, { credentials: "include" });
        const data = await res.json();
        setAshtechStatus(data.status);
        if (data.status === "approved") {
          clearInterval(interval);
          setAshtechPolling(false);
          toast({ title: "Paiement confirmé !", description: "Votre solde a été crédité." });
          refreshUser();
          queryClient.invalidateQueries({ queryKey: ["/api/deposits/history"] });
          setStep("amount");
          setAmount("");
          setAshtechDepositId(null);
          setAshtechStatus("");
        } else if (data.status === "rejected") {
          clearInterval(interval);
          setAshtechPolling(false);
          toast({ title: "Échec du paiement", description: "Le paiement a été refusé ou annulé.", variant: "destructive" });
          setStep("ashtech-operator");
        }
      } catch {
        // Keep polling; a transient provider error must not lose the payment flow.
      }
    }, 5000);
    return () => clearInterval(interval);
  }, [step, ashtechDepositId, ashtechPolling]);

  // ── Mutations ───────────────────────────────────────────────────────────────

  const copyPhone = async (number: PaymentNumber) => {
    try {
      await navigator.clipboard.writeText(number.phone);
      setCopiedId(number.id);
      setTimeout(() => setCopiedId(null), 2000);
      toast({ title: "Number copied!", description: `${number.phone} copied` });
    } catch {
      toast({ title: "Numéro : " + number.phone, description: "Copiez ce numéro manuellement" });
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      toast({ title: "File too large", description: "Maximum 5 MB", variant: "destructive" });
      return;
    }
    setScreenshotName(file.name);
    const reader = new FileReader();
    reader.onload = (ev) => setScreenshot(ev.target?.result as string);
    reader.readAsDataURL(file);
  };

  const depositMutation = useMutation({
    mutationFn: async () => {
      if (!selectedNumber) throw new Error("Aucun numéro sélectionné");
      const res = await apiRequest("POST", "/api/deposits", {
        amount: Number(amount),
        accountName: user?.fullName || "",
        accountNumber: senderPhone,
        paymentMethod: selectedNumber.operatorName,
        country,
        paymentNumberId: selectedNumber.id,
        channelName: `${selectedNumber.operatorName} - ${selectedNumber.phone}`,
        screenshot: screenshot || null,
        paymentMessage: paymentMessage || null,
        reference: reference || null,
      });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.message || "Erreur");
      }
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Demande envoyée !", description: "Votre dépôt est en attente d'approbation" });
      queryClient.invalidateQueries({ queryKey: ["/api/deposits/history"] });
      refreshUser();
      setStep("amount");
      setSelectedNumber(null);
      setAmount("");
      setSenderPhone(user?.phone || "");
      setScreenshot("");
      setScreenshotName("");
      setPaymentMessage("");
      setReference("");
    },
    onError: (e: any) => toast({ title: "Erreur", description: e.message, variant: "destructive" }),
  });

  // WestPay: create deposit + get redirect URL
  const [wpDepositId, setWpDepositId] = useState<number | null>(null);
  const [wpStatus, setWpStatus] = useState<string>("");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const s = params.get("wp_status");
    const did = params.get("wp_depositId");
    if (s) {
      setWpStatus(s);
      if (did) setWpDepositId(parseInt(did));
      // clean URL
      window.history.replaceState({}, "", "/deposit");
      if (s === "success") {
        toast({ title: "Confirmation du paiement en cours", description: "Votre dépôt sera crédité après confirmation par WestPay." });
        queryClient.invalidateQueries({ queryKey: ["/api/deposits/history"] });
      }
    }
  }, []);

  const wpInitiateMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/deposits", {
        amount: Number(amount),
        accountName: user?.fullName || "",
        accountNumber: user?.phone || "",
        paymentMethod: "WestPay",
        country,
        useWestpay: true,
      });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.message || "WestPay error");
      }
      return res.json();
    },
    onSuccess: (data) => {
      if (data.westpayUrl) {
        window.location.href = data.westpayUrl;
      }
    },
    onError: (e: any) => toast({ title: "WestPay error", description: e.message, variant: "destructive" }),
  });

  const ashtechCollectMutation = useMutation({
    mutationFn: async (otp?: string) => {
      if (!ashtechOperator || !ashtechPhone.trim()) throw new Error("Sélectionnez un opérateur et saisissez votre numéro");
      const res = await apiRequest("POST", "/api/ashtechpay/collect", {
        amount: Number(amount),
        country: ashtechCountry,
        operator: ashtechOperator,
        phone: ashtechPhone.trim(),
        depositId: ashtechDepositId || undefined,
        otp: otp || undefined,
      });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.message || "AshtechPay error");
      }
      return res.json();
    },
    onSuccess: (data: any) => {
      setAshtechDepositId(data.depositId);
      setAshtechMessage(data.message || "");
      setAshtechUssdCode(data.ussdCode || "");
      if (data.waveUrl) {
        setAshtechWaveUrl(data.waveUrl);
        setStep("ashtech-redirect");
      } else if (data.requiresOtp) {
        setStep("ashtech-otp");
      } else {
        setAshtechPolling(true);
        setAshtechStatus(data.status || "pending");
        setStep("ashtech-waiting");
      }
    },
    onError: (e: any) => {
      if (e.data?.requiresOtp) {
        setAshtechDepositId(e.data.depositId || ashtechDepositId);
        setAshtechUssdCode(e.data.ussdCode || "");
        setAshtechMessage(e.message || "Dial the displayed code, then enter the OTP code.");
        setAshtechOtp("");
        setStep("ashtech-otp");
        return;
      }
      toast({ title: `${ashtechChannelName} error`, description: e.message, variant: "destructive" });
    },
  });

  // SendavaPay: create + initiate
  const svInitiateMutation = useMutation({
    mutationFn: async () => {
      if (!svOperator) throw new Error("Sélectionnez un opérateur");
      // Step 1: create payment on backend
      const createRes = await apiRequest("POST", "/api/sendavapay/create", {
        amount: Number(amount),
        country: svCountry,
        operatorId: svOperator.id,
        operatorName: svOperator.name,
        payerPhone: svPhone,
      });
      if (!createRes.ok) {
        const d = await createRes.json();
        throw new Error(d.message || "Payment creation error");
      }
      const createData = await createRes.json();
      setSvDepositId(createData.depositId);
      setSvPaymentToken(createData.paymentToken);

      // Step 2: initiate payment
      const initRes = await apiRequest("POST", "/api/sendavapay/initiate", {
        paymentToken: createData.paymentToken,
        payerCountry: svCountry,
        operatorId: svOperator.id,
        depositId: createData.depositId,
        payerPhone: svPhone,
      });
      if (!initRes.ok) {
        const d = await initRes.json();
        throw new Error(d.message || "Payment initiation error");
      }
      return initRes.json();
    },
    onSuccess: (data: any) => {
      const isWave = svOperator?.name?.toLowerCase().includes("wave");
      if (data.requiresRedirect && data.redirectUrl && isWave) {
        // Only Wave requires a redirect to an external page
        setSvRedirectUrl(data.redirectUrl);
        setStep("sv-redirect");
      } else if (data.requiresRedirect && !isWave) {
        // Other operators (MTN, Moov, etc.) send a USSD push directly
        // to the phone — no redirect is needed; we just wait for the webhook
        setSvPolling(true);
        setStep("sv-waiting");
      } else if (data.requiresOtp && data.otpToken) {
        // Orange Money (BF, CI, GN, ML, SN) — user must dial USSD then enter OTP
        setSvOtpToken(data.otpToken);
        setSvUssdCode(data.ussdCode || "");
        setSvOtpMessage(data.message || "");
        setStep("sv-otp");
      } else if (data.success) {
        // Standard push: invite sent directly to phone — wait for webhook
        setSvPolling(true);
        setStep("sv-waiting");
      } else {
        toast({ title: "Erreur", description: data.error || data.message || "Erreur de paiement", variant: "destructive" });
      }
    },
    onError: (e: any) => toast({ title: "Erreur", description: e.message, variant: "destructive" }),
  });

  // SendavaPay: retry failed payment
  const svRetryMutation = useMutation({
    mutationFn: async () => {
      if (!svPaymentToken) throw new Error("Payment token is missing");
      const res = await apiRequest("POST", "/api/sendavapay/retry", {
        paymentToken: svPaymentToken,
        depositId: svDepositId,
      });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.message || "Retry error");
      }
      return res.json();
    },
    onSuccess: () => {
      // Reset to operator selection to re-initiate
      setSvOtp("");
      setSvOtpToken("");
      setSvStatus("");
      setSvPolling(false);
      setStep("sv-operator");
      toast({ title: "Prêt à réessayer", description: "Sélectionnez un opérateur et relancez le paiement." });
    },
    onError: (e: any) => toast({ title: "Retry error", description: e.message, variant: "destructive" }),
  });

  // SendavaPay: submit OTP
  const svOtpMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/sendavapay/submit-otp", {
        otpToken: svOtpToken,
        otp: svOtp,
      });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.message || "OTP error");
      }
      return res.json();
    },
    onSuccess: () => {
      setSvPolling(true);
      setStep("sv-waiting");
    },
    onError: (e: any) => toast({ title: "OTP error", description: e.message, variant: "destructive" }),
  });

  const handleAmountNext = () => {
    if (!amount || Number(amount) < MIN_DEPOSIT) {
      toast({
        title: "Invalid amount",
        description: `The minimum is ${MIN_DEPOSIT.toLocaleString()} ${currency}`,
        variant: "destructive",
      });
      return;
    }

    if (platformSettingsLoading) return;

    if (westpayAvailable) {
      wpInitiateMutation.mutate();
      return;
    }

    navigate(`/robotpay?amount=${Number(amount)}&country=${encodeURIComponent(country)}`);
  };

  const getOperatorIcon = (name: string): string | null => {
    const n = name.toLowerCase();
    if (n.includes("tmoney") || n.includes("t-money")) return "/operators/tmoney.png";
    if (n.includes("moov")) return "/operators/moov.jpg";
    if (n.includes("orange")) return "/operators/orange.png";
    if (n.includes("mtn")) return "/operators/mtn.png";
    if (n.includes("airtel")) return "/operators/airtel.png";
    if (n.includes("wave")) return "/operators/wave.png";
    return null;
  };

  const handleSubmit = () => {
    if (!senderPhone.trim()) {
      toast({ title: "Numéro requis", description: "Saisissez le numéro utilisé pour le paiement.", variant: "destructive" });
      return;
    }
    if (!screenshot) {
      toast({ title: "Capture requise", description: "Veuillez joindre la capture du paiement", variant: "destructive" });
      return;
    }
    depositMutation.mutate();
  };

  if (!user) return null;

  // ── STEP 1: Amount ─────────────────────────────────────────────────────────
  if (step === "amount") return (
    <main className="deposit-reference min-h-screen">
      <style>{`
        .deposit-reference {
          container-type: inline-size;
          overflow-x: hidden;
          background: #fff;
          color: #242424;
          font-family: Arial, Helvetica, sans-serif;
        }
        .deposit-reference .deposit-screen {
          container-type: inline-size;
          width: 100%;
          max-width: 512px;
          min-height: 100dvh;
          margin: 0 auto;
          overflow: hidden;
          background: #fff;
        }
        .deposit-reference .deposit-hero {
          position: relative;
          overflow: hidden;
           background: #004b57;
         }
         .deposit-reference .deposit-hero-image {
           display: block;
           width: 100%;
           height: auto;
         }
         .deposit-reference .deposit-hero::after {
           position: absolute;
           inset: 0;
           z-index: 0;
           background: linear-gradient(180deg, rgba(0, 38, 49, .08) 15%, rgba(0, 38, 49, .7) 100%);
           content: "";
           pointer-events: none;
         }
         .deposit-reference .deposit-hero-title {
           position: absolute;
           right: 20px;
           bottom: 66px;
           left: 20px;
           z-index: 1;
           margin: 0;
           color: #fff;
           font-size: 40px;
           font-weight: 400;
           line-height: 1.1;
           text-align: center;
           text-shadow: 0 2px 8px rgba(0, 27, 37, .45);
        }
        .deposit-reference .hero-hotspot {
          position: absolute;
          z-index: 2;
          border: 0;
          background: transparent;
          -webkit-tap-highlight-color: transparent;
        }
        .deposit-reference .hero-hotspot:focus-visible {
          outline: 2px solid #fff;
          outline-offset: -2px;
        }
        .deposit-reference .hero-back {
          top: 19px;
          left: 17px;
          width: 50px;
          height: 52px;
           display: flex;
           align-items: center;
           justify-content: center;
           border-radius: 999px;
           background: rgba(255, 255, 255, .32);
         }
         .deposit-reference .hero-back svg {
           width: 32px;
           height: 32px;
           color: #fff;
           stroke-width: 2.5;
        }
        .deposit-reference .hero-history {
          top: 18px;
          right: 13px;
          width: 46px;
          height: 50px;
           display: flex;
           align-items: center;
           justify-content: center;
           border-radius: 999px;
           background: rgba(255, 255, 255, .32);
         }
         .deposit-reference .hero-history svg {
           width: 27px;
           height: 27px;
           color: #fff;
           stroke-width: 2;
        }
        .deposit-reference .deposit-panel {
          position: relative;
          z-index: 3;
          min-height: 620px;
          margin-top: -1px;
          padding: 31px 21px 28px;
          border-radius: 27px 27px 0 0;
          background: #fff;
        }
        .deposit-reference .deposit-title {
          margin: 0;
          font-size: 20px;
          font-weight: 400;
          line-height: 1.2;
        }
        .deposit-reference .preset-row {
          display: flex;
          gap: 10px;
          margin-top: 20px;
        }
        .deposit-reference .preset {
          width: 111px;
          height: 55px;
          border: 1px solid #e9e9e9;
          border-radius: 14px;
          background: #fff;
          box-shadow: 0 2px 4px rgba(0,0,0,.07);
          color: #4aa78c;
          font-size: 20px;
          font-weight: 400;
          line-height: 1;
          transition: transform 120ms ease, filter 120ms ease;
        }
        .deposit-reference .preset:active,
        .deposit-reference .deposit-method:active,
        .deposit-reference .confirm:active {
          transform: scale(.98);
          filter: brightness(.96);
        }
        .deposit-reference .custom-label {
          margin: 27px 0 15px;
          color: #858585;
          font-size: 21px;
          font-weight: 400;
          line-height: 1.2;
        }
        .deposit-reference .amount-input {
          display: flex;
          height: 53px;
          align-items: center;
          overflow: hidden;
          border: 1px solid #a9a9a9;
          background: #fff;
        }
        .deposit-reference .amount-input .currency {
          flex: 0 0 auto;
          padding-left: 20px;
          color: #409c82;
          font-size: 28px;
          font-weight: 400;
          line-height: 1;
        }
        .deposit-reference .amount-input input {
          width: 100%;
          min-width: 0;
          height: 100%;
          border: 0;
          outline: 0;
          padding: 0 9px;
          color: #4b4b4b;
          background: transparent;
          font-size: 20px;
          font-weight: 400;
        }
        .deposit-reference .amount-input input::placeholder { color: #8d8d8d; opacity: 1; }
        .deposit-reference .method-label {
          margin: 27px 0 16px;
          color: #858585;
          font-size: 21px;
          line-height: 1.2;
        }
        .deposit-reference .deposit-method {
          display: flex;
          width: 100%;
          height: 58px;
          align-items: center;
          justify-content: space-between;
          border: 0;
          border-radius: 9px;
          padding: 0 23px 0 20px;
          background: #4db18a;
          color: #fff;
          font-size: 21px;
          font-weight: 400;
          line-height: 1;
          transition: transform 120ms ease, filter 120ms ease;
        }
        .deposit-reference .method-copy {
          display: flex;
          align-items: center;
          gap: 14px;
        }
        .deposit-reference .method-icon {
          position: relative;
          display: block;
          width: 25px;
          height: 17px;
          border: 2px solid #fff;
          border-radius: 4px;
        }
        .deposit-reference .method-icon::before,
        .deposit-reference .method-icon::after {
          position: absolute;
          left: 4px;
          width: 11px;
          height: 2px;
          background: #fff;
          content: "";
        }
        .deposit-reference .method-icon::before { top: 4px; }
        .deposit-reference .method-icon::after { top: 9px; }
        .deposit-reference .method-check {
          font-size: 24px;
          line-height: 1;
        }
        .deposit-reference .confirm {
          display: block;
          width: 317px;
          max-width: 100%;
          height: 64px;
          margin: 22px auto 0;
          border: 0;
          border-radius: 36px;
          background: #e6e7eb;
          color: #fff;
          font-size: 24px;
          font-weight: 700;
          line-height: 1;
          transition: transform 120ms ease, filter 120ms ease;
        }
        .deposit-reference .confirm:enabled {
          background: #4db18a;
          cursor: pointer;
        }
        .deposit-reference .help-link {
          display: block;
          margin-top: 13px;
          color: #279b39;
          font-size: 18px;
          line-height: 1.2;
          text-align: center;
          text-decoration: none;
        }
        .deposit-reference .deposit-instructions {
          margin-top: 27px;
          color: #454545;
          font-size: 16px;
          line-height: 1.45;
        }
        .deposit-reference .deposit-instructions p { margin: 0 0 12px; }
        @media (max-width: 360px) {
           .deposit-reference .deposit-hero-title { right: 14px; bottom: 46px; left: 14px; font-size: 30px; }
          .deposit-reference .deposit-panel { padding-right: 16px; padding-left: 16px; }
          .deposit-reference .preset { flex: 1; width: auto; font-size: 17px; }
          .deposit-reference .deposit-title,
          .deposit-reference .custom-label,
          .deposit-reference .method-label { font-size: 18px; }
          .deposit-reference .amount-input .currency { padding-left: 13px; font-size: 24px; }
          .deposit-reference .amount-input input,
          .deposit-reference .deposit-method { font-size: 18px; }
          .deposit-reference .confirm { width: 280px; }
        }
      `}</style>

      <div className="deposit-screen">
        <section className="deposit-hero" aria-label="Quick top-up">
           <img className="deposit-hero-image" src={rechargeReference} alt="" />
          <Link href="/account">
             <button type="button" className="hero-hotspot hero-back" aria-label="Back">
               <ChevronLeft aria-hidden="true" />
             </button>
          </Link>
          <Link href="/history">
              <button type="button" className="hero-hotspot hero-history" aria-label="Historique des dépôts">
               <History aria-hidden="true" />
             </button>
          </Link>
             <h1 className="deposit-hero-title">Recharge rapide</h1>
        </section>

          <section className="deposit-panel" aria-label="Montant du dépôt">
            <h1 className="deposit-title">Sélectionnez le montant de votre dépôt</h1>
            <p className="custom-label">Saisissez un autre montant</p>
          <label className="amount-input">
            <span className="currency">GPB</span>
            <input
              type="number"
              inputMode="numeric"
              value={amount}
                placeholder="Saisissez un montant"
              onChange={(event) => setAmount(event.target.value ? Number(event.target.value) : "")}
                aria-label="Montant du dépôt"
            />
          </label>
          <div className="mt-3 rounded-xl border border-[#00CC2C]/30 bg-[#00CC2C]/10 px-4 py-3 text-sm text-gray-700">
            <div className="flex items-center justify-between gap-3">
              <span>Montant à envoyer en FCFA</span>
              <DepositAmountDisplay
                amount={convertedDepositAmount}
                disabled={!amount}
                amountClassName="text-[#00A923]"
                buttonClassName="text-[#00A923]"
                testId="button-copy-deposit-amount"
              />
            </div>
            <p className="mt-1 text-xs text-gray-500">
              Taux : 1 GPB = {DEPOSIT_CONVERSION_RATE.toLocaleString("fr-FR")} F CFA
            </p>
          </div>

            <p className="method-label">Mode de dépôt</p>
            <button type="button" className="deposit-method" aria-label="Mode de dépôt GPB">
              <span className="method-copy"><span className="method-icon" aria-hidden="true" />Dépôt GPB</span>
            <span className="method-check" aria-hidden="true">✓</span>
          </button>

          <button
            type="button"
            className="confirm"
            onClick={handleAmountNext}
            disabled={!amount || Number(amount) < MIN_DEPOSIT || !depositCountry || platformSettingsLoading || wpInitiateMutation.isPending}
          >
            {wpInitiateMutation.isPending ? <Loader2 className="mx-auto h-7 w-7 animate-spin" /> : "Confirmer"}
          </button>

          <Link href="/history" className="help-link">
             Si votre dépôt est retardé, cliquez ici
          </Link>

           <div className="deposit-instructions" aria-label="Deposit instructions">
             <p>1. Le montant minimum du dépôt est de {MIN_DEPOSIT.toLocaleString("fr-FR")} GPB.</p>
             <p>2. Envoyez {convertedDepositAmount.toLocaleString("fr-FR")} F CFA pour recevoir {Number(amount || 0).toLocaleString("fr-FR")} GPB.</p>
             <p>3. Vérifiez attentivement vos informations de paiement avant de confirmer.</p>
          </div>
        </section>
      </div>
    </main>
  );

  // ── STEP 2: Select an active payment number ───────────────────────────────
  if (step === "select") return (
    <div className="min-h-screen bg-white">
      <header className="flex items-center justify-between border-b border-gray-100 bg-white px-4 py-4">
        <button className="flex items-center gap-1 text-gray-800" onClick={() => setStep("amount")}>
           <ChevronLeft className="h-5 w-5" /><span className="font-semibold text-base">Numéro de paiement</span>
        </button>
         <Link href="/history"><button className="rounded-full border border-[#00CC2C] px-3 py-1.5 text-xs font-semibold text-[#00CC2C]">Historique</button></Link>
      </header>
        <div className="mx-4 mt-4 flex items-center justify-between rounded-xl border border-orange-100 bg-orange-50 p-4">
           <div>
             <p className="text-xs text-gray-500">Montant à envoyer</p>
             <DepositAmountDisplay
               amount={convertedDepositAmount}
               amountClassName="text-xl font-bold text-[#00CC2C]"
               buttonClassName="text-[#00CC2C]"
               testId="button-copy-deposit-amount-select"
             />
           </div>
          <button onClick={() => setStep("amount")} className="text-xs text-[#00CC2C] underline">Modifier</button>
      </div>
      <div className="p-4 space-y-3">
        <div className="rounded-2xl border-2 border-[#00CC2C] bg-green-50 p-4">
            <p className="text-sm font-bold text-gray-900">Choisissez le compte mobile destinataire</p>
            <p className="mt-1 text-xs text-gray-600">Transférez ensuite les fonds avec l'opérateur configuré pour votre pays.</p>
        </div>
        {numbersLoading ? (
          <RefreshLoader />
        ) : paymentNumbersList.length === 0 ? (
          <div className="rounded-xl border border-orange-200 bg-orange-50 p-4 text-sm text-orange-800">
             Aucun numéro de paiement n'est disponible pour le moment. Contactez le service client.
          </div>
        ) : (
          paymentNumbersList.map((number) => (
            <button
              key={number.id}
              type="button"
              onClick={() => { setSelectedNumber(number); setStep("form"); }}
              className="flex w-full items-center gap-3 rounded-xl border-2 border-gray-100 bg-white p-4 text-left shadow-sm transition hover:border-[#00CC2C] hover:bg-green-50"
              data-testid={`button-payment-number-${number.id}`}
            >
              {number.logoUrl ? (
                <img src={number.logoUrl} alt="" className="h-10 w-10 rounded-lg object-contain" />
              ) : (
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-green-50 text-[#00CC2C]"><Phone className="h-5 w-5" /></div>
              )}
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-gray-900">{number.operatorName}</p>
                <p className="text-sm text-gray-600">{number.phone}</p>
                <p className="text-xs text-gray-400">{number.ownerName}</p>
              </div>
              <ArrowRight className="h-5 w-5 text-[#00CC2C]" />
            </button>
          ))
        )}
      </div>
    </div>
  );

  // ── STEP 3: Manual deposit form ────────────────────────────────────────────
  if (step === "form" && selectedNumber) return (
    <div className="min-h-screen bg-white">
      <header className="flex items-center justify-between px-4 py-4 bg-white border-b border-gray-100">
        <button className="flex items-center gap-1 text-gray-800" onClick={() => setStep("select")}>
          <ChevronLeft className="w-5 h-5" />
          <span className="font-semibold text-base">Confirm payment</span>
        </button>
      </header>

      <div className="p-4 space-y-4 pb-10">
        <div className="rounded-xl border border-orange-100 bg-orange-50 p-4 flex items-center gap-3">
          {selectedNumber.logoUrl ? (
            <img src={selectedNumber.logoUrl} alt={selectedNumber.operatorName} className="w-10 h-10 rounded-lg object-contain" />
          ) : (
            <div className="w-10 h-10 rounded-lg bg-white flex items-center justify-center border border-orange-100">
              <Phone className="w-5 h-5 text-[#00CC2C]" />
            </div>
          )}
          <div className="flex-1">
            <p className="text-xs text-gray-500">Recipient number</p>
            <p className="font-bold text-[#00CC2C] text-sm">{selectedNumber.operatorName} — {selectedNumber.phone}</p>
            <p className="text-xs text-gray-500">{selectedNumber.ownerName}</p>
          </div>
           <div className="text-right">
             <p className="text-xs text-gray-500">Montant à envoyer</p>
             <DepositAmountDisplay
               amount={convertedDepositAmount}
               amountClassName="font-bold text-gray-800"
               buttonClassName="text-gray-700"
               testId="button-copy-deposit-amount-form"
             />
           </div>
        </div>

        <div>
          <p className="text-sm font-semibold text-gray-800 mb-2">Votre numéro de paiement</p>
          <div className="border border-gray-300 rounded-md flex items-center overflow-hidden bg-white">
            <Phone className="w-4 h-4 text-gray-400 ml-4" />
            <input
              type="tel"
              value={senderPhone}
              onChange={(e) => setSenderPhone(e.target.value)}
              placeholder="Numéro utilisé pour le paiement"
              className="flex-1 px-3 py-4 text-sm text-gray-700 outline-none bg-transparent"
            />
          </div>
        </div>

        <div>
          <p className="text-sm font-semibold text-gray-800 mb-2">Référence / ID de transaction <span className="text-gray-400 font-normal">(facultatif)</span></p>
          <input
            type="text"
            value={reference}
            onChange={(e) => setReference(e.target.value)}
            placeholder="Numéro de référence de la transaction"
            className="w-full border border-gray-300 rounded-md px-4 py-4 text-sm text-gray-700 outline-none bg-white"
          />
        </div>

        <div>
          <p className="text-sm font-semibold text-gray-800 mb-2">Message reçu après le paiement <span className="text-gray-400 font-normal">(facultatif)</span></p>
          <textarea
            value={paymentMessage}
            onChange={(e) => setPaymentMessage(e.target.value)}
            placeholder="Collez ici le SMS ou le message de confirmation reçu..."
            rows={3}
            className="w-full border border-gray-300 rounded-md px-4 py-3 text-sm text-gray-700 outline-none bg-white resize-none"
          />
        </div>

        <div>
          <p className="text-sm font-semibold text-gray-800 mb-2">Capture du paiement <span className="text-red-500">*</span></p>
          <input ref={fileInputRef} type="file" accept="image/*" onChange={handleFileChange} className="hidden" />
          <button
            onClick={() => fileInputRef.current?.click()}
            className={`w-full border-2 border-dashed rounded-xl py-7 flex flex-col items-center gap-2 transition-colors ${
              screenshot ? "border-green-400 bg-green-50" : "border-gray-300 bg-gray-50 hover:border-[#00CC2C] hover:bg-green-50"
            }`}
          >
            {screenshot ? (
              <><CheckCircle className="w-8 h-8 text-green-500" /><p className="text-sm font-medium text-green-600">{screenshotName}</p><p className="text-xs text-gray-400">Tap to change</p></>
            ) : (
              <><ImageIcon className="w-8 h-8 text-gray-400" /><p className="text-sm font-medium text-gray-600">Tap to add a screenshot</p><p className="text-xs text-gray-400">JPG, PNG — max 5 MB</p></>
            )}
          </button>
          {screenshot && (
            <div className="mt-3 rounded-xl overflow-hidden border border-gray-100">
              <img src={screenshot} alt="Screenshot" className="w-full max-h-52 object-contain bg-gray-50" />
            </div>
          )}
        </div>

        <button
          onClick={handleSubmit}
          disabled={depositMutation.isPending}
          className="w-full py-5 rounded-full text-white font-bold text-base shadow-lg disabled:opacity-50"
          style={{ background: TELD_GRADIENT }}
        >
          {depositMutation.isPending ? (
            <span className="flex items-center justify-center gap-2"><Loader2 className="w-5 h-5 animate-spin" /> Sending...</span>
          ) : (
            <span className="flex items-center justify-center gap-2"><Upload className="w-5 h-5" /> Soumettre ma demande</span>
          )}
        </button>
      </div>
    </div>
  );

  // ── WESTPAY: Confirm + redirect ────────────────────────────────────────────
  if (step === "westpay") return (
    <div className="min-h-screen bg-white">
      <header className="flex items-center justify-between px-4 py-4 bg-white border-b border-gray-100">
        <button className="flex items-center gap-1 text-gray-800" onClick={() => setStep("select")}>
          <ChevronLeft className="w-5 h-5" />
          <span className="font-semibold text-base">{westpayChannelName}</span>
        </button>
      </header>

      <div className="p-4 space-y-5 pb-10">
        {/* Amount recap */}
        <div className="mx-0 rounded-xl p-4 border border-orange-100 bg-orange-50 flex items-center justify-between">
          <div>
            <p className="text-xs text-gray-500">Montant à envoyer</p>
            <DepositAmountDisplay
              amount={convertedDepositAmount}
              amountClassName="text-xl font-bold text-[#00CC2C]"
              buttonClassName="text-[#00CC2C]"
              testId="button-copy-deposit-amount-westpay"
            />
          </div>
          <button onClick={() => setStep("amount")} className="text-xs text-[#00CC2C] underline">Edit</button>
        </div>

        {/* Info card */}
        <div className="rounded-xl border border-gray-100 bg-gray-50 p-4 space-y-2">
          <div className="flex items-center gap-2">
            <Zap className="w-5 h-5 text-[#00CC2C]" />
          <p className="font-semibold text-gray-900 text-sm">How does it work?</p>
          </div>
          <p className="text-xs text-gray-600 leading-relaxed">
            1. Click <strong>Pay with {westpayChannelName}</strong> — you will be redirected to the secure payment page.
          </p>
          <p className="text-xs text-gray-600 leading-relaxed">
            2. Saisissez votre numéro Mobile Money et confirmez le paiement USSD depuis votre téléphone.
          </p>
          <p className="text-xs text-gray-600 leading-relaxed">
            3. After payment, you will be redirected here automatically. Your balance is credited after confirmation.
          </p>
        </div>

        <button
          onClick={() => wpInitiateMutation.mutate()}
          disabled={wpInitiateMutation.isPending}
          className="w-full py-5 rounded-full text-white font-bold text-base shadow-lg disabled:opacity-40 flex items-center justify-center gap-2"
          style={{ background: TELD_GRADIENT }}
        >
          {wpInitiateMutation.isPending ? (
            <><Loader2 className="w-5 h-5 animate-spin" /> Redirecting...</>
          ) : (
            <><ExternalLink className="w-5 h-5" /> Pay with {westpayChannelName}</>
          )}
        </button>

        <p className="text-xs text-center text-gray-400">
          Secure payment via {westpayChannelName} — USSD Mobile Money
        </p>
      </div>
    </div>
  );

  // ── ASHTECHPAY: Select country + operator ─────────────────────────────────
  if (step === "ashtech-operator") return (
    <div className="min-h-screen bg-white">
      <header className="flex items-center justify-between px-4 py-4 bg-white border-b border-gray-100">
        <button className="flex items-center gap-1 text-gray-800" onClick={() => setStep("select")}>
          <ChevronLeft className="w-5 h-5" />
          <span className="font-semibold text-base">{ashtechChannelName}</span>
        </button>
        <Link href="/history"><button className="text-xs text-[#00CC2C] font-semibold px-3 py-1.5 rounded-full border border-[#00CC2C]">History</button></Link>
      </header>
      <div className="mx-4 mt-4 rounded-xl p-4 border border-orange-100 bg-orange-50 flex items-center justify-between">
        <div>
          <p className="text-xs text-gray-500">Montant à envoyer</p>
          <DepositAmountDisplay
            amount={convertedDepositAmount}
            amountClassName="text-xl font-bold text-[#00CC2C]"
            buttonClassName="text-[#00CC2C]"
            testId="button-copy-deposit-amount-ashtech"
          />
        </div>
        <button onClick={() => setStep("amount")} className="text-xs text-[#00CC2C] underline">Edit</button>
      </div>
      <div className="p-4 space-y-4 pb-10">
        <div>
          <p className="text-sm font-semibold text-gray-800 mb-2">Country</p>
           {ashtechCountriesLoading ? <RefreshLoader /> : (
            <select value={ashtechCountry} onChange={(e) => { setAshtechCountry(e.target.value); setAshtechOperator(""); }}
              className="w-full border border-gray-300 rounded-md px-4 py-4 text-sm text-gray-700 outline-none bg-white appearance-none">
              {availableAshtechCountries.map(c => <option key={c.code} value={c.code}>{c.name} ({DISPLAY_CURRENCY})</option>)}
            </select>
          )}
        </div>
        <div>
          <p className="text-sm font-semibold text-gray-800 mb-2">Numéro Mobile Money</p>
          <div className="border border-gray-300 rounded-md flex items-center overflow-hidden bg-white">
            <Phone className="w-4 h-4 text-gray-400 ml-4 flex-shrink-0" />
            <input type="tel" inputMode="numeric" value={ashtechPhone} onChange={(e) => setAshtechPhone(e.target.value)}
              placeholder="Votre numéro Mobile Money" className="flex-1 px-3 py-4 text-sm text-gray-700 outline-none bg-transparent" />
          </div>
        </div>
        <div>
          <p className="text-sm font-semibold text-gray-800 mb-2">Opérateur Mobile Money</p>
          {ashtechOperators.length === 0 ? <p className="text-sm text-gray-400 text-center py-5">No operator available for this country</p> : (
            <div className="space-y-2">
              {ashtechOperators.map((operator, index) => {
                const name = typeof operator === "string" ? operator : (operator.name || operator.code || `Operator ${index + 1}`);
                return <button key={`${name}-${index}`} onClick={() => setAshtechOperator(name)}
                  className={`w-full flex items-center justify-between px-4 py-4 rounded-xl border-2 ${ashtechOperator === name ? "border-[#00CC2C] bg-green-50" : "border-gray-200 bg-white"}`}>
                  <span className="font-semibold text-gray-900 text-sm">{name}</span>
                  {ashtechOperator === name && <CheckCircle className="w-5 h-5 text-[#00CC2C]" />}
                </button>;
              })}
            </div>
          )}
        </div>
        <button onClick={() => ashtechCollectMutation.mutate(undefined)} disabled={!ashtechOperator || !ashtechPhone.trim() || ashtechCollectMutation.isPending}
          className="w-full py-5 rounded-full text-white font-bold text-base shadow-lg disabled:opacity-40" style={{ background: TELD_GRADIENT }}>
          {ashtechCollectMutation.isPending ? <span className="flex items-center justify-center gap-2"><Loader2 className="w-5 h-5 animate-spin" /> Initiating...</span> : "Initiate payment"}
        </button>
      </div>
    </div>
  );

  // ── ASHTECHPAY: OTP screen ────────────────────────────────────────────────
  if (step === "ashtech-otp") return (
    <div className="min-h-screen bg-white">
      <header className="flex items-center gap-2 px-4 py-4 bg-white border-b border-gray-100">
        <button onClick={() => setStep("ashtech-operator")} className="flex items-center gap-1 text-gray-800"><ChevronLeft className="w-5 h-5" /><span className="font-semibold text-base">Code OTP</span></button>
      </header>
      <div className="p-4 space-y-5 pb-10">
        <div className="rounded-2xl border-2 border-orange-200 bg-orange-50 p-4">
          <p className="font-bold text-gray-900 text-sm mb-2">Dial code</p>
          {ashtechUssdCode && <p className="bg-white rounded-xl border border-orange-200 px-4 py-3 text-center font-mono font-black text-2xl text-[#00CC2C] tracking-widest">{ashtechUssdCode}</p>}
          <p className="text-sm text-gray-600 mt-3">
            {ashtechUssdCode
              ? "Dial this code on your phone to receive the OTP, then enter it below."
              : "An OTP code was sent to you. Enter it below."}
          </p>
        </div>
        <input type="text" inputMode="numeric" value={ashtechOtp} onChange={(e) => setAshtechOtp(e.target.value)} maxLength={8}
          placeholder="OTP code received by SMS" className="w-full border-2 border-gray-200 rounded-xl px-4 py-4 text-center text-2xl tracking-widest font-black text-gray-800 outline-none bg-white focus:border-[#00CC2C]" />
        <button onClick={() => ashtechCollectMutation.mutate(ashtechOtp)} disabled={!ashtechOtp.trim() || ashtechCollectMutation.isPending}
          className="w-full py-5 rounded-full text-white font-bold text-base shadow-lg disabled:opacity-40" style={{ background: TELD_GRADIENT }}>
          {ashtechCollectMutation.isPending ? <span className="flex items-center justify-center gap-2"><Loader2 className="w-5 h-5 animate-spin" /> Verifying...</span> : "Validate OTP code"}
        </button>
      </div>
    </div>
  );

  // ── ASHTECHPAY: Wave redirect ─────────────────────────────────────────────
  if (step === "ashtech-redirect") return (
    <div className="min-h-screen bg-white flex flex-col">
      <header className="flex items-center gap-2 px-4 py-4 bg-white border-b border-gray-100">
        <button onClick={() => setStep("ashtech-operator")} className="flex items-center gap-1 text-gray-800"><ChevronLeft className="w-5 h-5" /><span className="font-semibold text-base">Complete payment</span></button>
      </header>
      <div className="flex-1 flex flex-col items-center justify-center p-6 text-center space-y-6">
        <div className="w-20 h-20 rounded-full bg-orange-100 flex items-center justify-center"><ExternalLink className="w-10 h-10 text-[#00CC2C]" /></div>
        <div>
          <p className="font-bold text-gray-900 text-xl mb-2">Complete with Wave</p>
          <p className="text-sm text-gray-500">Open the Wave page to confirm your deposit of</p>
          <DepositAmountDisplay
            amount={convertedDepositAmount}
            className="justify-center mt-2"
            amountClassName="font-bold text-gray-900"
            buttonClassName="text-gray-700"
            testId="button-copy-deposit-amount-ashtech-redirect"
          />
        </div>
        <a href={ashtechWaveUrl} target="_blank" rel="noopener noreferrer" onClick={() => { setAshtechPolling(true); setStep("ashtech-waiting"); }}
          className="w-full py-5 rounded-full text-white font-bold text-base shadow-lg flex items-center justify-center gap-2" style={{ background: TELD_GRADIENT }}>
          <ExternalLink className="w-5 h-5" /> Open Wave
        </a>
      </div>
    </div>
  );

  // ── ASHTECHPAY: Waiting / polling ─────────────────────────────────────────
  if (step === "ashtech-waiting") return (
    <div className="min-h-screen bg-white flex flex-col">
      <header className="flex items-center gap-2 px-4 py-4 bg-white border-b border-gray-100"><span className="font-semibold text-base text-gray-800">Payment in progress</span></header>
      <div className="flex-1 flex flex-col items-center justify-center p-6 text-center space-y-6">
        <div className="w-20 h-20 rounded-full bg-orange-100 flex items-center justify-center"><RefreshCw className="w-10 h-10 text-[#00CC2C] animate-spin" style={{ animationDuration: "2s" }} /></div>
        <div><p className="font-bold text-gray-900 text-xl">Awaiting confirmation</p><p className="text-sm text-gray-500 mt-2">Confirm the payment on your phone. This page updates automatically.</p></div>
        <div className="flex gap-3 w-full"><Link href="/history" className="flex-1"><button className="w-full py-3 rounded-full border border-[#00CC2C] text-[#00CC2C] font-semibold text-sm">Voir l'historique</button></Link>
          <button onClick={() => { setStep("amount"); setAmount(""); setAshtechDepositId(null); setAshtechPolling(false); setAshtechStatus(""); }} className="flex-1 py-3 rounded-full bg-gray-100 text-gray-600 font-semibold text-sm">Nouvelle recharge</button>
        </div>
      </div>
    </div>
  );

  // ── SENDAVAPAY: Select country + operator ──────────────────────────────────
  if (step === "sv-operator") return (
    <div className="min-h-screen bg-white">
      <header className="flex items-center justify-between px-4 py-4 bg-white border-b border-gray-100">
        <button className="flex items-center gap-1 text-gray-800" onClick={() => setStep("amount")}>
          <ChevronLeft className="w-5 h-5" />
          <span className="font-semibold text-base">Top up</span>
        </button>
        <Link href="/history">
          <button className="text-xs text-[#00CC2C] font-semibold px-3 py-1.5 rounded-full border border-[#00CC2C]">History</button>
        </Link>
      </header>

      {/* Amount recap */}
      <div className="mx-4 mt-4 rounded-xl p-4 border border-orange-100 bg-orange-50 flex items-center justify-between">
         <div>
           <p className="text-xs text-gray-500">Montant à envoyer</p>
           <DepositAmountDisplay
             amount={convertedDepositAmount}
             amountClassName="text-xl font-bold text-[#00CC2C]"
             buttonClassName="text-[#00CC2C]"
             testId="button-copy-deposit-amount-sendava"
           />
         </div>
        <button onClick={() => setStep("amount")} className="text-xs text-[#00CC2C] underline">Edit</button>
      </div>

      <div className="p-4 space-y-4 pb-10">
        {/* Country selector */}
        <div>
          <p className="text-sm font-semibold text-gray-800 mb-2">Country</p>
          <select
            value={svCountry}
            onChange={(e) => { setSvCountry(e.target.value); setSvOperator(null); }}
            className="w-full border border-gray-300 rounded-md px-4 py-4 text-sm text-gray-700 outline-none bg-white appearance-none"
          >
            {apiCountries.filter(c => c.isActive).map((c: any) => (
              <option key={c.code} value={c.code}>{c.name}</option>
            ))}
          </select>
        </div>

        {/* Phone number */}
        <div>
          <p className="text-sm font-semibold text-gray-800 mb-2">Numéro Mobile Money</p>
          <div className="border border-gray-300 rounded-md flex items-center overflow-hidden bg-white">
            <Phone className="w-4 h-4 text-gray-400 ml-4 flex-shrink-0" />
            <input
              type="tel"
              inputMode="numeric"
              value={svPhone}
              onChange={(e) => setSvPhone(e.target.value)}
              placeholder="Numéro qui recevra la demande"
              className="flex-1 px-3 py-4 text-sm text-gray-700 outline-none bg-transparent"
            />
          </div>
        </div>

        {/* Operator selector */}
        <div>
          <p className="text-sm font-semibold text-gray-800 mb-2">Opérateur Mobile Money</p>
          {svOperatorsLoading ? (
            <div className="flex items-center justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin text-[#00CC2C]" />
            </div>
          ) : svOperators.length === 0 ? (
            <div className="text-center py-8 text-gray-400">
              <p className="text-sm">No operator available for this country</p>
            </div>
          ) : (
            <div className="space-y-2">
              {svOperators.map((op) => {
                const icon = getOperatorIcon(op.name);
                return (
                  <button
                    key={op.id}
                    onClick={() => setSvOperator(op)}
                    className={`w-full flex items-center justify-between px-4 py-4 rounded-xl border-2 transition-all ${
                      svOperator?.id === op.id
                        ? "border-[#00CC2C] bg-green-50"
                        : "border-gray-200 bg-white hover:border-green-200"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      {icon ? (
                        <img src={icon} alt={op.name} className="w-10 h-10 rounded-full object-cover border border-gray-100" />
                      ) : (
                        <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm ${
                          svOperator?.id === op.id ? "bg-[#00CC2C] text-white" : "bg-gray-100 text-gray-600"
                        }`}>
                          {op.name.charAt(0)}
                        </div>
                      )}
                      <div className="text-left">
                        <p className="font-semibold text-gray-900 text-sm">{op.name}</p>
                        {op.requiresOtp && <p className="text-xs text-[#00CC2C]">OTP code required</p>}
                      </div>
                    </div>
                    {svOperator?.id === op.id && <CheckCircle className="w-5 h-5 text-[#00CC2C]" />}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <button
          onClick={() => svInitiateMutation.mutate()}
          disabled={!svOperator || svInitiateMutation.isPending}
          className="w-full py-5 rounded-full text-white font-bold text-base shadow-lg disabled:opacity-40"
            style={{ background: TELD_GRADIENT }}
        >
          {svInitiateMutation.isPending ? (
            <span className="flex items-center justify-center gap-2"><Loader2 className="w-5 h-5 animate-spin" /> Initiating...</span>
          ) : (
            <span className="flex items-center justify-center gap-2"><img src="/topup-icon.png" className="w-6 h-6 object-contain" alt="topup" /> Initiate payment</span>
          )}
        </button>
      </div>
    </div>
  );

  // ── SENDAVAPAY: OTP screen ─────────────────────────────────────────────────
  if (step === "sv-otp") return (
    <div className="min-h-screen bg-white">
      <header className="flex items-center gap-2 px-4 py-4 bg-white border-b border-gray-100">
        <button onClick={() => setStep("sv-operator")} className="flex items-center gap-1 text-gray-800">
          <ChevronLeft className="w-5 h-5" />
          <span className="font-semibold text-base">Code OTP</span>
        </button>
      </header>

      <div className="p-4 space-y-5 pb-10">

        {/* Step 1 — Dial USSD code */}
        <div className="rounded-2xl border-2 border-orange-200 bg-orange-50 p-4">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-7 h-7 rounded-full bg-[#00CC2C] flex items-center justify-center flex-shrink-0">
              <span className="text-white font-bold text-xs">1</span>
            </div>
            <p className="font-bold text-gray-900 text-sm">Dial this code on your phone</p>
          </div>
          {svUssdCode ? (
            <div className="bg-white rounded-xl border border-orange-200 px-4 py-3 text-center">
              <p className="font-mono font-black text-2xl text-[#00CC2C] tracking-widest">{svUssdCode}</p>
              <p className="text-xs text-gray-400 mt-1">Dial this USSD code on your phone</p>
            </div>
          ) : (
            <p className="text-sm text-gray-600">
              Dial your operator's USSD code (e.g.&nbsp;: <span className="font-mono font-bold text-[#00CC2C]">*144#</span>) on your phone to receive the OTP by SMS.
            </p>
          )}
        </div>

        {/* Step 2 — Enter OTP */}
        <div className="rounded-2xl border-2 border-orange-100 bg-orange-50 p-4">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-7 h-7 rounded-full bg-[#00CC2C] flex items-center justify-center flex-shrink-0">
              <span className="text-white font-bold text-xs">2</span>
            </div>
            <p className="font-bold text-gray-900 text-sm">Enter the OTP code received by SMS</p>
          </div>
          <p className="text-xs text-gray-500 mb-3">
            After dialing the code, you will receive an SMS with an OTP code. Enter it below to confirm the payment of{" "}
            <strong>{convertedDepositAmount.toLocaleString("fr-FR")} F CFA</strong>.
          </p>
          <input
            type="text"
            inputMode="numeric"
            value={svOtp}
            onChange={(e) => setSvOtp(e.target.value)}
            placeholder="OTP code received by SMS"
            className="w-full border-2 border-gray-200 rounded-xl px-4 py-4 text-center text-2xl tracking-widest font-black text-gray-800 outline-none bg-white focus:border-[#00CC2C]"
            maxLength={8}
          />
        </div>

        <button
          onClick={() => svOtpMutation.mutate()}
          disabled={!svOtp.trim() || svOtpMutation.isPending}
          className="w-full py-5 rounded-full text-white font-bold text-base shadow-lg disabled:opacity-40"
          style={{ background: TELD_GRADIENT }}
        >
          {svOtpMutation.isPending ? (
            <span className="flex items-center justify-center gap-2"><Loader2 className="w-5 h-5 animate-spin" /> Verifying...</span>
          ) : "Validate OTP code"}
        </button>
      </div>
    </div>
  );

  // ── SENDAVAPAY: Redirect screen (Wave, etc.) ──────────────────────────────
  if (step === "sv-redirect") return (
    <div className="min-h-screen bg-white flex flex-col">
      <header className="flex items-center gap-2 px-4 py-4 bg-white border-b border-gray-100">
        <button onClick={() => setStep("sv-operator")} className="flex items-center gap-1 text-gray-800">
          <ChevronLeft className="w-5 h-5" />
          <span className="font-semibold text-base">Complete payment</span>
        </button>
      </header>

      <div className="flex-1 flex flex-col items-center justify-center p-6 text-center space-y-6">
        <div className="w-20 h-20 rounded-full bg-orange-100 flex items-center justify-center">
          <ExternalLink className="w-10 h-10 text-[#00CC2C]" />
        </div>
        <div>
          <p className="font-bold text-gray-900 text-xl mb-2">Complete in the app</p>
          <p className="text-sm text-gray-500">
            Tap the button below to open the operator's payment page and confirm your deposit of
          </p>
          <DepositAmountDisplay
            amount={convertedDepositAmount}
            className="justify-center"
            amountClassName="font-bold text-gray-900"
            buttonClassName="text-gray-700"
            testId="button-copy-deposit-amount-sendava-redirect"
          />
        </div>
        <a
          href={svRedirectUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="w-full py-5 rounded-full text-white font-bold text-base shadow-lg flex items-center justify-center gap-2"
           style={{ background: TELD_GRADIENT }}
          onClick={() => { setSvPolling(true); setStep("sv-waiting"); }}
        >
          <ExternalLink className="w-5 h-5" /> Open payment page
        </a>
      </div>
    </div>
  );

  // ── SENDAVAPAY: Waiting / polling screen ────────────────────────────────────
  if (step === "sv-waiting") return (
    <div className="min-h-screen bg-white flex flex-col">
      <header className="flex items-center gap-2 px-4 py-4 bg-white border-b border-gray-100">
        <span className="font-semibold text-base text-gray-800">Payment in progress</span>
      </header>

      <div className="flex-1 flex flex-col items-center justify-center p-6 text-center space-y-6">
        {svStatus === "approved" ? (
          <>
            <div className="w-20 h-20 rounded-full bg-green-100 flex items-center justify-center">
              <CheckCircle className="w-10 h-10 text-green-500" />
            </div>
            <div>
              <p className="font-bold text-gray-900 text-xl">Payment confirmed!</p>
               <p className="text-sm text-gray-500 mt-1">
                 Your balance has been credited with <strong>{Number(amount || 0).toLocaleString("fr-FR")} GPB</strong>.
               </p>
            </div>
          </>
        ) : svStatus === "rejected" ? (
          <>
            <div className="w-20 h-20 rounded-full bg-red-100 flex items-center justify-center">
              <RefreshCw className="w-10 h-10 text-red-400" />
            </div>
            <div>
              <p className="font-bold text-gray-900 text-xl">Payment failed</p>
              <p className="text-sm text-gray-500 mt-1">The payment was declined or canceled.</p>
            </div>
            <div className="flex gap-3 w-full">
              {svPaymentToken && (
                <button
                  onClick={() => svRetryMutation.mutate()}
                  disabled={svRetryMutation.isPending}
                  className="flex-1 py-3 rounded-full text-white font-semibold text-sm flex items-center justify-center gap-2 disabled:opacity-50"
                   style={{ background: TELD_GRADIENT }}
                >
                  {svRetryMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                  Try again
                </button>
              )}
              <button
                onClick={() => { setStep("amount"); setAmount(""); setSvOperator(null); setSvDepositId(null); setSvPaymentToken(""); setSvPolling(false); setSvStatus(""); }}
                className="flex-1 py-3 rounded-full bg-gray-100 text-gray-600 font-semibold text-sm"
              >
                Nouvelle recharge
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="w-20 h-20 rounded-full bg-orange-100 flex items-center justify-center">
              <RefreshCw className="w-10 h-10 text-[#00CC2C] animate-spin" style={{ animationDuration: "2s" }} />
            </div>
            <div>
              <p className="font-bold text-gray-900 text-xl">Awaiting confirmation</p>
              <p className="text-sm text-gray-500 mt-2">
                A payment request for <strong>{convertedDepositAmount.toLocaleString("fr-FR")} F CFA</strong> was sent to your phone.<br />
                Accept it on your phone. This page updates automatically.
              </p>
            </div>
            <div className="flex gap-3 w-full">
              <Link href="/history" className="flex-1">
                <button className="w-full py-3 rounded-full border border-[#00CC2C] text-[#00CC2C] font-semibold text-sm">
                  Voir l'historique
                </button>
              </Link>
              <button
                onClick={() => { setStep("amount"); setAmount(""); setSvOperator(null); setSvDepositId(null); setSvPaymentToken(""); setSvPolling(false); setSvStatus(""); }}
                className="flex-1 py-3 rounded-full bg-gray-100 text-gray-600 font-semibold text-sm"
              >
                Nouvelle recharge
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );

  return null;
}
