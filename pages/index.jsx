import { useState, useRef, useEffect } from 'react';
import Head from 'next/head';

const TASKS = [
  '夢十夜・第一夜',
  '檸檬',
  '田舎教師',
  'ごん狐',
  '舞姫',
  '山月記',
  'でんでんむしのかなしみ',
  '蜜柑',
  '汚れつちまつた悲しみに',
  '人間椅子',
  '武蔵野',
  '婦系図',
  'さぶ',
  '吾輩は猫である',
  '銀河鉄道の夜',
  '羅生門',
  'たけくらべ',
  '蟹工船',
  '五重塔',
  '浮雲',
];

const TASK_LABELS = {
  '夢十夜・第一夜': '夢十夜・第一夜（夏目漱石）',
  檸檬: '檸檬（梶井基次郎）',
  田舎教師: '田舎教師（田山花袋）',
  ごん狐: 'ごん狐（新美南吉）',
  舞姫: '舞姫（森鴎外）',
  山月記: '山月記（中島敦）',
  でんでんむしのかなしみ: 'でんでんむしのかなしみ（新美南吉）',
  蜜柑: '蜜柑（芥川龍之介）',
  汚れつちまつた悲しみに: '汚れつちまつた悲しみに（中原中也）',
  人間椅子: '人間椅子（江戸川乱歩）',
  武蔵野: '武蔵野（国木田独歩）',
  婦系図: '婦系図（泉鏡花）',
  さぶ: 'さぶ（山本周五郎）',
  吾輩は猫である: '吾輩は猫である（夏目漱石）',
  銀河鉄道の夜: '銀河鉄道の夜（宮沢賢治）',
  羅生門: '羅生門（芥川龍之介）',
  たけくらべ: 'たけくらべ（樋口一葉）',
  蟹工船: '蟹工船（小林多喜二）',
  五重塔: '五重塔（幸田露伴）',
  浮雲: '浮雲（二葉亭四迷）',
};

function verdictClass(verdict) {
  if (verdict === 'クリア') return 'verdict-clear';
  if (verdict === 'あと一歩') return 'verdict-almost';
  return 'verdict-improve';
}

// ===== アプリ内録音(MediaRecorder)用の補助関数 =====

// 録音の上限時間(秒)。WAV(16kHz・モノラル)で約19MBとなり、20MB制限に収まる長さ
const MAX_RECORD_SECONDS = 600;

// ブラウザが対応している録音形式を選ぶ(iPhoneはmp4、Androidはwebmになることが多い)
function pickRecorderMimeType() {
  if (typeof MediaRecorder === 'undefined' || !MediaRecorder.isTypeSupported) return '';
  const candidates = ['audio/mp4', 'audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus'];
  for (const type of candidates) {
    if (MediaRecorder.isTypeSupported(type)) return type;
  }
  return '';
}

function formatSeconds(sec) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

// 録音データを、Geminiが確実に読めるWAV(16kHz・モノラル)に変換する
async function convertToWav(blob) {
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  const OfflineCtx = window.OfflineAudioContext || window.webkitOfflineAudioContext;
  if (!AudioCtx || !OfflineCtx) throw new Error('AudioContext not supported');

  const arrayBuffer = await blob.arrayBuffer();
  const ctx = new AudioCtx();
  let decoded;
  try {
    decoded = await new Promise((resolve, reject) => {
      const p = ctx.decodeAudioData(arrayBuffer, resolve, reject);
      if (p && typeof p.then === 'function') p.then(resolve, reject);
    });
  } finally {
    if (ctx.close) ctx.close();
  }

  const targetRate = 16000;
  const length = Math.max(1, Math.ceil(decoded.duration * targetRate));
  const offline = new OfflineCtx(1, length, targetRate);
  const source = offline.createBufferSource();
  source.buffer = decoded;
  source.connect(offline.destination);
  source.start(0);
  const rendered = await offline.startRendering();
  const samples = rendered.getChannelData(0);

  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);
  const writeStr = (offset, str) => {
    for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
  };
  writeStr(0, 'RIFF');
  view.setUint32(4, 36 + samples.length * 2, true);
  writeStr(8, 'WAVE');
  writeStr(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, targetRate, true);
  view.setUint32(28, targetRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeStr(36, 'data');
  view.setUint32(40, samples.length * 2, true);
  let offset = 44;
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    offset += 2;
  }
  return new Blob([buffer], { type: 'audio/wav' });
}

