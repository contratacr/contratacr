import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { expect, test } from "playwright/test";

// DUEÑO DE /api/professional-cv. La ruta ya tenía su prueba real
// (tests/cv/sharing.test.mjs: subir, ver sin sesión, ocultar, reemplazar,
// borrar, CSRF, dueño, cuarentena, perfil oculto, retiro durante la descarga,
// fallos del escáner y del almacenamiento, formato y tamaño, macros de DOCX y
// el bucket privado en PostgreSQL), pero ningún flujo la corría. Aquí se
// ejecuta tal cual, sin servidor ni base real: falla si falla cualquiera.
test("CV compartido: la ruta /api/professional-cv cumple su contrato", () => {
  const result = spawnSync(process.execPath, ["--test", resolve(process.cwd(), "tests/cv/sharing.test.mjs")], {
    cwd: process.cwd(),
    encoding: "utf8",
    timeout: 120_000,
  });
  const output = `${result.stdout ?? ""}${result.stderr ?? ""}`;
  expect(result.status, output).toBe(0);
  expect(output).toMatch(/ℹ pass 7\b/);
  expect(output).toMatch(/ℹ fail 0\b/);
});
