"""
数据验证模块 - 验证规则数据的 schema
"""
import json
import os
import sys


class RulesValidator:
    """规则数据验证器"""
    
    VALID_CATEGORIES = {'tactical', 'weaponry', 'social', 'contract'}
    VALID_ID_PREFIXES = {'TAC', 'WEP', 'SOC', 'CON', 'SPE'}
    
    def __init__(self, rules_data):
        self.rules = rules_data
        self.errors = []
        self.warnings = []
    
    def validate(self):
        """执行完整验证"""
        if not isinstance(self.rules, list):
            self.errors.append("规则数据必须是数组")
            return False
        
        if len(self.rules) == 0:
            self.warnings.append("规则数据为空")
        
        seen_ids = set()
        
        for idx, rule in enumerate(self.rules):
            self._validate_rule(rule, idx, seen_ids)
        
        return len(self.errors) == 0
    
    def _validate_rule(self, rule, idx, seen_ids):
        """验证单个规则"""
        # 检查规则是否为字典
        if not isinstance(rule, dict):
            self.errors.append(f"规则 #{idx+1}: 必须是对象")
            return
        
        # 检查必需字段
        if 'id' not in rule:
            self.errors.append(f"规则 #{idx+1}: 缺少 'id' 字段")
        elif not isinstance(rule['id'], str):
            self.errors.append(f"规则 #{idx+1}: 'id' 必须是字符串")
        else:
            # 检查ID格式
            rule_id = rule['id']
            if rule_id in seen_ids:
                self.errors.append(f"规则 #{idx+1}: ID '{rule_id}' 重复")
            seen_ids.add(rule_id)
            
            # 检查ID前缀
            prefix = rule_id.split('-')[0] if '-' in rule_id else ''
            if prefix not in self.VALID_ID_PREFIXES:
                self.warnings.append(f"规则 #{idx+1}: ID '{rule_id}' 使用非标准前缀 '{prefix}'")
        
        # 检查 content 字段
        if 'content' not in rule:
            self.errors.append(f"规则 #{idx+1}: 缺少 'content' 字段")
        elif not isinstance(rule['content'], str):
            self.errors.append(f"规则 #{idx+1}: 'content' 必须是字符串")
        elif not rule['content'].strip():
            self.errors.append(f"规则 #{idx+1}: 'content' 不能为空")
        
        # 检查 category 字段
        if 'category' not in rule:
            self.errors.append(f"规则 #{idx+1}: 缺少 'category' 字段")
        elif rule.get('category') not in self.VALID_CATEGORIES:
            self.errors.append(f"规则 #{idx+1}: 无效的 category '{rule.get('category')}'")
        
        # 检查ID前缀与分类的一致性
        if 'id' in rule and 'category' in rule:
            self._check_id_category_consistency(rule, idx)
        
        # 检查 tags 字段（可选）
        if 'tags' in rule and not isinstance(rule['tags'], list):
            self.warnings.append(f"规则 #{idx+1}: 'tags' 应该是数组")
    
    def _check_id_category_consistency(self, rule, idx):
        """检查ID前缀与分类的一致性"""
        rule_id = rule['id']
        category = rule['category']
        
        prefix_mapping = {
            'TAC': 'tactical',
            'WEP': 'weaponry',
            'SOC': 'social',
            'CON': 'contract',
        }
        
        if '-' not in rule_id:
            return
        
        prefix = rule_id.split('-')[0]
        
        # SPE 是特殊前缀，可以匹配任何分类
        if prefix == 'SPE':
            return
        
        expected_category = prefix_mapping.get(prefix)
        if expected_category and category != expected_category:
            self.warnings.append(
                f"规则 #{idx+1}: ID '{rule_id}' 的前缀 '{prefix}' 建议对应分类 '{expected_category}'，"
                f"但当前分类是 '{category}'"
            )
    
    def get_report(self):
        """获取验证报告"""
        report = []
        report.append(f"验证结果: {'通过' if len(self.errors) == 0 else '失败'}")
        report.append(f"规则总数: {len(self.rules)}")
        report.append(f"错误数量: {len(self.errors)}")
        report.append(f"警告数量: {len(self.warnings)}")
        
        if self.errors:
            report.append("\n错误列表:")
            for error in self.errors:
                report.append(f"  ❌ {error}")
        
        if self.warnings:
            report.append("\n警告列表:")
            for warning in self.warnings:
                report.append(f"  ⚠️ {warning}")
        
        return "\n".join(report)


def validate_rules_file(file_path=None):
    """验证规则文件"""
    if file_path is None:
        base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        file_path = os.path.join(base_dir, "assets", "data", "rules.json")
    
    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            data = json.load(f)
    except FileNotFoundError:
        print(f"错误: 文件不存在 - {file_path}")
        return False
    except json.JSONDecodeError as e:
        print(f"错误: JSON 解析失败 - {e}")
        return False
    
    validator = RulesValidator(data)
    validator.validate()
    print(validator.get_report())
    
    return len(validator.errors) == 0


def validate_rules_data(rules_data):
    """验证规则数据（内存中）"""
    validator = RulesValidator(rules_data)
    is_valid = validator.validate()
    return is_valid, validator.errors, validator.warnings


if __name__ == '__main__':
    success = validate_rules_file()
    sys.exit(0 if success else 1)
