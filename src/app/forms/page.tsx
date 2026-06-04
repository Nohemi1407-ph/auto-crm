import { FormsExplorer } from "@/components/forms/FormsExplorer";

export const dynamic = "force-dynamic";

export default function FormsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Formularios de Facebook</h1>
        <p className="text-muted-foreground">
          Detecta en tiempo real todos los Instant Forms de tu portafolio y
          elige cuáles usar en el CRM.
        </p>
      </div>
      <FormsExplorer />
    </div>
  );
}
