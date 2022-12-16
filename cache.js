const fs = require('fs');
const path = require('path');

const cacheFile = path.join(__dirname, './cacheData.json');

// 清除缓存
const clean = () => {
    fs.writeFileSync(cacheFile, JSON.stringify([]));
};

// 读取缓存
const get = () => {
    if (fs.existsSync(cacheFile)) {
        const cacheData = fs.readFileSync(cacheFile, 'utf8');

        try {
            return JSON.parse(cacheData || '[]');
        } catch (err) {
            // 出错后，重置缓存文件数据
            clean();
            return [];
        }
    }

    return [];
};

// 写入缓存
const write = (value) => {
    const cacheData = get();
    const nextCacheData = [...(cacheData || []), value].filter(Boolean);
    const str = JSON.stringify(nextCacheData);
    fs.writeFile(cacheFile, str, (err) => {
        if (err) {
            console.error(err);
        }
    });
};

module.exports = {
    get,
    write,
    clean,
};
