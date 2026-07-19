'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import Script from 'next/script';

/* ─────────────────────────────────────────────
   AR Viewer — Premium Holographic Experience
   Роут: microgreenuzbekistan.com/magazine/ar
   Стек: MindAR + A-Frame (WebAR без приложений)

   Персонажи: «Агро Друзья» из FRESH WEEKLY
   - Томи 🍅  Фермер +15% урожай
   - Брок 🥦  Щит от вредителей
   - Ягодка 🍓  Магия роста +20%
   - Робо 🤖  Авто-сбор 24/7
   - Листо 🍃  Самурай качества
   - Трак 🚜  Доставка x2
   ───────────────────────────────────────────── */

const CHARACTERS = [
  { id: 'tomi', name: 'Томи', emoji: '🍅', desc: 'Фермер +15% урожай', modelUrl: 'https://cdn.jsdelivr.net/gh/KhronosGroup/glTF-Sample-Models/2.0/Avocado/glTF-Binary/Avocado.glb' },
  { id: 'brok', name: 'Брок', emoji: '🥦', desc: 'Щит от вредителей', modelUrl: 'https://cdn.jsdelivr.net/gh/KhronosGroup/glTF-Sample-Models/2.0/Fox/glTF-Binary/Fox.glb' },
  { id: 'yagodka', name: 'Ягодка', emoji: '🍓', desc: 'Магия роста +20%', modelUrl: 'https://cdn.jsdelivr.net/gh/KhronosGroup/glTF-Sample-Models/2.0/Lantern/glTF-Binary/Lantern.glb' },
  { id: 'robo', name: 'Робо', emoji: '🤖', desc: 'Авто-сбор 24/7', modelUrl: 'https://cdn.jsdelivr.net/gh/KhronosGroup/glTF-Sample-Models/2.0/BoxAnimated/glTF-Binary/BoxAnimated.glb' },
  { id: 'listo', name: 'Листо', emoji: '🍃', desc: 'Самурай качества', modelUrl: 'https://cdn.jsdelivr.net/gh/KhronosGroup/glTF-Sample-Models/2.0/Duck/glTF-Binary/Duck.glb' },
  { id: 'trak', name: 'Трак', emoji: '🚜', desc: 'Доставка x2', modelUrl: 'https://cdn.jsdelivr.net/gh/KhronosGroup/glTF-Sample-Models/2.0/DamagedHelmet/glTF-Binary/DamagedHelmet.glb' },
] as const;

