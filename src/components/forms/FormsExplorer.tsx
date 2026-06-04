"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  RefreshCw,
  FileText,
  MapPin,
  Target,
  DollarSign,
  CalendarClock,
  Globe,
  Briefcase,
  Cake,
  HelpCircle,
  Mail,
  Phone,
  User,
} from "lucide-react";
import { toast } from "sonner";

type Question = { key: string; label: string; type: string; options?: string[] };
type Form = {
  id: string;
  name: string;
  status: string;
  pageId: string;
  pageName: string;
  questions: Question[];
};

// Detecta el icono según el tipo/etiqueta de la pregunta
function questionIcon(q: Question) {
  if (q.type === "EMAIL") return Mail;
  if (q.type === "PHONE") return Phone;
  if (q.type === "FULL_NAME" || q.type === "FIRST_NAME" || q.type === "LAST_NAME") return User;
  const l = q.label.toLowerCase();
  if (/(estado|ciudad|pais|país|ubicaci|donde|dónde|zona|regi)/.test(l)) return MapPin;
  if (/(edad|años|anos|grupo de edad)/.test(l)) return Cake;
  if (/(presupuesto|invertir|inversi|precio|costo|pagar|dinero|\$)/.test(l)) return DollarSign;
  if (/(lograr|objetivo|meta|necesit|busca|interes|quiere|gustar)/.test(l)) return Target;
  if (/(cuando|cuándo|fecha|tiempo|horario|disponib)/.test(l)) return CalendarClock;
  if (/(web|sitio|pagina|página|url)/.test(l)) return Globe;
  if (/(trabajo|empleo|ocupaci|profesi|negocio|empresa)/.test(l)) return Briefcase;
  return HelpCircle;
}

type Pipeline = { id: string; name: string };

export function FormsExplorer() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [forms, setForms] = useState<Form[]>([]);
  const [enabled, setEnabled] = useState<Set<string>>(new Set());
  const [pipelines, setPipelines] = useState<Pipeline[]>([]);
  const [formPipelines, setFormPipelines] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const [res, pls] = await Promise.all([
        fetch("/api/forms"),
        fetch("/api/pipelines").then((r) => r.json()),
      ]);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Error al cargar");
      setForms(data.forms);
      setEnabled(new Set(data.enabledIds));
      setFormPipelines(data.formPipelines || {});
      setPipelines(Array.isArray(pls) ? pls : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error desconocido");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const toggle = (id: string) => {
    setEnabled((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const save = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/forms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabledIds: Array.from(enabled), formPipelines }),
      });
      if (!res.ok) throw new Error("Error al guardar");
      toast.success("Formularios guardados");
    } catch {
      toast.error("Error al guardar");
    } finally {
      setSaving(false);
    }
  };

  // Agrupar por página
  const byPage = forms.reduce<Record<string, Form[]>>((acc, f) => {
    (acc[f.pageName] ||= []).push(f);
    return acc;
  }, {});

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={load} disabled={loading} className="cursor-pointer">
            <RefreshCw className={`h-4 w-4 mr-1 ${loading ? "animate-spin" : ""}`} />
            Actualizar
          </Button>
          {!loading && (
            <span className="text-sm text-muted-foreground">
              {forms.length} formularios · {enabled.size} activos
            </span>
          )}
        </div>
        <Button size="sm" onClick={save} disabled={saving || loading} className="cursor-pointer">
          {saving ? "Guardando..." : "Guardar selección"}
        </Button>
      </div>

      {error && (
        <Card className="border-destructive">
          <CardContent className="py-4 text-sm text-destructive">{error}</CardContent>
        </Card>
      )}

      {loading && (
        <p className="text-sm text-muted-foreground">Detectando formularios en tu portafolio...</p>
      )}

      {!loading && forms.length === 0 && !error && (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            No se encontraron formularios. Crea un Instant Form en una de tus
            páginas y pulsa Actualizar.
          </CardContent>
        </Card>
      )}

      {Object.entries(byPage).map(([pageName, pageForms]) => (
        <div key={pageName} className="space-y-3">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
            {pageName}
          </h2>
          {pageForms.map((form) => {
            const isOn = enabled.has(form.id);
            return (
              <Card key={form.id} className={isOn ? "border-primary" : ""}>
                <CardHeader className="flex flex-row items-center justify-between gap-2 pb-3">
                  <div className="flex items-center gap-2 min-w-0">
                    <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                    <CardTitle className="text-base truncate">{form.name}</CardTitle>
                    <Badge variant={form.status === "ACTIVE" ? "default" : "secondary"} className="shrink-0">
                      {form.status === "ACTIVE" ? "Activo" : form.status}
                    </Badge>
                  </div>
                  <button
                    onClick={() => toggle(form.id)}
                    className={`flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm font-medium cursor-pointer transition-colors shrink-0 ${
                      isOn
                        ? "border-green-600 bg-green-50 text-green-700"
                        : "border-input text-muted-foreground hover:bg-muted"
                    }`}
                    title={isOn ? "Clic para deshabilitar" : "Clic para habilitar"}
                  >
                    <span
                      className={`h-2.5 w-2.5 rounded-full ${
                        isOn ? "bg-green-600" : "bg-muted-foreground/40"
                      }`}
                    />
                    {isOn ? "Habilitado" : "No habilitado"}
                  </button>
                </CardHeader>
                <CardContent>
                  {/* Asignar pipeline */}
                  {pipelines.length > 0 && (
                    <div className="flex items-center gap-2 mb-3 pb-3 border-b">
                      <span className="text-xs text-muted-foreground shrink-0">
                        Guardar leads en:
                      </span>
                      <select
                        value={formPipelines[form.id] || ""}
                        onChange={(e) =>
                          setFormPipelines((prev) => ({
                            ...prev,
                            [form.id]: e.target.value,
                          }))
                        }
                        className="h-8 rounded-md border bg-transparent px-2 text-sm cursor-pointer"
                      >
                        <option value="">Pipeline principal (por defecto)</option>
                        {pipelines.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                  <p className="text-xs text-muted-foreground mb-2">
                    {form.questions.length} preguntas:
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {form.questions.map((q) => {
                      const Icon = questionIcon(q);
                      return (
                        <div key={q.key} className="flex items-start gap-2 text-sm">
                          <Icon className="h-3.5 w-3.5 text-primary shrink-0 mt-0.5" />
                          <div className="min-w-0">
                            <p className="break-words">{q.label}</p>
                            {q.options && q.options.length > 0 && (
                              <p className="text-xs text-muted-foreground break-words">
                                {q.options.join(" · ")}
                              </p>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      ))}
    </div>
  );
}
