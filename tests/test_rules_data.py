"""
Rules data regression tests.
"""
import json
import os
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'src'))

from validate_data import validate_rules_data


RULES_PATH = os.path.join(
    os.path.dirname(__file__),
    '..',
    'assets',
    'data',
    'rules.json',
)


class TestRulesData(unittest.TestCase):
    def setUp(self):
        with open(RULES_PATH, 'r', encoding='utf-8') as f:
            self.rules = json.load(f)
        self.by_id = {rule['id']: rule for rule in self.rules}

    def test_rules_file_is_valid(self):
        is_valid, errors, _warnings = validate_rules_data(self.rules)
        self.assertTrue(is_valid, errors)

    def test_new_punishments_are_present(self):
        expected_ids = {'CON-05', 'SOC-10', 'CON-06', 'SOC-11', 'TAC-12'}
        self.assertTrue(expected_ids.issubset(self.by_id.keys()))
        self.assertEqual(len(self.rules), 38)

    def test_baby_contract_is_replaced(self):
        content = self.by_id['CON-01']['content']
        self.assertIn('指定单回合己方第一名为宝宝', content)
        self.assertIn('宝宝救我', content)
        self.assertNotIn('指定/或选择对局中队内的实时第一名', content)


if __name__ == '__main__':
    unittest.main()
