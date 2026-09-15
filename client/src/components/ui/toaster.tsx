import { useToast } from "@/hooks/use-toast"
import {
  Toast,
  ToastDescription,
  ToastProvider,
  ToastTitle,
  ToastViewport,
  ToastClose,
} from "@/components/ui/toast"
import { CircleAlert, CircleCheck } from "lucide-react"

export function Toaster() {
  const { toasts } = useToast()

  return (
    <ToastProvider>
      {toasts.length > 0 && (
        <div
          className="pointer-events-auto fixed inset-0 z-[199] bg-black/55"
          aria-hidden="true"
        />
      )}
      {toasts.map(function ({ id, title, variant, ...props }) {
        return (
          <Toast key={id} variant={variant} duration={5000} {...props}>
            <div className="flex items-start gap-3">
              {variant === "destructive" ? (
                <CircleAlert className="mt-0.5 h-6 w-6 shrink-0 text-[#e53935]" aria-hidden="true" />
              ) : (
                <CircleCheck className="mt-0.5 h-6 w-6 shrink-0 text-[#1f9d55]" aria-hidden="true" />
              )}
              <div className="min-w-0 flex-1 space-y-1">
                {title && <ToastTitle>{title}</ToastTitle>}
                {props.description && <ToastDescription>{props.description}</ToastDescription>}
              </div>
            </div>
            <ToastClose
              className="inline-flex h-10 w-full items-center justify-center rounded-[9px] bg-[#202020] px-4 text-sm font-semibold text-white transition-colors hover:bg-[#333] focus:outline-none focus:ring-2 focus:ring-[#202020] focus:ring-offset-2"
              aria-label="Fermer le message"
            >
              D&apos;accord
            </ToastClose>
          </Toast>
        )
      })}
      <ToastViewport />
    </ToastProvider>
  )
}
