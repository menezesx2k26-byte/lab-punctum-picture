// Post-listen diagnostics for the disposable Node QA instance.
// Never invoke this runner from production or while using real Punctum data.
import { prepareManagedQaDatabase } from './managed-bootstrap.mjs';

const expectedOrigin = 'https://aliceblue-locust-999458.hostingersite.com';
const expectedFile = '/home/u571409090/punctum-qa-private-20261112/application.sqlite';
if (process.env.PUNCTUM_QA_MANAGED_BOOTSTRAP !== '1' ||
    process.env.PUNCTUM_QA_ORIGIN !== expectedOrigin ||
    process.env.PUNCTUM_QA_DB_FILE !== expectedFile) {
  throw new Error('Post-listen diagnostics restricted to synthetic QA');
}
process.umask(0o077);
const receipt = await prepareManagedQaDatabase(expectedFile, {verifyTransactions:true});
console.log('PUNCTUM_MANAGED_QA ' + JSON.stringify(receipt));
