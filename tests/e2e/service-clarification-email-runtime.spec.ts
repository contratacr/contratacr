import { test, expect } from "playwright/test";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";

test("clarification replies and closures skip email without disabling ordinary support email", async () => {
  let emails=0;
  const box={exports:{} as {notifyUserOfReply:(opts:Record<string,unknown>)=>Promise<void>}};
  const code=ts.transpileModule(readFileSync("src/lib/support-notify.ts","utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText;
  const mocks:Record<string,unknown>={
    "@/lib/nombres":{nombreDeSaludo:()=>"Persona"},
    "@/lib/email/send":{EMAIL_LOGO_DARK_MODE_STYLES:"",emailLogoMarkup:()=>"",sendBrevoEmail:async()=>{emails++;}},
    "@/lib/support/guest-access":{guestAccessLink:()=>"https://contratacr.test/soporte"},
  };
  runInNewContext(code,{module:box,exports:box.exports,require:(id:string)=>mocks[id],process:{env:{}},console});
  const reply={toEmail:"fixture@contratacr.test",toName:"Persona",subject:"Servicio",body:"Pregunta",hasAccount:true,panel:"profesional",ticketId:"ticket",topic:"service_suggestion"};
  await box.exports.notifyUserOfReply(reply);
  await box.exports.notifyUserOfReply({...reply,body:"Caso cerrado"});
  expect(emails).toBe(0);
  await box.exports.notifyUserOfReply({...reply,topic:"other"});
  expect(emails).toBe(1);
});
