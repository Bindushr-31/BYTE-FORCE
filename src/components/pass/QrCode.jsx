import { useEffect, useState } from "react";

export function QRCodeCanvas({ value, size = 84 }) {
  const [src, setSrc] = useState(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const mod = await import("qrcode");
        const QR = mod.default || mod;
        const url = await QR.toDataURL(value, {
          width: size * 3,
          margin: 1,
          errorCorrectionLevel: "M",
          color: { dark: "#0A1647", light: "#FFFFFF" },
        });
        if (alive) setSrc(url);
      } catch {
        if (alive) setSrc(null);
      }
    })();
    return () => {
      alive = false;
    };
  }, [value, size]);

  return (
    <div className="shrink-0 rounded-xl bg-white p-1.5" style={{ width: size, height: size }}>
      {src ? (
        <img src={src} alt="Pass QR code" className="h-full w-full" />
      ) : (
        <div className="grid h-full w-full place-items-center text-[8px] font-semibold text-slate-400">QR</div>
      )}
    </div>
  );
}