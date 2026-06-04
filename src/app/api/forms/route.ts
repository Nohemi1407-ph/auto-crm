import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { crmSettings } from "@/db/schema";
import { eq } from "drizzle-orm";

const GRAPH = "https://graph.facebook.com/v19.0";

type Question = { key: string; label: string; type: string; options?: string[] };
type Form = {
  id: string;
  name: string;
  status: string;
  pageId: string;
  pageName: string;
  questions: Question[];
};

// GET: descubre en tiempo real todos los formularios del portafolio
export async function GET() {
  const token = process.env.META_ACCESS_TOKEN;
  if (!token) {
    return NextResponse.json(
      { error: "META_ACCESS_TOKEN no configurado en el servidor" },
      { status: 500 }
    );
  }

  try {
    // 1. Listar páginas del portafolio (con su token de página)
    const pagesRes = await fetch(
      `${GRAPH}/me/accounts?fields=name,id,access_token&limit=100&access_token=${token}`
    );
    const pagesData = (await pagesRes.json()) as {
      data?: Array<{ id: string; name: string; access_token: string }>;
      error?: { message: string };
    };

    if (pagesData.error) {
      return NextResponse.json(
        { error: `Error de Meta: ${pagesData.error.message}` },
        { status: 502 }
      );
    }

    const pages = pagesData.data ?? [];

    // 2. Para cada página, traer sus formularios + preguntas (en paralelo)
    const formsPerPage = await Promise.all(
      pages.map(async (page) => {
        try {
          const res = await fetch(
            `${GRAPH}/${page.id}/leadgen_forms?fields=id,name,status,questions&limit=100&access_token=${page.access_token}`
          );
          const data = (await res.json()) as {
            data?: Array<{
              id: string;
              name: string;
              status: string;
              questions?: Array<{
                key: string;
                label: string;
                type: string;
                options?: Array<{ value: string }>;
              }>;
            }>;
          };
          return (data.data ?? []).map(
            (f): Form => ({
              id: f.id,
              name: f.name,
              status: f.status,
              pageId: page.id,
              pageName: page.name,
              questions: (f.questions ?? []).map((q) => ({
                key: q.key,
                label: q.label,
                type: q.type,
                options: q.options?.map((o) => o.value),
              })),
            })
          );
        } catch {
          return [] as Form[];
        }
      })
    );

    const forms = formsPerPage.flat();

    // 3. Leer qué formularios están habilitados en el CRM
    const enabledSetting = db
      .select()
      .from(crmSettings)
      .where(eq(crmSettings.key, "enabled_forms"))
      .get();
    const enabledIds: string[] = enabledSetting
      ? JSON.parse(enabledSetting.value)
      : [];

    return NextResponse.json({
      pages: pages.map((p) => ({ id: p.id, name: p.name })),
      forms,
      enabledIds,
      total: forms.length,
    });
  } catch (error) {
    return NextResponse.json(
      { error: `Error: ${error instanceof Error ? error.message : "desconocido"}` },
      { status: 500 }
    );
  }
}

// POST: guardar qué formularios usa el CRM
export async function POST(request: NextRequest) {
  let body: { enabledIds?: string[] };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const enabledIds = Array.isArray(body.enabledIds) ? body.enabledIds : [];

  db.insert(crmSettings)
    .values({ key: "enabled_forms", value: JSON.stringify(enabledIds) })
    .onConflictDoUpdate({
      target: crmSettings.key,
      set: { value: JSON.stringify(enabledIds) },
    })
    .run();

  return NextResponse.json({ success: true, enabledIds });
}
