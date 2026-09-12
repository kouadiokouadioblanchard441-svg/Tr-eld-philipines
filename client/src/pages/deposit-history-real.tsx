import emptyIllustration from "@assets/illustration-8_1784762965573.png";
import { useAuth } from "@/lib/auth";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import { Link } from "wouter";
import { getCountryByCode } from "@/lib/countries";
import { Skeleton } from "@/components/ui/skeleton";
import RefreshLoader from "@/components/refresh-loader";

interface Deposit {
  id: number;
  userId: number;
  amount: string;
  status: string;
  createdAt: string;
}

export default function DepositHistoryRealPage() {
  const { user } = useAuth();
  const countryInfo = user ? getCountryByCode(user.country) : null;
  const currency = "GPB";

  const { data: deposits = [], isLoading } = useQuery<Deposit[]>({
    queryKey: ["/api/deposits/history"],
  });

  const getStatusColor = (status: string) => {
    switch (status) {
      case "approved":
        return "text-green-600 bg-green-100";
      case "pending":
        return "text-orange-600 bg-orange-100";
      case "rejected":
        return "text-red-600 bg-red-100";
      default:
        return "text-gray-600 bg-gray-100";
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case "approved":
        return "Approuvé";
      case "pending":
        return "En attente";
      case "rejected":
        return "Rejete";
      default:
        return status;
    }
  };

  return (
    <div className="min-h-screen" style={{ backgroundColor: "#f5f0e8" }}>
      <header className="flex items-center px-4 py-3 border-b bg-white">
        <Link href="/account">
          <button className="p-2" data-testid="button-back">
            <ArrowLeft className="w-5 h-5 text-gray-700" />
          </button>
        </Link>
        <h1 className="flex-1 text-center text-lg font-semibold text-gray-800 pr-8">Deposit history</h1>
      </header>

      <div className="p-4 space-y-4">
        {isLoading ? (
          <RefreshLoader />
        ) : deposits.length === 0 ? (
          <div className="text-center py-10 flex flex-col items-center gap-3">
            <img src={emptyIllustration} alt="Aucun dépôt" className="w-40 h-40 object-contain opacity-90" />
            <p className="text-gray-500">Aucun dépôt effectué</p>
          </div>
        ) : (
          deposits.map((deposit) => {
            const date = new Date(deposit.createdAt);
            return (
              <div
                key={deposit.id}
                className="bg-white rounded-lg p-4 border"
                data-testid={`deposit-item-${deposit.id}`}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-semibold text-gray-900">
                      {parseFloat(deposit.amount).toLocaleString()} {currency}
                    </p>
                    <p className="text-sm text-gray-500">
                      {date.toLocaleDateString('fr-FR')} à {date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>
                  <span className={`px-3 py-1 rounded-full text-sm font-medium ${getStatusColor(deposit.status)}`}>
                    {getStatusText(deposit.status)}
                  </span>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
