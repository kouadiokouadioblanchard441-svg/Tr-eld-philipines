import { useState } from "react";
import { useLocation, useSearch } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth";
import { Eye, EyeOff, Loader2, LockKeyhole, Phone, ThumbsUp } from "lucide-react";
import { AuthLayout } from "@/components/auth-layout";
import RefreshLoader from "@/components/refresh-loader";

const registerSchema = z.object({
  phone: z.string().min(8, "Numéro WhatsApp invalide"),
  country: z.string().min(2, "Sélectionnez un pays"),
  password: z.string().min(6, "Au moins 6 caractères"),
  confirmPassword: z.string().min(1, "Confirmez votre mot de passe"),
  invitationCode: z.string().optional(),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Les mots de passe ne correspondent pas",
  path: ["confirmPassword"],
});

type RegisterForm = z.infer<typeof registerSchema>;
const REGISTRATION_COUNTRY = "BF";
const REGISTRATION_PHONE_PREFIX = "226";

export default function RegisterPage() {
  const [, navigate] = useLocation();
  const searchString = useSearch();
  const { register } = useAuth();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const params = new URLSearchParams(searchString);
  // The current invitation format is /invitation?invite?code=ABC123.
  // Because the format contains a second "?", parse that part explicitly.
  const currentInvitationMatch = searchString.match(/[?&]code=([^&?#]+)/i);
  const refCode = currentInvitationMatch?.[1]
    || params.get("money")
    || params.get("reg")
    || params.get("code")
    || "";

  const form = useForm<RegisterForm>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      phone: "",
      country: REGISTRATION_COUNTRY,
      password: "",
      confirmPassword: "",
      invitationCode: refCode,
    },
  });

  async function onSubmit(data: RegisterForm) {
    setIsLoading(true);
    try {
      await register({
        fullName: `User_${data.phone}`,
        phone: data.phone,
        country: data.country,
        password: data.password,
        invitationCode: data.invitationCode,
      });
      toast({ title: "Inscription réussie !", description: "Bienvenue chez HSBC !" });
      navigate("/");
    } catch (error: any) {
      toast({ title: "Erreur d’inscription", description: error.message || "Une erreur est survenue", variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <>
      <AuthLayout mode="register" showLanguage>
        <form className="auth-form" onSubmit={form.handleSubmit(onSubmit)}>
        <input type="hidden" {...form.register("country")} />

        <div className="auth-fields">
          <div className="auth-field">
            <span className="auth-prefix" data-testid="country-prefix" aria-label="Pays : Burkina Faso">
              <Phone aria-hidden="true" />
              <span>+{REGISTRATION_PHONE_PREFIX}</span>
            </span>
            <input {...form.register("phone")} type="tel" autoComplete="username" placeholder="Numéro WhatsApp" data-testid="input-phone" />
          </div>
          {form.formState.errors.phone && <p className="auth-error">{form.formState.errors.phone.message}</p>}

          <div className="auth-field">
            <LockKeyhole className="auth-field-icon" aria-hidden="true" />
            <input {...form.register("password")} type={showPassword ? "text" : "password"} autoComplete="new-password" placeholder="Mot de passe" data-testid="input-password" />
            <button type="button" className="auth-visibility" onClick={() => setShowPassword((visible) => !visible)} aria-label={showPassword ? "Masquer le mot de passe" : "Afficher le mot de passe"}>
              {showPassword ? <Eye aria-hidden="true" /> : <EyeOff aria-hidden="true" />}
            </button>
          </div>
          {form.formState.errors.password && <p className="auth-error">{form.formState.errors.password.message}</p>}

          <div className="auth-field">
            <LockKeyhole className="auth-field-icon" aria-hidden="true" />
            <input {...form.register("confirmPassword")} type={showConfirmPassword ? "text" : "password"} autoComplete="new-password" placeholder="Confirmez votre mot de passe" data-testid="input-confirm-password" />
            <button type="button" className="auth-visibility" onClick={() => setShowConfirmPassword((visible) => !visible)} aria-label={showConfirmPassword ? "Masquer la confirmation" : "Afficher la confirmation"}>
              {showConfirmPassword ? <Eye aria-hidden="true" /> : <EyeOff aria-hidden="true" />}
            </button>
          </div>
          {form.formState.errors.confirmPassword && <p className="auth-error">{form.formState.errors.confirmPassword.message}</p>}

          <div className="auth-field">
            <ThumbsUp className="auth-field-icon" aria-hidden="true" />
            <input {...form.register("invitationCode")} placeholder="Code d’invitation" data-testid="input-invitation-code" />
          </div>
        </div>

        <button type="submit" disabled={isLoading} className="auth-submit" data-testid="button-register">
          {isLoading ? <Loader2 className="w-6 h-6 animate-spin" /> : "S’inscrire"}
        </button>
        </form>

      </AuthLayout>
      {isLoading && <RefreshLoader />}
    </>
  );
}
