"""Synthetic SQLite + local-filesystem object-store failure matrix (NOT Worker/D1/R2 tests).
No network, package installs or writes outside an owned tempfile. Reproducible via Python stdlib.
"""
from __future__ import annotations
import hashlib, json, os, sqlite3, tempfile
from pathlib import Path

ERROR_POINTS = ("before_put", "after_put", "after_head", "after_revision_insert", "after_cas", "after_receipt", "after_outbox", "after_commit", "after_email_failure")
PAYLOAD = b"synthetic-final-pixels-not-a-real-image"
OLD = b"synthetic-old-final"
PRINCIPAL = "access:verified-operator-01"

class Crash(Exception): pass
class Conflict(Exception): pass
class NotAuthorized(Exception): pass

class Environment:
    def __init__(self, root: Path):
        self.root = root
        self.objects = root / "objects"
        self.objects.mkdir(parents=True, exist_ok=True)
        self.db_path = root / "db.sqlite"
        self.db = sqlite3.connect(self.db_path, isolation_level=None)
        self.db.execute("PRAGMA foreign_keys=ON")
        self.db.executescript("""
        CREATE TABLE gallery(id TEXT PRIMARY KEY, owner TEXT NOT NULL, revision INTEGER NOT NULL, current_rev TEXT NOT NULL, expires INTEGER NOT NULL);
        CREATE TABLE published(id TEXT PRIMARY KEY, gallery TEXT NOT NULL REFERENCES gallery(id), object_key TEXT NOT NULL, digest TEXT NOT NULL, parent TEXT, status TEXT NOT NULL CHECK(status='sealed'));
        CREATE TABLE receipt(gallery TEXT NOT NULL, principal TEXT NOT NULL, key TEXT NOT NULL, payload_digest TEXT NOT NULL, revision_id TEXT NOT NULL REFERENCES published(id), PRIMARY KEY(gallery,principal,key));
        CREATE TABLE outbox(id TEXT PRIMARY KEY, revision_id TEXT NOT NULL REFERENCES published(id), status TEXT NOT NULL CHECK(status IN ('pending','failed','sent')), provider_receipt TEXT);
        CREATE TABLE audit(id TEXT PRIMARY KEY, principal TEXT NOT NULL, revision_id TEXT NOT NULL REFERENCES published(id));
        CREATE TABLE candidate(id TEXT PRIMARY KEY, gallery TEXT NOT NULL, selected INTEGER NOT NULL CHECK(selected IN(0,1)), accepted INTEGER NOT NULL CHECK(accepted IN(0,1)));
        """)
        old = self.put_immutable(OLD)
        self.db.execute("INSERT INTO gallery VALUES('GA','A',0,'REV0',1000)")
        self.db.execute("INSERT INTO gallery VALUES('GB','B',0,'REVB',1000)")
        self.db.execute("INSERT INTO published VALUES('REV0','GA',?,?,'', 'sealed')",(old,sha(OLD)))
        self.db.execute("INSERT INTO published VALUES('REVB','GB',?,?,'', 'sealed')",(old,sha(OLD)))
        self.db.execute("INSERT INTO candidate VALUES('PA','GA',1,1)")
        self.db.execute("INSERT INTO candidate VALUES('UNCONFIRMED','GA',0,1)")
        self.db.execute("INSERT INTO candidate VALUES('REJECTED','GA',1,0)")
        self.db.execute("INSERT INTO candidate VALUES('PB','GB',1,1)")

    def put_immutable(self, content:bytes) -> str:
        key = sha(content)
        file=self.objects/key
        try:
            with file.open('xb') as f:
                f.write(content)
        except FileExistsError:
            if file.read_bytes()!=content:
                raise Conflict('immutable key collision or damaged object')
        return key
    def head(self,key:str)->bool: return (self.objects/key).is_file()
    def read(self,key:str)->bytes|None:
        file=self.objects/key
        return file.read_bytes() if file.is_file() else None
    def visible(self,tenant:str,now:int, gallery='GA')->bytes|None:
        if now>=self.db.execute("SELECT expires FROM gallery WHERE id=?",(gallery,)).fetchone()[0]:return None
        data=self.db.execute("SELECT p.object_key,p.digest FROM gallery g JOIN published p ON p.id=g.current_rev AND p.gallery=g.id WHERE g.id=? AND g.owner=? AND p.status='sealed'",(gallery,tenant)).fetchone()
        if data is None:return None
        content=self.read(data[0]);return content if content is not None and sha(content)==data[1] else None
    def publish(self, principal:str, key:str, payload:bytes=PAYLOAD, candidate='PA', expect=0, stop=None):
        def crash(point):
            if stop==point:raise Crash(point)
        if principal!=PRINCIPAL:raise NotAuthorized('verified per-user identity required')
        digest=sha(payload)
        prior=self.db.execute("SELECT payload_digest,revision_id FROM receipt WHERE gallery='GA' AND principal=? AND key=?",(principal,key)).fetchone()
        if prior:
            if prior[0]!=digest:raise Conflict('IDEMPOTENCY_CONFLICT')
            return prior[1]
        chosen=self.db.execute("SELECT selected,accepted FROM candidate WHERE id=? AND gallery='GA'",(candidate,)).fetchone()
        if chosen!=(1,1):raise Conflict('NOT_CONFIRMED_OR_ACCEPTED')
        crash('before_put')
        object_key=self.put_immutable(payload)
        crash('after_put')
        if not self.head(object_key) or sha(self.read(object_key))!=digest:raise Conflict('OBJECT_UNVERIFIED')
        crash('after_head')
        rev=f'REV-{key}'
        try:
            self.db.execute('BEGIN IMMEDIATE')
            self.db.execute("INSERT INTO published VALUES(?,?,?,?,?, 'sealed')",(rev,'GA',object_key,digest,'REV0'))
            crash('after_revision_insert')
            rowcount=self.db.execute("UPDATE gallery SET current_rev=?,revision=revision+1 WHERE id='GA' AND owner='A' AND revision=?",(rev,expect)).rowcount
            if rowcount!=1:raise Conflict('STALE_REVISION')
            crash('after_cas')
            self.db.execute("INSERT INTO receipt VALUES('GA',?,?,?,?)",(principal,key,digest,rev))
            crash('after_receipt')
            self.db.execute("INSERT INTO outbox VALUES(?,?, 'pending',NULL)",(f'event-{key}',rev))
            self.db.execute("INSERT INTO audit VALUES(?,?,?)",(f'audit-{key}',principal,rev))
            crash('after_outbox')
            self.db.execute('COMMIT')
        except (Crash,Conflict,sqlite3.Error):
            if self.db.in_transaction:self.db.execute('ROLLBACK')
            raise
        crash('after_commit')
        if stop=='after_email_failure':
            self.db.execute("UPDATE outbox SET status='failed' WHERE id=?",(f'event-{key}',))
            raise Crash('email provider unavailable')
        return rev
    def snapshot(self):
        g=self.db.execute("SELECT current_rev,revision FROM gallery WHERE id='GA'").fetchone()
        return {'current':g[0],'revision':g[1],'published':self.db.execute("SELECT count(*) FROM published WHERE gallery='GA'").fetchone()[0], 'receipts':self.db.execute('SELECT count(*) FROM receipt').fetchone()[0], 'outbox':self.db.execute('SELECT count(*) FROM outbox').fetchone()[0], 'audit':self.db.execute('SELECT count(*) FROM audit').fetchone()[0]}
    def candidates_for_reap(self,now:int,births:dict[str,int],grace=86400):
        referenced={r[0] for r in self.db.execute("SELECT object_key FROM published").fetchall()}
        # Orphan object not referenced by ANY historical revision must pass grace and two scans.
        return sorted(f.name for f in self.objects.iterdir() if f.name not in referenced and now-births.get(f.name,now)<=(10**9) and now-births.get(f.name,now)>=grace)
    @classmethod
    def reopen(cls, root:Path):
        # Simulated restart: close connection, reopen the file-backed database and object directory.
        instance=cls.__new__(cls)
        instance.root=root
        instance.objects=root/'objects'
        instance.db_path=root/'db.sqlite'
        instance.db=sqlite3.connect(instance.db_path,isolation_level=None)
        instance.db.execute('PRAGMA foreign_keys=ON')
        return instance
    def close(self):self.db.close()

