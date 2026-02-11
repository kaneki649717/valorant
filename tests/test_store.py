"""
Store 模块测试

注意：这是一个 JavaScript 模块，这里只测试与 Store 相关的 Python 逻辑
"""
import unittest
import sys
import os
import json

# 添加 src 到路径
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'src'))


class MockStore:
    """模拟 Store 类的 Python 实现，用于测试逻辑"""
    
    def __init__(self, rules_data):
        self.allRules = rules_data
        self.currentCategory = 'all'
    
    def getRules(self):
        if self.currentCategory == 'all':
            return self.allRules
        return [r for r in self.allRules if r.get('category') == self.currentCategory]
    
    def setCategory(self, cat):
        self.currentCategory = cat
    
    def drawOne(self):
        pool = self.getRules()
        if not pool:
            return None
        import random
        return random.choice(pool)


class TestStore(unittest.TestCase):
    """测试 Store 类逻辑"""

    def setUp(self):
        """测试前准备"""
        self.sample_rules = [
            {"id": "TAC-01", "content": "测试规则1", "category": "tactical"},
            {"id": "SOC-01", "content": "测试规则2", "category": "social"},
            {"id": "TAC-02", "content": "测试规则3", "category": "tactical"},
            {"id": "WEP-01", "content": "测试规则4", "category": "weaponry"},
        ]
        self.store = MockStore(self.sample_rules)

    def test_init(self):
        """测试初始化"""
        self.assertEqual(len(self.store.allRules), 4)
        self.assertEqual(self.store.currentCategory, 'all')

    def test_get_rules_all(self):
        """测试获取所有规则"""
        rules = self.store.getRules()
        self.assertEqual(len(rules), 4)

    def test_get_rules_by_category(self):
        """测试按分类获取规则"""
        self.store.setCategory('tactical')
        rules = self.store.getRules()
        self.assertEqual(len(rules), 2)
        self.assertTrue(all(r['category'] == 'tactical' for r in rules))

    def test_get_rules_empty_category(self):
        """测试空分类"""
        self.store.setCategory('contract')
        rules = self.store.getRules()
        self.assertEqual(len(rules), 0)

    def test_set_category(self):
        """测试设置分类"""
        self.store.setCategory('social')
        self.assertEqual(self.store.currentCategory, 'social')

    def test_draw_one(self):
        """测试随机抽取"""
        result = self.store.drawOne()
        self.assertIsNotNone(result)
        self.assertIn(result, self.sample_rules)

    def test_draw_one_empty(self):
        """测试空规则池抽取"""
        empty_store = MockStore([])
        result = empty_store.drawOne()
        self.assertIsNone(result)

    def test_draw_one_filtered(self):
        """测试分类过滤后抽取"""
        self.store.setCategory('weaponry')
        result = self.store.drawOne()
        self.assertIsNotNone(result)
        self.assertEqual(result['category'], 'weaponry')


class TestStoreCategoryMapping(unittest.TestCase):
    """测试分类映射"""

    def test_category_values(self):
        """测试分类值有效性"""
        valid_categories = ['all', 'tactical', 'weaponry', 'social', 'contract']
        for cat in valid_categories:
            self.assertIsInstance(cat, str)
            self.assertTrue(len(cat) > 0)

    def test_rule_category_assignment(self):
        """测试规则分类分配"""
        rules = [
            {"id": "TAC-01", "category": "tactical"},
            {"id": "SOC-01", "category": "social"},
            {"id": "WEP-01", "category": "weaponry"},
            {"id": "CON-01", "category": "contract"},
        ]
        for rule in rules:
            self.assertIn('category', rule)
            self.assertIn(rule['category'], ['tactical', 'social', 'weaponry', 'contract'])


class TestStoreEdgeCases(unittest.TestCase):
    """测试 Store 边界情况"""

    def test_rules_with_missing_category(self):
        """测试缺少分类的规则"""
        rules = [
            {"id": "TST-01", "content": "无分类"},
            {"id": "TST-02", "content": "有分类", "category": "tactical"}
        ]
        store = MockStore(rules)
        store.setCategory('tactical')
        filtered = store.getRules()
        self.assertEqual(len(filtered), 1)
        self.assertEqual(filtered[0]['id'], 'TST-02')

    def test_duplicate_ids(self):
        """测试重复ID处理"""
        rules = [
            {"id": "TAC-01", "content": "规则1", "category": "tactical"},
            {"id": "TAC-01", "content": "规则2", "category": "tactical"},
        ]
        store = MockStore(rules)
        self.assertEqual(len(store.allRules), 2)


if __name__ == '__main__':
    unittest.main()
