import { useState } from "react";
import { Switch, Route, useLocation, Redirect } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { useQuery } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Headphones } from "lucide-react";
import { AuthProvider, useAuth } from "@/lib/auth";
import BottomNav from "@/components/bottom-nav";
import LoginPage from "@/pages/login";
import RegisterPage from "@/pages/register";
import HomePage from "@/pages/home";
import TasksPage from "@/pages/tasks";
import ProductTasksPage from "@/pages/product-tasks";
import InvestPage from "@/pages/invest";
import OrdersPage from "@/pages/orders";
import TeamPage from "@/pages/team";
import AccountPage from "@/pages/account";
import AdminPage from "@/pages/admin";
import AdminTeamPage from "@/pages/admin-team";
import BankerPage from "@/pages/banker";
import DepositPage from "@/pages/deposit";
import RobotPayPage from "@/pages/robotpay";
import WithdrawalPage from "@/pages/withdrawal";
import DepositHistoryPage from "@/pages/deposit-history";
import DepositsHistoryPage from "@/pages/deposit-history-real";
import HistoryPage from "@/pages/history";
import ServicePage from "@/pages/service";
import { ADMIN_PATH } from "@/lib/admin-path";
import ChangePasswordPage from "@/pages/change-password";
import AboutPage from "@/pages/about";
import RulesPage from "@/pages/rules";
import GiftCodePage from "@/pages/gift-code";
import TeamDetailsPage from "@/pages/team-details";
import MyProductsPage from "@/pages/my-products";
import CheckinPage from "@/pages/checkin";
import RewardsPage from "@/pages/rewards";
import WithdrawalHistoryPage from "@/pages/withdrawal-history";
import DepositOrdersPage from "@/pages/deposit-orders";
import EarningsHistoryPage from "@/pages/earnings-history";
import NewsPage, { NewsDetailPage } from "@/pages/news";
import ManagerPage from "@/pages/manager";
import SalaryBonusPage from "@/pages/salary-bonus";
import IdentityVerificationPage from "@/pages/identity-verification";
import NotFound from "@/pages/not-found";
import RefreshLoader from "@/components/refresh-loader";

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();
  const [location] = useLocation();

  if (isLoading) {
    return <RefreshLoader />;
  }

  if (!user) {
    return <Redirect to="/login" />;
  }

  if (user.isBanned) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-destructive mb-2">Compte suspendu</h1>
          <p className="text-muted-foreground">Votre compte a été suspendu. Contactez le service client.</p>
        </div>
      </div>
    );
  }

  if ((user as any).isBanker && !user.isAdmin && location !== "/banker") {
    return <Redirect to="/banker" />;
  }

  return (
    <>
      {children}
      {location !== "/service" && location !== "/manager" && <FloatingServiceButton />}
    </>
  );
}

function FloatingServiceButton() {
  const [, navigate] = useLocation();
  const { data: settings } = useQuery<{
    supportLink?: string;
    supportType?: string;
    supportLabel?: string;
    supportEnabled?: string;
  }>({
    queryKey: ["/api/settings"],
  });
  const supportEnabled = settings?.supportEnabled !== "false";
  const supportLink = supportEnabled ? settings?.supportLink?.trim() || "" : "";
  const supportType = settings?.supportType === "whatsapp" ? "WhatsApp" : "Telegram";
  const supportLabel = settings?.supportLabel?.trim() || "Contactez-nous";

  const openConfiguredSupport = () => {
    if (supportLink) {
      window.open(supportLink, "_blank", "noopener,noreferrer");
      return;
    }
    navigate("/service");
  };

  return (
    <>
      <style>{`
        .global-contact-float {
          position: fixed;
          right: max(-14px, calc((100vw - 500px) / 2 - 14px));
          bottom: 86px;
          z-index: 40;
          display: flex;
          width: 146px;
          height: 56px;
          align-items: center;
          border: 0;
          border-radius: 28px 0 0 28px;
          padding: 0 12px 0 4px;
          background: linear-gradient(105deg, #FF0000 0%, #ff4d4d 49%, #C00000 100%);
          color: #fff;
          box-shadow: 0 3px 10px rgba(0, 126, 149, .28);
          transition: transform .12s ease, filter .12s ease;
        }
        .global-contact-float:hover {
          filter: brightness(1.04);
        }
        .global-contact-float:active {
          transform: translateX(-3px) scale(.98);
        }
        .global-contact-float:focus-visible {
          outline: 3px solid #C00000;
          outline-offset: 2px;
        }
        .global-contact-float span {
          flex: 1;
          margin-left: 3px;
          color: #fff;
          font-size: 15px;
          font-weight: 700;
          line-height: 17px;
          text-align: center;
        }
        .global-contact-float:disabled {
          cursor: not-allowed;
          opacity: .72;
        }
      `}</style>
      <button
        type="button"
        className="global-contact-float"
        onClick={openConfiguredSupport}
        aria-label={`${supportLabel} sur ${supportType}`}
        data-testid="button-floating-contact"
      >
        <Headphones aria-hidden="true" />
        <span>{supportLabel}</span>
      </button>
    </>
  );
}

