import { formatBRL } from "@/lib/format";
import { Input, StatusBadge } from "@/ui/components";
import { Cartao, LinhaLista } from "@/ui/patterns";
import { listarFaixas, obterLoja } from "@/application/configuracoes/consultas";
import {
  salvarFaixa,
  removerFaixa,
  alternarAtivoFaixa,
  salvarRegrasDeEntrega,
} from "@/application/configuracoes/acoes";
import { distanciaMaximaAtendida } from "@/domain/entrega/faixas";
import { FormularioAcao } from "@/app/(admin)/admin/produtos/_ui/FormularioAcao";
import { BotaoAcao } from "@/app/(admin)/admin/produtos/_ui/BotaoAcao";
import { servicosDeMapaConfigurados } from "@/infrastructure/rotas";

/**
 * Entrega.
 *
 * ADAPTAÇÃO OBRIGATÓRIA. O design aprovado tem aqui "Bairros e taxas", com o
 * texto "Taxa por região, sem GPS ou cálculo por distância". Isso está
 * SUPERADO por D-2026-09-17-02 e 79.2: a V1 cobra por DISTÂNCIA REAL DE ROTA,
 * com faixas configuráveis. A linguagem visual da seção foi preservada —
 * lista de linhas com valor, pílula de status e botão de editar —, mas o
 * conteúdo passou a ser faixa de km, que é a regra vigente.
 *
 * Nesta fase há apenas a CONFIGURAÇÃO. Geocodificação, provedor de rota e
 * aplicação da taxa a um pedido são da Fase 5.
 */
export async function SecaoEntrega({ podeGerenciar }: { podeGerenciar: boolean }) {
  const [faixas, loja] = await Promise.all([listarFaixas(), obterLoja()]);
  const mapas = servicosDeMapaConfigurados();

  const maxima = distanciaMaximaAtendida(
    faixas.map((f) => ({
      id: f.id,
      distanciaMinKm: Number(f.min_distance_km),
      distanciaMaxKm: Number(f.max_distance_km),
      taxa: Number(f.fee),
      ativa: f.is_active,
    })),
  );

  return (
    <div className="grid items-start gap-4 lg:grid-cols-2">
      <div className="lg:col-span-2">
        <Cartao
          titulo="Serviços de mapa"
          descricao="Localizam o endereço e medem a rota. Mostra só se a chave está configurada neste site — nunca a chave."
          largura="cheio"
        >
          <LinhaLista>
            <span className="min-w-[140px] flex-1 text-[14px] font-semibold text-ink">HERE (principal)</span>
            <StatusBadge tom={mapas.principal ? "sucesso" : "perigo"}>
              {mapas.principal ? "Configurado" : "Sem chave"}
            </StatusBadge>
          </LinhaLista>
          <LinhaLista>
            <span className="min-w-[140px] flex-1 text-[14px] font-semibold text-ink">
              TomTom (reserva, quando o HERE não acha)
            </span>
            <StatusBadge tom={mapas.reserva ? "sucesso" : "atencao"}>
              {mapas.reserva ? "Configurado" : "Sem chave (TOMTOM_API_KEY)"}
            </StatusBadge>
          </LinhaLista>
        </Cartao>
      </div>
      <div className="lg:col-span-2">
        <Cartao
          titulo="Faixas de distância e taxa"
          descricao="A taxa é calculada pela distância real de rota, não em linha reta. Faixas ativas não podem se sobrepor."
          largura="cheio"
        >
          {faixas.length === 0 ? (
            <p className="m-0 py-2 text-[13.5px] text-muted">
              Nenhuma faixa cadastrada. Sem faixa, nenhuma entrega é atendida — e é isso mesmo:
              falha de configuração não pode virar taxa R$ 0,00 acidental.
            </p>
          ) : (
            faixas.map((f) => (
              <LinhaLista key={f.id}>
                <span className="min-w-[140px] flex-1 text-[14px] font-semibold text-ink">
                  de {Number(f.min_distance_km)} km até {Number(f.max_distance_km)} km
                </span>
                <span className="text-[13.5px] text-ink-2">{formatBRL(Number(f.fee))}</span>
                <StatusBadge tom={f.is_active ? "sucesso" : "neutro"}>
                  {f.is_active ? "Ativa" : "Inativa"}
                </StatusBadge>
                {podeGerenciar ? (
                  <>
                    <BotaoAcao
                      acao={alternarAtivoFaixa}
                      campos={{ id: f.id, ativar: String(!f.is_active) }}
                    >
                      {f.is_active ? "Desativar" : "Ativar"}
                    </BotaoAcao>
                    <BotaoAcao acao={removerFaixa} campos={{ id: f.id }} tom="perigo">
                      Excluir
                    </BotaoAcao>
                  </>
                ) : null}
              </LinhaLista>
            ))
          )}

          <p className="mt-3 text-[12.5px] text-muted">
            Distância máxima atendida: <strong>{maxima} km</strong>. Esse número não é um campo — ele
            é a maior faixa ativa, para não existirem duas verdades. Acima dele, a entrega é
            bloqueada no checkout.
          </p>
        </Cartao>
      </div>

      {podeGerenciar ? (
        <Cartao
          titulo="Nova faixa"
          descricao="Defina um intervalo contínuo e o valor cobrado para ele."
          largura="cheio"
        >
          <FormularioAcao acao={salvarFaixa} rotulo="Criar faixa">
            <div className="grid gap-3 sm:grid-cols-2">
              <Input label="De (km)" name="min" inputMode="decimal" required defaultValue="0" />
              <Input label="Até (km)" name="max" inputMode="decimal" required placeholder="Ex.: 2" />
              <Input label="Taxa" name="taxa" inputMode="decimal" required placeholder="Ex.: 7,00" />
              <Input label="Ordem" name="ordem" type="number" min={0} defaultValue={0} />
            </div>
          </FormularioAcao>
        </Cartao>
      ) : null}

      {podeGerenciar && loja ? (
        <Cartao
          titulo="Regras de entrega"
          descricao="Dentro do raio automático o pedido segue normalmente. Entre o raio e a distância máxima, o cliente vê a taxa e o pedido aguarda sua aprovação."
          largura="cheio"
        >
          <FormularioAcao acao={salvarRegrasDeEntrega} rotulo="Salvar regras">
            <Input
              label="Raio de aprovação automática (km)"
              name="raio_automatico"
              inputMode="decimal"
              defaultValue={String(loja.automatic_delivery_radius_km)}
            />
            <label className="flex min-h-touch items-center gap-[10px] text-[14px] font-semibold text-ink">
              <input
                type="checkbox"
                name="minimo_ativo"
                defaultChecked={loja.delivery_minimum_enabled}
                className="h-5 w-5 accent-[var(--brand-orange)]"
              />
              Exigir pedido mínimo
            </label>
            <Input
              label="Valor do pedido mínimo"
              name="minimo_valor"
              inputMode="decimal"
              defaultValue={
                loja.delivery_minimum_subtotal === null
                  ? ""
                  : String(loja.delivery_minimum_subtotal).replace(".", ",")
              }
              hint="Vale somente para entrega e considera o subtotal dos produtos, antes da taxa."
            />
          </FormularioAcao>
        </Cartao>
      ) : null}
    </div>
  );
}
