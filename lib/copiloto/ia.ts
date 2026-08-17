// lib/copiloto/ia.ts
// Abstracción del proveedor de IA. Sin SDKs: fetch directo a las APIs REST.
// Config en .env.local:
//   COPILOTO_PROVEEDOR=demo | anthropic | openai   (default: demo)
//   ANTHROPIC_API_KEY=...   COPILOTO_MODELO=claude-sonnet-4-5 (opcional)
//   OPENAI_API_KEY=...      COPILOTO_MODELO=gpt-4o-mini      (opcional)

export type Proveedor = 'demo' | 'anthropic' | 'openai'

export function proveedorActivo(): Proveedor {
  const p = (process.env.COPILOTO_PROVEEDOR || 'demo').toLowerCase()
  if (p === 'anthropic' && process.env.ANTHROPIC_API_KEY) return 'anthropic'
  if (p === 'openai' && process.env.OPENAI_API_KEY) return 'openai'
  return 'demo'
}

// Llama al LLM y devuelve el texto crudo de la respuesta.
export async function completarJSON(system: string, user: string, maxTokens = 4000): Promise<string> {
  const prov = proveedorActivo()

  if (prov === 'anthropic') {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY!,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: process.env.COPILOTO_MODELO || 'claude-sonnet-5',
        max_tokens: maxTokens,
        system,
        messages: [{ role: 'user', content: user }],
      }),
    })
    if (!res.ok) throw new Error(`Anthropic ${res.status}: ${(await res.text()).slice(0, 300)}`)
    const data = await res.json()
    return data?.content?.[0]?.text ?? ''
  }

  if (prov === 'openai') {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: process.env.COPILOTO_MODELO || 'gpt-4o-mini',
        max_tokens: maxTokens,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
      }),
    })
    if (!res.ok) throw new Error(`OpenAI ${res.status}: ${(await res.text()).slice(0, 300)}`)
    const data = await res.json()
    return data?.choices?.[0]?.message?.content ?? ''
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
