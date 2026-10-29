#!/usr/bin/env python3
"""Pin the exact R4 migration and test retention/transaction invariants in SQLite memory.

This deliberately does not access the application, live D1, R2 or real clients.
"""
import hashlib, json, pathlib, sqlite3, sys

EXPECTED_BLOB='5281fc9b99ed85bf6e7751ad7eb11f8b5482df23'
path=pathlib.Path(sys.argv[1]) if len(sys.argv)>1 else pathlib.Path(__file__).resolve().parents[3]/'migrations/0009_private_client_galleries.sql'
raw=path.read_bytes().replace(b'\r\n', b'\n')
blob=hashlib.sha1(b'blob '+str(len(raw)).encode()+b'\0'+raw).hexdigest()
if blob!=EXPECTED_BLOB: raise SystemExit(f'MIGRATION_BLOB_MISMATCH {blob}')

def init():
    db=sqlite3.connect(':memory:',isolation_level=None)
    db.execute('PRAGMA foreign_keys=ON')
    db.executescript(raw.decode())
    for c in ('A','B'):
        db.execute("INSERT INTO client_accounts(id,name,email,password_hash,password_salt,password_iterations,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?)", (c,c,c.lower()+'@example.invalid','fake','fake',310000,'t','t'))
        db.execute("INSERT INTO client_galleries(id,client_id,title,created_at,updated_at) VALUES (?,?,?,?,?)",('G'+c,c,'synthetic','t','t'))
        for im in ['I'+c,'C'+c]:
            db.execute('INSERT INTO client_gallery_images(id,gallery_id,storage_key,original_filename,mime_type,size_bytes,position,status,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)', (im,'G'+c,'synthetic-'+im,im+'.jpg','image/jpeg',2,0,'ready','t','t'))
    return db

def run(label, function, expected):
    db=init()
    try:
        result=function(db)
    except sqlite3.IntegrityError as e:
        result='FK_REJECTED:'+str(e)
    except Exception as e:
        result='ERROR:'+str(e)
    fk=db.execute('PRAGMA foreign_key_check').fetchall()
    matched= result==expected and fk==[]
    outcomes.append({'id':label,'result':result,'expected':expected,'matched':matched,'foreignKeyCheckRows':len(fk)})
    db.close()

outcomes=[]
def a_delete_account(db):
    db.execute('DELETE FROM client_accounts WHERE id=?',('A',));return 'DELETED'
run('R01_delete_account_with_gallery',a_delete_account,'FK_REJECTED:FOREIGN KEY constraint failed')

def a_delete_gallery(db):
    db.execute('DELETE FROM client_galleries WHERE id=?',('GA',));return 'DELETED'
run('R02_delete_gallery_with_images',a_delete_gallery,'FK_REJECTED:FOREIGN KEY constraint failed')

def a_delete_own_favorite_photo(db):
    db.execute("INSERT INTO client_gallery_favorites VALUES('A','GA','IA','t')")
    db.execute("DELETE FROM client_gallery_images WHERE id='IA'");return 'DELETED'
run('R03_delete_image_with_favorite',a_delete_own_favorite_photo,'FK_REJECTED:FOREIGN KEY constraint failed')

def delete_cover_only_image(db):
    db.execute("UPDATE client_galleries SET cover_image_id='CA' WHERE id='GA'")
    db.execute("DELETE FROM client_gallery_images WHERE id='CA'")
    cover=db.execute("SELECT cover_image_id FROM client_galleries WHERE id='GA'").fetchone()[0]
    exists=db.execute("SELECT COUNT(*) FROM client_gallery_images WHERE id='CA'").fetchone()[0]
    return f'ORPHAN_COVER={cover},IMAGE_COUNT={exists}'
run('R04_cover_image_hard_delete_orphan',delete_cover_only_image,'ORPHAN_COVER=CA,IMAGE_COUNT=0')

