import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { posix } from 'node:path';
const require = createRequire(import.meta.url);
const ts = require(process.env.CI_TYPESCRIPT_MODULE || 'typescript');
// Configuration outside this reviewed resolver can add invisible consumers.
export const reviewedConfiguration = {
  'next.config.ts': '21877a39357bf08af41303110cb1aa76b2d7bf42',
  'playwright.config.ts': '8b5fb8f000ec4f7a06712557bf2c37a29386c3b2',
  'playwright.mobile.config.ts': '00e8e54e0b45bbeda6905ea11dec97f7fcdca13b',
};
const configCode = p => /^(?:next|playwright(?:\.mobile)?)\.config\.[cm]?[jt]s$/.test(p);
const analyzedCode = p => /^(src\/|tests\/e2e\/)/.test(p) || configCode(p);
const configInput = p => ['tsconfig.json','package.json'].includes(p) || configCode(p);
const spec = name => `tests/e2e/${name}.spec.ts`;

// Reviewed behavior suites, not a filename-keyword ownership heuristic. Shared
// dependencies add every consuming route's section from BOTH Git revisions.
export const sectionSuites = {
  empleos: ['marketplace-lifecycle', 'marketplace-editors', 'tableros-filtros', 'marketplace-paging-server', 'marketplace-progressive-loading', 'contact-channel-stability', 'contact-context-measurement', 'publication-access'],
  promociones: ['marketplace-lifecycle', 'marketplace-editors', 'tableros-filtros', 'marketplace-paging-server', 'marketplace-progressive-loading', 'search-offer-loading', 'contact-channel-stability', 'contact-context-measurement', 'publication-access'],
  proyectos: ['projects-board', 'project-purpose', 'client-project-identity', 'seeded-regression', 'publication-access', 'publicacion-cerrada', 'marketplace-paging-server', 'marketplace-progressive-loading'],
  profesionales: ['professional-profile', 'professional-data-matrix', 'professional-ownership', 'profile-entry-stability', 'profile-header-consistency', 'profile-image-budget', 'marketplace-profile-photo', 'current-profile-names-runtime', 'search-results', 'search-ranking', 'search-starting-price', 'search-nearby-cantons', 'search-progressive-loading', 'contact-gate', 'contact-channel-stability', 'contact-context-measurement', 'whatsapp-review-followup', 'mobile-search-focus'],
  servicios: ['services', 'search-results', 'buscar-servicio-y-lugar', 'search-suggestion-confirmation'],
  ayuda: ['about-guides', 'auth-support', 'public-smoke'],
  legales: ['legal-privacy', 'public-smoke'],
  soporte: ['auth-support', 'support-guest-access', 'soporte-cierre-automatico'],
  mensajes: ['web-chat-parity', 'direct-chat', 'chat-image-interactions', 'chat-message-dates', 'chat-photo-send-races', 'mensajes-sin-parpadeo', 'contact-channel-stability'],
  notificaciones: ['notifications-guides-regression', 'notifications-delete-all', 'notification-action-copy', 'notification-modal-layout', 'push-outbox-contract'],
  cotizaciones: ['cotizaciones', 'cost-history-contract', 'completion-price-navigation'],
  panel: ['dashboard-surfaces', 'statistics-dashboard', 'account-cache', 'account-settings-layout', 'account-scroll-layout', 'publication-refresh-runtime', 'marketplace-editors'],
};
// Every section change also covers public entry, URL/language behavior and the
// native shell. They are still separate web and WebView configurations.
export const entrySuites = ['public-smoke', 'app-link-coverage', 'shared-link-language', 'native-link-launch', 'mobile-native-shell', 'native-edge-back', 'navbar-brand-consistency'];
const routeSections = new Map([
  ['empleos','empleos'], ['promociones','promociones'], ['proyectos','proyectos'], ['publicar-proyecto','proyectos'],
  ['profesionales','profesionales'], ['buscar','profesionales'], ['categorias','servicios'], ['servicios','servicios'],
  ['ayuda','ayuda'], ['como-funciona','ayuda'], ['contacto','soporte'], ['soporte','soporte'],
  ['privacidad','legales'], ['terminos','legales'], ['mensajes','mensajes'], ['notificaciones','notificaciones'],
  ['cotizar','cotizaciones'], ['cotizacion','cotizaciones'], ['dashboard','panel'],
]);
const rootPattern = /^src\/app\/(?:.*\/)?(?:page|layout|template|default|loading|error|global-error|not-found|route|opengraph-image|twitter-image|icon|apple-icon|robots|sitemap|manifest)\.[jt]sx?$/s;
const sensitiveName = /(?:^|[/.\-])(?:auth|mfa|session|permission|permissions|security|rls|access)(?:[/.\-]|$)/;
const codePattern = /\.[cm]?[jt]sx?$/;
const criticalPattern = /^(?:src\/(?:middleware|proxy|instrumentation)|src\/i18n\/|src\/app\/api\/|src\/lib\/(?:auth|supabase|mobile)(?:\/|[-.])|src\/hooks\/(?:use-auth|use-native-app|native-app-inicial)\.|src\/components\/(?:auth|admin|mobile|ui|landing|account)\/)/;

