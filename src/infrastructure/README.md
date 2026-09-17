# Infrastructure — acesso a dados e serviços externos

Adaptadores para o mundo externo: Supabase, provedor de rotas/geocodificação,
Storage e impressão.

**Regras:**

- nenhuma regra comercial vive aqui — só tradução de/para o mundo externo;
- provedores externos ficam atrás de contrato interno, para que a regra não
  se acople ao fornecedor (CLAUDE.md §20);
- `service_role` nunca aparece em código que chega ao navegador
  (CLAUDE.md §13).

**Fase 1** entrega apenas: validação de ambiente (`env.ts`) e a estrutura dos
clientes Supabase. Nenhum projeto real conectado, nenhuma consulta, nenhuma
migration.
