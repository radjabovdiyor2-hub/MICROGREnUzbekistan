'use client';

import { useState } from 'react';
import html2canvas from 'html2canvas';

import { useFeedback } from './AdminFeedback';

// ══════════════════════════════════════════════════════════════════════
// Выдача чека: печать, снимок в буфер, системный шаринг.
// Вынесено из AdminPOS — файл перерос 200 строк.
//
// Снимок делается с живого узла чека, поэтому на время съёмки анимация и
// трансформация снимаются: html2canvas рисует по вычисленным стилям и
// иначе ловит промежуточный кадр.
// ══════════════════════════════════════════════════════════════════════

interface SaleResult {
  saleNumber: string;
  isReturn?: boolean;
  date?: string;
  total: number;
  payMethod?: string;
  items?: { product: { nameUz: string; unit?: string | null }; quantity: number; customPrice: number }[];
}

export function usePosReceipt(saleResult: SaleResult | null, fmt: (n: number) => string) {
  // Выдача чека — момент, когда покупатель стоит и ждёт. Нативное окно
  // здесь особенно неуместно: оно перекрывает сам чек, который показывают.
  const notify = useFeedback();
  const [copied, setCopied] = useState(false);
  const [isCapturing, setIsCapturing] = useState(false);

  const buildReceiptText = () => {
    if (!saleResult) return '';
    const lines = [
      `🧾 MICROGREEN UZBEKISTAN`,
      `${saleResult.isReturn ? 'Возврат' : 'Чек'} #${saleResult.saleNumber}`,
      `📅 ${saleResult.date || ''}`,
      `${'─'.repeat(28)}`,
    ];
    if (saleResult.items) {
      saleResult.items.forEach((item, i) => {
        lines.push(`${i+1}. ${item.product.nameUz}`);
        lines.push(`   ${item.quantity} x ${fmt(item.customPrice)} = ${fmt(item.customPrice * item.quantity)} сум`);
      });
    }
    lines.push(`${'─'.repeat(28)}`);
    lines.push(`💰 ${saleResult.isReturn ? 'Возврат' : 'ИТОГО'}: ${saleResult.isReturn ? '-' : ''}${fmt(saleResult.total)} сум`);
    if (saleResult.payMethod) {
      const methodNames: Record<string, string> = { cash: 'Наличные', card: 'Карта', debt: 'В долг' };
      lines.push(`💳 Оплата: ${methodNames[saleResult.payMethod] || saleResult.payMethod}`);
    }
    lines.push(`${'─'.repeat(28)}`);
    lines.push(`Спасибо за покупку!`);
    lines.push(`📞 +998 94 999 95 99`);
    return lines.join('\n');
  };

  const handlePrint = () => {
    const text = buildReceiptText();
    const printWindow = window.open('', '_blank', 'width=380,height=600');
    if (!printWindow) return;
    printWindow.document.write(`<html><head><title>Чек #${saleResult?.saleNumber}</title><style>
      body { font-family: 'Courier New', monospace; font-size: 13px; padding: 16px; max-width: 350px; margin: 0 auto; }
      pre { white-space: pre-wrap; word-wrap: break-word; line-height: 1.6; }
      @media print { body { padding: 0; } }
    </style></head><body><pre>${text}</pre></body></html>`);
    printWindow.document.close();
    setTimeout(() => { printWindow.print(); }, 300);
  };


  const captureReceiptImage = async (): Promise<Blob | null> => {
    const node = document.getElementById('receipt-node');
    if (!node) return null;
    setIsCapturing(true);
    try {
      const originalAnim = node.style.animation;
      const originalTransform = node.style.transform;
      node.style.animation = 'none';
      node.style.transform = 'none';
      
      const canvas = await html2canvas(node, { scale: 2, backgroundColor: null });
      
      node.style.animation = originalAnim;
      node.style.transform = originalTransform;
      
      return await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
    } catch (e) {
      console.error('Capture error', e);
      return null;
    } finally {
      setIsCapturing(false);
    }
  };

  const handleShareImage = async () => {
    const blob = await captureReceiptImage();
    if (!blob) return notify.error('Не получилось собрать картинку чека');
    
    const file = new File([blob], `receipt_${saleResult?.saleNumber}.png`, { type: 'image/png' });
    if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({
          files: [file],
          title: `Чек #${saleResult?.saleNumber}`,
        });
      } catch (e) {
        console.error('Share cancelled or failed', e);
      }
    } else {
      // Fallback to copy if native share not supported
      handleCopyImage(blob);
    }
  };

  const handleCopyImage = async (preCapturedBlob?: Blob) => {
    const blob = preCapturedBlob || await captureReceiptImage();
    if (!blob) return notify.error('Не получилось собрать картинку чека');
    try {
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      // Тост, а не окно: продавец уже нажал «копировать» и хочет вставить
      // картинку, а не закрывать диалог, который встал поверх чека.
      notify.success('Чек скопирован — вставьте в Telegram или WhatsApp');
    } catch (e) {
      console.error('Copy failed', e);
      notify.error('Скопировать не вышло — используйте «Печать»');
    }
  };

  return { copied, isCapturing, buildReceiptText, handlePrint, handleCopyImage, handleShareImage };
}
