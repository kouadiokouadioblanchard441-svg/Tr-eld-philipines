import { useAuth } from "@/lib/auth";
import { useQuery, useMutation } from "@tanstack/react-query";
import RefreshLoader from "@/components/refresh-loader";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Bell, Check, ChevronLeft, CircleCheck, Loader2 } from "lucide-react";
import { Link } from "wouter";
import type { Task, Transaction } from "@shared/schema";
import hsbcLogo from "@assets/IMG_20260911_192520_526_1789155009576.jpg";
import iconBronze from "@assets/344464_1773318022355.png";
import iconArgent from "@assets/817729_1773318022328.png";
import iconOr from "@assets/sac-argent-gros-tas-illustration-icone-argent-comptant-icone-p_1773318022388.jpg";
import iconPlatine from "@assets/1751761_1773318022264.png";
import iconDiamant from "@assets/3275655_1773318022415.png";

interface TaskWithStatus extends Task {
  isCompleted: boolean;
  canClaim: boolean;
  currentInvites: number;
}

const TASK_ICONS = [iconBronze, iconArgent, iconOr, iconPlatine, iconDiamant, iconBronze];

const formatPhone = (phone: string | null | undefined) => {
  if (!phone) return "HSBC";
  return phone.length > 13 ? `${phone.slice(0, 13)}…` : phone;
};

const formatAmount = (amount: number) => amount.toLocaleString("fr-FR");

const conditionLabels: Record<string, string> = {
  registration: "Inscription du filleul",
  deposit: "Dépôt approuvé du filleul",
  product: "Achat d'un produit du filleul",
  deposit_or_product: "Dépôt ou achat d'un produit",
};

