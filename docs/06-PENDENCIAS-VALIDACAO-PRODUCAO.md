# 06 — PENDÊNCIAS DE VALIDAÇÃO PARA PRODUÇÃO
## Sistema de Gestão e Pedidos — Pizzaria Shalon

**Versão:** 1.0 — aberto em 19/09/2026
**Status:** documento vivo
**Função:** concentrar, em um lugar só, o que **não impede** o desenvolvimento
das próximas fases mas **precisa ser resolvido e testado antes da produção**.

---

## 1. Para que serve este documento

Há dois tipos de pendência neste projeto.

A primeira é a **decisão em aberto**: algo que ninguém decidiu ainda e que
bloqueia implementação. Essas vivem na tabela "Decisões em aberto" de
`00-DECISOES.md`, e a regra continua valendo — não invente, pergunte.

A segunda é a **dívida de validação**: o código está escrito, revisado e
coberto por teste automatizado, mas nunca foi exercitado contra o mundo real —
uma API de terceiro, um equipamento físico, os dados verdadeiros da Shalon.
Isso não impede seguir construindo, e impede sim liberar para produção.

Este documento é a lista oficial da segunda categoria.

**Este documento não é fonte normativa.** Ele não decide regra, preço, taxa
nem segurança: aponta o que falta VERIFICAR. As fontes de verdade continuam
sendo `01` a `05` e `CLAUDE.md`.

### Como ler cada seção

Cada pendência traz, sempre:

- **Situação atual** — o que existe de fato hoje, sem otimismo;
- **O que falta configurar** — passos concretos, não intenções;
- **Validação obrigatória futura** — o que precisa ser exercitado e observado;
- **Classificação** — se bloqueia desenvolvimento ou apenas produção.

---

## Google Maps e validação E2E da Fase 5

> **OBRIGATÓRIA ANTES DE PRODUÇÃO — NÃO BLOQUEIA DESENVOLVIMENTO DAS
> PRÓXIMAS FASES.**

### Situação atual

- A integração com o **Google Maps Platform** está implementada, atrás da
  abstração de provedor (`src/infrastructure/rotas/`). Nenhuma regra de
  negócio conhece o Google: o contrato fala em coordenada, confiança e
  distância de rota — não em `place_id` nem em `routes[0]`.
- Os **testes automatizados estão concluídos**: contrato de geocodificação,
  dublê determinístico, provedor `indisponivel`, e 66 cenários SQL que
  exercitam faixa, raio, mínimo, troco, idempotência e exposição pública.
- **A integração real com o Google NÃO foi validada.** Nenhuma chamada saiu
  deste projeto para a Geocoding API ou para a Routes API. O que foi
  verificado é o comportamento contra o *contrato*, não contra o fornecedor.
- A credencial está **temporariamente ausente** porque a configuração de
  billing do Google Cloud será feita depois. É uma decisão de calendário,
  não um impedimento técnico.
- **Nada disso autoriza considerar o Maps validado.** Enquanto esta seção
  não estiver marcada como concluída, a integração é código não exercitado.

### O que falta configurar

| # | Item | Observação |
|---|---|---|
| 1 | Projeto adequado no **Google Cloud** | separado, identificável como o da Shalon |
| 2 | **Billing/faturamento** habilitado | Geocoding e Routes não respondem sem isso |
| 3 | **Geocoding API** habilitada | endereço → coordenada, com nível de precisão |
| 4 | **Routes API** habilitada | distância **rodoviária**; linha reta é proibida (CLAUDE.md §20) |
| 5 | Criação da **credencial server-side** | uma chave, usada só pelo servidor |
| 6 | **Restrições** adequadas da credencial | ver a ressalva sobre a Vercel, logo abaixo |
| 7 | `GOOGLE_MAPS_SERVER_KEY` no ambiente | **nunca no Git**, **nunca em `NEXT_PUBLIC_*`**, nunca em log (CLAUDE.md §13 e §45) |
| 8 | `SHALON_CHECKOUT_ORIGIN_SECRET` no ambiente | obtido uma vez com `select public.ler_segredo_do_servidor('checkout_origem');`, que exige `settings.manage` |
| 9 | **Configurações reais da Shalon** necessárias ao E2E | endereço e coordenadas da loja, horários, faixas de distância, raio automático, distância máxima, formas de pagamento, chave Pix quando houver, e catálogo com preço (liga-se a A-07) |

