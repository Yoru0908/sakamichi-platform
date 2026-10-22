#!/usr/bin/env python3
import copy
import unittest
import apply_hinata_review as m
from test_promote_shimizu_hinata import candidate


def fc(rows):
    return {"type": "FeatureCollection", "features": rows}


class ReviewTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        anchors = [candidate(f"anchor{i}", name=f"anchor{i}", note=f"anchor{i}",
                             coordinates=(130+i/100000,30)) for i in range(3500)]
        old = candidate("old", name="split", note="work1 work2")
        held = candidate("held", name="river", note="held", coordinates=(139,34))
        a = candidate("new1", name="split", note="work1", coordinates=(139.0001,35))
        b = candidate("new2", name="split", note="work2", coordinates=(139.0002,35))
        new = candidate("addition", name="port", note="work1", coordinates=(138,33))
        moved = candidate("held-moved", name="river", note="held", coordinates=(139,34.04))
        cls.current = fc(anchors+[old,held])
        cls.source = fc(anchors+[a,b,new,moved])
        cls.manifest = {"schemaVersion":1,"mapId":m.MAP_ID,"reviewId":"test-only",
                        "candidateSnapshotFingerprint":m.fingerprint(cls.source),"operations":[],
                        "holdFeatures":[{"sourceKey":m.key(held),"fingerprint":m.fingerprint(held),
                                         "candidateSourceKey":m.key(moved)}]}
        for prior, following in [(old,[a,b]),(None,[new])]:
            op={"oldSourceKey":m.key(prior) if prior else None,
                "oldFingerprint":m.fingerprint(prior) if prior else None,"newFeatures":[]}
            for i,row in enumerate(following):
                p=prior if i==0 else None
                output,_=m.normalise_candidate(copy.deepcopy(row),p)
                if p:output['properties']['id']=p['properties']['id']
                op['newFeatures'].append({'sourceKey':m.key(row),'sourceFingerprint':m.fingerprint(row),
                                          'outputFingerprint':m.fingerprint(output)})
            cls.manifest['operations'].append(op)

    def test_split_addition_hold_ids_and_idempotence(self):
        result,report=m.reconcile(self.current,self.source,self.manifest)
        self.assertEqual(3504,len(result['features']))
        rows=m.indexed(result['features']); old=m.indexed(self.current['features'])
        prefix=m.KEY_PREFIX
        self.assertEqual(old[prefix+'held'],rows[prefix+'held'])
        self.assertEqual(prefix+'old',rows[prefix+'new1']['properties']['id'])
        self.assertEqual(prefix+'new2',rows[prefix+'new2']['properties']['id'])
        self.assertFalse(report['independentLocationVerified'])
        again,rr=m.reconcile(result,self.source,self.manifest)
        self.assertEqual(result,again);self.assertEqual('already-applied',rr['status'])

    def test_changed_source_snapshot_rejected(self):
        source=copy.deepcopy(self.source);source['features'][-2]['properties']['sceneNote']='edited'
        with self.assertRaisesRegex(ValueError,'snapshot fingerprint'):
            m.reconcile(self.current,source,self.manifest)

    def test_old_feature_changed_rejected(self):
        current=copy.deepcopy(self.current);current['features'][-2]['properties']['sceneNote']='edited'
        with self.assertRaisesRegex(ValueError,'old feature fingerprint'):
            m.reconcile(current,self.source,self.manifest)

    def test_partial_application_rejected(self):
        current=copy.deepcopy(self.current);current['features'].append(copy.deepcopy(self.source['features'][-2]))
        with self.assertRaisesRegex(ValueError,'partial application'):
            m.reconcile(current,self.source,self.manifest)

    def test_held_geometry_cannot_change(self):
        current=copy.deepcopy(self.current);current['features'][-1]['geometry']['coordinates']=[139,34.04]
        with self.assertRaisesRegex(ValueError,'held feature'):
            m.reconcile(current,self.source,self.manifest)

    def test_later_independent_current_additions_are_preserved(self):
        current=copy.deepcopy(self.current);extra=candidate('later',name='later',note='later',coordinates=(136,32))
        current['features'].append(extra)
        result,_=m.reconcile(current,self.source,self.manifest)
        self.assertIn(extra,result['features']);self.assertEqual(3505,len(result['features']))

    def test_duplicate_public_id_rejected(self):
        current=copy.deepcopy(self.current);current['features'][-1]['properties']['id']=current['features'][-2]['properties']['id']
        with self.assertRaisesRegex(ValueError,'duplicate'):
            m.reconcile(current,self.source,self.manifest)


if __name__=='__main__':
    unittest.main()
