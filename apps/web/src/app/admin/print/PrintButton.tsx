'use client';

import { Printer } from 'lucide-react';

// Кнопка печати. Отдельный клиентский компонент, чтобы сама печатная
// страница осталась серверной: она читает базу и не нуждается ни в чём
// интерактивном, кроме этой одной кнопки.
//
// `no-print` — класс из печатной вёрстки: на бумаге кнопки быть не должно.
export function PrintButton() {
  return (
    <button
      type="button"
      className="btn btn-primary btn-sm no-print"
      onClick={() => window.print()}
      style={{ display: 'flex', alignItems: 'center', gap: 6 }}
    >
      <Printer size={16} /> Печать
    </button>
  );
}
