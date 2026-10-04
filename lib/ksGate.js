// 門弟アプリ経由の「通行証」を確認する仕組み(サーバー側でのみ使用)
import crypto from 'crypto';

const COOKIE = 'ks_pass';
const SESSION_SEC = 12 * 60 * 60; // 一度通れば12時間は使える

function secret() {
  return process.env.KS_APP_PASS_SECRET || '';
}

function sign(value) {
  return crypto.createHmac('sha256', secret()).update(value).digest('base64url');
}

function verify(token, kind) {
  if (!token || !secret()) return false;
  const parts = String(token).split('.');
  if (parts.length !== 3) return false;
  const [k, exp, sig] = parts;
  if (k !== kind || !/^\d+$/.test(exp)) return false;
  if (Number(exp) < Math.floor(Date.now() / 1000)) return false;
  const a = Buffer.from(sig);
  const b = Buffer.from(sign(`${k}.${exp}`));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function makeSession() {
  const exp = Math.floor(Date.now() / 1000) + SESSION_SEC;
  return `s.${exp}.${sign(`s.${exp}`)}`;
}

function readCookie(req) {
  const raw = req.headers.cookie || '';
  for (const part of raw.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === COOKIE) return decodeURIComponent(v.join('='));
  }
  return '';
}

// APIなどで「通行済みか」を確認する
export function hasPass(req) {
  return verify(readCookie(req), 's');
}

// ページを開いた時の確認(getServerSidePropsから呼ぶ)
export async function gateProps({ req, res, query }) {
  if (query && query.kspass) {
    if (verify(query.kspass, 'p')) {
      res.setHeader('Set-Cookie', `${COOKIE}=${makeSession()}; Path=/; Max-Age=${SESSION_SEC}; HttpOnly; Secure; SameSite=Lax`);
    }
    // 通行証つきのURLはアドレス欄に残さない
    return { redirect: { destination: '/', permanent: false } };
  }
  return { props: { ksAllowed: hasPass(req) } };
}
