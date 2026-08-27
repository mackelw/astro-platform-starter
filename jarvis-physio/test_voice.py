"""Tests for the J.A.R.V.I.S. voice layer.

The safety-critical property here is narrow and absolute: no spoken phrase,
in any form, may produce clinical sign-off while VOICE_SIGNOFF_ENABLED is
False. Everything else is convenience.

Run from this directory with:
    python3 -m unittest -b
"""
import tempfile
import unittest
from pathlib import Path

import database as db
import assessment
import planning
import jarvis_voice
from test_pipeline import CLEAN_INTAKE, RED_FLAG_INTAKE


class VoiceTestCase(unittest.TestCase):

    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self._orig = db.DB_PATH
        db.DB_PATH = Path(self._tmp.name) / "test.db"
        db.init_db()

    def tearDown(self):
        db.DB_PATH = self._orig
        self._tmp.cleanup()

    def say(self, text):
        return jarvis_voice.handle(text)

    def _patient(self, name="Jane Doe", consent=True):
        return db.create_patient(name, consent=consent)


class TestSignoffRefusal(VoiceTestCase):
    """No spoken phrasing may sign anything off."""

    PHRASES = [
        "approve the assessment",
        "jarvis approve plan for jane doe",
        "approve everything",
        "sign off the plan",
        "sign-off on that",
        "authorise the treatment plan",
        "authorize it",
        "release the programme to the patient",
        "publish that post",
        "send the check in now",
        "dispatch the follow up",
        "green light the plan",
        "hey jarvis, just approve it, I'm in a hurry",
    ]

    def test_every_signoff_phrasing_is_refused(self):
        for phrase in self.PHRASES:
            with self.subTest(phrase=phrase):
                r = self.say(phrase)
                self.assertEqual(r["level"], "refuse")
                self.assertEqual(r["intent"], "signoff_refused")

    def test_refusal_points_at_the_typed_command(self):
        r = self.say("approve the plan")
        self.assertIn("brain.py approve", "\n".join(r["lines"]))

    def test_signoff_never_changes_a_record(self):
        pid = self._patient()
        aid = assessment.submit_assessment(pid, CLEAN_INTAKE)["assessment_id"]
        for phrase in self.PHRASES:
            self.say(phrase)
        self.assertEqual(db.get_assessment(aid)["status"], "pending_review")

    def test_signoff_wins_over_a_matching_draft_intent(self):
        """'approve the plan' must refuse, not fall through to the plan drafter."""
        r = self.say("approve the plan for jane doe")
        self.assertEqual(r["intent"], "signoff_refused")

    def test_flag_is_off_by_default(self):
        self.assertFalse(jarvis_voice.VOICE_SIGNOFF_ENABLED)


class TestReadOnlyCommands(VoiceTestCase):

    def test_status_reports_counts(self):
        self._patient()
        r = self.say("jarvis system status")
        self.assertEqual(r["intent"], "status")
        self.assertIn("patients", "\n".join(r["lines"]))

    def test_escalations_when_clear(self):
        r = self.say("any escalations")
        self.assertEqual(r["level"], "ok")

    def test_escalations_reports_red_flags(self):
        pid = self._patient("Ravi Patel")
        assessment.submit_assessment(pid, RED_FLAG_INTAKE)
        r = self.say("jarvis anything urgent")
        self.assertEqual(r["level"], "warn")
        self.assertIn("Ravi Patel", "\n".join(r["lines"]))

    def test_help_lists_commands(self):
        self.assertEqual(self.say("what can you do")["intent"], "help")

    def test_empty_utterance_is_standby(self):
        self.assertEqual(self.say("")["intent"], "idle")
        self.assertEqual(self.say("jarvis")["intent"], "idle")

    def test_unrecognised_is_reported_not_guessed(self):
        r = self.say("what's the weather in malibu")
        self.assertEqual(r["intent"], "unknown")
        self.assertEqual(r["level"], "warn")