export default function ARPage() {
  const [isLoading, setIsLoading] = useState(true);
  const [arReady, setArReady] = useState(false);
  const [scriptsLoaded, setScriptsLoaded] = useState(0);
  const [activeChar, setActiveChar] = useState('tomi');
  const [targetFound, setTargetFound] = useState(false);
  const sceneRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scriptsLoaded < 2) return;
    const timer = setTimeout(() => {
      setIsLoading(false);
      setArReady(true);
    }, 1500);
    return () => clearTimeout(timer);
  }, [scriptsLoaded]);

  // Listen for target found/lost events
  useEffect(() => {
    if (!arReady) return;
    const timer = setTimeout(() => {
      const scene = document.querySelector('a-scene');
      if (!scene) return;
      scene.addEventListener('targetFound', () => setTargetFound(true));
      scene.addEventListener('targetLost', () => setTargetFound(false));
    }, 1000);
    return () => clearTimeout(timer);
  }, [arReady]);

  const handleCharSelect = (charId: string) => {
    setActiveChar(charId);
    if (navigator.vibrate) navigator.vibrate(15);
  };

  return (
    <>
      <Script
        src="https://aframe.io/releases/1.5.0/aframe.min.js"
        strategy="afterInteractive"
        onLoad={() => setScriptsLoaded(s => s + 1)}
      />
      <Script
        src="https://cdn.jsdelivr.net/npm/mind-ar@1.2.5/dist/mindar-image-aframe.prod.js"
        strategy="afterInteractive"
        onLoad={() => setScriptsLoaded(s => s + 1)}
      />

      <div style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        background: '#000',
        fontFamily: "'Inter', sans-serif",
      }}>

        {/* ═══════ LOADING SCREEN ═══════ */}
        {isLoading && (
          <div style={{
            position: 'absolute', inset: 0, zIndex: 200,
            display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center',
            background: 'linear-gradient(180deg, #0a1a0f 0%, #050d08 100%)',
          }}>
            <div style={{
              width: '56px', height: '56px', borderRadius: '50%',
              border: '3px solid rgba(74,222,128,0.15)',
              borderTopColor: '#4ade80',
              animation: 'spin 1s linear infinite',
            }} />
            <p style={{
              marginTop: '20px',
              fontFamily: "'Playfair Display', serif",
              fontSize: '22px', fontWeight: 900,
              background: 'linear-gradient(135deg, #fff, #4ade80)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
            }}>
              AR-Магия
            </p>
            <p style={{
              marginTop: '8px', color: 'rgba(255,255,255,0.4)',
              fontSize: '12px', maxWidth: '240px', textAlign: 'center', lineHeight: 1.5,
            }}>
              Загрузка камеры и системы распознавания образов...
            </p>
            <div style={{
              marginTop: '32px', padding: '10px 18px',
              background: 'rgba(255,255,255,0.05)',
              border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: '12px',
              fontSize: '11px', color: 'rgba(255,255,255,0.4)',
              maxWidth: '260px', textAlign: 'center', lineHeight: 1.5,
            }}>
              <strong style={{ color: '#4ade80' }}>💡 Совет:</strong> Разрешите камеру и держите журнал в хорошо освещённом месте
            </div>
          </div>
        )}

        {/* ═══════ TOP BAR ═══════ */}
        <div style={{
          position: 'absolute', top: 0, left: 0, right: 0,
          zIndex: 150, pointerEvents: 'none',
          padding: '16px 20px 24px',
          background: 'linear-gradient(180deg, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0.4) 60%, transparent 100%)',
        }}>
          <div style={{
            display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div style={{
                width: '36px', height: '36px',
                background: 'linear-gradient(135deg, #2d5a27, #4ade80)',
                borderRadius: '10px',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '18px',
                boxShadow: '0 2px 12px rgba(74,222,128,0.3)',
              }}>🌿</div>
              <div>
                <h2 style={{
                  fontFamily: "'Playfair Display', serif",
                  fontSize: '16px', fontWeight: 900, color: '#fff',
                }}>FRESH WEEKLY</h2>
                <p style={{ fontSize: '11px', color: 'rgba(255,255,255,0.5)', marginTop: '2px' }}>
                  AR-сканер · Выпуск №1
                </p>
              </div>
            </div>
            <Link
              href="/magazine"
              style={{
                pointerEvents: 'auto',
                padding: '8px 16px',
                background: 'rgba(255,255,255,0.1)',
                backdropFilter: 'blur(10px)',
                border: '1px solid rgba(255,255,255,0.15)',
                borderRadius: '20px',
                color: '#fff', fontSize: '12px', fontWeight: 600,
                textDecoration: 'none',
              }}
            >
              ← Журнал
            </Link>
          </div>
        </div>

        {/* ═══════ FOUND TOAST ═══════ */}
        <div style={{
          position: 'fixed', top: '85px', left: '50%',
          transform: `translateX(-50%) translateY(${targetFound ? '0' : '-20px'})`,
          zIndex: 150,
          padding: '10px 20px',
          background: 'rgba(45,90,39,0.9)',
          backdropFilter: 'blur(12px)',
          border: '1px solid rgba(74,222,128,0.4)',
          borderRadius: '16px',
          fontSize: '13px', fontWeight: 600, color: '#fff',
          whiteSpace: 'nowrap',
          opacity: targetFound ? 1 : 0,
          transition: 'all 0.4s',
          pointerEvents: 'none',
          boxShadow: '0 4px 24px rgba(74,222,128,0.3)',
        }}>
          ✨ Карточка найдена! Смотрите магию...
        </div>

        {/* ═══════ SCAN FRAME ═══════ */}
        {arReady && !targetFound && (
          <div style={{
            position: 'fixed', top: '50%', left: '50%',
            transform: 'translate(-50%, -50%)',
            width: '65vw', maxWidth: '280px', aspectRatio: '1',
            zIndex: 100, pointerEvents: 'none',
          }}>
            {/* Four corner brackets */}
            {(['tl','tr','bl','br'] as const).map(pos => (
              <div key={pos} style={{
                position: 'absolute', width: '28px', height: '28px',
                borderColor: '#4ade80', borderStyle: 'solid', borderWidth: 0,
                ...(pos === 'tl' ? { top: 0, left: 0, borderTopWidth: '3px', borderLeftWidth: '3px', borderRadius: '6px 0 0 0' } : {}),
                ...(pos === 'tr' ? { top: 0, right: 0, borderTopWidth: '3px', borderRightWidth: '3px', borderRadius: '0 6px 0 0' } : {}),
                ...(pos === 'bl' ? { bottom: 0, left: 0, borderBottomWidth: '3px', borderLeftWidth: '3px', borderRadius: '0 0 0 6px' } : {}),
                ...(pos === 'br' ? { bottom: 0, right: 0, borderBottomWidth: '3px', borderRightWidth: '3px', borderRadius: '0 0 6px 0' } : {}),
              }} />
            ))}
            {/* Scanning line */}
            <div style={{
              position: 'absolute', left: '5%', width: '90%', height: '2px',
              background: 'linear-gradient(90deg, transparent, #4ade80, transparent)',
              opacity: 0.6,
              animation: 'scanLine 2.5s ease-in-out infinite',
            }} />
            {/* Label */}
            <div style={{
              position: 'absolute', bottom: '-36px', left: '50%',
              transform: 'translateX(-50%)',
              fontSize: '11px', color: 'rgba(255,255,255,0.5)',
              whiteSpace: 'nowrap',
              background: 'rgba(0,0,0,0.6)',
              backdropFilter: 'blur(8px)',
              padding: '6px 14px', borderRadius: '12px',
              border: '1px solid rgba(255,255,255,0.1)',
            }}>
              Ищу карточку...
            </div>
          </div>
        )}

        {/* ═══════ BOTTOM PANEL ═══════ */}
        <div style={{
          position: 'absolute', bottom: 0, left: 0, right: 0,
          zIndex: 150, pointerEvents: 'auto',
          padding: '20px 20px 28px',
          background: 'linear-gradient(0deg, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0.4) 60%, transparent 100%)',
        }}>
          <div style={{
            display: 'flex', gap: '8px',
            overflowX: 'auto',
            padding: '4px 0',
            scrollbarWidth: 'none',
          }}>
            {CHARACTERS.map(char => (
              <button
                key={char.id}
                onClick={() => handleCharSelect(char.id)}
                style={{
                  flexShrink: 0,
                  padding: '8px 14px',
                  background: activeChar === char.id
                    ? 'rgba(45,90,39,0.3)'
                    : 'rgba(255,255,255,0.08)',
                  backdropFilter: 'blur(8px)',
                  border: `1px solid ${activeChar === char.id ? '#4ade80' : 'rgba(255,255,255,0.1)'}`,
                  borderRadius: '14px',
                  textAlign: 'center',
                  minWidth: '72px',
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                  boxShadow: activeChar === char.id ? '0 0 16px rgba(74,222,128,0.2)' : 'none',
                }}
              >
                <div style={{ fontSize: '24px' }}>{char.emoji}</div>
                <div style={{
                  fontSize: '9px', fontWeight: 600,
                  color: activeChar === char.id ? '#4ade80' : 'rgba(255,255,255,0.7)',
                  marginTop: '3px',
                }}>{char.name}</div>
              </button>
            ))}
          </div>
          <div style={{
            textAlign: 'center', fontSize: '11px',
            color: 'rgba(255,255,255,0.35)', marginTop: '10px',
          }}>
            Наведите камеру на коллекционную карточку в журнале
          </div>
        </div>

        {/* ═══════ A-FRAME AR SCENE ═══════ */}
        {arReady && (
          <div
            ref={sceneRef}
            style={{ width: '100%', height: '100%' }}
            dangerouslySetInnerHTML={{
              __html: `
                <a-scene
                  mindar-image="imageTargetSrc: https://cdn.jsdelivr.net/gh/hiukim/mind-ar-js@1.2.5/examples/image-tracking/assets/card-example/targets.mind; uiScanning: no; missTolerance: 5; warmupTolerance: 3;"
                  color-space="sRGB"
                  renderer="colorManagement: true; physicallyCorrectLights: true; antialias: true; alpha: true"
                  vr-mode-ui="enabled: false"
                  device-orientation-permission-ui="enabled: false"
                  loading-screen="enabled: false"
                  style="position: absolute; inset: 0; z-index: 50;"
                >
                  <a-assets>
                    <img id="glow-tex" src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='256' height='256'%3E%3Cdefs%3E%3CradialGradient id='g'%3E%3Cstop offset='0%25' stop-color='%234ade80' stop-opacity='0.5'/%3E%3Cstop offset='70%25' stop-color='%234ade80' stop-opacity='0.1'/%3E%3Cstop offset='100%25' stop-color='%234ade80' stop-opacity='0'/%3E%3C/radialGradient%3E%3C/defs%3E%3Crect fill='url(%23g)' width='256' height='256'/%3E%3C/svg%3E" crossorigin="anonymous">
                  </a-assets>

                  <a-camera position="0 0 0" look-controls="enabled: false"></a-camera>

                  <a-entity mindar-image-target="targetIndex: 0">

                    <!-- Holographic base glow -->
                    <a-plane
                      position="0 0 0.01"
                      scale="1.1 0.65 1"
                      material="src: #glow-tex; transparent: true; opacity: 0.6; side: double; blending: additive"
                      animation="property: material.opacity; from: 0.3; to: 0.6; dir: alternate; dur: 2000; easing: easeInOutSine; loop: true"
                    ></a-plane>

                    <!-- Ring 1 -->
                    <a-ring
                      position="0 0 0.02"
                      scale="0.55 0.55 1"
                      material="color: #4ade80; opacity: 0.4; transparent: true; side: double; blending: additive"
                      animation="property: rotation; to: 0 0 360; dur: 8000; easing: linear; loop: true"
                      animation__pulse="property: scale; from: 0.5 0.5 1; to: 0.6 0.6 1; dir: alternate; dur: 3000; easing: easeInOutSine; loop: true"
                    ></a-ring>

                    <!-- Ring 2 counter-rotating -->
                    <a-ring
                      position="0 0 0.015"
                      scale="0.45 0.45 1"
                      material="color: #c9a84c; opacity: 0.25; transparent: true; side: double; blending: additive"
                      animation="property: rotation; from: 0 0 0; to: 0 0 -360; dur: 12000; easing: linear; loop: true"
                    ></a-ring>

                    <!-- Character floating above card (Real 3D .glb Model) -->
                    <a-gltf-model
                      src="url(${CHARACTERS.find(c => c.id === activeChar)?.modelUrl || CHARACTERS[0].modelUrl})"
                      position="0 0.38 0.06"
                      scale="${activeChar === 'tomi' ? '3 3 3' : '0.25 0.25 0.25'}"
                      rotation="90 0 0"
                      animation="property: rotation; to: 90 360 0; dur: 6000; easing: linear; loop: true"
                      animation__bounce="property: position; from: 0 0.35 0.06; to: 0 0.42 0.06; dir: alternate; dur: 3000; easing: easeInOutSine; loop: true"
                    ></a-gltf-model>

                    <!-- Sparkles -->
                    <a-entity
                      position="-0.25 0.55 0.1"
                      geometry="primitive: sphere; radius: 0.018"
                      material="color: #facc15; emissive: #facc15; emissiveIntensity: 3; opacity: 0.8; transparent: true; blending: additive"
                      animation="property: position; to: 0.25 0.6 0.08; dir: alternate; dur: 3500; easing: easeInOutSine; loop: true"
                      animation__scale="property: scale; from: 1 1 1; to: 0.4 0.4 0.4; dir: alternate; dur: 1800; loop: true"
                    ></a-entity>
                    <a-entity
                      position="0.3 0.45 0.12"
                      geometry="primitive: sphere; radius: 0.014"
                      material="color: #4ade80; emissive: #4ade80; emissiveIntensity: 3; opacity: 0.7; transparent: true; blending: additive"
                      animation="property: position; to: -0.2 0.65 0.1; dir: alternate; dur: 4200; easing: easeInOutSine; loop: true"
                    ></a-entity>
                    <a-entity
                      position="0.05 0.7 0.08"
                      geometry="primitive: sphere; radius: 0.01"
                      material="color: #fff; emissive: #fff; emissiveIntensity: 4; opacity: 0.6; transparent: true; blending: additive"
                      animation="property: position; to: -0.1 0.75 0.15; dir: alternate; dur: 2800; easing: easeInOutSine; loop: true"
                      animation__fade="property: material.opacity; from: 0.2; to: 0.8; dir: alternate; dur: 1500; loop: true"
                    ></a-entity>
                    <a-entity
                      position="-0.15 0.62 0.09"
                      geometry="primitive: sphere; radius: 0.008"
                      material="color: #facc15; emissive: #facc15; emissiveIntensity: 4; opacity: 0.5; transparent: true; blending: additive"
                      animation="property: position; to: 0.15 0.5 0.14; dir: alternate; dur: 3800; easing: easeInOutSine; loop: true"
                    ></a-entity>
                    <a-entity
                      position="0.2 0.3 0.11"
                      geometry="primitive: sphere; radius: 0.012"
                      material="color: #4ade80; emissive: #4ade80; emissiveIntensity: 2; opacity: 0.5; transparent: true; blending: additive"
                      animation="property: position; to: -0.25 0.45 0.06; dir: alternate; dur: 5000; easing: easeInOutSine; loop: true"
                    ></a-entity>

                    <!-- Name plate -->
                    <a-plane
                      position="0 -0.12 0.03"
                      scale="0.6 0.09 1"
                      material="color: #111; opacity: 0.85; transparent: true"
                    ></a-plane>

                    <!-- Gold outer ring -->
                    <a-ring
                      position="0 0.38 0.04"
                      scale="0.38 0.38 1"
                      material="color: #c9a84c; opacity: 0.15; transparent: true; side: double; blending: additive"
                      animation="property: rotation; to: 0 0 360; dur: 10000; easing: linear; loop: true"
                    ></a-ring>

                  </a-entity>
                </a-scene>
              `,
            }}
          />
        )}
      </div>

      <style>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
        @keyframes scanLine {
          0%, 100% { top: 10%; opacity: 0; }
          10% { opacity: 0.6; }
          50% { top: 85%; opacity: 0.6; }
          60% { opacity: 0; }
        }
      `}</style>
    </>
  );
}
