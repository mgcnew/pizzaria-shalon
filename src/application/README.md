# Application — casos de uso

Orquestra domínio, acesso a dados, permissões e auditoria. É a camada que as
rotas e Server Actions chamam.

Cada caso de uso valida, nesta ordem: entrada → permissão → estado atual →
regra de domínio → persistência transacional → auditoria.

**Regras:**

- pode importar de `src/domain` e `src/infrastructure`;
- **não** pode importar de `src/app` nem de `src/ui`;
- operações críticas são atômicas (04-REGRAS-NEGOCIO.md §43).

**Fase 1 não implementa caso de uso algum.**