function BankerRoute({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return <RefreshLoader />;
  }

  if (!user) return <Redirect to="/login" />;
  if (!(user as any).isBanker && !user.isAdmin) return <Redirect to="/" />;

  return <>{children}</>;
}

function AdminRoute({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return <RefreshLoader />;
  }

  if (!user || !user.isAdmin) {
    return <Redirect to="/" />;
  }

  return <>{children}</>;
}

function PublicRoute({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return <RefreshLoader />;
  }

  if (user) {
    return <Redirect to="/" />;
  }

  return <>{children}</>;
}

function AppLayout({ children, hideBottomNav = false }: { children: React.ReactNode; hideBottomNav?: boolean }) {
  return (
    <div className={`min-h-screen bg-background ${hideBottomNav ? "" : "bottom-nav-clearance"}`}>
      {children}
      {!hideBottomNav && <BottomNav />}
    </div>
  );
}

function BrandThemeScope({ children }: { children: React.ReactNode }) {
  return <div className="teld-theme">{children}</div>;
}

function Router() {
  return (
    <Switch>
      <Route path="/login">
        <PublicRoute>
          <LoginPage />
        </PublicRoute>
      </Route>
      <Route path="/register">
        <PublicRoute>
          <RegisterPage />
        </PublicRoute>
      </Route>
      <Route path="/invitation">
        <PublicRoute>
          <RegisterPage />
        </PublicRoute>
      </Route>
      <Route path="/rejoindre">
        <PublicRoute>
          <RegisterPage />
        </PublicRoute>
      </Route>
      <Route path="/">
        <ProtectedRoute>
          <AppLayout>
            <HomePage />
          </AppLayout>
        </ProtectedRoute>
      </Route>
      <Route path="/tasks">
        <ProtectedRoute>
          <AppLayout>
            <ProductTasksPage />
          </AppLayout>
        </ProtectedRoute>
      </Route>
      <Route path="/invest">
        <ProtectedRoute>
          <AppLayout>
            <InvestPage />
          </AppLayout>
        </ProtectedRoute>
      </Route>
      <Route path="/orders">
        <ProtectedRoute>
          <AppLayout>
            <OrdersPage />
          </AppLayout>
        </ProtectedRoute>
      </Route>
      <Route path="/team">
        <ProtectedRoute>
          <AppLayout hideBottomNav>
            <TeamPage />
          </AppLayout>
        </ProtectedRoute>
      </Route>
      <Route path="/my-products">
        <ProtectedRoute>
          <AppLayout>
            <MyProductsPage />
          </AppLayout>
        </ProtectedRoute>
      </Route>
      <Route path="/checkin">
        <ProtectedRoute>
          <CheckinPage />
        </ProtectedRoute>
      </Route>
      <Route path="/account">
        <ProtectedRoute>
          <AppLayout>
            <AccountPage />
          </AppLayout>
        </ProtectedRoute>
      </Route>
      <Route path="/deposit">
        <ProtectedRoute>
          <DepositPage />
        </ProtectedRoute>
      </Route>
      <Route path="/robotpay">
        <ProtectedRoute>
          <RobotPayPage />
        </ProtectedRoute>
      </Route>
      <Route path="/withdrawal">
        <ProtectedRoute>
          <WithdrawalPage />
        </ProtectedRoute>
      </Route>
      <Route path="/deposit-history">
        <ProtectedRoute>
          <DepositHistoryPage />
        </ProtectedRoute>
      </Route>
      <Route path="/deposits-history">
        <ProtectedRoute>
          <DepositsHistoryPage />
        </ProtectedRoute>
      </Route>
      <Route path="/earnings-history">
        <ProtectedRoute>
          <EarningsHistoryPage />
        </ProtectedRoute>
      </Route>
      <Route path="/earnings-tasks">
        <ProtectedRoute>
          <AppLayout>
            <ProductTasksPage />
          </AppLayout>
        </ProtectedRoute>
      </Route>
      <Route path="/product-tasks">
        <ProtectedRoute>
          <AppLayout>
            <ProductTasksPage />
          </AppLayout>
        </ProtectedRoute>
      </Route>
      <Route path="/mission">
        <ProtectedRoute>
          <AppLayout>
            <TasksPage showProductEarnings />
          </AppLayout>
        </ProtectedRoute>
      </Route>
      <Route path="/news/:id">
        <ProtectedRoute>
          <AppLayout>
            <NewsDetailPage />
          </AppLayout>
        </ProtectedRoute>
      </Route>
      <Route path="/news">
        <ProtectedRoute>
          <AppLayout>
            <NewsPage />
          </AppLayout>
        </ProtectedRoute>
      </Route>
      <Route path="/manager">
        <ProtectedRoute>
          <AppLayout hideBottomNav>
            <ManagerPage />
          </AppLayout>
        </ProtectedRoute>
      </Route>
      <Route path="/history">
        <ProtectedRoute>
          <HistoryPage />
        </ProtectedRoute>
      </Route>
      <Route path="/withdrawal-history">
        <ProtectedRoute>
          <WithdrawalHistoryPage />
        </ProtectedRoute>
      </Route>
      <Route path="/deposit-orders">
        <ProtectedRoute>
          <DepositOrdersPage />
        </ProtectedRoute>
      </Route>
      <Route path="/service">
        <ProtectedRoute>
          <ServicePage />
        </ProtectedRoute>
      </Route>
      <Route path="/identity-verification">
        <ProtectedRoute>
          <IdentityVerificationPage />
        </ProtectedRoute>
      </Route>
      <Route path="/change-password">
        <ProtectedRoute>
          <ChangePasswordPage />
        </ProtectedRoute>
      </Route>
      <Route path="/about">
        <ProtectedRoute>
          <AboutPage />
        </ProtectedRoute>
      </Route>
      <Route path="/rules">
        <ProtectedRoute>
          <RulesPage />
        </ProtectedRoute>
      </Route>
      <Route path="/gift-code">
        <ProtectedRoute>
          <GiftCodePage />
        </ProtectedRoute>
      </Route>
      <Route path="/team-details">
        <ProtectedRoute>
          <TeamDetailsPage />
        </ProtectedRoute>
      </Route>
      <Route path="/daily-bonus">
        <ProtectedRoute>
          <AppLayout>
            <RewardsPage />
          </AppLayout>
        </ProtectedRoute>
      </Route>
      <Route path="/salary-bonus">
        <ProtectedRoute>
          <AppLayout>
            <SalaryBonusPage />
          </AppLayout>
        </ProtectedRoute>
      </Route>
      {/* /admin is a decoy — the server already returns 404 for it,
          but we also map it to NotFound on the client to be thorough. */}
      <Route path="/admin" component={NotFound} />
      <Route path="/admin/:rest*" component={NotFound} />
      {/* Real admin panel is served under the secret path */}
      <Route path={ADMIN_PATH}>
        <AdminRoute>
          <AdminPage />
        </AdminRoute>
      </Route>
      <Route path={`${ADMIN_PATH}/team/:id`}>
        <AdminRoute>
          <AdminTeamPage />
        </AdminRoute>
      </Route>
      <Route path="/banker">
        <BankerRoute>
          <BankerPage />
        </BankerRoute>
      </Route>
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <AuthProvider>
          <BrandThemeScope>
            <Router />
            <Toaster />
          </BrandThemeScope>
        </AuthProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
