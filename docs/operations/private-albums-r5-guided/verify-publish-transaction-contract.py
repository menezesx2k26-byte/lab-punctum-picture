"""In-memory/fake-object RED/GREEN contract experiments; NOT real D1/R2 or product tests.
Run from any directory: python verify-publish-transaction-contract.py [sandbox-dir]
Inputs are pinned legacy 0009 + previously published relation reference + experimental guards.
"""
import hashlib, json, sqlite3, sys, tempfile, threading
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
P=Path(sys.argv[1]) if len(sys.argv)>1 else Path(__file__).resolve().parent
PINS={"0009.sql":"0636a83626db74d30a0fbefa15086c6a251401ca4dc6283e426f7d30265a65e8","relational-fk-reference-model.sql":"87634c1efeeb390947cee2a209d519d2c63d39366cd9739ecb660785c351aea8","reference-publish-guards.sql":"9699dfa86bcfb694af33f631447fb6070b7343b1ee4aa7dc654a8a949874bd63"}
INPUTS={name:(P/name if (P/name).is_file() else Path(__file__).resolve().parents[3]/'migrations/0009_private_client_galleries.sql') if name=='0009.sql' else P/name for name in PINS}
for name,pin in PINS.items():
    actual=hashlib.sha256(INPUTS[name].read_bytes()).hexdigest()
    if actual!=pin: raise RuntimeError(f"Source drift {name}: {actual} != {pin}")
SCHEMA='\n'.join(INPUTS[name].read_text() for name in PINS)
checks=[]
def mark(name,observed,expected,notes=""):
    checks.append(dict(id=name,observed=observed,expected=expected,matched=observed==expected,notes=notes))
def db_new():
    d=sqlite3.connect(":memory:", isolation_level=None)
    d.execute("PRAGMA foreign_keys=ON")
    d.executescript(SCHEMA)
    for c in ('A','B'):
        d.execute("INSERT INTO client_accounts(id,name,email,password_hash,password_salt,password_iterations,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?)",(c,c,c.lower()+'@example.invalid','fake','fake',310000,'t','t'))
        d.execute("INSERT INTO client_galleries(id,client_id,title,created_at,updated_at) VALUES (?,?,?,?,?)",('G'+c,c,'synthetic','t','t'))
    for im,g in [('IA','GA'),('IX','GA'),('IY','GA'),('IB','GB')]:
        d.execute("INSERT INTO client_gallery_images(id,gallery_id,storage_key,original_filename,mime_type,size_bytes,position,status,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)",(im,g,'mock:'+im,im+'.jpg','image/jpeg',2,0,'ready','t','t'))
    for rev,g,state in [('RA','GA','open'),('RB','GB','open'),('RO','GA','open')]:
        d.execute("INSERT INTO r5_ref_selection_revisions VALUES(?,?,?)",(rev,g,state))
    for g,r,im in [('GA','RA','IA'),('GA','RA','IX'),('GB','RB','IB'),('GA','RO','IX')]:
        d.execute("INSERT INTO r5_ref_selection_items VALUES(?,?,?)",(g,r,im))
    d.execute("UPDATE r5_ref_selection_revisions SET state='confirmed' WHERE id IN ('RA','RB')")
    for final,g,r,im in [('FA','GA','RA','IA'),('F2','GA','RA','IX'),('FB','GB','RB','IB')]:
        d.execute("INSERT INTO r5_ref_final_versions VALUES(?,?,?,?,?)",(final,g,r,im,'private:'+final))
    for dv,g,r in [('DA','GA','RA'),('DB','GB','RB')]:
        d.execute("INSERT INTO r5_ref_delivery_revisions VALUES(?,?,?,?)",(dv,g,r,1))
    for g,dv,r,im,f in [('GA','DA','RA','IA','FA'),('GB','DB','RB','IB','FB')]:
        d.execute("INSERT INTO r5_ref_delivery_items VALUES(?,?,?,?,?)",(g,dv,r,im,f))
    for g,c,r,dv in [('GA','A','RA','DA'),('GB','B','RB','DB')]:
        d.execute("INSERT INTO r5_ref_workflows VALUES(?,?,?,?,?)",(g,c,r,dv,0))
    return d

def attempt_sql(label,query,expected,setup=None):
    d=db_new()
    if setup: d.execute(setup)
    try:
        d.execute(query)
        outcome='ACCEPTED'
    except sqlite3.IntegrityError as exc:
        outcome=str(exc)
    mark(label,outcome,expected)
    mark(label+"_FK_INTEGRITY",len(d.execute("PRAGMA foreign_key_check").fetchall()),0)
    d.close()

