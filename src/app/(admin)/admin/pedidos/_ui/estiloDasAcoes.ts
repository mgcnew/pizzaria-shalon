/** Cores por intenção operacional; o texto continua sendo o identificador da ação. */
export const ESTILO_RECEBER = "border-tgb text-tgf hover:bg-tg";

export function estiloDoComando(comando: string, destrutivo: boolean): string {
  if (destrutivo) return "border-tdb text-tdf hover:bg-td";

  switch (comando) {
    case "confirmar_pix":
    case "concluir":
      return "border-tgb text-tgf hover:bg-tg";
    case "marcar_pronto":
      return "border-tib text-tif hover:bg-ti";
    case "iniciar_producao":
      return "border-twb text-twf hover:bg-tw";
    case "aceitar":
    case "aprovar_entrega":
    case "despachar":
      return "border-tib text-tif hover:bg-ti";
    default:
      return "border-border-shalon text-ink hover:bg-elev";
  }
}
