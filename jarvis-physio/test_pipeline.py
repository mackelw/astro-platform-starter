"""End-to-end tests for the Jarvis Physio pipeline.

The point of these tests is not coverage for its own sake — it is that every
safety gate in the system stays shut. If a change lets an unapproved
assessment reach treatment planning, or lets a message draft for a patient
who never consented, these tests fail.

Run from this directory with:
    python3 -m unittest -b        # -b hides agent output unless a test fails
"""
import json
import tempfile
import unittest
from pathlib import Path

import database as db
import assessment
import planning
import education
import followup
import content
import exercise_library as lib
import knowledge_base as kb

CLEAN_INTAKE = {
    "chief_complaint": "Low back pain radiating to right leg, 3 weeks",
    "history": {
        "onset": "gradual, 3 weeks ago",
        "mechanism": "no specific injury; started after long car trip",
        "pmh": "none significant",
        "medications": "ibuprofen PRN",
        "previous_treatment": "none yet",
    },
    "posture_gait_rom": {
        "posture": "mild lumbar flexion bias standing",
        "gait": "antalgic on right",
        "rom": {"lumbar flexion": 55, "lumbar extension": 15, "right SLR": 60},
        "strength": "5/5 all groups except R ankle dorsiflexion 4/5",
        "special_tests": ["SLR positive right at 60"],
    },
}

RED_FLAG_INTAKE = {
    "chief_complaint": "Low back pain with saddle numbness since yesterday",
    "history": {"onset": "sudden", "pmh": "history of cancer"},
    "posture_gait_rom": {"strength": "leg weakness right"},
}


class PipelineTestCase(unittest.TestCase):
    """Each test runs against its own throwaway database file."""

    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self._orig_db_path = db.DB_PATH
        db.DB_PATH = Path(self._tmp.name) / "test.db"
        db.init_db()

    def tearDown(self):
        db.DB_PATH = self._orig_db_path
        self._tmp.cleanup()

    # -- helpers ---------------------------------------------------------
    def _approved_assessment(self, intake=None, consent=True, note="Cleared."):
        pid = db.create_patient("Test Patient", consent=consent)
        result = assessment.submit_assessment(pid, intake or CLEAN_INTAKE)
        db.approve_assessment(result["assessment_id"], note)
        return pid, result["assessment_id"]

    def _approved_plan(self, assessment_id):
        plan_id = planning.submit_plan(assessment_id)["plan_id"]
        db.approve_plan(plan_id, "Agreed.")
        return plan_id

    def _released_programme(self, plan_id):
        prog_id = education.submit_programme(plan_id)["programme_id"]
        db.approve_programme(prog_id, "Released.")
        return prog_id


class TestAssessmentGate(PipelineTestCase):

    def test_clean_intake_is_pending_not_approved(self):
        pid = db.create_patient("A", consent=True)
        result = assessment.submit_assessment(pid, CLEAN_INTAKE)
        stored = db.get_assessment(result["assessment_id"])
        self.assertEqual(stored["status"], "pending_review")
        self.assertEqual(stored["red_flags"], [])

    def test_red_flags_escalate_and_are_all_caught(self):
        pid = db.create_patient("B", consent=True)
        result = assessment.submit_assessment(pid, RED_FLAG_INTAKE)
        stored = db.get_assessment(result["assessment_id"])
        self.assertEqual(stored["status"], "escalated")
        found = {f["finding"] for f in stored["red_flags"]}
        self.assertIn("saddle numbness", found)
        self.assertIn("history of cancer", found)
        self.assertIn("leg weakness", found)

    def test_red_flag_screening_is_case_insensitive(self):
        pid = db.create_patient("C", consent=True)
        shouty = {"chief_complaint": "LOSS OF BLADDER CONTROL and back pain",
                  "history": {}, "posture_gait_rom": {}}
        result = assessment.submit_assessment(pid, shouty)
        self.assertTrue(db.get_assessment(result["assessment_id"])["red_flags"])