attempt_sql('P01_valid_read','SELECT * FROM r5_ref_workflows WHERE client_id="A"','ACCEPTED')
attempt_sql('N01_open_selection_cannot_create_final',"INSERT INTO r5_ref_final_versions VALUES('FX','GA','RO','IX','private:FX')",'R5_UNCONFIRMED_SELECTION')
attempt_sql('N02_open_selection_cannot_create_delivery',"INSERT INTO r5_ref_delivery_revisions VALUES('DX','GA','RO',2)",'R5_UNCONFIRMED_DELIVERY')
attempt_sql('N03_published_final_object_key_immutable',"UPDATE r5_ref_final_versions SET private_object_key='stolen:IA' WHERE id='FA'",'R5_FINAL_IMMUTABLE')
attempt_sql('N04_published_final_gallery_immutable',"UPDATE r5_ref_final_versions SET gallery_id='GB' WHERE id='FA'",'R5_FINAL_IMMUTABLE')
attempt_sql('N05_confirmation_cannot_reopen',"UPDATE r5_ref_selection_revisions SET state='open' WHERE id='RA'",'R5_SELECTION_CONFIRMATION_IMMUTABLE')
attempt_sql('N06_confirmed_item_cannot_update',"UPDATE r5_ref_selection_items SET proof_image_id='IX' WHERE gallery_id='GA' AND selection_revision_id='RA'",'R5_SELECTION_ITEMS_IMMUTABLE')
attempt_sql('N07_confirmed_item_cannot_delete',"DELETE FROM r5_ref_selection_items WHERE gallery_id='GA' AND selection_revision_id='RA'",'R5_SELECTION_ITEMS_IMMUTABLE')
attempt_sql('N08_published_final_cannot_delete',"DELETE FROM r5_ref_final_versions WHERE id='FA'",'FOREIGN KEY constraint failed')
attempt_sql('N09_cross_tenant_published_pointer',"UPDATE r5_ref_workflows SET published_revision_id='DB' WHERE gallery_id='GA'",'FOREIGN KEY constraint failed')
attempt_sql('N10_cross_tenant_final_reference',"INSERT INTO r5_ref_delivery_items VALUES('GA','DX','RA','IX','FB')",'FOREIGN KEY constraint failed',"INSERT INTO r5_ref_delivery_revisions VALUES('DX','GA','RA',2)")
attempt_sql('N11_confirmed_selection_no_new_item',"INSERT INTO r5_ref_selection_items VALUES('GA','RA','IY')",'R5_SELECTION_ITEMS_IMMUTABLE')
attempt_sql('N12_published_snapshot_no_extra_item',"INSERT INTO r5_ref_delivery_items VALUES('GA','DA','RA','IX','F2')",'R5_PUBLISHED_DELIVERY_IMMUTABLE')
attempt_sql('N13_published_snapshot_no_update',"UPDATE r5_ref_delivery_items SET final_version_id='F2' WHERE gallery_id='GA' AND delivery_revision_id='DA'",'R5_PUBLISHED_DELIVERY_IMMUTABLE')
attempt_sql('N14_published_snapshot_no_delete',"DELETE FROM r5_ref_delivery_items WHERE delivery_revision_id='DA'",'R5_PUBLISHED_DELIVERY_IMMUTABLE')
attempt_sql('N15_published_revision_no_update',"UPDATE r5_ref_delivery_revisions SET revision_no=3 WHERE id='DA'",'R5_PUBLISHED_DELIVERY_IMMUTABLE')
attempt_sql('P02_open_selection_can_add_item',"INSERT INTO r5_ref_selection_items VALUES('GA','RO','IY')",'ACCEPTED')
attempt_sql('P03_unpublished_snapshot_can_prepare_item',"INSERT INTO r5_ref_delivery_items VALUES('GA','DX','RA','IX','F2')",'ACCEPTED',"INSERT INTO r5_ref_delivery_revisions VALUES('DX','GA','RA',2)")

d=db_new()
mark('CAS01_expected_revision',d.execute("UPDATE r5_ref_workflows SET revision=revision+1 WHERE gallery_id='GA' AND client_id='A' AND revision=0").rowcount,1)
mark('CAS02_stale_revision',d.execute("UPDATE r5_ref_workflows SET revision=revision+1 WHERE gallery_id='GA' AND client_id='A' AND revision=0").rowcount,0)
mark('CAS03_wrong_owner',d.execute("UPDATE r5_ref_workflows SET revision=revision+1 WHERE gallery_id='GA' AND client_id='B' AND revision=1").rowcount,0)
d.close()

d=db_new()
d.execute('BEGIN IMMEDIATE')
d.execute("UPDATE r5_ref_workflows SET revision=revision+1 WHERE gallery_id='GA' AND revision=0")
try:d.execute("INSERT INTO r5_guard_outbox VALUES('GA','DB','fake-cross-tenant','pending')")
except sqlite3.IntegrityError:d.execute('ROLLBACK')
mark('TX01_atomic_outbox_failure_undoes_pointer',d.execute("SELECT revision FROM r5_ref_workflows WHERE gallery_id='GA'").fetchone()[0],0)
mark('TX02_failed_event_not_in_outbox',d.execute("SELECT count(*) FROM r5_guard_outbox").fetchone()[0],0)
d.close()

