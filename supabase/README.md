# Supabase — banco, segurança e testes

## Ambientes

| Ambiente | Projeto | Ref | Status |
|---|---|---|---|
| Desenvolvimento | `pizzaria-shalon-dev` | `gyifopivitrnzldirmdq` | ativo (sa-east-1) |
| Produção | — | — | **a criar na Fase 11** |

Credenciais ficam em `.env.local`, fora do versionamento. Apenas a chave
**publicável** é usada pela aplicação: ela não concede nada por si, porque todo
acesso passa por RLS. A `service_role` **não é usada em lugar algum** deste
projeto (CLAUDE.md §13).

## Migrations

Versionadas em `migrations/`, aplicadas em ordem de nome. Toda alteração
estrutural passa por migration — nada é alterado manualmente no painel
(CLAUDE.md §11).

## Testes de autorização

`tests/rls_fase2.sql` — 48 cenários positivos e negativos, incluindo escalada de
privilégio e acesso horizontal. Roda em transação e termina em `ROLLBACK`: não
persiste nada.

Executar colando o conteúdo no SQL Editor do projeto, ou via conector. O
resultado final lista cada cenário e o total de aprovados/reprovados.

**Regra:** toda fase seguinte que adicionar tabela sensível acrescenta seus
cenários aqui. Policy sem teste negativo não é considerada pronta
(05-PLANO-IMPLEMENTACAO.md §6.6 e §14.2).

## Usuário de desenvolvimento

Dois usuários Owner/Admin, **apenas no ambiente de desenvolvimento** e nenhum
deles seed de produção (PI-009):

- `dona@pizzariashalon.dev` — funcionário "Ana Shalon" (D-2026-09-18-16);
- `mgc.info.new@gmail.com` — funcionário "Marcelo" (D-2026-09-19-52).

Nenhuma senha está no repositório. Quem perder a sua usa **Esqueci minha
senha** na tela de login — o link chega por e-mail (D-2026-09-19-51). Criar
um usuário interno novo ainda depende de SQL: a tela de equipe é da Fase 8
(A-14).
