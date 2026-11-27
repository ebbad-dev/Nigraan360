import unittest
from datetime import datetime, timedelta, timezone

from services import assessment as rules
from services.exam_service import EXAM_STATUS_TRANSITIONS


def mcq(marks=2):
    return {
        "question_id": "q1",
        "question_type": "mcq",
        "marks": marks,
        "options": [
            {"option_id": "a", "is_correct": False},
            {"option_id": "b", "is_correct": True},
            {"option_id": "c", "is_correct": False},
        ],
    }


def multi(scheme="all_or_nothing", marks=4):
    return {
        "question_id": "q2",
        "question_type": "multiple_select",
        "marks": marks,
        "marking_scheme": scheme,
        "options": [
            {"option_id": "p2", "is_correct": True},
            {"option_id": "p4", "is_correct": False},
            {"option_id": "p5", "is_correct": True},
            {"option_id": "p9", "is_correct": False},
        ],
    }


class GradingRuleTests(unittest.TestCase):
    def test_single_answer_mcq_full_or_zero(self):
        self.assertEqual(rules.grade_answer(mcq(), {"selected_option_id": "b"})["awarded_marks"], 2)
        self.assertEqual(rules.grade_answer(mcq(), {"selected_option_id": "a"})["awarded_marks"], 0)
        self.assertEqual(rules.grade_answer(mcq(), {"selected_option_id": ""})["awarded_marks"], 0)

    def test_multiple_select_all_or_nothing_requires_exact_set(self):
        q = multi()
        self.assertEqual(rules.grade_answer(q, {"selected_option_ids": ["p2", "p5"]})["awarded_marks"], 4)
        self.assertEqual(rules.grade_answer(q, {"selected_option_ids": ["p2"]})["awarded_marks"], 0)
        self.assertEqual(rules.grade_answer(q, {"selected_option_ids": ["p2", "p5", "p4"]})["awarded_marks"], 0)

    def test_multiple_select_partial_subtracts_wrong_choices_and_never_goes_negative(self):
        q = multi("partial")
        self.assertEqual(rules.grade_answer(q, {"selected_option_ids": ["p2", "p5"]})["awarded_marks"], 4)
        self.assertEqual(rules.grade_answer(q, {"selected_option_ids": ["p2"]})["awarded_marks"], 2)
        self.assertEqual(rules.grade_answer(q, {"selected_option_ids": ["p2", "p5", "p4"]})["awarded_marks"], 2)
        self.assertEqual(rules.grade_answer(q, {"selected_option_ids": ["p4", "p9"]})["awarded_marks"], 0)

    def test_written_answers_wait_for_manual_grading(self):
        q = {"question_id": "q3", "question_type": "written", "marks": 5, "options": []}
        self.assertEqual(rules.grade_answer(q, {"response_text": "An answer"})["grading_status"], rules.GRADE_PENDING)
        blank = rules.grade_answer(q, {"response_text": "   "})
        self.assertEqual((blank["grading_status"], blank["awarded_marks"]), (rules.GRADE_AUTO, 0))


class ValidationTests(unittest.TestCase):
    def test_mcq_needs_exactly_one_correct_option(self):
        with self.assertRaises(rules.AssessmentError):
            rules.validate_question({"question_text": "Pick", "question_type": "mcq", "marks": 1,
                                     "options": [{"option_text": "a", "is_correct": True}, {"option_text": "b", "is_correct": True}]})

    def test_multiple_select_scheme_is_restricted(self):
        with self.assertRaises(rules.AssessmentError):
            rules.validate_question({"question_text": "Pick", "question_type": "multiple_select", "marks": 1, "marking_scheme": "generous",
                                     "options": [{"option_text": "a", "is_correct": True}, {"option_text": "b"}]})

    def test_answers_must_reference_the_question_options(self):
        with self.assertRaises(rules.AssessmentError):
            rules.normalize_answer(mcq(), selected_option_id="zzz")
        with self.assertRaises(rules.AssessmentError):
            rules.normalize_answer(multi(), selected_option_ids=["p2", "nope"])


class SnapshotTests(unittest.TestCase):
    def questions(self):
        return [
            {"question_id": f"q{i}", "question_text": f"Q{i}", "question_type": "mcq", "marks": 1,
             "options": [{"option_id": f"q{i}a", "option_text": "A", "is_correct": True, "sort_order": 0},
                         {"option_id": f"q{i}b", "option_text": "B", "is_correct": False, "sort_order": 1}]}
            for i in range(6)
        ]

    def test_shuffle_is_stable_per_attempt_seed(self):
        one = rules.build_snapshot(self.questions(), shuffle_questions=True, shuffle_options=True, seed="atm_1")
        again = rules.build_snapshot(self.questions(), shuffle_questions=True, shuffle_options=True, seed="atm_1")
        self.assertEqual(one, again)

    def test_snapshot_is_independent_of_later_bank_edits(self):
        source = self.questions()
        snapshot = rules.build_snapshot(source, seed="atm_2")
        source[0]["question_text"] = "Edited after the attempt started"
        source[0]["options"][0]["is_correct"] = False
        frozen = rules.snapshot_question(snapshot, "q0")
        self.assertEqual(frozen["question_text"], "Q0")
        self.assertTrue(frozen["options"][0]["is_correct"])

    def test_candidate_projection_strips_answer_keys(self):
        snapshot = rules.build_snapshot(self.questions(), seed="atm_3")
        for question in rules.candidate_questions(snapshot):
            self.assertNotIn("marking_scheme", question)
            for option in question["options"]:
                self.assertNotIn("is_correct", option)


class DeadlineAndLifecycleTests(unittest.TestCase):
    def test_deadline_is_start_plus_duration_capped_by_window(self):
        start = datetime(2026, 11, 27, 10, 0, tzinfo=timezone.utc)
        self.assertEqual(rules.compute_deadline(start, 60), start + timedelta(minutes=60))
        self.assertEqual(rules.compute_deadline(start, 60, start + timedelta(minutes=20)), start + timedelta(minutes=20))

    def test_stored_deadline_wins_over_recomputation(self):
        stored = datetime(2026, 11, 27, 10, 30, tzinfo=timezone.utc)
        attempt = {"deadline_at": stored, "started_at": datetime(2026, 11, 27, 10, 0, tzinfo=timezone.utc), "duration_minutes": 120}
        self.assertEqual(rules.attempt_deadline(attempt), stored)

    def test_status_transitions_block_resurrecting_archived_or_closed_exams(self):
        self.assertNotIn("published", EXAM_STATUS_TRANSITIONS["archived"])
        self.assertNotIn("published", EXAM_STATUS_TRANSITIONS["closed"])
        self.assertNotIn("archived", EXAM_STATUS_TRANSITIONS["published"])
        self.assertIn("published", EXAM_STATUS_TRANSITIONS["draft"])


class AnalyticsTests(unittest.TestCase):
    def test_question_analytics_counts_skips_and_wrong_options(self):
        q = mcq()
        attempts = [
            {"responses": {"q1": {"selected_option_id": "b", "awarded_marks": 2}}},
            {"responses": {"q1": {"selected_option_id": "a", "awarded_marks": 0}}},
            {"responses": {}},
        ]
        row = rules.question_analytics([q], attempts)[0]
        self.assertEqual((row["skipped"], row["incorrect"], row["full_marks"]), (1, 1, 1))
        self.assertEqual(row["common_wrong_options"][0]["option_id"], "a")


if __name__ == "__main__":
    unittest.main()
