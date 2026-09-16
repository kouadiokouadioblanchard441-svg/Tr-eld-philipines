import { useState } from "react";
import { useAuth } from "@/lib/auth";
import { useLocation } from "wouter";
import { useMutation, useQuery } from "@tanstack/react-query";
import { ArrowLeft, CheckCircle2, Clock3 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import RefreshLoader from "@/components/refresh-loader";
import { getCompanyProductImage } from "@/lib/product-images";
import { formatCompanyProductName } from "@/lib/product-names";
import { apiRequest, queryClient } from "@/lib/queryClient";

interface ProductTask {
  number: number;
  reward: number;
  isClaimed: boolean;
}

interface ProductTaskGroup {
  userProductId: number;
  productId: number;
  productName: string;
  daysRemaining: number;
  dailyTaskCount: number;
  taskReward: number;
  dailyTaskTotal: number;
  tasks: ProductTask[];
}

type TaskTab = "normal" | "expired";

function formatAmount(amount: number) {
  return `${Math.round(amount).toLocaleString("fr-FR")} GPB`;
}

export default function ProductTasksPage() {
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState<TaskTab>("normal");
  const { data: taskGroups = [], isLoading } = useQuery<ProductTaskGroup[]>({
    queryKey: ["/api/user/product-tasks"],
  });

  const claimMutation = useMutation({
    mutationFn: async ({ userProductId, taskNumber }: { userProductId: number; taskNumber: number }) => {
      const response = await apiRequest(
        "POST",
        `/api/user/products/${userProductId}/tasks/${taskNumber}/claim`,
        {},
      );
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "Impossible de valider la tâche");
      return data as { alreadyClaimed: boolean; reward: number };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/user/product-tasks"] });
      queryClient.invalidateQueries({ queryKey: ["/api/user"] });
      queryClient.invalidateQueries({ queryKey: ["/api/transactions"] });
      toast({
        title: data.alreadyClaimed ? "Tâche déjà validée" : "Tâche validée",
        description: data.alreadyClaimed
          ? "Cette tâche a déjà été validée aujourd'hui."
          : `${formatAmount(data.reward)} ajoutés à votre solde.`,
      });
    },
    onError: (error: Error) => {
      toast({ title: "Erreur", description: error.message, variant: "destructive" });
    },
  });

  const visibleTaskCount = activeTab === "normal"
    ? taskGroups.reduce((total, group) => total + group.tasks.length, 0)
    : 0;

  if (!user) return null;

  return (
    <main className="product-tasks-page">
      <style>{`
        .product-tasks-page {
          min-height: 100%;
          padding-bottom: calc(59px + env(safe-area-inset-bottom));
          background: #EAEAEA;
          color: #202020;
          font-family: Arial, Helvetica, sans-serif;
        }
        .product-tasks-page .product-tasks-screen {
          width: 100%;
          max-width: 500px;
          min-height: calc(100dvh - 59px);
          margin: 0 auto;
          background: #EAEAEA;
        }
        .product-tasks-page .product-tasks-header {
          display: flex;
          height: 72px;
          align-items: center;
          gap: 12px;
          padding: 0 21px;
          background: #EAEAEA;
          color: #0d2028;
        }
        .product-tasks-page .product-tasks-back {
          display: grid;
          width: 36px;
          height: 36px;
          place-items: center;
          border: 0;
          background: transparent;
          color: #0d2028;
        }
        .product-tasks-page .product-tasks-title {
          flex: 1;
          margin: 0;
          color: #FF0000;
          font-size: 20px;
          font-weight: 700;
          text-align: center;
        }
        .product-tasks-page .product-tasks-header-spacer {
          width: 36px;
          height: 36px;
        }
        .product-tasks-page .product-tasks-tabs {
          display: flex;
          height: 63px;
          align-items: flex-end;
          justify-content: center;
          gap: 72px;
          padding-bottom: 11px;
          background: #EAEAEA;
        }
        .product-tasks-page .product-tasks-tab {
          position: relative;
          min-width: 62px;
          border: 0;
          padding: 0 0 12px;
          background: transparent;
          color: #999;
          font-size: 16px;
          font-weight: 400;
          line-height: 1;
          text-align: center;
        }
        .product-tasks-page .product-tasks-tab.active {
          color: #202020;
        }
        .product-tasks-page .product-tasks-tab.active::after {
          position: absolute;
          right: 50%;
          bottom: 0;
          width: 23px;
          height: 4px;
          border-radius: 4px;
          background: #FF0000;
          content: "";
          transform: translateX(50%);
        }
        .product-tasks-page .product-tasks-list {
          display: grid;
          gap: 13px;
          padding: 0 22px 26px;
        }
        .product-tasks-page .product-task-card {
          overflow: hidden;
          border: 1px solid #C00000;
          border-radius: 17px;
          background: #FF0000;
          box-shadow: 0 2px 3px rgba(0, 137, 149, .18);
        }
        .product-tasks-page .product-task-top {
          display: flex;
          align-items: center;
          gap: 13px;
          min-height: 97px;
          padding: 15px 14px 13px;
        }
        .product-tasks-page .product-task-image {
          width: 72px;
          height: 72px;
          flex: 0 0 auto;
          overflow: hidden;
          border-radius: 12px;
          background: #eee;
        }
        .product-tasks-page .product-task-image img {
          display: block;
          width: 100%;
          height: 100%;
          object-fit: cover;
        }
        .product-tasks-page .product-task-copy {
          min-width: 0;
          flex: 1;
        }
        .product-tasks-page .product-task-name {
          overflow: hidden;
          margin: 0;
          color: #fff;
          font-size: 17px;
          font-weight: 700;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .product-tasks-page .product-task-line {
          margin: 7px 0 0;
          color: rgba(255, 255, 255, .8);
          font-size: 13px;
        }
        .product-tasks-page .product-task-line strong {
          color: #fff;
          font-weight: 400;
        }
        .product-tasks-page .product-task-separator {
          height: 1px;
          background: rgba(255, 255, 255, .28);
        }
        .product-tasks-page .product-task-bottom {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          min-height: 72px;
          padding: 10px 14px 11px;
        }
        .product-tasks-page .product-task-reward-label {
          margin: 0 0 5px;
          color: rgba(255, 255, 255, .8);
          font-size: 12px;
        }
        .product-tasks-page .product-task-reward {
          margin: 0;
          color: #fff;
          font-size: 16px;
          font-weight: 700;
        }
        .product-tasks-page .product-task-action {
          min-width: 148px;
          height: 42px;
          border: 0;
          border-radius: 12px;
          background: #EAEAEA;
          color: #C00000;
          font-size: 14px;
          font-weight: 700;
          box-shadow: none;
          transition: transform .12s ease, filter .12s ease;
        }
        .product-tasks-page .product-task-action:hover {
          filter: brightness(1.08);
        }
        .product-tasks-page .product-task-action:active {
          transform: scale(.97);
        }
        .product-tasks-page .product-task-status {
          display: inline-flex;
          align-items: center;
          gap: 5px;
          min-width: 148px;
          height: 42px;
          justify-content: center;
          border-radius: 12px;
          background: rgba(255, 255, 255, .18);
          color: #fff;
          font-size: 13px;
          font-weight: 700;
        }
        .product-tasks-page .product-tasks-empty {
          padding: 20px 22px 30px;
          color: #aaa;
          font-size: 13px;
          text-align: center;
        }
        @media (max-width: 370px) {
          .product-tasks-page .product-tasks-list {
            padding-right: 14px;
            padding-left: 14px;
          }
          .product-tasks-page .product-task-action,
          .product-tasks-page .product-task-status {
            min-width: 126px;
          }
        }
      `}</style>

      <div className="product-tasks-screen">
        <header className="product-tasks-header">
          <button
            type="button"
            className="product-tasks-back"
            onClick={() => navigate("/")}
            aria-label="Retour à l'accueil"
          >
            <ArrowLeft className="h-7 w-7" />
          </button>
          <h1 className="product-tasks-title">Tâches</h1>
          <span className="product-tasks-header-spacer" aria-hidden="true" />
        </header>

        <div className="product-tasks-tabs" role="tablist" aria-label="Filtrer les tâches">
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "normal"}
            className={`product-tasks-tab ${activeTab === "normal" ? "active" : ""}`}
            onClick={() => setActiveTab("normal")}
          >
            Normal
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "expired"}
            className={`product-tasks-tab ${activeTab === "expired" ? "active" : ""}`}
            onClick={() => setActiveTab("expired")}
          >
            Expiré
          </button>
        </div>

        {isLoading ? (
          <RefreshLoader />
        ) : activeTab === "normal" && visibleTaskCount > 0 ? (
          <>
            <div className="product-tasks-list">
              {taskGroups.flatMap((group) =>
                group.tasks.map((task) => {
                  const productName = formatCompanyProductName(
                    group.productName,
                    group.productId,
                  );

                  return (
                    <article className="product-task-card" key={`${group.userProductId}-${task.number}`}>
                      <div className="product-task-top">
                        <div className="product-task-image">
                          <img
                            src={getCompanyProductImage(group.productId - 1)}
                            alt={productName}
                          />
                        </div>
                        <div className="product-task-copy">
                          <h2 className="product-task-name">{productName}</h2>
                          <p className="product-task-line">
                            Tâche {task.number} / {group.dailyTaskCount}{" "}
                            <strong>· {task.isClaimed ? "validée aujourd'hui" : "disponible aujourd'hui"}</strong>
                          </p>
                          <p className="product-task-line">
                            Produit actif <strong>· {group.daysRemaining} jours restants</strong>
                          </p>
                          <p className="product-task-line">
                            Total du jour <strong>· {formatAmount(group.dailyTaskTotal)}</strong>
                          </p>
                        </div>
                      </div>
                      <div className="product-task-separator" />
                      <div className="product-task-bottom">
                        <div>
                          <p className="product-task-reward-label">Gain de la tâche</p>
                          <p className="product-task-reward">{formatAmount(task.reward)}</p>
                        </div>
                        <button
                          type="button"
                          className={`product-task-action ${task.isClaimed ? "claimed" : ""}`}
                          disabled={task.isClaimed || claimMutation.isPending}
                          onClick={() => claimMutation.mutate({
                            userProductId: group.userProductId,
                            taskNumber: task.number,
                          })}
                        >
                          {task.isClaimed ? (
                            <>
                              <CheckCircle2 className="mr-1 inline h-4 w-4" />
                              Validée
                            </>
                          ) : claimMutation.isPending ? "Validation..." : "Effectuer"}
                        </button>
                      </div>
                    </article>
                  );
                }),
              )}
            </div>
          </>
        ) : (
          <div className="product-tasks-empty">
            {activeTab === "expired"
              ? "Aucune tâche expirée."
              : "Aucune tâche disponible pour le moment."}
          </div>
        )}
      </div>
    </main>
  );
}