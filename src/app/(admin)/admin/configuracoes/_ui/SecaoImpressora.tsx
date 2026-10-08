"use client";

import { useState } from "react";
import { Button } from "@/ui/components";
import { Aviso, Cartao, ParDeDados } from "@/ui/patterns";
import { COLUNAS, type Papel } from "@/domain/pedidos/comanda";
import {
  salvarImpressoraDoAparelho,
  useImpressoraDoAparelho,
  type ModoDeImpressao,
} from "@/ui/impressao/impressoraDoAparelho";
import { imprimirLinhas, linhasDeTeste } from "@/ui/impressao/imprimir";

/**
 * "Impressora" — seção do design aprovado, que ficou de fora enquanto não
 * havia equipamento para provar (A-08). Agora existe (D-2026-10-08-116).
 *
 * DIFERENÇA DELIBERADA EM RELAÇÃO ÀS OUTRAS SEÇÕES: isto não é configuração
 * da loja. Vale só para o aparelho em que foi feito, porque a impressora
 * está ligada nele. Por isso não passa por `settings.manage` nem vai para a
 * auditoria — não muda nada para ninguém além de quem está neste aparelho.
 */

const PAPEIS: { valor: Papel; titulo: string; detalhe: string }[] = [
  { valor: "80", titulo: "80 mm", detalhe: `Impressora de balcão. ${COLUNAS["80"]} colunas.` },
  { valor: "58", titulo: "58 mm", detalhe: `Impressora portátil. ${COLUNAS["58"]} colunas.` },
];

const MODOS: { valor: ModoDeImpressao; titulo: string; detalhe: string }[] = [
  {
    valor: "sistema",
    titulo: "Imprimir direto",
    detalhe: "Manda para a impressora padrão deste aparelho assim que a comanda é emitida.",
  },
  {
    valor: "tela",
    titulo: "Só mostrar na tela",
    detalhe: "A comanda aparece para conferir; a impressão é feita por fora do sistema.",
  },
];

const ATALHO_CHROME = '"C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe" --kiosk-printing';

