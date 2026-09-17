# Domain — regras puras

Regras de negócio da Shalon, sem I/O, sem React, sem Supabase.

Aqui entram, nas fases correspondentes: preço efetivo, meio a meio, promoções,
limites, disponibilidade, máquina de estados do pedido, faixas de entrega,
sessão de caixa e conciliação de motoboy.

**Regras:**

- nada aqui importa de `src/app`, `src/ui` ou `src/infrastructure`;
- funções puras e testáveis isoladamente (`tests/domain`);
- uma única implementação por fórmula — não duplicar a regra em telas
  diferentes (CLAUDE.md §17);
- o frontend nunca é autoridade: o mesmo domínio é revalidado no servidor
  (CLAUDE.md §16).

**Fase 1 não implementa regra alguma.** Este diretório existe para fixar a
fronteira arquitetural antes de qualquer feature.
