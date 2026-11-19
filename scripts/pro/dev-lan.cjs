/* eslint-disable @typescript-eslint/no-require-imports -- Standalone CommonJS local launcher; no app bundler. */
// Private-network HTTPS preview. No tunnels, deployments, database changes or
// credentials in the output. Stop the existing Next dev process before running.
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const http2 = require('node:http2');
const http = require('node:http');
const net = require('node:net');
const {spawn, execFileSync} = require('node:child_process');
const root = path.resolve(__dirname, '../..');
process.chdir(root);
const addresses = Object.values(os.networkInterfaces()).flat().filter(a => a && a.family === 'IPv4' && !a.internal).map(a => a.address);
const privateIp = ip => /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(ip);
const host = process.argv[2] || addresses.find(privateIp);
if (!addresses.includes(host) || !privateIp(host)) throw Error('Use una IPv4 privada de esta Mac.');
const env = {};
for (const line of fs.readFileSync('.env.test','utf8').split(/\r?\n/)) {
  const match = line.match(/^([A-Z][A-Z0-9_]*)\s*=\s*(.*)$/);
  if (match) env[match[1]] = match[2].replace(/^(['"])(.*)\1$/, '$2');
}
if (env.NEXT_PUBLIC_SUPABASE_URL !== 'http://127.0.0.1:54321') throw Error('Solo se permite Supabase local en 127.0.0.1:54321.');
const origin = `https://${host}:3443`;
const certDir = path.join(root, '.env.pro-lan-cert');
fs.mkdirSync(certDir, {recursive:true, mode:0o700});
const key = path.join(certDir,'key.pem'), cert = path.join(certDir,'cert.pem');
if (!fs.existsSync(cert) || fs.readFileSync(path.join(certDir,'host'),'utf8') !== host) {
  const config=path.join(certDir,'openssl.cnf');
  fs.writeFileSync(config,`[req]\ndistinguished_name=dn\nx509_extensions=ext\nprompt=no\n[dn]\nCN=${host}\n[ext]\nsubjectAltName=IP:${host},IP:127.0.0.1,DNS:localhost\n`);
  execFileSync('openssl',['req','-x509','-newkey','rsa:2048','-nodes','-days','30','-keyout',key,'-out',cert,'-config',config],{stdio:'ignore'});
  fs.chmodSync(key,0o600); fs.writeFileSync(path.join(certDir,'host'),host);
}
const destination = req => {
  if ((req.headers.host ?? req.headers[':authority']) !== `${host}:3443`) return null;
  if (req.url.startsWith('/__local_supabase/')) {
    const url = req.url.slice('/__local_supabase'.length);
    if (!/^\/(auth\/v1|rest\/v1|storage\/v1|realtime\/v1)(\/|\?|$)/.test(url) || /^\/auth\/v1\/admin/.test(url)) return null;
    return {port:54321,url};
  }
  return {port:3185,url:req.url};
};
// Next's locale rewrites use its loopback listener's protocol. Normalize only
// the exact gateway origin; foreign origins remain foreign for CSRF checks.
const headersFor = (req,target) => ({...Object.fromEntries(Object.entries(req.headers).filter(([key])=>!key.startsWith(':'))),
  ...(target.port===3185 && req.headers.origin===origin ? {origin:`http://${host}:3443`} : {}),
  host:target.port===54321?'127.0.0.1:54321':`${host}:3443`,
  'x-forwarded-host':`${host}:3443`,'x-forwarded-proto':'http'});
const server = http2.createSecureServer({allowHTTP1:true,key:fs.readFileSync(key),cert:fs.readFileSync(cert)},(req,res)=>{
  const target=destination(req);
  if(!target){res.writeHead(403);res.end();return;}
  const upstream=http.request({hostname:'127.0.0.1',port:target.port,path:target.url,method:req.method,headers:headersFor(req,target)},response=>{
    const headers={...response.headers};delete headers['strict-transport-security'];
    for(const name of ['connection','keep-alive','transfer-encoding','upgrade']) delete headers[name];
    if(headers.location && /^http:\/\//.test(headers.location)) {
      const location=new URL(headers.location);
      if([`${host}:3443`,'localhost:3185','127.0.0.1:3185'].includes(location.host)) headers.location=origin+location.pathname+location.search+location.hash;
    }
    res.writeHead(response.statusCode,headers);response.pipe(res);
  });
  upstream.on('error',()=>{if(!res.headersSent)res.writeHead(502);res.end('Servidor local iniciando. Recargue en unos segundos.');});
  req.on('aborted',()=>upstream.destroy());req.pipe(upstream);
});
server.on('upgrade',(req,socket,head)=>{
  const target=destination(req);
  if(!target||req.headers.origin!==origin){socket.destroy();return;}
  const upstream=net.connect(target.port,'127.0.0.1',()=>{
    const headers=headersFor(req,target);
    upstream.write(`${req.method} ${target.url} HTTP/1.1\r\n`+Object.entries(headers).map(([k,v])=>`${k}: ${v}`).join('\r\n')+'\r\n\r\n');
    if(head.length)upstream.write(head);socket.pipe(upstream);upstream.pipe(socket);
  });
  upstream.on('error',()=>socket.destroy());socket.on('error',()=>upstream.destroy());socket.on('close',()=>upstream.destroy());
});
server.listen(3443,host,()=>{
  console.log(`Pro local en el celular: ${origin}`);
  console.log('Certificado local autofirmado: el teléfono debe aceptar este certificado para abrir la vista. No se cambia la confianza del sistema automáticamente.');
});
const child=spawn(process.execPath,['node_modules/next/dist/bin/next','dev','--webpack','--hostname','127.0.0.1','--port','3185'],{cwd:root,stdio:'inherit',env:{...process.env,...env,NODE_ENV:'development',NEXT_PUBLIC_PRO_LAN_ORIGIN:origin,PUSH_DELIVERY_ENABLED:'false'}});
child.on('exit',code=>{server.close();process.exit(code??0);});
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>{child.kill(signal);server.close();});
