"use client";
import { useState } from "react";
import { useForm, type FieldPath } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Plus,
  RefreshCw,
  UserPlus,
  Copy,
  Loader2,
  X,
} from "lucide-react";
import type { State, Row } from "./workspace";
import type { Locale } from "@/lib/i18n";
import { projectText } from "@/lib/project-copy";
import { setupCommand } from "./setup-wizard";
export default function ProjectWizard({
  data,
  locale,
  busy,
  onChanged,
  onClose,
  onSubmit,
}: {
  data: State;
  locale: Locale;
  busy: boolean;
  onChanged: (d: State) => void;
  onClose: () => void;
  onSubmit: (v: Row) => Promise<unknown>;
}) {
  const c = projectText(locale);
  const [step, S] = useState(0),
    [inline, I] = useState(""),
    [value, V] = useState(""),
    [link, L] = useState(""),
    [error, E] = useState(""),
    [working, W] = useState(false),
    [copied, CP] = useState(false);
  const schema = z.object({
    name: z.string().trim().min(2, c.validName).max(160, c.validName),
    organizationId: z.string().uuid(c.selectClient),
    designerId: z.string().uuid(c.selectDesigner),
    prepressId: z.string().uuid(c.selectPrepress),
    deadline: z.iso.date(c.validDate),
    artworks: z
      .string()
      .trim()
      .refine((v) => {
        const a = v
          .split("\n")
          .map((s) => s.trim())
          .filter(Boolean);
        return (
          a.length >= 1 && a.length <= 20 && a.every((s) => s.length <= 160)
        );
      }, c.validArtworks),
    description: z.string().max(5000),
    customerOrder: z.string().max(120),
    contacts: z.string().max(2000),
    priority: z.enum(["normal", "high", "low"]),
  });
  type Values = z.infer<typeof schema>;
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    shouldUnregister: false,
    defaultValues: {
      name: "",
      organizationId:
        data.organizations.find((o) => o.kind === "client")?.id || "",
      designerId:
        data.profiles.find((p) => p.role === "designer" && p.active)?.id || "",
      prepressId:
        data.profiles.find((p) => p.role === "prepress" && p.active)?.id || "",
      deadline: new Date(Date.now() + 1209600000).toISOString().slice(0, 10),
      artworks: "",
      description: "",
      customerOrder: "",
      contacts: "",
      priority: "normal",
    },
  });
  const fields: FieldPath<Values>[][] = [
    ["name", "organizationId", "customerOrder", "contacts", "description"],
    ["designerId", "prepressId"],
    ["artworks", "deadline", "priority"],
  ];
  const errors = form.formState.errors;
  const message = (key: FieldPath<Values>) =>
    errors[key] && (
      <small className="field-error" role="alert" id={"project-error-" + key}>
        {String(errors[key]?.message || c.required)}
      </small>
    );
  async function refresh() {
    const r = await fetch("/api/state", { cache: "no-store" });
    const j = await r.json();
    if (!r.ok) {
      if (r.status === 401) location.href = "/login?reason=session-expired";
      throw Error(j.error);
    }
    onChanged(j);
    return j as State;
  }
  const begin = (mode: string) => {
    I(mode);
    V("");
    L("");
    E("");
    CP(false);
  };
  async function helper() {
    W(true);
    E("");
    try {
      if (inline === "client") {
        if (value.trim().length < 2) throw Error(c.validName);
        const result = await setupCommand("organization.create", undefined, {
          name: value.trim(),
        });
        await refresh();
        form.setValue("organizationId", result.id, { shouldValidate: true });
        I("");
      } else {
        if (!z.email().safeParse(value.trim()).success)
          throw Error(
            locale === "ru"
              ? "Введите корректный email"
              : "Дұрыс email енгізіңіз",
          );
        const company = data.organizations.find(
          (o) => o.kind === "manufacturer",
        );
        if (!company)
          throw Error(
            locale === "ru"
              ? "Сначала завершите настройку компании в разделе «Настройки»."
              : "Алдымен компания баптауын аяқтаңыз.",
          );
        const result = await setupCommand("invitation.create", undefined, {
          email: value.trim(),
          organizationId: company.id,
          role: inline,
        });
        L(location.origin + result.invitationUrl);
        await refresh();
      }
    } catch (e) {
      E((e as Error).message);
    } finally {
      W(false);
    }
  }
  async function next() {
    if (await form.trigger(fields[step], { shouldFocus: true })) {
      I("");
      E("");
      S(step + 1);
    }
  }
  function showInline() {
    if (!inline) return null;
    return (
      <section
        className="project-inline"
        aria-label={inline === "client" ? c.addClient : c.invite}
      >
        <div className="project-inline-title">
          <b>
            {inline === "client"
              ? c.addClient
              : inline === "designer"
                ? c.inviteDesigner
                : c.invitePrepress}
          </b>
          <button
            type="button"
            className="icon-btn"
            onClick={() => I("")}
            disabled={working}
            aria-label={c.closeInline}
          >
            <X size={16} />
          </button>
        </div>
        {!link ? (
          <>
            <label>
              {inline === "client" ? c.clientName : c.email}
              <input
                type={inline === "client" ? "text" : "email"}
                value={value}
                onChange={(e) => V(e.target.value)}
                maxLength={inline === "client" ? 160 : 254}
                autoComplete={inline === "client" ? "organization" : "off"}
                disabled={working}
              />
            </label>
            <button
              type="button"
              className="btn"
              disabled={working}
              onClick={() => void helper()}
            >
              {working ? (
                <Loader2 className="spin" size={16} />
              ) : (
                <Plus size={16} />
              )}
              {inline === "client" ? c.saveClient : c.invite}
            </button>
          </>
        ) : (
          <>
            <p>{c.waiting}</p>
            <div className="invite-copy-row">
              <input aria-label={c.copy} readOnly value={link} />
              <button
                type="button"
                className="btn"
                onClick={() => {
                  void navigator.clipboard
                    .writeText(link)
                    .then(() => CP(true))
                    .catch(() =>
                      E(
                        locale === "ru"
                          ? "Выделите и скопируйте ссылку вручную."
                          : "Сілтемені қолмен көшіріңіз.",
                      ),
                    );
                }}
              >
                <Copy size={15} />
                {copied ? c.copied : c.copy}
              </button>
            </div>
          </>
        )}
        {error && (
          <p role="alert" className="field-error">
            {error}
          </p>
        )}
      </section>
    );
  }
  return (
    <form
      noValidate
      className="project-wizard"
      onSubmit={(e) => {
        if (step < 2) {
          e.preventDefault();
          void next();
        } else
          void form.handleSubmit(
            async (v) => {
              try {
                await onSubmit({
                  ...v,
                  artworks: v.artworks
                    .split("\n")
                    .map((s) => s.trim())
                    .filter(Boolean),
                });
              } catch {}
            },
            (errs) => {
              const index = fields.findIndex((keys) =>
                keys.some((k) => errs[k]),
              );
              if (index >= 0) S(index);
            },
          )(e);
      }}
    >
      <ol
        className="project-steps"
        aria-label={
          locale === "ru" ? "Шаги создания проекта" : "Жоба құру қадамдары"
        }
      >
        {c.steps.map((label, n) => (
          <li
            key={label}
            className={n === step ? "current" : n < step ? "complete" : ""}
          >
            <button
              type="button"
              aria-current={n === step ? "step" : undefined}
              disabled={n > step || busy || working}
              onClick={() => {
                I("");
                S(n);
              }}
            >
              <span>
                {n < step ? (
                  <Check size={15} />
                ) : (
                  String(n + 1).padStart(2, "0")
                )}
              </span>
              <b>{label}</b>
            </button>
          </li>
        ))}
      </ol>
      <div className="project-step-content">
        {step === 0 && (
          <>
            <label>
              {c.name}
              <input
                {...form.register("name")}
                aria-label={c.name}
                aria-describedby={
                  errors.name ? "project-error-name" : undefined
                }
                autoFocus
                aria-invalid={!!errors.name}
                placeholder={
                  locale === "ru"
                    ? "Например: ZHYRA — летняя серия"
                    : "Мысалы: ZHYRA — жазғы серия"
                }
              />
              {message("name")}
            </label>
            <label>
              {c.client}
              <select
                {...form.register("organizationId")}
                aria-label={c.client}
                aria-describedby={
                  errors.organizationId
                    ? "project-error-organizationId"
                    : undefined
                }
                aria-invalid={!!errors.organizationId}
              >
                <option value="">{c.choose}</option>
                {data.organizations
                  .filter((o) => o.kind === "client")
                  .map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.name}
                    </option>
                  ))}
              </select>
              {message("organizationId")}
            </label>
            {!data.organizations.some((o) => o.kind === "client") && (
              <p className="muted">{c.noClient}</p>
            )}
            <button
              type="button"
              className="text-btn"
              onClick={() => begin("client")}
            >
              <Plus size={15} />
              {c.addClient}
            </button>
            {showInline()}
            <div className="form-two">
              <label>
                {c.order}
                <input
                  {...form.register("customerOrder")}
                  aria-label={c.order}
                  aria-describedby={
                    errors.customerOrder
                      ? "project-error-customerOrder"
                      : undefined
                  }
                  maxLength={120}
                />
                {message("customerOrder")}
              </label>
              <label>
                {c.contacts}
                <input
                  {...form.register("contacts")}
                  aria-label={c.contacts}
                  aria-describedby={
                    errors.contacts ? "project-error-contacts" : undefined
                  }
                  maxLength={2000}
                />
                {message("contacts")}
              </label>
            </div>
            <details className="project-optional">
              <summary>{c.optional}</summary>
              <label>
                {c.description}
                <textarea
                  {...form.register("description")}
                  aria-label={c.description}
                  aria-describedby={
                    errors.description ? "project-error-description" : undefined
                  }
                  rows={2}
                  maxLength={5000}
                />
                {message("description")}
              </label>
            </details>
          </>
        )}
        {step === 1 && (
          <>
            {(["designer", "prepress"] as const).map((role) => {
              const key = role === "designer" ? "designerId" : "prepressId";
              const items = data.profiles.filter(
                (p) => p.role === role && p.active,
              );
              return (
                <section className="project-assignee" key={role}>
                  <label>
                    {c[role]}
                    <select
                      {...form.register(key)}
                      aria-label={c[role]}
                      aria-describedby={
                        errors[key] ? "project-error-" + key : undefined
                      }
                      aria-invalid={!!errors[key]}
                    >
                      <option value="">{c.choose}</option>
                      {items.map((p) => (
                        <option value={p.id} key={p.id}>
                          {p.full_name}
                        </option>
                      ))}
                    </select>
                    {message(key)}
                  </label>
                  {!items.length && (
                    <p className="muted">
                      {role === "designer" ? c.noDesigner : c.noPrepress}{" "}
                      {data.user.role !== "admin" && c.askAdmin}
                    </p>
                  )}
                  {data.user.role === "admin" && (
                    <button
                      type="button"
                      className="text-btn"
                      onClick={() => begin(role)}
                    >
                      <UserPlus size={15} />
                      {role === "designer"
                        ? c.inviteDesigner
                        : c.invitePrepress}
                    </button>
                  )}
                  {inline === role && showInline()}
                </section>
              );
            })}
            <p className="muted project-team-note">{c.employeeAccepted}</p>
            <button
              type="button"
              className="btn"
              disabled={working}
              onClick={() => {
                W(true);
                void refresh()
                  .catch((e) => E(e.message))
                  .finally(() => W(false));
              }}
            >
              <RefreshCw className={working ? "spin" : ""} size={15} />
              {c.refresh}
            </button>
            {error && !inline && (
              <p className="field-error" role="alert">
                {error}
              </p>
            )}
          </>
        )}
        {step === 2 && (
          <>
            <div className="project-review">
              <b>{form.getValues("name")}</b>
              <span>
                {
                  data.organizations.find(
                    (o) => o.id === form.getValues("organizationId"),
                  )?.name
                }
              </span>
              <small>
                {["designerId", "prepressId"]
                  .map(
                    (k) =>
                      data.profiles.find(
                        (p) => p.id === form.getValues(k as "designerId"),
                      )?.full_name,
                  )
                  .filter(Boolean)
                  .join(" · ")}
              </small>
            </div>
            <label>
              {c.artworks}
              <textarea
                rows={3}
                {...form.register("artworks")}
                aria-label={c.artworks}
                aria-describedby={
                  errors.artworks ? "project-error-artworks" : undefined
                }
                aria-invalid={!!errors.artworks}
                placeholder={c.artworkPlaceholder}
              />
              <small>{c.artworkHint}</small>
              {message("artworks")}
            </label>
            <div className="form-two">
              <label>
                {c.deadline}
                <input
                  type="date"
                  {...form.register("deadline")}
                  aria-label={c.deadline}
                  aria-describedby={
                    errors.deadline ? "project-error-deadline" : undefined
                  }
                  aria-invalid={!!errors.deadline}
                />
                {message("deadline")}
              </label>
              <label>
                {c.priority}
                <select
                  {...form.register("priority")}
                  aria-label={c.priority}
                  aria-describedby={
                    errors.priority ? "project-error-priority" : undefined
                  }
                >
                  {(["normal", "high", "low"] as const).map((v) => (
                    <option key={v} value={v}>
                      {c[v]}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </>
        )}
      </div>
      <div className="modal-footer project-wizard-footer">
        <button
          type="button"
          className="btn"
          disabled={busy || working}
          onClick={() => {
            if (step) {
              S(step - 1);
              I("");
            } else onClose();
          }}
        >
          {step ? (
            <>
              <ArrowLeft size={16} />
              {c.back}
            </>
          ) : (
            c.cancel
          )}
        </button>
        <span>{step + 1} / 3</span>
        {step < 2 ? (
          <button
            type="button"
            className="btn primary"
            disabled={busy || working}
            onClick={() => void next()}
          >
            {c.next}
            <ArrowRight size={16} />
          </button>
        ) : (
          <button className="btn primary" disabled={busy || working}>
            {busy ? (
              <Loader2 className="spin" size={16} />
            ) : (
              <Check size={16} />
            )}{" "}
            {c.create}
          </button>
        )}
      </div>
    </form>
  );
}
