import { Input, StatusBadge } from "@/ui/components";
import { Cartao, ParDeDados } from "@/ui/patterns";
import { obterLoja, lojaAberta } from "@/application/configuracoes/consultas";
import { salvarLoja, alternarFechamento } from "@/application/configuracoes/acoes";
import { FormularioAcao } from "@/app/(admin)/admin/produtos/_ui/FormularioAcao";

/**
 * "Dados da pizzaria" — seção do design aprovado, que no protótipo era uma
 * lista de pares chave/valor somente leitura.
 *
 * Aqui os mesmos pares aparecem, e abaixo o formulário que os edita: §7.1 da
 * Fase 3 exige que identidade, endereço e coordenadas sejam administráveis,
 * e 79.1 é explícito — "Não hardcodar endereço".
 *
 * A loja pode ainda NÃO estar configurada. Esse é um estado legítimo, não um
 * erro: a Fase 3 entrega a tela, e os dados reais da Shalon são a pendência
 * A-07. Nada foi semeado com valor inventado.
 */
export async function SecaoPizzaria({ podeGerenciar }: { podeGerenciar: boolean }) {
  const loja = await obterLoja();
  const aberta = loja ? await lojaAberta() : false;

  return (
    <div className="flex flex-col gap-4">
      {loja ? (
        <Cartao titulo="Dados da pizzaria">
          <ParDeDados chave="Nome" valor={loja.store_name} />
          <ParDeDados chave="WhatsApp" valor={loja.whatsapp} />
          {loja.phone ? <ParDeDados chave="Telefone" valor={loja.phone} /> : null}
          <ParDeDados
            chave="Endereço"
            valor={`${loja.address_street}, ${loja.address_number}${
              loja.address_complement ? ` — ${loja.address_complement}` : ""
            } · ${loja.address_neighborhood} · ${loja.address_city}/${loja.address_state} · ${loja.address_postal_code}`}
          />
          <ParDeDados
            chave="Coordenadas"
            valor={
              loja.latitude !== null && loja.longitude !== null
                ? `${loja.latitude}, ${loja.longitude}`
                : "ainda não informadas"
            }
          />
          <ParDeDados chave="Fuso horário" valor={loja.timezone} />
          <ParDeDados
            chave="Situação agora"
            valor={
              <StatusBadge tom={aberta ? "sucesso" : "neutro"}>
                {aberta ? "Aberta" : "Fechada"}
              </StatusBadge>
            }
          />
        </Cartao>
      ) : (
        <Cartao titulo="Loja ainda não configurada">
          <p className="m-0 text-[13.5px] text-ink-2">
            Preencha os dados abaixo para o cardápio saber quem é a loja, onde ela fica e em que
            horários funciona. Nada foi preenchido automaticamente: esses dados são da Shalon.
          </p>
        </Cartao>
      )}

      {loja && podeGerenciar ? (
        <Cartao
          titulo={loja.is_temporarily_closed ? "Loja fechada temporariamente" : "Fechar temporariamente"}
          descricao="Fechar não esconde o cardápio: o cliente continua navegando, mas não consegue enviar pedido."
        >
          {loja.is_temporarily_closed ? (
            <p className="mb-3 rounded-12 border border-twb bg-tw px-3 py-[10px] text-[13.5px] font-semibold text-twf">
              Motivo registrado: {loja.temporary_close_reason}
            </p>
          ) : null}
          <FormularioAcao
            acao={alternarFechamento}
            rotulo={loja.is_temporarily_closed ? "Reabrir a loja" : "Fechar agora"}
            variante={loja.is_temporarily_closed ? "primario" : "secundario"}
          >
            <input
              type="hidden"
              name="fechar"
              value={String(!loja.is_temporarily_closed)}
            />
            {!loja.is_temporarily_closed ? (
              <Input
                label="Motivo"
                name="motivo"
                required
                placeholder="Ex.: forno em manutenção"
                hint="Obrigatório: o atendimento precisa saber o que responder ao cliente."
              />
            ) : null}
          </FormularioAcao>
        </Cartao>
      ) : null}

      {podeGerenciar ? (
        <Cartao titulo={loja ? "Editar dados da loja" : "Configurar a loja"}>
          <FormularioAcao acao={salvarLoja} rotulo={loja ? "Salvar" : "Configurar loja"}>
            <Input label="Nome da loja" name="nome" required defaultValue={loja?.store_name ?? ""} />
            <Input
              label="Nome de exibição (opcional)"
              name="nome_exibicao"
              defaultValue={loja?.display_name ?? ""}
            />
            <Input
              label="WhatsApp"
              name="whatsapp"
              required
              defaultValue={loja?.whatsapp ?? ""}
              placeholder="Ex.: 5511988124477"
            />
            <Input label="Telefone (opcional)" name="telefone" defaultValue={loja?.phone ?? ""} />
            <Input label="Logradouro" name="logradouro" required defaultValue={loja?.address_street ?? ""} />
            <Input label="Número" name="numero" required defaultValue={loja?.address_number ?? ""} />
            <Input
              label="Complemento (opcional)"
              name="complemento"
              defaultValue={loja?.address_complement ?? ""}
            />
            <Input label="Bairro" name="bairro" required defaultValue={loja?.address_neighborhood ?? ""} />
            <Input label="Cidade" name="cidade" required defaultValue={loja?.address_city ?? ""} />
            <Input label="UF" name="uf" required maxLength={2} defaultValue={loja?.address_state ?? ""} />
            <Input label="CEP" name="cep" required defaultValue={loja?.address_postal_code ?? ""} />

            {/* 79.2: a coordenada é a origem das rotas. O cálculo de distância
                e o provedor são da Fase 5; aqui só se guarda o ponto. */}
            <Input
              label="Latitude (opcional)"
              name="latitude"
              defaultValue={loja?.latitude ?? ""}
              hint="Origem das rotas de entrega. O cálculo de distância é da Fase 5."
            />
            <Input label="Longitude (opcional)" name="longitude" defaultValue={loja?.longitude ?? ""} />
            <Input label="Fuso horário" name="fuso" defaultValue={loja?.timezone ?? "America/Sao_Paulo"} />

            {!loja ? (
              <>
                <Input label="Entrega: tempo mínimo (min)" name="entrega_min" type="number" min={1} required defaultValue={40} />
                <Input label="Entrega: tempo máximo (min)" name="entrega_max" type="number" min={1} required defaultValue={60} />
                <Input label="Retirada: tempo mínimo (min)" name="retirada_min" type="number" min={1} required defaultValue={20} />
                <Input label="Retirada: tempo máximo (min)" name="retirada_max" type="number" min={1} required defaultValue={30} />
              </>
            ) : null}
          </FormularioAcao>
        </Cartao>
      ) : null}
    </div>
  );
}
