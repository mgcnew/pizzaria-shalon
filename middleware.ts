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

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const ehRotaAdmin =
    request.nextUrl.pathname.startsWith("/admin") &&
    request.nextUrl.pathname !== "/admin/login";

  if (ehRotaAdmin && !user) {
    const destino = request.nextUrl.clone();
    destino.pathname = "/admin/login";
    destino.searchParams.set("proximo", request.nextUrl.pathname);
    return NextResponse.redirect(destino);
  }

  // Já autenticado não precisa ver a tela de login.
  if (request.nextUrl.pathname === "/admin/login" && user) {
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
