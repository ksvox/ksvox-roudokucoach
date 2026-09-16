import { Html, Head, Main, NextScript } from 'next/document';

export default function Document() {
  return (
    <Html lang="ja">
      <Head>
        <script src="https://cdn.tailwindcss.com"></script>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="true" />
        <link
          href="https://fonts.googleapis.com/css2?family=Shippori+Mincho:wght@400;600;700;800&family=Zen+Kaku+Gothic+New:wght@400;600&display=swap"
          rel="stylesheet"
        />
      </Head>
      <body className="min-h-screen pb-16 flex flex-col items-center antialiased">
        <Main />
        <NextScript />
      </body>
    </Html>
  );
}
