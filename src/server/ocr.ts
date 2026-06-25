import 'server-only'
import { GoogleGenAI, Type } from '@google/genai'

// 영수증 사진 → 메뉴명 + 금액(정수 원) 추출.
// 모델 = Gemini 2.5 Flash-Lite(가장 저렴한 비전, 장당 ~₩0.4). 구조화 JSON 강제.
// GEMINI_API_KEY는 이 파일에서만 읽는다(server-only). 이미지는 저장하지 않고 호출 후 버린다.
// 돈은 전부 정수 KRW — 모델이 소수/문자를 줘도 toInt로 강제(하드룰 1).

export type ReceiptLine = { name: string; qty: number; amount: number }
export type ReceiptParse = { lines: ReceiptLine[]; total: number }

// Flash-Lite 우선(장당 ~₩0.4). 과부하(503/429)로 막히면 Flash로 폴백(용량 여유·정확도↑, 장당 ~₩1.8).
const MODELS = ['gemini-2.5-flash-lite', 'gemini-2.5-flash']

function getClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) throw new Error('[ocr] GEMINI_API_KEY 미설정 — .env.local / Vercel 환경변수에 추가하세요.')
  return new GoogleGenAI({ apiKey })
}

// 응답 스키마 — { lines: [{name, amount}], total }. Flash-Lite가 이 구조로만 답하게 강제.
const RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    lines: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          name: { type: Type.STRING },
          qty: { type: Type.INTEGER },
          amount: { type: Type.INTEGER },
        },
        required: ['name', 'qty', 'amount'],
        propertyOrdering: ['name', 'qty', 'amount'],
      },
    },
    total: { type: Type.INTEGER },
  },
  required: ['lines', 'total'],
  propertyOrdering: ['lines', 'total'],
}

const SYSTEM = `너는 한국 음식점 영수증 사진에서 주문 항목을 추출하는 도구야.
- 각 메뉴의 이름(name), 수량(qty, 정수 개수), 그 줄의 합계 금액(amount, 원, 정수)을 뽑아 lines 배열로 만든다. amount는 그 줄에 찍힌 합계(단가×수량). qty는 '수량' 칸의 개수(예: "4개"→4); 수량 표기가 없으면 1.
- 부가세·봉사료·할인 같은 합계 조정 줄, 결제수단, 카드정보, 매장명, 주소, 전화번호, 사업자번호는 항목에서 제외한다.
- 금액은 쉼표 없는 정수 원(예: 12000). 소수점·통화기호 금지.
- total은 영수증에 적힌 '합계/결제금액'(정수 원). 못 찾으면 lines 금액의 합으로 둔다.
- 메뉴를 하나도 못 읽으면 lines는 빈 배열([])로 둔다. 추측해서 지어내지 말 것.`

// Gemini가 일시적으로 503(과부하)·429·5xx를 줄 때가 있어 짧게 재시도(그 외 에러는 즉시 throw).
async function withRetry<T>(fn: () => Promise<T>, tries = 4): Promise<T> {
  let lastErr: unknown
  for (let i = 0; i < tries; i++) {
    try {
      return await fn()
    } catch (e) {
      lastErr = e
      const status = (e as { status?: number })?.status
      if (status !== 503 && status !== 429 && status !== 500) throw e
      console.warn(`[ocr] ${status} 재시도 ${i + 1}/${tries}`)
      if (i < tries - 1) await new Promise((r) => setTimeout(r, 700 * (i + 1)))
    }
  }
  throw lastErr
}

// 영수증 1장 추출. 항상 정수 KRW. 못 읽으면 lines=[].
export async function parseReceiptImage(imageBase64: string, mediaType: string): Promise<ReceiptParse> {
  const ai = getClient()
  const request = (model: string) =>
    ai.models.generateContent({
      model,
      contents: [
        { inlineData: { mimeType: mediaType, data: imageBase64 } },
        { text: '이 영수증의 메뉴와 금액을 추출해 줘.' },
      ],
      config: {
        systemInstruction: SYSTEM,
        responseMimeType: 'application/json',
        responseSchema: RESPONSE_SCHEMA,
        temperature: 0,
      },
    })
  // Flash-Lite로 시도(재시도 포함). 끝까지 과부하(503/429)면 다음 모델(Flash)로 폴백.
  let lastErr: unknown
  for (const model of MODELS) {
    try {
      const res = await withRetry(() => request(model))
      const text = res.text
      if (!text) return { lines: [], total: 0 }
      try {
        return normalize(JSON.parse(text))
      } catch {
        return { lines: [], total: 0 }
      }
    } catch (e) {
      lastErr = e
      const status = (e as { status?: number })?.status
      if (status !== 503 && status !== 429) throw e // 과부하 외 에러는 모델 바꿔도 소용없음
      console.warn(`[ocr] ${model} 과부하(${status}) → 다음 모델 폴백`)
    }
  }
  throw lastErr
}

// 모델 응답을 신뢰하지 않고 정수·양수만 통과시킨다.
function normalize(raw: unknown): ReceiptParse {
  const obj = (raw ?? {}) as { lines?: unknown; total?: unknown }
  const lines: ReceiptLine[] = Array.isArray(obj.lines)
    ? obj.lines
        .map((l) => {
          const o = (l ?? {}) as { name?: unknown; qty?: unknown; amount?: unknown }
          const name = typeof o.name === 'string' ? o.name.trim() : ''
          return { name, qty: Math.max(1, toInt(o.qty) || 1), amount: toInt(o.amount) }
        })
        .filter((l) => l.amount > 0) // 금액 0/음수 줄(소계·메뉴만) 제외
    : []
  const total = toInt(obj.total) || lines.reduce((s, l) => s + l.amount, 0)
  return { lines, total }
}

// 정수 KRW 강제(소수·문자·쉼표 섞여도 안전하게).
function toInt(v: unknown): number {
  if (typeof v === 'number' && Number.isFinite(v)) return Math.max(0, Math.round(v))
  if (typeof v === 'string') {
    const n = Number(v.replace(/[^\d.-]/g, ''))
    return Number.isFinite(n) ? Math.max(0, Math.round(n)) : 0
  }
  return 0
}
