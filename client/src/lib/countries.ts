// Fallback country data (used if API not available)
export const COUNTRIES = [
  { code: "TG", name: "Togo", flag: "TG", currency: "XOF", paymentMethods: ["T-Money", "Moov Money"] },
  { code: "BJ", name: "Benin", flag: "BJ", currency: "XOF", paymentMethods: ["MTN", "Moov Money"] },
  { code: "BF", name: "Burkina Faso", flag: "BF", currency: "XOF", paymentMethods: ["Orange Money", "Moov Money", "Wave"] },
  { code: "CI", name: "Ivory Coast", flag: "CI", currency: "XOF", paymentMethods: ["Orange Money", "MTN", "Moov Money", "Wave"] },
  { code: "CM", name: "Cameroon", flag: "CM", currency: "XAF", paymentMethods: ["MTN", "Orange Money"] },
];

export const DISPLAY_CURRENCY = "GPB";

export const FALLBACK_COUNTRIES = [
  { code: "TG", name: "Togo", currency: "XOF", phonePrefix: "228", operators: ["T-Money", "Moov Money"] },
  { code: "BJ", name: "Benin", currency: "XOF", phonePrefix: "229", operators: ["MTN", "Moov Money"] },
  { code: "BF", name: "Burkina Faso", currency: "XOF", phonePrefix: "226", operators: ["Orange Money", "Moov Money", "Wave"] },
  { code: "CI", name: "Ivory Coast", currency: "XOF", phonePrefix: "225", operators: ["Orange Money", "MTN", "Moov Money", "Wave"] },
  { code: "CM", name: "Cameroon", currency: "XAF", phonePrefix: "237", operators: ["MTN", "Orange Money"] },
];

// Legacy compatibility - kept for places still using ELIGIBLE_COUNTRIES directly
export const ELIGIBLE_COUNTRIES = FALLBACK_COUNTRIES.map(c => ({
  code: c.code,
  name: c.name,
  flag: c.code,
  currency: c.currency,
  phonePrefix: c.phonePrefix,
  paymentMethods: c.operators,
})) as readonly { code: string; name: string; flag: string; currency: string; phonePrefix: string; paymentMethods: readonly string[] }[];

export type ApiCountry = {
  id: number;
  code: string;
  name: string;
  currency: string;
  phonePrefix: string;
  operators: string; // JSON string
  isActive: boolean;
};

export function parseOperators(operatorsJson: string): string[] {
  try {
    return JSON.parse(operatorsJson);
  } catch {
    return [];
  }
}

export function getCountryByCode(code: string, apiCountries?: ApiCountry[]) {
  if (apiCountries && apiCountries.length > 0) {
    // API data is loaded — only use it, never fall back to hardcoded data
    // This ensures disabled countries and updated operators are respected
    const c = apiCountries.find(c => c.code === code && c.isActive);
    if (!c) return undefined;
    return {
      code: c.code,
      name: c.name,
      currency: c.currency,
      phonePrefix: c.phonePrefix,
      paymentMethods: parseOperators(c.operators),
    };
  }
  // API not yet loaded — use hardcoded fallback temporarily
  const fallback = FALLBACK_COUNTRIES.find(c => c.code === code);
  if (!fallback) return undefined;
  return {
    code: fallback.code,
    name: fallback.name,
    currency: fallback.currency,
    phonePrefix: fallback.phonePrefix,
    paymentMethods: fallback.operators,
  };
}

export function getPaymentMethodsForCountry(code: string, apiCountries?: ApiCountry[]): string[] {
  const country = getCountryByCode(code, apiCountries);
  return country ? [...country.paymentMethods] : [];
}

export function formatCurrency(amount: number, countryCode: string, apiCountries?: ApiCountry[]): string {
  const country = getCountryByCode(countryCode, apiCountries);
  return `${amount.toLocaleString()} ${DISPLAY_CURRENCY}`;
}