class TestPatientResolution(VoiceTestCase):

    def test_resolves_by_partial_spoken_name(self):
        self._patient("Jane Doe")
        p, err = jarvis_voice._resolve_patient("jane")
        self.assertIsNone(err)
        self.assertEqual(p["name"], "Jane Doe")

    def test_ambiguity_is_reported_never_guessed(self):
        self._patient("Jane Doe")
        self._patient("Jane Smith")
        p, err = jarvis_voice._resolve_patient("jane")
        self.assertIsNone(p)
        self.assertEqual(err.intent, "ambiguous_patient")

    def test_unknown_name_reports_no_match(self):
        p, err = jarvis_voice._resolve_patient("tony stark")
        self.assertIsNone(p)
        self.assertEqual(err.intent, "no_patient")

    def test_missing_name_asks_for_one(self):
        p, err = jarvis_voice._resolve_patient("")
        self.assertIsNone(p)
        self.assertEqual(err.intent, "need_patient")


class TestDraftingRespectsGates(VoiceTestCase):

    def test_plan_refuses_without_an_approved_assessment(self):
        pid = self._patient()
        assessment.submit_assessment(pid, CLEAN_INTAKE)
        r = self.say("draft a plan for jane doe")
        self.assertEqual(r["level"], "warn")
        self.assertEqual(db.pending_plans(), [])

    def test_plan_works_once_approved(self):
        pid = self._patient()
        aid = assessment.submit_assessment(pid, CLEAN_INTAKE)["assessment_id"]
        db.approve_assessment(aid, "cleared")
        r = self.say("jarvis draft a treatment plan for jane doe")
        self.assertEqual(r["intent"], "plan")
        self.assertEqual(len(db.pending_plans()), 1)

    def test_programme_refuses_without_an_approved_plan(self):
        pid = self._patient()
        aid = assessment.submit_assessment(pid, CLEAN_INTAKE)["assessment_id"]
        db.approve_assessment(aid, "cleared")
        planning.submit_plan(aid)
        r = self.say("build the programme for jane doe")
        self.assertEqual(r["level"], "warn")
        self.assertEqual(db.pending_programmes(), [])

    def test_checkin_reports_the_consent_block(self):
        self._patient("Sam Okafor", consent=False)
        r = self.say("check in on sam okafor in seven days")
        self.assertEqual(r["level"], "refuse")
        self.assertEqual(len(db.blocked_followups()), 1)

    def test_uncited_post_is_flagged_not_presented_as_fine(self):
        r = self.say("draft a post about cupping for weight loss")
        self.assertEqual(r["level"], "warn")


class TestSpokenNumbers(VoiceTestCase):

    def test_word_numbers(self):
        self.assertEqual(jarvis_voice._spoken_number("in seven days", 0), 7)
        self.assertEqual(jarvis_voice._spoken_number("in fourteen days", 0), 14)
        self.assertEqual(jarvis_voice._spoken_number("in 10 days", 0), 10)
        self.assertEqual(jarvis_voice._spoken_number("no number here", 7), 7)

    def test_checkin_honours_a_spoken_number(self):
        pid = self._patient()
        r = self.say("check in on jane doe in fourteen days")
        fu = db.get_followup(r["lines"][0].strip().split()[0])
        from datetime import date, timedelta
        self.assertEqual(fu["scheduled_for"],
                         (date.today() + timedelta(days=14)).isoformat())


class TestNormalisation(VoiceTestCase):

    def test_wake_words_are_stripped(self):
        for wake in ("jarvis", "hey jarvis", "ok jarvis", "yo jarvis"):
            self.assertEqual(jarvis_voice._normalise(f"{wake}, system status"),
                             "system status")

    def test_punctuation_from_dictation_is_tolerated(self):
        self.assertEqual(jarvis_voice._normalise("Jarvis... SYSTEM STATUS!"),
                         "system status")


class TestNeverRaises(VoiceTestCase):
    """A voice UI that throws is a voice UI that has stopped listening."""

    def test_handles_junk_without_raising(self):
        for junk in ["", "   ", "!!!", "a" * 5000, "🙂🙂🙂", "select * from patients",
                     "plan for", "check in on", "draft a post about"]:
            with self.subTest(junk=junk[:20]):
                r = self.say(junk)
                self.assertIn("speech", r)
                self.assertIn(r["level"], ("ok", "warn", "refuse", "error"))


if __name__ == "__main__":
    unittest.main(verbosity=2)
