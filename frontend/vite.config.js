import {fileURLToPath} from 'node:url';
import {defineConfig,loadEnv} from 'vite';

const rootEnv = fileURLToPath(new URL('../', import.meta.url));

export default defineConfig(({mode}) => {
 const env = loadEnv(mode, rootEnv, ['AUREL_API_PROXY_TARGET', 'PORT']);
 const port = process.env.PORT || env.PORT;
 const target = process.env.AUREL_API_PROXY_TARGET || env.AUREL_API_PROXY_TARGET || (port ? 'http://127.0.0.1:' + port : 'http://127.0.0.1:4100');
 const proxy = {'/api': target};
 return {
  server: {port: 5173, proxy},
  preview: {port: 4173, proxy},
  build: {rollupOptions: {output: {manualChunks(id) {
   if(id.includes('/node_modules/'))return 'vendor';
  }}}},
 };
});
