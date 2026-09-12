import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { DISPLAY_CURRENCY } from "@/lib/countries";
import { Pencil, Globe } from "lucide-react";
import type { Country } from "@shared/schema";
import RefreshLoader from "@/components/refresh-loader";

interface CountryForm {
  code: string;
  name: string;
  currency: string;
  phonePrefix: string;
  operators: string;
  isActive: boolean;
}

const emptyForm: CountryForm = {
  code: "TG",
  name: "Togo",
  currency: "XOF",
  phonePrefix: "228",
  operators: "",
  isActive: true,
};

export default function AdminCountries() {
  const { toast } = useToast();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<CountryForm>(emptyForm);

  const { data: countriesList, isLoading } = useQuery<Country[]>({
    queryKey: ["/api/admin/countries"],
  });

  const saveMutation = useMutation({
    mutationFn: async (data: CountryForm) => {
      const payload = {
        ...data,
        operators: JSON.stringify(
          data.operators.split(",").map(o => o.trim()).filter(Boolean)
        ),
      };
      if (editingId) {
        const res = await apiRequest("PUT", `/api/admin/countries/${editingId}`, payload);
        if (!res.ok) throw new Error((await res.json()).message);
        return res.json();
      } else {
        const res = await apiRequest("POST", "/api/admin/countries", payload);
        if (!res.ok) throw new Error((await res.json()).message);
        return res.json();
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/countries"] });
      queryClient.invalidateQueries({ queryKey: ["/api/countries"] });
      toast({ title: editingId ? "Country updated!" : "Country added!" });
      setDialogOpen(false);
      setForm(emptyForm);
      setEditingId(null);
    },
    onError: (e: any) => {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    },
  });

  const openEdit = (c: Country) => {
    let operatorsStr = "";
    try { operatorsStr = JSON.parse(c.operators).join(", "); } catch {}
    setForm({
      code: c.code,
      name: c.name,
      currency: c.currency,
      phonePrefix: c.phonePrefix,
      operators: operatorsStr,
      isActive: c.isActive,
    });
    setEditingId(c.id);
    setDialogOpen(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    saveMutation.mutate(form);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <Globe className="w-5 h-5" />
          Countries and operators
        </h2>
      </div>

      {isLoading && <RefreshLoader />}

      <div className="grid gap-3">
        {countriesList?.map((c) => {
          let ops: string[] = [];
          try { ops = JSON.parse(c.operators); } catch {}
          return (
            <Card key={c.id} data-testid={`card-country-${c.id}`}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-semibold text-base">{c.name}</span>
                      <Badge variant="outline" className="text-xs">{c.code}</Badge>
                       <Badge variant="secondary" className="text-xs">{DISPLAY_CURRENCY}</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground mb-1">
                      Indicatif: +{c.phonePrefix}
                    </p>
                    {ops.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {ops.map((op) => (
                          <Badge key={op} variant="outline" className="text-xs font-normal">{op}</Badge>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <Button size="icon" variant="ghost" onClick={() => openEdit(c)} data-testid={`button-edit-country-${c.id}`}>
                      <Pencil className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
        {countriesList?.length === 0 && (
          <p className="text-muted-foreground text-sm text-center py-8">No countries configured</p>
        )}
      </div>

      {/* Add/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={(v) => { if (!v) { setDialogOpen(false); setEditingId(null); setForm(emptyForm); }}}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Edit country and operators</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Country code (e.g. TD)</Label>
                <Input
                  value={form.code}
                  placeholder="TG"
                  maxLength={3}
                  disabled
                  required
                  data-testid="input-country-code"
                />
              </div>
              <div>
                  <Label>Provider currency (XOF/XAF)</Label>
                <Input
                  value={form.currency}
                  placeholder="XOF"
                  maxLength={5}
                  disabled
                  data-testid="input-country-currency"
                />
              </div>
            </div>
            <div>
              <Label>Country name</Label>
              <Input
                value={form.name}
                placeholder="Togo"
                disabled
                data-testid="input-country-name"
              />
            </div>
            <div>
              <Label>Phone prefix (without +)</Label>
              <Input
                value={form.phonePrefix}
                placeholder="228"
                disabled
                data-testid="input-country-prefix"
              />
            </div>
            <div>
              <Label>Operators (comma-separated)</Label>
              <Input
                value={form.operators}
                onChange={e => setForm({ ...form, operators: e.target.value })}
                placeholder="T-Money, Moov Money"
                data-testid="input-country-operators"
              />
              <p className="text-xs text-muted-foreground mt-1">These operators control the mobile accounts and payment numbers for this country.</p>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => { setDialogOpen(false); setEditingId(null); setForm(emptyForm); }}>
                Cancel
              </Button>
              <Button type="submit" disabled={saveMutation.isPending} data-testid="button-save-country">
                {saveMutation.isPending ? "Enregistrement..." : "Enregistrer"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

    </div>
  );
}
