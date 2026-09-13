import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useQuery } from "@tanstack/react-query";

interface RulesModalProps {
  open: boolean;
  onClose: () => void;
}

export default function RulesModal({ open, onClose }: RulesModalProps) {
  const { data: settings } = useQuery<Record<string, string>>({
    queryKey: ["/api/settings"],
  });

  const formatSetting = (value?: string) => {
    const number = Number(value);
    return Number.isFinite(number) ? number.toLocaleString("fr-FR") : "—";
  };
  const signupBonus = formatSetting(settings?.signupBonus);
  const minDeposit = formatSetting(settings?.minDeposit);
  const minWithdrawal = formatSetting(settings?.minWithdrawal);
  const withdrawalFees = formatSetting(settings?.withdrawalFees);
  const withdrawalStartHour = settings?.withdrawalStartHour || "—";
  const withdrawalEndHour = settings?.withdrawalEndHour || "—";
  const maxWithdrawalsPerDay = formatSetting(settings?.maxWithdrawalsPerDay);
  const lv1 = formatSetting(settings?.level1Commission);
  const lv2 = formatSetting(settings?.level2Commission);
  const lv3 = formatSetting(settings?.level3Commission);

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md max-h-[80vh]">
        <DialogHeader>
          <DialogTitle>Règles de la plateforme</DialogTitle>
        </DialogHeader>

        <ScrollArea className="h-[60vh] pr-4">
          <div className="space-y-4 text-sm text-muted-foreground">
            <section>
              <h4 className="font-medium text-foreground mb-2">1. Deposits</h4>
              <ul className="space-y-1">
                <li>- Minimum amount: {minDeposit} GPB</li>
                <li>- Deposits are processed as quickly as possible</li>
                <li>- Vérifiez que vos informations de paiement sont correctes</li>
              </ul>
            </section>

            <section>
              <h4 className="font-medium text-foreground mb-2">2. Withdrawals</h4>
              <ul className="space-y-1">
                <li>- Minimum amount: {minWithdrawal} GPB</li>
                <li>- Withdrawal fee: {withdrawalFees}%</li>
                <li>- Hours: {withdrawalStartHour}:00 - {withdrawalEndHour}:00</li>
                <li>- Maximum {maxWithdrawalsPerDay} withdrawal(s) per day</li>
                <li>- Un produit actif est requis pour effectuer un retrait</li>
                <li>- Un portefeuille de retrait doit être enregistré</li>
              </ul>
            </section>

            <section>
              <h4 className="font-medium text-foreground mb-2">3. Products</h4>
              <ul className="space-y-1">
                <li>- Standard cycle: 80 days</li>
                <li>- Gains quotidiens automatiques</li>
                <li>- Les gains sont crédités 24 heures après l'achat</li>
                <li>- Free product: claim 204 GPB/day</li>
              </ul>
            </section>

            <section>
              <h4 className="font-medium text-foreground mb-2">4. Referrals</h4>
              <ul className="space-y-1">
                <li>- Level 1: {lv1}% commission</li>
                <li>- Level 2: {lv2}% commission</li>
                <li>- Level 3: {lv3}% commission</li>
                <li>- Commissions on product purchases</li>
              </ul>
            </section>

            <section>
              <h4 className="font-medium text-foreground mb-2">5. Sign-up bonus</h4>
              <p>Each new member receives a {signupBonus} GPB sign-up bonus.</p>
            </section>
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