class TestPlanningGate(PipelineTestCase):

    def test_unapproved_assessment_cannot_be_planned(self):
        pid = db.create_patient("D", consent=True)
        aid = assessment.submit_assessment(pid, CLEAN_INTAKE)["assessment_id"]
        with self.assertRaises(PermissionError):
            planning.create_plan(aid)

    def test_red_flagged_assessment_needs_a_documented_note(self):
        pid = db.create_patient("E", consent=True)
        aid = assessment.submit_assessment(pid, RED_FLAG_INTAKE)["assessment_id"]
        db.approve_assessment(aid, "")           # approved, but undocumented
        with self.assertRaises(PermissionError):
            planning.create_plan(aid)
        db.approve_assessment(aid, "MRI clear, medically cleared.")
        self.assertTrue(planning.create_plan(aid)["interventions"])

    def test_plan_always_carries_evidence(self):
        _, aid = self._approved_assessment()
        plan = planning.create_plan(aid)
        self.assertTrue(plan["evidence"])
        for e in plan["evidence"]:
            self.assertIsNotNone(kb.get(e["ref"]), f"uncited ref {e['ref']}")

    def test_radicular_presentation_adds_neuro_precaution(self):
        _, aid = self._approved_assessment()
        plan = planning.create_plan(aid)
        self.assertIn("radicular", plan["condition_profile"])
        self.assertTrue(any("Neurological" in p for p in plan["precautions"]))

    def test_unclassified_condition_is_refused_not_guessed(self):
        pid = db.create_patient("Z", consent=True)
        intake = {"chief_complaint": "Sore elbow after tennis",
                  "history": {}, "posture_gait_rom": {}}
        aid = assessment.submit_assessment(pid, intake)["assessment_id"]
        db.approve_assessment(aid, "ok")
        with self.assertRaises(ValueError):
            planning.create_plan(aid)

    def test_red_flags_are_carried_into_precautions(self):
        _, aid = self._approved_assessment(RED_FLAG_INTAKE)
        plan = planning.create_plan(aid)
        self.assertTrue(any("RED FLAG" in p for p in plan["precautions"]))


class TestProgrammeGate(PipelineTestCase):

    def test_unapproved_plan_cannot_become_a_programme(self):
        _, aid = self._approved_assessment()
        plan_id = planning.submit_plan(aid)["plan_id"]
        with self.assertRaises(PermissionError):
            education.create_programme(plan_id)

    def test_neuro_precaution_adds_nerve_glider(self):
        _, aid = self._approved_assessment()
        prog = education.create_programme(self._approved_plan(aid))
        self.assertIn("nerve-glider", [i["exercise_id"] for i in prog["items"]])

    def test_flexion_precaution_reaches_the_patient_facing_notes(self):
        _, aid = self._approved_assessment()
        prog = education.create_programme(self._approved_plan(aid))
        notes = [n for item in prog["items"] for n in item["safety_notes"]]
        self.assertTrue(any("flexion" in n.lower() for n in notes))

    def test_every_prescribed_exercise_is_cited(self):
        _, aid = self._approved_assessment()
        prog = education.create_programme(self._approved_plan(aid))
        self.assertTrue(prog["items"])
        for item in prog["items"]:
            self.assertIsNotNone(kb.get(item["evidence_ref"]))

    def test_programme_starts_unreleased(self):
        _, aid = self._approved_assessment()
        plan_id = self._approved_plan(aid)
        prog_id = education.submit_programme(plan_id)["programme_id"]
        self.assertEqual(db.get_programme(prog_id)["status"], "pending_review")


