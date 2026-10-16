import type { Metadata } from "next";
import { MolduraDeAcesso } from "../../_ui/MolduraDeAcesso";
import { FormularioRecuperacao } from "./FormularioRecuperacao";

export const metadata: Metadata = { title: "Recuperar acesso" };

/**
 * Recuperação de senha da equipe interna. Mesma moldura do login.
 */
export default function PaginaEsqueciSenha() {
  return (
    <MolduraDeAcesso
      titulo="Recuperar acesso"
      subtitulo="Informe o e-mail da sua conta do painel."
    >
      <FormularioRecuperacao />
    </MolduraDeAcesso>
  );
}