#### Ressalva sobre restrição de chave na Vercel

A recomendação usual — restringir a chave por **endereço IP de saída** — parte
de um servidor com IP estável. **Não assuma IP fixo na Vercel.** Funções
serverless saem por endereços que podem mudar, e uma restrição por IP mal
dimensionada quebra a entrega em produção de forma intermitente, que é o pior
modo de falhar.

Antes de aplicar a restrição, **verificar qual estratégia o ambiente de deploy
realmente suporta** naquele momento, entre as alternativas possíveis:

- restrição por IP, **somente** se houver egresso estático contratado e os
  endereços forem conhecidos e estáveis;
- restrição **por API** (limitar a chave a Geocoding API + Routes API), que é
  independente de IP e deve ser aplicada em qualquer cenário;
- quotas e alertas de consumo, para que uso anômalo apareça cedo;
- rotação da chave documentada e possível sem downtime.

Restrição **por HTTP referrer não se aplica**: esta chave nunca é usada pelo
navegador. Se algum recurso visual de mapa vier a exigir chave pública no
futuro, ela será **outra credencial**, com outras restrições — jamais a mesma.

### Validação obrigatória futura

Antes da liberação para produção, executar o fluxo real, **em celular**:

```text
celular → cardápio → produto/pizza → carrinho → checkout → endereço real
→ Geocoding API → Routes API → distância rodoviária → faixa → taxa
→ pagamento esperado → criação do pedido → tracking
→ Meus pedidos/Histórico
```

E validar também, caso a caso:

| # | Cenário | O que precisa ser observado |
|---|---|---|
| 1 | **Retirada** | nenhuma chamada ao Google acontece; sem taxa, sem distância |
| 2 | **Entrega dentro do raio automático** | fluxo normal, sem aprovação pendente |
| 3 | **Entrega acima do raio e dentro da área máxima** | taxa calculada, envio permitido, pedido **aguardando aprovação** da Shalon |
| 4 | **Endereço além da área máxima** | entrega bloqueada, retirada oferecida |
| 5 | **Endereço inválido ou ambíguo** | nenhuma coordenada inventada, nenhuma taxa |
| 6 | **Fronteiras `(min, max]`** | conferir nos limites reais das faixas cadastradas, inclusive a faixa iniciada em 0 |
| 7 | **Ausência de faixa** | nunca R$ 0,00; a resposta é "fora de área" ou "entrega não configurada" |
| 8 | **Snapshot** | distância e taxa gravadas no pedido conferem com o que foi cobrado |
| 9 | **Idempotência** | clique duplo e reenvio produzem **um** pedido e o **mesmo** link de acompanhamento |
| 10 | **Segurança do tracking** | token não adivinhável; token errado e pedido inexistente respondem igual; sem telefone completo, coordenada ou dado interno na tela |
| 11 | **Chave Google ausente do cliente** | varrer bundle do navegador, HTML servido, requisições de rede e logs da aplicação |
| 12 | **Falha das APIs Google** | indisponibilidade, timeout, 403 e quota estourada: o checkout recusa com mensagem segura e **não** cria pedido com taxa arbitrária |

Concluída a validação, registrar aqui a data, quem executou e o que foi
observado — e só então marcar a pendência como resolvida, com a entrada
correspondente em `00-DECISOES.md`.

### O que NÃO deve ser feito enquanto a credencial não existe

O comportamento atual é **fail-closed**, e continua assim por decisão
(`D-2026-09-19-35`). Sem provedor disponível:

- **não** inventar distância;
- **não** calcular em linha reta, por CEP ou por bairro;
- **não** assumir taxa, nem "provisória";
- **nunca** transformar ausência de integração em entrega R$ 0,00;
- a **retirada** continua funcionando normalmente, porque não depende do
  Google.

Não alterar a implementação do provedor apenas por falta da chave.

---

## Estado da Fase 5

**Implementada e aprovada para continuidade do desenvolvimento**, com
validação real de Google Maps e E2E **pendentes antes da produção**, conforme
a seção acima.

A integração Google **não está validada**.
