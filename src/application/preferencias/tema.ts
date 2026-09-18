"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { COOKIE_TEMA, temaDoCookie } from "@/ui/tema";

/**
 * Grava a preferência de tema do dispositivo.
 *
 * É Server Action, não JavaScript de cliente: o cookie é escrito pelo
 * servidor, o HTML volta já no tema certo e a tela funciona mesmo sem
 * JavaScript. Nada a sincronizar entre cliente e servidor, e nenhum efeito
 * mexendo no `document` (PI-004).
 *
 * Preferência é do NAVEGADOR, não da loja: não vai para `store_settings`,
 * porque a escolha de uma pessoa não deve valer para a equipe inteira.
 */
export async function definirTema(form: FormData): Promise<void> {
  const tema = temaDoCookie(String(form.get("tema") ?? ""));

  (await cookies()).set(COOKIE_TEMA, tema, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
    // Não é segredo e não carrega dado de pessoa: é só claro ou escuro.
    httpOnly: false,
  });

  // O tema está no `<html>` do layout raiz; revalidar a árvore inteira.
  revalidatePath("/", "layout");
}
