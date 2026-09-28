"use client";

import { useEffect } from "react";

/** Registra apenas o shell administrativo; não adiciona cache/offline a dados privados. */
export function RegistrarPwaAdmin() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    void navigator.serviceWorker.register("/sw-admin.js", { scope: "/admin" }).catch(() => {
      // A navegação normal continua funcionando quando SW não está disponível.
    });
  }, []);

  return null;
}
