import Head from 'next/head';

const MONTEI_URL = 'https://montei.ksvox.net';

// 門弟アプリを経由せずに開いた時の画面
export default function KsBlocked({ appName }) {
  return (
    <>
      <Head>
        <title>{appName} | K&apos;s VOX</title>
        <meta name="robots" content="noindex, nofollow" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#F7F3EC', padding: 24, fontFamily: "'Hiragino Sans','Noto Sans JP',sans-serif", color: '#2C2825' }}>
        <div style={{ maxWidth: 380, width: '100%', background: '#fff', borderRadius: 24, padding: '36px 28px', textAlign: 'center', boxShadow: '0 8px 30px rgba(44,40,37,.08)', borderTop: '5px solid #C5A059' }}>
          <img src="/logo.png" alt="" style={{ width: 84, height: 84, objectFit: 'contain', margin: '0 auto 16px', display: 'block', borderRadius: 18 }} />
          <p style={{ fontSize: 13, color: '#8A8178', margin: '0 0 6px' }}>K&apos;s VOX 生徒限定アプリ</p>
          <h1 style={{ fontSize: 20, fontWeight: 700, margin: '0 0 18px' }}>{appName}</h1>
          <p style={{ fontSize: 14, lineHeight: 1.9, margin: '0 0 24px' }}>
            このアプリは<strong>門弟アプリ</strong>から開いてください。<br />
            門弟アプリにログインし、<br />
            「K&apos;s VOXのアプリ」から選ぶと使えます。
          </p>
          <a href={MONTEI_URL} style={{ display: 'block', background: '#C5A059', color: '#fff', fontWeight: 700, fontSize: 15, borderRadius: 999, padding: '14px 20px', textDecoration: 'none' }}>
            門弟アプリを開く
          </a>
          <p style={{ fontSize: 11, color: '#8A8178', margin: '18px 0 0', lineHeight: 1.7 }}>
            ※ブックマークからは開けません。<br />一度開くと、12時間はそのまま使えます。
          </p>
        </div>
      </div>
    </>
  );
}
