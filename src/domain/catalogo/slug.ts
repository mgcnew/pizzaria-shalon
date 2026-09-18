/**
 * Slug de catálogo.
 *
 * RN-LINK-001: produto, combo e categoria têm link compartilhável. O slug é
 * a parte legível desse link e o banco valida o formato
 * (`^[a-z0-9]+(-[a-z0-9]+)*$`); esta função gera algo que satisfaz aquela
 * constraint a partir de um nome digitado pela Owner.
 *
 * Domínio puro: sem I/O, sem Supabase, sem React.
 */

/** Converte "Pizza Calabresa Especial!" em "pizza-calabresa-especial". */
export function gerarSlug(nome: string): string {
  return nome
    .normalize("NFD")
    // remove os acentos separados pela normalização
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Diz se o slug atende ao formato aceito pelo banco. */
export function slugValido(slug: string): boolean {
  return /^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug);
}
