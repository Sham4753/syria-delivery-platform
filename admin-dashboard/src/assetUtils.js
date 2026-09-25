import { getDownloadURL, ref, uploadBytes } from 'firebase/storage'
import { storage } from './firebase'

const MAX_BYTES = 150 * 1024

export async function compressImageToWebp(file, maxBytes = MAX_BYTES) {
  if (!file?.type?.startsWith('image/')) throw new Error('اختر ملف صورة صالحًا')
  const bitmap = await createImageBitmap(file)
  const canvas = document.createElement('canvas')
  let scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height))
  let quality = 0.82
  let blob = null
  for (let attempt = 0; attempt < 8; attempt += 1) {
    canvas.width = Math.max(1, Math.round(bitmap.width * scale))
    canvas.height = Math.max(1, Math.round(bitmap.height * scale))
    const context = canvas.getContext('2d', { alpha: true })
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
    blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/webp', quality))
    if (blob && blob.size <= maxBytes) break
    if (quality > 0.48) quality -= 0.08
    else scale *= 0.78
  }
  bitmap.close()
  if (!blob) throw new Error('تعذر ضغط الصورة')
  return new File([blob], `${file.name.replace(/\.[^.]+$/, '')}.webp`, { type: 'image/webp' })
}

export async function uploadOptimizedImage(file, folder = 'app-assets') {
  if (!storage) throw new Error('Firebase Storage غير مهيأ')
  const optimized = await compressImageToWebp(file)
  const safeName = `${Date.now()}-${optimized.name.replace(/[^a-zA-Z0-9._-]/g, '-')}`
  const assetRef = ref(storage, `${folder}/${safeName}`)
  const uploaded = await uploadBytes(assetRef, optimized, { contentType: 'image/webp', cacheControl: 'public,max-age=31536000,immutable' })
  const url = await getDownloadURL(uploaded.ref)
  cacheAsset(url)
  return { url, bytes: optimized.size, name: safeName }
}

export function cacheAsset(url) {
  if (!url) return
  try {
    const cache = JSON.parse(localStorage.getItem('syria_delivery_asset_cache') || '[]')
    const next = [url, ...cache.filter(item => item !== url)].slice(0, 100)
    localStorage.setItem('syria_delivery_asset_cache', JSON.stringify(next))
  } catch {
    // Storage may be disabled; the remote URL remains usable.
  }
}

export function getCachedAssets() {
  try { return JSON.parse(localStorage.getItem('syria_delivery_asset_cache') || '[]') } catch { return [] }
}