function Opcoes<T extends string>({
  rotulo,
  opcoes,
  atual,
  aoEscolher,
}: {
  rotulo: string;
  opcoes: { valor: T; titulo: string; detalhe: string }[];
  atual: T;
  aoEscolher: (valor: T) => void;
}) {
  return (
    <div role="radiogroup" aria-label={rotulo} className="flex flex-col gap-2">
      <p className="m-0 text-[12px] font-bold uppercase tracking-[0.06em] text-muted">{rotulo}</p>
      {opcoes.map((opcao) => {
        const ativa = opcao.valor === atual;
        return (
          <button
            key={opcao.valor}
            type="button"
            role="radio"
            aria-checked={ativa}
            onClick={() => aoEscolher(opcao.valor)}
            className={[
              "flex min-h-touch w-full cursor-pointer items-start gap-3 rounded-12 border-[1.5px] px-3 py-2.5 text-left",
              ativa ? "border-brand-red bg-elev" : "border-border-shalon bg-surface hover:border-brand-orange",
            ].join(" ")}
          >
            <span
              aria-hidden="true"
              className={[
                "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2",
                ativa ? "border-brand-red" : "border-border-shalon",
              ].join(" ")}
            >
              {ativa ? <span className="h-2.5 w-2.5 rounded-full bg-brand-red" /> : null}
            </span>
            <span className="min-w-0">
              <span className="block text-[14px] font-semibold text-ink">{opcao.titulo}</span>
              <span className="block text-[12.5px] text-ink-2">{opcao.detalhe}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}

export function SecaoImpressora() {
  const impressora = useImpressoraDoAparelho();
  const [aviso, setAviso] = useState<{ erro?: string; ok?: string }>({});
  const [imprimindo, setImprimindo] = useState(false);
  const [copiado, setCopiado] = useState(false);

  function salvar(nova: typeof impressora) {
    const guardou = salvarImpressoraDoAparelho(nova);
    setAviso(
      guardou
        ? { ok: "Salvo neste aparelho." }
        : {
            erro: "Este navegador não deixou guardar a configuração (aba anônima ou dados bloqueados). Ela vale só até fechar a aba.",
          },
    );
  }

  async function testar() {
    setAviso({});
    setImprimindo(true);
    try {
      await imprimirLinhas(linhasDeTeste(impressora.papel), impressora.papel);
      setAviso({ ok: "Teste enviado. Confira se a régua coube numa linha só e se os acentos saíram certos." });
    } catch {
      setAviso({ erro: "O navegador não conseguiu enviar o teste para a impressora." });
    } finally {
      setImprimindo(false);
    }
  }

  async function copiarAtalho() {
    try {
      await navigator.clipboard.writeText(ATALHO_CHROME);
      setCopiado(true);
      window.setTimeout(() => setCopiado(false), 2000);
    } catch {
      setCopiado(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <Cartao
        titulo="Impressora deste aparelho"
        descricao="Vale só para este computador ou celular. Cada aparelho guarda a sua — mudar aqui não muda nos outros."
      >
        <div className="flex flex-col gap-4">
          <Opcoes
            rotulo="Papel"
            opcoes={PAPEIS}
            atual={impressora.papel}
            aoEscolher={(papel) => salvar({ ...impressora, papel })}
          />
          <Opcoes
            rotulo="Ao emitir a comanda"
            opcoes={MODOS}
            atual={impressora.modo}
            aoEscolher={(modo) => salvar({ ...impressora, modo })}
          />

          <div>
            <ParDeDados chave="Documento" valor="Comanda não fiscal" />
            <ParDeDados chave="Reimpressão" valor="Fica registrada, com autor e horário" />
            <ParDeDados chave="Cupons do PDV e fechamento de caixa" valor={`Saem em ${impressora.papel} mm`} />
          </div>

          <Aviso {...aviso} />

          <div>
            <Button type="button" variante="secundario" disabled={imprimindo} onClick={testar}>
              {imprimindo ? "Enviando…" : "Teste de impressão"}
            </Button>
          </div>
        </div>
      </Cartao>

      <Cartao
        titulo="Imprimir sem a janela de escolha (Windows)"
        descricao="Por segurança, o navegador sempre pergunta a impressora — a não ser que seja aberto por um atalho preparado para o balcão. Faz-se uma vez só."
      >
        <ol className="m-0 flex list-decimal flex-col gap-3 pl-5 text-[13.5px] text-ink">
          <li>
            Instale o driver da impressora de 80 mm e deixe-a como <strong>impressora padrão</strong>{" "}
            em Configurações do Windows → Bluetooth e dispositivos → Impressoras e scanners.
            Desligue a opção &quot;Permitir que o Windows gerencie minha impressora padrão&quot;.
          </li>
          <li>
            Nas preferências da impressora, confira que o papel é o <strong>rolo de 80 mm</strong>.
          </li>
          <li>
            Clique com o botão direito no atalho do Chrome → Propriedades. No campo{" "}
            <strong>Destino</strong>, deixe assim:
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <code className="min-w-0 break-all rounded-10 bg-elev px-3 py-2 font-mono text-[12px] text-ink">
                {ATALHO_CHROME}
              </code>
              <Button type="button" variante="fantasma" tamanho="sm" onClick={copiarAtalho}>
                {copiado ? "Copiado" : "Copiar"}
              </Button>
            </div>
          </li>
          <li>
            Feche <strong>todas</strong> as janelas do Chrome e abra pelo atalho. Aqui, escolha 80 mm e
            &quot;Imprimir direto&quot;, e faça o teste de impressão.
          </li>
        </ol>
        <p className="mb-0 mt-3 text-[12.5px] text-muted">
          No Microsoft Edge funciona igual, com <code className="font-mono">msedge.exe --kiosk-printing</code>. O
          atalho não muda mais nada no navegador: só tira a janela de escolha da impressão.
        </p>
      </Cartao>
    </div>
  );
}
