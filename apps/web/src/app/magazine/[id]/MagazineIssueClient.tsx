'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { MagazineIssue } from '@/lib/magazine';
import dynamic from 'next/dynamic';

export default function MagazineIssueClient({ issue }: { issue: MagazineIssue }) {
  const [scrollProgress, setScrollProgress] = useState(0);

  useEffect(() => {
    const handleScroll = () => {
      const totalScroll = document.documentElement.scrollTop;
      const windowHeight = document.documentElement.scrollHeight - document.documentElement.clientHeight;
      const scroll = `${totalScroll / windowHeight}`;
      setScrollProgress(Number(scroll));
    };
    
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const handleShare = async () => {
    const url = window.location.href;
    if (navigator.share) {
      try {
        await navigator.share({
          title: `FRESH WEEKLY — Выпуск №${issue.id}`,
          text: issue.title,
          url: url,
        });
      } catch (e) {
        console.error(e);
      }
    } else {
      navigator.clipboard.writeText(url);
      alert('Ссылка скопирована в буфер обмена!');
    }
  };

  return (
    <div style={{
      minHeight: '100vh',
      background: 'var(--bg-primary, #0B0B14)',
      color: 'var(--text-primary, #fff)',
    }}>
      {/* ═══════ READING PROGRESS BAR ═══════ */}
      <div style={{
        position: 'fixed',
        top: 0, left: 0, right: 0,
        height: '4px',
        background: 'rgba(255,255,255,0.1)',
        zIndex: 9999,
      }}>
        <div style={{
          height: '100%',
          background: 'var(--brand-primary)',
          width: `${scrollProgress * 100}%`,
          transition: 'width 0.1s ease-out'
        }} />
      </div>

      <article>
        {/* ═══════ HERO SECTION ═══════ */}
        <section style={{
          position: 'relative',
          padding: '120px 20px 80px',
          textAlign: 'center',
          background: 'var(--bg-mesh)',
          borderBottom: '1px solid var(--border)',
        }}>
          <p style={{
            fontFamily: "'Inter', sans-serif",
            fontSize: '12px', fontWeight: 700, letterSpacing: '3px',
            color: 'var(--brand-primary)', textTransform: 'uppercase',
            marginBottom: '16px',
          }}>
            FRESH WEEKLY • ВЫПУСК №{issue.id}
          </p>

          <h1 style={{
            fontFamily: "'Playfair Display', serif",
            fontSize: 'clamp(40px, 8vw, 72px)', fontWeight: 900,
            lineHeight: 1.1, marginBottom: '24px',
            color: 'var(--text-primary)',
            maxWidth: '1000px', margin: '0 auto 24px',
          }}>
            {issue.title}
          </h1>

          <p style={{
            fontFamily: "'Inter', sans-serif",
            fontSize: '16px', color: 'var(--text-secondary)',
            marginBottom: '40px',
          }}>
            {issue.date}
          </p>

          <div style={{
            maxWidth: '800px', margin: '0 auto',
            aspectRatio: '16 / 9', borderRadius: '24px', overflow: 'hidden',
            boxShadow: 'var(--shadow-xl)',
          }}>
            <img src={issue.cover} alt="Cover" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          </div>
        </section>

        {/* ═══════ EDITORIAL CONTENT ═══════ */}
        <section id="content" style={{
          maxWidth: '720px', margin: '0 auto', padding: '60px 20px 100px',
        }}>
          {/* Article Meta */}
          <div style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            paddingBottom: '24px', borderBottom: '1px solid var(--border)', marginBottom: '40px'
          }}>
            <div style={{ display: 'flex', gap: '12px' }}>
              <button onClick={handleShare} style={{
                background: 'var(--bg-elevated)', border: '1px solid var(--border)',
                padding: '8px 16px', borderRadius: '30px', color: 'var(--text-primary)',
                fontFamily: "'Inter', sans-serif", fontSize: '14px', fontWeight: 600, cursor: 'pointer'
              }}>
                🔗 Поделиться
              </button>
              {issue.pdfUrl && (
                <a href={issue.pdfUrl} target="_blank" style={{
                  background: 'var(--bg-elevated)', border: '1px solid var(--border)',
                  padding: '8px 16px', borderRadius: '30px', color: 'var(--text-primary)',
                  fontFamily: "'Inter', sans-serif", fontSize: '14px', fontWeight: 600, textDecoration: 'none'
                }}>
                  🖨 PDF Версия
                </a>
              )}
            </div>
          </div>

          {/* Content Body */}
          <div 
            className="editorial-content"
            style={{
              fontFamily: "'Playfair Display', serif",
              fontSize: '20px',
              lineHeight: '1.8',
              color: 'var(--text-primary)',
            }}
          >
            {issue.contentHtml ? (
              <div dangerouslySetInnerHTML={{ __html: issue.contentHtml }} />
            ) : (
              <div>
                <p style={{ marginBottom: '24px' }}>
                  Этот выпуск в данный момент доступен только в печатной версии или готовится к публикации в цифровом формате.
                </p>
                
                {/* Embedded AR Teaser for demonstration */}
                <div style={{
                  margin: '48px 0', padding: '32px', borderRadius: '24px',
                  background: 'linear-gradient(135deg, rgba(16,185,129,0.1), transparent)',
                  border: '1px solid var(--border)', textAlign: 'center'
                }}>
                  <h3 style={{ fontFamily: "'Playfair Display', serif", fontSize: '28px', marginBottom: '16px' }}>
                    Испытайте AR-Магию прямо сейчас
                  </h3>
                  <p style={{ fontFamily: "'Inter', sans-serif", fontSize: '16px', color: 'var(--text-secondary)', marginBottom: '24px' }}>
                    В печатной версии этого журнала спрятаны интерактивные 3D-модели.
                  </p>
                  <Link href="/magazine/ar" style={{
                    display: 'inline-block',
                    background: 'var(--brand-primary)', color: '#fff',
                    padding: '12px 24px', borderRadius: '30px',
                    fontFamily: "'Inter', sans-serif", fontSize: '15px', fontWeight: 700, textDecoration: 'none'
                  }}>
                    Открыть сканер
                  </Link>
                </div>
              </div>
            )}
          </div>
          
          <div style={{ marginTop: '80px', textAlign: 'center' }}>
            <Link href="/magazine" style={{
              display: 'inline-block',
              fontFamily: "'Inter', sans-serif", color: 'var(--text-secondary)',
              textDecoration: 'none', fontSize: '16px', fontWeight: 600,
              padding: '12px 24px', borderRadius: '30px', border: '1px solid var(--border)',
            }}>
              ← Вернуться к списку выпусков
            </Link>
          </div>
        </section>
      </article>

      {/* Global styles for editorial content specific to this page */}
      <style dangerouslySetInnerHTML={{__html: `
        .editorial-content p {
          margin-bottom: 24px;
        }
        .editorial-content h2, .editorial-content h3 {
          font-family: 'Playfair Display', serif;
          font-weight: 800;
          margin: 48px 0 24px;
          line-height: 1.3;
        }
        .editorial-content blockquote {
          font-size: 28px;
          font-style: italic;
          border-left: 4px solid var(--brand-primary);
          padding-left: 24px;
          margin: 48px 0;
          color: var(--brand-primary);
        }
        .editorial-content img {
          width: 100%;
          border-radius: 16px;
          margin: 32px 0;
        }
      `}} />
    </div>
  );
}
