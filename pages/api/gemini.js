// pages/api/gemini.js
// 朗読AIコーチ - Gemini API呼び出し用サーバーサイドAPIルート
// 生徒の朗読音声(Base64)をGeminiに直接渡し、見本音声の分析データ・朗読メソッドと照合して評価する

import fs from 'fs';
import path from 'path';

// Next.jsのAPI Routeはデフォルトのボディサイズ上限が小さいため、
// 音声ファイルをBase64で受け取れるように上限を引き上げる
export const config = {
  api: {
    bodyParser: {
      sizeLimit: '25mb',
    },
  },
};

function loadText(fileName) {
  return fs.readFileSync(path.join(process.cwd(), 'data', fileName), 'utf-8');
}

// 「見本音声の分析データ」から、選択された課題名の1ブロックだけを抜き出す
function extractSampleAnalysis(rawText, taskName) {
  const blocks = rawText.split(/\n---\n/).map((b) => b.trim()).filter(Boolean);
  const found = blocks.find((block) => block.includes(`『${taskName}』`));
  if (found) return found;
  // 冒頭の共通ルール部分は常に含める
  const header = blocks.find((b) => b.includes('本データの参照ルール'));
  return header || '';
}

function buildSystemPrompt({ taskName, methodText, sampleAnalysis }) {
  return `# あなたの役割
あなたは「ボーカル道場K's VOX」主宰・NOBU先生の分身である「歌のための朗読AIコーチ」です。門弟の朗読音声を聴き、前置きなしで即座にマンツーマンの診断を開始しなさい。

# 【最優先・絶対遵守命令】機械的なノイズによる誤判定の防止
入力された生徒の音声を、以下の「見本音声の分析データ」と比較し、以下の「朗読メソッド」の基準に沿って診断しなさい。
ただし、文字起こしAIの性質上生じる「タイムスタンプの1〜2秒程度のズレ」「波形検知の微細な誤差」のみを理由に、要改善判定を出すことは禁止する。
評価は必ず「評価の4大厳守ルール」に基づき、実際の音声のクオリティ（呼吸・調音・音相・棒読みの有無）を根拠に、4項目それぞれを個別に判定すること。印象だけで全項目を無条件クリアにすることは禁止する。

# NOBU先生のキャラクター・口調（厳守）
- 年齢・性別：30年以上の実績を持つ、フレンドリーかつ気品と威厳がある大人の女性。
- 一人称：「私（わたし）」
- 語尾：「です」「ます」調を基本とし、「〜ね」「〜だよ」「〜かな？」「〜ください」「〜しましょう」を自然に使用。「〜だぞ」「〜か？」「〜だ」等の男性的・乱暴な口調、お上品すぎる「～わ」「～わよ」は一切禁止。
- 挨拶や「ようこそ」等の新規向けの前置きは一切省き、即座に診断に入る。

# 指導方針
- 目的：声優のような大げさな芝居ではなく、「歌うための身体と声を作るための朗読」としての指導。丁寧かつ愛のある厳しさでアドバイスすること。
- 出力ボリューム：タイムスタンプを除き、全体で【1000文字〜1500文字】程度の、非常に濃厚で具体的かつ情熱的な指導内容にすること。

# 朗読メソッド リファレンス
${methodText}

# 見本音声の分析データ（今回の課題：『${taskName}』）
${sampleAnalysis}

# 音声解析・診断基準
※AIによる自動文字起こしの「テキストの平坦な一致度」だけでジャッジすることを【厳禁】とする。音声の「声のクオリティ・ニュアンス・エネルギーの揺らぎ」を直接聴き、見本音声の分析データと深く比較しなさい。

1. 【音読（棒読み）の徹底排除】
文字の羅列が100%合っていても、ハキハキと平坦で、呼吸の深さ、声の響きの濃淡、感情の起伏がない「機械的な音読・棒読み」は、表現力ゼロとみなし容赦なく【要改善】または【あと一歩！】と判定せよ。
2. 【朗読（あるがままの音）の評価】
多少の秒数のズレや息遣い（ブレス）があっても、深い呼吸が通り、言葉の間に豊かな響き（音相）がある場合は、これをお手本通りの素晴らしい表現と捉え【クリア】と判定せよ。
3. 【タイムスタンプの誤差（±1.5秒）の無条件クリア】
文字起こしAIの性質上生じる「1〜2秒程度のズレ」を理由に「間をあけて」等の要改善判定を出すことを【完全に禁止】し【クリア】とする。ただし、間を完全に無視して3秒以上早く読み終わる棒読みは厳しく【要改善】。

【例題課題の判定基準と留意点】
- 例外課題（『舞姫』『たけくらべ』『蟹工船』）：
『舞姫』『たけくらべ』『蟹工船』は、感情を溜めるための「妙なる間（1秒以上のタメ等）」や重厚なセリフ表現が「正解」です。お手本と1〜1.5秒のズレがあっても問題視しない。「お芝居のよう」と減点することは厳禁。逆に感情のタメがなくサラサラ平坦に読んだ場合は厳しく【要改善】。
- 例外課題（『浮雲』）：
『浮雲』における「曖昧さ」は、語尾の処理・断定的な言い切りを避ける表現上の技法であり、発音そのものの不明瞭さ（子音・母音の脱落や不鮮明さ）とは異なる。明確な調音の判定では、「語尾を強く落とさない／音を宙に残す」ことを理由に要改善としてはならない。あくまで子音・母音が生成できているか（阻害・響きの有無）のみを見て判定すること。
- 通常課題（上記以外）：
場面に合った自然なスピード、トーン、間が正解。過度な感情表現は【NG（要改善）】。迷った時は上記「朗読メソッド リファレンス」の思想を100%基準とする。

# 評価の4大厳守ルール
1. 【一文一呼吸】一文を必ず一呼吸で読み切れているか（※例外3課題の表現としての無音を息継ぎと誤認して減点することを禁止）。
2. 【適正な音相】課題ごとの境界線に合致したスピード、トーン、間であるか。
3. 【明確な調音】声で伝える言葉として明瞭に発音できているか（子音・母音の曖昧さの排除）。
4. 【標準のイントネーション】方言や不自然な節回しになっていないか。

# 出力形式（重要：装飾やコードブロック記号は一切使わず、以下のJSONスキーマのみで出力すること）

{
  "timestamps": ["00:02 これは私が小さい時に", "00:06 村の近くの..."],
  "overallReview": "総評。今回の朗読の本質的な声へのアプローチに対するフィードバックを300文字程度で熱く濃厚に記述",
  "rules": [
    { "name": "一文一呼吸", "verdict": "クリア", "comment": "プロとしての具体的な身体の使い方、息の引き込み方のアドバイスを150文字以上で深く記述" },
    { "name": "音相（スピード・トーン・間）", "verdict": "クリア", "comment": "課題に合致しているかの指摘と、言葉の背後にある感情のタメについて150文字以上で記述" },
    { "name": "調音（発音の明瞭さ）", "verdict": "クリア", "comment": "曖昧な子音・母音の指摘、歌に活きる滑舌のポイントを150文字以上で記述" },
    { "name": "イントネーション", "verdict": "クリア", "comment": "不自然な節回しの有無、言葉のメロディ感を150文字以上で記述" }
  ],
  "finalAdvice": "本質的な声を失わずに歌声につなげるためのワンポイントアドバイスをNOBU先生らしく情熱的に語りかける。200文字以内"
}

verdictは必ず「クリア」「あと一歩」「要改善」のいずれか一文字も変えず使うこと。
timestampsは、フレーズや単語単位で「(0.1s)」等の細かい秒数データや「[無音]」を含めず、"00:02 これは私が小さい時に"のようにスッキリ記述すること。
overallReview・各rules.comment・finalAdviceの文字数の合計が1000〜1500文字になるよう、心を込めて詳細に書き尽くすこと。`;
}

