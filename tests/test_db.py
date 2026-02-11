"""
数据库模块测试
"""
import unittest
import sys
import os
import json
from unittest.mock import patch, MagicMock

# 添加 src 到路径
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'src'))

import db


class TestDBFunctions(unittest.TestCase):
    """测试数据库函数"""

    def setUp(self):
        """测试前准备"""
        self.sample_rule = {
            "id": "TAC-01",
            "content": "测试规则",
            "category": "tactical"
        }
        self.client_id = "test-client-123"

    def test_headers_format(self):
        """测试请求头格式"""
        headers = db._headers()
        expected_headers = ['apikey', 'Authorization', 'Content-Type', 'Accept']
        for header in expected_headers:
            self.assertIn(header, headers)
        self.assertTrue(headers['Authorization'].startswith('Bearer '))

    def test_use_supabase_without_credentials(self):
        """测试没有凭证时不使用 Supabase"""
        with patch.object(db, 'SUPABASE_URL', ''):
            with patch.object(db, 'SUPABASE_ANON_KEY', ''):
                self.assertFalse(db._use_supabase())

    def test_use_supabase_with_credentials(self):
        """测试有凭证时使用 Supabase"""
        with patch.object(db, 'SUPABASE_URL', 'https://test.supabase.co'):
            with patch.object(db, 'SUPABASE_ANON_KEY', 'test-key'):
                self.assertTrue(db._use_supabase())

    @patch.object(db, '_use_supabase', return_value=False)
    def test_add_record_memory_mode(self, mock_use_supabase):
        """测试内存模式下添加记录"""
        # 重置内存存储
        with db._memory_store_lock:
            db._memory_store["history"] = []
            db._memory_store["id_counter"] = 1
        
        result = db.add_record(self.sample_rule, self.client_id)
        
        self.assertIsNotNone(result)
        self.assertEqual(result["rule_id"], self.sample_rule["id"])
        self.assertEqual(result["content"], self.sample_rule["content"])
        self.assertEqual(result["category"], self.sample_rule["category"])
        self.assertEqual(result["client_id"], self.client_id)

    @patch.object(db, '_use_supabase', return_value=False)
    def test_get_recent_history_memory_mode(self, mock_use_supabase):
        """测试内存模式下获取历史记录"""
        # 重置并添加测试数据
        with db._memory_store_lock:
            db._memory_store["history"] = []
            db._memory_store["id_counter"] = 1
        
        db.add_record(self.sample_rule, self.client_id)
        
        result = db.get_recent_history(10, self.client_id)
        self.assertEqual(len(result), 1)
        self.assertEqual(result[0][1], self.sample_rule["id"])

    @patch.object(db, '_use_supabase', return_value=False)
    def test_delete_last_record_memory_mode(self, mock_use_supabase):
        """测试内存模式下删除最后一条记录"""
        # 重置并添加测试数据
        with db._memory_store_lock:
            db._memory_store["history"] = []
            db._memory_store["id_counter"] = 1
        
        db.add_record(self.sample_rule, self.client_id)
        
        result = db.delete_last_record(self.client_id)
        self.assertIsNotNone(result)
        self.assertEqual(result[1], self.sample_rule["id"])
        
        # 验证已删除
        history = db.get_recent_history(10, self.client_id)
        self.assertEqual(len(history), 0)

    @patch.object(db, '_use_supabase', return_value=False)
    def test_delete_records_by_ids_memory_mode(self, mock_use_supabase):
        """测试内存模式下按ID删除记录"""
        # 重置并添加测试数据
        with db._memory_store_lock:
            db._memory_store["history"] = []
            db._memory_store["id_counter"] = 1
        
        record = db.add_record(self.sample_rule, self.client_id)
        
        deleted_count = db.delete_records_by_ids(self.client_id, [record["id"]])
        self.assertEqual(deleted_count, 1)
        
        # 验证已删除
        history = db.get_recent_history(10, self.client_id)
        self.assertEqual(len(history), 0)


class TestStatsCalculation(unittest.TestCase):
    """测试统计计算"""

    def test_count_by_category(self):
        """测试分类统计"""
        sample_data = [
            {"category": "tactical"},
            {"category": "tactical"},
            {"category": "social"},
            {"category": "weaponry"}
        ]

        by_category = {}
        for r in sample_data:
            cat = r.get("category")
            if cat:
                by_category[cat] = by_category.get(cat, 0) + 1

        self.assertEqual(by_category['tactical'], 2)
        self.assertEqual(by_category['social'], 1)
        self.assertEqual(by_category['weaponry'], 1)

    def test_top_category_calculation(self):
        """测试最常出现分类计算"""
        by_category = {
            'tactical': 5,
            'social': 3,
            'weaponry': 2
        }
        total = sum(by_category.values())
        top_category = max(by_category, key=by_category.get)
        top_pct = int(round(by_category[top_category] / total * 100))

        self.assertEqual(top_category, 'tactical')
        self.assertEqual(top_pct, 50)


class TestSecurity(unittest.TestCase):
    """测试安全相关功能"""

    def test_delete_records_by_ids_with_invalid_ids(self):
        """测试删除记录时过滤无效ID"""
        with db._memory_store_lock:
            db._memory_store["history"] = []
            db._memory_store["id_counter"] = 1
        
        # 测试无效ID被过滤
        deleted_count = db.delete_records_by_ids("test-client", ["invalid", "123", None, ""])
        self.assertEqual(deleted_count, 0)
        
        # 测试混合有效和无效ID
        record = db.add_record({"id": "TAC-01", "content": "测试", "category": "tactical"}, "test-client")
        deleted_count = db.delete_records_by_ids("test-client", [record["id"], "invalid"])
        self.assertEqual(deleted_count, 1)


if __name__ == '__main__':
    unittest.main()
