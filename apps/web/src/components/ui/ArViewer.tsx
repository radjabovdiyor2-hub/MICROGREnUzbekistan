'use client';

import { useState } from 'react';
import * as Icons from '@/components/ui/Icons';
import { triggerHaptic } from '@/utils/haptic';

export function ArViewer({ modelUrl = 'https://modelviewer.dev/shared-assets/models/Astronaut.glb', title = 'Примерить в AR' }: { modelUrl?: string, title?: string }) {
  const [isOpen, setIsOpen] = useState(false);

  // We only load the model-viewer script when opened to save bandwidth
  const openAr = () => {
    triggerHaptic('heavy');
    setIsOpen(true);
    if (!document.querySelector('script[src*="model-viewer"]')) {
      const script = document.createElement('script');
      script.type = 'module';
      script.src = 'https://ajax.googleapis.com/ajax/libs/model-viewer/3.4.0/model-viewer.min.js';
      document.head.appendChild(script);
    }
  };

  if (!isOpen) {
    return (
      <button 
        onClick={openAr}
        style={{
          width: '100%',
          padding: '12px',
          background: 'var(--card)',
          border: '1px solid #10B981',
          color: '#10B981',
          borderRadius: '12px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '8px',
          fontWeight: 600,
          cursor: 'pointer',
          marginTop: '10px'
        }}
      >
        <Icons.Camera size={20} />
        {title}
      </button>
    );
  }

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      background: 'rgba(0,0,0,0.9)',
      zIndex: 9999,
      display: 'flex',
      flexDirection: 'column'
    }}>
      <div style={{ padding: '20px', display: 'flex', justifyContent: 'space-between', color: 'white' }}>
        <h3>AR Примерка</h3>
        <button onClick={() => setIsOpen(false)} style={{ background: 'none', border: 'none', color: 'white' }}>
          <Icons.X size={24} />
        </button>
      </div>
      
      <div style={{ flex: 1, position: 'relative' }}>
        {/* @ts-ignore - model-viewer is a web component */}
        <model-viewer
          src={modelUrl}
          ios-src=""
          poster=""
          alt="A 3D model"
          shadow-intensity="1"
          camera-controls
          auto-rotate
          ar
          ar-modes="webxr scene-viewer quick-look"
          style={{ width: '100%', height: '100%', backgroundColor: '#000' }}
        >
          {/* @ts-ignore */}
        </model-viewer>
      </div>
      
      <div style={{ padding: '20px', textAlign: 'center', color: '#999', fontSize: '14px' }}>
        Нажмите на кнопку AR в правом нижнем углу (на телефоне), чтобы поставить модель в вашей комнате.
      </div>
    </div>
  );
}
