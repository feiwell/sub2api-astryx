import QRCode from 'qrcode'

export function renderQrDataUrl(text: string, size = 256): Promise<string> {
  return QRCode.toDataURL(text, { width: size, margin: 4, errorCorrectionLevel: 'M' })
}
