async function compressJpeg(blob: Blob, name: string, maxDim = 1200, quality = 0.75): Promise<File> {
  const bitmap = await createImageBitmap(blob)
  const scale = Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bitmap.width * scale)
  canvas.height = Math.round(bitmap.height * scale)
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  const compressed = await new Promise<Blob>((res) =>
    canvas.toBlob((b) => res(b!), 'image/jpeg', quality)
  )
  const baseName = name.replace(/\.[^.]+$/, '.jpg')
  return new File([compressed], baseName, { type: 'image/jpeg' })
}

export async function preparePhoto(file: File): Promise<File> {
  let blob: Blob = file
  let name = file.name

  const isHeic =
    file.type === 'image/heic' ||
    file.type === 'image/heif' ||
    name.toLowerCase().endsWith('.heic') ||
    name.toLowerCase().endsWith('.heif')

  if (isHeic) {
    const heic2any = (await import('heic2any')).default
    const converted = await heic2any({ blob: file, toType: 'image/jpeg', quality: 1 })
    blob = Array.isArray(converted) ? converted[0] : converted
    name = name.replace(/\.heic$/i, '.jpg').replace(/\.heif$/i, '.jpg')
  }

  return compressJpeg(blob, name)
}
