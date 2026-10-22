import qrcode from 'qrcode-generator';

/** Renders text (a pairing URL) as a crisp, scalable QR-code SVG: black modules on a white quiet zone. */
export function qrSvg(text: string, options: { scale?: number; margin?: number } = {}): string {
  const scale = options.scale ?? 8;
  const margin = options.margin ?? 2;
  const qr = qrcode(0, 'M');
  qr.addData(text);
  qr.make();
  const count = qr.getModuleCount();
  const size = (count + margin * 2) * scale;
  let path = '';
  for (let r = 0; r < count; r++) {
    for (let c = 0; c < count; c++) {
      if (qr.isDark(r, c)) path += `M${(c + margin) * scale},${(r + margin) * scale}h${scale}v${scale}h-${scale}z`;
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" shape-rendering="crispEdges"><rect width="${size}" height="${size}" fill="#fff"/><path d="${path}" fill="#000"/></svg>`;
}
