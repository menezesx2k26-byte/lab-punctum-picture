"""Documentation-only RED contract probe (SQLite memory, NOT migration 0010/D1)."""
import hashlib
import json
import pathlib
import sqlite3

DOCS = pathlib.Path(__file__).resolve().parent
ROOT = DOCS.parents[2] if len(DOCS.parents)>2 else DOCS
LEGACY = ROOT / 'migrations/0009_private_client_galleries.sql'
MODEL = DOCS / 'relational-fk-reference-model.sql'
PIN_LEGACY = '5281fc9b99ed85bf6e7751ad7eb11f8b5482df23'
PIN_MODEL_SHA256 = '87634c1efeeb390947cee2a209d519d2c63d39366cd9739ecb660785c351aea8'

def verify_blob(raw):
    return hashlib.sha1(b'blob ' + str(len(raw)).encode() + b'\0' + raw).hexdigest()

def run(legacy=LEGACY, model=MODEL):
    ddl = pathlib.Path(legacy).read_bytes().replace(b'\r\n', b'\n')
    ref = pathlib.Path(model).read_bytes().replace(b'\r\n', b'\n')
    assert verify_blob(ddl) == PIN_LEGACY, '0009 blob drift'
    assert hashlib.sha256(ref).hexdigest() == PIN_MODEL_SHA256, 'model drift'
    def fresh():
        db = sqlite3.connect(':memory:', isolation_level=None)
        db.execute('PRAGMA foreign_keys=ON')
        db.executescript(ddl.decode())
        db.executescript(ref.decode())
        for c in ('A', 'B'):
            db.execute('INSERT INTO client_accounts(id,name,email,password_hash,password_salt,password_iterations,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)', (c,c,c.lower()+'@example.invalid','fake','fake',310000,'t','t'))
            db.execute('INSERT INTO client_galleries(id,client_id,title,created_at,updated_at) VALUES(?,?,?,?,?)', ('G'+c,c,'synthetic','t','t'))
            db.execute('INSERT INTO client_gallery_images(id,gallery_id,storage_key,original_filename,mime_type,size_bytes,position,status,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?)',('I'+c,'G'+c,'synthetic-'+c,c+'.jpg','image/jpeg',2,0,'ready','t','t'))
            db.execute('INSERT INTO r5_ref_selection_revisions VALUES(?,?,?)', ('R'+c,'G'+c,'confirmed'))
            db.execute('INSERT INTO r5_ref_selection_items VALUES(?,?,?)', ('G'+c,'R'+c,'I'+c))
            db.execute('INSERT INTO r5_ref_final_versions VALUES(?,?,?,?,?)', ('F'+c,'G'+c,'R'+c,'I'+c,'private:'+c))
            db.execute('INSERT INTO r5_ref_delivery_revisions VALUES(?,?,?,?)',('D'+c,'G'+c,'R'+c,1))
            db.execute('INSERT INTO r5_ref_delivery_items VALUES(?,?,?,?,?)',('G'+c,'D'+c,'R'+c,'I'+c,'F'+c))
            db.execute('INSERT INTO r5_ref_workflows VALUES(?,?,?,?,?)',('G'+c,c,'R'+c,'D'+c,0))
        return db
    results=[]
    def check(name, sql, expected, pre=None):
        db=fresh()
        try:
            if pre: db.executescript(pre)
            db.execute(sql)
            actual='ACCEPTED'
        except sqlite3.IntegrityError as ex:
            actual='FK_REJECTED' if 'FOREIGN KEY' in str(ex) else 'OTHER_REJECTION'
        fk_errors=db.execute('PRAGMA foreign_key_check').fetchall()
        results.append({'id':name,'observed':actual,'expected':expected,'matched':actual==expected and not fk_errors})
        db.close()
    check('P01_owner_A','SELECT * FROM r5_ref_delivery_items WHERE gallery_id="GA"','ACCEPTED')
    check('P02_owner_B','SELECT * FROM r5_ref_delivery_items WHERE gallery_id="GB"','ACCEPTED')
    checks=[
        ('N01_workflow_other_client',"UPDATE r5_ref_workflows SET client_id='B' WHERE gallery_id='GA'"),
        ('N02_selection_foreign_proof',"INSERT INTO r5_ref_selection_items VALUES('GA','RA','IB')"),
        ('N03_final_foreign_proof',"INSERT INTO r5_ref_final_versions VALUES('X','GA','RA','IB','private:X')"),
        ('N04_final_foreign_selection',"INSERT INTO r5_ref_final_versions VALUES('X','GA','RB','IA','private:X')"),
        ('N06_delivery_foreign_revision',"INSERT INTO r5_ref_delivery_items VALUES('GA','DB','RB','IA','FA')"),
        ('N07_current_selection_foreign_gallery',"UPDATE r5_ref_workflows SET current_selection_id='RB' WHERE gallery_id='GA'"),
        ('N08_published_revision_foreign_gallery',"UPDATE r5_ref_workflows SET published_revision_id='DB' WHERE gallery_id='GA'"),
        ('N09_delete_published_final',"DELETE FROM r5_ref_final_versions WHERE id='FA'"),
        ('N10_delete_selected_proof',"DELETE FROM client_gallery_images WHERE id='IA'"),
        ('N11_delete_published_revision',"DELETE FROM r5_ref_delivery_revisions WHERE id='DA'"),
    ]
    for name,sql in checks:check(name,sql,'FK_REJECTED')
    prep_image="INSERT INTO client_gallery_images(id,gallery_id,storage_key,original_filename,mime_type,size_bytes,position,status,created_at,updated_at) VALUES('IX','GA','private:IX','IX.jpg','image/jpeg',2,0,'ready','t','t');"
    check('N05_delivery_cross_gallery_final',"INSERT INTO r5_ref_delivery_items VALUES('GA','DA','RA','IX','FB')",'FK_REJECTED',prep_image+"INSERT INTO r5_ref_selection_items VALUES('GA','RA','IX');")
    check('N13_final_unselected_proof',"INSERT INTO r5_ref_final_versions VALUES('X','GA','RA','IX','private:X')",'FK_REJECTED',prep_image)
    check('G01_FK_only_allows_unconfirmed_final',"INSERT INTO r5_ref_final_versions VALUES('X','GA','RO','IA','private:X')",'ACCEPTED',"INSERT INTO r5_ref_selection_revisions VALUES('RO','GA','open'); INSERT INTO r5_ref_selection_items VALUES('GA','RO','IA');")
    check('G02_FK_only_allows_final_key_mutation',"UPDATE r5_ref_final_versions SET private_object_key='private:changed' WHERE id='FA'",'ACCEPTED')
    db=fresh()
    stale=db.execute("UPDATE r5_ref_workflows SET revision=revision+1 WHERE gallery_id='GA' AND revision=1").rowcount==0
    db.close()
    results.append({'id':'N12_stale_CAS','observed':'STALE' if stale else 'UNEXPECTED','expected':'STALE','matched':stale})
    db=fresh()
    db.execute('BEGIN')
    db.execute("UPDATE r5_ref_workflows SET revision=revision+1 WHERE gallery_id='GA' AND revision=0")
    try:db.execute("UPDATE r5_ref_workflows SET published_revision_id='DB' WHERE gallery_id='GA'")
    except sqlite3.IntegrityError:db.execute('ROLLBACK')
    rolled=db.execute("SELECT revision FROM r5_ref_workflows WHERE gallery_id='GA'").fetchone()[0]==0
    db.close()
    results.append({'id':'T01_rollback_cross_tenant','observed':'ROLLED_BACK' if rolled else 'PARTIAL','expected':'ROLLED_BACK','matched':rolled})
    db=fresh()
    cas=db.execute("UPDATE r5_ref_workflows SET revision=revision+1 WHERE gallery_id='GA' AND revision=0").rowcount==1
    db.close()
    results.append({'id':'T02_valid_CAS','observed':'CAS_COMMITTED' if cas else 'FAILED','expected':'CAS_COMMITTED','matched':cas})
    return {'kind':'REFERENCE_SQLITE_MODEL_NOT_0010_OR_D1','migrationGitBlob':verify_blob(ddl),'modelSHA256':hashlib.sha256(ref).hexdigest(),'sqliteVersion':sqlite3.sqlite_version,'matched':sum(x['matched'] for x in results),'total':len(results),'cases':results,'productTestsRun':0,'D1TestsRun':0}

if __name__=='__main__':
    import sys
    kwargs={'legacy':sys.argv[1], 'model':sys.argv[2]} if len(sys.argv)==3 else {}
    report=run(**kwargs)
    print(json.dumps(report,indent=2))
    sys.exit(0 if report['matched']==report['total'] else 1)
