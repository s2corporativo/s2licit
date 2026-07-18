import { useCallback, useState } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export type ConfirmOptions = {
  /** Título curto da ação (ex.: "Excluir proposta?") */
  title: string;
  /** Descrição do impacto — o que será perdido/alterado */
  description: string;
  /** Rótulo do botão de confirmação (padrão: "Confirmar") */
  confirmLabel?: string;
  /** Rótulo do botão de cancelar (padrão: "Cancelar") */
  cancelLabel?: string;
  /** Estiliza o botão de confirmação como ação destrutiva (padrão: true) */
  destructive?: boolean;
};

type PendingConfirm = {
  options: ConfirmOptions;
  resolve: (value: boolean) => void;
};

/**
 * Hook de confirmação baseado no AlertDialog do shadcn.
 * Substitui window.confirm() nativo, retornando uma Promise<boolean>.
 *
 * Uso:
 *   const { confirm, confirmDialog } = useConfirm();
 *   ...
 *   const ok = await confirm({ title: "Excluir?", description: "Isso não pode ser desfeito." });
 *   if (ok) mutate();
 *   ...
 *   return (<> ... {confirmDialog} </>);
 */
export function useConfirm() {
  const [pending, setPending] = useState<PendingConfirm | null>(null);

  const confirm = useCallback((options: ConfirmOptions): Promise<boolean> => {
    return new Promise<boolean>((resolve) => {
      setPending({ options, resolve });
    });
  }, []);

  const settle = useCallback(
    (value: boolean) => {
      setPending((current) => {
        current?.resolve(value);
        return null;
      });
    },
    []
  );

  const opts = pending?.options;
  const destructive = opts?.destructive ?? true;

  const confirmDialog = (
    <AlertDialog
      open={pending !== null}
      onOpenChange={(open) => {
        if (!open) settle(false);
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{opts?.title}</AlertDialogTitle>
          <AlertDialogDescription>{opts?.description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={() => settle(false)}>
            {opts?.cancelLabel ?? "Cancelar"}
          </AlertDialogCancel>
          <AlertDialogAction
            className={
              destructive
                ? "bg-red-600 text-white hover:bg-red-700 focus-visible:ring-red-600/30"
                : undefined
            }
            onClick={() => settle(true)}
          >
            {opts?.confirmLabel ?? "Confirmar"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );

  return { confirm, confirmDialog };
}
