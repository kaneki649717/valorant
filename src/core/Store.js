export class Store {
    constructor(rulesData) {
        this.allRules = rulesData;
        this.currentCategory = 'all';
    }

    /**
     * 根据当前分类获取规则列表
     */
    getRules() {
        if (this.currentCategory === 'all') {
            return this.allRules;
        }
        return this.allRules.filter(r => r.category === this.currentCategory);
    }

    /**
     * 切换分类
     */
    setCategory(cat) {
        this.currentCategory = cat;
    }

    /**
     * 随机抽取一个
     */
    drawOne() {
        const pool = this.getRules();
        if (pool.length === 0) return null;
        const randomIndex = Math.floor(Math.random() * pool.length);
        return pool[randomIndex];
    }
}