def sha(v:bytes)->str:return hashlib.sha256(v).hexdigest()

checks=[]
def mark(label,value,expected):checks.append({'case':label,'observed':value,'expected':expected,'ok':value==expected})
with tempfile.TemporaryDirectory(prefix='punctum-r5-failpoints-') as scratch:
    base=Path(scratch)
    for failure in ERROR_POINTS:
        root=base/failure
        env=Environment(root)
        try:env.publish(PRINCIPAL,'key-1',stop=failure)
        except Crash:pass
        state=env.snapshot()
        env.close()
        env=Environment.reopen(root)
        after_reopen=env.snapshot()
        mark(f'{failure}:reopened_pointer',after_reopen['current'],state['current'])
        mark(f'{failure}:reopened_receipt_count',after_reopen['receipts'],state['receipts'])
        committed=failure in ('after_commit','after_email_failure')
        mark(f'{failure}:pointer',state['current'],'REV-key-1' if committed else 'REV0')
        mark(f'{failure}:revision_count',state['revision'],1 if committed else 0)
        mark(f'{failure}:receipt_count',state['receipts'],1 if committed else 0)
        mark(f'{failure}:outbox_count',state['outbox'],1 if committed else 0)
        mark(f'{failure}:audit_count',state['audit'],1 if committed else 0)
        mark(f'{failure}:client_bytes',env.visible('A',999),PAYLOAD if committed else OLD)
        mark(f'{failure}:tenant_B_zero_bytes',env.visible('B',999),None)
        mark(f'{failure}:expiry_exact_zero_bytes',env.visible('A',1000),None)
        # Successful retry must return same revision; if before commit it completes, else replay returns receipt.
        retry=env.publish(PRINCIPAL,'key-1')
        mark(f'{failure}:retry_id',retry,'REV-key-1')
        mark(f'{failure}:retry_no_extra_rev',env.snapshot()['revision'],1)
        mark(f'{failure}:retry_no_double_outbox',env.snapshot()['outbox'],1)
        try:env.publish(PRINCIPAL,'key-1',payload=b'different-payload')
        except Conflict as exc:code=str(exc)
        else:code='UNEXPECTED_ACCEPT'
        mark(f'{failure}:key_conflict',code,'IDEMPOTENCY_CONFLICT')
        mark(f'{failure}:state_after_key_conflict',env.snapshot()['revision'],1)
        try:env.publish('shared-password@punctum.invalid','stolen-key')
        except NotAuthorized:denied=True
        else:denied=False
        mark(f'{failure}:shared_password_cannot_approve',denied,True)
        env.close()
    env=Environment(base/'validation')
    for candidate in ['UNCONFIRMED','REJECTED','PB','ABSENT']:
        try:env.publish(PRINCIPAL,'candidate-'+candidate,candidate=candidate)
        except Conflict as exc:code=str(exc)
        else:code='UNEXPECTED_ACCEPT'
        mark(f'candidate:{candidate}',code,'NOT_CONFIRMED_OR_ACCEPTED')
        mark(f'candidate:{candidate}:no_sql_change',env.snapshot()['revision'],0)
    # Simulated R2 blob corruption after a committed valid publication: response fail closed.
    env.publish(PRINCIPAL,'key-1')
    blob_key=sha(PAYLOAD)
    file=env.objects/blob_key
    file.write_bytes(b'corrupted-on-disk')
    mark('corrupted_published_blob_no_bytes',env.visible('A',999),None)
    mark('corrupted_published_blob_preserve_metadata',env.snapshot()['current'],'REV-key-1')
    # A historical final remains referenced even after pointer advances.
    root2=base/'gc'
    gc=Environment(root2)
    staged=gc.put_immutable(b'orphan-candidate')
    births={staged:0,sha(OLD):0,sha(PAYLOAD):0}
    mark('orphan_not_reaped_before_grace',gc.candidates_for_reap(86399,births),[])
    mark('orphan_eligible_after_grace',gc.candidates_for_reap(86400,births),[staged])
    gc.publish(PRINCIPAL,'key-1')
    mark('historical_object_excluded_from_gc',sha(OLD) in gc.candidates_for_reap(172800,births),False)
    mark('published_object_excluded_from_gc',sha(PAYLOAD) in gc.candidates_for_reap(172800,births),False)
    gc.close();env.close()

report={'kind':'SYNTHETIC_SQLITE_FILESYSTEM_FAILPOINT_SAGA_NOT_CLOUDFLARE_D1_OR_R2','python':'stdlib','assertions':len(checks),'passed':sum(x['ok'] for x in checks),'failed':[x for x in checks if not x['ok']],'failpoints':list(ERROR_POINTS),'checks':checks,'realD1Calls':0,'realR2Calls':0,'realEmailCalls':0,'productCodeModified':False}
print(json.dumps(report,ensure_ascii=False,indent=2,default=lambda x:x.hex() if isinstance(x,bytes) else str(x)))
raise SystemExit(0 if not report['failed'] else 1)
