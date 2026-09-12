import emptyIllustration from "@assets/illustration-8_1784762965573.png";
import { useAuth } from "@/lib/auth";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Loader2 } from "lucide-react";
import { Link } from "wouter";
import RefreshLoader from "@/components/refresh-loader";

interface Transaction {
  id: number;
  type: string;
  amount: string;
  description: string;
  createdAt: string | Date;
}

function formatDateTime(value: string | Date) {
  const date = new Date(value);
  return date.toLocaleDateString("fr-FR", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function EarningsHistoryPage() {
  const { user } = useAuth();
  const { data: transactions = [], isLoading } = useQuery<Transaction[]>({
    queryKey: ["/api/transactions"],
  });

  if (!user) return null;

  const earnings = transactions.filter((transaction) => transaction.type === "earning");

  return (
    <main className="earnings-history-page">
      <style>{`
        .earnings-history-page {
          min-height: 100dvh;
          background: #f5f0e8;
          color: #202020;
          font-family: Arial, Helvetica, sans-serif;
        }
        .earnings-history-page *,
        .earnings-history-page *::before,
        .earnings-history-page *::after {
          box-sizing: border-box;
        }
        .earnings-history-screen {
          width: 100%;
          max-width: 512px;
          min-height: 100dvh;
          margin: 0 auto;
        }
        .earnings-history-header {
          display: flex;
          height: 64px;
          align-items: center;
          border-bottom: 1px solid #e5e5e5;
          padding: 0 16px;
          background: #fff;
        }
        .earnings-history-back {
          display: grid;
          width: 40px;
          height: 40px;
          place-items: center;
          border: 0;
          padding: 0;
          background: transparent;
          color: #202020;
          cursor: pointer;
        }
        .earnings-history-back svg {
          width: 24px;
          height: 24px;
        }
        .earnings-history-title {
          flex: 1;
          margin: 0 40px 0 8px;
          color: #C00000;
          font-size: 20px;
          font-weight: 600;
          text-align: center;
        }
        .earnings-history-content {
          min-height: calc(100dvh - 64px);
          padding: 20px 16px 40px;
        }
        .earnings-history-list {
          display: grid;
          gap: 12px;
        }
        .earnings-history-card {
          display: flex;
          min-height: 92px;
          align-items: center;
          justify-content: space-between;
          gap: 14px;
          border-radius: 12px;
          padding: 18px 20px;
          background: #fff;
          box-shadow: 0 1px 4px rgba(0, 0, 0, .06);
        }
        .earnings-history-description {
          margin: 0;
          color: #C00000;
          font-size: 17px;
          font-weight: 600;
        }
        .earnings-history-date {
          margin: 8px 0 0;
          color: #777;
          font-size: 13px;
        }
        .earnings-history-amount {
          flex: 0 0 auto;
          margin: 0;
          color: #C00000;
          font-size: 17px;
          font-weight: 700;
          white-space: nowrap;
        }
        .earnings-history-empty {
          display: flex;
          min-height: 340px;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 12px;
          color: #777;
          text-align: center;
        }
        .earnings-history-empty img {
          width: 150px;
          height: 150px;
          object-fit: contain;
        }
        .earnings-history-loading {
          display: grid;
          min-height: 340px;
          place-items: center;
          color: #00aab7;
        }
      `}</style>

      <div className="earnings-history-screen">
        <header className="earnings-history-header">
          <Link href="/account">
            <button
              type="button"
              className="earnings-history-back"
              aria-label="Back to account"
              data-testid="button-back-earnings-history"
            >
              <ArrowLeft aria-hidden="true" />
            </button>
          </Link>
          <h1 className="earnings-history-title">Earnings history</h1>
        </header>

        <section className="earnings-history-content" aria-live="polite">
          {isLoading ? (
            <RefreshLoader />
          ) : earnings.length === 0 ? (
            <div className="earnings-history-empty">
              <img src={emptyIllustration} alt="No earnings" />
              <p>No earnings yet</p>
            </div>
          ) : (
            <div className="earnings-history-list">
              {earnings.map((earning) => (
                <article
                  key={earning.id}
                  className="earnings-history-card"
                  data-testid={`earning-item-${earning.id}`}
                >
                  <div>
                    <p className="earnings-history-description">{earning.description || "Product earnings"}</p>
                    <p className="earnings-history-date">{formatDateTime(earning.createdAt)}</p>
                  </div>
                  <p className="earnings-history-amount">
                    +GPB {Number.parseFloat(earning.amount || "0").toLocaleString("fr-FR")}
                  </p>
                </article>
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}