export default function TasksPage() {
  const { user, refreshUser } = useAuth();
  const { toast } = useToast();

  const { data: tasks, isLoading } = useQuery<TaskWithStatus[]>({
    queryKey: ["/api/tasks"],
  });

  const { data: transactions = [] } = useQuery<Transaction[]>({
    queryKey: ["/api/transactions"],
  });

  const claimMutation = useMutation({
    mutationFn: async (taskId: number) => {
      const response = await apiRequest("POST", `/api/tasks/${taskId}/claim`, {});
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.message || "Error");
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
      queryClient.invalidateQueries({ queryKey: ["/api/transactions"] });
      refreshUser();
      toast({ title: "Reward claimed!", description: "The bonus has been added to your account." });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  if (!user) return null;

  const taskList = tasks || [];
  const completedCount = taskList.filter(task => task.isCompleted).length;
  const claimableCount = taskList.filter(task => task.canClaim && !task.isCompleted).length;
  const claimedReward = transactions
    .filter(transaction => transaction.type === "task_reward")
    .reduce((sum, transaction) => sum + Number(transaction.amount || 0), 0);
  return (
    <main className="tasks-page">
      <style>{`
        .tasks-page {
          --tasks-bg: #ffffff;
          --tasks-panel: #eef9fb;
          --tasks-panel-deep: #e2f4f6;
          --tasks-border: rgba(0, 126, 149, .28);
          --tasks-primary: #FF0000;
          --tasks-primary-dark: #C00000;
          min-height: 100%;
          overflow-x: hidden;
          padding-bottom: calc(59px + env(safe-area-inset-bottom));
          background: var(--tasks-bg);
          color: #0b2432;
          font-family: Inter, Arial, Helvetica, sans-serif;
        }
        .tasks-page .tasks-screen {
          width: 100%;
          max-width: 500px;
          min-height: 100%;
          margin: 0 auto;
          padding: 14px 17px 22px;
        }
        .tasks-page .tasks-brand {
          display: flex;
          align-items: center;
          gap: 10px;
          min-height: 52px;
        }
        .tasks-page .tasks-logo {
          display: grid;
          width: 48px;
          height: 48px;
          place-items: center;
          overflow: hidden;
          border: 2px solid rgba(255,255,255,.72);
          border-radius: 15px;
          background: #EAEAEA;
          box-shadow: 0 4px 12px rgba(0,0,0,.22);
        }
        .tasks-page .tasks-logo img {
          width: 44px;
          height: 44px;
          object-fit: contain;
        }
        .tasks-page .tasks-brand-name {
          flex: 1;
          color: #102b3a;
          font-size: 22px;
          font-weight: 800;
          letter-spacing: -.02em;
        }
        .tasks-page .tasks-phone {
          display: flex;
          align-items: center;
          gap: 8px;
          min-width: 0;
          padding: 8px 9px 8px 13px;
          border: 1px solid rgba(0, 126, 149, .16);
          border-radius: 24px;
          background: #e9f7f8;
          color: #0b5c6a;
          font-size: 12px;
          font-weight: 700;
          box-shadow: inset 0 1px 0 rgba(255,255,255,.04);
        }
        .tasks-page .tasks-bell {
          display: grid;
          width: 34px;
          height: 34px;
          place-items: center;
          border: 0;
          border-radius: 50%;
          background: var(--tasks-primary);
          color: #fff;
        }
        .tasks-page .tasks-notice {
          margin-top: 14px;
          border: 1px solid rgba(0, 126, 149, .28);
          border-radius: 16px;
          padding: 12px 14px;
          background: linear-gradient(135deg, #eaf8fa 0%, #d8f0f3 100%);
          color: #124454;
          font-size: 13px;
          font-weight: 700;
          line-height: 1.55;
          box-shadow: 0 7px 15px rgba(0,0,0,.16);
        }
        .tasks-page .tasks-title {
          margin: 17px 0 13px;
          color: #102b3a;
          font-size: 20px;
          font-weight: 800;
          line-height: 1.15;
        }
        .tasks-page .tasks-summary {
          overflow: hidden;
          border-radius: 17px;
          padding: 16px 15px 14px;
          background:
            radial-gradient(circle at 78% 12%, rgba(255,255,255,.72), transparent 28%),
            linear-gradient(132deg, #eeeeee 0%, #d9d9d9 55%, #FF0000 100%);
          color: #071b2b;
          box-shadow: 0 7px 14px rgba(0, 0, 0, .18);
        }
        .tasks-page .tasks-summary-top {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
          font-size: 13px;
          font-weight: 700;
        }
        .tasks-page .tasks-summary-pill {
          flex: 0 0 auto;
          border-radius: 18px;
          padding: 8px 12px;
          background: var(--tasks-primary-dark);
          color: #fff;
          font-size: 12px;
          font-weight: 800;
          box-shadow: 0 2px 5px rgba(0,0,0,.16);
        }
        .tasks-page .tasks-summary-value {
          margin: 13px 0 14px;
          color: #062130;
          font-size: 29px;
          font-weight: 900;
          line-height: 1;
          letter-spacing: -.03em;
        }
        .tasks-page .tasks-summary-label {
          margin: 13px 0 -7px;
          color: #315363;
          font-size: 11px;
          font-weight: 800;
          text-transform: uppercase;
          letter-spacing: .04em;
        }
        .tasks-page .tasks-summary-grid {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 9px;
        }
        .tasks-page .tasks-stat {
          min-height: 78px;
          border: 1px solid rgba(116, 225, 229, .1);
          border-radius: 14px;
          padding: 11px 10px;
          background: #087e92;
          box-shadow: 0 4px 8px rgba(0,0,0,.12);
        }
        .tasks-page .tasks-stat-label {
          display: block;
          color: #95a6b7;
          font-size: 11px;
          line-height: 1.35;
        }
        .tasks-page .tasks-stat-value {
          display: block;
          margin-top: 8px;
          overflow: hidden;
          color: #f0fbfb;
          font-size: 17px;
          font-weight: 800;
          line-height: 1;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .tasks-page .tasks-section-head {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          margin: 23px 0 12px;
        }
        .tasks-page .product-earnings-panel {
          margin-top: 14px;
          border: 1px solid rgba(0, 126, 149, .2);
          border-radius: 15px;
          padding: 13px;
          background: #f2fbfc;
          box-shadow: 0 4px 10px rgba(0, 126, 149, .08);
        }
        .tasks-page .product-earnings-head {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 10px;
        }
        .tasks-page .product-earnings-label {
          margin: 0;
          color: #175264;
          font-size: 13px;
          font-weight: 800;
        }
        .tasks-page .product-earnings-amount {
          margin: 4px 0 0;
          color: #C00000;
          font-size: 22px;
          font-weight: 900;
          line-height: 1;
        }
        .tasks-page .product-earnings-action {
          display: inline-flex;
          min-width: 100px;
          min-height: 35px;
          align-items: center;
          justify-content: center;
          gap: 5px;
          border: 0;
          border-radius: 19px;
          padding: 7px 10px;
          background: #C00000;
          color: #fff;
          font-size: 11px;
          font-weight: 800;
          box-shadow: 0 3px 7px rgba(0, 126, 149, .2);
        }
        .tasks-page .product-earnings-action:disabled {
          cursor: default;
          background: #a8c6ca;
          box-shadow: none;
        }
        .tasks-page .product-earnings-subtitle {
          margin: 7px 0 0;
          color: #769298;
          font-size: 11px;
        }
        .tasks-page .product-earnings-list {
          display: grid;
          gap: 7px;
          margin-top: 11px;
        }
        .tasks-page .product-earning-card {
          display: flex;
          align-items: center;
          gap: 9px;
          min-width: 0;
          border-radius: 10px;
          padding: 8px;
          background: linear-gradient(135deg, #159db0 0%, #006f88 100%);
          color: #fff;
        }
        .tasks-page .product-earning-image {
          width: 40px;
          height: 40px;
          flex: 0 0 auto;
          overflow: hidden;
          border: 2px solid rgba(255, 255, 255, .7);
          border-radius: 8px;
        }
        .tasks-page .product-earning-image img {
          display: block;
          width: 100%;
          height: 100%;
          object-fit: cover;
        }
        .tasks-page .product-earning-copy {
          min-width: 0;
          flex: 1;
        }
        .tasks-page .product-earning-name {
          overflow: hidden;
          margin: 0;
          font-size: 12px;
          font-weight: 800;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .tasks-page .product-earning-meta {
          margin: 3px 0 0;
          color: rgba(255, 255, 255, .78);
          font-size: 10px;
        }
        .tasks-page .product-earning-status {
          flex: 0 0 auto;
          color: #e6ffff;
          font-size: 10px;
          font-weight: 800;
          text-align: right;
        }
        .tasks-page .product-earning-empty {
          margin-top: 10px;
          border-radius: 9px;
          padding: 10px;
          background: #EAEAEA;
          color: #779298;
          font-size: 11px;
          text-align: center;
        }
        .tasks-page .tasks-section-head h2 {
          margin: 0;
          color: #102b3a;
          font-size: 19px;
          font-weight: 800;
        }
        .tasks-page .tasks-claim-all {
          border: 0;
          border-radius: 18px;
          padding: 8px 12px;
          background: var(--tasks-primary);
          color: #fff;
          font-size: 11px;
          font-weight: 800;
          box-shadow: 0 3px 7px rgba(0,0,0,.2);
        }
        .tasks-page .tasks-timeline {
          position: relative;
        }
        .tasks-page .tasks-timeline::before {
          position: absolute;
          top: 34px;
          bottom: 34px;
          left: 25px;
          width: 2px;
          background: linear-gradient(to bottom, rgba(0,126,149,.75), rgba(0,171,183,.18));
          content: "";
        }
        .tasks-page .tasks-timeline-item {
          position: relative;
          display: grid;
          grid-template-columns: 45px minmax(0, 1fr);
          gap: 8px;
          margin-bottom: 9px;
        }
        .tasks-page .tasks-side {
          position: relative;
          z-index: 1;
          display: flex;
          align-items: center;
          flex-direction: column;
          padding-top: 3px;
        }
        .tasks-page .tasks-index {
          color: #194554;
          font-size: 12px;
          font-weight: 800;
        }
        .tasks-page .tasks-side-label {
          margin-top: 3px;
          color: #8299a1;
          font-size: 10px;
          text-transform: uppercase;
        }
        .tasks-page .tasks-icon {
          display: grid;
          width: 35px;
          height: 35px;
          margin-top: 14px;
          place-items: center;
          border: 3px solid #fff;
          border-radius: 50%;
          background: #dff8f8;
          box-shadow: 0 0 0 1px rgba(0,171,183,.55);
        }
        .tasks-page .tasks-icon img {
          width: 26px;
          height: 26px;
          border-radius: 50%;
          object-fit: cover;
        }
        .tasks-page .tasks-card {
          min-width: 0;
          border: 1px solid rgba(0, 126, 149, .26);
          border-radius: 14px;
          padding: 11px 12px 11px;
          background: linear-gradient(145deg, #159db0 0%, #006f88 100%);
          box-shadow: 0 6px 13px rgba(0,0,0,.18);
        }
        .tasks-page .tasks-card-top {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 8px;
        }
        .tasks-page .tasks-card-title {
          margin: 0;
          overflow: hidden;
          color: #fff;
          font-size: 14px;
          font-weight: 800;
          line-height: 1.2;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .tasks-page .tasks-status {
          flex: 0 0 auto;
          border: 1px solid rgba(255,255,255,.25);
          border-radius: 17px;
          padding: 8px 11px;
          background: rgba(255,255,255,.16);
          color: #f1ffff;
          font-size: 11px;
          font-weight: 800;
        }
        .tasks-page .tasks-status.done {
          border-color: rgba(60, 190, 111, .44);
          background: rgba(38, 125, 72, .65);
          color: #d5f8df;
        }
        .tasks-page .tasks-card-description {
          margin: 7px 0 12px;
          color: rgba(241, 255, 255, .76);
          font-size: 12px;
          line-height: 1.4;
        }
        .tasks-page .tasks-details {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 9px;
        }
        .tasks-page .tasks-detail {
          min-width: 0;
          border: 1px solid rgba(255, 255, 255, .2);
          border-radius: 9px;
          padding: 8px 8px;
          background: rgba(3, 56, 78, .28);
        }
        .tasks-page .tasks-detail span {
          display: block;
          color: rgba(241, 255, 255, .72);
          font-size: 10px;
          line-height: 1.25;
        }
        .tasks-page .tasks-detail strong {
          display: block;
          margin-top: 5px;
          overflow: hidden;
          color: #fff;
          font-size: 14px;
          line-height: 1.1;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .tasks-page .tasks-detail strong.reward {
          color: #25d38c;
        }
        .tasks-page .tasks-card-footer {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
          margin-top: 13px;
        }
        .tasks-page .tasks-reward {
          color: #fff;
          font-size: 16px;
          font-weight: 900;
        }
        .tasks-page .tasks-action {
          min-width: 88px;
          border: 0;
          border-radius: 22px;
          padding: 8px 12px;
          background: #e9fbfc;
          color: #006f88;
          font-size: 12px;
          font-weight: 800;
          text-align: center;
          box-shadow: 0 3px 7px rgba(0,0,0,.18);
        }
        .tasks-page .tasks-action:active,
        .tasks-page .tasks-claim-all:active,
        .tasks-page .tasks-bell:active {
          transform: scale(.97);
        }
        .tasks-page .tasks-action:disabled {
          cursor: default;
          opacity: .72;
        }
        .tasks-page .tasks-action.received {
          background: rgba(5, 57, 75, .48);
          color: #e1f7f8;
        }
        .tasks-page .tasks-empty {
          padding: 35px 20px;
          border: 1px solid var(--tasks-border);
          border-radius: 18px;
          background: var(--tasks-panel);
          color: #91a2b3;
          text-align: center;
        }
        .tasks-page .tasks-more {
          margin: 18px 0 0;
          color: #8299a1;
          font-size: 12px;
          text-align: center;
        }
        @media (max-width: 370px) {
          .tasks-page .tasks-screen { padding-right: 12px; padding-left: 12px; }
          .tasks-page .tasks-phone { padding-left: 9px; font-size: 10px; }
          .tasks-page .tasks-card { padding-right: 10px; padding-left: 10px; }
          .tasks-page .tasks-card-title { font-size: 13px; }
          .tasks-page .tasks-status { padding-right: 8px; padding-left: 8px; }
        }
      `}</style>

      <div className="tasks-screen">
        <header className="tasks-brand">
          <Link href="/">
            <button type="button" className="grid h-9 w-9 place-items-center text-white" aria-label="Retour à l'accueil">
              <ChevronLeft className="h-6 w-6" />
            </button>
          </Link>
          <div className="tasks-logo">
            <img src={hsbcLogo} alt="HSBC" />
          </div>
          <span className="tasks-brand-name">HSBC</span>
          <div className="tasks-phone">
            <span>{formatPhone(user.phone)}</span>
            <button type="button" className="tasks-bell" aria-label="Notifications">
              <Bell className="h-[18px] w-[18px]" />
            </button>
          </div>
        </header>

        <div className="tasks-notice">
          DÉMARRAGE RAPIDE : invitez vos proches, accomplissez vos tâches et réclamez vos récompenses depuis cet écran.
        </div>

        <h1 className="tasks-title">Mes tâches</h1>

        <section className="tasks-summary" aria-label="Résumé des tâches">
          <div className="tasks-summary-top">
            <span>Mes tâches de parrainage</span>
            <span className="tasks-summary-pill">
              {claimableCount} tâche{claimableCount > 1 ? "s" : ""} disponible{claimableCount > 1 ? "s" : ""}
            </span>
          </div>
          <p className="tasks-summary-label">Total déjà collecté</p>
          <p className="tasks-summary-value">{formatAmount(claimedReward)} GPB</p>
          <div className="tasks-summary-grid">
            <div className="tasks-stat">
              <span className="tasks-stat-label">Tâches totales</span>
              <strong className="tasks-stat-value">{taskList.length}</strong>
            </div>
            <div className="tasks-stat">
              <span className="tasks-stat-label">Récompense gagnée</span>
              <strong className="tasks-stat-value">{formatAmount(claimedReward)}</strong>
            </div>
            <div className="tasks-stat">
              <span className="tasks-stat-label">Tâches terminées</span>
              <strong className="tasks-stat-value">{completedCount}</strong>
            </div>
          </div>
        </section>

        <div className="tasks-section-head">
          <h2>Liste des tâches</h2>
          {claimableCount > 0 && (
            <button
              type="button"
              className="tasks-claim-all"
              disabled={claimMutation.isPending}
              onClick={async () => {
                const claimable = taskList.filter(task => task.canClaim && !task.isCompleted);
                for (const task of claimable) {
                  try {
                    await claimMutation.mutateAsync(task.id);
                  } catch {
                    break;
                  }
                }
              }}
            >
              Tout réclamer
            </button>
          )}
        </div>

        {isLoading ? (
          <RefreshLoader />
        ) : taskList.length > 0 ? (
          <div className="tasks-timeline">
            {taskList.map((task, index) => {
              const progress = Math.min((task.currentInvites / Math.max(task.requiredInvites, 1)) * 100, 100);
              const icon = TASK_ICONS[index % TASK_ICONS.length];
              const isReceived = task.isCompleted;
              const isReady = task.canClaim && !task.isCompleted;

              return (
                <article className="tasks-timeline-item" key={task.id} data-testid={`task-item-${task.id}`}>
                  <div className="tasks-side">
                    <span className="tasks-index">{String(index + 1).padStart(2, "0")}</span>
                    <span className="tasks-side-label">palier</span>
                    <div className="tasks-icon">
                      <img src={icon} alt="" />
                    </div>
                  </div>

                  <div className="tasks-card">
                    <div className="tasks-card-top">
                      <h3 className="tasks-card-title">{task.name}</h3>
                      <span className={`tasks-status ${isReceived ? "done" : ""}`}>
                        {isReceived ? "Réclamé" : isReady ? "Disponible" : "En cours"}
                      </span>
                    </div>
                    <p className="tasks-card-description">{task.description}</p>

                    <div className="tasks-details">
                      <div className="tasks-detail">
                        <span>Invitations</span>
                        <strong>{task.currentInvites} / {task.requiredInvites}</strong>
                      </div>
                      <div className="tasks-detail">
                        <span>Progression</span>
                        <strong>{Math.round(progress)}%</strong>
                      </div>
                      <div className="tasks-detail">
                        <span>Condition</span>
                        <strong>{conditionLabels[task.conditionType] || task.description}</strong>
                      </div>
                    </div>

                    <div className="tasks-card-footer">
                      <span className="tasks-reward">+{formatAmount(task.reward)} GPB</span>
                      {isReceived ? (
                        <span className="tasks-action received">
                          <CircleCheck className="mr-1 inline h-4 w-4 align-[-3px]" /> Reçu
                        </span>
                      ) : isReady ? (
                        <button
                          type="button"
                          className="tasks-action"
                          disabled={claimMutation.isPending}
                          onClick={() => claimMutation.mutate(task.id)}
                          data-testid={`button-claim-${task.id}`}
                        >
                          {claimMutation.isPending ? <Loader2 className="mx-auto h-4 w-4 animate-spin" /> : "Réclamer"}
                        </button>
                      ) : (
                        <span className="tasks-action received">En cours</span>
                      )}
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <div className="tasks-empty">
            <Check className="mx-auto mb-2 h-8 w-8 text-[#FF0000]" />
            Aucune tâche disponible pour le moment.
          </div>
        )}

        {!isLoading && taskList.length > 0 && <p className="tasks-more">Plus de tâches à venir</p>}
      </div>
    </main>
  );
}