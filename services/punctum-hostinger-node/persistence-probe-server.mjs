import { createQaServer } from '../punctum-hostinger-qa/app.mjs';
import { probePrivateStorage } from './persistence-probe.mjs';

// A temporary profile of the existing disposable probe, not another hosted app.
const directory = '/home/u571409090/punctum-qa-private-20261112';
const port = Number(process.env.PORT || 3000);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid provider PORT');
process.umask(0o077);
let persistence;
try { persistence = await probePrivateStorage(directory); }
catch (error) {
  // Error text and filesystem paths are deliberately not exposed over HTTP.
  persistence = {schema:1, scope:'synthetic-only', status:'FAILED', code:/^[A-Z_]+$/.test(error.code || '') ? error.code : 'VALIDATION_FAILED'};
}
const server = createQaServer();
server.prependListener('request', (_request, response) => {
  response.setHeader('X-Punctum-QA-Persistence', JSON.stringify(persistence));
});
server.listen(port, '0.0.0.0', () => console.log('Punctum temporary private persistence profile listening'));
