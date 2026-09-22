/**
 * Slot independente para ferramentas modais do administrativo.
 *
 * Em navegação SPA, a página atual permanece montada enquanto `modal` é
 * carregado e exibido. Em acesso direto, a rota canônica continua usando sua
 * página completa. Ver D-2026-09-22-63.
 */
export default function LayoutAdminComModal({
  children,
  modal,
}: {
  children: React.ReactNode;
  modal: React.ReactNode;
}) {
  return (
    <>
      {children}
      {modal}
    </>
  );
}
