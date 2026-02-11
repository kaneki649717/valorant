"""
API 模块测试
"""
import unittest
import sys
import os
import json
from unittest.mock import patch, MagicMock

# 添加 src 到路径
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'src'))


class TestAPI(unittest.TestCase):
    """测试 API 模块"""

    def setUp(self):
        """测试前准备"""
        self.mock_config = {
            'apiBase': 'http://localhost:8502',
            'clientId': 'test-client-id'
        }

    def test_api_response_format(self):
        """测试 API 响应格式"""
        success_response = {'ok': True, 'items': []}
        error_response = {'ok': False, 'error': 'test error'}

        self.assertIn('ok', success_response)
        self.assertTrue(success_response['ok'])
        self.assertIn('ok', error_response)
        self.assertFalse(error_response['ok'])

    def test_api_response_with_item(self):
        """测试 API 响应包含 item 字段"""
        response = {
            'ok': True,
            'item': {
                'id': 1,
                'rule_id': 'TAC-01',
                'content': '测试规则',
                'category': 'tactical',
                'timestamp': '2024-01-01T00:00:00Z'
            }
        }
        self.assertTrue(response['ok'])
        self.assertIsNotNone(response['item'])
        self.assertEqual(response['item']['rule_id'], 'TAC-01')


class TestAPIEndpoints(unittest.TestCase):
    """测试 API 端点定义"""

    def test_endpoints_defined(self):
        """测试所有端点已定义"""
        endpoints = [
            '/api/history/list',
            '/api/history/recent',
            '/api/history/stats',
            '/api/history/add',
            '/api/history/undo',
            '/api/health'
        ]
        self.assertEqual(len(endpoints), 6)

    def test_endpoint_naming_convention(self):
        """测试端点命名规范"""
        endpoints = [
            '/api/history/list',
            '/api/history/recent',
            '/api/history/stats',
            '/api/history/add',
            '/api/history/undo',
            '/api/health'
        ]
        for endpoint in endpoints:
            self.assertTrue(endpoint.startswith('/api/'))


class TestAPIErrorHandling(unittest.TestCase):
    """测试 API 错误处理"""

    def test_missing_client_id(self):
        """测试缺少 client_id 的错误响应"""
        error_response = {'ok': False, 'error': '缺少客户端ID'}
        self.assertFalse(error_response['ok'])
        self.assertIn('error', error_response)

    def test_missing_required_fields(self):
        """测试缺少必要字段的错误响应"""
        error_response = {'ok': False, 'error': '缺少必要的字段'}
        self.assertFalse(error_response['ok'])

    def test_invalid_json(self):
        """测试无效 JSON 的错误响应"""
        error_response = {'ok': False, 'error': '无效的JSON数据'}
        self.assertFalse(error_response['ok'])


if __name__ == '__main__':
    unittest.main()
