import { ImageResponse } from 'next/og';

export const runtime = 'edge';
export const alt = 'Microgreen Uzbekistan';
export const size = {
  width: 1200,
  height: 630,
};
export const contentType = 'image/png';

export default async function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          background: 'linear-gradient(to bottom right, #064e3b, #065f46)',
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '80px',
          fontFamily: 'sans-serif',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'rgba(255, 255, 255, 0.1)',
            padding: '40px 60px',
            borderRadius: '40px',
            border: '2px solid rgba(255, 255, 255, 0.2)',
          }}
        >
          <svg
            width="120"
            height="120"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#4ade80"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M12 2v20" />
            <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
          </svg>
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              marginLeft: '40px',
            }}
          >
            <h1
              style={{
                fontSize: '84px',
                fontWeight: 'bold',
                color: '#ffffff',
                margin: 0,
                lineHeight: 1.1,
              }}
            >
              Microgreen
            </h1>
            <h2
              style={{
                fontSize: '48px',
                color: '#4ade80',
                margin: '10px 0 0 0',
                fontWeight: 'normal',
                letterSpacing: '4px',
                textTransform: 'uppercase',
              }}
            >
              Uzbekistan
            </h2>
          </div>
        </div>

        <p
          style={{
            fontSize: '36px',
            color: 'rgba(255, 255, 255, 0.8)',
            marginTop: '60px',
            textAlign: 'center',
            maxWidth: '900px',
            lineHeight: 1.4,
          }}
        >
          Sog'lom hayot uchun yangi uzilgan mikroko'katlar va salatlar
        </p>
      </div>
    ),
    {
      ...size,
    }
  );
}
