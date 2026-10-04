// 選んだ課題の「朗読」見本音声を門弟アプリから受け取って返す
import crypto from 'crypto';
import { hasPass } from '../../lib/ksGate';

export const config = { api: { responseLimit: false } };

const MONTEI_URL = process.env.MONTEI_URL || 'https://montei.ksvox.net';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });
  if (!hasPass(req)) return res.status(403).json({ error: '利用時間が切れました。門弟アプリからもう一度開いてください。' });
  const secret = process.env.KS_APP_PASS_SECRET;
  const n = Number((req.body || {}).no);
  if (!secret) return res.status(500).json({ error: 'サーバーの設定(KS_APP_PASS_SECRET)が未登録です。' });
  if (!Number.isInteger(n) || n < 1 || n > 20) return res.status(400).json({ error: '課題が正しくありません。' });
  try {
    const exp = Math.floor(Date.now() / 1000) + 60;
    const sig = crypto.createHmac('sha256', secret).update(`sample.${n}.${exp}`).digest('base64url');
    const r = await fetch(`${MONTEI_URL}/api/sample-audio`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ no: n, exp, sig }),
    });
    let data = {};
    try { data = await r.json(); } catch (e) { /* noop */ }
    if (!r.ok) return res.status(r.status).json({ error: data.error || '見本音声を読み込めませんでした。' });
    return res.status(200).json(data);
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: '門弟アプリにつながりませんでした。時間を置いてもう一度お試しください。' });
  }
}
