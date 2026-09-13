import { useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import RefreshLoader from "@/components/refresh-loader";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Loader2, Save, Link, Clock, Users, Zap } from "lucide-react";

const NETWORKS = [
  { value: "telegram", label: "Telegram" },
  { value: "whatsapp", label: "WhatsApp" },
  { value: "facebook", label: "Facebook" },
  { value: "instagram", label: "Instagram" },
  { value: "tiktok", label: "TikTok" },
  { value: "youtube", label: "YouTube" },
];

const settingsSchema = z.object({
  supportLink: z.string().min(5, "Link is required"),
  supportType: z.string().min(1, "Network is required"),
  supportLabel: z.string().min(1, "Label is required"),
  support2Link: z.string().min(5, "Link is required"),
  support2Type: z.string().min(1, "Network is required"),
  support2Label: z.string().min(1, "Label is required"),
  channelLink: z.string().min(5, "Link is required"),
  channelType: z.string().min(1, "Network is required"),
  channelLabel: z.string().min(1, "Label is required"),
  groupLink: z.string().min(5, "Link is required"),
  groupType: z.string().min(1, "Network is required"),
  groupLabel: z.string().min(1, "Label is required"),
  popupButtonLabel: z.string().min(1, "Label is required"),
  supportEnabled: z.boolean(),
  support2Enabled: z.boolean(),
  channelEnabled: z.boolean(),
  groupEnabled: z.boolean(),
  minDeposit: z.string().min(1, "Amount is required"),
  minWithdrawal: z.string().min(1, "Amount is required"),
  depositConversionRate: z.string().min(1, "Rate is required"),
  withdrawalConversionRate: z.string().min(1, "Rate is required"),
  withdrawalFees: z.string().min(1, "Fee is required"),
  maxWithdrawalsPerDay: z.string().min(1, "Required"),
  withdrawalStartHour: z.string().min(1, "Start time is required"),
  withdrawalEndHour: z.string().min(1, "End time is required"),
  level1Commission: z.string().min(1, "Commission is required"),
  level2Commission: z.string().min(1, "Commission is required"),
  level3Commission: z.string().min(1, "Commission is required"),
  sendavapayEnabled: z.boolean(),
  sendavapayChannelName: z.string().min(1, "Name is required"),
  westpayEnabled: z.boolean(),
  westpayChannelName: z.string().min(1, "Name is required"),
  westpayCountries: z.string(),
});

type SettingsForm = z.infer<typeof settingsSchema>;

interface AdminSettingsProps {
  isSuperAdmin: boolean;
}