class TestFollowupGates(PipelineTestCase):

    def test_no_consent_blocks_the_draft(self):
        pid = db.create_patient("F", consent=False)
        result = followup.schedule_checkin(pid, days_after=7)
        self.assertEqual(result["status"], "blocked_no_consent")
        self.assertEqual(db.blocked_followups()[0]["id"], result["followup_id"])

    def test_approval_cannot_override_missing_consent(self):
        pid = db.create_patient("G", consent=False)
        fu_id = followup.schedule_checkin(pid)["followup_id"]
        with self.assertRaises(PermissionError):
            db.approve_followup(fu_id, "send it anyway")
        self.assertEqual(db.get_followup(fu_id)["status"], "blocked_no_consent")

    def test_unreleased_programme_cannot_be_followed_up(self):
        pid, aid = self._approved_assessment()
        plan_id = self._approved_plan(aid)
        prog_id = education.submit_programme(plan_id)["programme_id"]
        with self.assertRaises(PermissionError):
            followup.schedule_checkin(pid, programme_id=prog_id)

    def test_message_carries_safety_netting_and_channel_notice(self):
        pid = db.create_patient("H", consent=True)
        message = followup.schedule_checkin(pid)["message"]
        self.assertIn("bladder", message.lower())
        self.assertIn("not monitored", message.lower())

    def test_approval_queues_but_never_sends(self):
        pid = db.create_patient("I", consent=True)
        fu_id = followup.schedule_checkin(pid)["followup_id"]
        db.approve_followup(fu_id, "ok")
        self.assertEqual(db.get_followup(fu_id)["status"], "queued")
        self.assertEqual(followup.send_queued()["sent"], 0)

    def test_concerning_reply_escalates(self):
        pid = db.create_patient("J", consent=True)
        fu_id = followup.schedule_checkin(pid)["followup_id"]
        result = db.record_reply(fu_id, "My leg is getting worse and numbness spread")
        self.assertEqual(result["status"], "escalated")
        self.assertEqual(db.get_followup(fu_id)["status"], "escalated")

    def test_benign_reply_does_not_escalate(self):
        pid = db.create_patient("K", consent=True)
        fu_id = followup.schedule_checkin(pid)["followup_id"]
        self.assertEqual(
            db.record_reply(fu_id, "All good thanks, exercises are going well")["status"],
            "received",
        )

    def test_outcome_results_start_empty_and_accumulate(self):
        pid = db.create_patient("L", consent=True)
        fu_id = followup.schedule_checkin(pid)["followup_id"]
        self.assertEqual(db.get_followup(fu_id)["outcome_measures"], [])
        db.record_outcome(fu_id, {"NPRS": 5})
        db.record_outcome(fu_id, {"NPRS": 3})
        self.assertEqual(len(db.get_followup(fu_id)["outcome_measures"]), 2)

    def test_outcome_rejects_a_non_mapping(self):
        pid = db.create_patient("M", consent=True)
        fu_id = followup.schedule_checkin(pid)["followup_id"]
        with self.assertRaises(ValueError):
            db.record_outcome(fu_id, [1, 2])


class TestContentGates(PipelineTestCase):

    def test_draft_is_never_published(self):
        post_id = content.submit_post("back pain")["post_id"]
        self.assertEqual(db.get_post(post_id)["status"], "pending_review")

    def test_known_topic_carries_citations(self):
        draft = content.draft_post("back pain")
        self.assertTrue(draft["claims"])
        self.assertIn("Sources:", draft["body"])
        for c in draft["claims"]:
            self.assertIsNotNone(kb.get(c["ref"]))

    def test_unknown_topic_produces_no_claims_and_is_flagged(self):
        draft = content.draft_post("cupping for weight loss")
        self.assertEqual(draft["claims"], [])
        self.assertTrue(draft["_uncited_warning"])
        self.assertNotIn("Sources:", draft["body"])

    def test_body_only_contains_knowledge_base_language(self):
        draft = content.draft_post("back pain")
        for c in draft["claims"][:2]:
            self.assertIn(c["plain"], draft["body"])


class TestLibraryIntegrity(PipelineTestCase):

    def test_every_exercise_validates(self):
        self.assertEqual(lib.validate(), [])

    def test_unknown_exercise_raises(self):
        with self.assertRaises(KeyError):
            lib.get_exercise("does-not-exist")

    def test_get_exercise_returns_a_copy(self):
        first = lib.get_exercise("bird-dog")
        first["cues"].append("MUTATED")
        self.assertNotIn("MUTATED", lib.get_exercise("bird-dog")["cues"])


class TestAuditTrail(PipelineTestCase):

    def test_full_pipeline_is_logged(self):
        pid, aid = self._approved_assessment()
        plan_id = self._approved_plan(aid)
        self._released_programme(plan_id)
        conn = db.get_conn()
        actions = {r["action"] for r in conn.execute("SELECT action FROM audit_log")}
        conn.close()
        for expected in ("create_patient", "save_assessment", "save_treatment_plan",
                         "save_programme", "approve_plan", "release_programme"):
            self.assertIn(expected, actions)

    def test_json_columns_round_trip(self):
        _, aid = self._approved_assessment()
        stored = db.get_assessment(aid)
        self.assertEqual(stored["posture_gait_rom"]["rom"]["lumbar flexion"], 55)
        self.assertIsInstance(stored["history"], dict)


if __name__ == "__main__":
    unittest.main(verbosity=2)
