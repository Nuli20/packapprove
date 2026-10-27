"use client";
import { useEffect, useRef } from "react";
import {
  placementDiagnostic,
  imagePlacement,
  type CanSpec,
} from "@/lib/can-spec";
import type { Locale } from "@/lib/i18n";
export default function PlacementGuide({
  raster,
  spec,
  locale,
}: {
  raster: HTMLCanvasElement;
  spec: CanSpec;
  locale: Locale;
}) {
  const ref = useRef<HTMLCanvasElement>(null),
    kz = locale === "kz",
    p = placementDiagnostic(raster.width, raster.height, spec);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    c.width = 360;
    c.height = Math.round(360 / p.ratio);
    const ctx = c.getContext("2d")!;
    ctx.clearRect(0, 0, c.width, c.height);
    const r = imagePlacement(
      raster.width,
      raster.height,
      c.width,
      c.height,
      spec.placement,
    );
    ctx.drawImage(raster, r.x, r.y, r.width, r.height);
  }, [raster, spec, p.ratio]);
  return (
    <div
      className="can-aspect-info"
      data-aspect-mismatch={p.mismatch}
      data-placement-gaps={p.gaps}
      data-placement-crop={p.crop}
    >
      <b>{kz ? "Суреттің пропорциялары" : "Пропорции рисунка"}</b>
      <p>
        {kz ? "Баспа аймағы" : "Зона печати"} ≈ {p.ratio.toFixed(2)} : 1<br />
        {kz ? "Көрнекілік үлгісі" : "Пример для предпросмотра"}: {p.w} × {p.h}{" "}
        px
      </p>
      {p.mismatch && (
        <p className="aspect-warning">
          {kz
            ? "Файл пропорциялары баспа аймағынан өзгеше."
            : "Пропорции файла отличаются от зоны печати."}
        </p>
      )}
      {p.gaps && (
        <p className="aspect-warning">
          {kz
            ? "Бос жолақтар қалады. Оларды жою үшін қиып толтыруды таңдаңыз."
            : "Останутся пустые полосы. «Заполнить» уберёт их с обрезкой рисунка."}
        </p>
      )}
      {p.crop && (
        <p className="aspect-warning">
          {kz
            ? "Суреттің бір бөлігі қиылады. Мәтіннің шеттерін тексеріңіз."
            : "Часть рисунка обрезается. Проверьте текст у краёв."}
        </p>
      )}
      <div className="can-fit-preview">
        <canvas
          ref={ref}
          style={{ width: "100%", display: "block" }}
          aria-label={
            kz ? "Баспа аймағында орналастыру" : "Размещение в зоне печати"
          }
        />
      </div>
      <p>
        {kz
          ? "Бұл — жуық аймақ, өндірістік шаблон емес. Қақпақ пен түбі басылмайды."
          : "Это приблизительная зона, не производственный шаблон. Крышка и дно не запечатываются."}
      </p>
    </div>
  );
}
