import type { ProvedorDeRotas } from "./contrato";

/**
 * Provedor principal com RESERVA (D-2026-10-16-142).
 *
 * Geocodificação: tenta o principal; se ele não LOCALIZA (não encontrado ou
 * ambíguo) ou está fora do ar, pergunta à reserva. Uma resposta de sucesso de
 * qualquer um dos dois segue o mesmo rigor — a reserva não é "aceita
 * qualquer coisa", é outra base de ruas com as mesmas exigências.
 *
 * Rota: a do principal; se ele falhar, a da reserva. Coordenada é coordenada:
 * medir a rota até um ponto achado pela reserva não muda a regra.
 *
 * Credencial errada no principal NÃO dispara a reserva para esconder o
 * problema: "configuracao" volta como está, para alguém corrigir.
 */
export function provedorComReserva(principal: ProvedorDeRotas, reserva: ProvedorDeRotas): ProvedorDeRotas {
  return {
    nome: `${principal.nome}+${reserva.nome}`,

    async geocodificar(endereco) {
      const r = await principal.geocodificar(endereco);
      if (r.ok || r.motivo === "configuracao") return r;
      const daReserva = await reserva.geocodificar(endereco);
      // Se a reserva também não achar, a mensagem do principal é a que vale.
      return daReserva.ok ? daReserva : r;
    },

    async rota(origem, destino) {
      const r = await principal.rota(origem, destino);
      if (r.ok || r.motivo === "configuracao") return r;
      const daReserva = await reserva.rota(origem, destino);
      return daReserva.ok ? daReserva : r;
    },
  };
}
