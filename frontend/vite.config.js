import {defineConfig} from 'vite';
// The QA browser runs against an isolated JSON server, not the developer's real backend.
// Normal local development remains pinned to port 4100 unless explicitly overridden.
export default defineConfig({
 server:{port:5173,proxy:{'/api':process.env.AUREL_API_PROXY_TARGET||'http://127.0.0.1:4100'}},
 preview:{port:4173},
 build:{rollupOptions:{output:{manualChunks(id){
  if(id.includes('/node_modules/'))return 'vendor';
 }}}}
});