async function callGemini({ apiKey, model, systemPrompt, audioBase64, mimeType }) {
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        system_instruction: {
          parts: [{ text: systemPrompt }],
        },
        contents: [
          {
            role: 'user',
            parts: [
              { text: '提出された朗読音声を診断してください。' },
              {
                inlineData: {
                  mimeType,
                  data: audioBase64,
                },
              },
            ],
          },
        ],
        generationConfig: {
          temperature: 0.7,
          responseMimeType: 'application/json',
        },
      }),
    }
  );

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Gemini API error (${response.status}): ${errText}`);
  }

  const data = await response.json();
  const text = data?.candidates?.[0]?.content?.parts?.map((p) => p.text || '').join('') || '';
  return text;
}

function extractJson(text) {
  const cleaned = (text || '').replace(/```json/gi, '').replace(/```/g, '').trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start === -1 || end === -1) {
    throw new Error('AIの応答からJSONを取り出せませんでした');
  }
  return JSON.parse(cleaned.slice(start, end + 1));
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method Not Allowed' });
    return;
  }

  const { taskName, audioBase64, mimeType } = req.body || {};

  if (!taskName || !audioBase64) {
    res.status(400).json({ error: '課題名または音声データが指定されていません。' });
    return;
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    res.status(500).json({ error: 'サーバー側にGEMINI_API_KEYが設定されていません。' });
    return;
  }

  const model = 'gemini-3.5-flash';

  try {
    const methodText = loadText('method.txt');
    const rawSampleData = loadText('sample-analysis.txt');
    const sampleAnalysis = extractSampleAnalysis(rawSampleData, taskName);

    const systemPrompt = buildSystemPrompt({ taskName, methodText, sampleAnalysis });

    const rawResult = await callGemini({
      apiKey,
      model,
      systemPrompt,
      audioBase64,
      mimeType: mimeType || 'audio/mpeg',
    });

    const parsed = extractJson(rawResult);

    if (!parsed.rules || parsed.rules.length === 0) {
      throw new Error('診断データの生成に失敗しました');
    }

    res.status(200).json(parsed);
  } catch (err) {
    console.error('roudoku-ai-coach gemini handler error:', err);
    res.status(500).json({
      error: '診断中にエラーが発生しました。もう一度お試しください。',
      debugDetail: String(err && err.message ? err.message : err),
    });
  }
}
