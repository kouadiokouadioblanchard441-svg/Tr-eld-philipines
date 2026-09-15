import { useState } from "react";
import { Check, Copy } from "lucide-react";

interface DepositAmountDisplayProps {
  amount: number;
  className?: string;
  amountClassName?: string;
  buttonClassName?: string;
  disabled?: boolean;
  testId?: string;
}

export default function DepositAmountDisplay({
  amount,
  className = "",
  amountClassName = "",
  buttonClassName = "",
  disabled = false,
  testId,
}: DepositAmountDisplayProps) {
  const [copied, setCopied] = useState(false);

  const copyAmount = async () => {
    if (disabled) return;
    try {
      await navigator.clipboard.writeText(String(amount));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard access can be unavailable in some embedded browsers.
    }
  };

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <strong className={amountClassName}>
        {amount.toLocaleString("fr-FR")} F CFA
      </strong>
      <button
        type="button"
        onClick={copyAmount}
        disabled={disabled}
        aria-label={copied ? "Montant copié" : "Copier le montant en FCFA"}
        title={copied ? "Montant copié" : "Copier le montant"}
        data-testid={testId}
        className={`inline-flex items-center justify-center rounded-md p-1.5 text-current transition hover:bg-black/5 disabled:cursor-not-allowed disabled:opacity-40 ${buttonClassName}`}
      >
        {copied ? <Check className="h-4 w-4" aria-hidden="true" /> : <Copy className="h-4 w-4" aria-hidden="true" />}
      </button>
    </div>
  );
}