import { type NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";

/**
 * Middleware de sessão e proteção de rotas internas.
 *
 * Responsabilidades:
 *  1. renovar o cookie de sessão do Supabase Auth a cada requisição;
 *  2. barrar rotas administrativas para quem não está autenticado.
 *
 * Isto é conveniência de navegação, NÃO é a fronteira de segurança: quem
 * protege os dados é o RLS (CLAUDE.md §12). Mesmo que alguém contorne o
 * middleware, o banco continua negando.
 */
/**
 * Rotas do administrativo que NÃO exigem sessão.
 *
 * `redefinir-senha` precisa estar aqui por um detalhe do fluxo: o link de
 * recuperação chega com o token no fragmento da URL, que só existe no
 * navegador. Quando a requisição passa pelo middleware ainda não há sessão
 * nenhuma — se a rota fosse protegida, o usuário seria mandado para o login
 * antes de a página ter chance de consumir o token.
 */
const ROTAS_ADMIN_PUBLICAS = new Set([
  "/admin/login",
  "/admin/esqueci-senha",
  "/admin/redefinir-senha",
]);

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  // Sem configuração de ambiente não há sessão a renovar. A aplicação segue
  // funcionando e as telas mostram o estado de configuração ausente.
  if (!url || !key) return response;

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (cookiesToSet) => {
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value);
        }
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
      },
    },
  });

  // getClaims valida a assinatura do JWT e, em projetos com chave
  // assimétrica, usa a JWKS em cache sem uma viagem ao Auth a cada rota.
  // Nunca usamos getSession aqui: o conteúdo do cookie não seria verificado.
  const { data: claimsData } = await supabase.auth.getClaims();
  const autenticado = typeof claimsData?.claims.sub === "string";

  const ehRotaAdmin =
    request.nextUrl.pathname.startsWith("/admin") &&
    !ROTAS_ADMIN_PUBLICAS.has(request.nextUrl.pathname);

  if (ehRotaAdmin && !autenticado) {
    const destino = request.nextUrl.clone();
    destino.pathname = "/admin/login";
    destino.searchParams.set("proximo", request.nextUrl.pathname);
    return NextResponse.redirect(destino);
  }

  // Já autenticado não precisa ver a tela de login.
  if (request.nextUrl.pathname === "/admin/login" && autenticado) {
    const destino = request.nextUrl.clone();
    destino.pathname = "/admin";
    destino.search = "";
    return NextResponse.redirect(destino);
  }

  return response;
}

export const config = {
  matcher: ["/admin/:path*"],
};
