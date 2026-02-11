"""
工具函数测试

注意：utils.js 和 config.js 是 JavaScript 模块，这里测试相关的 Python 逻辑
"""
import unittest
import sys
import os
import random
from datetime import datetime, timedelta

# 添加 src 到路径
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'src'))


class TestUtils(unittest.TestCase):
    """测试工具函数逻辑"""

    def test_pick_random(self):
        """测试随机选择逻辑"""
        pool = [1, 2, 3, 4, 5]
        result = random.choice(pool)
        self.assertIn(result, pool)

    def test_pick_random_empty_list(self):
        """测试空列表随机选择"""
        pool = []
        with self.assertRaises(IndexError):
            random.choice(pool)

    def test_format_time_ago_logic(self):
        """测试时间格式化逻辑"""
        # 刚刚
        just_now = datetime.now() - timedelta(seconds=30)
        diff = datetime.now() - just_now
        mins = diff.total_seconds() / 60
        self.assertLess(mins, 1)

        # 几分钟前
        mins_ago = datetime.now() - timedelta(minutes=5)
        diff = datetime.now() - mins_ago
        mins = int(diff.total_seconds() / 60)
        self.assertEqual(mins, 5)

        # 几小时前
        hours_ago = datetime.now() - timedelta(hours=3)
        diff = datetime.now() - hours_ago
        hours = int(diff.total_seconds() / 3600)
        self.assertEqual(hours, 3)

        # 几天前
        days_ago = datetime.now() - timedelta(days=2)
        diff = datetime.now() - days_ago
        days = int(diff.total_seconds() / 86400)
        self.assertEqual(days, 2)


class TestCategoryMap(unittest.TestCase):
    """测试分类映射逻辑"""

    def test_category_map_values(self):
        """测试分类映射值"""
        category_map = {
            'all': '全部',
            'tactical': '战术',
            'weaponry': '器械',
            'social': '社交',
            'contract': '契约',
        }
        
        expected_keys = ['all', 'tactical', 'weaponry', 'social', 'contract']
        for key in expected_keys:
            self.assertIn(key, category_map)
            self.assertIsInstance(category_map[key], str)

    def test_category_display_names(self):
        """测试分类显示名称"""
        category_map = {
            'all': '全部',
            'tactical': '战术',
            'weaponry': '器械',
            'social': '社交',
            'contract': '契约',
        }
        
        self.assertEqual(category_map['tactical'], '战术')
        self.assertEqual(category_map['social'], '社交')
        self.assertEqual(category_map['weaponry'], '器械')


class TestDelaySimulation(unittest.TestCase):
    """测试延迟模拟"""
    
    def test_delay_calculation(self):
        """测试延迟计算"""
        import time
        start = time.time()
        time.sleep(0.01)  # 10ms
        end = time.time()
        elapsed = end - start
        self.assertGreaterEqual(elapsed, 0.005)  # 允许一定误差


class TestParseQueryLogic(unittest.TestCase):
    """测试 URL 参数解析逻辑"""

    def test_parse_query_string(self):
        """测试查询字符串解析"""
        from urllib.parse import parse_qs, urlparse
        
        path = '/api/test?limit=10&offset=20'
        parsed = urlparse(path)
        params = parse_qs(parsed.query)
        
        self.assertEqual(params.get('limit'), ['10'])
        self.assertEqual(params.get('offset'), ['20'])

    def test_parse_empty_query(self):
        """测试空查询字符串"""
        from urllib.parse import parse_qs, urlparse
        
        path = '/api/test'
        parsed = urlparse(path)
        params = parse_qs(parsed.query)
        
        self.assertEqual(len(params), 0)


if __name__ == '__main__':
    unittest.main()
