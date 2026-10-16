import type { Metadata } from "next";
import { MolduraDeAcesso } from "../../_ui/MolduraDeAcesso";
import { FormularioNovaSenha } from "./FormularioNovaSenha";

export const metadata: Metadata = {
  title: "Definir nova senha",
  // A URL carrega o token de recuperação: não deve entrar em índice.
  robots: { index: false, follow: false },
};

export default function PaginaRedefinirSenha() {
  return (
    <MolduraDeAcesso
      titulo="Definir nova senha"
      subtitulo="Escolha a senha que você vai usar no painel."
    >
      <FormularioNovaSenha />
    </MolduraDeAcesso>
  );
}
