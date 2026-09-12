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

  const signupBonus = settings?.signupBonus || "2040";
  const minDeposit = settings?.minDeposit || "12240";
  const minWithdrawal = settings?.minWithdrawal || "6120";
  const withdrawalFees = settings?.withdrawalFees || "18";
  const withdrawalStartHour = settings?.withdrawalStartHour || "9";
  const withdrawalEndHour = settings?.withdrawalEndHour || "17";
  const maxWithdrawalsPerDay = settings?.maxWithdrawalsPerDay || "1";
  const lv1 = settings?.level1Commission || "15";
  const lv2 = settings?.level2Commission || "2";
  const lv3 = settings?.level3Commission || "1";

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
                <li>- Minimum amount: {parseInt(minDeposit).toLocaleString()} GPB</li>
                <li>- Deposits are processed as quickly as possible</li>
                <li>- Vérifiez que vos informations de paiement sont correctes</li>
              </ul>
            </section>

            <section>
              <h4 className="font-medium text-foreground mb-2">2. Withdrawals</h4>
              <ul className="space-y-1">
                <li>- Minimum amount: {parseInt(minWithdrawal).toLocaleString()} GPB</li>
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
              <p>Each new member receives a {parseInt(signupBonus).toLocaleString()} GPB sign-up bonus.</p>
            </section>
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
