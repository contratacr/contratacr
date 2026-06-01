import Link from "next/link";
import { ArrowRight, User, Briefcase } from "lucide-react";
import { Navbar } from "@/components/layout/navbar";
import { Card, CardContent } from "@/components/ui/card";

export default function RegistroPage() {
  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />

      <main className="flex-1 flex items-center justify-center py-12 px-4">
        <div className="w-full max-w-lg">
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold text-[#111827]">Crear cuenta</h1>
            <p className="text-[#6b7280] mt-2">¿Cómo querés usar ContrataCR?</p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Link href="/registro/cliente">
              <Card className="h-full cursor-pointer hover:border-[#319278] hover:shadow-md transition-all duration-200 group">
                <CardContent className="p-6 text-center">
                  <div className="flex h-14 w-14 mx-auto items-center justify-center rounded-2xl bg-[#f0f9f6] mb-4 group-hover:bg-[#bbe2d5] transition-colors">
                    <User className="h-7 w-7 text-[#319278]" />
                  </div>
                  <h2 className="font-semibold text-[#111827] mb-2">Soy cliente</h2>
                  <p className="text-sm text-[#6b7280]">
                    Quiero contratar servicios profesionales
                  </p>
                  <div className="flex items-center justify-center gap-1 mt-4 text-sm text-[#319278] font-medium">
                    Registrarme <ArrowRight className="h-4 w-4" />
                  </div>
                </CardContent>
              </Card>
            </Link>

            <Link href="/registro/profesional">
              <Card className="h-full cursor-pointer hover:border-[#ff7c0a] hover:shadow-md transition-all duration-200 group">
                <CardContent className="p-6 text-center">
                  <div className="flex h-14 w-14 mx-auto items-center justify-center rounded-2xl bg-[#fff8ed] mb-4 group-hover:bg-[#ffdba5] transition-colors">
                    <Briefcase className="h-7 w-7 text-[#ff7c0a]" />
                  </div>
                  <h2 className="font-semibold text-[#111827] mb-2">Soy profesional</h2>
                  <p className="text-sm text-[#6b7280]">
                    Quiero ofrecer mis servicios
                  </p>
                  <div className="flex items-center justify-center gap-1 mt-4 text-sm text-[#ff7c0a] font-medium">
                    Registrarme <ArrowRight className="h-4 w-4" />
                  </div>
                </CardContent>
              </Card>
            </Link>
          </div>

          <p className="text-center text-sm text-[#6b7280] mt-6">
            ¿Ya tenés cuenta?{" "}
            <Link href="/login" className="text-[#319278] font-medium hover:underline">
              Iniciá sesión
            </Link>
          </p>
        </div>
      </main>
    </div>
  );
}
