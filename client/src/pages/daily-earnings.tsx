import { useMemo } from "react";
import { useAuth } from "@/lib/auth";
import { useLocation } from "wouter";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { CheckCircle2, ChevronLeft, Clock3, Coins, Loader2 } from "lucide-react";
import { getCompanyProductImage } from "@/lib/product-images";
import { formatCompanyProductName } from "@/lib/product-names";
import RefreshLoader from "@/components/refresh-loader";

interface PurchasedProduct {
  id: number;
  productId: number;
  purchasedAt: string;
  lastEarningDate?: string | null;
  daysRemaining: number;
  totalEarned: string;
  status: "active" | "completed";
  product: {
    id: number;
    name: string;
    price: number;
    dailyEarnings: number;
    cycleDays: number;
    totalReturn: number;
  };
}

const DAY_MS = 24 * 60 * 60 * 1000;

function formatAmount(amount: number) {
  return `${Math.round(amount).toLocaleString("fr-FR")} GPB`;
}

function formatDate(dateString?: string | null) {
  if (!dateString) return "-";
  return new Date(dateString).toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

export default function DailyEarningsPage() {
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const { toast } = useToast();

  const { data: products = [], isLoading } = useQuery<PurchasedProduct[]>({
    queryKey: ["/api/user/products"],
    refetchInterval: 60000,
    staleTime: 0,
  });

  const collectMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/user/collect-earnings", {});
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.message || "Impossible de collecter les gains");
      }
      return data as { collected: number; productsCollected: number };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/user/products"] });
      queryClient.invalidateQueries({ queryKey: ["/api/user"] });
      if (data.collected > 0) {
        toast({
          title: "Gains collectés",
          description: `${formatAmount(data.collected)} ajoutés à votre solde.`,
        });
      } else {
        toast({
          title: "Aucun gain disponible",
          description: "La prochaine collecte sera disponible après 24 heures.",
        });
      }
    },
    onError: (error: Error) => {
      toast({ title: "Erreur", description: error.message, variant: "destructive" });
    },
  });

  const now = Date.now();
  const activeProducts = products.filter((item) => item.status === "active" && item.daysRemaining > 0);

  const productCollectionInfo = (item: PurchasedProduct) => {
    const lastCollection = item.lastEarningDate || item.purchasedAt;
    const elapsed = Math.max(0, now - new Date(lastCollection).getTime());
    const availableCycles = Math.min(Math.floor(elapsed / DAY_MS), item.daysRemaining);
    return {
      availableCycles,
      availableAmount: availableCycles * item.product.dailyEarnings,
      nextCollectionAt: new Date(new Date(lastCollection).getTime() + DAY_MS),
    };
  };

  const { availableAmount, availableProducts, nextCollectionAt } = useMemo(() => {
    let total = 0;
    let ready = 0;
    let next: Date | null = null;

    for (const product of activeProducts) {
      const info = productCollectionInfo(product);
      total += info.availableAmount;
      if (info.availableCycles > 0) ready += 1;
      if (info.availableCycles === 0 && (!next || info.nextCollectionAt < next)) {
        next = info.nextCollectionAt;
      }
    }

    return { availableAmount: total, availableProducts: ready, nextCollectionAt: next };
  }, [activeProducts, now]);

  if (!user) return null;

  return (
    <main className="daily-earnings-page min-h-full bg-[#D9D9D9] bottom-nav-clearance">
      <style>{`
        .daily-earnings-page {
          color: #151515;
          font-family: Arial, Helvetica, sans-serif;
        }
        .daily-earnings-page .daily-screen {
          width: 100%;
          max-width: 500px;
          min-height: calc(100dvh - 59px);
          margin: 0 auto;
        }
        .daily-earnings-page .daily-header {
          display: flex;
          height: 74px;
          align-items: center;
          gap: 10px;
          border-bottom: 1px solid #e3eeee;
          padding: 0 18px;
          background: #EAEAEA;
        }
        .daily-earnings-page .back-button {
          display: grid;
          width: 40px;
          height: 40px;
          place-items: center;
          border: 0;
          border-radius: 50%;
          background: #effafa;
          color: #C00000;
        }
        .daily-earnings-page .back-button svg {
          width: 23px;
          height: 23px;
        }
        .daily-earnings-page .daily-title {
          margin: 0;
          color: #C00000;
          font-size: 21px;
          font-weight: 700;
        }
        .daily-earnings-page .daily-content {
          padding: 18px 16px 28px;
        }
        .daily-earnings-page .summary-card {
          overflow: hidden;
          border-radius: 16px;
          padding: 20px;
          background: linear-gradient(112deg, #FF0000 0%, #C00000 100%);
          color: white;
          box-shadow: 0 4px 12px rgba(0, 126, 149, .18);
        }
        .daily-earnings-page .summary-label {
          margin: 0;
          font-size: 14px;
          opacity: .88;
        }
        .daily-earnings-page .summary-amount {
          margin: 8px 0 0;
          font-size: 30px;
          font-weight: 700;
          line-height: 1.1;
        }
        .daily-earnings-page .summary-copy {
          margin: 9px 0 0;
          font-size: 12px;
          line-height: 1.4;
          opacity: .9;
        }
        .daily-earnings-page .collect-button {
          display: flex;
          width: 100%;
          height: 48px;
          align-items: center;
          justify-content: center;
          gap: 8px;
          margin-top: 18px;
          border: 0;
          border-radius: 24px;
          background: #EAEAEA;
          color: #C00000;
          font-size: 16px;
          font-weight: 700;
          box-shadow: 0 2px 5px rgba(0, 0, 0, .12);
        }
        .daily-earnings-page .collect-button:disabled {
          cursor: not-allowed;
          background: rgba(255, 255, 255, .5);
          color: rgba(255, 255, 255, .9);
          box-shadow: none;
        }
        .daily-earnings-page .section-title {
          margin: 24px 0 11px;
          color: #222;
          font-size: 17px;
          font-weight: 700;
        }
        .daily-earnings-page .product-card {
          display: flex;
          align-items: center;
          gap: 12px;
          margin-top: 10px;
          border: 1px solid #e2eeee;
          border-radius: 13px;
          padding: 12px;
          background: #EAEAEA;
          box-shadow: 0 1px 4px rgba(0, 126, 149, .06);
        }
        .daily-earnings-page .product-image {
          width: 64px;
          height: 64px;
          flex: 0 0 auto;
          overflow: hidden;
          border-radius: 10px;
          background: #edf8f8;
        }
        .daily-earnings-page .product-image img {
          display: block;
          width: 100%;
          height: 100%;
          object-fit: cover;
        }
        .daily-earnings-page .product-copy {
          min-width: 0;
          flex: 1;
        }
        .daily-earnings-page .product-name {
          overflow: hidden;
          margin: 0;
          color: #222;
          font-size: 16px;
          font-weight: 700;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .daily-earnings-page .product-meta {
          margin: 5px 0 0;
          color: #6a7475;
          font-size: 12px;
          line-height: 1.35;
        }
        .daily-earnings-page .product-earning {
          margin: 5px 0 0;
          color: #C00000;
          font-size: 14px;
          font-weight: 700;
        }
        .daily-earnings-page .product-status {
          flex: 0 0 auto;
          color: #718080;
          font-size: 11px;
          text-align: right;
        }
        .daily-earnings-page .product-status.ready {
          color: #C00000;
          font-weight: 700;
        }
        .daily-earnings-page .empty-state {
          border: 1px dashed #b8d8da;
          border-radius: 13px;
          padding: 28px 18px;
          background: #EAEAEA;
          color: #697778;
          font-size: 14px;
          text-align: center;
        }
        .daily-earnings-page .empty-state svg {
          display: block;
          width: 30px;
          height: 30px;
          margin: 0 auto 9px;
          color: #FF0000;
        }
      `}</style>

      <div className="daily-screen">
        <header className="daily-header">
          <button
            type="button"
            className="back-button"
            onClick={() => navigate("/account")}
            aria-label="Retour à Mon compte"
            data-testid="button-back-account"
          >
            <ChevronLeft aria-hidden="true" />
          </button>
           <h1 className="daily-title">Mission</h1>
        </header>

        <section className="daily-content" aria-label="Collecte quotidienne des gains">
          <div className="summary-card">
            <p className="summary-label">Gains disponibles à collecter</p>
            <p className="summary-amount" data-testid="text-available-earnings">
              {formatAmount(availableAmount)}
            </p>
            <p className="summary-copy">
              Revenez chaque jour pour collecter les revenus générés par vos produits.
            </p>
            <button
              type="button"
              className="collect-button"
              onClick={() => collectMutation.mutate()}
              disabled={collectMutation.isPending || availableProducts === 0}
              data-testid="button-collect-earnings"
            >
              {collectMutation.isPending ? (
                <Loader2 className="animate-spin" />
              ) : (
                <Coins aria-hidden="true" />
              )}
              {availableProducts > 0 ? "Collecter mes gains" : "Pas encore disponible"}
            </button>
          </div>

          {nextCollectionAt && availableProducts === 0 && (
            <p className="mt-3 text-center text-xs text-gray-500">
              Prochaine collecte disponible le {formatDate(nextCollectionAt.toISOString())}.
            </p>
          )}

           <h2 className="section-title">Gains de mes produits</h2>
          {isLoading ? (
            <RefreshLoader />
          ) : activeProducts.length === 0 ? (
            <div className="empty-state">
              <Clock3 aria-hidden="true" />
              Achetez un produit pour commencer à générer des gains quotidiens.
            </div>
          ) : (
            activeProducts.map((item) => {
              const info = productCollectionInfo(item);
              const name = formatCompanyProductName(item.product.name, item.productId);

              return (
                <article className="product-card" key={item.id} data-testid={`daily-product-${item.id}`}>
                  <div className="product-image">
                    <img src={getCompanyProductImage(item.productId - 1)} alt={name} />
                  </div>
                  <div className="product-copy">
                    <p className="product-name">{name}</p>
                    <p className="product-meta">
                      {item.daysRemaining} jour{item.daysRemaining > 1 ? "s" : ""} restant{item.daysRemaining > 1 ? "s" : ""}
                    </p>
                    <p className="product-earning">
                      +{formatAmount(item.product.dailyEarnings)} / jour
                    </p>
                  </div>
                  <div className={`product-status ${info.availableCycles > 0 ? "ready" : ""}`}>
                    {info.availableCycles > 0 ? (
                      <>
                        <CheckCircle2 className="mx-auto mb-1 h-4 w-4" />
                        Disponible
                      </>
                    ) : (
                      <>
                        <Clock3 className="mx-auto mb-1 h-4 w-4" />
                        Demain
                      </>
                    )}
                  </div>
                </article>
              );
            })
          )}
        </section>
      </div>
    </main>
  );
}