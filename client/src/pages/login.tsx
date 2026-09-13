import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth";
import { Eye, EyeOff, Loader2, LockKeyhole, Phone } from "lucide-react";
import { AuthLayout } from "@/components/auth-layout";
import RefreshLoader from "@/components/refresh-loader";

const loginSchema = z.object({
  phone: z.string().regex(/^[0-9]{8}$/, "Vous devez avoir un numéro de téléphone de 8 chiffres"),
  country: z.string().min(2, "Sélectionnez un pays"),
  password: z.string().min(1, "Le mot de passe est obligatoire"),
});

type LoginForm = z.infer<typeof loginSchema>;
const LOGIN_COUNTRY = "BF";
const LOGIN_PHONE_PREFIX = "226";

export default function LoginPage() {
  const [, navigate] = useLocation();
  const { login } = useAuth();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const form = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      phone: "",
      country: LOGIN_COUNTRY,
      password: "",
    },
  });

  useEffect(() => {
    // Remove credentials persisted by versions that stored login data locally.
    localStorage.removeItem("doosan_credentials");
    localStorage.removeItem("doosan_login_preferences");
  }, []);

  async function onSubmit(data: LoginForm) {
    setIsLoading(true);
    try {
      await login(data.phone, data.country, data.password);
      navigate("/");
    } catch (error: any) {
      toast({ title: "Erreur de connexion", description: error.message || "Vérifiez vos informations", variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <>
      <AuthLayout mode="login" showLanguage>
        <form className="auth-form" onSubmit={form.handleSubmit(onSubmit)}>
        <input type="hidden" {...form.register("country")} />

        <div className="auth-fields">
          <div className="auth-field">
            <span className="auth-prefix" data-testid="country-prefix" aria-label="Pays : Burkina Faso">
              <Phone aria-hidden="true" />
              <span>+{LOGIN_PHONE_PREFIX}</span>
            </span>
            <input {...form.register("phone")} type="tel" inputMode="numeric" autoComplete="username" placeholder="Numéro WhatsApp" data-testid="input-phone" />
          </div>
          {form.formState.errors.phone && <p className="auth-error">{form.formState.errors.phone.message}</p>}

          <div className="auth-field">
            <LockKeyhole className="auth-field-icon" aria-hidden="true" />
            <input {...form.register("password")} type={showPassword ? "text" : "password"} autoComplete="current-password" placeholder="Mot de passe" data-testid="input-password" />
            <button type="button" className="auth-visibility" onClick={() => setShowPassword((visible) => !visible)} aria-label={showPassword ? "Masquer le mot de passe" : "Afficher le mot de passe"}>
              {showPassword ? <Eye aria-hidden="true" /> : <EyeOff aria-hidden="true" />}
            </button>
          </div>
          {form.formState.errors.password && <p className="auth-error">{form.formState.errors.password.message}</p>}
        </div>

        <button type="submit" disabled={isLoading} className="auth-submit" data-testid="button-login">
          {isLoading ? <Loader2 className="w-6 h-6 animate-spin" /> : "Se connecter"}
        </button>
        </form>

      </AuthLayout>
      {isLoading && <RefreshLoader />}
    </>
  );
}
