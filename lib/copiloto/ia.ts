// Adaptador server-side de proveedores de IA para el Copiloto.
// Las claves NUNCA se exponen al navegador: van solo en .env.local / hosting.
// Configuración: ver .env.example.

export type Proveedor = 'demo' | 'gemini' | 'anthropic' | 'openai'

const TIMEOUT_MS = 45_000

export function proveedorActivo(): Proveedor {
  const p = (process.env.COPILOTO_PROVEEDOR || 'demo').toLowerCase()
  if (p === 'gemini' && process.env.GEMINI_API_KEY) return 'gemini'
  if (p === 'anthropic' && process.env.ANTHROPIC_API_KEY) return 'anthropic'
  if (p === 'openai' && process.env.OPENAI_API_KEY) return 'openai'
  return 'demo'
}

async function pedir(url: string, init: RequestInit, proveedor: string): Promise<any> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    const res = await fetch(url, { ...init, signal: controller.signal })
    if (!res.ok) throw new Error(`${proveedor} no respondió correctamente (${res.status})`)
    return await res.json()
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') throw new Error(`${proveedor} tardó demasiado en responder`)
    throw error
  } finally {
    clearTimeout(timeout)
  }
}

function textoOpenAI(data: any): string {
  if (typeof data?.output_text === 'string' && data.output_text.trim()) return data.output_text
  const contenido = data?.output
    ?.flatMap((item: any) => item?.content ?? [])
    ?.filter((parte: any) => parte?.type === 'output_text')
    ?.map((parte: any) => parte.text ?? '')
    ?.join('')
  if (typeof contenido === 'string' && contenido.trim()) return contenido
  throw new Error('OpenAI no devolvió texto')
}

// Llama al LLM y devuelve el JSON en texto. La validación de dominio ocurre
// siempre con Zod en las rutas antes de modificar la base de datos.
export async function completarJSON(system: string, user: string, maxTokens = 4000): Promise<string> {
  const prov = proveedorActivo()

  if (prov === 'gemini') {
    const modelo = process.env.COPILOTO_MODELO || 'gemini-2.5-flash-lite'
    const data = await pedir(`https://generativelanguage.googleapis.com/v1beta/models/${modelo}:generateContent`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-goog-api-key': process.env.GEMINI_API_KEY! },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: 'user', parts: [{ text: user }] }],
        generationConfig: { maxOutputTokens: maxTokens, responseMimeType: 'application/json', temperature: 0.2 },
      }),
    }, 'Gemini')
    const texto = data?.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p?.text ?? '').join('')
    if (!texto?.trim()) throw new Error('Gemini no devolvió texto')
    return texto
  }

  if (prov === 'anthropic') {
    const data = await pedir('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY!, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: process.env.COPILOTO_MODELO || 'claude-sonnet-4-5', max_tokens: maxTokens, system,
        messages: [{ role: 'user', content: user }],
      }),
    }, 'Anthropic')
    const texto = data?.content?.find((parte: { type?: string }) => parte.type === 'text')?.text
    if (!texto?.trim()) throw new Error('Anthropic no devolvió texto')
    return texto
  }

  if (prov === 'openai') {
    // Responses es la API actual de OpenAI. El modo JSON reduce respuestas que
    // no se pueden validar; Zod sigue siendo la autoridad antes de persistir.
    const data = await pedir('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
      body: JSON.stringify({
        model: process.env.COPILOTO_MODELO || 'gpt-5-mini', instructions: system, input: user,
        max_output_tokens: maxTokens, text: { format: { type: 'json_object' } }, store: false,
      }),
    }, 'OpenAI')
    return textoOpenAI(data)
  }

  throw new Error('Proveedor demo no llama a la IA')
}

// Extrae el primer objeto JSON de una respuesta (tolera ```json fences y texto alrededor).
export function extraerJSON(texto: string): unknown {
  let t = texto.trim()
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (fence) t = fence[1].trim()
  const ini = t.indexOf('{')
  const fin = t.lastIndexOf('}')
  if (ini === -1 || fin === -1 || fin <= ini) throw new Error('La IA no devolvió JSON')
  return JSON.parse(t.slice(ini, fin + 1))
}
