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

### O arquivo é imutável depois de aplicado

Antes de aplicar: **arquivo no Git → aplicar → conferir**. A conferência é o
md5 já usado no projeto: o md5 de `array_to_string(statements, E'\n')` na
linha de `supabase_migrations.schema_migrations` tem de bater com o md5 do
arquivo versionado.

Depois de aplicada a um banco compartilhado ou persistente, **a migration não
é mais editada** — nem para corrigir, nem para reescrever comentário. O
arquivo passa a ser o registro histórico daquele estado. Correção é **nova
migration**, com o seu próprio arquivo e a sua própria conferência.

Isto não é burocracia nova: é o que CLAUDE.md §11 exige ("toda alteração
estrutural reproduzível por migration versionada") aplicado ao tempo — uma
migration editada depois de aplicada deixa de reproduzir o que foi aplicado.

### Anomalia histórica registrada (22/09/2026)

**Migration afetada:** aplicada no banco de desenvolvimento como
`montar_item_sem_record_indefinido` (versão `20260919012630`); no Git, o
arquivo correspondente é
`migrations/20260919100200_montar_item_escalares.sql`.

**O que aconteceu:** o corpo aplicado (7.804 caracteres, a recriação completa
de `montar_item`) **não foi preservado no Git**. O arquivo versionado tem 16
linhas e é apenas uma nota descrevendo a correção — inclusive afirmando, de
forma incorreta, que "o corpo completo foi aplicado nesta migration".
A migration `20260919100100_mensagens_ao_cliente.sql` tem o mesmo problema em
menor escala: ela registra a alteração de `montar_item` em comentário, sem o
corpo.

**Por que isso importa:** viola a reprodutibilidade histórica exigida por
CLAUDE.md §11. O replay do repositório não reproduz aquele estado
intermediário, porque ele só existe no banco.

**Por que o estado ATUAL continua reproduzível:** `montar_item` foi recriada
integralmente depois, por
`migrations/20260919140450_montar_item_sem_window_em_agregado.sql`, que está
versionada e completa. O que se perdeu foi o passo do meio, não o resultado.

**Comprovação (22/09/2026).** Replay de banco vazio usando exclusivamente os
88 arquivos versionados, em ordem, num projeto Supabase descartável. O schema
reconstruído e o de desenvolvimento têm colunas, constraints e índices
idênticos por md5; as 119 rotinas coincidem; `montar_item` é idêntica byte a
byte fora de comentário (md5 `bb1e312a57f0b664ef59f0517d618abf`).
Regressões que dependem de `montar_item` no banco reconstruído:
`publico_fase4.sql` 96/96, `pedido_manual_fase6.sql` 60/60,
`midia_publica_fase4b.sql` 19/19. Detalhes e divergências cosméticas em
`docs/00-DECISOES.md`, `D-2026-09-22-64`.

**Nada foi editado retroativamente:** a migration histórica aplicada não foi
alterada, `supabase_migrations.schema_migrations` não foi tocada e nenhuma
migration vazia foi criada para esconder a diferença.

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
senha** na tela de login — o link chega por e-mail (D-2026-09-19-51).
`/admin/equipe` cadastra o funcionário e **vincula** o acesso a uma conta que
já exista no Auth (D-2026-09-22-58); criar a conta em si continua fora do
sistema — é a pendência **A-20**.