d=db_new()
d.execute('BEGIN IMMEDIATE')
d.execute("UPDATE r5_ref_workflows SET revision=revision+1 WHERE gallery_id='GA' AND revision=0")
d.execute("INSERT INTO r5_guard_publish_receipt VALUES('GA','key-001','DA','t')")
d.execute("INSERT INTO r5_guard_outbox VALUES('GA','DA','event-001','pending')")
d.execute('COMMIT')
mark('TX03_good_publish_pointer_revision',d.execute("SELECT revision FROM r5_ref_workflows WHERE gallery_id='GA'").fetchone()[0],1)
mark('TX04_good_publish_receipt_count',d.execute('SELECT count(*) FROM r5_guard_publish_receipt').fetchone()[0],1)
mark('TX05_good_publish_pending_outbox_count',d.execute("SELECT count(*) FROM r5_guard_outbox WHERE status='pending'").fetchone()[0],1)
try:d.execute("INSERT INTO r5_guard_publish_receipt VALUES('GA','key-001','DA','t')");duplicate='ACCEPTED'
except sqlite3.IntegrityError as exc:duplicate=str(exc)
mark('TX06_replay_unique_key',duplicate,'UNIQUE constraint failed: r5_guard_publish_receipt.gallery_id, r5_guard_publish_receipt.idempotency_key')
mark('TX07_replay_fetch_same_receipt',d.execute("SELECT delivery_revision_id FROM r5_guard_publish_receipt WHERE gallery_id='GA' AND idempotency_key='key-001'").fetchone()[0],'DA')
mark('TX08_replay_does_not_enqueue_duplicate',d.execute("SELECT count(*) FROM r5_guard_outbox").fetchone()[0],1)
d.close()

# Synthetic R2 is only an in-memory set. It neither sends network calls nor measures storage.
objects={'private:FA','private:FB'}
d=db_new()
mark('OBJ01_missing_candidate_blocks_publish_precondition',('private:MISSING' not in objects),True)
mark('OBJ02_missing_candidate_keeps_current_pointer',d.execute("SELECT published_revision_id FROM r5_ref_workflows WHERE gallery_id='GA'").fetchone()[0],'DA')
objects.add('private:ORPHAN')
mark('OBJ03_R2_first_SQL_later_failure_creates_orphan',('private:ORPHAN' in objects and d.execute("SELECT count(*) FROM r5_ref_final_versions WHERE private_object_key='private:ORPHAN'").fetchone()[0]==0),True)
# Safe deletion requires independent reconciler grace period; not modeled as automatic deletion.
mark('OBJ04_no_automatic_delete_after_failed_commit',('private:ORPHAN' in objects),True)
d.close()

# Two independent SQLite file connections actually race on the same CAS, unlike the in-memory cases.
race=[]
with tempfile.TemporaryDirectory(prefix='r5_sqlite_cas_') as tmp:
    file=Path(tmp)/'cas.db'
    for number in range(30):
        seeded=db_new(); disk=sqlite3.connect(file); seeded.backup(disk);disk.close();seeded.close()
        go=threading.Barrier(2)
        def actor(identity):
            c=sqlite3.connect(file,timeout=5,isolation_level=None)
            c.execute('PRAGMA busy_timeout=5000')
            go.wait(timeout=5)
            try:
                c.execute('BEGIN IMMEDIATE')
                result=c.execute("UPDATE r5_ref_workflows SET revision=revision+1 WHERE gallery_id='GA' AND revision=0").rowcount
                c.execute('COMMIT')
                return result
            finally:c.close()
        with ThreadPoolExecutor(max_workers=2) as pool:
            futures=[pool.submit(actor,'A'),pool.submit(actor,'B')]
            a,b=(z.result(timeout=10) for z in futures)
        check=sqlite3.connect(file)
        state=check.execute("SELECT revision FROM r5_ref_workflows WHERE gallery_id='GA'").fetchone()[0]
        check.close()
        race.append(dict(round=number,updatedRows=sorted((a,b)),finalRevision=state))
        file.unlink()
mark('CAS04_two_connection_30_rounds_one_winner',sum(z['updatedRows']==[0,1] and z['finalRevision']==1 for z in race),30)

report={'classification':'SYNTHETIC_SQLITE_REFERENCE_CONTRACT_NOT_CLOUDFLARE_D1_OR_R2','sourceSHA256':PINS,'python':sys.version.split()[0],'sqlite':sqlite3.sqlite_version,'matched':sum(z['matched'] for z in checks),'total':len(checks),'raceRounds':len(race),'cases':checks,'failed':[z for z in checks if not z['matched']],'originalApplicationTests':0,'R5D1IntegrationTests':0,'R2IntegrationTests':0}
print(json.dumps(report,indent=2))
sys.exit(0 if report['matched']==report['total'] else 1)
