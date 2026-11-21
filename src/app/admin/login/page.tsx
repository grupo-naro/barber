import type { Metadata } from "next";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AdminLoginForm } from "./login-form";

// Única página de /admin sin `requireAdminSession()`. Si ya hay cookie de admin válida, el proxy manda a /admin.
export const metadata: Metadata = {
  title: "Administración — Barber",
  robots: { index: false, follow: false },
};

export default function AdminLoginPage() {
  return (
    <main className="flex flex-1 items-center justify-center bg-muted/30 px-4 py-12">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="text-lg">Administración de la plataforma</CardTitle>
          <CardDescription>Acceso solo para administradores de Barber.</CardDescription>
        </CardHeader>
        <CardContent>
          <AdminLoginForm />
        </CardContent>
      </Card>
    </main>
  );
}
