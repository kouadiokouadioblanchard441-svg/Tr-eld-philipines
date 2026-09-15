import { useState } from "react";
import { useForm } from "react-hook-form";
import { useMutation, useQuery } from "@tanstack/react-query";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useToast } from "@/hooks/use-toast";
import RefreshLoader from "@/components/refresh-loader";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Edit, Loader2, Target } from "lucide-react";
import type { Task } from "@shared/schema";

const missionSchema = z.object({
  name: z.string().trim().min(2, "Le nom est obligatoire").max(120),
  description: z.string().trim().min(2, "La description est obligatoire").max(500),
  requiredInvites: z.string().min(1, "Le nombre d'invitations est obligatoire"),
  reward: z.string().min(1, "La récompense est obligatoire"),
  sortOrder: z.string().min(1, "L'ordre est obligatoire"),
});

type MissionForm = z.infer<typeof missionSchema>;

export default function AdminMissions() {
  const { toast } = useToast();
  const [selectedMission, setSelectedMission] = useState<Task | null>(null);

  const { data: missions, isLoading } = useQuery<Task[]>({
    queryKey: ["/api/admin/tasks"],
  });

  const editForm = useForm<MissionForm>({
    resolver: zodResolver(missionSchema),
    defaultValues: {
      name: "",
      description: "",
      requiredInvites: "",
      reward: "",
      sortOrder: "1",
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: Partial<Task> }) => {
      const response = await apiRequest("PATCH", `/api/admin/tasks/${id}`, data);
      if (!response.ok) {
        const result = await response.json();
        throw new Error(result.message || "Impossible de modifier la mission");
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/tasks"] });
      queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
      toast({ title: "Mission mise à jour" });
      setSelectedMission(null);
    },
    onError: (error: Error) => {
      toast({ title: "Erreur", description: error.message, variant: "destructive" });
    },
  });

  const openEdit = (mission: Task) => {
    setSelectedMission(mission);
    editForm.reset({
      name: mission.name,
      description: mission.description,
      requiredInvites: mission.requiredInvites.toString(),
      reward: mission.reward.toString(),
      sortOrder: mission.sortOrder.toString(),
    });
  };

  const saveMission = (data: MissionForm) => {
    if (!selectedMission) return;
    updateMutation.mutate({
      id: selectedMission.id,
      data: {
        name: data.name,
        description: data.description,
        requiredInvites: Number(data.requiredInvites),
        reward: Number(data.reward),
        sortOrder: Number(data.sortOrder),
      },
    });
  };

  const toggleMission = (mission: Task, isActive: boolean) => {
    updateMutation.mutate({ id: mission.id, data: { isActive } });
  };

  const activeMissions = missions?.filter((mission) => mission.isActive) ?? [];
  const archivedCount = (missions?.length ?? 0) - activeMissions.length;

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="flex items-start gap-3 p-4">
          <Target className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
          <div className="text-sm">
            <p className="font-semibold">Centre des missions</p>
            <p className="mt-1 text-muted-foreground">
              Les missions affichées aux utilisateurs viennent de la base de données. Vous pouvez modifier leurs valeurs ici sans changer le code.
            </p>
            {archivedCount > 0 && (
              <p className="mt-1 text-xs text-muted-foreground">
                {archivedCount} ancienne{archivedCount > 1 ? "s" : ""} mission{archivedCount > 1 ? "s" : ""} archivée{archivedCount > 1 ? "s" : ""} pour préserver l&apos;historique.
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {activeMissions.length} mission{activeMissions.length > 1 ? "s" : ""} active{activeMissions.length > 1 ? "s" : ""}
        </p>
      </div>

      {isLoading ? (
        <RefreshLoader />
      ) : activeMissions.length > 0 ? (
        activeMissions.map((mission) => (
          <Card key={mission.id}>
            <CardContent className="space-y-4 p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-semibold text-foreground">{mission.name}</p>
                    <Badge variant="default">Active</Badge>
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">{mission.description}</p>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <Switch
                    checked={mission.isActive}
                    onCheckedChange={(checked) => toggleMission(mission, checked)}
                    disabled={updateMutation.isPending}
                    data-testid={`switch-mission-${mission.id}`}
                  />
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => openEdit(mission)}
                    data-testid={`button-edit-mission-${mission.id}`}
                  >
                    <Edit className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2 text-sm">
                <div>
                  <p className="text-muted-foreground">Invitations</p>
                  <p className="font-medium">{mission.requiredInvites}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Récompense</p>
                  <p className="font-medium">{mission.reward.toLocaleString()} GPB</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Ordre</p>
                  <p className="font-medium">{mission.sortOrder}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        ))
      ) : (
        <div className="py-8 text-center text-muted-foreground">Aucune mission active</div>
      )}

      <Dialog open={!!selectedMission} onOpenChange={(open) => { if (!open) setSelectedMission(null); }}>
        <DialogContent className="max-h-[90vh] max-w-md overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Modifier la mission</DialogTitle>
          </DialogHeader>
          <Form {...editForm}>
            <form onSubmit={editForm.handleSubmit(saveMission)} className="space-y-4">
              <FormField
                control={editForm.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Nom</FormLabel>
                    <FormControl><Input {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={editForm.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Description</FormLabel>
                    <FormControl><Input {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={editForm.control}
                  name="requiredInvites"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Invitations requises</FormLabel>
                      <FormControl><Input {...field} type="number" min="1" /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={editForm.control}
                  name="reward"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Récompense (GPB)</FormLabel>
                      <FormControl><Input {...field} type="number" min="1" /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <FormField
                control={editForm.control}
                name="sortOrder"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Ordre d&apos;affichage</FormLabel>
                    <FormControl><Input {...field} type="number" min="0" /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <Button type="submit" className="w-full" disabled={updateMutation.isPending} data-testid="button-save-mission">
                {updateMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Enregistrer"}
              </Button>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </div>
  );
}