import { test, expect } from "playwright/test";
import { assistantExternalTopics } from "../../src/lib/privacy/assistant-topics";

test("external AI receives constant product topics without personal input", () => {
 const result = assistantExternalTopics("Mi perfil es de Isaac, cédula 208060421, correo privado@example.com, teléfono 88887777. contraseña secreta");
 expect(result).toBeTruthy();
 for (const privateValue of ["Isaac", "208060421", "privado@example.com", "88887777", "secreta"]) expect(result).not.toContain(privateValue);
 expect(result).toBe(assistantExternalTopics("perfil contraseña"));
});
test("unknown questions stay local rather than forwarding arbitrary text", () => {
 expect(assistantExternalTopics("¿Cuál es la capital de Francia?")).toBeNull();
});
