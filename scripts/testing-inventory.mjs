import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

// Static inventory, NOT a claim of behavioral test coverage. Every source
// surface and JSX control is listed, including items without related specs.
const walk = dir => fs.readdirSync(dir,{withFileTypes:true}).flatMap(e => e.isDirectory()?walk(`${dir}/${e.name}`):[`${dir}/${e.name}`]).sort();
const specs = walk('tests/e2e').filter(f=>f.endsWith('.spec.ts')&&!path.basename(f).startsWith('.tmp-'));
const domains = [
 ['Verificación', /verifica|verification|cedula|identity/, ['verification-documents','verification-email-policy','verificacion-repesca','verification-badges']],
 ['Autenticación y registro', /auth|login|registro|register|onboarding|password|contrasena|completar-perfil|resend|availability-check|check-availability/, ['auth-screens','auth-support','native-social-access','apple-existing-account','multiple-sign-in-methods']],
 ['Administración', /admin/, ['admin-smoke','admin-bottom-nav','admin-editar-datos','admin-campaigns-policy']],
 ['Mensajes y adjuntos', /chat|mensajes|fila-deslizable/, ['direct-chat','mensajes-sin-parpadeo','mobile-native-shell']],
 ['Notificaciones y push', /notifica|push/, ['notifications-guides-regression','push-outbox-contract','mobile-native-shell']],
 ['Estadísticas', /statistic|analytic|attribution|meta-pixel/, ['statistics-dashboard','runtime-analytics','meta-growth-runtime']],
 ['Cuenta y privacidad', /account|cuenta|perfil|profile/, ['account-lifecycle','professional-profile','account-settings-layout','account-scroll-layout']],
 ['Búsqueda y profesionales', /search|profession|profesional|buscar|busqueda|category|categor/, ['search-results','search-ranking','services','native-edge-back']],
 ['Empleos', /jobs|empleo/, ['marketplace-lifecycle','marketplace-editors','tableros-filtros']],
 ['Promociones', /offers|promocion/, ['marketplace-lifecycle','marketplace-editors','tableros-filtros']],
 ['Proyectos', /project|proyecto|publication/, ['projects-board','seeded-regression','publication-access']],
 ['Cotizaciones', /quote|cotiza|\/c\//, ['cotizaciones']],
 ['Reseñas', /review|resena|reseña/, ['professional-profile','whatsapp-review-followup']],
 ['Soporte', /support|soporte/, ['auth-support','support-guest-access','soporte-cierre-automatico']],
 ['Descargar app y PWA', /app-download|app-store|descargar|abrir-app|pwa/, ['app-download','mobile-app-campaign']],
 ['Navegación nativa', /mobile|native|rutas-sin-barra/, ['mobile-native-shell','native-edge-back','native-home-paint','reanudar-la-app']],
 ['Correos y campañas', /email|campaign|reminder|unsubscribe|baja-correos|brevo|resumen-semanal/, ['email-delivery','email-brand-contrast','lifecycle-email-policy','profile-reminder']],
 ['Moderación', /moderat|block|bloquear|report|appeals/, ['bloqueo-de-usuarios','interaction-surfaces','admin-smoke']],
 ['Asistente', /assistant|concierge/, ['ai-assistant']],
 ['Marca, portada y footer', /landing|brand|navbar|footer/, ['public-smoke','navbar-brand-consistency','portada-y-menu']],
 ['Servicios, ayuda y legales', /services|servicio|legal|ayuda|guides|terminos|privacidad|como-funciona|contacto/, ['services','about-guides','public-smoke']],
 ['Estados de carga y errores', /loading|skeleton|error|perf|cache|not-found|mantenimiento|health|operational-status/, ['dashboard-surfaces','navigation-loading','dashboard-cache-races','pantallas-en-todos-los-anchos']],
 ['Subida y medios', /upload|media|image|photo/, ['extended-lifecycle','sin-parpadeo-imagenes']],
 ['Mapas y ubicaciones', /maps|workplaces/, ['maps-configuration','search-results']],
 ['Contacto y conexiones', /contact|connections/, ['contact-gate','whatsapp-review-followup','seeded-regression']],
 ['Idiomas', /intl|document-locale|translate/, ['language-switch-context','public-smoke','product-contract','pantallas-en-todos-los-anchos']],
 ['Guardar, cambios y menús', /save|unsaved|card-actions|expand-toggle/, ['aviso-de-guardado','cambios-sin-guardar','acciones-de-tarjeta']],
 ['Panel y publicaciones', /dashboard|marketplace|use-mode/, ['dashboard-surfaces','marketplace-editors','statistics-dashboard']],
 ['Gestos, scroll y reanudación', /scroll|arrastre|deslizar|desplazar|desvanecido|toque|pantalla|viewport|resume/, ['native-edge-back','reanudar-la-app','sin-saltos-de-diseno','sombras-al-desplazar']],
 ['Notificaciones y mensajes no leídos', /avisos|message-unread/, ['notifications-guides-regression','direct-chat']],
 ['SEO y enlaces', /seo|sitemap|robots/, ['public-smoke','professional-profile']],
 ['Publicidad y atribución', /internal\/meta/, ['meta-growth-runtime']],
 ['Shell, portada y utilidades compartidas', /layout|\/page.tsx$|global-data-refresh|catalogo-del-servidor|use-app-dialog/, ['public-smoke','cabeceras','interaction-surfaces']],
 ['UI compartida', /components\/ui|components\/icons/, ['interaction-surfaces','calidad-general','recent-visual-regression']],
];
const textSpecs = new Map(specs.map(f=>[f,fs.readFileSync(f,'utf8')]));
const sourceFiles = [...walk('src/app'),...walk('src/components'),...walk('src/hooks')].filter(f=>/\.[cm]?tsx?$/.test(f));
const items = sourceFiles.map(file=>{
 const source=fs.readFileSync(file,'utf8');
 const ast=ts.createSourceFile(file,source,ts.ScriptTarget.Latest,true,file.endsWith('tsx')?ts.ScriptKind.TSX:ts.ScriptKind.TS);
 const kind=file.endsWith('/page.tsx')?'Página':file.endsWith('/route.ts')?'API / handler':file.startsWith('src/components/')?'Componente':file.startsWith('src/hooks/')?'Hook':'Layout / estado / módulo de ruta';
 const match=domains.find(([,re])=>re.test(file));
 const group=match?.[0]||'Otros: clasificación manual pendiente';
 const related=(match?.[2]||[]).map(s=>`tests/e2e/${s}.spec.ts`).filter(s=>textSpecs.has(s));
 const exports=[],controls=[],testIds=[],methods=[];
 function visit(n){
  if((ts.isFunctionDeclaration(n)||ts.isClassDeclaration(n))&&n.modifiers?.some(m=>m.kind===ts.SyntaxKind.ExportKeyword)&&n.name)exports.push(n.name.text);
  if(ts.isVariableStatement(n)&&n.modifiers?.some(m=>m.kind===ts.SyntaxKind.ExportKeyword)) for(const d of n.declarationList.declarations) if(d.initializer&&(ts.isArrowFunction(d.initializer)||ts.isFunctionExpression(d.initializer)))exports.push(d.name.getText(ast));
  if(ts.isJsxOpeningElement(n)||ts.isJsxSelfClosingElement(n)){
   const tag=n.tagName.getText(ast);
   const attrs=Object.fromEntries(n.attributes.properties.filter(ts.isJsxAttribute).map(a=>[a.name.getText(ast),a.initializer?.getText(ast)||'true']));
   if(attrs['data-testid'])testIds.push(attrs['data-testid'].replace(/^['"]|['"]$/g,''));
   if(/^(button|a|input|select|textarea|form|Button|Link|Dialog|Select|Switch|Checkbox)$/.test(tag)||Object.keys(attrs).some(a=>/^on(Click|Submit|Change|Pointer|Touch)/.test(a))) controls.push({line:ast.getLineAndCharacterOfPosition(n.getStart(ast)).line+1,tag,label:attrs['aria-label']||attrs.name||attrs.placeholder||'Texto/etiqueta dinámica: revisar en UI',handler:attrs.onClick||attrs.onSubmit||attrs.onChange||'',destination:attrs.href||'',states:'habilitado, deshabilitado, foco, carga, éxito, error, doble pulsación; según aplique'});
  }
  if(ts.isFunctionDeclaration(n)&&n.name&&/^(GET|POST|PUT|PATCH|DELETE|OPTIONS|HEAD)$/.test(n.name.text))methods.push(n.name.text);
  ts.forEachChild(n,visit);
 }
 visit(ast);
 const references=specs.filter(s=>textSpecs.get(s).includes(file)||textSpecs.get(s).includes(file.replace(/^src\//,'@/').replace(/\.tsx?$/,''))||testIds.some(id=>!id.includes('{')&&textSpecs.get(s).includes(id)));
 const strategy=kind==='API / handler'?'API + integración BD + autorización/propiedad + idempotencia; smoke solo lectura':kind==='Hook'?'Contrato/integración + carreras, limpieza y navegación': 'Smoke de carga + regresión de acciones y estados + accesibilidad + visual responsive + ES/EN';
 return {file,kind,group,route:kind==='Página'||kind==='API / handler'?file.replace(/^src\/app/,'').replace(/\/(page.tsx|route.ts)$/,'')||'/':null,exports,methods,controls,testIds,relatedSpecs:related,directReferences:references,evidence:references.length?'Referencia estática detectada; verificar assertions':'Sin referencia directa detectada; no implica ausencia de cobertura E2E',strategy,coverage:'Alcance detallado pendiente de revisión; no certificado',priority:/auth|admin|verification|upload|chat|account/.test(file)?'P0':'P1'};
});
const dashboard=fs.readFileSync('src/app/[locale]/dashboard/profesional/page.tsx','utf8');
const tabs=[...(dashboard.match(/const ALL_TABS = new Set<Tab>\(\[([\s\S]*?)\]\)/)?.[1]||'').matchAll(/"([^"]+)"/g)].map(m=>m[1]);
const testCases=specs.map(file=>{
 const ast=ts.createSourceFile(file,textSpecs.get(file),ts.ScriptTarget.Latest,true); const cases=[];
 function visit(n){if(ts.isCallExpression(n)&&/^test(?:\.(?:skip|fixme|only))?$/.test(n.expression.getText(ast))&&n.arguments[0])cases.push({line:ast.getLineAndCharacterOfPosition(n.getStart(ast)).line+1,title:n.arguments[0].getText(ast)});ts.forEachChild(n,visit);}visit(ast);return {file,cases};
});
const result={scope:'Todos los archivos TypeScript de src/app, src/components y src/hooks, controles JSX declarados, pestañas del panel y specs permanentes. No enumera cada elemento dinámico renderizado ni componentes dentro de dependencias.',warning:'Inventario estático, no cobertura ejecutada. Los specs relacionados son candidatos por dominio; una referencia textual tampoco demuestra que todas las acciones estén probadas.',totals:{files:items.length,controls:items.reduce((n,i)=>n+i.controls.length,0),pages:items.filter(i=>i.kind==='Página').length,handlers:items.filter(i=>i.kind==='API / handler').length,components:items.filter(i=>i.kind==='Componente').length,hooks:items.filter(i=>i.kind==='Hook').length,specs:specs.length},dashboardTabs:tabs,items,testCases};
const output='docs/testing-inventory.json';const json=JSON.stringify(result,null,2)+'\n';
if(process.argv.includes('--check')){if(!fs.existsSync(output)||fs.readFileSync(output,'utf8')!==json)throw Error('Inventario desactualizado: node scripts/testing-inventory.mjs');console.log('Inventario actualizado',result.totals);process.exit(0);}
fs.writeFileSync(output,json);
const escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const rows=items.map(i=>`<tr><td>${escape(i.group)}<br><small>${escape(i.kind)} · ${i.priority}</small></td><td><code>${escape(i.file)}</code>${i.route?`<p>${escape(i.route)}</p>`:''}<details><summary>${i.controls.length} controles · ${i.exports.length} componentes/funciones exportadas</summary>${i.exports.map(escape).join(', ')}<ul>${i.controls.map(c=>`<li>L${c.line} ${escape(c.tag)}: ${escape(c.label)} ${escape(c.destination)}</li>`).join('')}</ul></details></td><td>${escape(i.strategy)}<p>${escape(i.evidence)}</p><details><summary>Pruebas relacionadas (${i.relatedSpecs.length})</summary>${i.relatedSpecs.map(escape).join('<br>')}</details><details><summary>Referencias directas (${i.directReferences.length})</summary>${i.directReferences.map(escape).join('<br>')}</details></td><td>Pendiente de certificar</td></tr>`).join('');
const html=`<!doctype html><html lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>ContrataCR · Inventario de testing</title><style>body{font:15px system-ui;color:#162543;background:#f5f8fa;margin:24px auto;max-width:1500px;padding:0 20px}h1{font-size:30px}section{background:white;padding:22px;border-radius:12px;margin:18px 0}input{font:inherit;padding:12px;width:min(650px,90%)}table{border-collapse:collapse;width:100%;background:white}td,th{padding:14px;text-align:left;border-bottom:1px solid #ddd;vertical-align:top}code{overflow-wrap:anywhere}small{color:#65758a}details{margin:12px 0}summary{cursor:pointer}li{margin-bottom:8px}@media(max-width:700px){table,tbody,tr,td{display:block}thead{display:none}td{border:0}tr{border-bottom:2px solid #ccc}}</style><h1>Inventario completo de superficies y testing</h1><p>${escape(result.scope)}</p><section><strong>${Object.entries(result.totals).map(([k,v])=>`${v} ${k}`).join(' · ')}</strong><p>${escape(result.warning)}</p></section><section><h2>Cómo probar cada nivel</h2><ul><li><b>Smoke:</b> rutas críticas, carga, acceso, navegación y destinos; por cambio/despliegue.</li><li><b>Regresión:</b> acciones completas, guardar/cancelar, vacío, error, reintento, permisos y persistencia; antes de publicar.</li><li><b>API + BD:</b> validación, propiedad, roles, duplicados, concurrencia, reintentos y limpieza; datos aislados.</li><li><b>Rendimiento:</b> carga fría/caliente, navegación con caché y sin caché, skeleton bajo red lenta, sin pantalla vacía ni saltos. El límite actual de 6 s mide carga general, no interacción inmediata ni Core Web Vitals.</li><li><b>Idiomas:</b> cambiar ES↔EN manteniendo ruta y contexto; textos largos, errores, fechas, correos y exportaciones.</li><li><b>Nativo:</b> Android/iOS: botones, barra inferior, menús, atrás, teclado, permisos, compartir/guardar, enlaces, reanudación y proveedores reales. Un mock no certifica el sistema operativo.</li><li><b>Admin:</b> navegación y formularios por rol, búsqueda/filtros/paginación, confirmaciones, permisos y efecto persistido. Evitar envíos o escrituras de prueba en producción.</li></ul><h3>Ambientes</h3><p>Chrome PC y móvil; WebKit móvil; 320/390/768/1024/1366/1440 px; PWA; Android e iOS reales/simulados. Firefox no tiene proyecto configurado. Producción: smoke de solo lectura.</p><h3>Estados por componente</h3><p>Inicial · vacío · poblado · cargando/skeleton · error · sin permiso · deshabilitado · guardando · éxito · reintento · doble clic · atrás · cerrar sin guardar · teclado/foco · ES/EN.</p><h3>Pestañas del panel (${tabs.length})</h3><p>${tabs.map(escape).join(' · ')}</p><h3>Brechas que deben certificarse</h3><p>Revisar cada control dinámico; asociar casos concretos a cada acción de admin; medir LCP/CLS/INP con presupuestos y hardware definidos; medir transición caliente aparte de carga de página; completar OAuth, push y compartir archivos reales en ambas plataformas. No se marca ningún componente como completamente probado solo por tener un spec relacionado.</p></section><input id="filter" placeholder="Buscar sección, componente, ruta o prueba"><p id="count"></p><table><thead><tr><th>Sección</th><th>Superficie y controles</th><th>Método y evidencia</th><th>Certificación</th></tr></thead><tbody>${rows}</tbody></table><section><h2>Catálogo de pruebas existentes</h2>${testCases.map(s=>`<details><summary>${escape(s.file)} (${s.cases.length} declaraciones)</summary><ul>${s.cases.map(c=>`<li>L${c.line}: ${escape(c.title)}</li>`).join('')}</ul></details>`).join('')}</section><script>const rows=[...document.querySelectorAll('tbody tr')];document.querySelector('#filter').addEventListener('input',e=>{const q=e.target.value.toLowerCase();let n=0;for(const r of rows){r.hidden=!r.textContent.toLowerCase().includes(q);if(!r.hidden)n++}document.querySelector('#count').textContent=n+' superficies visibles'});document.querySelector('#count').textContent=rows.length+' superficies';</script></html>`;
fs.writeFileSync('docs/testing-inventory.html',html);console.log(result.totals);
