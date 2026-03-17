import { createServerClient } from './db'

const BUCKET = 'assassins'

export async function getSignedUploadUrl(path: string): Promise<{ signedUrl: string; token: string }> {
  const db = createServerClient()
  const { data, error } = await db.storage
    .from(BUCKET)
    .createSignedUploadUrl(path)

  if (error) throw error
  return data
}

export function getPublicUrl(path: string): string {
  const db = createServerClient()
  const { data } = db.storage.from(BUCKET).getPublicUrl(path)
  return data.publicUrl
}

export async function deleteFile(path: string): Promise<void> {
  const db = createServerClient()
  const { error } = await db.storage.from(BUCKET).remove([path])
  if (error) throw error
}

export function checkinPhotoPath(playerId: string, date: string): string {
  return `checkins/${playerId}/${date}-${Date.now()}.jpg`
}

export function playerPhotoPath(playerId: string): string {
  return `players/${playerId}/profile.jpg`
}