export function ownerOfRoot(path) {
  if (!rootPattern.test(path) || !/\/(?:page|layout|template|default|loading|error|not-found)\.[jt]sx?$/.test(path)) return null;
  const match = /^src\/app\/\[locale\]\/([^/]+)\//.exec(path);
  return match ? routeSections.get(match[1]) ?? null : null;
}

/** Read tracked metadata plus source in two batch Git calls; no checkout/mutation. */
export function gitSnapshot(rev) {
  const tree = execFileSync('git',['ls-tree','-rz',rev],{encoding:'utf8',maxBuffer:32*1024*1024});
  const files = new Map();
  for (const row of tree.split('\0').filter(Boolean)) {
    const m = /^(\d+) (?:blob|commit) ([0-9a-f]+)\t(.+)$/s.exec(row);
    if (m) files.set(m[3],{hash:m[2],mode:m[1],source:''});
  }
  const sourceFiles = [...files].filter(([p])=>(/^(src\/|tests\/e2e\/)/.test(p)&&codePattern.test(p))||configInput(p));
  const data = execFileSync('git',['cat-file','--batch'],{input:sourceFiles.map(([,f])=>f.hash).join('\n')+'\n',maxBuffer:64*1024*1024});
  let cursor=0;
  for (const [,file] of sourceFiles) {
    const end=data.indexOf(10,cursor),header=data.subarray(cursor,end).toString('utf8');
    const m=/^[0-9a-f]+ blob (\d+)$/.exec(header);
    if(!m)throw Error('Incomplete Git source snapshot');
    const size=Number(m[1]);cursor=end+1;
    file.source=data.subarray(cursor,cursor+size).toString('utf8');cursor+=size+1;
  }
  return files;
}

