import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { contacts, activities, crmSettings } from "@/db/schema";
import { eq } from "drizzle-orm";

// GET: Facebook verifica que el webhook es tuyo
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);

  const mode = searchParams.get("hub.mode");
  const token = searchParams.get("hub.verify_token");
  const challenge = searchParams.get("hub.challenge");

  const verifyToken = process.env.META_VERIFY_TOKEN;

  if (mode === "subscribe" && token === verifyToken) {
    return new NextResponse(challenge, { status: 200 });
  }

  return NextResponse.json({ error: "Token inválido" }, { status: 403 });
}

// POST: Facebook envía el lead_id cuando hay un nuevo lead
export async function POST(request: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const accessToken = process.env.META_ACCESS_TOKEN;
  if (!accessToken) {
    return NextResponse.json(
      { error: "META_ACCESS_TOKEN no configurado" },
      { status: 500 }
    );
  }

  try {
    const entry = (body.entry as Array<Record<string, unknown>>)?.[0];
    const changes = (entry?.changes as Array<Record<string, unknown>>)?.[0];
    const value = changes?.value as Record<string, unknown>;
    const leadId = value?.leadgen_id as string;
    const formId = value?.form_id as string | undefined;

    if (!leadId) {
      return NextResponse.json({ received: true }, { status: 200 });
    }

    // Filtro: si el usuario eligió formularios específicos, ignorar el resto.
    // Si la lista está vacía, se procesan TODOS (comportamiento por defecto).
    const enabledSetting = db
      .select()
      .from(crmSettings)
      .where(eq(crmSettings.key, "enabled_forms"))
      .get();
    if (enabledSetting && formId) {
      const enabledIds: string[] = JSON.parse(enabledSetting.value);
      if (enabledIds.length > 0 && !enabledIds.includes(formId)) {
        return NextResponse.json(
          { received: true, ignored: "formulario no habilitado" },
          { status: 200 }
        );
      }
    }

    // Llamar a Graph API para obtener los datos reales del lead
    const graphUrl = `https://graph.facebook.com/v19.0/${leadId}?access_token=${accessToken}`;
    const graphRes = await fetch(graphUrl);
    const leadData = (await graphRes.json()) as {
      field_data?: Array<{ name: string; values: string[] }>;
      id?: string;
    };

    if (!graphRes.ok || !leadData.field_data) {
      return NextResponse.json(
        { error: "No se pudo obtener el lead de Facebook", leadId },
        { status: 500 }
      );
    }

    // Mapear campos del formulario
    const fields: Record<string, string> = {};
    const fieldMap: Record<string, string> = {
      full_name: "name",
      nombre: "name",
      nombre_completo: "name",
      first_name: "firstName",
      nombre_de_pila: "firstName",
      last_name: "lastName",
      apellido: "lastName",
      apellidos: "lastName",
      email: "email",
      correo: "email",
      correo_electronico: "email",
      phone_number: "phone",
      phone: "phone",
      telefono: "phone",
      celular: "phone",
      whatsapp: "phone",
      company_name: "company",
      company: "company",
      empresa: "company",
      negocio: "company",
    };

    // Capitaliza la primera letra
    const capitalize = (s: string) =>
      s.length > 0 ? s.charAt(0).toUpperCase() + s.slice(1) : s;

    // Normaliza el nombre del campo (quita acentos, signos, espacios)
    const normalize = (s: string) =>
      s
        .toLowerCase()
        .normalize("NFD")
        .replace(/[̀-ͯ]/g, "")
        .replace(/[¿?¡!]/g, "")
        .trim()
        .replace(/\s+/g, "_");

    // Detecta el tipo de pregunta para mostrar un icono adecuado en la tarjeta
    const detectType = (label: string): string => {
      const l = label.toLowerCase();
      if (/(estado|ciudad|pais|país|ubicaci|donde|dónde|zona|region|región|direcci)/.test(l)) return "location";
      if (/(edad|años|anos|grupo de edad|cumple)/.test(l)) return "age";
      if (/(presupuesto|invertir|inversi|precio|costo|pagar|dinero|dolar|dólar|\$)/.test(l)) return "budget";
      if (/(lograr|objetivo|meta|necesit|busca|interes|interés|quiere|deseas|gustaria|gustaría)/.test(l)) return "goal";
      if (/(cuando|cuándo|fecha|tiempo|horario|disponib)/.test(l)) return "time";
      if (/(web|sitio|pagina|página|url|http)/.test(l)) return "website";
      if (/(trabajo|empleo|ocupaci|profesi|negocio|empresa)/.test(l)) return "work";
      return "question";
    };

    // Estructura las respuestas del formulario (para mostrarlas como campos)
    const formAnswers: Array<{ label: string; value: string; type: string }> = [];

    for (const field of leadData.field_data) {
      const rawName = field.name;
      const norm = normalize(rawName);
      const value = field.values.join(", ");
      const mapped = fieldMap[norm];
      if (mapped) {
        fields[mapped] = field.values[0] ?? "";
      } else {
        // Pregunta personalizada del formulario -> dato estructurado
        const label = capitalize(rawName.replace(/_/g, " ").trim());
        const cleanValue = capitalize(value.replace(/_/g, " ").trim());
        formAnswers.push({ label, value: cleanValue, type: detectType(label) });
      }
    }

    // Combinar first_name + last_name si no hay full_name
    if (!fields.name && (fields.firstName || fields.lastName)) {
      fields.name = [fields.firstName, fields.lastName]
        .filter(Boolean)
        .join(" ")
        .trim();
    }

    if (!fields.name) {
      return NextResponse.json(
        { error: "El formulario no contiene nombre", leadId },
        { status: 400 }
      );
    }

    const now = new Date();
    const contact = db
      .insert(contacts)
      .values({
        name: fields.name,
        email: fields.email || null,
        phone: fields.phone || null,
        company: fields.company || null,
        source: "facebook_lead",
        temperature: "warm",
        score: 50,
        notes: `Lead de Facebook Instant Form · Lead ID: ${leadId}`,
        formData: formAnswers.length > 0 ? JSON.stringify(formAnswers) : null,
        createdAt: now,
        updatedAt: now,
      })
      .returning()
      .get();

    db.insert(activities)
      .values({
        type: "note",
        description: `Lead recibido desde Facebook Instant Form (Lead ID: ${leadId})`,
        contactId: contact.id,
        createdAt: now,
      })
      .run();

    return NextResponse.json({ success: true, contactId: contact.id }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: `Error interno: ${error instanceof Error ? error.message : "Unknown"}` },
      { status: 500 }
    );
  }
}