export default function AdminSettings({ isSuperAdmin }: AdminSettingsProps) {
  const { toast } = useToast();

  const { data: settings, isLoading } = useQuery<Record<string, string>>({
    queryKey: ["/api/admin/settings"],
  });

  const form = useForm<SettingsForm>({
    resolver: zodResolver(settingsSchema),
    defaultValues: {
      supportLink: "https://t.me/sybotx",
      supportType: "telegram",
       supportLabel: "Service client",
      support2Link: "https://t.me/sybotx",
      support2Type: "telegram",
       support2Label: "Service client 2",
      channelLink: "https://t.me/sybotx",
      channelType: "telegram",
       channelLabel: "Canal officiel",
      groupLink: "https://t.me/sybotx",
      groupType: "telegram",
       groupLabel: "Groupe de discussion",
       popupButtonLabel: "Cliquez ici pour rejoindre le groupe Telegram",
      supportEnabled: true,
      support2Enabled: true,
      channelEnabled: true,
      groupEnabled: true,
       minDeposit: "",
       minWithdrawal: "",
       depositConversionRate: "",
       withdrawalConversionRate: "",
       withdrawalFees: "",
       maxWithdrawalsPerDay: "",
       withdrawalStartHour: "",
       withdrawalEndHour: "",
        level1Commission: "",
        level2Commission: "",
        level3Commission: "",
      sendavapayEnabled: false,
      sendavapayChannelName: "SendavaPay",
      westpayEnabled: true,
      westpayChannelName: "WestPay",
      westpayCountries: "TG,BJ,BF,CI,CM",
    },
  });

  useEffect(() => {
    if (settings) {
      form.reset({
        supportLink: settings.supportLink || "https://t.me/sybotx",
        supportType: settings.supportType || "telegram",
         supportLabel: settings.supportLabel || "Service client",
        support2Link: settings.support2Link || "https://t.me/sybotx",
        support2Type: settings.support2Type || "telegram",
         support2Label: settings.support2Label || "Service client 2",
        channelLink: settings.channelLink || "https://t.me/sybotx",
        channelType: settings.channelType || "telegram",
         channelLabel: settings.channelLabel || "Canal officiel",
        groupLink: settings.groupLink || "https://t.me/sybotx",
        groupType: settings.groupType || "telegram",
         groupLabel: settings.groupLabel || "Groupe de discussion",
         popupButtonLabel: settings.popupButtonLabel || "Cliquez ici pour rejoindre le groupe Telegram",
        supportEnabled: settings.supportEnabled !== "false",
        support2Enabled: settings.support2Enabled !== "false",
        channelEnabled: settings.channelEnabled !== "false",
        groupEnabled: settings.groupEnabled !== "false",
         minDeposit: settings.minDeposit || "",
         minWithdrawal: settings.minWithdrawal || "",
         depositConversionRate: settings.depositConversionRate || "",
         withdrawalConversionRate: settings.withdrawalConversionRate || "",
         withdrawalFees: settings.withdrawalFees || "",
         maxWithdrawalsPerDay: settings.maxWithdrawalsPerDay || "",
         withdrawalStartHour: settings.withdrawalStartHour || "",
         withdrawalEndHour: settings.withdrawalEndHour || "",
         level1Commission: settings.level1Commission || "",
         level2Commission: settings.level2Commission || "",
         level3Commission: settings.level3Commission || "",
        sendavapayEnabled: settings.sendavapayEnabled === "true",
        sendavapayChannelName: settings.sendavapayChannelName || "SendavaPay",
        westpayEnabled: settings.westpayEnabled === "true",
        westpayChannelName: settings.westpayChannelName || "WestPay",
        westpayCountries: settings.westpayCountries || "TG,BJ,BF,CI,CM",
      });
    }
  }, [settings, form]);

  const updateMutation = useMutation({
    mutationFn: async (data: SettingsForm) => {
      const serialized = {
        ...data,
        supportEnabled: String(data.supportEnabled),
        support2Enabled: String(data.support2Enabled),
        channelEnabled: String(data.channelEnabled),
        groupEnabled: String(data.groupEnabled),
        sendavapayEnabled: String(data.sendavapayEnabled),
        westpayEnabled: String(data.westpayEnabled),
      };
      const response = await apiRequest("POST", "/api/admin/settings", serialized);
      if (!response.ok) {
        const result = await response.json();
        throw new Error(result.message || "Error");
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/settings"] });
      queryClient.invalidateQueries({ queryKey: ["/api/settings"] });
      queryClient.invalidateQueries({ queryKey: ["/api/settings/links"] });
      toast({ title: "Settings saved!" });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  if (isLoading) {
    return <RefreshLoader />;
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit((data) => updateMutation.mutate(data))} className="space-y-4">

        {/* ── Links & Social networks ── */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Link className="w-5 h-5 text-primary" />
              Links & Social networks
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">

            {/* Support 1 */}
            <div className="space-y-2 border rounded-xl p-3">
              <div className="flex items-center justify-between">
                <p className="text-xs font-bold text-gray-500 uppercase tracking-wide">Link 1 — Customer service</p>
                <FormField control={form.control} name="supportEnabled" render={({ field }) => (
                  <FormItem className="flex items-center gap-2 space-y-0">
                    <FormLabel className="text-xs text-gray-500">{field.value ? "Active" : "Disabled"}</FormLabel>
                    <FormControl>
                      <Switch checked={field.value} onCheckedChange={field.onChange} />
                    </FormControl>
                  </FormItem>
                )} />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <FormField control={form.control} name="supportLabel" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Display label</FormLabel>
                    <FormControl><Input {...field} placeholder="Customer service" /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="supportType" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Social network</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger><SelectValue placeholder="Network..." /></SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {NETWORKS.map(n => <SelectItem key={n.value} value={n.value}>{n.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>
              <FormField control={form.control} name="supportLink" render={({ field }) => (
                <FormItem>
                  <FormLabel>URL link</FormLabel>
                  <FormControl><Input {...field} placeholder="https://t.me/..." /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
            </div>

            {/* Support 2 */}
            <div className="space-y-2 border rounded-xl p-3">
              <div className="flex items-center justify-between">
                <p className="text-xs font-bold text-gray-500 uppercase tracking-wide">Link 2 — Customer service</p>
                <FormField control={form.control} name="support2Enabled" render={({ field }) => (
                  <FormItem className="flex items-center gap-2 space-y-0">
                    <FormLabel className="text-xs text-gray-500">{field.value ? "Active" : "Disabled"}</FormLabel>
                    <FormControl>
                      <Switch checked={field.value} onCheckedChange={field.onChange} />
                    </FormControl>
                  </FormItem>
                )} />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <FormField control={form.control} name="support2Label" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Display label</FormLabel>
                    <FormControl><Input {...field} placeholder="Customer service 2" /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="support2Type" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Social network</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger><SelectValue placeholder="Network..." /></SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {NETWORKS.map(n => <SelectItem key={n.value} value={n.value}>{n.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>
              <FormField control={form.control} name="support2Link" render={({ field }) => (
                <FormItem>
                  <FormLabel>URL link</FormLabel>
                  <FormControl><Input {...field} placeholder="https://t.me/..." /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
            </div>

            {/* Channel */}
            <div className="space-y-2 border rounded-xl p-3">
              <div className="flex items-center justify-between">
                <p className="text-xs font-bold text-gray-500 uppercase tracking-wide">Link 3 — Official channel</p>
                <FormField control={form.control} name="channelEnabled" render={({ field }) => (
                  <FormItem className="flex items-center gap-2 space-y-0">
                    <FormLabel className="text-xs text-gray-500">{field.value ? "Active" : "Disabled"}</FormLabel>
                    <FormControl>
                      <Switch checked={field.value} onCheckedChange={field.onChange} />
                    </FormControl>
                  </FormItem>
                )} />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <FormField control={form.control} name="channelLabel" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Display label</FormLabel>
                    <FormControl><Input {...field} placeholder="Official channel" /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="channelType" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Social network</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger><SelectValue placeholder="Network..." /></SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {NETWORKS.map(n => <SelectItem key={n.value} value={n.value}>{n.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>
              <FormField control={form.control} name="channelLink" render={({ field }) => (
                <FormItem>
                  <FormLabel>URL link</FormLabel>
                  <FormControl><Input {...field} placeholder="https://t.me/..." /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
            </div>

            {/* Group */}
            <div className="space-y-2 border rounded-xl p-3">
              <div className="flex items-center justify-between">
                <p className="text-xs font-bold text-gray-500 uppercase tracking-wide">Link 4 — Discussion group</p>
                <FormField control={form.control} name="groupEnabled" render={({ field }) => (
                  <FormItem className="flex items-center gap-2 space-y-0">
                    <FormLabel className="text-xs text-gray-500">{field.value ? "Active" : "Disabled"}</FormLabel>
                    <FormControl>
                      <Switch checked={field.value} onCheckedChange={field.onChange} />
                    </FormControl>
                  </FormItem>
                )} />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <FormField control={form.control} name="groupLabel" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Display label</FormLabel>
                    <FormControl><Input {...field} placeholder="Discussion group" /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="groupType" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Social network</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger><SelectValue placeholder="Network..." /></SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {NETWORKS.map(n => <SelectItem key={n.value} value={n.value}>{n.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>
              <FormField control={form.control} name="groupLink" render={({ field }) => (
                <FormItem>
                  <FormLabel>URL link</FormLabel>
                  <FormControl><Input {...field} placeholder="https://t.me/..." /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
            </div>

            {/* Popup dashboard button */}
            <div className="border border-red-500 rounded-lg p-4 space-y-3">
              <div className="flex items-center gap-2">
                <span className="inline-block w-2.5 h-2.5 rounded-full bg-red-500 shrink-0" />
                 <p className="text-sm font-semibold text-red-600">Bouton de la fenêtre d'accueil</p>
              </div>
              <p className="text-xs text-muted-foreground">
                 Ce bouton apparaît dans la fenêtre d'avertissement qui s'ouvre automatiquement sur la page d'accueil.
              </p>
              <FormField control={form.control} name="popupButtonLabel" render={({ field }) => (
                <FormItem>
                   <FormLabel>Texte du bouton <span className="text-red-500">(fenêtre d'accueil)</span></FormLabel>
                   <FormControl><Input {...field} placeholder="Ex. Cliquez ici pour rejoindre le groupe Telegram" /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="groupLink" render={({ field }) => (
                <FormItem>
                   <FormLabel>Lien du bouton <span className="text-red-500">(fenêtre d'accueil)</span></FormLabel>
                  <FormControl><Input {...field} placeholder="https://t.me/..." /></FormControl>
                   <FormDescription>Ce lien est également utilisé dans la fenêtre de bienvenue de la page d'accueil.</FormDescription>
                  <FormMessage />
                </FormItem>
              )} />
            </div>

          </CardContent>
        </Card>

         {/* ── Withdrawals ── */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Clock className="w-5 h-5 text-primary" />
               Withdrawals
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <FormField control={form.control} name="minDeposit" render={({ field }) => (
                <FormItem>
                <FormLabel>Minimum deposit (GPB)</FormLabel>
                  <FormControl><Input {...field} type="number" min="0" /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="minWithdrawal" render={({ field }) => (
                <FormItem>
                <FormLabel>Minimum withdrawal (GPB)</FormLabel>
                  <FormControl><Input {...field} type="number" min="0" /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <FormField control={form.control} name="depositConversionRate" render={({ field }) => (
                <FormItem>
                  <FormLabel>Taux de dépôt (1 GPB en FCFA)</FormLabel>
                  <FormControl><Input {...field} type="number" min="0.01" step="0.01" /></FormControl>
                  <FormDescription>Utilisé pour calculer le montant FCFA à envoyer pour un dépôt.</FormDescription>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="withdrawalConversionRate" render={({ field }) => (
                <FormItem>
                  <FormLabel>Taux de retrait (1 GPB en FCFA)</FormLabel>
                  <FormControl><Input {...field} type="number" min="0.01" step="0.01" /></FormControl>
                  <FormDescription>Utilisé pour calculer le montant FCFA d'un retrait.</FormDescription>
                  <FormMessage />
                </FormItem>
              )} />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <FormField control={form.control} name="withdrawalFees" render={({ field }) => (
                <FormItem>
                  <FormLabel>Withdrawal fee (%)</FormLabel>
                  <FormControl><Input {...field} type="number" min="0" max="100" /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="maxWithdrawalsPerDay" render={({ field }) => (
                <FormItem>
                  <FormLabel>Max withdrawals / day</FormLabel>
                  <FormControl><Input {...field} type="number" min="1" max="10" /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <FormField control={form.control} name="withdrawalStartHour" render={({ field }) => (
                <FormItem>
                  <FormLabel>Withdrawal start hour</FormLabel>
                  <FormControl><Input {...field} type="number" min="0" max="23" /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="withdrawalEndHour" render={({ field }) => (
                <FormItem>
                  <FormLabel>Withdrawal end hour</FormLabel>
                  <FormControl><Input {...field} type="number" min="0" max="23" /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
            </div>
          </CardContent>
        </Card>

         {/* ── Payment aggregators ── */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Zap className="w-5 h-5 text-orange-500" />
              Payment aggregators
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* SendavaPay */}
            <div className="space-y-4 rounded-xl border p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-gray-800">SendavaPay</p>
                  <p className="text-xs text-gray-500">
                     Automatic Mobile Money payment for enabled countries
                  </p>
                </div>
                <FormField control={form.control} name="sendavapayEnabled" render={({ field }) => (
                  <FormItem className="flex items-center gap-2 space-y-0">
                    <FormLabel className="text-xs text-gray-500 whitespace-nowrap">
                       {field.value ? "Active" : "Disabled"}
                    </FormLabel>
                    <FormControl>
                      <Switch checked={field.value} onCheckedChange={field.onChange} />
                    </FormControl>
                  </FormItem>
                )} />
              </div>
              <FormField control={form.control} name="sendavapayChannelName" render={({ field }) => (
                <FormItem>
                   <FormLabel>Displayed channel name</FormLabel>
                  <FormControl><Input {...field} placeholder="SendavaPay" /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <div className="rounded-xl bg-orange-50 border border-orange-100 p-3 text-xs text-orange-700 space-y-1">
                <p className="font-semibold">Configuration SendavaPay</p>
                 <p>Configured countries: <strong>TG, BJ, BF, CI, CM</strong></p>
                <p>Add <code className="bg-orange-100 px-1 rounded">SENDAVAPAY_API_KEY</code> to the server Secrets.</p>
                <p>Le secret webhook doit rester dans <code className="bg-orange-100 px-1 rounded">SENDAVAPAY_WEBHOOK_SECRET</code>.</p>
                <p>Webhook : <code className="bg-orange-100 px-1 rounded">/api/webhooks/sendavapay</code></p>
              </div>
            </div>

            {/* WestPay */}
            <div className="space-y-4 rounded-xl border p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-gray-800">WestPay</p>
                  <p className="text-xs text-gray-500">
                     Mobile Money payment by redirecting to the secure page
                  </p>
                </div>
                <FormField control={form.control} name="westpayEnabled" render={({ field }) => (
                  <FormItem className="flex items-center gap-2 space-y-0">
                    <FormLabel className="text-xs text-gray-500 whitespace-nowrap">
                       {field.value ? "Active" : "Disabled"}
                    </FormLabel>
                    <FormControl>
                      <Switch checked={field.value} onCheckedChange={field.onChange} />
                    </FormControl>
                  </FormItem>
                )} />
              </div>
              <FormField control={form.control} name="westpayChannelName" render={({ field }) => (
                <FormItem>
                   <FormLabel>Displayed channel name</FormLabel>
                  <FormControl><Input {...field} placeholder="WestPay" /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="westpayCountries" render={({ field }) => (
                <FormItem>
                  <FormLabel>Enabled countries</FormLabel>
                  <FormControl><Input {...field} placeholder="TG,BJ,BF,CI,CM" /></FormControl>
                  <FormDescription className="text-xs">
                     Use the codes <strong>TG,BJ,BF,CI,CM</strong>. Leave blank for all supported countries.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )} />
              <div className="rounded-xl bg-orange-50 border border-orange-100 p-3 text-xs text-orange-700 space-y-1">
                <p className="font-semibold">Configuration WestPay</p>
                <p>Add <code className="bg-orange-100 px-1 rounded">WESTPAY_MERCHANT_SLUG</code> to the server Secrets.</p>
                 <p>The withdrawal key and webhook secret must remain in the server Secrets.</p>
                <p>Webhook : <code className="bg-orange-100 px-1 rounded">/api/webhooks/westpay</code></p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* ── Commissions ── */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Users className="w-5 h-5 text-primary" />
               Referral commissions
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 gap-4">
              <FormField control={form.control} name="level1Commission" render={({ field }) => (
                <FormItem>
                  <FormLabel>Niveau 1 (%)</FormLabel>
                  <FormControl><Input {...field} type="number" /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="level2Commission" render={({ field }) => (
                <FormItem>
                  <FormLabel>Niveau 2 (%)</FormLabel>
                  <FormControl><Input {...field} type="number" /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="level3Commission" render={({ field }) => (
                <FormItem>
                  <FormLabel>Niveau 3 (%)</FormLabel>
                  <FormControl><Input {...field} type="number" /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
            </div>
          </CardContent>
        </Card>

        <Button type="submit" className="w-full" disabled={updateMutation.isPending}>
          {updateMutation.isPending ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <>
              <Save className="w-4 h-4 mr-2" />
               Save settings
            </>
          )}
        </Button>
      </form>
    </Form>
  );
}
