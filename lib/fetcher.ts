// lib/fetcher.ts
// Fetcher compartido para SWR: hace GET, parsea JSON y lanza en error.
export async function fetcher<T = any>(url: string): Promise<T> {
  const res = await fetch(url)
  if (!res.ok) {
    const err = new Error('Error al cargar datos') as Error & { status?: number }
    err.status = res.status
    throw err
  }
  return res.json()
}