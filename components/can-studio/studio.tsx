"use client";
import DesignFilePicker from "../design-file-picker";
import { filePickerCopy } from "@/lib/file-picker-copy";
import dynamic from "next/dynamic";
import {
  Component,
  useState,
  useRef,
  useEffect,
  useCallback,
  type ReactNode,
} from "react";
import { motion, useReducedMotion } from "motion/react";
import {
  RotateCcw,
  Plus,
  Minus,
  ArrowLeft,
  ArrowRight,
  Maximize,
  Box,
  Loader2,
  LockKeyhole,
  SlidersHorizontal,
} from "lucide-react";
import {
  CAN_PRESETS,
  DEFAULT_CAN_SPEC,
  canSpecSchema,
  canDimensions,
  type CanSpec,
} from "@/lib/can-spec";
import { rasterDesign } from "@/lib/can-texture";
import { canCopy } from "@/lib/can-copy";
import type { Locale } from "@/lib/i18n";
import type { Row } from "../workspace";
import type { CameraCommand } from "./scene";
const Scene = dynamic(() => import("./scene"), {
  ssr: false,
  loading: () => (
    <div className="can-loading">
      <Loader2 className="spin" />
    </div>
  ),
});
class SceneBoundary extends Component<
  { children: ReactNode; onError: () => void },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch() {
    this.props.onError();
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}
export default function CanStudio({
  file,
  version,
  versions = [],
  savedSpec,
  locale = "ru",
  role,
  onVersion,
  onNewVersion,
  onFallback,
  onPageChange,
  demo = false,
}: {
  file?: Row;
  version: Row;
  versions?: Row[];
  savedSpec?: unknown;
  locale?: Locale;
  role: string;
  onVersion?: (id: string) => void;
  onNewVersion?: (file: File | undefined, spec: CanSpec) => void;
  onFallback: () => void;
  onPageChange?: (page: number) => void;
  demo?: boolean;
}) {
  const container = useRef<HTMLElement>(null);
  const [checkingFile, FILE_CHECKING] = useState(false);
  const [pickerRevision, PICKER_REVISION] = useState(0);
  useEffect(() => {
    if (window.innerWidth < 681 && !demo)
      container.current?.scrollIntoView({ block: "start", behavior: "auto" });
  }, [demo]);
  const c = canCopy(locale),
    reduced = useReducedMotion();
  const parsed = canSpecSchema.safeParse(savedSpec || {});
  const initial = parsed.success ? parsed.data : DEFAULT_CAN_SPEC;
  const [settingsOpen, SETTINGS] = useState(
    () => typeof window === "undefined" || window.innerWidth >= 900,
  );
  const [spec, S] = useState<CanSpec>(initial);
  const [localFile, F] = useState<File>();
  const [raster, R] = useState<HTMLCanvasElement | null>(null);
  const [pages, P] = useState(1);
  const [hash, H] = useState("");
  const [error, E] = useState("");
  const [loading, L] = useState(false);
  const [supported, W] = useState<boolean | null>(null);
  const [ready, READY] = useState(false);
  const [auto, A] = useState(false);
  const [command, C] = useState<CameraCommand>({ pose: "angle", id: 0 });
  const editable =
    ["admin", "manager", "designer", "prepress"].includes(role) && !demo;
  const canUpload = role === "designer" && !demo;
  const d = canDimensions(spec);

  const issuePose = (pose: CameraCommand["pose"]) =>
    C((p) => ({ pose, id: p.id + 1 }));
  const fail = useCallback(() => {
    W(false);
    READY(false);
  }, []);
  const readyCallback = useCallback(() => READY(true), []);
  useEffect(() => {
    const probe = document.createElement("canvas");
    try {
      const gl = probe.getContext("webgl2");
      W(!!gl);
      gl?.getExtension("WEBGL_lose_context")?.loseContext();
    } catch {
      W(false);
    }
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    R(null);
    H("");
    E("");
    if (!localFile && !file) return;
    L(true);
    rasterDesign(
      localFile || {
        url: file!.url || `/api/files/${file!.id}?view=1`,
        sha256: file!.sha256,
      },
      spec.pdfPage,
      controller.signal,
    )
      .then((result) => {
        if (controller.signal.aborted) return;
        R(result.canvas);
        P(result.pages);
        onPageChange?.(Math.min(spec.pdfPage, result.pages));
        if (spec.pdfPage > result.pages)
          S((prev) => ({ ...prev, pdfPage: result.pages }));
        H(result.hash);
      })
      .catch((e) => {
        if (!controller.signal.aborted) E(e.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) L(false);
      });
    return () => controller.abort();
  }, [
    localFile,
    file?.id,
    spec.pdfPage,
    file?.sha256,
    file?.url,
    onPageChange,
  ]);
  const reset = () => {
    S(initial);
    F(undefined);
    PICKER_REVISION((v) => v + 1);
    FILE_CHECKING(false);
    A(false);
    issuePose("angle");
  };
  function changePreset(preset: CanSpec["preset"]) {
    S({
      ...DEFAULT_CAN_SPEC,
      preset,
      ...(preset === "experimental"
        ? { heightMm: 168, diameterMm: 66, printHeightMm: 136 }
        : {}),
      pdfPage: spec.pdfPage,
    });
  }
  const sliders = [
    ["x", c.horizontal, -1, 1, 0.01],
    ["y", c.vertical, -1, 1, 0.01],
    ["scale", c.scale, 0.25, 3, 0.01],
    ["seam", c.seam, -180, 180, 1],
  ] as const;
  return (
    <motion.section
      ref={container}
      initial={{ opacity: reduced ? 1 : 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.2 }}
      className="can-studio"
      data-can-format={spec.preset}
      data-pdf-page={spec.pdfPage}
      data-texture-hash={hash}
      data-file-id={file?.id || ""}
      data-version-id={version.id}
    >
      <header className="can-heading">
        <div>
          <span className="eyebrow">QAZALPACK / MATERIAL LAB</span>
          <h2>
            {c.title}
            <span> / V{version.number}</span>
          </h2>
          <p>
            {demo
              ? c.subtitle
              : locale === "ru"
                ? "Дизайн сохранённой версии на алюминиевой банке."
                : "Сақталған нұсқа дизайны алюминий құтыда."}
          </p>
        </div>
        <span className="can-bound">
          <LockKeyhole size={13} />
          {demo ? "DEMO" : c.bound}
        </span>
      </header>
      <div className="can-composition">
        <details
          className="can-settings"
          open={settingsOpen}
          onToggle={(e) => SETTINGS(e.currentTarget.open)}
        >
          <summary>
            <SlidersHorizontal size={16} />
            {c.settings}
          </summary>
          <fieldset className="can-format-options">
            <legend>{c.format}</legend>
            <div>
              {Object.entries(CAN_PRESETS).map(([key, p], index) => (
                <button
                  type="button"
                  key={key}
                  aria-label={`${p.name} ${p.volumeMl} мл`}
                  aria-pressed={spec.preset === key}
                  onClick={() => changePreset(key as CanSpec["preset"])}
                >
                  <svg viewBox="0 0 36 56" aria-hidden="true">
                    <path
                      d={
                        index === 0
                          ? "M7 7Q7 4 10 4H26Q29 4 29 7L31 12V49Q31 52 28 52H8Q5 52 5 49V12Z"
                          : index === 1
                            ? "M9 6Q9 3 12 3H24Q27 3 27 6L28 11V51Q28 53 25 53H11Q8 53 8 51V11Z"
                            : "M11 5Q11 2 14 2H22Q25 2 25 5L26 10V52Q26 54 23 54H13Q10 54 10 52V10Z"
                      }
                      fill="currentColor"
                      opacity=".12"
                      stroke="currentColor"
                      strokeWidth="1.3"
                    />
                    <path
                      d={
                        index === 0
                          ? "M9 7H27M6 15H30M6 46H30"
                          : index === 1
                            ? "M11 6H25M9 14H27M9 47H27"
                            : "M13 5H23M11 13H25M11 48H25"
                      }
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.2"
                    />
                  </svg>
                  <b>{p.name}</b>
                  <small>{p.volumeMl} мл</small>
                </button>
              ))}
            </div>
            {(editable || initial.preset === "experimental") && (
              <button
                className="can-experimental"
                type="button"
                aria-pressed={spec.preset === "experimental"}
                onClick={() => changePreset("experimental")}
              >
                {c.experimental}
              </button>
            )}
          </fieldset>
          <div className="can-dimensions">
            <div>
              <small>{c.dimensions}</small>
              <strong>
                ≈ {d.heightMm} × Ø{d.diameterMm} <span>мм</span>
              </strong>
            </div>
            <div>
              <small>{c.print}</small>
              <strong>
                ≈ {d.wrapWidthMm.toFixed(1)} × {d.printHeightMm} <span>мм</span>
              </strong>
            </div>
          </div>
          <p className="can-note">
            {c.approx} {c.nominal}
          </p>
          {spec.preset === "experimental" && editable && (
            <div className="can-custom">
              {[
                ["heightMm", c.height, 90, 220],
                ["diameterMm", c.diameter, 40, 90],
                ["printHeightMm", c.printHeight, 50, 195],
              ].map(([key, label, min, max]) => (
                <label key={key as string}>
                  {label}
                  <input
                    type="number"
                    min={min}
                    max={max}
                    value={spec[key as "heightMm"] || 0}
                    onChange={(e) => {
                      const val = Number(e.target.value);
                      S((prev) => {
                        const next = { ...prev, [key]: val };
                        return canSpecSchema.safeParse(next).success
                          ? next
                          : prev;
                      });
                    }}
                  />
                </label>
              ))}
            </div>
          )}
          {versions.length > 0 && (
            <label>
              {c.version}
              <select
                aria-label={c.version}
                value={version.id}
                onChange={(e) => onVersion?.(e.target.value)}
              >
                {versions.map((v) => (
                  <option value={v.id} key={v.id}>
                    V{v.number} · {v.changes?.slice(0, 45)}
                  </option>
                ))}
              </select>
            </label>
          )}
          {canUpload && (
            <DesignFilePicker
              key={pickerRevision}
              label={filePickerCopy[locale].design}
              inputLabel={c.choose}
              locale={locale}
              value={localFile}
              onChecking={FILE_CHECKING}
              onChange={(f) => {
                F(f);
                E("");
                if (f) S((s) => ({ ...s, pdfPage: 1 }));
              }}
            />
          )}
          {pages > 1 && (
            <label>
              {c.page}
              <select
                aria-label={c.page}
                value={Math.min(spec.pdfPage, pages)}
                onChange={(e) =>
                  S({ ...spec, pdfPage: Number(e.target.value) })
                }
              >
                {Array.from({ length: pages }, (_, i) => (
                  <option value={i + 1} key={i}>
                    {i + 1} / {pages}
                  </option>
                ))}
              </select>
            </label>
          )}
          {editable && (
            <>
              <label>
                {c.fit}
                <select
                  value={spec.placement.fit}
                  onChange={(e) =>
                    S({
                      ...spec,
                      placement: {
                        ...spec.placement,
                        fit: e.target.value as "contain" | "cover",
                      },
                    })
                  }
                >
                  <option value="contain">{c.contain}</option>
                  <option value="cover">{c.cover}</option>
                </select>
              </label>
              {sliders.map(([key, label, min, max, step]) => (
                <label key={key}>
                  {label}
                  <input
                    aria-label={label}
                    type="range"
                    min={min}
                    max={max}
                    step={step}
                    value={spec.placement[key]}
                    onChange={(e) =>
                      S({
                        ...spec,
                        placement: {
                          ...spec.placement,
                          [key]: Number(e.target.value),
                        },
                      })
                    }
                  />
                  <output>{spec.placement[key]}</output>
                </label>
              ))}
            </>
          )}
          <button className="btn" onClick={reset}>
            <RotateCcw size={15} />
            {c.reset}
          </button>
          {canUpload && onNewVersion && (
            <button
              className="btn primary"
              disabled={checkingFile || loading || !!error || !raster}
              onClick={() => onNewVersion(localFile, spec)}
            >
              <Plus size={15} />
              {c.save}
            </button>
          )}
          <p className="can-note">
            {localFile ? c.local : editable ? c.draftSettings : c.readonly}
          </p>
        </details>
        <div className="can-viewport">
          <div
            className="can-stage"
            tabIndex={0}
            role="group"
            aria-label={c.title}
            data-webgl={
              supported === false ? "unavailable" : ready ? "ready" : "loading"
            }
            onKeyDown={(e) => {
              const mapping: Record<string, CameraCommand["pose"]> = {
                ArrowLeft: "left",
                ArrowRight: "right",
                "+": "in",
                "=": "in",
                "-": "out",
                "0": "angle",
              };
              if (mapping[e.key]) {
                e.preventDefault();
                issuePose(mapping[e.key]);
              }
            }}
          >
            {supported === true ? (
              <SceneBoundary onError={fail}>
                <Scene
                  spec={spec}
                  raster={raster}
                  command={command}
                  auto={auto && !reduced}
                  onReady={readyCallback}
                  onFailure={fail}
                />
              </SceneBoundary>
            ) : supported === false ? (
              <div className="can-unavailable">
                <Box size={40} />
                <p>{c.fallback}</p>
                <button className="btn primary" onClick={onFallback}>
                  {c.twoD}
                </button>
              </div>
            ) : (
              <div className="can-loading">
                <Loader2 className="spin" />
              </div>
            )}
            {loading && (
              <div className="can-loading-overlay">
                <Loader2 className="spin" size={20} />
                {c.loading}
              </div>
            )}
            {!loading && !raster && !error && (
              <div className="can-watermark">{c.none}</div>
            )}
            <div className="can-stage-label">
              <span>
                {d.name.toUpperCase()} {d.volumeMl ? ` / ${d.volumeMl} ML` : ""}
              </span>
              <small>APPROXIMATE / RGB</small>
            </div>
          </div>
          <div className="can-camera">
            {(["front", "back", "top", "angle"] as const).map((p) => (
              <button className="btn" key={p} onClick={() => issuePose(p)}>
                {c[p]}
              </button>
            ))}
            <button
              className="icon-btn"
              aria-label={c.left}
              onClick={() => issuePose("left")}
            >
              <ArrowLeft size={18} />
            </button>
            <button
              className="icon-btn"
              aria-label={c.right}
              onClick={() => issuePose("right")}
            >
              <ArrowRight size={18} />
            </button>
            <button
              className="icon-btn"
              aria-label={c.zoomIn}
              onClick={() => issuePose("in")}
            >
              <Plus size={18} />
            </button>
            <button
              className="icon-btn"
              aria-label={c.zoomOut}
              onClick={() => issuePose("out")}
            >
              <Minus size={18} />
            </button>
            <button
              className="icon-btn"
              aria-label={c.fullscreen}
              onClick={() =>
                void document.querySelector(".can-stage")?.requestFullscreen()
              }
            >
              <Maximize size={16} />
            </button>
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={auto}
                disabled={!!reduced}
                onChange={(e) => A(e.target.checked)}
              />
              {c.rotate}
            </label>
          </div>
          <p className="can-gesture">{c.hint}</p>
          {error && (
            <p role="alert" className="alert error">
              {c.error}: {error}
            </p>
          )}
          <div className="can-identity">
            <strong>
              {localFile ? c.local : demo ? c.demonstration : c.bound}
            </strong>
            <span>{localFile?.name || file?.filename || "—"}</span>
            <code>
              {localFile ? "LOCAL" : file?.id} · {hash || file?.sha256 || "—"}
            </code>
            <p>{c.legal}</p>
          </div>
        </div>
      </div>
    </motion.section>
  );
}
