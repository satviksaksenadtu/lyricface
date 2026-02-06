"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import lfbg from "../../lfbg1.png";

const DEFAULT_LYRICS =
  "Every whispered line becomes a field of light. The chorus blooms, the silence fades, and the story stays.";

type CanvasSettings = {
  fontSize: number;
  spacing: number;
  contrast: number;
  monochrome: boolean;
  underlay: number;
};

const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), max);

export default function Home() {
  const previewCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const hdCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [imageSize, setImageSize] = useState({ width: 0, height: 0 });
  const [lyrics, setLyrics] = useState(DEFAULT_LYRICS);
  const [settings, setSettings] = useState<CanvasSettings>({
    fontSize: 18,
    spacing: 1.2,
    contrast: 1,
    monochrome: false,
    underlay: 0.08,
  });
  const [isDragging, setIsDragging] = useState(false);
  const [processed, setProcessed] = useState(false);
  const [previewWidth, setPreviewWidth] = useState(720);

  const textCharacters = useMemo(() => {
    const sanitized = lyrics.replace(/\s+/g, " ").trim();
    return sanitized.length > 0 ? sanitized.split("") : ["•"];
  }, [lyrics]);

  const handleFile = useCallback((file: File | null) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) return;

    const objectUrl = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      imageRef.current = img;
      setImageSize({ width: img.naturalWidth, height: img.naturalHeight });
      setImageSrc(objectUrl);
      setProcessed(false);
    };
    img.src = objectUrl;
  }, []);

  const renderToCanvas = useCallback(
    (
      canvas: HTMLCanvasElement | null,
      scale: number,
      detailBoost = 1
    ) => {
      const imageElement = imageRef.current;
      if (!canvas || !imageElement || !imageSize.width || !imageSize.height) {
        return;
      }

      const aspect = imageSize.width / imageSize.height;
      const baseWidth = Math.floor(previewWidth * scale);
      const baseHeight = Math.floor(previewWidth / aspect) * scale;

      canvas.width = baseWidth;
      canvas.height = baseHeight;

      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      const temp = document.createElement("canvas");
      temp.width = baseWidth;
      temp.height = baseHeight;
      const tempCtx = temp.getContext("2d");
      if (!tempCtx) return;

      tempCtx.drawImage(imageElement, 0, 0, baseWidth, baseHeight);
      const imageData = tempCtx.getImageData(0, 0, baseWidth, baseHeight).data;

      ctx.clearRect(0, 0, baseWidth, baseHeight);
      ctx.fillStyle = "#FAFAFA";
      ctx.fillRect(0, 0, baseWidth, baseHeight);
      ctx.save();
      ctx.globalAlpha = settings.underlay;
      ctx.drawImage(imageElement, 0, 0, baseWidth, baseHeight);
      ctx.restore();
      ctx.textBaseline = "top";

      const scaledFont = settings.fontSize * scale;
      const detailFactor = Math.max(0.5, Math.min(detailBoost, 1));
      const stepX = scaledFont * settings.spacing * detailFactor;
      const stepY = scaledFont * settings.spacing * 1.4 * detailFactor;

      let charIndex = 0;

      for (let y = 0; y < baseHeight; y += stepY) {
        for (let x = 0; x < baseWidth; x += stepX) {
          const sampleX = Math.min(baseWidth - 1, Math.max(0, Math.floor(x)));
          const sampleY = Math.min(baseHeight - 1, Math.max(0, Math.floor(y)));
          const pixelIndex = (sampleY * baseWidth + sampleX) * 4;
          const altIndex =
            (Math.min(baseHeight - 1, sampleY + 1) * baseWidth +
              Math.min(baseWidth - 1, sampleX + 1)) *
            4;

          const r = ((imageData[pixelIndex] ?? 0) + (imageData[altIndex] ?? 0)) / 2;
          const g =
            ((imageData[pixelIndex + 1] ?? 0) +
              (imageData[altIndex + 1] ?? 0)) /
            2;
          const b =
            ((imageData[pixelIndex + 2] ?? 0) +
              (imageData[altIndex + 2] ?? 0)) /
            2;

          const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
          const contrasted = clamp(
            (luminance - 128) * settings.contrast + 128,
            0,
            255
          );
          const intensity = Math.pow(1 - contrasted / 255, 0.65);
          const weight = Math.round(300 + intensity * 600);
          const size = scaledFont * (0.85 + intensity * 0.8);
          const alpha = 0.45 + intensity * 0.55;

          ctx.font = `${weight} ${size}px "Urbanist", sans-serif`;
          ctx.fillStyle = settings.monochrome
            ? `rgba(26, 26, 26, ${alpha})`
            : `rgba(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)}, ${alpha})`;

          const nextChar = textCharacters[charIndex % textCharacters.length];
          const safeChar = nextChar === "\n" ? " " : nextChar;
          ctx.fillText(safeChar, x, y);
          charIndex += 1;
        }
      }
    },
    [imageSize.height, imageSize.width, previewWidth, settings, textCharacters]
  );

  useEffect(() => {
    if (!imageSrc) return;
    const canvas = previewCanvasRef.current;
    if (!canvas) return;
    const scale =
      typeof window !== "undefined"
        ? Math.min(2, window.devicePixelRatio || 1)
        : 1;
    renderToCanvas(canvas, scale, 0.7);
    setProcessed(true);
  }, [imageSrc, renderToCanvas, settings, previewWidth]);

  useEffect(() => {
    const resize = () => {
      if (!containerRef.current) return;
      const width = Math.min(containerRef.current.clientWidth, 820);
      setPreviewWidth(Math.max(width, 280));
    };
    resize();
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, []);

  useEffect(() => {
    return () => {
      if (imageSrc) {
        URL.revokeObjectURL(imageSrc);
      }
    };
  }, [imageSrc]);

  const handleDownload = useCallback(() => {
    if (!imageSrc) return;
    renderToCanvas(hdCanvasRef.current, 4);
    const hdCanvas = hdCanvasRef.current;
    if (!hdCanvas) return;
    const link = document.createElement("a");
    link.download = "lyric-artwork.png";
    link.href = hdCanvas.toDataURL("image/png");
    link.click();
  }, [imageSrc, renderToCanvas]);

  const handleInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null;
    handleFile(file);
  };

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#FAFAFA] text-[#1A1A1A]">
      <div
        className="pointer-events-none absolute inset-0 opacity-50"
        style={{
          backgroundImage: `url(${lfbg.src})`,
          backgroundSize: "cover",
          backgroundPosition: "center",
        }}
        aria-hidden="true"
      />
      <div className="relative z-10 mx-auto max-w-6xl px-6 py-8">
        <header className="mb-8 flex flex-col items-center gap-3 text-center">
          <span className="text-xs uppercase tracking-[0.35em] text-[#1A1A1A]/60">
            Lyric to Image Studio
          </span>
          <h1 className="font-serif text-3xl md:text-4xl">
            Compose print-ready artwork from the lines you love.
          </h1>
          <p className="max-w-2xl text-base text-[#1A1A1A]/70">
            Drop a photo, paste lyrics, and craft a premium typographic portrait
            with a high-resolution canvas engine built for gallery-ready output.
          </p>
        </header>

        <div className="grid gap-6 lg:grid-cols-[1.1fr_1.4fr_0.8fr]">
          <section className="flex flex-col gap-4">
            <div
              className={`rounded-2xl border border-[#FFE4EE] bg-white/80 p-6 shadow-[0_20px_60px_rgba(26,26,26,0.08)] transition ${
                isDragging ? "ring-2 ring-[#FBD4E0]" : ""
              }`}
              onDragOver={(event) => {
                event.preventDefault();
                setIsDragging(true);
              }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={(event) => {
                event.preventDefault();
                setIsDragging(false);
                handleFile(event.dataTransfer.files?.[0] ?? null);
              }}
            >
              <div className="flex flex-col gap-3 text-sm text-[#1A1A1A]/70">
                <span className="font-[var(--font-instrument-serif)] text-base text-[#1A1A1A]">
                  Image Input
                </span>
                <p>
                  Drag and drop a photograph here, or browse to upload. The
                  system reads every pixel for typographic mapping.
                </p>
                <label className="inline-flex w-fit cursor-pointer items-center gap-2 rounded-full border border-[#EA87BC]/40 bg-[#EA87BC] px-4 py-2 text-sm font-medium text-white transition hover:shadow-sm">
                  Browse file
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handleInputChange}
                  />
                </label>
                {imageSrc ? (
                  <span className="text-xs text-[#1A1A1A]/50">
                    Image loaded • ready to render
                  </span>
                ) : null}
              </div>
            </div>

            <div className="rounded-2xl border border-[#FFE4EE] bg-white/80 p-6 shadow-[0_20px_60px_rgba(26,26,26,0.06)]">
              <div className="mb-3 flex items-center justify-between">
                <span className="font-[var(--font-instrument-serif)] text-base text-[#1A1A1A]">
                  Lyrics
                </span>
                <span className="text-xs text-[#1A1A1A]/50">
                  Urbanist body
                </span>
              </div>
              <textarea
                value={lyrics}
                onChange={(event) => setLyrics(event.target.value)}
                rows={8}
                placeholder="Paste your lyrics or poetic text here..."
                className="w-full resize-none rounded-xl border border-[#FFE4EE] bg-[#FAFAFA] px-4 py-3 text-sm text-[#1A1A1A] placeholder:text-[#1A1A1A]/40 focus:border-[#F7C7D8] focus:outline-none"
              />
            </div>
          </section>

          <section
            ref={containerRef}
            className="rounded-2xl border border-[#FFE4EE] bg-white/80 p-6 shadow-[0_20px_60px_rgba(26,26,26,0.08)]"
          >
            <div className="mb-4 flex items-center justify-between text-sm text-[#1A1A1A]/60">
              <span className="font-[var(--font-instrument-serif)] text-[#1A1A1A]">
                Preview Canvas
              </span>
              <span>HD export ready at 4x scale</span>
            </div>
            <div className="flex min-h-[320px] items-center justify-center rounded-2xl border border-dashed border-[#FFE4EE] bg-[#FAFAFA] p-4">
              <AnimatePresence mode="wait">
                {imageSrc ? (
                  <motion.div
                    key={imageSrc}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: processed ? 1 : 0 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.6, ease: "easeOut" }}
                    className="w-full"
                  >
                    <canvas
                      ref={previewCanvasRef}
                      className="h-auto w-full rounded-xl"
                    />
                  </motion.div>
                ) : (
                  <motion.div
                    key="empty"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.4 }}
                    className="text-center text-sm text-[#1A1A1A]/50"
                  >
                    Upload an image to see the lyric mapping preview.
                  </motion.div>
                )}
              </AnimatePresence>
              <canvas ref={hdCanvasRef} className="hidden" aria-hidden="true" />
            </div>
          </section>

          <aside className="flex flex-col gap-4 rounded-2xl border border-[#FFE4EE] bg-white/80 p-6 shadow-[0_20px_60px_rgba(26,26,26,0.06)]">
            <span className="font-[var(--font-instrument-serif)] text-base text-[#1A1A1A]">
              Controls
            </span>

            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs text-[#1A1A1A]/60">
                <span className="font-[var(--font-instrument-serif)] text-sm text-[#1A1A1A]">
                  Font Size
                </span>
                <span>{settings.fontSize}px</span>
              </div>
              <input
                type="range"
                min={5}
                max={36}
                step={1}
                value={settings.fontSize}
                onChange={(event) =>
                  setSettings((prev) => ({
                    ...prev,
                    fontSize: Number(event.target.value),
                  }))
                }
                className="w-full accent-[#EA87BC]"
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs text-[#1A1A1A]/60">
                <span className="font-[var(--font-instrument-serif)] text-sm text-[#1A1A1A]">
                  Text Spacing
                </span>
                <span>{settings.spacing.toFixed(2)}</span>
              </div>
              <input
                type="range"
                min={0.8}
                max={2}
                step={0.05}
                value={settings.spacing}
                onChange={(event) =>
                  setSettings((prev) => ({
                    ...prev,
                    spacing: Number(event.target.value),
                  }))
                }
                className="w-full accent-[#EA87BC]"
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs text-[#1A1A1A]/60">
                <span className="font-[var(--font-instrument-serif)] text-sm text-[#1A1A1A]">
                  Image Contrast
                </span>
                <span>{settings.contrast.toFixed(2)}x</span>
              </div>
              <input
                type="range"
                min={0.6}
                max={1.8}
                step={0.05}
                value={settings.contrast}
                onChange={(event) =>
                  setSettings((prev) => ({
                    ...prev,
                    contrast: Number(event.target.value),
                  }))
                }
                className="w-full accent-[#EA87BC]"
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs text-[#1A1A1A]/60">
                <span className="font-[var(--font-instrument-serif)] text-sm text-[#1A1A1A]">
                  Image Underlay
                </span>
                <span>{Math.round(settings.underlay * 100)}%</span>
              </div>
              <input
                type="range"
                min={0}
                max={0.2}
                step={0.01}
                value={settings.underlay}
                onChange={(event) =>
                  setSettings((prev) => ({
                    ...prev,
                    underlay: Number(event.target.value),
                  }))
                }
                className="w-full accent-[#EA87BC]"
              />
            </div>

            <button
              type="button"
              onClick={() =>
                setSettings((prev) => ({
                  ...prev,
                  monochrome: !prev.monochrome,
                }))
              }
              className="mt-2 flex items-center justify-between rounded-full border border-[#EA87BC]/40 bg-[#EA87BC]/15 px-4 py-2 text-sm text-[#1A1A1A] transition hover:shadow-sm"
            >
              <span className="font-[var(--font-instrument-serif)]">
                {settings.monochrome ? "Monochrome Text" : "Full Color Text"}
              </span>
              <span className="rounded-full bg-white px-3 py-1 text-xs text-[#1A1A1A]/70">
                {settings.monochrome ? "Monochrome" : "Full Color"}
              </span>
            </button>

            <button
              type="button"
              onClick={handleDownload}
              disabled={!imageSrc}
              className="mt-2 w-full rounded-full bg-[#EA87BC] px-4 py-3 text-sm font-medium text-white transition hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Download Artwork
            </button>
            <p className="text-xs text-[#1A1A1A]/50">
              Exports at 4x scale for crisp 300 DPI print output.
            </p>
          </aside>
        </div>
      </div>
    </div>
  );
}
