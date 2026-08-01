'use client';

import React from 'react';
import { CheckCircle, Copy, FileText, MessageCircle, Plus } from 'lucide-react';
import { AdminPOSReceiptCard } from './AdminPOSReceiptCard';

import { type SaleResultData } from './posReceiptTypes';
export type { SaleResultData };

interface Props {
  saleResult: SaleResultData;
  fmt: (n: number) => string;
  copied: boolean;
  isCapturing: boolean;
  onPrint: () => void;
  onCopyImage: () => void;
  onShareImage: () => void;
  onNewOperation: () => void;
}

export function AdminPOSReceipt({
  saleResult,
  fmt,
  copied,
  isCapturing,
  onPrint,
  onCopyImage,
  onShareImage,
  onNewOperation,
}: Props) {
  return (
    <div style={{ animation: 'reveal-up 0.5s cubic-bezier(.4,0,.2,1) both' }}>
      <style>{`
        @keyframes receiptSlide { from { transform: translateY(30px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
        @keyframes checkPop { 0% { transform: scale(0); } 50% { transform: scale(1.2); } 100% { transform: scale(1); } }
        @keyframes shimmer { 0% { background-position: -200% 0; } 100% { background-position: 200% 0; } }
        @keyframes fadeInUp { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: translateY(0); } }
        .receipt-btn:hover { transform: translateY(-2px); box-shadow: 0 6px 20px rgba(var(--overlay-dark-rgb), 0.12) !important; }
        .receipt-btn:active { transform: translateY(0); }
        .receipt-zigzag { position: relative; }
        .receipt-zigzag::after {
          content: ''; position: absolute; bottom: -8px; left: 0; right: 0; height: 8px;
          background: linear-gradient(135deg, var(--bg-primary) 25%, transparent 25%) -14px 0,
                      linear-gradient(225deg, var(--bg-primary) 25%, transparent 25%) -14px 0,
                      linear-gradient(315deg, var(--bg-primary) 25%, transparent 25%),
                      linear-gradient(45deg, var(--bg-primary) 25%, transparent 25%);
          background-size: 16px 8px;
          background-color: transparent;
        }
        .receipt-zigzag-top { position: relative; }
        .receipt-zigzag-top::before {
          content: ''; position: absolute; top: -8px; left: 0; right: 0; height: 8px;
          background: linear-gradient(135deg, transparent 75%, var(--bg-primary) 75%),
                      linear-gradient(225deg, transparent 75%, var(--bg-primary) 75%),
                      linear-gradient(315deg, transparent 75%, var(--bg-primary) 75%) 14px 0,
                      linear-gradient(45deg, transparent 75%, var(--bg-primary) 75%) 14px 0;
          background-size: 16px 8px;
          background-color: transparent;
        }
      `}</style>

      <AdminPOSReceiptCard saleResult={saleResult} fmt={fmt} />

      <div style={{ maxWidth: 380, margin: '16px auto 0', display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
          <button className="receipt-btn" onClick={onPrint}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
              padding: '14px', borderRadius: '14px', cursor: 'pointer', fontWeight: 700, fontSize: '14px',
              border: '1.5px solid var(--border)', background: 'var(--bg-primary)', color: 'var(--text-primary)',
              transition: 'all 0.2s ease', boxShadow: '0 2px 8px rgba(var(--overlay-dark-rgb), 0.04)',
            }}>
            <FileText size={18} /> Печать
          </button>
          <button className="receipt-btn" onClick={() => onCopyImage()} disabled={isCapturing}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
              padding: '14px', borderRadius: '14px', cursor: 'pointer', fontWeight: 700, fontSize: '14px',
              border: `1.5px solid ${copied ? 'var(--success)' : 'var(--border)'}`,
              background: copied ? 'var(--success-bg)' : 'var(--bg-primary)',
              color: copied ? 'var(--success)' : 'var(--text-primary)',
              transition: 'all 0.2s ease', boxShadow: '0 2px 8px rgba(var(--overlay-dark-rgb), 0.04)',
              opacity: isCapturing ? 0.7 : 1,
            }}>
            {copied ? <><CheckCircle size={18} /> Скопирован</> : isCapturing ? 'Копируем...' : <><Copy size={18} /> Копировать</>}
          </button>
        </div>

        <div style={{ display: 'flex', gap: '8px' }}>
          <button className="receipt-btn" onClick={onShareImage} disabled={isCapturing}
            style={{
              flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
              padding: '14px', borderRadius: '14px', border: 'none', cursor: 'pointer', fontWeight: 700, fontSize: '14px',
              background: 'linear-gradient(135deg, var(--info), var(--cat-5))', color: 'var(--text-inverse)',
              transition: 'all 0.2s ease', boxShadow: 'var(--shadow-md)',
              opacity: isCapturing ? 0.7 : 1,
            }}>
            <MessageCircle size={18} /> Отправить чек клиенту
          </button>
        </div>

        <button className="receipt-btn" onClick={onNewOperation}
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px',
            width: '100%', padding: '16px', borderRadius: '14px', border: 'none', cursor: 'pointer',
            fontWeight: 800, fontSize: '15px', letterSpacing: '-0.2px',
            background: 'linear-gradient(135deg, var(--brand-primary), var(--brand-primary-hover))',
            color: 'white', transition: 'all 0.2s ease',
            boxShadow: '0 6px 24px rgba(var(--brand-primary-rgb), 0.35)',
          }}>
          <Plus size={20} /> Новая операция
        </button>
      </div>
    </div>
  );
}
