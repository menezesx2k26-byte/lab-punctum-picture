import { createQaServer } from './app.mjs';

// Managed hosting imports this entrypoint instead of executing it as argv[1].
const port=Number(process.env.PORT||3000);
if(!Number.isInteger(port)||port<1||port>65535) throw new Error('A valid provider PORT is required');
createQaServer().listen(port,'0.0.0.0',()=>console.log('Punctum QA capability probe listening'));