// 巨大なBase64文字列をJSONに埋め込んで送ると、デプロイナウのWAFに誤検知でブロックされることがあるため、
// 音声ファイルはmultipart/form-data形式でバイナリのまま直接送信する

export default function Home() {
  const [taskName, setTaskName] = useState(TASKS[0]);
  const [audioFile, setAudioFile] = useState(null);
  const [dragActive, setDragActive] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [result, setResult] = useState(null);
  const [evaluatedAt, setEvaluatedAt] = useState(null);
  const fileInputRef = useRef(null);
  const outputRef = useRef(null);

  // ===== アプリ内録音用 =====
  // recState:
  //  'idle'(未録音) / 'ready'(マイク準備完了・開始待ち) / 'countdown'(3・2・1) /
  //  'recording'(録音中) / 'processing'(変換中) / 'recorded'(録音済み)
  const [recState, setRecState] = useState('idle');
  const [recSeconds, setRecSeconds] = useState(0);
  const [countdown, setCountdown] = useState(0);
  const [recordedUrl, setRecordedUrl] = useState('');
  const [showPlayer, setShowPlayer] = useState(false);
  const mediaRecorderRef = useRef(null);
  const mediaStreamRef = useRef(null);
  const chunksRef = useRef([]);
  const timerRef = useRef(null);
  const countdownRef = useRef(null);
  const recordedUrlRef = useRef('');

  const setPlaybackUrl = (url) => {
    if (recordedUrlRef.current) URL.revokeObjectURL(recordedUrlRef.current);
    recordedUrlRef.current = url;
    setRecordedUrl(url);
  };

  const stopStream = () => {
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((t) => t.stop());
      mediaStreamRef.current = null;
    }
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (countdownRef.current) {
      clearInterval(countdownRef.current);
      countdownRef.current = null;
    }
  };

  // 録音関係をすべてリセットする(ファイルを選び直したときなど)
  const clearRecordedAudio = () => {
    const rec = mediaRecorderRef.current;
    if (rec && rec.state === 'recording') {
      rec.onstop = null;
      rec.stop();
    }
    mediaRecorderRef.current = null;
    stopStream();
    setPlaybackUrl('');
    setShowPlayer(false);
    setRecState('idle');
    setRecSeconds(0);
    setCountdown(0);
  };

  // ページを離れるときにマイクと一時データを片付ける
  useEffect(() => {
    return () => {
      stopStream();
      if (recordedUrlRef.current) URL.revokeObjectURL(recordedUrlRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ステップ1：マイクの許可を取り、録音の準備だけする(まだ録音は始めない)
  const handlePrepareRecording = async () => {
    setErrorMsg('');

    if (typeof window === 'undefined' || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia || typeof MediaRecorder === 'undefined') {
      setErrorMsg('お使いのブラウザはアプリ内録音に対応していません。ブラウザを最新版にするか、音声ファイルを選択してください。');
      return;
    }

    let stream;
    try {
      // ブラウザの通話向け自動加工(エコー除去・ノイズ除去・音量自動調整)をオフにして、素の声を録る
      stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        },
      });
    } catch (err) {
      console.error(err);
      setErrorMsg('マイクを使用できませんでした。ブラウザの設定でマイクの使用を許可してから、もう一度お試しください。');
      return;
    }

    // 前回の録音があれば破棄
    stopStream();
    setPlaybackUrl('');
    setShowPlayer(false);
    setAudioFile(null);
    setRecSeconds(0);

    mediaStreamRef.current = stream;
    setRecState('ready');
  };

  // ステップ3：実際に録音を開始する
  const beginRecording = () => {
    const stream = mediaStreamRef.current;
    if (!stream) {
      setRecState('idle');
      setErrorMsg('マイクの準備が切れました。もう一度「アプリ内で録音する」を押してください。');
      return;
    }

    chunksRef.current = [];
    const mimeType = pickRecorderMimeType();
    let recorder;
    try {
      recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
    } catch (err) {
      console.error(err);
      stopStream();
      setRecState('idle');
      setErrorMsg('録音を開始できませんでした。もう一度お試しください。');
      return;
    }

    recorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
    };

    recorder.onstop = async () => {
      stopStream();
      setRecState('processing');
      const rawType = (recorder.mimeType || mimeType || 'audio/webm').split(';')[0];
      const rawBlob = new Blob(chunksRef.current, { type: rawType });

      // 確認用の再生には、変換前の高音質な録音をそのまま使う
      setPlaybackUrl(URL.createObjectURL(rawBlob));

      // Geminiへの送信用は、確実に読めるWAV(16kHz・モノラル)に変換する
      let sendBlob = rawBlob;
      let fileName = `アプリ内録音.${rawType.includes('mp4') ? 'm4a' : rawType.split('/')[1] || 'webm'}`;
      try {
        sendBlob = await convertToWav(rawBlob);
        fileName = 'アプリ内録音.wav';
      } catch (err) {
        // 変換に失敗した場合は、録音したままの形式で送る
        console.error('WAV変換に失敗しました:', err);
      }

      setAudioFile(new File([sendBlob], fileName, { type: sendBlob.type }));
      setRecState('recorded');
    };

    mediaRecorderRef.current = recorder;
    recorder.start();
    setRecSeconds(0);
    setRecState('recording');

    timerRef.current = setInterval(() => {
      setRecSeconds((prev) => {
        const next = prev + 1;
        if (next >= MAX_RECORD_SECONDS && mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
          mediaRecorderRef.current.stop();
        }
        return next;
      });
    }, 1000);
  };

  // ステップ2：「録音を開始する」→ 3・2・1のカウントダウン後に録音開始
  const handleStartCountdown = () => {
    setErrorMsg('');
    setCountdown(3);
    setRecState('countdown');
    let remaining = 3;
    countdownRef.current = setInterval(() => {
      remaining -= 1;
      if (remaining <= 0) {
        clearInterval(countdownRef.current);
        countdownRef.current = null;
        setCountdown(0);
        beginRecording();
      } else {
        setCountdown(remaining);
      }
    }, 1000);
  };

  const handleStopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.stop();
    }
  };

  const handleRecordButton = () => {
    if (recState === 'idle' || recState === 'recorded') {
      handlePrepareRecording();
    } else if (recState === 'ready') {
      handleStartCountdown();
    } else if (recState === 'recording') {
      handleStopRecording();
    }
  };

  const handleFileChange = (e) => {
    if (e.target.files && e.target.files.length > 0) {
      clearRecordedAudio();
      setAudioFile(e.target.files[0]);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      clearRecordedAudio();
      setAudioFile(e.dataTransfer.files[0]);
    }
  };

  const handleSaveTxt = () => {
    if (!result) return;

    const dateStr = (evaluatedAt || new Date()).toLocaleString('ja-JP', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });

    let fileText = `========================================
 朗読AIコーチ - 診断結果レポート
 提供：ボーカル道場K's VOX
========================================
■ 診断日時: ${dateStr}
■ 朗読課題: ${taskName}

----------------------------------------
AIが解析したタイムスタンプ（検証用）
----------------------------------------
${(result.timestamps || []).join('\n')}

----------------------------------------
1. 総評
----------------------------------------
${result.overallReview || ''}

----------------------------------------
2. 4つのルールの診断結果
----------------------------------------
`;

    (result.rules || []).forEach((rule) => {
      fileText += `・${rule.name}：[${rule.verdict}]\n${rule.comment}\n\n`;
    });

    fileText += `----------------------------------------
3. 次へのステップ・一言アドバイス
----------------------------------------
${result.finalAdvice || ''}

========================================
門弟制ボーカルスクール K's VOX
https://www.ksvox.net/
========================================`;

    const blob = new Blob([fileText], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const sanitizedTask = (taskName || 'Task').replace(/[/\\?%*:|"<>]/g, '_');
    const dateForFileName = (evaluatedAt || new Date()).toISOString().slice(0, 10);
    a.download = `KsVOX_RoudokuCoach_${sanitizedTask}_${dateForFileName}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorMsg('');

    if (recState === 'recording' || recState === 'countdown') {
      setErrorMsg('録音中です。「録音を停止する」ボタンを押してから評価・分析を実行してください。');
      return;
    }
    if (recState === 'processing') {
      setErrorMsg('録音データを準備中です。数秒待ってからもう一度押してください。');
      return;
    }

    if (!audioFile) {
      setErrorMsg('音声ファイルを選択するか、録音してください。');
      return;
    }

    // 25MB程度を目安の上限とする(Base64化で約1.33倍に膨らむため)
    if (audioFile.size > 20 * 1024 * 1024) {
      setErrorMsg('ファイルサイズが大きすぎます。20MB以内のファイルを選択してください。');
      return;
    }

    setLoading(true);
    setResult(null);

    try {
      const formData = new FormData();
      formData.append('taskName', taskName);
      formData.append('audio', audioFile);

      // デプロイナウのWAFが音声を含む大きめのリクエストをブロックしてしまうため、
      // 音声の送信・Gemini呼び出しはCloudflare Workers側で行う
      const res = await fetch('https://roudokucoach.ksvox-nobu.workers.dev', {
        method: 'POST',
        body: formData,
      });

      const data = await res.json();

      if (!res.ok) {
        const baseMsg = data?.error || '診断中にエラーが発生しました。もう一度お試しください。';
        const detail = data?.debugDetail ? `\n[詳細] ${data.debugDetail}` : '';
        setErrorMsg(baseMsg + detail);
        setLoading(false);
        return;
      }

      // 選択した課題とまったく異なる文章を読んでいた場合
      if (data?.taskMismatch) {
        setErrorMsg('選択した課題と異なる音声のようです。選択した朗読課題の音声を録音してください。');
        setLoading(false);
        return;
      }

      setResult(data);
      setEvaluatedAt(new Date());
      setLoading(false);

      setTimeout(() => {
        outputRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }, 100);
    } catch (err) {
      console.error(err);
      const detail = err && err.message ? String(err.message) : String(err);
      setErrorMsg(`通信エラーが発生しました。もう一度お試しください。\n[詳細] ${detail}`);
      setLoading(false);
    }
  };

  return (
    <>
      <Head>
        <title>朗読AIコーチ | K&apos;s VOX</title>
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      </Head>

      <div className="w-full max-w-2xl mx-auto px-4 pt-6 space-y-7">
        {/* 1. ヘッダー */}
        <header className="roman-card rounded-2xl p-6 text-center overflow-hidden relative border border-slate-700 shadow-2xl">
          <div className="absolute inset-0 pointer-events-none opacity-[0.08] mix-blend-screen">
            <svg width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
              <defs>
                <pattern id="seigaiha-pattern" width="50" height="25" patternUnits="userSpaceOnUse">
                  <path
                    d="M 0,25 A 25,25 0 0,1 50,25 M 5,25 A 20,20 0 0,1 45,25 M 10,25 A 15,15 0 0,1 40,25 M 15,25 A 10,10 0 0,1 35,25 M 20,25 A 5,5 0 0,1 30,25"
                    fill="none"
                    stroke="#CEC4D8"
                    strokeWidth="1.2"
                  />
                  <path
                    d="M -25,0 A 25,25 0 0,1 25,0 M -20,0 A 20,20 0 0,1 20,0 M -15,0 A 15,15 0 0,1 15,0 M -10,0 A 10,10 0 0,1 10,0 M -5,0 A 5,5 0 0,1 5,0"
                    fill="none"
                    stroke="#CEC4D8"
                    strokeWidth="1.2"
                  />
                  <path
                    d="M 25,0 A 25,25 0 0,1 75,0 M 30,0 A 20,20 0 0,1 70,0 M 35,0 A 15,15 0 0,1 65,0 M 40,0 A 10,10 0 0,1 60,0 M 45,0 A 5,5 0 0,1 55,0"
                    fill="none"
                    stroke="#CEC4D8"
                    strokeWidth="1.2"
                  />
                </pattern>
              </defs>
              <rect width="100%" height="100%" fill="url(#seigaiha-pattern)" />
            </svg>
          </div>

          <div className="flex flex-col items-center justify-center space-y-2 relative z-10">
            <div className="inline-block">
              <span className="text-[10px] sm:text-xs font-bold tracking-widest text-fuji border border-fuji/40 px-3 py-0.5 rounded-full bg-indigo-950/80 uppercase shadow-sm mincho-font">
                K&apos;s VOX APPLICATION
              </span>
            </div>

            <div className="flex items-center justify-center space-x-3 pt-1">
              <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-xl bg-gradient-to-br from-slate-900 to-indigo-950 border-2 border-fuji p-2 shadow-lg flex items-center justify-center flex-shrink-0">
                <img src="/logo.png" alt="朗読AIコーチ Logo" className="w-full h-full object-contain rounded-lg" />
              </div>

              <h1 className="mincho-font text-2xl sm:text-4xl font-extrabold tracking-wider text-transparent bg-clip-text bg-gradient-to-r from-slate-100 via-fuji to-amber-200">
                朗読AIコーチ
              </h1>

              <span className="bg-beni text-white text-[10px] sm:text-xs font-bold px-2.5 py-1 rounded border border-rose-300 shadow-md transform translate-y-[-4px]">
                Ver2.0
              </span>
            </div>

            <p className="text-xs sm:text-sm text-slate-300 mincho-font tracking-widest pt-1">
              〜 歌唱のための朗読メソッド 抑揚・表現力分析 〜
            </p>
          </div>
        </header>

        {/* 2. 入力フィールドエリア */}
        <section className="roman-card p-5 sm:p-7 rounded-2xl space-y-6 relative overflow-hidden">
          <div className="absolute right-3 top-3 opacity-20 pointer-events-none text-fuji">
            <svg width="42" height="42" viewBox="0 0 100 100" fill="currentColor">
              <circle cx="50" cy="30" r="18" />
              <circle cx="69" cy="44" r="18" />
              <circle cx="62" cy="67" r="18" />
              <circle cx="38" cy="67" r="18" />
              <circle cx="31" cy="44" r="18" />
              <circle cx="50" cy="50" r="11" fill="#121a2d" />
              <circle cx="50" cy="50" r="6" fill="#D6174B" />
            </svg>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6 relative z-10">
            <div className="flex items-center space-x-3">
              <div className="h-[1px] bg-gradient-to-r from-transparent via-fuji/40 to-transparent flex-grow"></div>
              <span className="mincho-font text-xs text-fuji tracking-widest px-2">分析設定</span>
              <div className="h-[1px] bg-gradient-to-r from-transparent via-fuji/40 to-transparent flex-grow"></div>
            </div>

            {/* ① 朗読課題名 */}
            <div className="space-y-2">
              <label htmlFor="readingSelect" className="block text-xs sm:text-sm font-semibold text-fuji flex items-center space-x-2">
                <span className="w-2 h-2 rounded-full bg-beni inline-block"></span>
                <span>① 朗読課題名を選択</span>
              </label>
              <select
                id="readingSelect"
                value={taskName}
                onChange={(e) => setTaskName(e.target.value)}
                className="w-full bg-slate-900/90 border-2 border-slate-600 focus:border-fuji rounded-xl px-4 py-3 text-slate-100 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-fuji/30 transition appearance-none cursor-pointer mincho-font"
              >
                {TASKS.map((t) => (
                  <option key={t} value={t}>
                    {TASK_LABELS[t]}
                  </option>
                ))}
              </select>
            </div>

            {/* ② 音声データ入力 */}
            <div className="space-y-2">
              <label className="block text-xs sm:text-sm font-semibold text-fuji flex items-center space-x-2">
                <span className="w-2 h-2 rounded-full bg-beni inline-block"></span>
                <span>② 音声データ入力</span>
              </label>

              <div
                onClick={() => fileInputRef.current?.click()}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragActive(true);
                }}
                onDragLeave={() => setDragActive(false)}
                onDrop={handleDrop}
                className={`border-2 border-dashed rounded-xl p-5 text-center cursor-pointer transition flex flex-col items-center justify-center space-y-2 group ${
                  dragActive ? 'border-fuji bg-slate-900' : 'border-slate-600 hover:border-fuji bg-slate-900/50 hover:bg-slate-900/80'
                }`}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="audio/mp3,audio/*"
                  className="hidden"
                  onChange={handleFileChange}
                />

                <div className="w-12 h-12 rounded-full bg-indigo-950 flex items-center justify-center border border-fuji/30 group-hover:scale-110 transition">
                  <svg className="w-6 h-6 text-fuji" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2"
                      d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
                    ></path>
                  </svg>
                </div>

                <div className="text-xs sm:text-sm text-slate-300">
                  <span className="font-bold text-fuji underline">クリックしてMP3ファイルを選択</span>
                  <span className="block text-[11px] text-slate-400 mt-1">またはここにファイルをドラッグ＆ドロップ</span>
                </div>

                {audioFile && (
                  <div className="text-xs text-emerald-400 font-mono font-semibold bg-emerald-950/80 px-3 py-1.5 rounded-lg border border-emerald-500/40">
                    選択中: {audioFile.name}
                  </div>
                )}
              </div>

              {/* アプリ内録音ボタン(MediaRecorder方式。iPhone・Android・PC共通) */}
              <button
                type="button"
                onClick={handleRecordButton}
                disabled={loading || recState === 'processing' || recState === 'countdown'}
                className={`w-full py-2.5 px-3 rounded-xl border text-xs sm:text-sm font-bold flex flex-col items-center justify-center transition disabled:cursor-not-allowed ${
                  recState === 'recording' || recState === 'countdown'
                    ? 'border-rose-400 bg-rose-950/70 hover:bg-rose-900/70 text-rose-200'
                    : recState === 'ready'
                    ? 'border-amber-300/70 bg-amber-950/50 hover:bg-amber-900/60 text-amber-200'
                    : 'border-fuji/40 bg-indigo-950/60 hover:bg-indigo-900/70 text-fuji disabled:opacity-60'
                }`}
              >
                {recState === 'idle' && (
                  <>
                    <span>🎤 アプリ内で録音する</span>
                    <span className="text-[10px] font-normal opacity-80 mt-0.5">※マイクの使用を許可してください</span>
                  </>
                )}
                {recState === 'ready' && (
                  <>
                    <span>⏺ 録音を開始する</span>
                    <span className="text-[10px] font-normal opacity-80 mt-0.5">
                      ※準備ができたら押してください（3秒のカウントダウン後に録音が始まります）
                    </span>
                  </>
                )}
                {recState === 'countdown' && (
                  <>
                    <span className="text-2xl leading-none mincho-font">{countdown}</span>
                    <span className="text-[10px] font-normal opacity-80 mt-1">呼吸を整えて…</span>
                  </>
                )}
                {recState === 'recording' && (
                  <>
                    <span className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full bg-rose-500 animate-pulse inline-block"></span>
                      <span>⏹ 録音を停止する（{formatSeconds(recSeconds)}）</span>
                    </span>
                    <span className="text-[10px] font-normal opacity-80 mt-0.5">録音中…</span>
                  </>
                )}
                {recState === 'processing' && <span>録音データを準備中…</span>}
                {recState === 'recorded' && (
                  <>
                    <span>🎤 録音し直す</span>
                    <span className="text-[10px] font-normal opacity-80 mt-0.5">
                      ※この音声でよければ「評価・分析」ボタンを押してください
                    </span>
                  </>
                )}
              </button>

              {recState === 'recorded' && recordedUrl && !showPlayer && (
                <button
                  type="button"
                  onClick={() => setShowPlayer(true)}
                  className="w-full py-2.5 rounded-xl border border-emerald-500/50 bg-emerald-950/60 hover:bg-emerald-900/70 text-emerald-300 text-xs sm:text-sm font-bold flex items-center justify-center gap-2 transition"
                >
                  ▶ 音声を確認する（{formatSeconds(recSeconds)}）
                </button>
              )}

              {recState === 'recorded' && recordedUrl && showPlayer && (
                <div className="bg-slate-900/70 border border-emerald-500/40 rounded-xl p-3">
                  <audio controls src={recordedUrl} className="w-full" preload="metadata"></audio>
                </div>
              )}
            </div>

            {errorMsg && (
              <p className="text-xs font-bold text-rose-400 whitespace-pre-wrap break-words">{errorMsg}</p>
            )}

            <div className="pt-2">
              <button
                type="submit"
                disabled={loading}
                className="beni-btn w-full py-3.5 rounded-xl font-bold text-white tracking-widest text-base sm:text-lg flex items-center justify-center space-x-2 cursor-pointer"
              >
                {loading ? (
                  <>
                    <svg className="animate-spin h-5 w-5 text-white" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                      ></path>
                    </svg>
                    <span className="mincho-font">分析中...</span>
                  </>
                ) : (
                  <>
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth="2"
                        d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
                      ></path>
                    </svg>
                    <span className="mincho-font">③ 評価・分析を実行</span>
                  </>
                )}
              </button>
            </div>
          </form>
        </section>

        {/* 3. 出力フィールド */}
        <section className="space-y-2" ref={outputRef}>
          <div className="flex items-center justify-between text-xs text-fuji px-1">
            <span className="font-bold mincho-font flex items-center space-x-1">
              <span>▼ 評価・分析結果</span>
            </span>
          </div>

          <div className="washi-bg rounded-2xl p-6 text-slate-900 border-2 border-slate-300 shadow-xl min-h-[160px] transition-all duration-300">
            {!result && !loading && (
              <div className="text-center text-slate-400 text-xs sm:text-sm mincho-font py-8">
                ここにAIの評価・分析結果が表示されます。
              </div>
            )}

            {loading && (
              <div className="text-center text-slate-500 text-sm mincho-font py-10 space-y-2">
                <svg className="animate-spin h-8 w-8 text-rose-800 mx-auto" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  ></path>
                </svg>
                <p>NOBU先生が朗読音声をじっくり聴いています...</p>
              </div>
            )}

            {result && !loading && (
              <div className="space-y-5">
                <div className="border-b-2 border-rose-900/20 pb-3">
                  <span className="text-xs text-rose-800 font-bold tracking-widest block mincho-font">
                    【診断結果レポート】
                  </span>
                  <h3 className="text-lg font-bold mincho-font text-slate-900">{taskName}</h3>
                </div>

                {result.timestamps && result.timestamps.length > 0 && (
                  <div className="bg-slate-50 rounded-xl p-4 border border-slate-200 space-y-1.5">
                    <h4 className="text-xs font-bold text-slate-500 tracking-widest mincho-font mb-2">
                      AIが解析したタイムスタンプ（検証用）
                    </h4>
                    <ul className="text-xs sm:text-sm text-slate-700 space-y-1 font-mono">
                      {result.timestamps.map((line, i) => (
                        <li key={i}>{line}</li>
                      ))}
                    </ul>
                  </div>
                )}

                <div className="space-y-1.5">
                  <h4 className="text-xs font-bold text-rose-800 tracking-widest mincho-font">1. 総評</h4>
                  <p className="text-sm leading-relaxed text-slate-800 mincho-font">{result.overallReview}</p>
                </div>

                <div className="space-y-3">
                  <h4 className="text-xs font-bold text-rose-800 tracking-widest mincho-font">2. 4つのルールの診断結果</h4>
                  {result.rules.map((rule, i) => (
                    <div key={i} className="bg-white rounded-xl p-3.5 border border-slate-200 shadow-sm space-y-1.5">
                      <div className="flex items-center justify-between flex-wrap gap-1.5">
                        <span className="text-sm font-bold text-slate-900 mincho-font">{rule.name}</span>
                        <span
                          className={`text-[11px] font-bold px-2.5 py-1 rounded-full border ${verdictClass(rule.verdict)}`}
                        >
                          {rule.verdict}
                        </span>
                      </div>
                      <p className="text-xs sm:text-sm text-slate-700 leading-relaxed">{rule.comment}</p>
                    </div>
                  ))}
                </div>

                <div className="bg-rose-50 rounded-xl p-4 border border-rose-200 space-y-1.5">
                  <h4 className="text-xs font-bold text-rose-800 tracking-widest mincho-font">
                    3. 次へのステップ・一言アドバイス
                  </h4>
                  <p className="text-sm leading-relaxed text-slate-800 font-semibold mincho-font">{result.finalAdvice}</p>
                </div>

                <div className="pt-2">
                  <button
                    type="button"
                    onClick={handleSaveTxt}
                    className="w-full py-3 px-4 rounded-xl font-bold text-slate-700 bg-slate-200 hover:bg-slate-300 border border-slate-300 transition shadow-sm flex items-center justify-center gap-2 text-sm mincho-font"
                  >
                    診断結果をテキストで保存
                  </button>
                </div>
              </div>
            )}
          </div>
        </section>

        {/* 4. 見本音声プレイヤー */}
        <section className="roman-card p-5 sm:p-6 rounded-2xl space-y-3">
          <div className="flex items-center justify-between border-b border-slate-700/80 pb-2">
            <div className="flex items-center space-x-2 text-fuji font-bold text-sm mincho-font">
              <svg className="w-5 h-5 text-beni" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z"
                ></path>
              </svg>
              <span>見本を聞いてみよう（朗読見本音声）</span>
            </div>
            <span className="text-[10px] text-fuji/60 mincho-font">※スクロール可</span>
          </div>

          <div className="w-full bg-slate-950 rounded-xl p-2 border border-slate-700/80 max-h-[360px] overflow-y-auto custom-scrollbar">
            <script src="https://elfsightcdn.com/platform.js" async></script>
            <div className="elfsight-app-89f89e43-db18-4c20-8a65-beab1396cae2 w-full" data-elfsight-app-lazy></div>
          </div>
        </section>

        {/* 5. PRカード */}
        <section className="roman-card p-6 rounded-2xl border-2 border-fuji/40 bg-gradient-to-br from-indigo-950 via-slate-900 to-slate-950 relative overflow-hidden shadow-2xl">
          <div className="absolute -left-10 -bottom-10 w-40 h-40 opacity-10 pointer-events-none">
            <svg fill="currentColor" className="text-fuji w-full h-full" viewBox="0 0 100 100">
              <polygon points="50,0 100,50 50,100 0,50" />
            </svg>
          </div>

          <div className="relative z-10 space-y-3 text-center sm:text-left sm:flex sm:items-center sm:justify-between sm:space-y-0">
            <div className="space-y-1">
              <div className="inline-block bg-beni/20 border border-beni/50 px-2.5 py-0.5 rounded text-[10px] text-rose-300 font-bold mincho-font">
                SPECIAL NOTE
              </div>
              <h2 className="text-lg sm:text-xl font-bold text-white mincho-font">朗読で歌が上手くなる!?</h2>
              <p className="text-xs sm:text-sm text-slate-300 mincho-font">メソッドの詳細をnoteにて連載中！</p>
            </div>

            <a
              href="https://note.com/ksvox/m/m345fc87fa4cb"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center px-6 py-3 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold text-sm shadow-lg transition active:scale-95 border border-emerald-400/50 space-x-2"
            >
              <span className="mincho-font">noteを読む</span>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                ></path>
              </svg>
            </a>
          </div>
        </section>

        {/* 6. フッター */}
        <footer className="text-center pt-4 text-xs text-slate-400 space-y-1">
          <p className="mincho-font">
            提供：
            <a
              href="https://www.ksvox.net"
              target="_blank"
              rel="noopener noreferrer"
              className="text-fuji underline hover:text-white font-bold transition"
            >
              ボーカル道場K&apos;s VOX
            </a>
          </p>
          <p className="text-[10px] text-slate-600">© Vocal Dojo K&apos;s VOX All Rights Reserved.</p>
        </footer>
      </div>
    </>
  );
}