function resolveLocal(from, request, files) {
  if (/^(?:[#~\/]|(?:file|data|https?):)/.test(request)) return {error:`Unsupported project module resolution in ${from}`};
  if (!request.startsWith('.')&&!request.startsWith('@/')) return {external:true};
  const base=request.startsWith('@/')?'src/'+request.slice(2):posix.normalize(posix.join(posix.dirname(from),request));
  const candidates=[base,...['.ts','.tsx','.js','.jsx','.mjs','.json','.css'].map(e=>base+e),...['.ts','.tsx','.js','.jsx'].map(e=>base+'/index'+e)];
  if (/\.jsx?$/.test(base)) candidates.push(...['.ts','.tsx'].map(e=>base.replace(/\.jsx?$/,e)));
  const paths=[...new Set(candidates.filter(p=>files.has(p)))];
  return paths.length?{paths}:{error:`Unresolved local import in ${from}: ${request}`};
}

export function dependencyGraph(files) {
  const reverse = new Map(), uncertainties = [], opaqueTests = new Set(), routeTests = new Map(), globalEntries = new Set();
  const link=(child,parent)=>{if(!reverse.has(child))reverse.set(child,new Set());reverse.get(child).add(parent);};
  const localSpecs = value => typeof value==='string' ? /^(?:file:|link:|workspace:|[./])/.test(value) : value&&typeof value==='object'&&Object.values(value).some(localSpecs);
  for(const [path,file] of files) {
    if(file.mode&& !['100644','100755'].includes(file.mode)&&(path.startsWith('src/')||configInput(path)))uncertainties.push(`Unreviewed non-regular source/config input: ${path}`);
    if(configCode(path)&&file.hash!==reviewedConfiguration[path])uncertainties.push(`Unreviewed resolver/runner configuration: ${path}`);
    if(configCode(path)) {
      globalEntries.add(path);
      const configSource=ts.createSourceFile(path,file.source,ts.ScriptTarget.Latest,true);
      const inspect=node=>{
        if(ts.isPropertyAssignment(node)) {
          const name=ts.isIdentifier(node.name)||ts.isStringLiteralLike(node.name)?node.name.text:null;
          if(['globalSetup','globalTeardown'].includes(name)) {
            const value=node.initializer;
            const entries=ts.isStringLiteralLike(value)?[value]:ts.isArrayLiteralExpression(value)&&value.elements.every(ts.isStringLiteralLike)?[...value.elements]:null;
            if(!entries)uncertainties.push(`Unmodeled global fixture in ${path}`);
            for(const entry of entries??[]) {
              const target=resolveLocal(path,entry.text.startsWith('.')?entry.text:'./'+entry.text,files);
              if(!target.paths)uncertainties.push(`Unresolved global fixture in ${path}`);
              for(const resolved of target.paths??[]){globalEntries.add(resolved);link(resolved,path);if(!codePattern.test(resolved)||!analyzedCode(resolved))uncertainties.push(`Unmodeled global fixture module: ${resolved}`);}
            }
          }
          if(name==='dependencies'&&!(ts.isArrayLiteralExpression(node.initializer)&&node.initializer.elements.length===0))uncertainties.push(`Unmodeled project fixture dependencies in ${path}`);
        }
        node.forEachChild(inspect);
      };
      inspect(configSource);
    }
    if(!['tsconfig.json','package.json'].includes(path))continue;
    const parsed=ts.parseConfigFileTextToJson(path,file.source);
    if(parsed.error){uncertainties.push(`Cannot read resolver configuration: ${path}`);continue;}
    const config=parsed.config??{};
    if(path==='tsconfig.json') {
      const options=config.compilerOptions??{},paths=options.paths??{};
      if(config.extends||options.rootDirs||options.moduleSuffixes||(options.moduleResolution!==undefined&&options.moduleResolution!=='bundler')||(options.baseUrl!==undefined&&options.baseUrl!=='.')||Object.entries(paths).some(([key,targets])=>key!=='@/*'||!Array.isArray(targets)||targets.length!==1||!['./src/*','src/*'].includes(targets[0])))uncertainties.push('Unreviewed TypeScript module resolution.');
    } else {
      if(['imports','exports'].some(key=>config[key]&&(typeof config[key]!=='object'||Object.keys(config[key]).length)))uncertainties.push('Unreviewed package imports/exports resolution.');
      if(config.workspaces||['dependencies','devDependencies','optionalDependencies','peerDependencies','overrides','resolutions'].some(key=>localSpecs(config[key])))uncertainties.push('Unmodeled local/workspace package resolution.');
    }
  }
  const uncertain=(path,reason)=>path.startsWith('tests/e2e/')&&!globalEntries.has(path)?opaqueTests.add(path):uncertainties.push(reason);
  for (const [path,file] of files) {
    if(!codePattern.test(path)||!analyzedCode(path))continue;
    const source=ts.createSourceFile(path,file.source,ts.ScriptTarget.Latest,true);
    if(source.parseDiagnostics.length)uncertain(path,`Cannot parse ${path}`);
    const add=(request,typeOnly=false)=>{
      if(!typeOnly&&['node:module','module','node:child_process','child_process','node:worker_threads','worker_threads','esbuild','esbuild-wasm','typescript','rollup','webpack','@babel/core','@swc/core'].includes(request))uncertain(path,`Unmodeled module/compiler/process factory in ${path}`);
      if(!typeOnly&&path.startsWith('src/')&&['node:fs','fs','node:fs/promises','fs/promises'].includes(request))uncertain(path,`Unmodeled runtime filesystem dependencies in ${path}`);
      const target=resolveLocal(path,request,files);
      if(target.paths)for(const resolved of target.paths){link(resolved,path);if(!typeOnly&&codePattern.test(resolved)&&!analyzedCode(resolved))uncertain(path,`Unanalyzed project module: ${resolved}`);}
      else if(target.error)uncertain(path,target.error);
    };
    const visit=node=>{
      if(ts.isMetaProperty(node)&&node.keywordToken===ts.SyntaxKind.ImportKeyword)uncertain(path,`Unmodeled import.meta dependency in ${path}`);
      if(ts.isCallExpression(node)||ts.isNewExpression(node)) {
        const callee=ts.isIdentifier(node.expression)?node.expression.text:ts.isPropertyAccessExpression(node.expression)?node.expression.name.text:null;
        if(['eval','Function','Worker','SharedWorker','createRequire'].includes(callee))uncertain(path,`Unmodeled dynamic code/worker load in ${path}`);
      }
      if((ts.isImportDeclaration(node)||ts.isExportDeclaration(node))&&node.moduleSpecifier&&ts.isStringLiteralLike(node.moduleSpecifier))add(node.moduleSpecifier.text,Boolean(node.importClause?.isTypeOnly||node.isTypeOnly));
      if(ts.isImportEqualsDeclaration(node)&&ts.isExternalModuleReference(node.moduleReference)&&node.moduleReference.expression&&ts.isStringLiteralLike(node.moduleReference.expression))add(node.moduleReference.expression.text);
      if(ts.isImportTypeNode(node)&&ts.isLiteralTypeNode(node.argument)&&ts.isStringLiteralLike(node.argument.literal))add(node.argument.literal.text,true);
      if(ts.isCallExpression(node)&&(node.expression.kind===ts.SyntaxKind.ImportKeyword||(ts.isIdentifier(node.expression)&&node.expression.text==='require'))) {
        const arg=node.arguments[0];
        if(arg&&ts.isStringLiteralLike(arg))add(arg.text);
        else if(path==='src/i18n/request.ts'&&arg&&ts.isTemplateExpression(arg)&&arg.getText(source)==='`../../messages/${locale}.json`') {
          for(const candidate of files.keys())if(/^messages\/[^/]+\.json$/.test(candidate))link(candidate,path);
        } else uncertain(path,`Computed module load in ${path}`);
      }
      node.forEachChild(visit);
    };
    visit(source);
    // Browser harnesses compile inline code strings rather than importing the
    // module in the test itself. Keep those references in the reverse graph.
    if(path.startsWith('tests/e2e/')||configCode(path))for(const match of file.source.matchAll(/(?:@\/|(?:\.\.\/|\.\/)*src\/)[\w./\[\]-]+/g)) {
      const request=match[0];
      const target=resolveLocal(path,request.startsWith('@/')?request:'@/'+request.slice(request.indexOf('src/')+4),files);
      if(target.paths)for(const resolved of target.paths)link(resolved,path);
      else opaqueTests.add(path);
    }
    // URL-based E2E do not import the page. Preserve literal route consumers
    // in tests AND helpers, in addition to the reviewed behavior suites.
    if(path.startsWith('tests/e2e/')||configCode(path))for(const match of file.source.matchAll(/\/(?:es\/|en\/)?([a-z-]+)(?=[/?#'"`\s)]|$)/g)) {
      const owner=routeSections.get(match[1]);
      if(owner){if(!routeTests.has(owner))routeTests.set(owner,new Set());routeTests.get(owner).add(path);}
    }
    // Next layouts and route states are implicit dependencies, not imports.
    if (/\/(?:layout|template|loading|error|global-error|not-found)\.[jt]sx?$/.test(path)&&path.startsWith('src/app/')) {
      const directory=path.slice(0,path.lastIndexOf('/')+1);
      for(const candidate of files.keys())if(candidate!==path&&candidate.startsWith(directory)&&rootPattern.test(candidate))link(path,candidate);
    }
  }
  for(const opaque of opaqueTests)if([...consumers([opaque],{reverse})].some(p=>p.startsWith('src/')||globalEntries.has(p)))uncertainties.push(`Unmodeled shared fixture/runtime dependency: ${opaque}`);
  return {reverse,uncertainties,opaqueTests,routeTests,globalEntries};
}

export function consumers(start, graph) {
  const seen=new Set(start),queue=[...start];
  for(let i=0;i<queue.length;i++)for(const parent of graph.reverse.get(queue[i])??[])if(!seen.has(parent)){seen.add(parent);queue.push(parent);}
  return seen;
}

export function sectionImpact(changes, before, after, graphs = [dependencyGraph(before),dependencyGraph(after)]) {
  const reject=reason=>({safe:false,reason,sections:[],roots:[],specs:[]});
  const runtime=changes.filter(c=>c.path.startsWith('src/'));
  if(!runtime.length)return reject('No runtime section inputs to classify.');
  if(runtime.some(c=>c.status!=='M'||!codePattern.test(c.path)||(criticalPattern.test(c.path)||sensitiveName.test(c.path))))return reject('New/deleted, non-code or security/native/global infrastructure input.');
  const errors=graphs.flatMap(g=>g.uncertainties);
  if(errors.length)return reject(errors.slice(0,4).join('; '));
  const sections=new Set(),roots=new Set(),extraTests=new Set(),opaqueConsumers=new Set(),urlConsumers=new Set();
  for (const graph of graphs) {
    for (const input of runtime) {
      if(!(graph===graphs[0]?before:after).has(input.path))return reject(`Missing source revision for ${input.path}`);
      const reached=consumers([input.path],graph);
      const shared=[...reached].find(p=>graph.globalEntries.has(p)||(p.startsWith('src/')&&(criticalPattern.test(p)||sensitiveName.test(p))));
      if(shared)return reject(`Critical/shared infrastructure consumer: ${shared}`);
      const unmodeled=[...reached].find(p=>p.startsWith('src/app/')&&codePattern.test(p)&&!rootPattern.test(p)&&![...(graph.reverse.get(p)??[])].some(parent=>parent.startsWith('src/')));
      if(unmodeled)return reject(`Unmodeled application entry consumer: ${unmodeled}`);
      const affectedRoots=[...reached].filter(p=>rootPattern.test(p));
      if(!affectedRoots.length)return reject(`No known route consumer for ${input.path}`);
      for(const root of affectedRoots){const owner=ownerOfRoot(root);if(!owner)return reject(`Shared or unmapped route consumer: ${root}`);roots.add(root);sections.add(owner);}
      for(const path of reached)if(/^tests\/e2e\/[a-z0-9-]+\.spec\.ts$/.test(path))extraTests.add(path);
    }
    // Computed test harness imports cannot safely be excluded by a static graph.
    for(const path of consumers(graph.opaqueTests,graph))if(/^tests\/e2e\/[a-z0-9-]+\.spec\.ts$/.test(path)){extraTests.add(path);opaqueConsumers.add(path);}
  }
  if(sections.size>3)return reject('Impact spans more than three sections.');
  for(const graph of graphs)for(const section of sections)for(const path of consumers(graph.routeTests.get(section)??[],graph))if(/^tests\/e2e\/[a-z0-9-]+\.spec\.ts$/.test(path)){extraTests.add(path);urlConsumers.add(path);}
  const selected=new Set([...entrySuites,...[...sections].flatMap(s=>sectionSuites[s])].map(spec));
  for(const path of extraTests)selected.add(path);
  for(const c of changes)if(c.path.endsWith('.spec.ts'))selected.add(c.path);
  for(const path of selected)if(!after.has(path))return reject(`Required suite missing: ${path}`);
  return {safe:true,reason:'Reviewed route sections plus transitive consumers in both revisions; shared entry/native smoke retained.',sections:[...sections].sort(),roots:[...roots].sort(),specs:[...selected].sort(),testConsumers:[...extraTests].sort(),opaqueTestConsumers:[...opaqueConsumers].sort(),urlTestConsumers:[...urlConsumers].sort()};
}


export function runnerCompatibility(files) {
  try {
    const pkg=JSON.parse(files.get('package.json').source);
    if(pkg.scripts?.['test:e2e:mobile']!=='playwright test --config=playwright.mobile.config.ts'||pkg.scripts?.['pretest:e2e:mobile']||pkg.scripts?.['posttest:e2e:mobile'])return 'Unreviewed mobile runner command/hooks: keep broad coverage.';
    return null;
  }catch{return 'Missing/unreadable runner manifest: keep broad coverage.';}
}