def soft_delete_cover(db):
    db.execute("UPDATE client_galleries SET cover_image_id='IA',status='published' WHERE id='GA'")
    db.execute("UPDATE client_gallery_images SET deleted_at='t' WHERE id='IA'")
    return str(db.execute("SELECT g.status, g.cover_image_id,i.deleted_at FROM client_galleries g JOIN client_gallery_images i ON i.id=g.cover_image_id WHERE g.id='GA'").fetchone())
run('R05_cover_soft_delete_keeps_published',soft_delete_cover,"('published', 'IA', 't')")

def update_cover_cross_gallery(db):
    db.execute("UPDATE client_galleries SET cover_image_id='IB' WHERE id='GA'")
    return db.execute("SELECT cover_image_id FROM client_galleries WHERE id='GA'").fetchone()[0]
run('R06_direct_cover_rebind_cross_gallery',update_cover_cross_gallery,'IB')

def update_image_gallery_when_cover_only(db):
    db.execute("UPDATE client_galleries SET cover_image_id='IA' WHERE id='GA'")
    db.execute("UPDATE client_gallery_images SET gallery_id='GB' WHERE id='IA'")
    return db.execute("SELECT gallery_id FROM client_gallery_images WHERE id='IA'").fetchone()[0]
run('R07_reparent_cover_image_no_fk',update_image_gallery_when_cover_only,'GB')

def update_image_gallery_when_favorite(db):
    db.execute("INSERT INTO client_gallery_favorites VALUES('A','GA','IA','t')")
    db.execute("UPDATE client_gallery_images SET gallery_id='GB' WHERE id='IA'")
    return 'UPDATED'
run('R08_reparent_favorited_image_fk_denied',update_image_gallery_when_favorite,'FK_REJECTED:FOREIGN KEY constraint failed')

def demonstrate_transaction_rollback(db):
    db.execute('BEGIN')
    db.execute("UPDATE client_galleries SET cover_image_id='IB' WHERE id='GA'")
    try:
        db.execute("INSERT INTO client_gallery_favorites VALUES('A','GA','IB','t')")
        db.execute('COMMIT')
    except sqlite3.IntegrityError:
        db.execute('ROLLBACK')
    cover=db.execute("SELECT cover_image_id FROM client_galleries WHERE id='GA'").fetchone()[0]
    return f'COVER_AFTER_ROLLBACK={cover}'
run('R09_explicit_transaction_rollback_restores_cover',demonstrate_transaction_rollback,'COVER_AFTER_ROLLBACK=None')

def demonstrate_successful_dirty_record(db):
    db.execute('BEGIN')
    db.execute("UPDATE client_galleries SET cover_image_id='IB' WHERE id='GA'")
    db.execute("INSERT INTO client_gallery_favorites VALUES('B','GA','IA','t')")
    db.execute('COMMIT')
    return f'B_FAVORITES_A={db.execute("SELECT COUNT(*) FROM client_gallery_favorites WHERE client_id=\'B\' AND gallery_id=\'GA\'").fetchone()[0]}'
run('R10_invalid_but_fk_consistent_transaction_can_commit',demonstrate_successful_dirty_record,'B_FAVORITES_A=1')

schema=init()
foreign_keys={table:[list(row) for row in schema.execute(f'PRAGMA foreign_key_list("{table}")')] for table in ('client_galleries','client_gallery_images','client_gallery_upload_intents','client_gallery_favorites')}
schema.close()
report={'kind':'PINNED_LEGACY_0009_SQLITE_LIFECYCLE_REPRO_NOT_D1','sourceGitBlobSha':blob,'sourceSha256':hashlib.sha256(raw).hexdigest(),'sqliteVersion':sqlite3.sqlite_version,'cases':outcomes,'matched':sum(o['matched'] for o in outcomes),'total':len(outcomes),'foreignKeyList':foreign_keys,'overall':'EXPECTED_LEGACY_SCHEMA_PROPERTIES_REPRODUCED' if all(o['matched'] for o in outcomes) else 'UNEXPECTED','appTestsRun':0,'productionTouched':False}
print(json.dumps(report,ensure_ascii=False,indent=2))
raise SystemExit(0 if report['overall']=='EXPECTED_LEGACY_SCHEMA_PROPERTIES_REPRODUCED' else 1)
